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

// SongOptions - ตั้งค่า RVC/UVR จาก React UI (ซิงค์กับ HomePage.tsx)
type SongOptions struct {
	// Core
	OutputName string `json:"outputName"`
	// Pitch
	Pitch              int `json:"pitch"`
	InstrumentalsPitch int `json:"instrumentalsPitch"`
	// Flags
	PreStemmed          bool `json:"preStemmed"`
	VocalsOnly          bool `json:"vocalsOnly"`
	SampleMode          bool `json:"sampleMode"`
	DeEchoDeReverb      bool `json:"deEchoDeReverb"`
	SampleModeStartTime int  `json:"sampleModeStartTime"`
	// AI Methods
	F0Method       string  `json:"f0Method"`
	StemmingMethod string  `json:"stemmingMethod"`
	IndexRatio     float64 `json:"indexRatio"`
	// Quality
	ConsonantProtection float64 `json:"consonantProtection"`
	OutputFormat        string  `json:"outputFormat"`
	VolumeEnvelope      float64 `json:"volumeEnvelope"`
	// Hardware
	Device string `json:"device"`
	GPU    bool   `json:"gpu"`
	// 🎯 Audio Cleanup
	RemoveHum           bool `json:"removeHum"`
	RemoveBackingVocals bool `json:"removeBackingVocals"`
	ApplyPostProcessing bool `json:"applyPostProcessing"`
	AggressiveCleanup   bool `json:"aggressiveCleanup"`
}

// DemucsRequest - ตั้งค่า Demucs Separation
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
// 🎯 APP STRUCT (Wails Application Core)
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

	// สร้างโฟลเดอร์ที่จำเป็น
	for _, d := range []string{"uploads", "models", "outputs"} {
		_ = os.MkdirAll(filepath.Join(a.appDataDir, d), 0755)
	}

	a.freeUpPort(a.streamPort)
	a.startFileServer()
	go a.processQueueWorker()
}

func (a *App) shutdown(ctx context.Context) {}

// =====================================================================
// 🎯 FILE SERVER (สำหรับ streaming ไฟล์เสียง)
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

	go func() {
		_ = http.ListenAndServe("127.0.0.1:"+a.streamPort, corsHandler)
	}()
}

// =====================================================================
// 🎯 RVC/UVR QUEUE WORKER
// =====================================================================

func (a *App) processQueueWorker() {
	for item := range a.jobQueue {
		a.updateJobStatus(item.jobID, "processing", "Starting AI processing pipeline...")

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

		env := os.Environ()
		if deviceSetting == "cpu" {
			env = append(env, "CUDA_VISIBLE_DEVICES=")
		}
		cmd.Env = env
		if runtime.GOOS == "windows" {
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		}

		stdoutPipe, _ := cmd.StdoutPipe()
		stderrPipe, _ := cmd.StderrPipe()

		if err := cmd.Start(); err != nil {
			a.updateJobStatus(item.jobID, "errored", "Failed to start AI execution: "+err.Error())
			_ = os.Remove(configPath)
			continue
		}

		go io.Copy(os.Stderr, stderrPipe)
		a.scanProgressOutput(stdoutPipe, item.jobID)

		_ = cmd.Wait()
		_ = os.Remove(configPath)

		a.finalizeJobStatus(item.jobID, cmd.ProcessState.Success())
	}
}

func (a *App) scanProgressOutput(reader io.Reader, jobID string) {
	scanner := bufio.NewScanner(reader)
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
		if job["status"] == "processing" || job["status"] == "queued" {
			if success {
				job["status"] = "completed"
				job["message"] = "Completed successfully"
			} else {
				job["status"] = "errored"
				job["message"] = "AI pipeline failed unexpectedly"
			}
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
	}
	a.jobsMutex.Unlock()

	a.jobQueue <- queueItem{jobID: jobID, modelName: modelName, audioName: audioName, opts: opts}
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
		Progress:  DemucsProgress{Status: "queued", Message: "อยู่ในลำดับคิวระบบประมวลผล..."},
		StartedAt: time.Now(),
	}

	a.demucsJobsMu.Lock()
	a.demucsJobs[jobId] = job
	a.demucsJobsMu.Unlock()

	a.demucsQueue <- job
	log.Printf("[Demucs] Job enqueued: %s (model=%s, device=%s)", jobId, req.Model, req.Device)
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
	a.demucsJobsMu.Unlock()

	wd, _ := os.Getwd()
	pythonDir := filepath.Join(wd, "python")
	config := map[string]interface{}{
		"job_id":              job.ID,
		"source_audio_path":   job.Request.SourceAudioPath,
		"model":               job.Request.Model,
		"device":              job.Request.Device,
		"output_directory":    filepath.Join(a.appDataDir, "outputs", "demucs", job.ID),
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
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
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
		return
	}

	go a.scanDemucsProgress(stdout, job)
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			log.Printf("[Demucs STDERR] %s", scanner.Text())
		}
	}()

	err := cmd.Wait()
	a.demucsJobsMu.Lock()
	defer a.demucsJobsMu.Unlock()
	if err != nil {
		job.Progress.Status = "errored"
		job.Progress.Message = "Demucs processing crashed."
	} else if job.Progress.Status != "completed" {
		job.Progress.Status = "completed"
		job.Progress.Message = "เสร็จสมบูรณ์"
		job.Progress.Progress = 100
	}
}

