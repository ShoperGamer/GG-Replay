package initialization

import (
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
)

// =====================================================================
// Logger Configuration
// =====================================================================

var Logger *log.Logger
var logFileHandle *os.File
var mu sync.Mutex

// PythonConfig เก็บโครงสร้างสำหรับการเรียกใช้งานโปรเซส
type PythonConfig struct {
	PythonPath string
	ScriptPath string
}

// ModelInfo เก็บข้อมูลของ AI model ที่ต้องดาวน์โหลด
type ModelInfo struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	SizeMB    int64  `json:"size_mb"`
	Required  bool   `json:"required"`
	LocalPath string `json:"local_path"`
}

// ProgressInfo สำหรับ parse JSON จาก Python
type ProgressInfo struct {
	Status   string  `json:"status"`
	Progress float64 `json:"progress"`
	Message  string  `json:"message"`
	Stage    string  `json:"stage"`
}

// =====================================================================
// Path Management
// =====================================================================

// getBaseDir คืนค่า base directory ของแอป (รองรับทั้ง dev และ production)
func getBaseDir() string {
	// ถ้ารันจาก PyInstaller executable
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		// ตรวจสอบว่าเป็น production build หรือไม่
		if _, err := os.Stat(filepath.Join(exeDir, "python_worker")); err == nil {
			return exeDir
		}
		// สำหรับ NSIS installer
		if _, err := os.Stat(filepath.Join(exeDir, "GG-Replay-Worker.exe")); err == nil {
			return exeDir
		}
	}

	// Development mode
	wd, _ := os.Getwd()
	return wd
}

// getDataDir คืนค่า path ของโฟลเดอร์ data/
func getDataDir() string {
	return filepath.Join(getBaseDir(), "data")
}

// getLogsDir คืนค่า path ของโฟลเดอร์ logs
func getLogsDir() string {
	return filepath.Join(getDataDir(), "logs")
}

// getModelsDir คืนค่า path ของโฟลเดอร์ models
func getModelsDir() string {
	return filepath.Join(getDataDir(), "models")
}

// getPythonWorkerPath คืนค่า path ของ Python worker executable
func getPythonWorkerPath() string {
	baseDir := getBaseDir()

	// Production mode (PyInstaller build)
	if runtime.GOOS == "windows" {
		workerPath := filepath.Join(baseDir, "GG-Replay-Worker", "GG-Replay-Worker.exe")
		if _, err := os.Stat(workerPath); err == nil {
			return workerPath
		}
		// Alternative: same directory
		altPath := filepath.Join(baseDir, "GG-Replay-Worker.exe")
		if _, err := os.Stat(altPath); err == nil {
			return altPath
		}
	} else {
		workerPath := filepath.Join(baseDir, "GG-Replay-Worker", "GG-Replay-Worker")
		if _, err := os.Stat(workerPath); err == nil {
			return workerPath
		}
	}

	// Development mode
	if runtime.GOOS == "windows" {
		return filepath.Join(baseDir, "python", "run_job.py")
	}
	return filepath.Join(baseDir, "python", "run_job.py")
}

// getPythonPath คืนค่า path ของ Python interpreter (สำหรับ dev mode)
func getPythonPath() string {
	// ลองหาจาก venv ก่อน
	venvPaths := []string{
		filepath.Join(getBaseDir(), "python", "venv", "Scripts", "python.exe"),
		filepath.Join(getBaseDir(), "python", "venv", "bin", "python"),
	}

	for _, p := range venvPaths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}

	// Fallback to system Python
	if runtime.GOOS == "windows" {
		return "python"
	}
	return "python3"
}

// =====================================================================
// Logging System
// =====================================================================

// InitLogging ตั้งค่าระบบ logging
func InitLogging() error {
	logsDir := getLogsDir()
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return fmt.Errorf("failed to create logs directory: %v", err)
	}

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logPath := filepath.Join(logsDir, "gg_replay_"+timestamp+".log")

	var err error
	logFileHandle, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return fmt.Errorf("failed to open log file: %v", err)
	}

	multiWriter := io.MultiWriter(os.Stdout, logFileHandle)
	Logger = log.New(multiWriter, "", log.Ldate|log.Ltime|log.Lshortfile)
	log.SetOutput(multiWriter)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	Logger.Println("=====================================================")
	Logger.Println("=== GG-Replay Engine Standard Logging Initialized ===")
	Logger.Printf("=== Log file: %s ===", logPath)
	Logger.Println("=====================================================")
	return nil
}

