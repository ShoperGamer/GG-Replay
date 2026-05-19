package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
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

type SongOptions struct {
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
	OutputName          string  `json:"outputName"`
}

type queueItem struct {
	jobID     string
	modelName string
	audioName string
	opts      SongOptions
}

type App struct {
	ctx          context.Context
	pythonPort   string
	pythonApiUrl string
	streamPort   string
	appDataDir   string

	jobsMutex   sync.RWMutex
	runningJobs map[string]interface{}
	jobQueue    chan queueItem
}

func NewApp() *App {
	port := "62362"
	streamPort := "62363"
	return &App{
		pythonPort:   port,
		pythonApiUrl: fmt.Sprintf("http://127.0.0.1:%s", port),
		streamPort:   streamPort,
		runningJobs:  make(map[string]interface{}),
		jobQueue:     make(chan queueItem, 100),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	wd, _ := os.Getwd()
	a.appDataDir = filepath.Join(wd, "data")

	dirs := []string{
		filepath.Join(a.appDataDir, "uploads"),
		filepath.Join(a.appDataDir, "models"),
		filepath.Join(a.appDataDir, "outputs"),
	}
	for _, d := range dirs {
		_ = os.MkdirAll(d, 0755)
	}

	a.freeUpPort(a.streamPort)
	
	mux := http.NewServeMux()
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(filepath.Join(a.appDataDir, "uploads")))))
	mux.Handle("/outputs/", http.StripPrefix("/outputs/", http.FileServer(http.Dir(filepath.Join(a.appDataDir, "outputs")))))

	corsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		if r.Method == "OPTIONS" { return }
		mux.ServeHTTP(w, r)
	})

	go func() {
		_ = http.ListenAndServe("127.0.0.1:"+a.streamPort, corsHandler)
	}()

	go a.processQueueWorker()
}

func (a *App) processQueueWorker() {
	for item := range a.jobQueue {
		a.updateJobStatus(item.jobID, "processing", "Starting AI processing pipeline...")

		configData := map[string]interface{}{
			"modelId":           item.modelName,
			"modelPath":         filepath.Join(a.appDataDir, "models"),
			"weightsPath":       filepath.Join(a.appDataDir, "models"),
			"songUrlOrFilePath": filepath.Join(a.appDataDir, "uploads", item.audioName),
			"outputDirectory":   filepath.Join(a.appDataDir, "outputs"),
			"options":           item.opts,
		}
		configBytes, _ := json.Marshal(configData)
		configPath := filepath.Join(os.TempDir(), fmt.Sprintf("job_%s.json", item.jobID))
		_ = os.WriteFile(configPath, configBytes, 0644)

		wd, _ := os.Getwd()
		pythonBin := a.findPythonBinary(wd)
		pythonDir := filepath.Join(wd, "python")
		scriptPath := filepath.Join(pythonDir, "run_job.py")

		cmd := exec.Command(pythonBin, scriptPath, "--config", configPath, "--job_id", item.jobID)
		cmd.Dir = pythonDir
		
		deviceSetting := a.GetDeviceSetting()
		if deviceSetting == "" { deviceSetting = "cuda" }
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

		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "PROGRESS_JSON:") {
				jsonStr := strings.TrimPrefix(line, "PROGRESS_JSON:")
				var progressMap map[string]interface{}
				if err := json.Unmarshal([]byte(jsonStr), &progressMap); err == nil {
					a.jobsMutex.Lock()
					a.runningJobs[item.jobID] = progressMap
					a.jobsMutex.Unlock()
				}
			}
		}

		_ = cmd.Wait()
		_ = os.Remove(configPath)

		a.jobsMutex.Lock()
		if job, exists := a.runningJobs[item.jobID].(map[string]interface{}); exists {
			if job["status"] == "processing" || job["status"] == "queued" {
				if cmd.ProcessState.Success() {
					job["status"] = "completed"
					job["message"] = "Completed successfully"
				} else {
					job["status"] = "errored"
					job["message"] = "AI pipeline failed unexpectedly"
				}
			}
		}
		a.jobsMutex.Unlock()
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

func (a *App) CreateSong(modelName string, audioName string, opts SongOptions) string {
	jobID := fmt.Sprintf("job_%d", time.Now().UnixNano())
	trackName := strings.TrimSuffix(audioName, filepath.Ext(audioName))

	a.jobsMutex.Lock()
	a.runningJobs[jobID] = map[string]interface{}{
		"status":    "queued",
		"message":   "Waiting in Go engine queue...",
		"jobId":     jobID,
		"modelId":   modelName,
		"trackName": trackName,
	}
	a.jobsMutex.Unlock()

	a.jobQueue <- queueItem{jobID: jobID, modelName: modelName, audioName: audioName, opts: opts}
	return jobID
}

