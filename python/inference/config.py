import logging
import os
import json
from typing import Literal

import torch

DEVICE = Literal["cpu", "cuda", "xla", "mps"]
logger = logging.getLogger(__name__)


class Config:
    device: DEVICE
    is_half: bool # เพิ่มตัวแปรควบคุมความละเอียดทศนิยมคู่ไดรเวอร์การ์ดจอ

    def __init__(self):
        self.ort_providers = []
        self.is_half = False
        
        # --- [แก้ไขเพิ่มเติม]: ระบบดึงค่าการตั้งค่าฮาร์ดแวร์ตรงจากดิสก์ของตัวแอปพลิเคชันหลัก ---
        saved_device = None
        try:
            # คำนวณตำแหน่งย้อนกลับไปหาโฟลเดอร์ data/settings.json ของโปรเจกต์
            settings_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "settings.json"))
            if os.path.exists(settings_path):
                with open(settings_path, "r", encoding="utf-8") as f:
                    settings = json.load(f)
                    saved_device = settings.get("device")
        except Exception as e:
            logger.warning("Could not read local settings.json configuration: %s" % e)

        cuda_available = torch.cuda.is_available()
        
        # จัดสรรทรัพยากรระบบให้ตรงตามสิทธิ์ที่ผู้ใช้เลือกครั้งแรกครั้งเดียว
        if saved_device == "cpu":
            self.device = "cpu"
        elif saved_device == "cuda" and cuda_available:
            self.device = "cuda"
            self.is_half = True # เปิดใช้งานโหมดครึ่งความละเอียด (Float16) เพื่อบังคับเรนเดอร์บน GPU 100%
            self.ort_providers.append("CUDAExecutionProvider")
        else:
            # ระบบ Fallback สำรองในกรณีเปิดใช้งานแบบรันสคริปต์แยกภายนอก
            if cuda_available:
                self.device = "cuda"
                self.is_half = True
                self.ort_providers.append("CUDAExecutionProvider")
            elif torch.backends.mps.is_available():
                self.device = "mps"
                self.ort_providers.append("CoreMLExecutionProvider")
            else:
                self.device = "cpu"
        # ---------------------------------------------------------------------------------

        self.ort_providers.append("CPUExecutionProvider")
        logger.info("Using device: %s (enforce half-precision: %s)" % (self.device, self.is_half))
        
        self.n_cpu = os.cpu_count()
        self.n_gpu = torch.cuda.device_count() if torch.cuda.is_available() else 0
        
        # ดึงคุณลักษณะจำเพาะของการ์ดจอมาบันทึกลงระบบ Log
        self.gpu_name = torch.cuda.get_device_name(0) if self.n_gpu > 0 else None
        self.gpu_mem = torch.cuda.get_device_properties(0).total_memory if self.n_gpu > 0 else None
        
        self.python_cmd = "python"
        self.listen_port = 7865
        self.iscolab = False
        self.noparallel = False
        self.noautoopen = True
        self.x_pad = 1
        self.x_query = 6
        self.x_center = 38
        self.x_max = 41


config = Config()
is_windows = os.name == "nt"

