package main

import (
	"bytes"
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
}

type App struct {
	ctx          context.Context
	pythonCmd    *exec.Cmd
	pythonPort   string
	pythonApiUrl string
	streamPort   string
	appDataDir   string
}

func NewApp() *App {
	port := "62362"
	streamPort := "62363"
	return &App{
		pythonPort:   port,
		pythonApiUrl: fmt.Sprintf("http://127.0.0.1:%s", port),
		streamPort:   streamPort,
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

	deviceSetting := a.GetDeviceSetting()
	if deviceSetting == "" {
		deviceSetting = "cuda"
	}

	pythonBin := a.findPythonBinary(wd)
	scriptPath := filepath.Join(wd, "python", "server.py")

	a.pythonCmd = exec.Command(pythonBin, scriptPath)
	a.pythonCmd.Dir = filepath.Join(wd, "python")
	
	env := append(os.Environ(), fmt.Sprintf("REPLAY_PORT=%s", a.pythonPort))
	if deviceSetting == "cpu" {
		env = append(env, "CUDA_VISIBLE_DEVICES=")
	}
	a.pythonCmd.Env = env
	
	stdoutPipe, _ := a.pythonCmd.StdoutPipe()
	stderrPipe, _ := a.pythonCmd.StderrPipe()
	go io.Copy(os.Stdout, stdoutPipe)
	go io.Copy(os.Stderr, stderrPipe)

	if runtime.GOOS == "windows" {
		a.pythonCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
	_ = a.pythonCmd.Start()
}

func (a *App) GetDeviceSetting() string {
	p := filepath.Join(a.appDataDir, "settings.json")
	dataBytes, err := os.ReadFile(p)
	if err != nil { return "" }
	var s struct { Device string `json:"device"` }
	json.Unmarshal(dataBytes, &s)
	return s.Device
}

func (a *App) SaveDeviceSetting(device string) bool {
	p := filepath.Join(a.appDataDir, "settings.json")
	s := struct { Device string `json:"device"` }{Device: device}
	data, _ := json.Marshal(s)
	_ = os.WriteFile(p, data, 0644)

	if a.pythonCmd != nil && a.pythonCmd.Process != nil {
		_ = a.pythonCmd.Process.Kill()
	}
	a.freeUpPort(a.pythonPort)
	
	wd, _ := os.Getwd()
	pythonBin := a.findPythonBinary(wd)
	scriptPath := filepath.Join(wd, "python", "server.py")

	a.pythonCmd = exec.Command(pythonBin, scriptPath)
	a.pythonCmd.Dir = filepath.Join(wd, "python")
	env := append(os.Environ(), fmt.Sprintf("REPLAY_PORT=%s", a.pythonPort))
	if device == "cpu" {
		env = append(env, "CUDA_VISIBLE_DEVICES=")
	}
	a.pythonCmd.Env = env

	if runtime.GOOS == "windows" {
		a.pythonCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
	return a.pythonCmd.Start() == nil
}

func (a *App) GetAudioUrl(filename string, folder string) string {
	return fmt.Sprintf("http://127.0.0.1:%s/%s/%s", a.streamPort, folder, filename)
}

func (a *App) GetAudioUrlByFullPath(fullPath string) string {
	filename := filepath.Base(fullPath)
	if strings.Contains(fullPath, "outputs") {
		return fmt.Sprintf("http://127.0.0.1:%s/outputs/%s", a.streamPort, filename)
	}
	return fmt.Sprintf("http://127.0.0.1:%s/uploads/%s", a.streamPort, filename)
}

func (a *App) GetOriginalFiles() []string {
	files, _ := os.ReadDir(filepath.Join(a.appDataDir, "uploads"))
	var list []string
	for _, f := range files {
		if !f.IsDir() {
			ext := strings.ToLower(filepath.Ext(f.Name()))
			if ext == ".mp3" || ext == ".wav" || ext == ".flac" {
				list = append(list, f.Name())
			}
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
				if err == nil {
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
	for _, f := range files {
		if f.IsDir() && f.Name() != "stems" && f.Name() != "originals" && f.Name() != "yt-cache" {
			jobDir := filepath.Join(outputsDir, f.Name())
			subFiles, _ := os.ReadDir(jobDir)
			for _, sf := range subFiles {
				if !sf.IsDir() && (strings.HasPrefix(sf.Name(), "final") || sf.Name() == "converted_vocals.wav") {
					list = append(list, filepath.ToSlash(filepath.Join(f.Name(), sf.Name())))
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
	if category == "uploads" {
		srcFullPath = filepath.Join(a.appDataDir, "uploads", relPath)
	} else if category == "outputs" {
		srcFullPath = filepath.Join(a.appDataDir, "outputs", relPath)
	} else {
		return map[string]string{"error": "หมวดหมู่ไฟล์ไม่ถูกต้อง"}
	}

	defaultName := filepath.Base(relPath)
	ext := filepath.Ext(defaultName)

	file, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title:           "ดาวน์โหลดและเลือกโฟลเดอร์บันทึกไฟล์เสียง",
		DefaultFilename: defaultName,
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Audio File (" + ext + ")", Pattern: "*" + ext},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil || file == "" {
		return map[string]string{"status": "cancelled"}
	}

	err = copyFile(srcFullPath, file)
	if err != nil {
		return map[string]string{"error": err.Error()}
	}
	return map[string]string{"status": "success", "path": file}
}

func (a *App) MergeAudio(vocalPath string, instPath string, vocalVol float64, instVol float64) map[string]string {
	absVocal := vocalPath
	if !filepath.IsAbs(vocalPath) {
		absVocal = filepath.Join(a.appDataDir, "outputs", vocalPath)
		if _, err := os.Stat(absVocal); err != nil {
			absVocal = filepath.Join(a.appDataDir, "uploads", vocalPath)
		}
	}

	absInst := instPath
	if !filepath.IsAbs(instPath) {
		absInst = filepath.Join(a.appDataDir, "outputs", instPath)
		if _, err := os.Stat(absInst); err != nil {
			absInst = filepath.Join(a.appDataDir, "uploads", instPath)
		}
	}

	mixID := fmt.Sprintf("mix_%d", time.Now().Unix())
	outDir := filepath.Join(a.appDataDir, "outputs", mixID)
	_ = os.MkdirAll(outDir, 0755)
	outName := "final_studio_mix.mp3"
	outFullPath := filepath.Join(outDir, outName)

	wd, _ := os.Getwd()
	pythonBin := a.findPythonBinary(wd)

	pyCode := fmt.Sprintf(`
from pydub import AudioSegment
import math
import os

try:
    vocal = AudioSegment.from_file(r"%s")
    inst = AudioSegment.from_file(r"%s")
    
    if %f != 1.0 and %f > 0:
        vocal = vocal + 20 * math.log10(%f)
    if %f != 1.0 and %f > 0:
        inst = inst + 20 * math.log10(%f)

    combined = inst.overlay(vocal)
    combined.export(r"%s", format="mp3", bitrate="320k")
    print("MIX_SUCCESS")
except Exception as e:
    print(f"MIX_ERROR: {e}")
`, absVocal, absInst, vocalVol, vocalVol, vocalVol, instVol, instVol, instVol, outFullPath)

	cmd := exec.Command(pythonBin, "-c", pyCode)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}

	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	err := cmd.Run()
	if err != nil {
		return map[string]string{"status": "error", "message": err.Error() + " " + errBuf.String()}
	}

	resStr := strings.TrimSpace(outBuf.String())
	if strings.HasPrefix(resStr, "MIX_ERROR") || !strings.Contains(resStr, "MIX_SUCCESS") {
		return map[string]string{"status": "error", "message": resStr}
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

func (a *App) SaveFileAs(srcFullPath string, defaultName string) map[string]string {
	file, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		Title: "เลือกโฟลเดอร์สำหรับส่งออกไฟล์เสียง", DefaultFilename: defaultName,
		Filters: []wailsRuntime.FileFilter{{DisplayName: "Audio File (*.mp3)", Pattern: "*.mp3"}},
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
		// แก้ไขค่าเริ่มต้น StemmingMethod ตรงนี้ให้ไม่มีช่องว่าง
		F0Method: "rmvpe", StemmingMethod: "UVR-MDX-NET-Voc_FT", IndexRatio: 0.75,
		ConsonantProtection: 0.35, OutputFormat: "mp3_192k", VolumeEnvelope: 1.0,
	}
}

func (a *App) CreateSong(modelName string, audioName string, opts SongOptions) string {
	payload := map[string]interface{}{
		"modelId": modelName, "modelPath": filepath.Join(a.appDataDir, "models"),
		"weightsPath": filepath.Join(a.appDataDir, "models"), "songUrlOrFilePath": filepath.Join(a.appDataDir, "uploads", audioName),
		"outputDirectory": filepath.Join(a.appDataDir, "outputs"), "options": opts,
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
	defer resp.Body.Close()
	var res map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&res)
	return res
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

func (a *App) shutdown(ctx context.Context) {
	if a.pythonCmd != nil && a.pythonCmd.Process != nil {
		_ = a.pythonCmd.Process.Kill()
	}
}

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