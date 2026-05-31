# -*- coding: utf-8 -*-
"""
GG-Replay: Demucs AI Worker Engine (Clean Version - No Preview Files)
- ✅ ไม่สร้างไฟล์ preview ที่ไม่จำเป็น
- ✅ Cleanup intermediate files อัตโนมัติ
- ✅ เหลือเฉพาะ stems หลัก (vocals/drums/bass/other)
"""
import argparse
import json
import logging
import os
import sys
import shutil
import traceback
import subprocess
import numpy as np

# =====================================================================
# 🎯 ป้องกัน Local Directory Shadowing
# =====================================================================
current_dir = os.path.dirname(os.path.abspath(__file__))
while current_dir in sys.path:
    sys.path.remove(current_dir)
while "" in sys.path:
    sys.path.remove("")

import torch
import torchaudio
from demucs.apply import apply_model
from demucs.pretrained import get_model

sys.path.append(current_dir)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def emit_progress(status: str, message: str, progress: float = 0, stems: dict = None):
    """ส่งสถานะกลับไปหา Go UI"""
    data = {"status": status, "message": message, "progress": progress}
    if stems:
        data["stems"] = stems
    print(json.dumps(data, ensure_ascii=False), flush=True)


def setup_device(device_pref: str):
    """เลือก device สำหรับประมวลผล"""
    device_pref = str(device_pref).lower()
    if ("cuda" in device_pref or "gpu" in device_pref) and torch.cuda.is_available():
        device = "cuda"
        logger.info(f"🚀 [Demucs Core] GPU: {torch.cuda.get_device_name(0)}")
    elif "mps" in device_pref and hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = "mps"
        logger.info("[Demucs Core] Apple Silicon MPS")
    else:
        device = "cpu"
        logger.info("[Demucs Core] CPU Mode")
    return device


def robust_load_audio(file_path, target_sr):
    """ถอดรหัสไฟล์ผ่าน FFmpeg"""
    try:
        cmd = [
            "ffmpeg", "-nostdin", "-y", "-i", file_path,
            "-f", "f32le", "-acodec", "pcm_f32le",
            "-ac", "2", "-ar", str(target_sr), "-"
        ]
        creationflags = 0x08000000 if os.name == 'nt' else 0
        res = subprocess.run(cmd, capture_output=True, creationflags=creationflags)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg Error: {res.stderr.decode('utf-8', errors='ignore')}")
        
        audio_flat = np.frombuffer(res.stdout, dtype=np.float32).copy()
        if len(audio_flat) == 0:
            raise ValueError("FFmpeg returned empty audio stream.")
        
        audio_reshaped = audio_flat.reshape(-1, 2).T
        return torch.from_numpy(audio_reshaped).float()
    
    except Exception as e:
        logger.warning(f"FFmpeg failed: {e}. Trying torchaudio...")
        wav, sr = torchaudio.load(file_path)
        if sr != target_sr:
            wav = torchaudio.transforms.Resample(sr, target_sr)(wav)
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        return wav[:2]


def cleanup_intermediate_files(output_dir: str, keep_files: list):
    """
    🧹 ลบไฟล์และโฟลเดอร์ที่ไม่ต้องการออกจาก output directory
    เหลือเฉพาะ stems หลัก (vocals.wav, drums.wav, bass.wav, other.wav, etc.)
    """
    try:
        for item in os.listdir(output_dir):
            item_path = os.path.join(output_dir, item)
            
            # ลบโฟลเดอร์ UVR intermediate ทั้งหมด
            if os.path.isdir(item_path):
                # ลบโฟลเดอร์ที่ขึ้นต้นด้วย UVRMDXNET หรือโฟลเดอร์ย่อยอื่นๆ
                if item.startswith("UVRMDXNET") or item.startswith("UVR-"):
                    shutil.rmtree(item_path, ignore_errors=True)
                    logger.info(f"🧹 Removed intermediate folder: {item}")
                continue
            
            # ลบไฟล์ที่ไม่อยู่ใน keep_files list
            if item not in keep_files:
                # ลบ preview files, temporary files
                if any(x in item.lower() for x in ["preview", "temp", "cache", "karaoke", "main_"]):
                    os.remove(item_path)
                    logger.info(f"🧹 Removed temp file: {item}")
    except Exception as e:
        logger.warning(f"Cleanup warning: {e}")


