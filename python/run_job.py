import os
import sys
import warnings

# 🔥 [แก้ไขเพิ่มเติม]: สั่งปิดการแจ้งเตือนประเภทข้อความเตือนอนาคต (FutureWarning / UserWarning) 
# ของไลบรารีอย่าง PyTorch และ WeightNorm เพื่อให้ Log ใน Terminal คลีนและสะอาดที่สุด
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# ฝังตำแหน่งทั้งโฟลเดอร์ python และโฟลเดอร์ย่อย inference เข้าสู่ระบบค้นหาของ Python
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

inference_dir = os.path.join(current_dir, "inference")
if inference_dir not in sys.path:
    sys.path.insert(0, inference_dir)

import argparse
import json
from inference.api_models import CreateSongOptions, JobProgressResp
from inference_manager import InferenceManager

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to temporary config JSON")
    parser.add_argument("--job_id", required=True, help="Current Job ID")
    args = parser.parse_args()

    # อ่านข้อมูลตั้งค่าชุดคำสั่งที่ส่งมาจากภาษา Go
    with open(args.config, "r", encoding="utf-8") as f:
        data = json.load(f)

    opt_data = data.get("options", {})
    options = CreateSongOptions(
        pitch=opt_data.get("pitch"),
        instrumentalsPitch=opt_data.get("instrumentalsPitch"),
        preStemmed=opt_data.get("preStemmed", False),
        vocalsOnly=opt_data.get("vocalsOnly", False),
        sampleMode=opt_data.get("sampleMode", False),
        deEchoDeReverb=opt_data.get("deEchoDeReverb", False),
        sampleModeStartTime=opt_data.get("sampleModeStartTime", 0),
        f0Method=opt_data.get("f0Method", "rmvpe"),
        stemmingMethod=opt_data.get("stemmingMethod", "UVR-MDX-NET Voc FT"),
        indexRatio=opt_data.get("indexRatio", 0.75),
        consonantProtection=opt_data.get("consonantProtection", 0.35),
        outputFormat=opt_data.get("outputFormat", "mp3_192k"),
        volumeEnvelope=opt_data.get("volumeEnvelope", 1.0)
    )

    # ส่งสเตตัสอัปเดตความคืบหน้ากลับไปยังหน้าต่าง Wails GUI ผ่านช่องทาง Standard Output (stdout)
    def set_status(status: JobProgressResp):
        try:
            status_dict = status.model_dump()
        except AttributeError:
            status_dict = status.dict()
        status_dict["jobId"] = args.job_id
        print(f"PROGRESS_JSON:{json.dumps(status_dict)}", flush=True)

    def check_stop_job():
        return False

    # เรียกใช้งาน Core AI ตัวจัดการเพลงเพื่อทำการแยกเสียงดนตรีและแปลง RVC
    manager = InferenceManager(
        model_name=data.get("modelId"),
        models_path=data.get("modelPath"),
        weights_path=data.get("weightsPath"),
        source_audio_path=data.get("songUrlOrFilePath"),
        output_directory=data.get("outputDirectory"),
        options=options,
        job_id=args.job_id,
        set_status=set_status,
        check_stop_job=check_stop_job
    )
    
    # รันโปรเซส AI
    manager.infer()

if __name__ == "__main__":
    main()