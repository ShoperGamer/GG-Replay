package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// =====================================================================
// 🎯 DATA STRUCTURES
// =====================================================================

type SongOptions struct {
	OutputName          string  `json:"outputName"`
	Pitch               int     `json:"pitch"`
	InstrumentalsPitch  int     `json:"instrumentalsPitch"`
	PreStemmed          bool    `json:"preStemmed"`
	VocalsOnly          bool    `json:"vocalsOnly"`
	SampleMode          bool    `json:"sampleMode"`
	DeEchoDeReverb      bool    `json:"deEchoDeReverb"`
	SampleModeStartTime int     `json:"sampleModeStartTime"`
	F0Method            string  `json:"f0Method"`
	StemmingMethod      string  `json:"stemmingMethod"`
	IndexRatio          float64 `json:"indexRatio"`
	ConsonantProtection float64 `json:"consonantProtection"`
	OutputFormat        string  `json:"outputFormat"`
	VolumeEnvelope      float64 `json:"volumeEnvelope"`
	Device              string  `json:"device"`
	GPU                 bool    `json:"gpu"`
	RemoveHum           bool    `json:"removeHum"`
	RemoveBackingVocals bool    `json:"removeBackingVocals"`
	ApplyPostProcessing bool    `json:"applyPostProcessing"`
	AggressiveCleanup   bool    `json:"aggressiveCleanup"`
}

type DemucsRequest struct {
	SourceAudioPath     string `json:"sourceAudioPath"`
	Model               string `json:"model"`
	Device              string `json:"device"`
	RemoveHum           bool   `json:"removeHum"`
	RemoveBackingVocals bool   `json:"removeBackingVocals"`
	ApplyPostProcessing bool   `json:"applyPostProcessing"`
	AggressiveCleanup   bool   `json:"aggressiveCleanup"`
}

type DemucsResponse struct {
	JobId string `json:"jobId"`
}

type DemucsProgress struct {
	Status   string            `json:"status"`
	Message  string            `json:"message"`
	Progress float64           `json:"progress"`
	Stems    map[string]string `json:"stems,omitempty"`
}

type MixTrack struct {
	Path   string  `json:"path"`
	Volume float64 `json:"volume"`
	Name   string  `json:"name"`
}

type MultiTrackMixRequest struct {
	VocalPath  string     `json:"vocalPath"`
	VocalVol   float64    `json:"vocalVol"`
	InstTracks []MixTrack `json:"instTracks"`
	OutputName string     `json:"outputName"`
}

type demucsJob struct {
	ID        string
	Request   DemucsRequest
	Progress  DemucsProgress
	StartedAt time.Time
}

type queueItem struct {
	jobID     string
	modelName string
	audioName string
	opts      SongOptions
}

// =====================================================================
// 📊 LOG MANAGEMENT - In-Memory Buffer
// =====================================================================

type LogEntry struct {
	Timestamp int64  `json:"timestamp"`
	Time      string `json:"time"`
	Level     string `json:"level"`
	Source    string `json:"source"`
	Message   string `json:"message"`
}

var (
	logBuffer   []LogEntry
	logBufferMu sync.RWMutex
)

// =====================================================================
// 🎯 APP STRUCT
// =====================================================================

type App struct {
	ctx          context.Context
	streamPort   string
	appDataDir   string
	jobsMutex    sync.RWMutex
	runningJobs  map[string]interface{}
	jobQueue     chan queueItem
	demucsJobs   map[string]*demucsJob
	demucsJobsMu sync.RWMutex
	demucsQueue  chan *demucsJob
}

func NewApp() *App {
	logBuffer = make([]LogEntry, 0, 1500)
	app := &App{
		streamPort:  "62363",
		runningJobs: make(map[string]interface{}),
		jobQueue:    make(chan queueItem, 100),
		demucsJobs:  make(map[string]*demucsJob),
		demucsQueue: make(chan *demucsJob, 100),
	}
	go app.demucsWorker()
	return app
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	wd, _ := os.Getwd()
	a.appDataDir = filepath.Join(wd, "data")

	for _, d := range []string{"uploads", "models", "outputs", "outputs/demucs", "outputs/stems", "logs"} {
		_ = os.MkdirAll(filepath.Join(a.appDataDir, d), 0755)
	}

	a.freeUpPort(a.streamPort)
	a.startFileServer()
	go a.processQueueWorker()

	a.AddLog("INFO", "SYSTEM", "Application started successfully")
}

func (a *App) shutdown(_ context.Context) {
	a.AddLog("INFO", "SYSTEM", "Application shutting down")
}

func (a *App) domReady(_ context.Context) {}

// =====================================================================
// 📊 LOG MANAGEMENT BINDINGS
// =====================================================================

func (a *App) AddLog(level, source, message string) {
	entry := LogEntry{
		Timestamp: time.Now().UnixMilli(),
		Time:      time.Now().Format("15:04:05"),
		Level:     level,
		Source:    source,
		Message:   message,
	}

	logBufferMu.Lock()
	logBuffer = append(logBuffer, entry)
	if len(logBuffer) > 1500 {
		logBuffer = logBuffer[len(logBuffer)-1500:]
	}
	logBufferMu.Unlock()

	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, "log:new", entry)
	}
}

func (a *App) GetLogs(level, source, search string) []LogEntry {
	logBufferMu.RLock()
	defer logBufferMu.RUnlock()

	var result []LogEntry
	for _, entry := range logBuffer {
		if level != "" && entry.Level != level {
			continue
		}
		if source != "" && entry.Source != source {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(entry.Message), strings.ToLower(search)) {
			continue
		}
		result = append(result, entry)
	}
	return result
}

