# -*- coding: utf-8 -*-
"""
GG-Replay: Subprocess Task Runner Entry Point
แก้ไข: NoneType ใน os.path.join() ด้วย _safe_get() + validation
"""
import argparse
import json
import os
import sys
import logging
import traceback

# =====================================================================
# 🎯 [CRITICAL FIX]: sys.path Injection
# =====================================================================
current_dir = os.path.dirname(os.path.abspath(__file__))
python_root = current_dir
lib_root = os.path.join(python_root, "lib")

for _p in [python_root, lib_root]:
    if os.path.exists(_p) and _p not in sys.path:
        sys.path.insert(0, _p)
# =====================================================================

from inference.api_models import CreateSongOptions
from inference.inference_manager import InferenceManager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def _safe_get(data, *keys, default=""):
    """ดึงค่าจาก dict โดยไม่สับสนระหว่าง empty string กับ None"""
    for key in keys:
        if key in data and data[key] is not None and str(data[key]).strip() != "":
            return str(data[key]).strip()
    return default


def _emit_error(message: str):
    """ส่ง error กลับไปหา Go ผ่าน stdout JSON bridge"""
    err_resp = {"status": "errored", "message": message}
    print(f"PROGRESS_JSON:{json.dumps(err_resp, ensure_ascii=False)}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="GG-Replay RVC Task Orchestrator")
    parser.add_argument("--config", required=True, help="Path to JSON config")
    parser.add_argument("--job_id", required=True, help="Job ID")
    args = parser.parse_args()

    logger.info(f"=== GG-Replay RVC Task Engine Booting: {args.job_id} ===")
    logger.info(f"📍 Python Root: {python_root}")
    logger.info(f"📍 Lib Root: {lib_root}")

    # Load JSON config
    try:
        with open(args.config, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        _emit_error(f"Config load error: {str(e)}")
        sys.exit(1)

    logger.info(f"📦 Raw config keys: {list(data.keys())}")

    opt_data = data.get("options") or {}

    # Device setting
    device_setting = (
        (opt_data.get("device") if isinstance(opt_data, dict) else None)
        or data.get("device")
        or os.environ.get("PYTORCH_DEVICE", "cpu")
    )
    logger.info(f"🎯 Device setting: {device_setting}")

    # Parse options
    try:
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
        logger.info(f"✅ Options parsed: device={getattr(options, 'device', device_setting)}")
    except Exception as pydantic_err:
        logger.error(f"Pydantic validation failed: {pydantic_err}")
        _emit_error(f"Schema Error: {str(pydantic_err)}")
        sys.exit(1)

    # 🎯 [CORE FIX]: _safe_get ป้องกัน NoneType
    default_models = os.path.join(os.path.dirname(current_dir), "data", "models")
    default_outputs = os.path.join(os.path.dirname(current_dir), "data", "outputs")

    audio_path = _safe_get(data,
        "source_audio_path", "sourceAudioPath",
        "songUrlOrFilePath", "audio_path"
    )
    model_name = _safe_get(data, "model_name", "modelName", "modelId")
    models_path = _safe_get(data,
        "models_path", "modelsPath",
        default=default_models
    )
    weights_path = _safe_get(data,
        "weights_path", "weightsPath",
        default=models_path
    )
    output_dir = _safe_get(data,
        "output_directory", "outputDirectory",
        default=default_outputs
    )
    job_id = _safe_get(data, "job_id", default=args.job_id)

    # 🚨 Validation - ตัดปัญหาตั้งแต่ต้นน้ำ
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
        logger.error(f"   Raw data: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
        _emit_error(err_msg)
        sys.exit(1)

    logger.info(f"🎵 Audio Path: {audio_path}")
    logger.info(f"🎵 Model Name: {model_name}")
    logger.info(f"🎵 Models Path: {models_path}")
    logger.info(f"🎵 Weights Path: {weights_path}")
    logger.info(f"🎵 Output Dir: {output_dir}")

    # Initialize InferenceManager
    try:
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
    except Exception as init_err:
        logger.error(f"Init failed: {init_err}")
        traceback.print_exc()
        _emit_error(f"Init Error: {str(init_err)}")
        sys.exit(1)

    # Run inference
    logger.info("🚀 Starting inference pipeline...")
    try:
        manager.infer()
        logger.info("✅ Pipeline completed")
    except Exception as pipeline_err:
        logger.error(f"Pipeline failed: {pipeline_err}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()