@echo off
echo ========================================
echo GG-Replay: Installing GPU Dependencies
echo CUDA 12.1 + PyTorch + ONNX Runtime GPU
echo ========================================
echo.

echo [1/3] Installing PyTorch with CUDA 12.1...
pip install torch==2.5.1 torchaudio==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121

echo.
echo [2/3] Installing ONNX Runtime GPU (CUDA 12.x)...
pip install onnxruntime-gpu==1.23.2 --extra-index-url https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/

echo.
echo [3/3] Installing other dependencies...
pip install -r requirements.txt

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Verifying CUDA setup...
python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA version: {torch.version.cuda}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"
python -c "import onnxruntime as ort; print(f'ONNX Runtime: {ort.__version__}'); print(f'Providers: {ort.get_available_providers()}')"

echo.
pause