// =====================================================================
// Environment Setup
// =====================================================================

// SetupEnvironmentVariables ตั้งค่า environment variables
func SetupEnvironmentVariables() {
	if runtime.GOOS != "windows" {
		os.Setenv("PYTORCH_ENABLE_MPS_FALLBACK", "1")
		Logger.Println("[Env] Applied PYTORCH_ENABLE_MPS_FALLBACK=1 for Unix system.")
	}

	os.Setenv("PYTHONUNBUFFERED", "1")
	os.Setenv("PYTHONIOENCODING", "UTF-8")
	os.Setenv("GG_REPLAY_LOG_DIR", getLogsDir())
	os.Setenv("GG_REPLAY_DATA_DIR", getDataDir())
	os.Setenv("GG_REPLAY_MODELS_DIR", getModelsDir())
	os.Setenv("GOMAXPROCS", "0")
	os.Setenv("OMP_NUM_THREADS", fmt.Sprintf("%d", runtime.NumCPU()))

	Logger.Printf("[Env] Environment setup completed. OS: %s | Arch: %s | CPU Cores: %d",
		runtime.GOOS, runtime.GOARCH, runtime.NumCPU())
}

// =====================================================================
// Model Management
// =====================================================================

// getRequiredModels คืนค่ารายการ models ที่จำเป็น
func getRequiredModels() []ModelInfo {
	modelsDir := getModelsDir()

	return []ModelInfo{
		{
			Name:      "hubert_base.pt",
			URL:       "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt",
			SizeMB:    190,
			Required:  true,
			LocalPath: filepath.Join(modelsDir, "hubert_base.pt"),
		},
		{
			Name:      "rmvpe.pt",
			URL:       "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt",
			SizeMB:    180,
			Required:  true,
			LocalPath: filepath.Join(modelsDir, "rmvpe.pt"),
		},
		{
			Name:      "rmvpe.onnx",
			URL:       "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.onnx",
			SizeMB:    180,
			Required:  false,
			LocalPath: filepath.Join(modelsDir, "rmvpe.onnx"),
		},
	}
}

// checkAndDownloadModels ตรวจสอบและดาวน์โหลด models ที่ขาด
func checkAndDownloadModels() error {
	Logger.Println("[Models] Checking required AI models...")

	models := getRequiredModels()
	var missing []ModelInfo

	for _, model := range models {
		if _, err := os.Stat(model.LocalPath); os.IsNotExist(err) {
			missing = append(missing, model)
			Logger.Printf("[Models] Missing: %s (%d MB)", model.Name, model.SizeMB)
		} else {
			Logger.Printf("[Models] Found: %s", model.Name)
		}
	}

	if len(missing) == 0 {
		Logger.Println("[Models] All required models are present.")
		return nil
	}

	// สร้างโฟลเดอร์ models ถ้ายังไม่มี
	modelsDir := getModelsDir()
	if err := os.MkdirAll(modelsDir, 0755); err != nil {
		return fmt.Errorf("failed to create models directory: %v", err)
	}

	// ดาวน์โหลด models ที่ขาด
	Logger.Printf("[Models] Downloading %d missing model(s)...", len(missing))

	for _, model := range missing {
		if !model.Required {
			Logger.Printf("[Models] Skipping optional model: %s", model.Name)
			continue
		}

		Logger.Printf("[Models] Downloading %s (%d MB)...", model.Name, model.SizeMB)

		if err := downloadFileWithProgress(model.URL, model.LocalPath, model.Name); err != nil {
			return fmt.Errorf("failed to download %s: %v", model.Name, err)
		}

		Logger.Printf("[Models] ✓ Downloaded: %s", model.Name)
	}

	Logger.Println("[Models] All required models are ready.")
	return nil
}

