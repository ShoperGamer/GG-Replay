package main

import (
	"log"
	"os/exec"
	"strings"
)

type DeviceInfo struct {
	HasCUDA bool
	HasMPS  bool
	Device  string
}

func DetectDevices(pythonPath string) DeviceInfo {
	info := DeviceInfo{
		HasCUDA: false,
		HasMPS:  false,
		Device:  "cpu",
	}

	script := `
import sys
try:
    import torch
    has_cuda = torch.cuda.is_available()
    has_mps = hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()
    print(f"{has_cuda}|{has_mps}")
except Exception:
    print("False|False")
`

	cmd := exec.Command(pythonPath, "-c", script)
	output, err := cmd.Output()
	if err != nil {
		log.Printf("[Device Check Warning] Failed to run device check: %v. Defaulting to CPU.", err)
		return info
	}

	parts := strings.Split(strings.TrimSpace(string(output)), "|")
	if len(parts) == 2 {
		info.HasCUDA = parts[0] == "True"
		info.HasMPS = parts[1] == "True"

		if info.HasCUDA {
			info.Device = "cuda"
		} else if info.HasMPS {
			info.Device = "mps"
		}
	}

	log.Printf("[Device Hardware] Checked: CUDA=%v, MPS=%v. Selected Compute Device Engine: -> %s", 
		info.HasCUDA, info.HasMPS, info.Device)
	return info
}