func (a *App) GetLogStats() map[string]int {
	logBufferMu.RLock()
	defer logBufferMu.RUnlock()

	stats := map[string]int{
		"total":   len(logBuffer),
		"INFO":    0,
		"WARN":    0,
		"ERROR":   0,
		"DEBUG":   0,
		"SUCCESS": 0,
	}

	for _, entry := range logBuffer {
		if _, ok := stats[entry.Level]; ok {
			stats[entry.Level]++
		}
	}
	return stats
}

func (a *App) ClearLogs() {
	logBufferMu.Lock()
	logBuffer = make([]LogEntry, 0, 1500)
	logBufferMu.Unlock()

	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, "log:cleared")
	}
}

func (a *App) ExportLogs() string {
	logBufferMu.RLock()
	defer logBufferMu.RUnlock()

	var lines []string
	for _, entry := range logBuffer {
		lines = append(lines, fmt.Sprintf("[%s] [%s] [%s] %s",
			entry.Time, entry.Source, entry.Level, entry.Message))
	}
	return strings.Join(lines, "\n")
}

// =====================================================================
// 🗑️ DISK LOG CLEANUP
// =====================================================================

func (a *App) ClearDiskLogs() map[string]interface{} {
	logsDir := filepath.Join(a.appDataDir, "logs")

	if _, err := os.Stat(logsDir); os.IsNotExist(err) {
		return map[string]interface{}{
			"status":  "success",
			"message": "📭 ไม่พบโฟลเดอร์ logs/ ในระบบ",
			"count":   0,
		}
	}

	deleted := 0
	var errors []string
	var deletedFiles []string
	var totalSize int64 = 0

	protectedFiles := map[string]bool{
		".gitkeep":  true,
		"README.md": true,
		"log.txt":   true,
	}

	filepath.Walk(logsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		name := info.Name()
		ext := strings.ToLower(filepath.Ext(name))

		if ext == ".txt" {
			return nil
		}
		if ext != ".log" {
			return nil
		}
		if protectedFiles[name] {
			return nil
		}

		totalSize += info.Size()

		if err := os.Remove(path); err == nil {
			deleted++
			deletedFiles = append(deletedFiles, name)
			log.Printf("[Cleanup] Deleted log: %s (%d bytes)", path, info.Size())
		} else {
			errors = append(errors, fmt.Sprintf("%s: %v", name, err))
		}
		return nil
	})

	sizeStr := ""
	if totalSize > 1024*1024 {
		sizeStr = fmt.Sprintf(" (%.1f MB)", float64(totalSize)/(1024*1024))
	} else if totalSize > 1024 {
		sizeStr = fmt.Sprintf(" (%.1f KB)", float64(totalSize)/1024)
	} else if totalSize > 0 {
		sizeStr = fmt.Sprintf(" (%d bytes)", totalSize)
	}

	msg := fmt.Sprintf("✅ ลบไฟล์ Log สำเร็จ %d ไฟล์%s", deleted, sizeStr)
	if deleted == 0 && len(errors) == 0 {
		msg = "📭 ไม่พบไฟล์ .log ที่ต้องลบในโฟลเดอร์ logs/"
	}
	if len(errors) > 0 {
		msg += fmt.Sprintf("\n⚠️ ผิดพลาด %d ไฟล์", len(errors))
	}

	a.AddLog("SUCCESS", "CLEANUP", msg)

	return map[string]interface{}{
		"status":       "success",
		"message":      msg,
		"count":        deleted,
		"totalSize":    totalSize,
		"deletedFiles": deletedFiles,
		"errors":       errors,
	}
}

// =====================================================================
// 🔧 ENVIRONMENT INJECTION (แก้ Error 126: LoadLibrary failed)
// =====================================================================

func (a *App) injectCUDAPaths(env []string) []string {
	if runtime.GOOS != "windows" {
		return env
	}
	
	cudaPaths := []string{
		`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.3\bin`,
		`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin`,
		`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin`,
		`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.2\bin`,
		`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.8\bin`,
		`C:\Program Files\NVIDIA Corporation\CUDA\bin`,
	}
	
	var validPaths []string
	for _, p := range cudaPaths {
		if _, err := os.Stat(p); err == nil {
			validPaths = append(validPaths, p)
		}
	}
	
	if len(validPaths) == 0 {
		return env
	}
	
	extraPath := strings.Join(validPaths, ";")
	
	updated := false
	for i, e := range env {
		if strings.HasPrefix(strings.ToUpper(e), "PATH=") {
			env[i] = "PATH=" + extraPath + ";" + e[5:]
			updated = true
			break
		}
	}
	
	if !updated {
		env = append(env, "PATH="+extraPath)
	}
	
	return env
}

// =====================================================================
// 🎯 FILE SERVER
// =====================================================================

func (a *App) startFileServer() {
	mux := http.NewServeMux()
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(filepath.Join(a.appDataDir, "uploads")))))
	mux.Handle("/outputs/", http.StripPrefix("/outputs/", http.FileServer(http.Dir(filepath.Join(a.appDataDir, "outputs")))))
	corsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		if r.Method == "OPTIONS" {
			return
		}
		mux.ServeHTTP(w, r)
	})
	go func() { _ = http.ListenAndServe("127.0.0.1:"+a.streamPort, corsHandler) }()
}

// =====================================================================
// 🎯 RVC/UVR QUEUE WORKER
// =====================================================================

