# -*- coding: utf-8 -*-
"""
GG-Replay: Subprocess Task Runner Entry Point
- รองรับทั้ง Development และ Production (PyInstaller)
- Auto-download models ที่จำเป็น
- JSON bridge สำหรับสื่อสารกับ Go backend
"""

import argparse
import json
import os
import sys
import logging
import traceback
from pathlib import Path
from typing import Optional, Dict, Any

# =====================================================================
# Path Management (รองรับ PyInstaller)
# =====================================================================

def get_base_dir() -> Path:
    """คืนค่า base directory (รองรับทั้ง dev และ PyInstaller)"""
    if getattr(sys, 'frozen', False):
        # รันจาก PyInstaller executable
        return Path(sys.executable).parent
    else:
        # Development mode
        return Path(__file__).parent.parent

def get_python_dir() -> Path:
    """คืนค่า python directory"""
    if getattr(sys, 'frozen', False):
        # PyInstaller - python code ถูก bundle ไว้ใน _MEIPASS
        return Path(sys._MEIPASS)
    else:
        return Path(__file__).parent

def setup_paths():
    """Setup sys.path สำหรับ imports"""
    python_dir = get_python_dir()
    base_dir = get_base_dir()
    
    # เพิ่ม paths ที่จำเป็น
    paths_to_add = [
        str(python_dir),
        str(python_dir / "lib"),
        str(base_dir),
    ]
    
    for p in paths_to_add:
        if os.path.exists(p) and p not in sys.path:
            sys.path.insert(0, p)

setup_paths()

# =====================================================================
# Logging Setup
# =====================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# =====================================================================
# Progress Reporting (JSON Bridge to Go)
# =====================================================================

def emit_progress(status: str, progress: float = 0.0, message: str = "", stage: str = "general"):
    """ส่ง progress กลับไปหา Go ผ่าน stdout JSON bridge"""
    progress_data = {
        "status": status,
        "progress": round(progress, 2),
        "message": message,
        "stage": stage
    }
    print(f"PROGRESS_JSON:{json.dumps(progress_data, ensure_ascii=False)}", flush=True)

def emit_error(message: str):
    """ส่ง error กลับไปหา Go"""
    emit_progress("errored", 0.0, message, "error")

# =====================================================================
# Safe Dictionary Access
# =====================================================================

def _safe_get(data: Dict, *keys, default: str = "") -> str:
    """ดึงค่าจาก dict โดยไม่สับสนระหว่าง empty string กับ None"""
    for key in keys:
        if key in data and data[key] is not None and str(data[key]).strip() != "":
            return str(data[key]).strip()
    return default

# =====================================================================
# Model Management
# =====================================================================

REQUIRED_MODELS = {
    "hubert_base.pt": {
        "url": "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt",
        "size_mb": 190,
        "required": True,
    },
    "rmvpe.pt": {
        "url": "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt",
        "size_mb": 180,
        "required": True,
    },
    "rmvpe.onnx": {
        "url": "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.onnx",
        "size_mb": 180,
        "required": False,
    },
}

def get_models_dir() -> Path:
    """คืนค่า path ของโฟลเดอร์ models"""
    base_dir = get_base_dir()
    models_dir = base_dir / "data" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    return models_dir

def check_models() -> list:
    """ตรวจสอบ models ที่ขาด"""
    models_dir = get_models_dir()
    missing = []
    
    for name, info in REQUIRED_MODELS.items():
        model_path = models_dir / name
        if not model_path.exists():
            missing.append((name, info))
            logger.warning(f"Missing model: {name} ({info['size_mb']} MB)")
        else:
            logger.info(f"Found model: {name}")
    
    return missing

def download_model(url: str, dest_path: Path, filename: str, total_size_mb: int) -> bool:
    """ดาวน์โหลด model พร้อมแสดง progress"""
    try:
        import urllib.request
        
        emit_progress("downloading", 0.0, f"Downloading {filename}...", "download")
        
        def progress_hook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = min(100, (downloaded / total_size) * 100)
                if int(percent) % 10 == 0:
                    emit_progress(
                        "downloading", 
                        percent, 
                        f"Downloading {filename}: {int(percent)}%",
                        "download"
                    )
        
        temp_path = dest_path.with_suffix('.tmp')
        urllib.request.urlretrieve(url, temp_path, reporthook=progress_hook)
        
        # ย้ายไฟล์ชั่วคราวเป็นไฟล์จริง
        temp_path.rename(dest_path)
        
        emit_progress("downloading", 100.0, f"Downloaded {filename}", "download")
        logger.info(f"✓ Downloaded: {filename}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to download {filename}: {e}")
        emit_error(f"Download failed: {filename} - {str(e)}")
        return False

def ensure_models() -> bool:
    """ตรวจสอบและดาวน์โหลด models ที่ขาด"""
    emit_progress("checking", 0.0, "Checking AI models...", "init")
    
    missing = check_models()
    
    if not missing:
        logger.info("All required models are present.")
        emit_progress("ready", 100.0, "All models ready", "init")
        return True
    
    # ดาวน์โหลดเฉพาะ required models
    required_missing = [(name, info) for name, info in missing if info.get('required', True)]
    
    if not required_missing:
        logger.info("No required models missing.")
        return True
    
    models_dir = get_models_dir()
    emit_progress(
        "downloading", 
        0.0, 
        f"Downloading {len(required_missing)} required model(s)...",
        "download"
    )
    
    for i, (name, info) in enumerate(required_missing):
        dest_path = models_dir / name
        logger.info(f"Downloading {name} ({info['size_mb']} MB)...")
        
        success = download_model(
            info['url'], 
            dest_path, 
            name, 
            info['size_mb']
        )
        
        if not success:
            return False
    
    emit_progress("ready", 100.0, "All required models downloaded", "init")
    return True