// downloadFileWithProgress ดาวน์โหลดไฟล์พร้อมแสดง progress
func downloadFileWithProgress(url, filepath, filename string) error {
	// สร้างไฟล์ชั่วคราวก่อน
	tempPath := filepath + ".tmp"
	out, err := os.Create(tempPath)
	if err != nil {
		return err
	}
	defer out.Close()

	client := &http.Client{
		Timeout: 30 * time.Minute,
	}

	resp, err := client.Get(url)
	if err != nil {
		os.Remove(tempPath)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		os.Remove(tempPath)
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	totalSize := resp.ContentLength
	var downloaded int64 = 0
	buffer := make([]byte, 32*1024) // 32KB buffer
	lastPercent := -1

	for {
		n, err := resp.Body.Read(buffer)
		if n > 0 {
			_, writeErr := out.Write(buffer[:n])
			if writeErr != nil {
				os.Remove(tempPath)
				return writeErr
			}
			downloaded += int64(n)

			if totalSize > 0 {
				percent := int(float64(downloaded) / float64(totalSize) * 100)
				if percent != lastPercent && percent%10 == 0 {
					Logger.Printf("[Download] %s: %d%% (%d/%d MB)",
						filename, percent,
						downloaded/(1024*1024),
						totalSize/(1024*1024))
					lastPercent = percent
				}
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			os.Remove(tempPath)
			return err
		}
	}

	// ย้ายไฟล์ชั่วคราวเป็นไฟล์จริง
	out.Close()
	if err := os.Rename(tempPath, filepath); err != nil {
		os.Remove(tempPath)
		return err
	}

	return nil
}

// =====================================================================
// Main Initialization
// =====================================================================

// Initialize เริ่มต้นระบบทั้งหมด
func Initialize() {
	if err := InitLogging(); err != nil {
		log.Printf("[Warning] Cannot initialize file logging: %v. Falling back to stdout.", err)
		Logger = log.New(os.Stdout, "", log.Ldate|log.Ltime|log.Lshortfile)
	}

	SetupEnvironmentVariables()

	// สร้างโฟลเดอร์ที่จำเป็น
	dirs := []string{
		getDataDir(),
		getModelsDir(),
		filepath.Join(getDataDir(), "uploads"),
		filepath.Join(getDataDir(), "outputs"),
		getLogsDir(),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			Logger.Printf("[Warning] Failed to create directory %s: %v", dir, err)
		}
	}

	// ตรวจสอบและดาวน์โหลด models
	if err := checkAndDownloadModels(); err != nil {
		Logger.Printf("[Error] Model download failed: %v", err)
		Logger.Println("[Warning] Some AI features may not work without required models.")
	}

	Logger.Println("[Init] Core Application initialization completed successfully.")
}

// =====================================================================
// Python Process Management
// =====================================================================

// RunInferenceJob รัน inference job ผ่าน Python worker
func RunInferenceJob(ctx context.Context, jobConfig map[string]interface{}, progressChan chan<- ProgressInfo) error {
	workerPath := getPythonWorkerPath()

	// สร้าง temporary config file
	configJSON, err := json.Marshal(jobConfig)
	if err != nil {
		return fmt.Errorf("failed to marshal job config: %v", err)
	}

	configPath := filepath.Join(os.TempDir(), fmt.Sprintf("gg_replay_job_%d.json", time.Now().UnixNano()))
	if err := os.WriteFile(configPath, configJSON, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %v", err)
	}
	defer os.Remove(configPath)

	jobID := fmt.Sprintf("job_%d", time.Now().UnixNano())

	// เตรียม command
	var cmd *exec.Cmd

	// ตรวจสอบว่าเป็น compiled worker หรือไม่
	if strings.HasSuffix(workerPath, ".exe") || (!strings.HasSuffix(workerPath, ".py") && runtime.GOOS != "windows") {
		cmd = exec.CommandContext(ctx, workerPath, "--config", configPath, "--job_id", jobID)
		Logger.Printf("[Job] Running compiled worker: %s", workerPath)
	} else {
		// Development mode - รันผ่าน Python interpreter
		pythonPath := getPythonPath()
		cmd = exec.CommandContext(ctx, pythonPath, workerPath, "--config", configPath, "--job_id", jobID)
		Logger.Printf("[Job] Running Python script: %s %s", pythonPath, workerPath)
	}

	cmd.Dir = filepath.Dir(workerPath)
	cmd.Env = append(os.Environ(),
		"PYTHONUNBUFFERED=1",
		"PYTHONIOENCODING=UTF-8",
		"PYTORCH_ENABLE_MPS_FALLBACK=1",
		"GG_REPLAY_LOG_DIR="+getLogsDir(),
		"GG_REPLAY_DATA_DIR="+getDataDir(),
		"GG_REPLAY_MODELS_DIR="+getModelsDir(),
	)

	// ซ่อน console window บน Windows
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	// Setup stdout/stderr pipes
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %v", err)
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	// เริ่ม process
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start worker: %v", err)
	}

	Logger.Printf("[Job] Worker started with PID: %d", cmd.Process.Pid)

	// อ่าน output แบบ async
	var wg sync.WaitGroup
	wg.Add(2)

	// อ่าน stdout (progress JSON)
	go func() {
		defer wg.Done()
		scanner := NewLineScanner(stdoutPipe)
		for scanner.Scan() {
			line := scanner.Text()

			// ตรวจสอบว่าเป็น progress JSON หรือไม่
			if strings.HasPrefix(line, "PROGRESS_JSON:") {
				jsonStr := strings.TrimPrefix(line, "PROGRESS_JSON:")
				var progress ProgressInfo
				if err := json.Unmarshal([]byte(jsonStr), &progress); err == nil {
					if progressChan != nil {
						progressChan <- progress
					}
					Logger.Printf("[Progress] %s: %.1f%% - %s",
						progress.Stage, progress.Progress, progress.Message)
				}
			} else if strings.TrimSpace(line) != "" {
				Logger.Printf("[Worker] %s", line)
			}
		}
	}()

	// อ่าน stderr (error logs)
	go func() {
		defer wg.Done()
		scanner := NewLineScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.TrimSpace(line) != "" {
				Logger.Printf("[Worker Error] %s", line)
			}
		}
	}()

	// รอให้ process เสร็จ
	err = cmd.Wait()
	wg.Wait()

	if progressChan != nil {
		close(progressChan)
	}

	if err != nil {
		return fmt.Errorf("worker exited with error: %v", err)
	}

	Logger.Printf("[Job] Worker completed successfully")
	return nil
}