func (a *App) scanDemucsProgress(reader io.Reader, job *demucsJob) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		var incoming DemucsProgress
		if err := json.Unmarshal([]byte(line), &incoming); err == nil && incoming.Status != "" {
			a.demucsJobsMu.Lock()
			job.Progress = incoming
			a.demucsJobsMu.Unlock()
		} else {
			log.Printf("[Demucs STDOUT] %s", line)
		}
	}
}

// =====================================================================
// 🎯 DEVICE & SETTINGS
// =====================================================================

func (a *App) resolveDevice(preferred string) string {
	if preferred != "" {
		return preferred
	}
	if saved := a.GetDeviceSetting(); saved != "" {
		return saved
	}
	return "cuda"
}

func (a *App) SaveDeviceSetting(device string) bool {
	return a.writeSettings(map[string]interface{}{
		"device":              device,
		"removeHum":           true,
		"removeBackingVocals": true,
		"applyPostProcessing": true,
		"aggressiveCleanup":   false,
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
		"device":              a.GetDeviceSetting(),
		"removeHum":           removeHum,
		"removeBackingVocals": removeBackingVocals,
		"applyPostProcessing": applyPostProcessing,
		"aggressiveCleanup":   aggressiveCleanup,
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
// 🎯 AUDIO MERGE (FFmpeg)
// =====================================================================

func (a *App) MergeAudio(vocalPath, instPath string, vocalVol, instVol float64, customName string) map[string]string {
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
		return map[string]string{"status": "error", "message": "FFmpeg Mix Failed: " + err.Error()}
	}

	return map[string]string{
		"status": "success", "fileName": outName,
		"streamUrl": a.GetAudioUrlByFullPath(outFullPath),
		"fullPath": outFullPath, "relPath": mixID + "/" + outName,
	}
}

func (a *App) resolveAudioPath(path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	candidates := []string{
		filepath.Join(a.appDataDir, "outputs", path),
		filepath.Join(a.appDataDir, "outputs", "stems", path),
		filepath.Join(a.appDataDir, "uploads", path),
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
	return a.listFiles(filepath.Join(a.appDataDir, "uploads"), []string{".mp3", ".wav", ".flac"})
}

func (a *App) GetSeparatedFiles() []string {
	var list []string
	stemsDir := filepath.Join(a.appDataDir, "outputs", "stems")
	_ = filepath.Walk(stemsDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			ext := strings.ToLower(filepath.Ext(info.Name()))
			if ext == ".mp3" || ext == ".wav" {
				if rel, err := filepath.Rel(stemsDir, path); err == nil {
					list = append(list, filepath.ToSlash(rel))
				}
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
				if ext == ".mp3" || ext == ".wav" {
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
	return os.Remove(filepath.Join(a.appDataDir, category, relPath)) == nil
}

func (a *App) DeleteAllOriginals() map[string]interface{} {
	return a.deleteAllInDirectory(filepath.Join(a.appDataDir, "uploads"), []string{".mp3", ".wav", ".flac"})
}

func (a *App) DeleteAllSeparated() map[string]interface{} {
	return a.deleteAllInDirectory(filepath.Join(a.appDataDir, "outputs", "stems"), []string{".mp3", ".wav"})
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
	return map[string]string{"status": "success", "path": file}
}

func (a *App) SaveFileAs(srcFullPath, defaultName string) map[string]string {
	file, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title: "เลือกที่บันทึกไฟล์เสียง", DefaultFilename: defaultName,
		Filters: []wailsRuntime.FileFilter{{DisplayName: "Audio", Pattern: "*.mp3;*.wav"}},
	})
	if err != nil || file == "" {
		return map[string]string{"status": "cancelled"}
	}
	if err := copyFile(srcFullPath, file); err != nil {
		return map[string]string{"error": err.Error()}
	}
	return map[string]string{"status": "success", "path": file}
}

// =====================================================================
// 🎯 DEFAULT OPTIONS & MODEL MANAGEMENT
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
		// Audio Cleanup defaults
		RemoveHum: true, RemoveBackingVocals: true,
		ApplyPostProcessing: true, AggressiveCleanup: false,
	}
}

func (a *App) DeleteModel(name string) bool {
	return os.Remove(filepath.Join(a.appDataDir, "models", name)) == nil
}

func (a *App) GetStoredModels() []string {
	files, _ := os.ReadDir(filepath.Join(a.appDataDir, "models"))
	var names []string
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(strings.ToLower(f.Name()), ".pth") {
			names = append(names, f.Name())
		}
	}
	return names
}

func (a *App) SelectAndSaveModel() map[string]string {
	return a.selectAndCopyFile("เลือกไฟล์โมเดล (.pth)", "*.pth", "models")
}

func (a *App) SelectAndSaveAudio() map[string]string {
	return a.selectAndCopyFile("เลือกไฟล์เสียง", "*.mp3;*.wav;*.flac", "uploads")
}

func (a *App) selectAndCopyFile(title, pattern, destFolder string) map[string]string {
	file, _ := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: title,
		Filters: []wailsRuntime.FileFilter{{DisplayName: "File", Pattern: pattern}},
	})
	if file == "" {
		return nil
	}
	name := filepath.Base(file)
	dest := filepath.Join(a.appDataDir, destFolder, name)
	if err := copyFile(file, dest); err != nil {
		return nil
	}
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
		_ = exec.Command("sh", "-c", fmt.Sprintf("lsof -i :%s -t | xargs kill -9", port)).Run()
	}
	time.Sleep(1200 * time.Millisecond)
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