# =====================================================================
# Main Inference Logic
# =====================================================================

def run_inference(config: Dict[str, Any], job_id: str) -> bool:
    """รัน inference pipeline"""
    try:
        # Import inference modules (หลังจาก setup paths แล้ว)
        from inference.api_models import CreateSongOptions
        from inference.inference_manager import InferenceManager
        
        emit_progress("initializing", 5.0, "Loading inference engine...", "init")
        
        # Parse device setting
        opt_data = config.get("options") or {}
        device_setting = (
            (opt_data.get("device") if isinstance(opt_data, dict) else None)
            or config.get("device")
            or os.environ.get("PYTORCH_DEVICE", "cpu")
        )
        logger.info(f"Device setting: {device_setting}")
        
        # Parse options
        if isinstance(opt_data, dict):
            options = CreateSongOptions(
                outputName=opt_data.get("outputName", "converted_vocals"),
                pitch=opt_data.get("pitch", 0),
                instrumentalsPitch=opt_data.get("instrumentalsPitch", 0),
                preStemmed=opt_data.get("preStemmed", False),
                vocalsOnly=opt_data.get("vocalsOnly", False),
                sampleMode=opt_data.get("sampleMode", False),
                sampleModeStartTime=opt_data.get("sampleModeStartTime", 0),
                stemmingMethod=opt_data.get("stemmingMethod", "UVR-MDX-NET Voc FT"),
                f0Method=opt_data.get("f0Method", "rmvpe"),
                outputFormat=opt_data.get("outputFormat", "mp3_320k"),
                deEchoDeReverb=opt_data.get("deEchoDeReverb", False),
                indexRatio=opt_data.get("indexRatio", 0.75),
                consonantProtection=opt_data.get("consonantProtection", 0.35),
                device=device_setting,
                gpu=opt_data.get("gpu"),
            )
        else:
            options = opt_data
        
        emit_progress("initializing", 10.0, "Parsing job parameters...", "init")
        
        # Extract paths (ใช้ _safe_get เพื่อป้องกัน None)
        base_dir = get_base_dir()
        default_models = str(base_dir / "data" / "models")
        default_outputs = str(base_dir / "data" / "outputs")
        
        audio_path = _safe_get(
            config,
            "source_audio_path", "sourceAudioPath",
            "songUrlOrFilePath", "audio_path"
        )
        model_name = _safe_get(config, "model_name", "modelName", "modelId")
        models_path = _safe_get(
            config,
            "models_path", "modelsPath",
            default=default_models
        )
        weights_path = _safe_get(
            config,
            "weights_path", "weightsPath",
            default=models_path
        )
        output_dir = _safe_get(
            config,
            "output_directory", "outputDirectory",
            default=default_outputs
        )
        
        # Validation
        required = {
            "audio_path": audio_path,
            "model_name": model_name,
            "models_path": models_path,
            "weights_path": weights_path,
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            err_msg = f"Missing required fields: {', '.join(missing)}"
            logger.error(f"❌ {err_msg}")
            emit_error(err_msg)
            return False
        
        logger.info(f"🎵 Audio Path: {audio_path}")
        logger.info(f"🎵 Model Name: {model_name}")
        logger.info(f"🎵 Models Path: {models_path}")
        logger.info(f"🎵 Output Dir: {output_dir}")
        
        # สร้าง output directory ถ้ายังไม่มี
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        emit_progress("processing", 15.0, "Initializing inference manager...", "process")
        
        # Initialize InferenceManager
        manager = InferenceManager(
            model_name=model_name,
            models_path=models_path,
            weights_path=weights_path,
            source_audio_path=audio_path,
            output_directory=output_dir,
            options=options,
            job_id=job_id,
        )
        logger.info("✅ InferenceManager initialized")
        
        emit_progress("processing", 20.0, "Starting inference pipeline...", "process")
        
        # Run inference
        manager.infer()
        logger.info("✅ Pipeline completed")
        
        emit_progress("completed", 100.0, "Inference completed successfully!", "complete")
        return True
        
    except ImportError as e:
        err_msg = f"Import error: {str(e)}. Make sure all dependencies are installed."
        logger.error(err_msg)
        traceback.print_exc()
        emit_error(err_msg)
        return False
        
    except Exception as e:
        err_msg = f"Inference failed: {str(e)}"
        logger.error(err_msg)
        traceback.print_exc()
        emit_error(err_msg)
        return False

# =====================================================================
# Main Entry Point
# =====================================================================

def main():
    parser = argparse.ArgumentParser(description="GG-Replay RVC Task Orchestrator")
    parser.add_argument("--config", required=True, help="Path to JSON config")
    parser.add_argument("--job_id", required=True, help="Job ID")
    args = parser.parse_args()
    
    logger.info(f"=== GG-Replay RVC Task Engine Booting: {args.job_id} ===")
    logger.info(f"📍 Base Dir: {get_base_dir()}")
    logger.info(f"📍 Python Dir: {get_python_dir()}")
    logger.info(f"📍 Frozen: {getattr(sys, 'frozen', False)}")
    
    # ตรวจสอบและดาวน์โหลด models
    if not ensure_models():
        logger.error("❌ Failed to ensure required models")
        sys.exit(1)
    
    # Load JSON config
    try:
        with open(args.config, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        emit_error(f"Config load error: {str(e)}")
        sys.exit(1)
    
    logger.info(f"📦 Raw config keys: {list(config.keys())}")
    
    # Run inference
    success = run_inference(config, args.job_id)
    
    if not success:
        sys.exit(1)
    
    logger.info(f"=== Job {args.job_id} completed successfully ===")
    sys.exit(0)

if __name__ == "__main__":
    main()