# -*- coding: utf-8 -*-
# Copyright (c) Microsoft Corporation. All rights reserved.
# Optimized for Wails + Go Native Queue Architecture (Zero-Dependency)
"""
GG-Replay: Pydantic-Free Data Models Layer
===========================================
โครงสร้างข้อมูลแบบ Plain Python Classes (ไม่ใช้ Pydantic) เพื่อ:
- ลด dependency และขนาดไฟล์
- เร็วขึ้นในการ import (ไม่มี overhead ของ Pydantic validation)
- เข้ากันได้ดีกับ Go JSON bridge ผ่าน dict() / model_dump()

โครงสร้างนี้ซิงค์ตรงกับ Go struct ใน `replay-go/inference/options.go`
"""

from typing import List, Literal, Optional, Any, Dict


# =====================================================================
# 🎯 TYPE ALIASES - ใช้สำหรับ Type Hinting และ IDE Auto-complete
# =====================================================================

# F0 extraction methods ที่ RVC รองรับ
F0_METHODS = Literal[
    "pm",                     # Praat-based (เร็วสุด, คุณภาพต่ำ)
    "harvest",                # PyWorld Harvest (คุณภาพดี, ช้า)
    "crepe",                  # CREPE full model
    "crepe-tiny",             # CREPE tiny model (เร็ว)
    "mangio-crepe",           # Mangio-Crepe variant
    "mangio-crepe-tiny",      # Mangio-Crepe tiny variant
    "rmvpe",                  # RMVPE (แนะนำ, คุณภาพดีที่สุด)
]

# Output audio formats
OUTPUT_FORMATS = Literal[
    "wav",                    # Lossless WAV
    "mp3_192k",               # MP3 192 kbps
    "mp3_320k",               # MP3 320 kbps (แนะนำ)
]

# Job status values - ซิงค์กับ Go `STATUS` type ใน status.go
STATUS = Literal[
    "queued",                 # อยู่ในคิวรอประมวลผล
    "processing",             # กำลังประมวลผล
    "errored",                # เกิดข้อผิดพลาด
    "completed",              # เสร็จสมบูรณ์
    "unknown_job",            # ไม่พบ Job ID
    "unknown",                # สถานะไม่ทราบ
    "stopped",                # ถูกหยุดโดยผู้ใช้
    "idle",                   # ยังไม่เริ่ม
]

# UVR Model architecture types
MODEL_TYPES = Literal[
    "DEMUCS_ARCH_TYPE",       # Meta's Demucs
    "MDX_ARCH_TYPE",          # MDX-Net (Onnx)
    "VR_ARCH_TYPE",           # VR Architecture
]


# =====================================================================
# 🎯 CORE OPTIONS - ตรงกับ Go `CreateSongOptions` struct
# =====================================================================

