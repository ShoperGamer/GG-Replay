# -*- coding: utf-8 -*-
"""
GG-Replay: Standalone Demucs AI Worker Engine (Ultimate Production Ready - Final)
คัดแยกเลเยอร์เสียงดนตรี (Stems) รองรับการประมวลผลผ่าน GPU/CPU เต็มรูปแบบ
แก้ไขปัญหา Matrix Shape Mismatch ของ HTDemucs ด้วยการใช้ Auto-Segment Natively
"""
import argparse
import json
import logging
import os
import sys
import traceback
import subprocess
import numpy as np

# =====================================================================
# 🎯 ป้องกันปัญหา Local Directory Shadowing 
# เดินข้ามโฟลเดอร์ซ้ำซ้อนเพื่อดึงแพ็กเกจระบบจาก venv ตัวจริงมาทำงาน
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
    """ ส่งข้อมูลสถานะและเปอร์เซ็นต์ความคืบหน้าตรงไปหาหน้าต่าง UI ของ Go """
    data = {
        "status": status,
        "message": message,
        "progress": progress,
    }
    if stems:
        data["stems"] = stems
    print(json.dumps(data, ensure_ascii=False), flush=True)


def setup_device(device_pref: str):
    """ ล็อกแกนประมวลผลเข้ากับชิปฮาร์ดแวร์ระบบ """
    device_pref = str(device_pref).lower()
    if ("cuda" in device_pref or "gpu" in device_pref) and torch.cuda.is_available():
        device = "cuda"
        logger.info(f"🚀 [Demucs Core] Active Core GPU Acceleration: {torch.cuda.get_device_name(0)}")
    elif "mps" in device_pref and hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = "mps"
        logger.info("[Demucs Core] Active Core Apple Silicon MPS")
    else:
        device = "cpu"
        logger.info("[Demucs Core] Active Core CPU Render Mode (Standard)")
    return device


def robust_load_audio(file_path, target_sr):
    """ ถอดรหัสไฟล์ผ่าน FFmpeg ตรงๆ ออกเป็นสัญญาณคู่ Stereo [2, Samples] """
    try:
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-y",
            "-i", file_path,
            "-f", "f32le",
            "-acodec", "pcm_f32le",
            "-ac", "2",
            "-ar", str(target_sr),
            "-"
        ]
        
        creationflags = 0
        if os.name == 'nt':
            creationflags = 0x08000000  # CREATE_NO_WINDOW ป้องกันหน้าต่างดำเด้ง
            
        res = subprocess.run(cmd, capture_output=True, creationflags=creationflags)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg Error: {res.stderr.decode('utf-8', errors='ignore')}")
            
        # 🎯 [FEATURE FIX]: ใส่ .copy() ท้ายอาเรย์ NumPy เพื่อแก้ปัญหาสิทธิ์การเขียนอ่านพิกัด (Non-writable Tensor Warning)
        audio_flat = np.frombuffer(res.stdout, dtype=np.float32).copy()
        if len(audio_flat) == 0:
            raise ValueError("FFmpeg returned empty audio stream.")
            
        audio_reshaped = audio_flat.reshape(-1, 2).T
        wav_tensor = torch.from_numpy(audio_reshaped).float()
        return wav_tensor
        
    except Exception as e:
        logger.warning(f"FFmpeg Stream Decoder failed: {e}. Trying native torchaudio alternative...")
        wav, sr = torchaudio.load(file_path)
        if sr != target_sr:
            wav = torchaudio.transforms.Resample(sr, target_sr)(wav)
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        return wav[:2]


def separate_with_demucs(config: dict):
    job_id = config["job_id"]
    source_path = config["source_audio_path"]
    model_name = config.get("model", "htdemucs_ft")
    device_pref = config.get("device", "cpu")
    output_dir = config["output_directory"]

    emit_progress("processing", "กำลังดึงข้อมูลโครงสร้างโมเดลระบบ Demucs...", 10)
    device = setup_device(device_pref)

    try:
        logger.info(f"Loading Demucs architecture: {model_name}")
        model = get_model(model_name)
        model.to(device)
        model.eval()
    except Exception as e:
        emit_progress("errored", f"ล้มเหลวในการดึงฐานข้อมูลโมเดล: {e}")
        raise

    emit_progress("processing", "กำลังใช้คลังคำสั่ง FFmpeg ถอดรหัสไฟล์เสียงเข้าหน่วยความจำ...", 25)

    try:
        samplerate = model.samplerate
        wav = robust_load_audio(source_path, samplerate)
        wav = wav.to(device)
    except Exception as e:
        emit_progress("errored", f"ไม่สามารถเปิดอ่านไฟล์มัลติมีเดียได้: {e}")
        raise

    emit_progress("processing", "กำลังคัดแยกเลเยอร์แทร็กดนตรีด้วยการ์ดจอ RTX 3050...", 50)

    try:
        ref = wav.mean(0)
        wav_normalized = (wav - ref.mean()) / ref.std()
        
        # 🎯 [CRITICAL FIX]: นำคำสั่ง segment=10 ออก เพื่อปล่อยให้ Demucs 
        # ใช้ขนาดหน้าต่าง 7.8 วินาทีของมันเองโดยตรง ป้องกันเมทริกซ์แครชในชั้นเลเยอร์ Transformer
        sources = apply_model(
            model,
            wav_normalized[None],
            device=device,
            progress=False,
            overlap=0.25,
            split=True
        )
        emit_progress("processing", "ถอดรหัสสัญญาณเสร็จสิ้น กำลังบันทึกไฟล์สเตมลงดิสก์...", 85)
        
        sources = sources * ref.std() + ref.mean()
        sources = sources[0]

    except torch.cuda.OutOfMemoryError:
        emit_progress("errored", "หน่วยความจำการ์ดจอ (VRAM) เอ่อล้น! กรุณาสลับไปเลือกใช้งานโหมด CPU Render แทนครับ")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise
    except Exception as e:
        emit_progress("errored", f"กระบวนการถอดรหัสสัญญาณแครชระหว่างรัน: {e}")
        traceback.print_exc()
        raise

    os.makedirs(output_dir, exist_ok=True)
    stems = {}
    stem_names = model.sources
    
    for i, stem_name in enumerate(stem_names):
        stem_path = os.path.join(output_dir, f"{stem_name}.wav")
        try:
            stem_tensor = sources[i].cpu()
            max_val = stem_tensor.abs().max()
            if max_val > 1.0:
                stem_tensor = stem_tensor / max_val
                
            torchaudio.save(stem_path, stem_tensor, samplerate)
            stems[stem_name] = os.path.abspath(stem_path)
            logger.info(f"Exported track successfully: {stem_path}")
            
            progress_step = 85 + (i + 1) * (14 / len(stem_names))
            emit_progress("processing", f"กำลังเขียนบันทึกไฟล์ไลน์ดนตรี: {stem_name}...", progress_step)
        except Exception as e:
            logger.error(f"Failed to write stem file '{stem_name}': {e}")

    emit_progress("completed", "ระบบคัดแยกเลเยอร์เสียงเสร็จสิ้นสมบูรณ์แล้ว!", 100, stems=stems)
    if device == "cuda":
        torch.cuda.empty_cache()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        config = json.load(f)

    logger.info(f"=== GG-Replay Demucs Advanced Core Worker Initiated ===")
    try:
        separate_with_demucs(config)
    except Exception as e:
        logger.error(f"Engine Core Pipeline Abnormal Exit: {e}")
        emit_progress("errored", f"Worker Pipeline Fatal Crash: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()