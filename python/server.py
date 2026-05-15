import asyncio
import logging
import os
import signal
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import List
from contextlib import asynccontextmanager

import psutil
import uvicorn
import torch # ต้องมั่นใจว่าติดตั้ง torch ที่รองรับ CUDA
from fastapi import Body, FastAPI
from fastapi.routing import APIRoute

import monkey_patch_init
from inference.api_models import (
    ClearJobReq, CreateSongReq, CreateSongResp, DeviceOptionsResp,
    HealthResp, JobProgressReq, JobProgressResp, JobsResp,
    SetDeviceReq, ShutdownResp, StemmingModelsResp, StopJobReq, TorchDevice,
)
from inference.config import config
from inference.inference_conf import stemming_models_list

# --- Global Variables ---
RUNNING_JOBS: dict[str, JobProgressResp] = {}
STOP_JOBS: List[str] = []
queue = asyncio.Queue()
logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=1)

async def process_queue():
    while True:
        try:
            body, job_id = await queue.get()
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(executor, run_inference, body, job_id)
            queue.task_done()
        except Exception as e:
            logger.error(f"Queue error: {e}")

# --- ส่วนที่แก้ไข: Lifespan บังคับใช้ GPU (CUDA) เป็นหลัก ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ตรวจสอบและตั้งค่า GPU ทันทีที่เริ่ม
    if torch.cuda.is_available():
        config.device = "cuda"
        logger.info("GPU (CUDA) detected and set as default device.")
    elif torch.backends.mps.is_available():
        config.device = "mps"
        logger.info("Apple Silicon GPU (MPS) detected.")
    else:
        config.device = "cpu"
        logger.warning("No GPU found, using CPU mode.")

    worker_task = asyncio.create_task(process_queue())
    yield
    # Shutdown
    worker_task.cancel()

app = FastAPI(title="Replay API", lifespan=lifespan)

# --- API Endpoints ---

@app.post("/song_progress", response_model=JobProgressResp)
async def song_progress(body: JobProgressReq = Body(...)):
    if body.jobId not in RUNNING_JOBS:
        return JobProgressResp(status="unknown_job", message="Error: Job not found")
    return RUNNING_JOBS[body.jobId]

@app.post("/create_song", response_model=CreateSongResp)
async def create_song(body: CreateSongReq = Body(...)):
    job_id = uuid.uuid4().hex
    track_name = os.path.splitext(os.path.basename(body.songUrlOrFilePath or ""))[0]
    RUNNING_JOBS[job_id] = JobProgressResp(
        status="queued", message="Waiting in queue...", jobId=job_id,
        trackName=track_name, modelId=body.modelId or ""
    )
    await queue.put((body, job_id))
    return CreateSongResp(jobId=job_id)

def run_inference(body: CreateSongReq, job_id: str):
    from inference.inference_manager import InferenceManager
    try:
        def set_status(status: JobProgressResp): RUNNING_JOBS[job_id] = status
        def check_stop_job(): return job_id in STOP_JOBS
        
        inf = InferenceManager(
            body.modelId, body.modelPath, body.weightsPath,
            body.songUrlOrFilePath, body.outputDirectory,
            options=body.options, job_id=job_id,
            set_status=set_status, check_stop_job=check_stop_job
        )
        inf.infer()
    except Exception as e:
        logger.error(f"Inference Exception: {e}")

@app.get("/device_options", response_model=DeviceOptionsResp)
async def device_options():
    devices = ["cpu"]
    if torch.cuda.is_available(): devices.append("cuda")
    if torch.backends.mps.is_available(): devices.append("mps")
    return DeviceOptionsResp(devices=devices)

# --- ส่วนสำคัญ: คำสั่งรัน Web Server ---
if __name__ == "__main__":
    port = int(os.environ.get("REPLAY_PORT", 62362))
    uvicorn.run(app, host="127.0.0.1", port=port)