class CreateSongOptions:
    """
    ตัวเลือกการตั้งค่าสำหรับการสร้างเพลง (Voice Conversion)
    
    🎯 ซิงค์ตรงกับ Go struct:
        type CreateSongOptions struct {
            OutputName          string  `json:"outputName,omitempty"`
            Pitch               *int    `json:"pitch,omitempty"`
            ...
        }
    
    ทุก field ใช้ camelCase เพื่อให้ตรงกับ JSON ที่ Go ส่งมา
    """
    
    def __init__(
        self,
        # === [CORE OUTPUT] ===
        outputName: Optional[str] = "converted_vocals",  # 🎯 ชื่อไฟล์ผลลัพธ์ (ไม่มีนามสกุล)
        
        # === [PITCH CONTROL] ===
        pitch: Optional[int] = 0,                        # ระดับเสียงร้อง (semitones, -12 ถึง +12)
        instrumentalsPitch: Optional[int] = 0,           # ระดับเสียงดนตรี (semitones)
        
        # === [PROCESSING FLAGS] ===
        preStemmed: bool = False,                        # ไฟล์แยกเสียงร้องมาแล้ว (skip UVR)
        vocalsOnly: bool = False,                        # ส่งออกเฉพาะเสียงร้อง (ไม่ mix ดนตรี)
        sampleMode: bool = False,                        # โหมดตัวอย่าง (ตัด 30 วินาที)
        deEchoDeReverb: bool = False,                    # ล้างเสียงสะท้อน/ก้องห้อง
        
        # === [SAMPLE MODE] ===
        sampleModeStartTime: int = 0,                    # จุดเริ่มต้นการตัด (วินาที)
        
        # === [AI METHOD SELECTION] ===
        f0Method: str = "rmvpe",                         # วิธีสกัด F0 (ดู F0_METHODS)
        stemmingMethod: str = "UVR-MDX-NET Voc FT",      # โมเดลแยกเสียงร้อง (UVR)
        
        # === [AUDIO QUALITY TUNING] ===
        indexRatio: float = 0.75,                        # อัตราการใช้ FAISS index (0.0-1.0)
        consonantProtection: float = 0.35,               # ป้องกันเสียงพยัญชนะหาย (0.0-0.5)
        outputFormat: str = "mp3_320k",                  # รูปแบบไฟล์ output (ดู OUTPUT_FORMATS)
        volumeEnvelope: float = 1.0,                     # การปรับ volume envelope (0.0-1.0)
        
        # === [HARDWARE STEERING] === 🚀 เพิ่มเพื่อรองรับ GPU selection จาก Go
        device: Optional[str] = None,                    # "cpu" | "cuda" | "mps" | None (auto)
        gpu: Optional[bool] = None,                      # Legacy toggle (True = cuda, False = cpu)
    ):
        # Core output
        self.outputName = outputName or "converted_vocals"
        
        # Pitch control
        self.pitch = pitch if pitch is not None else 0
        self.instrumentalsPitch = instrumentalsPitch if instrumentalsPitch is not None else 0
        
        # Processing flags
        self.preStemmed = bool(preStemmed)
        self.vocalsOnly = bool(vocalsOnly)
        self.sampleMode = bool(sampleMode)
        self.deEchoDeReverb = bool(deEchoDeReverb)
        
        # Sample mode
        self.sampleModeStartTime = int(sampleModeStartTime or 0)
        
        # AI method selection
        self.f0Method = f0Method or "rmvpe"
        self.stemmingMethod = stemmingMethod or "UVR-MDX-NET Voc FT"
        
        # Audio quality tuning
        self.indexRatio = float(indexRatio if indexRatio is not None else 0.75)
        self.consonantProtection = float(consonantProtection if consonantProtection is not None else 0.35)
        self.outputFormat = outputFormat or "mp3_320k"
        self.volumeEnvelope = float(volumeEnvelope if volumeEnvelope is not None else 1.0)
        
        # Hardware steering
        self.device = device
        self.gpu = gpu
    
    def dict(self) -> Dict[str, Any]:
        """แปลงเป็น dictionary (สำหรับ JSON serialization)"""
        return {k: v for k, v in self.__dict__.items()}
    
    def model_dump(self) -> Dict[str, Any]:
        """Pydantic-compatible method (เรียก dict() ภายใน)"""
        return self.dict()
    
    def __repr__(self) -> str:
        return (
            f"CreateSongOptions("
            f"outputName={self.outputName!r}, "
            f"pitch={self.pitch}, "
            f"f0Method={self.f0Method!r}, "
            f"device={self.device!r})"
        )


# =====================================================================
# 🎯 JOB PROGRESS RESPONSE - ตรงกับ Go `JobProgressResp` struct
# =====================================================================

