import os
import time
from functools import lru_cache
from threading import Lock
from typing import Callable

from inference.inference_conf import stemming_models_list
from inference.uvr.constants import DEMUCS_ARCH_TYPE, MDX_ARCH_TYPE, NO_OTHER_STEM, VR_ARCH_TYPE
from inference.uvr.model_data import ModelData
from inference.uvr.separate import SeparateDemucs, SeparateMDX, SeparateVR

SEPARATION_LOCK = Lock()

lock_dict = {}


def demucs_model_name_mapper(name: str):
    mapping = {
        "tasnet.th": "v1 | Tasnet",
        "tasnet_extra.th": "v1 | Tasnet_extra",
        "demucs.th": "v1 | Demucs",
        "demucs_extra.th": "v1 | Demucs_extra",
        "light.th": "v1 | Light",
        "light_extra.th": "v1 | Light_extra",
        "tasnet.th.gz": "v1 | Tasnet.gz",
        "tasnet_extra.th.gz": "v1 | Tasnet_extra.gz",
        "demucs.th.gz": "v1 | Demucs_extra.gz",
        "light.th.gz": "v1 | Light.gz",
        "light_extra.th.gz": "v1 | Light_extra.gz",
        # v2
        "tasnet-beb46fac.th": "v2 | Tasnet",
        "tasnet_extra-df3777b2.th": "v2 | Tasnet_extra",
        "demucs48_hq-28a1282c.th": "v2 | Demucs48_hq",
        "demucs-e07c671f.th": "v2 | Demucs",
        "demucs_extra-3646af93.th": "v2 | Demucs_extra",
        "demucs_unittest-09ebc15f.th": "v2 | Demucs_unittest",
        # v3
        "mdx.yaml": "v3 | mdx",
        "mdx_extra.yaml": "v3 | mdx_extra",
        "mdx_extra_q.yaml": "v3 | mdx_extra_q",
        "mdx_q.yaml": "v3 | mdx_q",
        "repro_mdx_a.yaml": "v3 | repro_mdx_a",
        "repro_mdx_a_hybrid_only.yaml": "v3 | repro_mdx_a_hybrid",
        "repro_mdx_a_time_only.yaml": "v3 | repro_mdx_a_time",
        "UVR_Demucs_Model_1.yaml": "v3 | UVR_Model_1",
        "UVR_Demucs_Model_2.yaml": "v3 | UVR_Model_2",
        "UVR_Demucs_Model_Bag.yaml": "v3 | UVR_Model_Bag",
        # v4
        "hdemucs_mmi.yaml": "v4 | hdemucs_mmi",
        "htdemucs.yaml": "v4 | htdemucs",
        "htdemucs_ft.yaml": "v4 | htdemucs_ft",
        "htdemucs_6s.yaml": "v4 | htdemucs_6s",
        "UVR_Demucs_Model_ht.yaml": "v4 | UVR_Model_ht",
    }
    for file, mod_name in mapping.items():
        if mod_name == name:
            return file
    return f"{name}.yaml"