func (a *App) GetJobProgress(jobId string) map[string]interface{} {
	a.jobsMutex.RLock()
	defer a.jobsMutex.RUnlock()
	if job, exists := a.runningJobs[jobId]; exists {
		if m, ok := job.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{"status": "unknown_job", "message": "Error: Job not found"}
}

func (a *App) SaveDeviceSetting(device string) bool {
	p := filepath.Join(a.appDataDir, "settings.json")
	s := struct { Device string `json:"device"` }{Device: device}
	data, _ := json.Marshal(s)
	return os.WriteFile(p, data, 0644) == nil
}

func (a *App) MergeAudio(vocalPath string, instPath string, vocalVol float64, instVol float64, customName string) map[string]string {
	absVocal := vocalPath
	if !filepath.IsAbs(vocalPath) {
		absVocal = filepath.Join(a.appDataDir, "outputs", vocalPath)
		if _, err := os.Stat(absVocal); err != nil {
			absVocal = filepath.Join(a.appDataDir, "outputs", "stems", vocalPath)
			if _, err := os.Stat(absVocal); err != nil {
				absVocal = filepath.Join(a.appDataDir, "uploads", vocalPath)
			}
		}
	}
	absInst := instPath
	if !filepath.IsAbs(instPath) {
		absInst = filepath.Join(a.appDataDir, "outputs", instPath)
		if _, err := os.Stat(absInst); err != nil {
			absInst = filepath.Join(a.appDataDir, "outputs", "stems", instPath)
			if _, err := os.Stat(absInst); err != nil {
				absInst = filepath.Join(a.appDataDir, "uploads", instPath)
			}
		}
	}

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

	cmd := exec.Command("ffmpeg", "-y", "-i", absInst, "-i", absVocal,
		"-filter_complex", fmt.Sprintf("[0:a]volume=%f[i];[1:a]volume=%f[v];[i][v]amix=inputs=2:duration=longest", instVol, vocalVol),
		"-b:a", "320k", outFullPath,
	)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	if err := cmd.Run(); err != nil {
		return map[string]string{"status": "error", "message": "FFmpeg Mix Failed: " + err.Error()}
	}

	streamUrl := a.GetAudioUrlByFullPath(outFullPath)
	return map[string]string{
		"status":    "success",
		"fileName":  outName,
		"streamUrl": streamUrl,
		"fullPath":  outFullPath,
		"relPath":   mixID + "/" + outName,
	}
}

func (a *App) GetDeviceSetting() string {
	p := filepath.Join(a.appDataDir, "settings.json")
	dataBytes, err := os.ReadFile(p)
	if err != nil { return "" }
	var s struct { Device string `json:"device"` }
	json.Unmarshal(dataBytes, &s)
	return s.Device
}

func (a *App) GetAudioUrl(filename string, folder string) string {
	return fmt.Sprintf("http://127.0.0.1:%s/%s/%s", a.streamPort, folder, filename)
}

func (a *App) GetAudioUrlByFullPath(fullPath string) string {
	cleanedPath := filepath.Clean(fullPath)
	cleanedDataDir := filepath.Clean(a.appDataDir)

	relPath, err := filepath.Rel(cleanedDataDir, cleanedPath)
	if err != nil || strings.HasPrefix(relPath, "..") {
		filename := filepath.Base(fullPath)
		if strings.Contains(fullPath, "outputs") {
			return fmt.Sprintf("http://127.0.0.1:%s/outputs/%s", a.streamPort, filename)
		}
		return fmt.Sprintf("http://127.0.0.1:%s/uploads/%s", a.streamPort, filename)
	}
	return fmt.Sprintf("http://127.0.0.1:%s/%s", a.streamPort, filepath.ToSlash(relPath))
}

func (a *App) GetOriginalFiles() []string {
	files, _ := os.ReadDir(filepath.Join(a.appDataDir, "uploads"))
	var list []string
	for _, f := range files {
		if !f.IsDir() {
			ext := strings.ToLower(filepath.Ext(f.Name()))
			if ext == ".mp3" || ext == ".wav" || ext == ".flac" { list = append(list, f.Name()) }
		}
	}
	return list
}

func (a *App) GetSeparatedFiles() []string {
	var list []string
	stemsDir := filepath.Join(a.appDataDir, "outputs", "stems")
	_ = filepath.Walk(stemsDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			ext := strings.ToLower(filepath.Ext(info.Name()))
			if ext == ".mp3" || ext == ".wav" {
				rel, err := filepath.Rel(stemsDir, path)
				if err == nil { list = append(list, filepath.ToSlash(rel)) }
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
	for _, f := range files {
		if f.IsDir() && f.Name() != "stems" && f.Name() != "originals" && f.Name() != "yt-cache" {
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
	}
	return list
}

func (a *App) GetFileStreamUrl(category string, relPath string) string {
	return fmt.Sprintf("http://127.0.0.1:%s/%s/%s", a.streamPort, category, relPath)
}

func (a *App) DeleteLocalFile(category string, relPath string) bool {
	p := filepath.Join(a.appDataDir, category, relPath)
	return os.Remove(p) == nil
}

func (a *App) DownloadFile(category string, relPath string) map[string]string {
	var srcFullPath string
	switch category {
	case "uploads":
		srcFullPath = filepath.Join(a.appDataDir, "uploads", relPath)
	case "outputs":
		srcFullPath = filepath.Join(a.appDataDir, "outputs", relPath)
	default:
		return map[string]string{"error": "หมวดหมู่ไฟล์ไม่ถูกต้อง"}
	}

	defaultName := filepath.Base(relPath)
	ext := filepath.Ext(defaultName)
	file, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title: "ดาวน์โหลดและเลือกโฟลเดอร์บันทึกไฟล์เสียง", DefaultFilename: defaultName,
		Filters: []wailsRuntime.FileFilter{{DisplayName: "Audio File (" + ext + ")", Pattern: "*" + ext}, {DisplayName: "All Files (*.*)", Pattern: "*.*"}},
	})
	if err != nil || file == "" { return map[string]string{"status": "cancelled"} }
	err = copyFile(srcFullPath, file)
	if err != nil { return map[string]string{"error": err.Error()} }
	return map[string]string{"status": "success", "path": file}
}

func (a *App) SaveFileAs(srcFullPath string, defaultName string) map[string]string {
	file, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title: "เลือกโฟลเดอร์สำหรับส่งออกไฟล์เสียง", DefaultFilename: defaultName,
		Filters: []wailsRuntime.FileFilter{{DisplayName: "Audio File (*.mp3;*.wav)", Pattern: "*.mp3;*.wav"}},
	})
	if err != nil || file == "" { return map[string]string{"status": "cancelled"} }
	err = copyFile(srcFullPath, file)
	if err != nil { return map[string]string{"error": err.Error()} }
	return map[string]string{"status": "success", "path": file}
}