class JobProgressResp:
    """
    โครงสร้างข้อมูลสำหรับสตรีมรายงาน Progress กลับไปอัปเดตหน้า UI ผ่าน Python Bridge
    
    🎯 ซิงค์ตรงกับ Go struct:
        type JobProgressResp struct {
            Status              STATUS  `json:"status"`
            Message             string  `json:"message"`
            ...
        }
    
    ถูกพิมพ์ออก stdout พร้อม prefix `PROGRESS_JSON:` เพื่อให้ Go ดักจับ
    """
    
    def __init__(
        self,
        status: STATUS,
        jobId: Optional[str] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
        elapsedSeconds: Optional[float] = None,
        remainingSeconds: Optional[float] = None,
        outputFilepath: Optional[str] = None,
        inputFilepath: Optional[str] = None,
        preDeechoVocalsFile: Optional[str] = None,
        originalVocalsPath: Optional[str] = None,
        convertedVocalsPath: Optional[str] = None,
        instrumentalsPath: Optional[str] = None,
        options: Optional[Any] = None,
        modelId: Optional[str] = None,
        songHash: Optional[str] = None,
        trackName: Optional[str] = None,
    ):
        # Core status
        self.status = status
        self.message = message or ""
        self.error = error
        
        # Job identification
        self.jobId = jobId
        self.trackName = trackName
        self.modelId = modelId
        self.songHash = songHash
        
        # Timing metrics
        self.elapsedSeconds = elapsedSeconds
        self.remainingSeconds = remainingSeconds
        
        # File paths (ส่งคืนให้ Go Backend)
        self.outputFilepath = outputFilepath
        self.inputFilepath = inputFilepath
        self.preDeechoVocalsFile = preDeechoVocalsFile
        self.originalVocalsPath = originalVocalsPath
        self.convertedVocalsPath = convertedVocalsPath
        self.instrumentalsPath = instrumentalsPath
        
        # Echo back options
        self.options = options
    
    def dict(self) -> Dict[str, Any]:
        """แปลงเป็น dictionary (สำหรับ JSON serialization)"""
        res = {}
        for k, v in self.__dict__.items():
            if v is None:
                res[k] = None
            elif hasattr(v, 'dict'):
                res[k] = v.dict()
            elif hasattr(v, '__dict__'):
                res[k] = v.__dict__
            else:
                res[k] = v
        return res
    
    def model_dump(self) -> Dict[str, Any]:
        """Pydantic-compatible method"""
        return self.dict()
    
    def __repr__(self) -> str:
        return (
            f"JobProgressResp("
            f"status={self.status!r}, "
            f"jobId={self.jobId!r}, "
            f"message={self.message!r})"
        )


# =====================================================================
# 🎯 HTTP API MODELS - สำหรับ FastAPI server (legacy/development)
# =====================================================================

class CreateSongReq:
    """Request body สำหรับ /create_song endpoint"""
    def __init__(
        self,
        outputDirectory: str,
        modelPath: str,
        weightsPath: str,
        songUrlOrFilePath: str,
        modelId: Optional[str] = None,
        options: Optional[CreateSongOptions] = None,
    ):
        self.outputDirectory = outputDirectory
        self.modelPath = modelPath
        self.weightsPath = weightsPath
        self.songUrlOrFilePath = songUrlOrFilePath
        self.modelId = modelId
        self.options = options or CreateSongOptions()


class CreateSongResp:
    """Response body สำหรับ /create_song endpoint"""
    def __init__(self, jobId: str):
        self.jobId = jobId


class JobProgressReq:
    """Request body สำหรับ /song_progress endpoint"""
    def __init__(self, jobId: str):
        self.jobId = jobId


class StopJobReq:
    """Request body สำหรับ /stop_job endpoint"""
    def __init__(self, jobId: str):
        self.jobId = jobId


class ClearJobReq:
    """Request body สำหรับ /clear_job endpoint"""
    def __init__(self, jobId: str):
        self.jobId = jobId


class JobsResp:
    """Response body สำหรับ /jobs endpoint"""
    def __init__(self, jobs: Dict[str, JobProgressResp]):
        self.jobs = jobs


class ShutdownResp:
    """Response body สำหรับ /shutdown endpoint"""
    def __init__(self, success: bool = True, message: str = ""):
        self.success = success
        self.message = message


class HealthResp:
    """Response body สำหรับ /health endpoint"""
    def __init__(
        self,
        ok: bool = True,
        status: str = "healthy",
        timestamp: int = 0,
        active_jobs: int = 0,
        queued_jobs: int = 0,
    ):
        self.ok = ok
        self.status = status
        self.timestamp = timestamp
        self.active_jobs = active_jobs
        self.queued_jobs = queued_jobs


