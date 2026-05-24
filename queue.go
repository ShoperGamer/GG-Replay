package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
)

type JobQueue struct {
	jobs        chan Job
	running     sync.Map // map[string]*JobProgressResp
	activeCancels sync.Map // map[string]context.CancelFunc (ไว้สำหรับสั่งฆ่าโปรเซสงานแยกชิ้น)
	workers     int
	pythonPath  string
	pythonDir   string
	deviceInfo  DeviceInfo
}

func NewJobQueue(workers int, pythonPath, pythonDir string, deviceInfo DeviceInfo) *JobQueue {
	return &JobQueue{
		jobs:       make(chan Job, 100),
		workers:    workers,
		pythonPath: pythonPath,
		pythonDir:  pythonDir,
		deviceInfo: deviceInfo,
	}
}

func (q *JobQueue) Start(ctx context.Context) {
	for i := 0; i < q.workers; i++ {
		go q.worker(ctx, i)
	}
	log.Printf("[Engine Queue] Activated %d sub-orchestration queue consumers.", q.workers)
}

func (q *JobQueue) Submit(job Job) {
	q.jobs <- job
}

func (q *JobQueue) GetJobStatus(jobID string) (*JobProgressResp, bool) {
	if val, ok := q.running.Load(jobID); ok {
		return val.(*JobProgressResp), true
	}
	return nil, false
}

func (q *JobQueue) StopJob(jobID string) {
	if cancelVal, ok := q.activeCancels.Load(jobID); ok {
		cancelFunc := cancelVal.(context.CancelFunc)
		cancelFunc() // สั่งปิด Context ของ Job นั้นทันที ตัว OS Command จะโดน Kill อัตโนมัติ
		log.Printf("[Queue Worker] Forces shutdown signal emitted to Job ID: %s", jobID)
	}
}

// worker processes jobs from the queue
func (q *JobQueue) worker(ctx context.Context, workerID int) {
	log.Printf("[Queue Worker %d] Thread initialized and listening for jobs...", workerID)
	
	for {
		select {
		case <-ctx.Done():
			log.Printf("[Queue Worker %d] Thread stopping...", workerID) 
			return
		case job := <-q.jobs:
			jobCtx, jobCancel := context.WithCancel(ctx)
			q.activeCancels.Store(job.ID, jobCancel)

			q.processJob(jobCtx, job)

			jobCancel()
			q.activeCancels.Delete(job.ID)
		}
	}
}

func (q *JobQueue) processJob(ctx context.Context, job Job) {
	status := &JobProgressResp{
		Status:    StatusProcessing,
		Message:   "Starting AI processing pipeline...",
		JobId:     job.ID,
		TrackName: getTrackName(job.Request.SongUrlOrFilePath),
		ModelId:   job.Request.ModelId,
	}
	q.running.Store(job.ID, status)

	configFile, err := q.createConfigFile(job)
	if err != nil {
		errStr := err.Error()
		q.updateJobStatus(job.ID, StatusErrored, "Failed to build payload config", &errStr)
		return
	}
	defer os.Remove(configFile)

	// เรียกใช้ระบบสตรีมอ่านค่าความคืบหน้าแบบ Real-time
	err = q.runPythonInferenceStream(ctx, job, configFile)
	if err != nil {
		select {
		case <-ctx.Done():
			// หากถูกปิดเพราะโดนสั่งยกเลิกงาน
			q.updateJobStatus(job.ID, StatusStopped, "Job was forcefully cancelled by administrative request.", nil)
		default:
			errStr := err.Error()
			q.updateJobStatus(job.ID, StatusErrored, fmt.Sprintf("Inference engine failure: %v", err), &errStr)
		}
		return
	}

	q.updateJobStatus(job.ID, StatusCompleted, "Completed successfully.", nil)
}

func (q *JobQueue) createConfigFile(job Job) (string, error) {
	config := map[string]interface{}{
		"modelId":           job.Request.ModelId,
		"modelPath":         job.Request.ModelPath,
		"weightsPath":       job.Request.WeightsPath,
		"songUrlOrFilePath": job.Request.SongUrlOrFilePath,
		"outputDirectory":   job.Request.OutputDirectory,
		"jobId":             job.ID,
		"device":            q.deviceInfo.Device,
	}
	if job.Request.Options != nil {
		config["options"] = job.Request.Options
	}

	data, err := json.Marshal(config)
	if err != nil {
		return "", err
	}

	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("job_cfg_%s.json", job.ID))
	err = os.WriteFile(tmpFile, data, 0644)
	return tmpFile, err
}

func (q *JobQueue) runPythonInferenceStream(ctx context.Context, job Job, configFile string) error {
	// รันแบบเรียกโมดูลภายนอกของฝั่งสคริปต์
	cmd := exec.CommandContext(ctx, q.pythonPath, "run_job.py", "--config", configFile, "--job_id", job.ID)
	cmd.Dir = q.pythonDir

	cmd.Env = append(os.Environ(),
		"PYTHONUNBUFFERED=1",
		fmt.Sprintf("PYTORCH_DEVICE=%s", q.deviceInfo.Device),
	)

	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	// แยกเธรดเพื่อพ่นค่า Error Log เผื่อโปรแกรมหลังบ้านพังออก Console รวม
	go func() { _, _ = io.Copy(os.Stderr, stderrPipe) }()

	// 🔥 [แก้ไขจุดบกพร่องข้อ 1]: ใช้ Scanner อ่านบรรทัดแบบเรียลไทม์ขณะโปรเซสกำลังทำงาน
	scanner := bufio.NewScanner(stdoutPipe)
	for scanner.Scan() {
		line := scanner.Text()
		
		// ดักจับรูปแบบ Progress JSON ที่พ่นออกมาจากระบบประมวลผลงานของโปรแกรม Python
		if strings.HasPrefix(line, "PROGRESS_JSON:") {
			jsonStr := strings.TrimPrefix(line, "PROGRESS_JSON:")
			var incomingStatus JobProgressResp
			if err := json.Unmarshal([]byte(jsonStr), &incomingStatus); err == nil {
				// อัปเดตข้อมูลความคืบหน้าตรงเข้าหน่วยความจำคิวงานส่วนกลางแบบเรียลไทม์
				q.running.Store(job.ID, &incomingStatus)
			}
		}
	}

	return cmd.Wait()
}

func (q *JobQueue) updateJobStatus(jobID string, status STATUS, message string, errMsg *string) {
	if val, ok := q.running.Load(jobID); ok {
		resp := val.(*JobProgressResp)
		resp.Status = status
		resp.Message = message
		resp.Error = errMsg
		q.running.Store(jobID, resp)
	}
}

func getTrackName(path string) string {
	if path == "" {
		return ""
	}
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	return base[:len(base)-len(ext)]
}