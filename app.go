package main

import (
	"bytes"
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
	"syscall"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx          context.Context
	pythonCmd    *exec.Cmd
	pythonPort   string
	pythonApiUrl string
	appDataDir   string
}

func NewApp() *App {
	port := "62362"
	return &App{
		pythonPort:   port,
		pythonApiUrl: fmt.Sprintf("http://127.0.0.1:%s", port),
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

	a.freeUpPort(a.pythonPort)
	
	pythonBin := "python"
	scriptPath := filepath.Join(wd, "python", "server.py")

	a.pythonCmd = exec.Command(pythonBin, scriptPath)
	a.pythonCmd.Dir = filepath.Join(wd, "python")
	a.pythonCmd.Env = append(os.Environ(), fmt.Sprintf("REPLAY_PORT=%s", a.pythonPort))
	
	stdoutPipe, _ := a.pythonCmd.StdoutPipe()
	stderrPipe, _ := a.pythonCmd.StderrPipe()
	go io.Copy(os.Stdout, stdoutPipe)
	go io.Copy(os.Stderr, stderrPipe)

	if runtime.GOOS == "windows" {
		a.pythonCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
	
	err := a.pythonCmd.Start()
	if err != nil {
		log.Printf("Python Start Error: %v", err)
	}
}

// CreateSong รองรับค่า Pitch และส่งต่อไปยัง Python
func (a *App) CreateSong(modelName string, audioName string, pitch int) string {
	payload := map[string]interface{}{
		"modelId":           modelName,
		"modelPath":         filepath.Join(a.appDataDir, "models"),
		"weightsPath":       filepath.Join(a.appDataDir, "models"),
		"songUrlOrFilePath": filepath.Join(a.appDataDir, "uploads", audioName),
		"outputDirectory":   filepath.Join(a.appDataDir, "outputs"),
		"options": map[string]interface{}{
			"f0Method": "rmvpe",
			"f0UpKey":  pitch, 
		},
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(fmt.Sprintf("%s/create_song", a.pythonApiUrl), "application/json", bytes.NewBuffer(body))
	if err != nil { return "" }
	defer resp.Body.Close()
	var res struct { JobId string `json:"jobId"` }
	json.NewDecoder(resp.Body).Decode(&res)
	return res.JobId
}

func (a *App) GetJobProgress(jobId string) map[string]interface{} {
	payload := map[string]string{"jobId": jobId}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(fmt.Sprintf("%s/song_progress", a.pythonApiUrl), "application/json", bytes.NewBuffer(body))
	if err != nil { return nil }
	var res map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&res)
	return res
}

func (a *App) DeleteModel(name string) bool {
	_ = os.Remove(filepath.Join(a.appDataDir, "models", name))
	return true
}

func (a *App) GetStoredModels() []string {
	files, _ := os.ReadDir(filepath.Join(a.appDataDir, "models"))
	var names []string
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".pth") { names = append(names, f.Name()) }
	}
	return names
}

func (a *App) SelectAndSaveModel() map[string]string {
	file, _ := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "เลือกไฟล์โมเดล (.pth)",
		Filters: []wailsRuntime.FileFilter{{DisplayName: "Model", Pattern: "*.pth"}},
	})
	if file == "" { return nil }
	name := filepath.Base(file)
	dest := filepath.Join(a.appDataDir, "models", name)
	data, _ := os.ReadFile(file)
	_ = os.WriteFile(dest, data, 0644)
	return map[string]string{"name": name, "path": dest}
}

func (a *App) SelectAndSaveAudio() map[string]string {
	file, _ := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "เลือกไฟล์เสียง",
		Filters: []wailsRuntime.FileFilter{{DisplayName: "Audio", Pattern: "*.mp3;*.wav;*.flac"}},
	})
	if file == "" { return nil }
	name := filepath.Base(file)
	dest := filepath.Join(a.appDataDir, "uploads", name)
	data, _ := os.ReadFile(file)
	_ = os.WriteFile(dest, data, 0644)
	return map[string]string{"name": name, "path": dest}
}

func (a *App) freeUpPort(port string) {
	if runtime.GOOS == "windows" {
		_ = exec.Command("cmd", "/c", fmt.Sprintf("for /f \"tokens=5\" %%a in ('netstat -aon ^| findstr :%s') do taskkill /F /PID %%a", port)).Run()
	}
	time.Sleep(1500 * time.Millisecond)
}

func (a *App) shutdown(ctx context.Context) {
	if a.pythonCmd != nil && a.pythonCmd.Process != nil {
		_ = a.pythonCmd.Process.Kill()
	}
}