func (a *App) processQueueWorker() {
	for item := range a.jobQueue {
		a.updateJobStatus(item.jobID, "processing", "Starting AI processing pipeline...")
		a.AddLog("INFO", "RVC", fmt.Sprintf("Starting job %s for model %s", item.jobID, item.modelName))

		deviceSetting := a.resolveDevice(item.opts.Device)

		configData := map[string]interface{}{
			"modelId":           item.modelName,
			"modelPath":         filepath.Join(a.appDataDir, "models"),
			"weightsPath":       filepath.Join(a.appDataDir, "models"),
			"songUrlOrFilePath": filepath.Join(a.appDataDir, "uploads", item.audioName),
			"outputDirectory":   filepath.Join(a.appDataDir, "outputs"),
			"options":           item.opts,
			"device":            deviceSetting,
		}
		configPath := filepath.Join(os.TempDir(), fmt.Sprintf("job_%s.json", item.jobID))
		configBytes, _ := json.Marshal(configData)
		_ = os.WriteFile(configPath, configBytes, 0644)

		wd, _ := os.Getwd()
		pythonBin := a.findPythonBinary(wd)
		scriptPath := filepath.Join(wd, "python", "run_job.py")

		cmd := exec.Command(pythonBin, scriptPath, "--config", configPath, "--job_id", item.jobID)
		cmd.Dir = filepath.Join(wd, "python")
		
		env := a.injectCUDAPaths(os.Environ())
		if deviceSetting == "cpu" {
			env = append(env, "CUDA_VISIBLE_DEVICES=")
		}
		env = append(env, "GG_REPLAY_LOG_DIR="+filepath.Join(a.appDataDir, "logs"))
		cmd.Env = env
		
		if runtime.GOOS == "windows" {
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		}

		stdoutPipe, _ := cmd.StdoutPipe()
		stderrPipe, _ := cmd.StderrPipe()

		if err := cmd.Start(); err != nil {
			a.updateJobStatus(item.jobID, "errored", "Failed to start AI execution: "+err.Error())
			a.AddLog("ERROR", "RVC", "Failed to start: "+err.Error())
			_ = os.Remove(configPath)
			continue
		}

		go func() {
			scanner := bufio.NewScanner(stderrPipe)
			for scanner.Scan() {
				line := scanner.Text()
				log.Printf("[RVC/Stderr] %s", line)
				upper := strings.ToUpper(line)
				if strings.Contains(upper, "ERROR") || strings.Contains(upper, "FATAL") {
					a.AddLog("ERROR", "RVC", line)
				}
			}
		}()
		a.scanProgressOutput(stdoutPipe, item.jobID)
		_ = cmd.Wait()
		_ = os.Remove(configPath)

		success := cmd.ProcessState != nil && cmd.ProcessState.Success()
		a.finalizeJobStatus(item.jobID, success)

		if success {
			a.AddLog("SUCCESS", "RVC", fmt.Sprintf("Job %s completed successfully", item.jobID))
		} else {
			a.AddLog("ERROR", "RVC", fmt.Sprintf("Job %s failed", item.jobID))
		}
	}
}

func (a *App) scanProgressOutput(reader io.Reader, jobID string) {
	scanner := bufio.NewScanner(reader)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "PROGRESS_JSON:") {
			var progressMap map[string]interface{}
			if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "PROGRESS_JSON:")), &progressMap); err == nil {
				a.jobsMutex.Lock()
				a.runningJobs[jobID] = progressMap
				a.jobsMutex.Unlock()
			}
		}
	}
}

func (a *App) finalizeJobStatus(jobID string, success bool) {
	a.jobsMutex.Lock()
	defer a.jobsMutex.Unlock()
	if job, exists := a.runningJobs[jobID].(map[string]interface{}); exists {
		if success {
			job["status"] = "completed"
			job["progress"] = float64(100)
			job["message"] = "Completed successfully"
		} else {
			job["status"] = "errored"
			job["progress"] = float64(0)
			job["message"] = "AI pipeline failed unexpectedly"
		}
	}
}

func (a *App) updateJobStatus(jobID, status, message string) {
	a.jobsMutex.Lock()
	defer a.jobsMutex.Unlock()
	if job, exists := a.runningJobs[jobID].(map[string]interface{}); exists {
		job["status"] = status
		job["message"] = message
	}
}

// =====================================================================
// 🎯 RVC BINDINGS
// =====================================================================

func (a *App) CreateSong(modelName, audioName string, opts SongOptions) string {
	jobID := fmt.Sprintf("job_%d", time.Now().UnixNano())
	trackName := strings.TrimSuffix(audioName, filepath.Ext(audioName))
	a.jobsMutex.Lock()
	a.runningJobs[jobID] = map[string]interface{}{
		"status": "queued", "message": "Waiting in Go engine queue...",
		"jobId": jobID, "modelId": modelName, "trackName": trackName,
		"progress": float64(0),
	}
	a.jobsMutex.Unlock()
	a.jobQueue <- queueItem{jobID: jobID, modelName: modelName, audioName: audioName, opts: opts}

	a.AddLog("INFO", "RVC", fmt.Sprintf("Job queued: %s (model: %s, audio: %s)", jobID, modelName, audioName))
	return jobID
}