def separate_with_demucs(config: dict):
    job_id = config["job_id"]
    source_path = config["source_audio_path"]
    model_name = config.get("model", "htdemucs_ft")
    device_pref = config.get("device", "cpu")
    output_dir = config["output_directory"]
    
    emit_progress("processing", "กำลังดึงข้อมูลโครงสร้างโมเดล...", 10)
    device = setup_device(device_pref)
    
    # Dynamic Model Fallback
    valid_demucs_models = ["htdemucs", "htdemucs_ft", "htdemucs_6s", "hdemucs_mmi", "demucs", "demucs_extra"]
    if model_name not in valid_demucs_models:
        logger.warning(f"⚠️ Unknown model '{model_name}', fallback to 'htdemucs_ft'")
        model_name = "htdemucs_ft"
    
    try:
        logger.info(f"Loading Demucs: {model_name}")
        model = get_model(model_name)
        model.to(device)
        model.eval()
    except Exception as e:
        emit_progress("errored", f"ล้มเหลวในการโหลดโมเดล: {e}")
        raise
    
    emit_progress("processing", "ถอดรหัสไฟล์เสียง...", 25)
    try:
        samplerate = model.samplerate
        wav = robust_load_audio(source_path, samplerate).to(device)
    except Exception as e:
        emit_progress("errored", f"ไม่สามารถเปิดไฟล์ได้: {e}")
        raise
    
    emit_progress("processing", "กำลังแยกเสียง...", 50)
    try:
        ref = wav.mean(0)
        wav_normalized = (wav - ref.mean()) / ref.std()
        
        sources = apply_model(
            model, wav_normalized[None],
            device=device, progress=False,
            overlap=0.25, split=True
        )
        emit_progress("processing", "กำลังบันทึกไฟล์ stems...", 85)
        
        sources = sources * ref.std() + ref.mean()
        sources = sources[0]
    
    except torch.cuda.OutOfMemoryError:
        emit_progress("errored", "VRAM เต็ม! กรุณาใช้ CPU แทน")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise
    except Exception as e:
        emit_progress("errored", f"กระบวนการแครช: {e}")
        traceback.print_exc()
        raise
    
    os.makedirs(output_dir, exist_ok=True)
    stems = {}
    stem_names = model.sources
    keep_files = []  # 🎯 เก็บรายการไฟล์ที่จะไม่ลบ
    
    for i, stem_name in enumerate(stem_names):
        stem_filename = f"{stem_name}.wav"
        stem_path = os.path.join(output_dir, stem_filename)
        try:
            stem_tensor = sources[i].cpu()
            max_val = stem_tensor.abs().max()
            if max_val > 1.0:
                stem_tensor = stem_tensor / max_val
            
            torchaudio.save(stem_path, stem_tensor, samplerate)
            stems[stem_name] = os.path.abspath(stem_path)
            keep_files.append(stem_filename)  # ✅ เก็บไว้ใน keep list
            logger.info(f"✅ Exported: {stem_path}")
            
            progress_step = 85 + (i + 1) * (14 / len(stem_names))
            emit_progress("processing", f"กำลังบันทึก: {stem_name}...", progress_step)
        except Exception as e:
            logger.error(f"Failed to write '{stem_name}': {e}")
    
    # =================================================================================
    # 🔥 [VOCAL CASCADE]: กรองเสียงร้องหลักบริสุทธิ์ (แต่ลบ intermediate files ทิ้ง)
    # =================================================================================
    if "vocals" in stems and os.path.exists(stems["vocals"]):
        vocal_path = stems["vocals"]
        emit_progress("processing", "กำลังกรองเสียงร้องหลัก...", 95)
        try:
            from inference.stemmer import Stemmer
            
            base_p_dir = os.path.abspath(os.path.join(current_dir, ".."))
            weights_dir = os.path.join(base_p_dir, "data", "models")
            
            # Pass 1: Karaoke 2 (ลบ backing vocals)
            Stemmer.separate_track(
                source_audio_path=vocal_path,
                output_directory=os.path.dirname(vocal_path),
                weights_dir=weights_dir,
                model_name="UVR-MDX-NET Karaoke 2",
                device=device_pref
            )
            k_res = os.path.join(os.path.dirname(vocal_path), "UVRMDXNETKaraoke2", "vocals", "vocals.wav")
            
            if os.path.exists(k_res):
                # Pass 2: Main (ลบ overlapping duet)
                Stemmer.separate_track(
                    source_audio_path=k_res,
                    output_directory=os.path.dirname(vocal_path),
                    weights_dir=weights_dir,
                    model_name="UVR-MDX-NET Main",
                    device=device_pref
                )
                m_res = os.path.join(os.path.dirname(vocal_path), "UVRMDXNETMain", "vocals", "vocals.wav")
                if os.path.exists(m_res):
                    shutil.copy2(m_res, vocal_path)
                    logger.info("=== [Cascade]: Lead Vocal Cleaned ===")
        except Exception as cascade_err:
            logger.error(f"Cascade error: {cascade_err}")
    
    # 🧹 Cleanup intermediate files ก่อนจบ
    logger.info(f"🧹 Cleaning up intermediate files in {output_dir}...")
    cleanup_intermediate_files(output_dir, keep_files)
    
    # ✅ ส่งเฉพาะไฟล์ stems ที่เก็บไว้เท่านั้น
    emit_progress("completed", "แยกเสียงเสร็จสมบูรณ์!", 100, stems=stems)
    
    if device == "cuda":
        torch.cuda.empty_cache()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    
    with open(args.config, "r", encoding="utf-8") as f:
        config = json.load(f)
    
    logger.info("=== GG-Replay Demucs Worker Started ===")
    try:
        separate_with_demucs(config)
    except Exception as e:
        logger.error(f"Pipeline Error: {e}")
        emit_progress("errored", f"Crash: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()