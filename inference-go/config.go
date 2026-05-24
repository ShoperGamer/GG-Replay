package inference

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type HardwareConfig struct {
	Device       string   `json:"device"`
	IsHalf       bool     `json:"is_half"`
	ORTProviders []string `json:"ort_providers"`
}

type Settings struct {
	Device string `json:"device"`
}

type ConfigManager struct {
	mu       sync.RWMutex
	settings Settings
}

func NewConfigManager() *ConfigManager {
	return &ConfigManager{settings: Settings{Device: "cpu"}}
}

func (cm *ConfigManager) LoadSettings(baseDir string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	settingsPaths := []string{
		filepath.Join(baseDir, "..", "data", "settings.json"),
		filepath.Join(baseDir, "data", "settings.json"),
	}

	for _, path := range settingsPaths {
		absPath, _ := filepath.Abs(path)
		if data, err := os.ReadFile(absPath); err == nil {
			var settings Settings
			if json.Unmarshal(data, &settings) == nil {
				cm.settings = settings
				return nil
			}
		}
	}
	return nil
}

func (cm *ConfigManager) GetDevice() string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.settings.Device
}

// SyncHardwareConfig ประมวลผลและล็อก HardwareConfig จาก Options หรือ settings.json
func SyncHardwareConfig(options *CreateSongOptions, configMgr *ConfigManager, baseDir string, logger *log.Logger) HardwareConfig {
	targetDevice := ""

	if options != nil {
		if options.Device != "" {
			targetDevice = strings.ToLower(options.Device)
		} else if options.GPU != nil {
			if *options.GPU {
				targetDevice = "cuda"
			} else {
				targetDevice = "cpu"
			}
		}
	}

	if targetDevice == "" {
		configMgr.LoadSettings(baseDir)
		if d := configMgr.GetDevice(); d != "" {
			targetDevice = strings.ToLower(d)
		}
	}

	if targetDevice == "" {
		targetDevice = "cpu"
	}

	config := HardwareConfig{
		Device:       "cpu",
		IsHalf:       false,
		ORTProviders: []string{"CPUExecutionProvider"},
	}

	if strings.Contains(targetDevice, "cuda") || strings.Contains(targetDevice, "gpu") {
		config.Device = "cuda"
		config.IsHalf = true
		config.ORTProviders = []string{"CUDAExecutionProvider", "CPUExecutionProvider"}
		logger.Println("[Hardware Sync] LOCKED to GPU (CUDA)")
	} else if strings.Contains(targetDevice, "mps") {
		config.Device = "mps"
		config.ORTProviders = []string{"CoreMLExecutionProvider", "CPUExecutionProvider"}
		logger.Println("[Hardware Sync] LOCKED to Apple Silicon (MPS)")
	} else {
		logger.Println("[Hardware Sync] LOCKED to CPU")
	}

	return config
}