func (a *App) GetJobProgress(jobId string) map[string]interface{} {
	a.jobsMutex.RLock()
	defer a.jobsMutex.RUnlock()
	if m, ok := a.runningJobs[jobId].(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{"status": "unknown_job", "message": "Job not found"}
}

// =====================================================================
// 🎯 DEMUCS BINDINGS
// =====================================================================

func (a *App) StartDemucsJob(req DemucsRequest) (DemucsResponse, error) {
	if req.SourceAudioPath == "" {
		return DemucsResponse{}, fmt.Errorf("source audio path required")
	}
	jobId := fmt.Sprintf("demucs_%d", time.Now().UnixNano())
	job := &demucsJob{
		ID:        jobId,
		Request:   req,
		Progress:  DemucsProgress{Status: "queued", Message: "อยู่ในลำดับคิวระบบประมวลผล...", Progress: 0},
		StartedAt: time.Now(),
	}
	a.demucsJobsMu.Lock()
	a.demucsJobs[jobId] = job
	a.demucsJobsMu.Unlock()
	a.demucsQueue <- job

	log.Printf("[Demucs] Job enqueued: %s (model=%s, device=%s)", jobId, req.Model, req.Device)
	a.AddLog("INFO", "DEMUCS", fmt.Sprintf("Job queued: %s (model: %s)", jobId, req.Model))

	return DemucsResponse{JobId: jobId}, nil
}

func (a *App) GetDemucsProgress(jobId string) (DemucsProgress, error) {
	a.demucsJobsMu.RLock()
	defer a.demucsJobsMu.RUnlock()
	if job, exists := a.demucsJobs[jobId]; exists {
		return job.Progress, nil
	}
	return DemucsProgress{Status: "unknown", Message: "Job session expired"}, nil
}

func (a *App) demucsWorker() {
	for job := range a.demucsQueue {
		a.runDemucsJob(job)
	}
}

func (a *App) runDemucsJob(job *demucsJob) {
	a.demucsJobsMu.Lock()
	job.Progress.Status = "processing"
	job.Progress.Message = "กำลังจัดสรรไดรเวอร์คำนวณฮาร์ดแวร์..."
	job.Progress.Progress = 5
	a.demucsJobsMu.Unlock()

	wd, _ := os.Getwd()
	pythonDir := filepath.Join(wd, "python")
	outDir := filepath.Join(a.appDataDir, "outputs", "demucs", job.ID)
	_ = os.MkdirAll(outDir, 0755)

	config := map[string]interface{}{
		"job_id":              job.ID,
		"source_audio_path":   job.Request.SourceAudioPath,
		"model":               job.Request.Model,
		"device":              a.resolveDevice(job.Request.Device),
		"output_directory":    outDir,
		"removeHum":           job.Request.RemoveHum,
		"removeBackingVocals": job.Request.RemoveBackingVocals,
		"applyPostProcessing": job.Request.ApplyPostProcessing,
		"aggressiveCleanup":   job.Request.AggressiveCleanup,
	}

	configFile := filepath.Join(os.TempDir(), fmt.Sprintf("demucs_cfg_%s.json", job.ID))
	configBytes, _ := json.Marshal(config)
	_ = os.WriteFile(configFile, configBytes, 0644)
	defer os.Remove(configFile)

	cmd := exec.Command(a.findPythonBinary(wd), "demucs_worker.py", "--config", configFile)
	cmd.Dir = pythonDir
	
	baseEnv := a.injectCUDAPaths(os.Environ())
	cmd.Env = append(baseEnv,
		"PYTHONUNBUFFERED=1",
		"GG_REPLAY_LOG_DIR="+filepath.Join(a.appDataDir, "logs"),
	)
	
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		a.demucsJobsMu.Lock()
		job.Progress.Status = "errored"
		job.Progress.Message = "Failed to open Python: " + err.Error()
		a.demucsJobsMu.Unlock()
		a.AddLog("ERROR", "DEMUCS", "Failed to start: "+err.Error())
		return
	}

	go a.scanDemucsProgress(stdout, job)

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			upper := strings.ToUpper(line)
			if strings.Contains(upper, "ERROR") || strings.Contains(upper, "FATAL") || strings.Contains(upper, "CRITICAL") {
				log.Printf("[Demucs ERROR] %s", line)
				a.AddLog("ERROR", "DEMUCS", line)
			} else if strings.TrimSpace(line) != "" {
				log.Printf("[Demucs] %s", line)
			}
		}
	}()

	err := cmd.Wait()
	a.demucsJobsMu.Lock()
	defer a.demucsJobsMu.Unlock()

	if err != nil {
		job.Progress.Status = "errored"
		job.Progress.Message = "Demucs processing crashed: " + err.Error()
		a.AddLog("ERROR", "DEMUCS", "Processing crashed: "+err.Error())
	} else {
		job.Progress.Status = "completed"
		job.Progress.Message = "เสร็จสมบูรณ์"
		job.Progress.Progress = 100
		go a.cleanupDemucsJobFiles(job.ID)
		a.AddLog("SUCCESS", "DEMUCS", fmt.Sprintf("Job %s completed", job.ID))
	}
}

func (a *App) scanDemucsProgress(reader io.Reader, job *demucsJob) {
	scanner := bufio.NewScanner(reader)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		var incoming DemucsProgress
		if err := json.Unmarshal([]byte(line), &incoming); err == nil && incoming.Status != "" {
			a.demucsJobsMu.Lock()
			job.Progress = incoming
			a.demucsJobsMu.Unlock()
		}
	}
}

// =====================================================================
// 🧹 CLEANUP FUNCTIONS
// =====================================================================