class DeviceOptionsResp:
    """Response body สำหรับ /device_options endpoint"""
    def __init__(self, devices: List[str]):
        self.devices = devices


class SetDeviceReq:
    """Request body สำหรับ /set_device endpoint"""
    def __init__(self, device: str):
        self.device = device


class TorchDevice:
    """Torch device information"""
    def __init__(
        self,
        device: str,
        name: Optional[str] = None,
        type: Optional[str] = None,
        available: bool = False,
    ):
        self.device = device
        self.name = name
        self.type = type
        self.available = available


class StemmingModel:
    """UVR Stemming model information"""
    def __init__(
        self,
        name: str,
        files: List[str],
        type: MODEL_TYPES,
        description: Optional[str] = None,
    ):
        self.name = name
        self.files = files
        self.type = type
        self.description = description


class StemmingModelsResp:
    """Response body สำหรับ /stemming_models endpoint"""
    def __init__(self, models: List[StemmingModel]):
        self.models = models


# =====================================================================
# 🎯 UTILITY FUNCTIONS
# =====================================================================

def parse_options_from_dict(data: Dict[str, Any]) -> CreateSongOptions:
    """
    Parse dictionary (จาก JSON) เป็น CreateSongOptions
    
    รองรับทั้ง camelCase (จาก Go) และ snake_case (จาก Python)
    """
    if not data or not isinstance(data, dict):
        return CreateSongOptions()
    
    # Multi-key fallback สำหรับแต่ละ field
    def get(*keys, default=None):
        for key in keys:
            if key in data and data[key] is not None:
                return data[key]
        return default
    
    return CreateSongOptions(
        outputName=get("outputName", "output_name", default="converted_vocals"),
        pitch=get("pitch", default=0),
        instrumentalsPitch=get("instrumentalsPitch", "instrumentals_pitch", default=0),
        preStemmed=get("preStemmed", "pre_stemmed", default=False),
        vocalsOnly=get("vocalsOnly", "vocals_only", default=False),
        sampleMode=get("sampleMode", "sample_mode", default=False),
        deEchoDeReverb=get("deEchoDeReverb", "de_echo_de_reverb", default=False),
        sampleModeStartTime=get("sampleModeStartTime", "sample_mode_start_time", default=0),
        f0Method=get("f0Method", "f0_method", default="rmvpe"),
        stemmingMethod=get("stemmingMethod", "stemming_method", default="UVR-MDX-NET Voc FT"),
        indexRatio=get("indexRatio", "index_ratio", default=0.75),
        consonantProtection=get("consonantProtection", "consonant_protection", default=0.35),
        outputFormat=get("outputFormat", "output_format", default="mp3_320k"),
        volumeEnvelope=get("volumeEnvelope", "volume_envelope", default=1.0),
        device=get("device", default=None),
        gpu=get("gpu", default=None),
    )


def parse_progress_from_dict(data: Dict[str, Any]) -> JobProgressResp:
    """Parse dictionary (จาก JSON) เป็น JobProgressResp"""
    if not data or not isinstance(data, dict):
        return JobProgressResp(status="unknown")
    
    return JobProgressResp(
        status=data.get("status", "unknown"),
        jobId=data.get("jobId"),
        message=data.get("message"),
        error=data.get("error"),
        elapsedSeconds=data.get("elapsedSeconds"),
        remainingSeconds=data.get("remainingSeconds"),
        outputFilepath=data.get("outputFilepath"),
        inputFilepath=data.get("inputFilepath"),
        preDeechoVocalsFile=data.get("preDeechoVocalsFile"),
        originalVocalsPath=data.get("originalVocalsPath"),
        convertedVocalsPath=data.get("convertedVocalsPath"),
        instrumentalsPath=data.get("instrumentalsPath"),
        options=data.get("options"),
        modelId=data.get("modelId"),
        songHash=data.get("songHash"),
        trackName=data.get("trackName"),
    )