// LineScanner helper สำหรับอ่าน output ทีละบรรทัด
type LineScanner struct {
	reader io.Reader
	buffer []byte
	line   []byte
}

func NewLineScanner(r io.Reader) *LineScanner {
	return &LineScanner{
		reader: r,
		buffer: make([]byte, 4096),
	}
}

func (s *LineScanner) Scan() bool {
	for {
		n, err := s.reader.Read(s.buffer)
		if n > 0 {
			for i := 0; i < n; i++ {
				if s.buffer[i] == '\n' {
					return true
				}
				s.line = append(s.line, s.buffer[i])
			}
		}
		if err == io.EOF {
			if len(s.line) > 0 {
				return true
			}
			return false
		}
		if err != nil {
			return false
		}
	}
}

func (s *LineScanner) Text() string {
	line := string(s.line)
	s.line = s.line[:0]
	return strings.TrimRight(line, "\r\n")
}

// =====================================================================
// Cleanup
// =====================================================================

// Cleanup เคลียร์ทรัพยากรก่อนปิดแอป
func Cleanup(pythonServerCmd *exec.Cmd) {
	Logger.Println("[Shutdown] Initiating application graceful shutdown procedures...")

	// 1. ตรวจสอบและปิดการทำงานของ Python Server เบื้องหลัง (หากเปิดทิ้งไว้)
	if pythonServerCmd != nil && pythonServerCmd.Process != nil {
		Logger.Printf("[Shutdown] Stopping background Python server process (PID): %d...", pythonServerCmd.Process.Pid)

		var err error
		if runtime.GOOS == "windows" {
			err = pythonServerCmd.Process.Signal(os.Interrupt)
		} else {
			// ส่งสัญญาณตัดการทำงานแบบนุ่มนวล เพื่อให้โมเดล AI คืนค่าหน่วยความจำ VRAM ได้สมบูรณ์
			err = pythonServerCmd.Process.Signal(syscall.SIGTERM)
		}

		if err != nil {
			Logger.Printf("[Shutdown Error] Failed to send signal gracefully: %v. Forcing destruction...", err)
			_ = pythonServerCmd.Process.Kill()
		}

		// ดักจับรอเวลาให้ตัวกระบวนการปิดตัวลงอย่างเรียบร้อย ไม่เกิน 5 วินาที
		done := make(chan error, 1)
		go func() { done <- pythonServerCmd.Wait() }()

		select {
		case <-time.After(5 * time.Second):
			Logger.Println("[Shutdown Timeout] Process did not respond. Force killing now...")
			_ = pythonServerCmd.Process.Kill()
			<-done
		case <-done:
			Logger.Println("[Shutdown] Background Python server has been closed cleanly.")
		}
	}

	// 2. ทำการปิด File Handle ของไฟล์ Log เพื่อไม่ให้ไฟล์เสียหายหรือ Lock ดิสก์ค้างไว้
	if logFileHandle != nil {
		Logger.Println("[Shutdown] Standard file logging session finalized. Goodbye.")
		_ = logFileHandle.Close()
	}
}