func (a *App) cleanupDemucsJobFiles(jobID string) {
	jobDir := filepath.Join(a.appDataDir, "outputs", "demucs", jobID)
	keepFiles := map[string]bool{
		"vocals.wav": true, "drums.wav": true, "bass.wav": true,
		"other.wav": true, "piano.wav": true, "guitar.wav": true,
	}
	items, err := os.ReadDir(jobDir)
	if err != nil {
		return
	}
	removed := 0
	for _, item := range items {
		name := item.Name()
		path := filepath.Join(jobDir, name)
		if item.IsDir() {
			if strings.HasPrefix(name, "UVRMDXNET") || strings.HasPrefix(name, "UVR-") {
				os.RemoveAll(path)
				removed++
			}
			continue
		}
		if !keepFiles[name] {
			lowerName := strings.ToLower(name)
			if strings.Contains(lowerName, "preview") || strings.Contains(lowerName, "temp") ||
				strings.Contains(lowerName, "cache") || strings.Contains(lowerName, "no_vocals") {
				os.Remove(path)
				removed++
			}
		}
	}
	if removed > 0 {
		log.Printf("[Cleanup] Job %s: removed %d items", jobID, removed)
		a.AddLog("INFO", "CLEANUP", fmt.Sprintf("Job %s: removed %d items", jobID, removed))
	}
}

// =====================================================================
// 🎯 DEVICE & SETTINGS
// =====================================================================

func (a *App) resolveDevice(preferred string) string {
	if preferred != "" && preferred != "auto" {
		return preferred
	}
	if saved := a.GetDeviceSetting(); saved != "" && saved != "auto" {
		return saved
	}
	if runtime.GOOS == "darwin" {
		return "mps"
	}
	return "cuda"
}

func (a *App) SaveDeviceSetting(device string) bool {
	a.AddLog("INFO", "SYSTEM", "Device setting saved: "+device)
	return a.writeSettings(map[string]interface{}{
		"device": device, "removeHum": true, "removeBackingVocals": true,
		"applyPostProcessing": true, "aggressiveCleanup": false,
	})
}

func (a *App) GetDeviceSetting() string {
	p := filepath.Join(a.appDataDir, "settings.json")
	data, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	var s struct{ Device string `json:"device"` }
	json.Unmarshal(data, &s)
	return s.Device
}

func (a *App) SaveAudioCleanupSettings(removeHum, removeBackingVocals, applyPostProcessing, aggressiveCleanup bool) bool {
	return a.writeSettings(map[string]interface{}{
		"device": a.GetDeviceSetting(), "removeHum": removeHum,
		"removeBackingVocals": removeBackingVocals, "applyPostProcessing": applyPostProcessing,
		"aggressiveCleanup": aggressiveCleanup,
	})
}

func (a *App) GetAudioCleanupSettings() map[string]bool {
	defaults := map[string]bool{
		"removeHum": true, "removeBackingVocals": true,
		"applyPostProcessing": true, "aggressiveCleanup": false,
	}
	p := filepath.Join(a.appDataDir, "settings.json")
	data, err := os.ReadFile(p)
	if err != nil {
		return defaults
	}
	var s struct {
		RemoveHum           bool `json:"removeHum"`
		RemoveBackingVocals bool `json:"removeBackingVocals"`
		ApplyPostProcessing bool `json:"applyPostProcessing"`
		AggressiveCleanup   bool `json:"aggressiveCleanup"`
	}
	json.Unmarshal(data, &s)
	return map[string]bool{
		"removeHum": s.RemoveHum, "removeBackingVocals": s.RemoveBackingVocals,
		"applyPostProcessing": s.ApplyPostProcessing, "aggressiveCleanup": s.AggressiveCleanup,
	}
}

func (a *App) writeSettings(data map[string]interface{}) bool {
	bytes, _ := json.Marshal(data)
	return os.WriteFile(filepath.Join(a.appDataDir, "settings.json"), bytes, 0644) == nil
}

// =====================================================================
// 🎯 AUDIO MERGE
// =====================================================================

func (a *App) MergeAudio(vocalPath, instPath string, vocalVol, instVol float64, customName string) map[string]string {
	a.AddLog("INFO", "MERGE", "Starting audio merge...")

	absVocal := a.resolveAudioPath(vocalPath)
	absInst := a.resolveAudioPath(instPath)
	mixID := fmt.Sprintf("mix_%d", time.Now().Unix())
	outDir := filepath.Join(a.appDataDir, "outputs", mixID)
	_ = os.MkdirAll(outDir, 0755)
	outName := customName
	if strings.TrimSpace(outName) == "" {
		outName = "final_studio_mix"
	}
	if !strings.HasSuffix(strings.ToLower(outName), ".mp3") {
		outName += ".mp3"
	}
	outFullPath := filepath.Join(outDir, outName)

	filter := fmt.Sprintf("[0:a]volume=%f[i];[1:a]volume=%f[v];[i][v]amix=inputs=2:duration=longest", instVol, vocalVol)
	cmd := exec.Command("ffmpeg", "-y", "-i", absInst, "-i", absVocal,
		"-filter_complex", filter, "-b:a", "320k", outFullPath)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	if err := cmd.Run(); err != nil {
		a.AddLog("ERROR", "MERGE", "FFmpeg Mix Failed: "+err.Error())
		return map[string]string{"status": "error", "message": "FFmpeg Mix Failed: " + err.Error()}
	}

	a.AddLog("SUCCESS", "MERGE", "Audio merge completed: "+outName)
	return map[string]string{
		"status": "success", "fileName": outName,
		"streamUrl": a.GetAudioUrlByFullPath(outFullPath),
		"fullPath":  outFullPath, "relPath": mixID + "/" + outName,
	}
}

func (a *App) MergeMultiTrack(req MultiTrackMixRequest) map[string]string {
	if req.VocalPath == "" {
		return map[string]string{"status": "error", "message": "ไม่พบไฟล์เสียงร้อง"}
	}
	if len(req.InstTracks) == 0 {
		return map[string]string{"status": "error", "message": "กรุณาเลือกอย่างน้อย 1 instrumental track"}
	}
	inputs := []string{a.resolveAudioPath(req.VocalPath)}
	vols := []float64{req.VocalVol}
	for _, t := range req.InstTracks {
		inputs = append(inputs, a.resolveAudioPath(t.Path))
		vols = append(vols, t.Volume)
	}
	return a.mixTracks(inputs, vols, req.OutputName)
}

