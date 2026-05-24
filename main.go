package main

import (
	"context"
	"embed"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	// ⚠️ เปลี่ยนเป็นชื่อโมดูลให้ตรงตามไฟล์ go.mod ของคุณนะครับ
	"GG-replay/initialization" 
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// 1. เรียกการตั้งค่าล้างระบบ โหลดค่าตัวแปร และผูกระบบบันทึก Log
	initialization.Initialize()

	port := 62362
	if envPort := os.Getenv("REPLAY_PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			port = p
		}
	}

	workers := 1 // ล็อกไว้ที่ 1 เพื่อป้องกันปัญหา VRAM การ์ดจอเอ่อล้น
	pythonPath := findPythonPath()
	pythonDir := findPythonDir()

	initialization.Logger.Println("================================================")
	initialization.Logger.Println("=== Starting GG-Replay Go Orchestration Server =")
	initialization.Logger.Println("================================================")
	initialization.Logger.Printf("[Bootstrap] Platform Host OS Runtime: %s", runtime.GOOS)
	initialization.Logger.Printf("[Bootstrap] Executing Python Target Core: %s", pythonPath)

	// 2. ตรวจสอบฮาร์ดแวร์และการ์ดจอ (CUDA / MPS)
	deviceInfo := DetectDevices(pythonPath)
	
	// 3. เริ่มต้นระบบจัดการคิวงานเบื้องหลัง
	queue := NewJobQueue(workers, pythonPath, pythonDir, deviceInfo)

	// สร้าง Context แยกเพื่อเอาไว้ควบคุมสถานะคิวงานเบื้องหลัง
	queueCtx, queueCancel := context.WithCancel(context.Background())
	defer queueCancel()

	queue.Start(queueCtx)

	// 4. เริ่มต้นทำงาน Web API Server
	server := NewServer(port, queue)

	// รัน HTTP Server แยกเป็น Background Goroutine เพื่อไม่ให้ไปบล็อก Wails Bindings
	go func() {
		if err := server.Start(); err != nil && err != http.ErrServerClosed {
			initialization.Logger.Printf("[Critical Crash] Web API server failed: %v", err)
		}
	}()

	// 5. สร้าง Instance ตัวควบคุม Logic ของ Wails GUI
	app := NewApp()

	// 6. ส่งสิทธิ์ให้ Wails Engine ควบคุม Lifecycle ของระบบแทนคำสั่งบรรทัดคอมมานด์เดิม
	err := wails.Run(&options.App{
		Title:  "GG Replay",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 23, B: 42, A: 1}, 
		
		// เมื่อหน้าต่าง UI โหลดเสร็จสิ้น
		OnStartup: func(ctx context.Context) {
			initialization.Logger.Println("[Wails Runtime] App window UI loaded completely.")
			app.startup(ctx)
		},
		
		// เมื่อผู้ใช้งานกดปิดแอปพลิเคชัน
		OnShutdown: func(ctx context.Context) {
			initialization.Logger.Println("[Wails Runtime] Shutdown trigger activated by user window close.")
			app.shutdown(ctx)
			
			// สั่งปิด HTTP Server แบบนุ่มนวล
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer shutdownCancel()
			if err := server.Shutdown(shutdownCtx); err != nil {
				initialization.Logger.Printf("[Shutdown] Server shutdown warning: %v", err)
			}

			// ปิดเธรดคิวงานทั้งหมด
			queueCancel()
			
			// ล้างไฟล์ Temp และโปรเซส Python ตกค้างทั้งหมดออก
			initialization.Cleanup(nil) 
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		initialization.Logger.Fatalf("[Fatal Error] Wails framework crashed: %v", err)
	}
}

func findPythonPath() string {
	wd, _ := os.Getwd()
	paths := []string{
		filepath.Join(wd, "python", "venv", "Scripts", "python.exe"),
		filepath.Join(wd, "python", "venv", "bin", "python"),
		"python",
		"python3",
	}
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			absPath, _ := filepath.Abs(path)
			return absPath
		}
	}
	return "python"
}

func findPythonDir() string {
	wd, _ := os.Getwd()
	dirs := []string{
		filepath.Join(wd, "python"),
		filepath.Join(wd, "..", "python"),
		"./python",
		".",
	}
	for _, dir := range dirs {
		if _, err := os.Stat(dir); err == nil {
			absDir, _ := filepath.Abs(dir)
			return absDir
		}
	}
	return "./python"
}