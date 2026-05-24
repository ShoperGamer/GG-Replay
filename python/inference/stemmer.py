import os
import time
import shutil
from functools import lru_cache
from threading import Lock
from typing import Callable

# === [แก้ไขเพิ่มเติม]: เพิ่มโมดูลตรวจสอบและสลับอุปกรณ์ประมวลผลแบบไดนามิก ===
import torch
from inference.config import config
# ====================================================================

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
        device: str = None, 
    ):
        if not os.path.exists(source_audio_path):
            raise Exception(f"Source audio path does not exist: {source_audio_path}")
        
        # 🚀 === [แก้ไขเพิ่มเติม]: ดักจับชื่อโหมดท่อส่งรวม และเปลี่ยนไปอ้างอิงโมเดลแยกเสียงร้องมาตรฐานเพื่อป้องกันการแครช ===
        if model_name == "Absolute_Lead_Isolation":
            model_name = "UVR-MDX-NET Voc FT"

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
                    
        # --- 3. [ระบบยัดไส้โมเดลอัจฉริยะ (Force Bypass)]: ตรวจจับคีย์เวิร์ดเพื่อเสกโครงสร้าง Onnx แฝง ---
        if model is None:
            class AutoMockModel:
                def __init__(self, name, f_type, files):
                    self.name = name
                    self.type = f_type
                    self.files = files
            
            # เผื่อเลือกใช้โมเดลตระกูล Kim
            if "kim" in model_name.lower():
                model = AutoMockModel("Kim_Vocal_1", MDX_ARCH_TYPE, ["Kim_Vocal_1.onnx"])
                print("=== [Replay AI Patched]: Force loading Kim_Vocal_1.onnx into MDX-Net architecture ===")
            
            # ดักจับคีย์เวิร์ด Karaoke เพื่อบังคับใช้เครื่องยนต์แยกคนร้องหลักออกจากคนร้องเสริม
            elif "karaoke" in model_name.lower() or "kara_2" in model_name.lower():
                model = AutoMockModel("UVR-MDX-NET Karaoke 2", MDX_ARCH_TYPE, ["UVR_MDXNET_KARA_2.onnx"])
                print("=== [Replay AI Patched]: Force loading UVR_MDXNET_KARA_2.onnx for Lead Vocal Isolation ===")
            
            # ดักจับคีย์เวิร์ด Main เพื่อใช้เครื่องยนต์สลัดเสียงคนร้องคู่ออกเมื่อร้องพร้อมกันสองคน
            elif "main" in model_name.lower() or "uvr_mdxnet_main" in model_name.lower():
                model = AutoMockModel("UVR-MDX-NET Main", MDX_ARCH_TYPE, ["UVR_MDXNET_Main.onnx"])
                print("=== [Replay AI Patched]: Force loading UVR_MDXNET_Main.onnx for Overlapping Duet Elimination ===")
            
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
                        url = f"https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/{f_name}"
                        response = requests.get(url, stream=True)
                        
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

            orig_device = config.device
            orig_providers = list(config.ort_providers) if hasattr(config, 'ort_providers') else ["CPUExecutionProvider"]

            if device:
                dev_clean = device.lower()
                if "cuda" in dev_clean or "gpu" in dev_clean:
                    if torch.cuda.is_available():
                        config.device = "cuda"
                        config.ort_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                    else:
                        config.device = "cpu"
                        config.ort_providers = ["CPUExecutionProvider"]
                elif "mps" in dev_clean:
                    if torch.backends.mps.is_available():
                        config.device = "mps"
                        config.ort_providers = ["CoreMLExecutionProvider", "CPUExecutionProvider"]
                    else:
                        config.device = "cpu"
                        config.ort_providers = ["CPUExecutionProvider"]
                else:
                    config.device = "cpu"
                    config.ort_providers = ["CPUExecutionProvider"]

            try:
                if model_data.process_method == VR_ARCH_TYPE:
                    seperator = SeparateVR(model_data, process_data)
                if model_data.process_method == MDX_ARCH_TYPE:
                    seperator = SeparateMDX(model_data, process_data)
                if model_data.process_method == DEMUCS_ARCH_TYPE:
                    seperator = SeparateDemucs(model_data, process_data)

                seperator.separate()

                # =================================================================================
                # 🔥 [FEATURE INSANE PATCH]: พิฆาตเสียงร้องประสาน ร้องซ้อน และเคลียร์ปัญหาร้องคู่พร้อมกัน
                # สั่งการระบบท่อส่งแบบอนุกรมอัตโนมัติ (Cascade Sequential Lead Vocal Isolation)
                # =================================================================================
                if os.path.exists(vocal_file) and model_name not in ["UVR-MDX-NET Karaoke 2", "UVR-MDX-NET Main"]:
                    write_to_console("กำลังเปิดใช้งานระบบประมวลผลอนุกรมขั้นสูง เพื่อกรองให้เหลือแต่เสียงร้องหลักบริสุทธิ์...")
                    current_vocal_target = vocal_file

                    # 🎯 ขั้นตอนที่ 1: ตัดเสียงร้องเสริม ประสาน แบคกราวด์โวคอล (Karaoke 2 Pass)
                    kara_temp_dir = os.path.join(track_dir, "cascade_kara")
                    os.makedirs(kara_temp_dir, exist_ok=True)
                    kara_onnx = os.path.join(weights_dir, "UVR_MDXNET_KARA_2.onnx")

                    if not os.path.exists(kara_onnx):
                        write_to_console("กำลังดาวน์โหลดโมเดลคัดแยกเสียงร้องหลักจากเสียงประสาน (Karaoke 2)...")
                        import requests
                        for base_url in [
                            "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR_MDXNET_KARA_2.onnx",
                            "https://huggingface.co/Anjok/model-repo/resolve/main/UVR_MDXNET_KARA_2.onnx"
                        ]:
                            try:
                                res = requests.get(base_url, stream=True)
                                if res.status_code == 200:
                                    with open(kara_onnx, "wb") as f_k:
                                        for chk in res.iter_content(chunk_size=8192):
                                            f_k.write(chk)
                                    break
                            except:
                                pass

                    if os.path.exists(kara_onnx):
                        write_to_console("-> ตรวจสอบความถี่และกำลังสลัดเสียงร้องเสริม/เสียงคอรัสประสาน...")
                        model_data_k = ModelData("UVR-MDX-NET Karaoke 2", model_path=kara_onnx, selected_process_method=MDX_ARCH_TYPE)
                        p_data_k = process_data.copy()
                        p_data_k["audio_file"] = current_vocal_target
                        p_data_k["export_path"] = kara_temp_dir
                        
                        sep_k = SeparateMDX(model_data_k, p_data_k)
                        sep_k.separate()
                        
                        v_kara_out = os.path.join(kara_temp_dir, "vocals.wav")
                        if os.path.exists(v_kara_out):
                            current_vocal_target = v_kara_out

                    # 🎯 ขั้นตอนที่ 2: จัดการปัญหาร้องคู่ ร้องซ้อนเหลื่อมไทม์ไลน์ ลบเสียงแทรกคู่ (Main Vocals Overlap Pass)
                    main_temp_dir = os.path.join(track_dir, "cascade_main")
                    os.makedirs(main_temp_dir, exist_ok=True)
                    main_onnx = os.path.join(weights_dir, "UVR_MDXNET_Main.onnx")

                    if not os.path.exists(main_onnx):
                        write_to_console("กำลังดาวน์โหลดโมเดลแก้ไขปัญหาร้องทับซ้อนและร้องคู่ (MDX-Net Main)...")
                        import requests
                        for base_url in [
                            "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR_MDXNET_Main.onnx",
                            "https://huggingface.co/Anjok/model-repo/resolve/main/UVR_MDXNET_Main.onnx"
                        ]:
                            try:
                                res = requests.get(base_url, stream=True)
                                if res.status_code == 200:
                                    with open(main_onnx, "wb") as f_m:
                                        for chk in res.iter_content(chunk_size=8192):
                                            f_m.write(chk)
                                    break
                            except:
                                pass

                    if os.path.exists(main_onnx):
                        write_to_console("-> จัดการระบบเมทริกซ์ลบการร้องซ้อนคู่และคลื่นเสียงแทรกสะท้อน...")
                        model_data_m = ModelData("UVR-MDX-NET Main", model_path=main_onnx, selected_process_method=MDX_ARCH_TYPE)
                        p_data_m = process_data.copy()
                        p_data_m["audio_file"] = current_vocal_target
                        p_data_m["export_path"] = main_temp_dir
                        
                        sep_m = SeparateMDX(model_data_m, p_data_m)
                        sep_m.separate()
                        
                        v_main_out = os.path.join(main_temp_dir, "vocals.wav")
                        if os.path.exists(v_main_out):
                            current_vocal_target = v_main_out

                    # เขียนไฟล์ล้างเสียงประสาน+เสียงร้องซ้อนทับกลับไปยังจุดส่งออกหลักของระบบ
                    if current_vocal_target != vocal_file:
                        shutil.copy2(current_vocal_target, vocal_file)
                        write_to_console("=== คัดแยกเลเยอร์เสียงร้องหลักบริสุทธิ์ (Absolute Lead Vocals) เรียบร้อยแล้ว ===")
                # =================================================================================

                return vocal_file, no_vocals_wav
            finally:
                config.device = orig_device
                config.ort_providers = orig_providers