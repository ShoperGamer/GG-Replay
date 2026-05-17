import os
from threading import Lock

from inference.config import config

HUBERT_LOCK = Lock()


class HubertModel:
    def __init__(
        self,
    ):
        self.hubert_model = None

    def load_model(self, weights_path: str):
        from fairseq import checkpoint_utils

        with HUBERT_LOCK:
            if self.hubert_model is not None:
                return

            model_file_path = os.path.join(weights_path, "hubert_base.pt")

            # --- [แก้ไขเพิ่มเติม]: ระบบตรวจสอบและสตรีมดาวน์โหลด hubert_base.pt อัตโนมัติป้องกันอาการแครช ---
            if not os.path.exists(model_file_path):
                os.makedirs(weights_path, exist_ok=True)
                msg = "Foundational RVC model component 'hubert_base.pt' is missing."
                print(msg)
                print("Downloading 'hubert_base.pt' automatically from secure mirrors... Please wait.")
                
                try:
                    import requests
                    # รายการลิงก์ดาวน์โหลดสากลประสิทธิภาพสูงของกลุ่มนักพัฒนา RVC
                    urls = [
                        "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt",
                        "https://huggingface.co/sc94/RVC_Models/resolve/main/hubert_base.pt",
                        "https://github.com/7777777MiKa/RVC-Weights/releases/download/v2/hubert_base.pt"
                    ]
                    
                    downloaded = False
                    for url in urls:
                        print(f"Connecting to mirror: {url}")
                        try:
                            response = requests.get(url, stream=True, timeout=30)
                            if response.status_code == 200:
                                with open(model_file_path, "wb") as f:
                                    for chunk in response.iter_content(chunk_size=8192):
                                        if chunk:
                                            f.write(chunk)
                                print("Successfully downloaded 'hubert_base.pt' into data/models folder!")
                                downloaded = True
                                break
                            else:
                                print(f"Mirror responded with HTTP status code: {response.status_code}")
                        except Exception as mirror_err:
                            print(f"Skipping unresponsive mirror: {mirror_err}")
                            
                    if not downloaded:
                        raise RuntimeError("All RVC foundational model download mirrors failed to respond.")
                        
                except Exception as err:
                    # หากไฟล์ดาวน์โหลดไม่สมบูรณ์ให้ลบทิ้งทันทีเพื่อไม่ให้ระบบบันทึกไฟล์เสีย
                    if os.path.exists(model_file_path):
                        try: os.remove(model_file_path)
                        except: pass
                    raise RuntimeError(
                        f"Failed to auto-download 'hubert_base.pt': {err}. "
                        f"Please download it manually from HuggingFace (lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt) "
                        f"and drop it directly inside your local folder: '{weights_path}'"
                    )
            # -------------------------------------------------------------------------------------------

            models, _, _ = checkpoint_utils.load_model_ensemble_and_task(
                [model_file_path],
            )
            model = models[0].to(config.device)
            self.hubert_model = model.float()
            self.hubert_model.eval()


hubert_model = HubertModel()