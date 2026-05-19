# -*- coding: utf-8 -*-
# Copyright (c) Microsoft Corporation. All rights reserved.
# Optimized for Wails + Go Native Queue Architecture (Zero-Dependency)

from typing import List, Literal, Optional

# 🎯 [แก้ไขจุดสำคัญ]: ใส่ตัวแปรประเภทข้อมูลจำลองกลับคืนมา เพื่อให้ inference_manager.py อิมพอร์ตไปใช้งานต่อได้ไม่พัง
F0_METHODS = Literal["pm", "harvest", "crepe", "crepe-tiny", "mangio-crepe", "mangio-crepe-tiny", "rmvpe"]
OUTPUT_FORMATS = Literal["wav", "mp3_192k", "mp3_320k"]
STATUS = Literal["queued", "processing", "errored", "completed", "unknown_job", "unknown", "stopped"]
MODEL_TYPES = Literal["DEMUCS_ARCH_TYPE", "MDX_ARCH_TYPE", "VR_ARCH_TYPE"]


class CreateSongOptions:
    def __init__(self, 
                 pitch=None, 
                 instrumentalsPitch=None, 
                 preStemmed=False, 
                 vocalsOnly=False, 
                 sampleMode=False, 
                 deEchoDeReverb=False, 
                 sampleModeStartTime=0, 
                 f0Method="rmvpe", 
                 stemmingMethod="UVR-MDX-NET Voc FT", 
                 indexRatio=0.75, 
                 consonantProtection=0.35, 
                 outputFormat="mp3_192k", 
                 volumeEnvelope=1.0):
        self.pitch = pitch
        self.instrumentalsPitch = instrumentalsPitch
        self.preStemmed = preStemmed
        self.vocalsOnly = vocalsOnly
        self.sampleMode = sampleMode
        self.deEchoDeReverb = deEchoDeReverb
        self.sampleModeStartTime = sampleModeStartTime
        self.f0Method = f0Method
        self.stemmingMethod = stemmingMethod
        self.indexRatio = indexRatio
        self.consonantProtection = consonantProtection
        self.outputFormat = outputFormat
        self.volumeEnvelope = volumeEnvelope

    def dict(self):
        return {k: v for k, v in self.__dict__.items()}

    def model_dump(self):
        return self.dict()


class JobProgressResp:
    def __init__(self, 
                 status, 
                 jobId=None, 
                 message=None, 
                 error=None, 
                 elapsedSeconds=None, 
                 remainingSeconds=None, 
                 outputFilepath=None, 
                 inputFilepath=None, 
                 preDeechoVocalsFile=None, 
                 originalVocalsPath=None, 
                 convertedVocalsPath=None, 
                 instrumentalsPath=None, 
                 options=None, 
                 modelId=None, 
                 songHash=None, 
                 trackName=None):
        self.status = status
        self.jobId = jobId
        self.message = message
        self.error = error
        self.elapsedSeconds = elapsedSeconds
        self.remainingSeconds = remainingSeconds
        self.outputFilepath = outputFilepath
        self.inputFilepath = inputFilepath
        self.preDeechoVocalsFile = preDeechoVocalsFile
        self.originalVocalsPath = originalVocalsPath
        self.convertedVocalsPath = convertedVocalsPath
        self.instrumentalsPath = instrumentalsPath
        self.options = options
        self.modelId = modelId
        self.songHash = songHash
        self.trackName = trackName

    def dict(self):
        res = {}
        for k, v in self.__dict__.items():
            if v is None:
                res[k] = None
            elif hasattr(v, 'dict'):
                res[k] = v.dict()
            else:
                res[k] = v
        return res
    
    def model_dump(self):
        return self.dict()


# --- คลาสเสริมอื่นๆ ทั้งหมดเพื่อรองรับความเข้ากันได้ย้อนหลังกับสคริปต์เก่า ---
class CreateSongReq:
    def __init__(self, outputDirectory, modelPath, weightsPath, songUrlOrFilePath, modelId=None, options=None):
        self.outputDirectory = outputDirectory
        self.modelPath = modelPath
        self.weightsPath = weightsPath
        self.songUrlOrFilePath = songUrlOrFilePath
        self.modelId = modelId
        self.options = options

class ClearJobReq:
    def __init__(self, jobId): self.jobId = jobId

class StopJobReq:
    def __init__(self, jobId): self.jobId = jobId

class CreateSongResp:
    def __init__(self, jobId): self.jobId = jobId

class JobProgressReq:
    def __init__(self, jobId): self.jobId = jobId

class JobsResp:
    def __init__(self, jobs): self.jobs = jobs

class ShutdownResp:
    def __init__(self, success=True): self.success = success

class TorchDevice:
    def __init__(self, device): self.device = device

class StemmingModel:
    def __init__(self, name, files, type):
        self.name = name
        self.files = files
        self.type = type

class StemmingModelsResp:
    def __init__(self, models): self.models = models

class HealthResp:
    def __init__(self, ok=True): self.ok = ok

class DeviceOptionsResp:
    def __init__(self, devices): self.devices = devices

class SetDeviceReq:
    def __init__(self, device): self.device = device