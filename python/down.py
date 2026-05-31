# python/downloader.py

import os
import sys
import requests
from pathlib import Path
from tqdm import tqdm

class ModelDownloader:
    def __init__(self, base_dir="data"):
        self.base_dir = Path(base_dir)
        self.models_dir = self.base_dir / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        
        # รายการไฟล์ที่ต้องดาวน์โหลดแยก
        self.required_downloads = {
            # AI Models (จำเป็น)
            "rvc_base.pth": {
                "url": "https://huggingface.co/your-repo/models/resolve/main/rvc_base.pth",
                "size_mb": 150,
                "required": True,
            },
            "hubert_base.pt": {
                "url": "https://huggingface.co/your-repo/models/resolve/main/hubert_base.pt",
                "size_mb": 190,
                "required": True,
            },
            "demucs_model.th": {
                "url": "https://huggingface.co/your-repo/models/resolve/main/demucs_model.th",
                "size_mb": 300,
                "required": True,
            },
            
            # CUDA Libraries (optional - สำหรับ GPU)
            "cudart64_118.dll": {
                "url": "https://huggingface.co/your-repo/cuda/resolve/main/cudart64_118.dll",
                "size_mb": 50,
                "required": False,
            },
        }
    
    def check_missing_files(self):
        """ตรวจสอบไฟล์ที่ยังไม่ได้ดาวน์โหลด"""
        missing = []
        for filename, info in self.required_downloads.items():
            file_path = self.models_dir / filename
            if not file_path.exists():
                missing.append((filename, info))
        return missing
    
    def download_file(self, filename, info):
        """ดาวน์โหลดไฟล์เดียว"""
        file_path = self.models_dir / filename
        url = info["url"]
        size_mb = info["size_mb"]
        
        print(f"Downloading {filename} ({size_mb} MB)...")
        
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        
        with open(file_path, 'wb') as f:
            with tqdm(total=total_size, unit='B', unit_scale=True, desc=filename) as pbar:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        pbar.update(len(chunk))
        
        print(f"✓ {filename} downloaded successfully")
    
    def download_all_required(self):
        """ดาวน์โหลดไฟล์ที่จำเป็นทั้งหมด"""
        missing = self.check_missing_files()
        
        if not missing:
            print("All required files are already downloaded!")
            return True
        
        print(f"\nFound {len(missing)} missing files:")
        for filename, info in missing:
            status = "REQUIRED" if info["required"] else "OPTIONAL"
            print(f"  - {filename} ({info['size_mb']} MB) [{status}]")
        
        # ดาวน์โหลดเฉพาะไฟล์ที่จำเป็นก่อน
        required_missing = [(f, i) for f, i in missing if i["required"]]
        
        print(f"\nDownloading {len(required_missing)} required files...")
        for filename, info in required_missing:
            try:
                self.download_file(filename, info)
            except Exception as e:
                print(f"✗ Failed to download {filename}: {e}")
                return False
        
        # ถามว่าต้องการดาวน์โหลด optional files หรือไม่
        optional_missing = [(f, i) for f, i in missing if not i["required"]]
        if optional_missing:
            print(f"\nFound {len(optional_missing)} optional files (CUDA libraries, etc.)")
            choice = input("Download optional files for GPU support? (y/n): ")
            if choice.lower() == 'y':
                for filename, info in optional_missing:
                    try:
                        self.download_file(filename, info)
                    except Exception as e:
                        print(f"✗ Failed to download {filename}: {e}")
        
        print("\n✓ All downloads completed!")
        return True

if __name__ == "__main__":
    downloader = ModelDownloader()
    downloader.download_all_required()