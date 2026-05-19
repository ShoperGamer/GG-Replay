import os
import subprocess
import numpy as np


def load_audio(file, sr) -> np.ndarray:
    try:
        # https://github.com/openai/whisper/blob/main/whisper/audio.py#L26
        # [แก้ไขสำคัญ]: ปรับปรุงมาใช้ระบบ Subprocess ของ Python เรียกหา ffmpeg.exe CLI โดยตรง
        # เพื่อตัดขาด dependency แพ็กเกจ ffmpeg-python ออกอย่างถาวร รันผ่าน venv ได้ 100%
        file = file.strip(" ").strip('"').strip("\n").strip('"').strip(" ")
        
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-i", file,
            "-f", "f32le",
            "-acodec", "pcm_f32le",
            "-ac", "1",
            "-ar", str(sr),
            "-"
        ]
        
        # ป้องกันไม่ให้หน้าต่าง cmd สีดำเด้งขึ้นมาขัดจังหวะผู้ใช้งานบน Windows
        creationflags = 0
        if os.name == 'nt':
            creationflags = 0x08000000  # CREATE_NO_WINDOW

        res = subprocess.run(
            cmd,
            capture_output=True,
            creationflags=creationflags
        )
        
        if res.returncode != 0:
            raise RuntimeError(res.stderr.decode('utf-8', errors='ignore'))
            
        out = res.stdout

    except Exception as e:
        raise RuntimeError(f"Failed to load audio file {file}: {e}")

    return np.frombuffer(out, np.float32).flatten()


def seconds_to_time(seconds):
    # This function takes an integer number of seconds and returns a string in the format MM:SS
    minutes, seconds = divmod(seconds, 60)
    return "{:02}:{:02}".format(int(minutes), int(seconds))


def find_pth_and_index_files(directory):
    pth_files = []
    index_files = []

    # 1. [แก้ไขเพิ่มเติม]: หากเส้นทางที่ส่งมาเป็น "ไฟล์ .pth โดยตรง" ไม่ใช่โฟลเดอร์ ให้ดึงไฟล์นั้นมาใช้งานทันที
    if os.path.isfile(directory) and directory.lower().endswith(".pth"):
        pth_files.append(directory)
        # ทำการค้นหาไฟล์ .index คู่กันที่อยู่ในโฟลเดอร์ระดับเดียวกัน
        parent_dir = os.path.dirname(directory)
        if os.path.exists(parent_dir):
            for filename in os.listdir(parent_dir):
                if filename.lower().endswith(".index"):
                    index_files.append(os.path.join(parent_dir, filename))
        return pth_files, index_files

    # 2. หากเป็นโฟลเดอร์โครงสร้าง ให้ค้นหาภายในตามปกติ
    if os.path.isdir(directory):
        for root, _, files in os.walk(directory):
            for filename in files:
                lower_filename = filename.lower()
                if lower_filename.endswith(".pth"):
                    pth_files.append(os.path.join(root, filename))
                if lower_filename.endswith(".index"):
                    index_files.append(os.path.join(root, filename))
        if pth_files:
            return pth_files, index_files

    # 3. [เซฟตี้เพิ่มเติม]: กรณีเป็นชื่อโมเดลแต่ไฟล์จริงอยู่ในโฟลเดอร์แม่ (Parent Directory)
    parent_dir = os.path.dirname(directory)
    if os.path.exists(parent_dir):
        for filename in os.listdir(parent_dir):
            full_p = os.path.join(parent_dir, filename)
            if os.path.isfile(full_p) and filename.lower().endswith(".pth") and (directory.lower() in full_p.lower() or full_p.lower() == directory.lower()):
                pth_files.append(full_p)
            if filename.lower().endswith(".index"):
                index_files.append(os.path.join(parent_dir, filename))

    if len(pth_files) == 0:
        raise RuntimeError(f"No .pth files found in {directory}")
    return pth_files, index_files