# 🚀 คู่มือการติดตั้ง GG-Replay แบบละเอียด (ฉบับสมบูรณ์)

คู่มือนี้จะพาคุณติดตั้งและรัน **GG-Replay** ตั้งแต่เริ่มต้นจนใช้งานได้จริง พร้อมคำอธิบายทุกขั้นตอนและวิธีแก้ปัญหาที่พบบ่อย

---

## 📋 สารบัญ

1. [ตรวจสอบระบบของคุณ](#1-ตรวจสอบระบบของคุณ)
2. [ติดตั้ง Prerequisites](#2-ติดตั้ง-prerequisites)
3. [Clone Repository](#3-clone-repository)
4. [ติดตั้ง Python Environment](#4-ติดตั้ง-python-environment)
5. [ติดตั้ง Frontend Dependencies](#5-ติดตั้ง-frontend-dependencies)
6. [รันแอปพลิเคชัน (Development)](#6-รันแอปพลิเคชัน-development)
7. [Build Production Version](#7-build-production-version)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. ตรวจสอบระบบของคุณ

### ✅ Requirements ขั้นต่ำ

| รายการ | ขั้นต่ำ | แนะนำ |
|:---|:---|:---|
| **RAM** | 8 GB | 16 GB ขึ้นไป |
| **Disk Space** | 10 GB (ไม่รวม AI Models) | 20 GB ขึ้นไป |
| **GPU** | CPU (ช้า) | NVIDIA GTX 1060+ (VRAM 4GB+) |
| **OS** | Windows 10+, macOS 11+, Ubuntu 20.04+ | Latest version |

### 🎯 ตรวจสอบ GPU (สำหรับ NVIDIA)

**Windows:**
```powershell
# เปิด PowerShell แล้วรัน
nvidia-smi
```

**Linux:**
```bash
nvidia-smi
```

**macOS:**
```bash
# macOS ไม่รองรับ CUDA โดยตรง (ใช้ CPU หรือ MPS สำหรับ Apple Silicon)
system_profiler SPDisplaysDataType
```

> 💡 **หมายเหตุ:** หากคุณมี NVIDIA GPU ให้จด **CUDA Version** ไว้ (เช่น CUDA 11.8, 12.1) เพราะจะต้องใช้ในการติดตั้ง PyTorch

---

## 2. ติดตั้ง Prerequisites

### 📦 2.1 ติดตั้ง Go (Golang)

**ดาวน์โหลด:** [https://go.dev/dl/](https://go.dev/dl/)

**เลือกเวอร์ชัน:** 1.20 ขึ้นไป (แนะนำ 1.21+)

**Windows:**
1. ดาวน์โหลดไฟล์ `.msi`
2. ดับเบิลคลิกติดตั้ง
3. รีสตาร์ท Terminal/Command Prompt

**macOS:**
```bash
# วิธีที่ 1: ใช้ Homebrew (แนะนำ)
brew install go

# วิธีที่ 2: ดาวน์โหลด .pkg จากเว็บ
```

**Linux (Ubuntu/Debian):**
```bash
# ดาวน์โหลด Go
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz

# ลบการติดตั้งเก่า (ถ้ามี)
sudo rm -rf /usr/local/go

# แตกไฟล์
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz

# เพิ่ม PATH
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

**ตรวจสอบการติดตั้ง:**
```bash
go version
# ควรแสดง: go version go1.21.5 windows/amd64 (หรือ macOS/linux)
```

---

### 📦 2.2 ติดตั้ง Node.js

**ดาวน์โหลด:** [https://nodejs.org/](https://nodejs.org/)

**เลือกเวอร์ชัน:** 18 LTS ขึ้นไป (แนะนำ 20 LTS)

**Windows:**
1. ดาวน์โหลดไฟล์ `.msi`
2. ดับเบิลคลิกติดตั้ง (เลือก "Automatically install necessary tools" ถ้ามี)

**macOS:**
```bash
# ใช้ Homebrew
brew install node
```

**Linux:**
```bash
# ใช้ NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**ตรวจสอบการติดตั้ง:**
```bash
node --version
# ควรแสดง: v20.10.0 (หรือสูงกว่า)

npm --version
# ควรแสดง: 10.2.3 (หรือสูงกว่า)
```

---

### 📦 2.3 ติดตั้ง Python

**ดาวน์โหลด:** [https://www.python.org/downloads/](https://www.python.org/downloads/)

**เลือกเวอร์ชัน:** 3.10 (แนะนำ) หรือ 3.11

**⚠️ สำคัญมากสำหรับ Windows:**
- ☑️ **ติ๊ก "Add Python to PATH"** ก่อนกด Install
- เลือก "Customize installation" → ติ๊ก "py launcher" และ "for all users"

**macOS:**
```bash
brew install python@3.10
```

**Linux:**
```bash
sudo apt update
sudo apt install python3.10 python3.10-venv python3-pip
```

**ตรวจสอบการติดตั้ง:**
```bash
python --version
# หรือ
python3 --version
# ควรแสดง: Python 3.10.x

pip --version
# หรือ
pip3 --version
```

---

### 📦 2.4 ติดตั้ง Wails CLI

Wails CLI คือเครื่องมือสำหรับ Build และรันแอป Wails

**Windows (PowerShell):**
```powershell
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

**macOS/Linux:**
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

**เพิ่ม Go bin เข้า PATH:**

**Windows:**
1. เปิด System Properties → Environment Variables
2. ใน "User variables" หา `Path` → Edit
3. เพิ่ม: `C:\Users\[Username]\go\bin`

**macOS/Linux:**
```bash
echo 'export PATH=$PATH:$(go env GOPATH)/bin' >> ~/.bashrc
source ~/.bashrc
```

**ตรวจสอบการติดตั้ง:**
```bash
wails version
# ควรแสดง: Wails CLI v2.x.x
```

**ตรวจสอบ Dependencies:**
```bash
wails doctor
```

คำสั่งนี้จะตรวจสอบว่าระบบของคุณมีทุกอย่างที่จำเป็นหรือไม่ หากขาดอะไร จะแนะนำวิธีติดตั้ง

---

### 📦 2.5 ติดตั้ง C/C++ Compiler

#### **Windows:**

**วิธีที่ 1: Visual Studio Build Tools (แนะนำ)**
1. ดาวน์โหลด: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. ติดตั้ง → เลือก "Desktop development with C++"
3. ตรวจสอบว่าติ๊กถูกที่:
   - ☑️ MSVC v143 - VS 2022 C++ x64/x86 build tools
   - ☑️ Windows 10 SDK (10.0.19041.0 หรือใหม่กว่า)

**วิธีที่ 2: MinGW-w64**
1. ดาวน์โหลด: [MinGW-w64](https://www.mingw-w64.org/)
2. ติดตั้งและเพิ่มเข้า PATH

#### **macOS:**
```bash
xcode-select --install
# กด Install เมื่อมี popup ขึ้นมา
```

#### **Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install build-essential libgtk-3-dev libwebkit2gtk-4.0-dev
```

**ตรวจสอบการติดตั้ง:**
```bash
# Windows
cl

# macOS/Linux
gcc --version
```

---

## 3. Clone Repository

### 📥 ดาวน์โหลดโปรเจกต์

**วิธีที่ 1: ใช้ Git (แนะนำ)**
```bash
# เปิด Terminal/Command Prompt
# ไปยังโฟลเดอร์ที่ต้องการเก็บโปรเจกต์
cd ~/Projects  # หรือ C:\Projects บน Windows

# Clone repository
git clone https://github.com/worgurn/Replay.git
cd Replay

# สลับไป branch judy (ถ้าไม่ได้อยู่แล้ว)
git checkout judy
```

**วิธีที่ 2: ดาวน์โหลด ZIP**
1. ไปที่ repository บนเว็บ
2. คลิก "Code" → "Download ZIP"
3. แตกไฟล์ ZIP
4. เปิด Terminal ในโฟลเดอร์ที่แตกออกมา

**ตรวจสอบโครงสร้าง:**
```bash
# คุณควรเห็นโฟลเดอร์เหล่านี้:
ls  # หรือ dir บน Windows
# app.go  main.go  frontend/  python/  data/  build/  scripts/  ...
```

---

## 4. ติดตั้ง Python Environment

ส่วนนี้สำคัญมาก เพราะ AI Processing ทั้งหมดรันบน Python

### 🐍 4.1 สร้าง Virtual Environment

**Windows:**
```powershell
# เข้าไปที่โฟลเดอร์ python
cd python

# สร้าง virtual environment
python -m venv venv

# เปิดใช้งาน virtual environment
.\venv\Scripts\activate

# คุณจะเห็น (venv) หน้า command prompt
# ตัวอย่าง: (venv) C:\Projects\Replay\python>
```

**macOS/Linux:**
```bash
# เข้าไปที่โฟลเดอร์ python
cd python

# สร้าง virtual environment
python3 -m venv venv

# เปิดใช้งาน virtual environment
source venv/bin/activate

# คุณจะเห็น (venv) หน้า command prompt
# ตัวอย่าง: (venv) user@machine:~/Projects/Replay/python$
```

> ⚠️ **สำคัญ:** ทุกครั้งที่คุณเปิด Terminal ใหม่เพื่อทำงานกับ Python คุณต้อง activate virtual environment ก่อน!

---

### 📚 4.2 ติดตั้ง Dependencies

**Upgrade pip ก่อน:**
```bash
python -m pip install --upgrade pip
```

**ติดตั้ง libraries จาก requirements.txt:**
```bash
pip install -r requirements.txt
```

กระบวนการนี้อาจใช้เวลา **5-15 นาที** ขึ้นกับความเร็วอินเทอร์เน็ต

**ตรวจสอบการติดตั้ง:**
```bash
pip list
# ควรเห็น libraries เช่น: torch, torchaudio, numpy, scipy, librosa, etc.
```

---

### 🎮 4.3 ติดตั้ง PyTorch (เลือกตาม Hardware)

#### **กรณี 1: ใช้ NVIDIA GPU (CUDA)**

**ตรวจสอบ CUDA Version:**
```bash
nvidia-smi
# ดูที่ "CUDA Version" มุมขวาบน
```

**ติดตั้ง PyTorch สำหรับ CUDA:**

**CUDA 11.8:**
```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118
```

**CUDA 12.1:**
```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
```

**CUDA 12.4:**
```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
```

#### **กรณี 2: ใช้ CPU เท่านั้น**

```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
```

#### **กรณี 3: macOS (Apple Silicon - M1/M2/M3)**

```bash
pip install torch torchaudio
# PyTorch จะใช้ MPS (Metal Performance Shaders) โดยอัตโนมัติ
```

**ตรวจสอบการติดตั้ง PyTorch:**
```bash
python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA devices: {torch.cuda.device_count()}' if torch.cuda.is_available() else 'CPU only')"
```

**ผลลัพธ์ที่ควรเห็น:**
```
PyTorch: 2.1.0+cu118
CUDA available: True
CUDA devices: 1
```

หรือสำหรับ CPU:
```
PyTorch: 2.1.0+cpu
CUDA available: False
CPU only
```

---

### 📥 4.4 ดาวน์โหลด AI Models (ถ้าจำเป็น)

โปรเจกต์นี้มีสคริปต์ช่วยดาวน์โหลดโมเดล:

```bash
# กลับไปที่ root folder
cd ..

# ไปที่ scripts/downloader
cd scripts/downloader

# รันตัวดาวน์โหลด (ดูรายละเอียดในโฟลเดอร์)
python download_models.py

# หรือรัน manual download ตาม README ในโฟลเดอร์นั้น
```

**โมเดลที่ต้องมี:**
- **RVC Models** (.pth) - สำหรับ Voice Conversion
- **Demucs Models** - สำหรับแยกเสียง
- **UVR Models** - สำหรับแยกเสียงร้อง

**โฟลเดอร์ที่เก็บโมเดล:**
```
data/
├── models/
│   ├── rvc/           # RVC voice models
│   ├── demucs/        # Demucs models
│   └── uvr/           # UVR models
```

---

## 5. ติดตั้ง Frontend Dependencies

### 🎨 5.1 ติดตั้ง Node.js Packages

**กลับไปที่ root folder:**
```bash
# หากคุณยังอยู่ใน python/ ให้กลับออกมาก่อน
cd ..
```

**เข้าไปที่ frontend:**
```bash
cd frontend
```

**ติดตั้ง dependencies:**
```bash
npm install
```

กระบวนการนี้จะดาวน์โหลด packages ทั้งหมด (React, Vite, Tailwind, etc.) อาจใช้เวลา **2-5 นาที**

**ตรวจสอบการติดตั้ง:**
```bash
npm list --depth=0
# ควรเห็น packages เช่น: react, react-dom, vite, typescript, etc.
```

**กลับไปที่ root folder:**
```bash
cd ..
```

---

## 6. รันแอปพลิเคชัน (Development)

### 🚀 6.1 Development Mode (Hot-Reload)

**ตรวจสอบว่าคุณอยู่ที่ root folder:**
```bash
# ควรมีไฟล์ wails.json อยู่ในโฟลเดอร์นี้
ls wails.json  # หรือ dir wails.json บน Windows
```

**รันแอป:**
```bash
wails dev
```

**สิ่งที่เกิดขึ้น:**
1. ✅ Wails จะ Build Go Backend
2. ✅ Vite จะรัน Frontend Development Server
3. ✅ หน้าต่างแอปจะเปิดขึ้นมา
4. ✅ Hot-Reload ทำงาน (แก้โค้ดแล้วเห็นผลทันที)

**Terminal Output ที่ควรเห็น:**
```
Building application for development mode
...
VITE v5.0.0  ready in 500 ms
...
App running at: http://localhost:34115
```

---

### 🐍 6.2 รัน Python Server แยก (ถ้าจำเป็น)

ในบางกรณี Go Backend อาจไม่รัน Python Server อัตโนมัติ ให้เปิด **Terminal ใหม่** แล้ว:

**Windows:**
```powershell
# เปิด PowerShell ใหม่
cd C:\Projects\Replay

# Activate virtual environment
python\venv\Scripts\activate

# รัน Python server
python python/server.py
```

**macOS/Linux:**
```bash
# เปิด Terminal ใหม่
cd ~/Projects/Replay

# Activate virtual environment
source python/venv/bin/activate

# รัน Python server
python python/server.py
```

**ตรวจสอบว่า Server รันอยู่:**
- เปิด Browser ไปที่ `http://localhost:8000` (หรือ port ที่กำหนดใน `server.py`)
- ควรเห็น API documentation หรือ "Server is running"

---

### ✅ 6.3 ตรวจสอบว่าแอปทำงานได้

**ทดสอบฟีเจอร์พื้นฐาน:**
1. ✅ หน้าต่างแอปเปิดขึ้นมา
2. ✅ UI แสดงผลถูกต้อง
3. ✅ สามารถเลือกไฟล์เสียงได้
4. ✅ สามารถเลือกโมเดล AI ได้
5. ✅ กดปุ่ม "Process" แล้วเห็น progress

**ถ้ามีปัญหา:** ดู section [Troubleshooting](#8-troubleshooting)

---

## 7. Build Production Version

เมื่อพัฒนาเสร็จและต้องการสร้างไฟล์ติดตั้ง (.exe / .app)

### 📦 7.1 Build Python Executable (ถ้าจำเป็น)

โปรเจกต์ใช้ **PyInstaller** เพื่อแพ็ก Python เป็น executable

**Windows:**
```powershell
# Activate virtual environment
python\venv\Scripts\activate

# เข้าไปที่โฟลเดอร์ python
cd python

# Build สำหรับ Windows
pyinstaller packager-win.spec
```

**macOS:**
```bash
# Activate virtual environment
source python/venv/bin/activate

# เข้าไปที่โฟลเดอร์ python
cd python

# Build สำหรับ macOS
pyinstaller packager-mac.spec
```

**ผลลัพธ์:** ไฟล์ executable จะอยู่ใน `python/dist/`

---

### 🏗️ 7.2 Build Wails Application

**กลับไปที่ root folder:**
```bash
cd ..
```

**Build ปกติ:**
```bash
wails build
```

**Build แบบ Optimize (แนะนำ):**
```bash
# ใช้ UPX เพื่อลดขนาดไฟล์ + ซ่อน console window (Windows)
wails build -upx -clean -m
```

**ตัวเลือกเพิ่มเติม:**
```bash
# Build สำหรับ platform อื่น (cross-compile)
wails build -platform windows/amd64
wails build -platform darwin/amd64
wails build -platform linux/amd64
```

**ผลลัพธ์:**
- **Windows:** `build/bin/gg-replay.exe`
- **macOS:** `build/bin/gg-replay.app`
- **Linux:** `build/bin/gg-replay`

---

### 📤 7.3 แจกจ่ายแอป

**Windows:**
- แจกไฟล์ `.exe` ใน `build/bin/`
- หรือสร้าง Installer ด้วย NSIS (ไฟล์อยู่ใน `build/windows/`)

**macOS:**
- แจกไฟล์ `.app` ใน `build/bin/`
- หรือสร้าง `.dmg` สำหรับ distribution

**Linux:**
- แจก binary file ใน `build/bin/`
- หรือสร้าง `.deb` / `.rpm` package

---

## 8. Troubleshooting

### ❌ ปัญหาที่พบบ่อยและวิธีแก้

#### **1. `wails: command not found`**

**สาเหตุ:** Wails CLI ยังไม่ได้ติดตั้ง หรือ PATH ไม่ถูกต้อง

**วิธีแก้:**
```bash
# ติดตั้ง Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# ตรวจสอบ PATH
echo $PATH  # macOS/Linux
echo %PATH%  # Windows

# เพิ่ม Go bin เข้า PATH
# Windows: C:\Users\[Username]\go\bin
# macOS/Linux: $(go env GOPATH)/bin
```

---

#### **2. `python: command not found` หรือ `python3: command not found`**

**สาเหตุ:** Python ยังไม่ได้ติดตั้ง หรือไม่ได้เพิ่มเข้า PATH

**วิธีแก้:**
- **Windows:** ติดตั้ง Python ใหม่ และติ๊ก "Add Python to PATH"
- **macOS:** ใช้ `python3` แทน `python`
- **Linux:** `sudo apt install python3`

---

#### **3. `ModuleNotFoundError: No module named 'torch'`**

**สาเหตุ:** ยังไม่ได้ activate virtual environment หรือยังไม่ได้ติดตั้ง PyTorch

**วิธีแก้:**
```bash
# Activate virtual environment
# Windows:
.\venv\Scripts\activate

# macOS/Linux:
source venv/bin/activate

# ติดตั้ง PyTorch
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118
```

---

#### **4. `CUDA out of memory`**

**สาเหตุ:** GPU มี VRAM ไม่พอสำหรับโมเดล AI

**วิธีแก้:**
1. ใช้โมเดลที่เล็กลง
2. ลด batch size ใน config
3. ใช้ CPU แทน (ช้ากว่าแต่ไม่จำกัด VRAM)
4. ปิดแอปอื่นที่ใช้ GPU

---

#### **5. Frontend ไม่แสดง UI (หน้าขาว)**

**สาเหตุ:** Frontend dependencies ยังไม่ได้ติดตั้ง หรือ Vite server มีปัญหา

**วิธีแก้:**
```bash
cd frontend

# ลบ node_modules และติดตั้งใหม่
rm -rf node_modules  # macOS/Linux
rmdir /s /q node_modules  # Windows

npm install

# กลับไปที่ root แล้วรันใหม่
cd ..
wails dev
```

---

#### **6. `Permission denied` (macOS/Linux)**

**สาเหตุ:** ไม่มีสิทธิ์ในการรันไฟล์

**วิธีแก้:**
```bash
# ให้สิทธิ์ execute
chmod +x build/bin/gg-replay

# หรือรันด้วย sudo (ไม่แนะนำ)
sudo ./build/bin/gg-replay
```

---

#### **7. Python Server ไม่เริ่มต้นอัตโนมัติ**

**สาเหตุ:** Logic ใน `app.go` ไม่ได้ตั้งค่าให้รัน Python server

**วิธีแก้:** รัน Python server แยกใน Terminal ใหม่ (ดู section 6.2)

---

### 🔍 Debugging Tips

**1. ดู Logs:**
```bash
# Wails logs จะแสดงใน Terminal ที่รัน wails dev
# Python logs จะแสดงใน Terminal ที่รัน python server.py
```

**2. ตรวจสอบ Port:**
```bash
# ดูว่า port 8000 (Python) และ 34115 (Vite) ถูกใช้งานอยู่หรือไม่
# Windows:
netstat -ano | findstr :8000

# macOS/Linux:
lsof -i :8000
```

**3. ทดสอบ Python Server:**
```bash
# เปิด Browser ไปที่
http://localhost:8000/docs  # ถ้าใช้ FastAPI
```

**4. ทดสอบ Frontend:**
```bash
cd frontend
npm run dev
# เปิด Browser ไปที่ http://localhost:5173
```

---

## 📞 ขอความช่วยเหลือ

หากยังแก้ปัญหาไม่ได้:

1. **ตรวจสอบ `wails doctor`:**
   ```bash
   wails doctor
   ```

2. **อ่าน Error Message ให้ละเอียด** - มักจะมีคำใบ้อยู่

3. **ค้นหาใน GitHub Issues** - อาจมีคนเจอปัญหาเดียวกัน

4. **สร้าง Issue ใหม่** พร้อมข้อมูล:
   - OS และเวอร์ชัน
   - Output ของ `wails doctor`
   - Error message ทั้งหมด
   - ขั้นตอนที่ทำก่อนเกิด error

---

## 🎉 สำเร็จแล้ว!

ตอนนี้คุณมี **GG-Replay** พร้อมใช้งานแล้ว!