class Stemmer:
    @staticmethod
    @lru_cache(maxsize=128)  # adjust this value based on how many unique combinations you expect
    def _get_lock(source_audio_path: str, output_directory: str):
        key = (source_audio_path, output_directory)
        if key not in lock_dict:
            lock_dict[key] = Lock()
        return lock_dict[key]

    @staticmethod
    def separate_track(
        source_audio_path: str,
        output_directory: str,
        weights_dir: str,
        model_name: str = "UVR-MDX-NET Voc FT",
        status_setter: Callable[[str], None] = None,
    ):
        if not os.path.exists(source_audio_path):
            raise Exception(f"Source audio path does not exist: {source_audio_path}")
        track_filename = os.path.basename(source_audio_path)
        track_name = os.path.splitext(track_filename)[0]
        
        # --- 1. ค้นหาโมเดลในระบบหลักก่อน ---
        model = None
        for m in stemming_models_list:
            if m.name == model_name:
                model = m
                break
        
        # --- 2. ค้นหาแบบ Fuzzy ---
        if model is None:
            def normalize_str(s: str) -> str:
                return s.lower().replace(" ", "").replace("_", "").replace("-", "")
            
            normalized_target = normalize_str(model_name)
            for m in stemming_models_list:
                if normalize_str(m.name) == normalized_target:
                    model = m
                    break
                    
        # --- 3. [ระบบยัดไส้โมเดลอัจฉริยะ (Force Bypass)]: หากเป็น Kim ให้เสกตัวแปรขึ้นมาเลยแบบไร้เงื่อนไขจุกจิก ---
        if model is None:
            class AutoMockModel:
                def __init__(self, name, f_type, files):
                    self.name = name
                    self.type = f_type
                    self.files = files
            
            # ถ้าชื่อมีคำว่า kim แม้แต่นิดเดียว ให้รัน Kim_Vocal_1.onnx ทันที
            if "kim" in model_name.lower():
                model = AutoMockModel("Kim_Vocal_1", MDX_ARCH_TYPE, ["Kim_Vocal_1.onnx"])
                print("=== [Replay AI Patched]: Force loading Kim_Vocal_1.onnx into MDX-Net architecture ===")
            
            # เผื่อโมเดลตัวอื่นในอนาคตที่ไม่มีใน Config แต่มีไฟล์ .onnx วางอยู่ในเครื่อง
            else:
                potential_file = f"{model_name}.onnx"
                if os.path.exists(os.path.join(weights_dir, potential_file)):
                    model = AutoMockModel(model_name, MDX_ARCH_TYPE, [potential_file])
                    print(f"=== [Replay AI Patched]: Auto-detected loose model {potential_file} ===")
                    
        # --- 4. หากยังไม่พบโมเดลใด ๆ จริงๆ ให้แจ้งเตือน ---
        if model is None:
            available_names = [m.name for m in stemming_models_list]
            error_msg = (
                f"ไม่พบคอนฟิกของโมเดลชื่อ '{model_name}' ในระบบหลังบ้าน (inference_conf.py) "
                f"โมเดลที่สามารถเลือกใช้งานได้ในปัจจุบันคือ: {available_names}"
            )
            if status_setter:
                status_setter(error_msg)
            raise ValueError(error_msg)
        
        lock = Stemmer._get_lock(source_audio_path, output_directory)
        with lock:
            # มั่นใจว่าโฟลเดอร์สำหรับเก็บโครงสร้างโมเดลถูกสร้างขึ้นแล้ว
            os.makedirs(weights_dir, exist_ok=True)

            # --- ระบบตรวจสอบและดาวน์โหลดโมเดลแยกเสียง UVR อัตโนมัติ ป้องกัน NoSuchFile ---
            files_to_check = [model.files[0]] if len(model.files) == 1 else model.files
            for f_name in files_to_check:
                target_file_path = os.path.join(weights_dir, f_name)
                if not os.path.exists(target_file_path):
                    msg = f"Downloading missing UVR model component: {f_name}... Please wait."
                    if status_setter:
                        status_setter(msg)
                    print(msg)
                    try:
                        import requests
                        # ลิงก์ดาวน์โหลดหลักความเร็วสูงจากศูนย์เก็บข้อมูลโมเดลสากล TRvlvr
                        url = f"https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/{f_name}"
                        response = requests.get(url, stream=True)
                        
                        # หากลิงก์หลักเกิดปัญหา ให้ใช้ลิงก์สำรองจาก HuggingFace Mirrors
                        if response.status_code != 200:
                            url = f"https://huggingface.co/Anjok/model-repo/resolve/main/{f_name}"
                            response = requests.get(url, stream=True)
                        if response.status_code != 200:
                            url = f"https://huggingface.co/seanghay/uvr_models/resolve/main/{f_name}"
                            response = requests.get(url, stream=True)
                            
                        if response.status_code == 200:
                            with open(target_file_path, "wb") as f:
                                for chunk in response.iter_content(chunk_size=8192):
                                    if chunk:
                                        f.write(chunk)
                            print(f"Successfully downloaded UVR model component: {f_name}")
                        else:
                            raise Exception(f"Server returned HTTP status code {response.status_code}")
                    except Exception as download_err:
                        print(f"Auto-download failed for {f_name}: {download_err}")
                        if len(model.files) == 1:
                            raise RuntimeError(
                                f"Required UVR model file '{f_name}' is missing and auto-download failed: {download_err}. "
                                f"Please place it manually inside your 'data/models/' directory."
                            )
            # ---------------------------------------------------------------------------------------------

            model_path = os.path.join(weights_dir, model.files[0])
            if len(model.files) > 1:
                # demucs models download a yaml file that has all the information regarding the model
                model_path = os.path.join(weights_dir, demucs_model_name_mapper(model_name))
            
            model_data: ModelData = ModelData(model_name, model_path=model_path, selected_process_method=model.type)
            safe_name = "".join(x for x in model_name if x.isalnum())
            track_dir = os.path.join(output_directory, safe_name, track_name)
            os.makedirs(track_dir, exist_ok=True)
            vocal_file = os.path.join(track_dir, "vocals.wav")
            no_vocals_wav = os.path.join(track_dir, "no_vocals.wav")

            no_vocals_is_valid = os.path.exists(no_vocals_wav) or model_data.primary_stem == NO_OTHER_STEM
            if os.path.exists(vocal_file) and no_vocals_is_valid:
                return vocal_file, no_vocals_wav

            def write_to_console(progress_text, base_text=""):
                if status_setter:
                    status_setter(base_text + progress_text)
                print(base_text + progress_text)

            def set_progress_bar(x, y=0):
                perc = (x + y) * 100
                write_to_console(f"{perc:.2f}%")

            process_data = {
                "model_data": model_data,
                "export_path": track_dir,
                "audio_file_base": track_name,
                "audio_file": source_audio_path,
                "set_progress_bar": set_progress_bar,
                "write_to_console": write_to_console,
            }

            start_time = time.time()
            if model_data.process_method == VR_ARCH_TYPE:
                seperator = SeparateVR(model_data, process_data)
            if model_data.process_method == MDX_ARCH_TYPE:
                seperator = SeparateMDX(model_data, process_data)
            if model_data.process_method == DEMUCS_ARCH_TYPE:
                seperator = SeparateDemucs(model_data, process_data)

            seperator.separate()
            elapsed_time = time.time() - start_time
            print(f"Separation complete. Elapsed time: {elapsed_time}")
            return vocal_file, no_vocals_wav