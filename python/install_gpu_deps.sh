#!/bin/bash
set -e  # หยุดทำงานทันทีถ้ามี error

echo "========================================"
echo "GG-Replay: Installing GPU Dependencies"
echo "PyTorch + ONNX Runtime GPU"
echo "========================================"
echo ""

# ตรวจสอบ OS
OS="$(uname -s)"
case "$OS" in
    Linux*)     PLATFORM="linux";;
    Darwin*)    PLATFORM="macos";;
    *)          echo "❌ Unsupported OS: $OS"; exit 1;;
esac

echo "🔍 Detected platform: $PLATFORM"
echo ""

# ตรวจสอบ CUDA (เฉพาะ Linux)
if [ "$PLATFORM" = "linux" ]; then
    if command -v nvidia-smi &> /dev/null; then
        echo "✅ NVIDIA GPU detected:"
        nvidia-smi --query-gpu=name --format=csv,noheader
        echo ""
        CUDA_AVAILABLE=true
    else
        echo "⚠️  No NVIDIA GPU detected - will install CPU version"
        CUDA_AVAILABLE=false
    fi
fi

# macOS - ไม่มี CUDA
if [ "$PLATFORM" = "macos" ]; then
    echo "🍎 macOS detected - using MPS (Metal Performance Shaders)"
    echo "⚠️  Note: macOS does not support CUDA"
    CUDA_AVAILABLE=false
fi

echo ""
echo "[1/3] Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo ""
echo "[2/3] Installing PyTorch..."

if [ "$PLATFORM" = "linux" ] && [ "$CUDA_AVAILABLE" = true ]; then
    echo "🚀 Installing PyTorch with CUDA 12.1..."
    pip install torch==2.5.1 torchaudio==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121
else
    echo "💻 Installing PyTorch (CPU/MPS version)..."
    pip install torch==2.5.1 torchaudio==2.5.1 torchvision==0.20.1
fi

echo ""
echo "[3/3] Installing other dependencies..."

# ติดตั้ง ONNX Runtime (GPU เฉพาะ Linux ที่มี CUDA)
if [ "$PLATFORM" = "linux" ] && [ "$CUDA_AVAILABLE" = true ]; then
    echo "🚀 Installing ONNX Runtime GPU..."
    pip install onnxruntime-gpu==1.23.2 --extra-index-url https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/
else
    echo "💻 Installing ONNX Runtime (CPU version)..."
    pip install onnxruntime==1.23.2
fi

# ติดตั้ง dependencies อื่นๆ
pip install -r requirements.txt

echo ""
echo "========================================"
echo "✅ Installation Complete!"
echo "========================================"
echo ""
echo "Verifying installation..."
echo ""

# ตรวจสอบ PyTorch
python3 -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'CUDA version: {torch.version.cuda}')
    print(f'GPU: {torch.cuda.get_device_name(0)}')
elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
    print('MPS (Apple Silicon): Available')
else:
    print('Device: CPU')
"

echo ""

# ตรวจสอบ ONNX Runtime
python3 -c "
import onnxruntime as ort
print(f'ONNX Runtime: {ort.__version__}')
print(f'Providers: {ort.get_available_providers()}')
"

echo ""
echo "🎉 Done! Activate virtual environment with:"
echo "   source venv/bin/activate"
echo ""