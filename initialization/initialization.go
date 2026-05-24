package initialization

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

// Logger เป็นตัวจัดการ Log ส่วนกลางของแอปพลิเคชัน บันทึกทั้งหน้าจอและลงไฟล์ดิสก์
var Logger *log.Logger
var logFileHandle *os.File

// PythonConfig เก็บโครงสร้างสำหรับการเรียกใช้งานโปรเซสระยะยาว (ถ้ามี)
type PythonConfig struct {
	PythonPath string
	ScriptPath string
}

// InitLogging ตั้งค่าท่อส่ง Log ออกไป 2 ทางพร้อมกัน
func InitLogging() error {
	logsDir := "logs"
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return fmt.Errorf("failed to create logs directory: %v", err)
	}

	// สร้างชื่อไฟล์ตามวันเวลาปัจจุบัน
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logPath := filepath.Join(logsDir, "gg_replay_"+timestamp+".log")

	var err error
	logFileHandle, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return fmt.Errorf("failed to open log file: %v", err)
	}

	// ผูกท่อส่งออกคู่กันStdout (หน้าจอคอนโซล) และ ไฟล์บันทึกข้อมูล
	multiWriter := io.MultiWriter(os.Stdout, logFileHandle)

	// ทำการกำหนดค่าให้กับ Global Logger
	Logger = log.New(multiWriter, "", log.Ldate|log.Ltime|log.Lshortfile)
	log.SetOutput(multiWriter)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	Logger.Println("=====================================================")
	Logger.Println("=== GG-Replay Engine Standard Logging Initialized ===")
	Logger.Println("=====================================================")
	return nil
}

// SetupEnvironmentVariables เซ็ตค่าตัวแปรระบบปฏิบัติการให้กับปัญญาประดิษฐ์ (UVR / RVC)
func SetupEnvironmentVariables() {
	// ป้องกันปัญหารันโมเดลบน Apple Silicon แล้วแครชด้วยการเปิดระบบสำรองย้ายไป CPU
	if runtime.GOOS != "windows" {
		os.Setenv("PYTORCH_ENABLE_MPS_FALLBACK", "1")
		Logger.Println("[Env] Applied PYTORCH_ENABLE_MPS_FALLBACK=1 for Unix system.")
	}

	// บังคับให้โปรเซสของ Python พ่น Log ออกมาทันที ไม่เก็บค้างในบัฟเฟอร์ เพื่อการดัก Progress ที่แม่นยำ
	os.Setenv("PYTHONUNBUFFERED", "1")
	os.Setenv("PYTHONIOENCODING", "UTF-8")
	
	// ตั้งค่าประสิทธิภาพฝั่ง Go ให้ดึงทรัพยากร CPU ได้ครบทุกแกนประมวลผล
	os.Setenv("GOMAXPROCS", "0")
	
	// ตั้งค่าขีดจำกัดการคำนวณเธรดสำหรับโมเดลกลุ่ม ONNX Runtime
	os.Setenv("OMP_NUM_THREADS", fmt.Sprintf("%d", runtime.NumCPU()))

	Logger.Printf("[Env] Environment setup completed. OS: %s | Arch: %s | CPU Cores: %d", 
		runtime.GOOS, runtime.GOARCH, runtime.NumCPU())
}

// Initialize เริ่มต้นระบบทั้งหมดเสร็จสิ้นภายในฟังก์ชันเดียว
func Initialize() {
	if err := InitLogging(); err != nil {
		log.Printf("[Warning] Cannot initialize file logging: %v. Falling back to stdout.", err)
		Logger = log.New(os.Stdout, "", log.Ldate|log.Ltime|log.Lshortfile)
	}

	SetupEnvironmentVariables()
	Logger.Println("[Init] Core Application initialization completed successfully.")
}

// StartLongRunningPython หากต้องการรัน Python Server (FastAPI server.py) ทิ้งไว้แบบยาวๆ สามารถสั่งผ่านฟังก์ชันนี้ได้
func StartLongRunningPython(ctx context.Context, config PythonConfig) (*exec.Cmd, error) {
	Logger.Printf("[Subprocess] Preparing to spin up long-running Python server: %s", config.ScriptPath)

	if _, err := os.Stat(config.ScriptPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("python target script not found at path: %s", config.ScriptPath)
	}

	cmd := exec.CommandContext(ctx, config.PythonPath, config.ScriptPath)
	cmd.Dir = filepath.Dir(config.ScriptPath)
	cmd.Env = append(os.Environ(),
		"PYTHONUNBUFFERED=1",
		"PYTORCH_ENABLE_MPS_FALLBACK=1",
	)

	// ซ่อนหน้าต่างดำคอมมานด์ไลน์บนระบบปฏิบัติการ Windows ไม่ให้รบกวนผู้ใช้
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	// ส่ง Log จาก Python Server เข้าไปเก็บบันทึกในท่อส่งหลักของ Go ทันทีแบบ Async
	go func() { _, _ = io.Copy(Logger.Writer(), stdoutPipe) }()
	go func() { _, _ = io.Copy(Logger.Writer(), stderrPipe) }()

	Logger.Printf("[Subprocess] Python server is online with Process ID (PID): %d", cmd.Process.Pid)
	return cmd, nil
}

// Cleanup เคลียร์ไฟล์และโปรเซสตกค้างทั้งหมดก่อนแอปพลิเคชันปิดตัวลงแบบ Graceful Shutdown
func Cleanup(pythonServerCmd *exec.Cmd) {
	Logger.Println("[Shutdown] Initiating application graceful shutdown procedures...")

	// 1. ตรวจสอบและปิดการทำงานของ Python Server เบื้องหลัง (หากเปิดทิ้งไว้)
	if pythonServerCmd != nil && pythonServerCmd.Process != nil {
		Logger.Printf("[Shutdown] Stopping background Python server process (PID: %d)...", pythonServerCmd.Process.Pid)
		
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

	// 2. ทำการปิด File Handle ของไฟล์ Log เพื่อไม่ให้ไฟล์เสียงหายหรือ Lock ดิสก์ค้างไว้
	if logFileHandle != nil {
		Logger.Println("[Shutdown] Standard file logging session finalized. Goodbye.")
		_ = logFileHandle.Close()
	}
}