func (a *App) GetDefaultOptions() SongOptions {
	return SongOptions{
		Pitch: 0, InstrumentalsPitch: 0, PreStemmed: false, VocalsOnly: false,
		SampleMode: false, DeEchoDeReverb: false, SampleModeStartTime: 0,
		F0Method: "rmvpe", StemmingMethod: "UVR-MDX-NET-Voc_FT", IndexRatio: 0.75,
		ConsonantProtection: 0.35, OutputFormat: "mp3_192k", VolumeEnvelope: 1.0,
	}
}

func (a *App) DeleteModel(name string) bool {
	return os.Remove(filepath.Join(a.appDataDir, "models", name)) == nil
}

func (a *App) GetStoredModels() []string {
	files, _ := os.ReadDir(filepath.Join(a.appDataDir, "models"))
	var names []string
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(strings.ToLower(f.Name()), ".pth") { names = append(names, f.Name()) }
	}
	return names
}

func (a *App) SelectAndSaveModel() map[string]string {
	file, _ := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "เลือกไฟล์โมเดล (.pth)", Filters: []wailsRuntime.FileFilter{{DisplayName: "Model", Pattern: "*.pth"}},
	})
	if file == "" { return nil }
	name := filepath.Base(file)
	dest := filepath.Join(a.appDataDir, "models", name)
	if err := copyFile(file, dest); err != nil { return nil }
	return map[string]string{"name": name, "path": dest}
}

func (a *App) SelectAndSaveAudio() map[string]string {
	file, _ := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "เลือกไฟล์เสียง", Filters: []wailsRuntime.FileFilter{{DisplayName: "Audio", Pattern: "*.mp3;*.wav;*.flac"}},
	})
	if file == "" { return nil }
	name := filepath.Base(file)
	dest := filepath.Join(a.appDataDir, "uploads", name)
	if err := copyFile(file, dest); err != nil { return nil }
	return map[string]string{"name": name, "path": dest}
}

func (a *App) findPythonBinary(wd string) string {
	if runtime.GOOS == "windows" {
		localVenv := filepath.Join(wd, "python", "venv", "Scripts", "python.exe")
		if _, err := os.Stat(localVenv); err == nil { return localVenv }
		return "python"
	}
	localVenv := filepath.Join(wd, "python", "venv", "bin", "python")
	if _, err := os.Stat(localVenv); err == nil { return localVenv }
	return "python3"
}

func (a *App) freeUpPort(port string) {
	if runtime.GOOS == "windows" {
		cmdStr := fmt.Sprintf("$p = Get-NetTCPConnection -LocalPort %s -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force }", port)
		_ = exec.Command("powershell", "-Command", cmdStr).Run()
	} else {
		_ = exec.Command("sh", "-c", fmt.Sprintf("lsof -i :%s -t | xargs kill -9", port)).Run()
	}
	time.Sleep(1200 * time.Millisecond)
}

func (a *App) shutdown(ctx context.Context) {}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil { return err }
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil { return err }
	defer out.Close()
	_, err = io.Copy(out, in)
	if err != nil { return err }
	return out.Sync()
}