func (a *App) mixTracks(inputs []string, vols []float64, name string) map[string]string {
	mixID := fmt.Sprintf("mix_%d", time.Now().Unix())
	outDir := filepath.Join(a.appDataDir, "outputs", mixID)
	_ = os.MkdirAll(outDir, 0755)
	if strings.TrimSpace(name) == "" {
		name = "mix"
	}
	if !strings.HasSuffix(strings.ToLower(name), ".mp3") {
		name += ".mp3"
	}
	outPath := filepath.Join(outDir, name)

	args := []string{"-y"}
	for _, i := range inputs {
		args = append(args, "-i", i)
	}

	filterParts := []string{}
	mixInputs := []string{}
	for i, v := range vols {
		filterParts = append(filterParts, fmt.Sprintf("[%d:a]volume=%f[a%d]", i, v, i))
		mixInputs = append(mixInputs, fmt.Sprintf("[a%d]", i))
	}
	filterParts = append(filterParts, strings.Join(mixInputs, "")+fmt.Sprintf("amix=inputs=%d:duration=longest:normalize=0", len(inputs)))
	filterComplex := strings.Join(filterParts, ";")

	args = append(args, "-filter_complex", filterComplex, "-b:a", "320k", outPath)

	cmd := exec.Command("ffmpeg", args...)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	if _, err := cmd.CombinedOutput(); err != nil {
		a.AddLog("ERROR", "MERGE", "FFmpeg multi-track failed: "+err.Error())
		return map[string]string{"status": "error", "message": fmt.Sprintf("FFmpeg: %v", err)}
	}

	a.AddLog("SUCCESS", "MERGE", "Multi-track merge completed: "+name)
	return map[string]string{
		"status": "success", "fileName": name,
		"streamUrl": a.GetAudioUrlByFullPath(outPath),
		"fullPath":  outPath, "relPath": mixID + "/" + name,
	}
}

func (a *App) resolveAudioPath(path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	candidates := []string{
		filepath.Join(a.appDataDir, "outputs", path),
		filepath.Join(a.appDataDir, "outputs", "stems", path),
		filepath.Join(a.appDataDir, "outputs", "demucs", path),
		filepath.Join(a.appDataDir, "uploads", path),
		path,
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return path
}

// =====================================================================
// 🎯 FILE STREAMING & MANAGEMENT
// =====================================================================

func (a *App) GetAudioUrl(filename, folder string) string {
	return fmt.Sprintf("http://127.0.0.1:%s/%s/%s", a.streamPort, folder, filename)
}

func (a *App) GetAudioUrlByFullPath(fullPath string) string {
	relPath, err := filepath.Rel(a.appDataDir, filepath.Clean(fullPath))
	if err != nil || strings.HasPrefix(relPath, "..") {
		filename := filepath.Base(fullPath)
		folder := "uploads"
		if strings.Contains(fullPath, "outputs") {
			folder = "outputs"
		}
		return fmt.Sprintf("http://127.0.0.1:%s/%s/%s", a.streamPort, folder, filename)
	}
	return fmt.Sprintf("http://127.0.0.1:%s/%s", a.streamPort, filepath.ToSlash(relPath))
}

func (a *App) GetFileStreamUrl(category, relPath string) string {
	return fmt.Sprintf("http://127.0.0.1:%s/%s/%s", a.streamPort, category, relPath)
}

func (a *App) GetOriginalFiles() []string {
	return a.listFiles(filepath.Join(a.appDataDir, "uploads"), []string{".mp3", ".wav", ".flac", ".m4a", ".ogg"})
}

func (a *App) GetSeparatedFiles() []string {
	var list []string
	stemsDir := filepath.Join(a.appDataDir, "outputs", "stems")
	_ = filepath.Walk(stemsDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			ext := strings.ToLower(filepath.Ext(info.Name()))
			if ext == ".mp3" || ext == ".wav" || ext == ".flac" {
				if rel, err := filepath.Rel(stemsDir, path); err == nil {
					list = append(list, filepath.ToSlash(rel))
				}
			}
		}
		return nil
	})
	return list
}

func (a *App) GetDemucsFiles() []map[string]string {
	var list []map[string]string
	demucsDir := filepath.Join(a.appDataDir, "outputs", "demucs")
	_ = filepath.Walk(demucsDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			ext := strings.ToLower(filepath.Ext(info.Name()))
			if ext == ".mp3" || ext == ".wav" || ext == ".flac" {
				rel, _ := filepath.Rel(demucsDir, path)
				parts := strings.Split(rel, string(filepath.Separator))
				jobId := ""
				stemName := info.Name()
				if len(parts) > 1 {
					jobId = parts[0]
					stemName = parts[len(parts)-1]
				}
				list = append(list, map[string]string{
					"jobId":    jobId,
					"relPath":  filepath.ToSlash(rel),
					"stemName": strings.TrimSuffix(stemName, ext),
					"fullPath": path,
				})
			}
		}
		return nil
	})
	return list
}

func (a *App) GetAICoverFiles() []string {
	var list []string
	outputsDir := filepath.Join(a.appDataDir, "outputs")
	files, _ := os.ReadDir(outputsDir)
	excluded := map[string]bool{"stems": true, "originals": true, "yt-cache": true, "demucs": true}
	for _, f := range files {
		if !f.IsDir() || excluded[f.Name()] {
			continue
		}
		jobDir := filepath.Join(outputsDir, f.Name())
		subFiles, _ := os.ReadDir(jobDir)
		for _, sf := range subFiles {
			if !sf.IsDir() {
				ext := strings.ToLower(filepath.Ext(sf.Name()))
				if ext == ".mp3" || ext == ".wav" || ext == ".flac" {
					list = append(list, filepath.ToSlash(filepath.Join(f.Name(), sf.Name())))
				}
			}
		}
	}
	return list
}

