package inference

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type PythonWorkerConfig struct {
	JobId           string             `json:"job_id"`
	ModelName       string             `json:"model_name"`
	ModelsPath      string             `json:"models_path"`
	WeightsPath     string             `json:"weights_path"`
	SourceAudioPath string             `json:"source_audio_path"`
	OutputDirectory string             `json:"output_directory"`
	Options         *CreateSongOptions `json:"options,omitempty"`
	Device          string             `json:"device"`
	IsHalf          bool               `json:"is_half"`
	ORTProviders    []string           `json:"ort_providers"`
}

type PythonBridge struct {
	pythonPath string
	pythonDir  string
	logger     *log.Logger
}

func NewPythonBridge(pythonPath, pythonDir string, logger *log.Logger) *PythonBridge {
	return &PythonBridge{pythonPath: pythonPath, pythonDir: pythonDir, logger: logger}
}

func (pb *PythonBridge) RunInference(ctx context.Context, config PythonWorkerConfig, onProgress func(JobProgressResp)) error {
	pb.logger.Printf("============================================================")
	pb.logger.Printf("🚀 [Python Bridge] Preparing subprocess call")
	pb.logger.Printf("   JobId: %s", config.JobId)
	pb.logger.Printf("   ModelName: %s", config.ModelName)
	pb.logger.Printf("   ModelsPath: %s", config.ModelsPath)
	pb.logger.Printf("   WeightsPath: %s", config.WeightsPath)
	pb.logger.Printf("   SourceAudio: %s", config.SourceAudioPath)
	pb.logger.Printf("   OutputDir: %s", config.OutputDirectory)
	pb.logger.Printf("   Device: %s | IsHalf: %v", config.Device, config.IsHalf)
	pb.logger.Printf("============================================================")

	configFile, err := pb.createConfigFile(config)
	if err != nil {
		return fmt.Errorf("config file creation failed: %w", err)
	}
	defer os.Remove(configFile)

	args := []string{"run_job.py", "--config", configFile, "--job_id", config.JobId}
	cmd := exec.CommandContext(ctx, pb.pythonPath, args...)
	cmd.Dir = pb.pythonDir
	cmd.Env = append(os.Environ(),
		"PYTHONUNBUFFERED=1",
		fmt.Sprintf("PYTORCH_DEVICE=%s", config.Device),
	)

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("subprocess start failed: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "PROGRESS_JSON:") {
				jsonStr := strings.TrimPrefix(line, "PROGRESS_JSON:")
				var progress JobProgressResp
				if err := json.Unmarshal([]byte(jsonStr), &progress); err == nil {
					if onProgress != nil {
						onProgress(progress)
					}
				} else {
					pb.logger.Printf("[JSON Parse Err] %v | line: %s", err, jsonStr)
				}
			} else {
				pb.logger.Printf("[Python OUT] %s", line)
			}
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			pb.logger.Printf("[Python ERR] %s", scanner.Text())
		}
	}()

	return cmd.Wait()
}

func (pb *PythonBridge) createConfigFile(config PythonWorkerConfig) (string, error) {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return "", err
	}
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("job_%s.json", config.JobId))
	return tmpFile, os.WriteFile(tmpFile, data, 0644)
}