func (a *App) listFiles(dir string, allowedExts []string) []string {
	files, _ := os.ReadDir(dir)
	var list []string
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(f.Name()))
		for _, allowed := range allowedExts {
			if ext == allowed {
				list = append(list, f.Name())
				break
			}
		}
	}
	return list
}

// =====================================================================
// 🎯 DELETE OPERATIONS
// =====================================================================

func (a *App) DeleteLocalFile(category, relPath string) bool {
	success := os.Remove(filepath.Join(a.appDataDir, category, relPath)) == nil
	if success {
		a.AddLog("INFO", "FILE", fmt.Sprintf("Deleted: %s/%s", category, relPath))
	}
	return success
}

func (a *App) DeleteAllOriginals() map[string]interface{} {
	result := a.deleteAllInDirectory(filepath.Join(a.appDataDir, "uploads"), []string{".mp3", ".wav", ".flac", ".m4a", ".ogg"})
	a.AddLog("INFO", "FILE", fmt.Sprintf("Deleted all originals: %v files", result["count"]))
	return result
}

func (a *App) DeleteAllSeparated() map[string]interface{} {
	result := a.deleteAllInDirectory(filepath.Join(a.appDataDir, "outputs", "stems"), []string{".mp3", ".wav", ".flac"})
	a.AddLog("INFO", "FILE", fmt.Sprintf("Deleted all separated: %v files", result["count"]))
	return result
}

func (a *App) DeleteAllDemucs() map[string]interface{} {
	outputsDir := filepath.Join(a.appDataDir, "outputs", "demucs")
	if _, err := os.Stat(outputsDir); os.IsNotExist(err) {
		return map[string]interface{}{"status": "success", "message": "ไม่พบโฟลเดอร์", "count": 0}
	}
	entries, _ := os.ReadDir(outputsDir)
	deleted := 0
	var errors []string
	for _, e := range entries {
		if e.IsDir() {
			jobDir := filepath.Join(outputsDir, e.Name())
			if err := os.RemoveAll(jobDir); err == nil {
				deleted++
			} else {
				errors = append(errors, e.Name()+": "+err.Error())
			}
		}
	}
	result := map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("ลบสำเร็จ %d jobs", deleted),
		"count":   deleted,
	}
	if len(errors) > 0 {
		result["errors"] = errors
	}
	a.AddLog("INFO", "FILE", fmt.Sprintf("Deleted %d Demucs jobs", deleted))
	return result
}

func (a *App) DeleteAllAICovers() map[string]interface{} {
	outputsDir := filepath.Join(a.appDataDir, "outputs")
	if _, err := os.Stat(outputsDir); os.IsNotExist(err) {
		return map[string]interface{}{"status": "success", "message": "ไม่พบโฟลเดอร์", "count": 0}
	}
	files, err := os.ReadDir(outputsDir)
	if err != nil {
		return map[string]interface{}{"status": "error", "message": err.Error()}
	}
	excluded := map[string]bool{"stems": true, "originals": true, "yt-cache": true, "demucs": true}
	deleted := 0
	var errors []string
	for _, f := range files {
		if !f.IsDir() || excluded[f.Name()] {
			continue
		}
		jobDir := filepath.Join(outputsDir, f.Name())
		subFiles, err := os.ReadDir(jobDir)
		if err != nil {
			errors = append(errors, f.Name()+": "+err.Error())
			continue
		}
		for _, sf := range subFiles {
			if !sf.IsDir() {
				ext := strings.ToLower(filepath.Ext(sf.Name()))
				if ext == ".mp3" || ext == ".wav" || ext == ".flac" {
					if err := os.Remove(filepath.Join(jobDir, sf.Name())); err == nil {
						deleted++
					}
				}
			}
		}
		_ = os.Remove(jobDir)
	}
	result := map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("ลบสำเร็จ %d ไฟล์", deleted),
		"count":   deleted,
	}
	if len(errors) > 0 {
		result["errors"] = errors
	}
	a.AddLog("INFO", "FILE", fmt.Sprintf("Deleted %d AI covers", deleted))
	return result
}

func (a *App) deleteAllInDirectory(dir string, allowedExts []string) map[string]interface{} {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return map[string]interface{}{"status": "success", "message": "ไม่พบโฟลเดอร์", "count": 0}
	}
	files, err := os.ReadDir(dir)
	if err != nil {
		return map[string]interface{}{"status": "error", "message": err.Error()}
	}
	deleted := 0
	var errors []string
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(f.Name()))
		allowed := false
		for _, a := range allowedExts {
			if ext == a {
				allowed = true
				break
			}
		}
		if !allowed {
			continue
		}
		if err := os.Remove(filepath.Join(dir, f.Name())); err != nil {
			errors = append(errors, f.Name()+": "+err.Error())
		} else {
			deleted++
		}
	}
	result := map[string]interface{}{
		"status":  "success",
		"message": fmt.Sprintf("ลบสำเร็จ %d ไฟล์", deleted),
		"count":   deleted,
	}
	if len(errors) > 0 {
		result["errors"] = errors
	}
	return result
}

// =====================================================================
// 🎯 DOWNLOAD & SAVE DIALOGS
// =====================================================================

func (a *App) DownloadFile(category, relPath string) map[string]string {
	var src string
	switch category {
	case "uploads":
		src = filepath.Join(a.appDataDir, "uploads", relPath)
	case "outputs":
		src = filepath.Join(a.appDataDir, "outputs", relPath)
	default:
		return map[string]string{"error": "หมวดหมู่ไม่ถูกต้อง"}
	}
	defaultName := filepath.Base(relPath)
	ext := filepath.Ext(defaultName)
	file, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title: "ดาวน์โหลดไฟล์เสียง", DefaultFilename: defaultName,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Audio (" + ext + ")", Pattern: "*" + ext},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil || file == "" {
		return map[string]string{"status": "cancelled"}
	}
	if err := copyFile(src, file); err != nil {
		return map[string]string{"error": err.Error()}
	}
	a.AddLog("SUCCESS", "FILE", fmt.Sprintf("Downloaded: %s", defaultName))
	return map[string]string{"status": "success", "path": file}
}

func (a *App) SaveFileAs(srcFullPath, defaultName string) map[string]string {
	file, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title: "เลือกที่บันทึกไฟล์เสียง", DefaultFilename: defaultName,
		Filters: []wailsRuntime.FileFilter{{DisplayName: "Audio", Pattern: "*.mp3;*.wav;*.flac"}},
	})
	if err != nil || file == "" {
		return map[string]string{"status": "cancelled"}
	}
	if err := copyFile(srcFullPath, file); err != nil {
		return map[string]string{"error": err.Error()}
	}
	a.AddLog("SUCCESS", "FILE", fmt.Sprintf("Saved as: %s", defaultName))
	return map[string]string{"status": "success", "path": file}
}

// =====================================================================
// 🎯 MODEL MANAGEMENT
// =====================================================================

func (a *App) GetDefaultOptions() SongOptions {
	return SongOptions{
		OutputName: "converted_vocals",
		Pitch: 0, InstrumentalsPitch: 0,
		PreStemmed: false, VocalsOnly: false, SampleMode: false,
		DeEchoDeReverb: false, SampleModeStartTime: 0,
		F0Method: "rmvpe", StemmingMethod: "UVR-MDX-NET-Voc_FT",
		IndexRatio: 0.75, ConsonantProtection: 0.35,
		OutputFormat: "mp3_192k", VolumeEnvelope: 1.0,
		RemoveHum: true, RemoveBackingVocals: true,
		ApplyPostProcessing: true, AggressiveCleanup: false,
	}
}

func (a *App) DeleteModel(name string) bool {
	success := os.Remove(filepath.Join(a.appDataDir, "models", name)) == nil
	if success {
		a.AddLog("INFO", "MODEL", fmt.Sprintf("Deleted model: %s", name))
	}
	return success
}

func (a *App) GetStoredModels() []string {
	files, _ := os.ReadDir(filepath.Join(a.appDataDir, "models"))
	var names []string
	for _, f := range files {
		if !f.IsDir() && (strings.HasSuffix(strings.ToLower(f.Name()), ".pth") ||
			strings.HasSuffix(strings.ToLower(f.Name()), ".index")) {
			names = append(names, f.Name())
		}
	}
	return names
}

func (a *App) SelectAndSaveModel() map[string]string {
	return a.selectAndCopyFile("เลือกไฟล์โมเดล (.pth / .index)", "*.pth;*.index", "models")
}

func (a *App) SelectAndSaveAudio() map[string]string {
	return a.selectAndCopyFile("เลือกไฟล์เสียง", "*.mp3;*.wav;*.flac;*.m4a;*.ogg", "uploads")
}

func (a *App) selectAndCopyFile(title, pattern, destFolder string) map[string]string {
	destDir := filepath.Join(a.appDataDir, destFolder)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		log.Printf("[ERROR] Cannot create directory %s: %v", destDir, err)
		return nil
	}
	file, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: title,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Files", Pattern: pattern},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil {
		log.Printf("[ERROR] OpenFileDialog error: %v", err)
		return nil
	}
	if file == "" {
		return nil
	}

	name := filepath.Base(file)
	dest := filepath.Join(destDir, name)
	if _, err := os.Stat(dest); err == nil {
		_ = os.Remove(dest)
	}
	if err := copyFile(file, dest); err != nil {
		log.Printf("[ERROR] copyFile failed: %v", err)
		return nil
	}
	log.Printf("[SUCCESS] File copied: %s -> %s", file, dest)
	a.AddLog("SUCCESS", "FILE", fmt.Sprintf("Imported: %s to %s/", name, destFolder))
	return map[string]string{"name": name, "path": dest}
}

// =====================================================================
// 🎯 HELPERS
// =====================================================================

func (a *App) findPythonBinary(wd string) string {
	var venvPath, fallback string
	if runtime.GOOS == "windows" {
		venvPath = filepath.Join(wd, "python", "venv", "Scripts", "python.exe")
		fallback = "python"
	} else {
		venvPath = filepath.Join(wd, "python", "venv", "bin", "python")
		fallback = "python3"
	}
	if _, err := os.Stat(venvPath); err == nil {
		return venvPath
	}
	return fallback
}

func (a *App) freeUpPort(port string) {
	if runtime.GOOS == "windows" {
		cmd := fmt.Sprintf("$p = Get-NetTCPConnection -LocalPort %s -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force }", port)
		_ = exec.Command("powershell", "-Command", cmd).Run()
	} else {
		_ = exec.Command("sh", "-c", fmt.Sprintf("lsof -i :%s -t | xargs kill -9 2>/dev/null", port)).Run()
	}
	time.Sleep(800 * time.Millisecond)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err = io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}