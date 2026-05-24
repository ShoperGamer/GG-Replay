

# 🎵 GG-Replay (อยู่ในช่วงพัฒนา)

<div align="center">
  <p>
    <img src="https://img.shields.io/github/repo-size/ShoperGamer/GG-Replay?style=for-the-badge&color=44cc11" alt="Repo Size">
    <img src="https://img.shields.io/badge/Wails-990000?style=for-the-badge&logo=wails&logoColor=white" alt="Wails">
    <img src="https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go">
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
    <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
    <img src="https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white" alt="PyTorch">
  </p>
</div>

**GG-Replay** เป็นแอปพลิเคชันเดสก์ท็อปสำหรับการประมวลผลเสียงด้วย AI (AI Audio Processing) รองรับการทำ Voice Conversion (RVC), การแยกเสียงร้อง/เครื่องดนตรี (Demucs/UVR) โดยใช้ **Wails** เป็นแกนหลักในการผสานระหว่าง **Go Backend**, **React Frontend** และ **Python AI Inference Server**

ได้รับแรงบันดาลใจและพัฒนาต่อยอดมาจาก [Replay (THE-SINDOL)](https://github.com/THE-SINDOL/replay-app) และ [weights.com/replay](https://www.weights.com/replay)

---

## 🛠 Tech Stack (เทคโนโลยีที่ใช้)

### 🎨 Frontend (หน้าบ้าน)
- **React + TypeScript** - ไลบรารีหลักสำหรับสร้าง UI
- **Vite** - เครื่องมือ Build Tool ที่มีความเร็วสูง
- **CSS / Tailwind** - สำหรับจัดการสไตล์ของหน้าแอปพลิเคชัน

### ⚙️ Backend (หลังบ้าน)
- **Go (Golang)** - จัดการระบบของแอปพลิเคชันเดสก์ท็อปผ่าน Wails Framework
- **Python (3.10+)** - จัดการระบบ AI Inference และ Audio Processing (Server & Packager)

### 🤖 AI & Audio Processing
- **RVC (Retrieval-based Voice Conversion)** - สำหรับแปลงเสียงร้อง
- **Demucs / UVR (Ultimate Vocal Remover)** - สำหรับแยก Track เสียง
- **PyTorch** - Framework สำหรับรันโมเดล AI

---

## 📂 Directory Tree (โครงสร้างโปรเจกต์)

ขนาดโปรเจกต์โดยประมาณ: **~100+ ไฟล์** (ไม่รวมไฟล์ออฟไลน์โมเดลและ `node_modules`)

```
replay-go/
│
├── 📄 app.go                      # ไฟล์หลักที่เชื่อม Go Backend กับ Frontend (ผ่าน Wails bindings)
├── 📄 main.go                     # จุดเริ่มต้นการรัน Wails Application (entry point ของ Go)
├── 📄 wails.json                  # ไฟล์กำหนดค่าโปรเจกต์ Wails (config หลัก)
├── 📄 go.mod                      # รายการ Go module dependencies
├── 📄 go.sum                      # checksum ของ Go dependencies
├── 📄 package.json                # จัดการ Node.js dependencies (สำหรับ frontend tooling)
├── 📄 package-lock.json           # lock เวอร์ชันของ Node.js dependencies
├── 📄 server.go                   # จัดการ HTTP Server ของ Go Backend
├── 📄 queue.go                    # ระบบจัดการ Queue สำหรับงาน AI Processing
├── 📄 models.go                   # จัดการโมเดล AI (โหลด/บันทึก/รายชื่อโมเดล)
├── 📄 device.go                   # ตรวจสอบและจัดการ Device (CPU/GPU) สำหรับรัน AI
├── 📄 .gitignore                  # กำหนดไฟล์ที่ไม่ต้อง commit ลง Git
├── 📄 LICENSE                     # ไฟล์ลิขสิทธิ์ของโปรเจกต์
├── 📄 README.md                   # คู่มือการใช้งานโปรเจกต์
│
├── 📂 initialization/             # 🚀 ระบบเตรียมความพร้อมตอนเริ่มแอป
│   └── 📄 initialization.go       # โหลด config, ตรวจสอบ environment, สร้างโฟลเดอร์ data/
│
├── 📂 inference/                  # 🧠 ระบบจัดการ AI Inference (Go side)
│   ├── 📄 config.go               # จัดการ configuration ของ inference engine
│   ├── 📄 file_utils.go           # ฟังก์ชันช่วยจัดการไฟล์เสียง (read/write/convert)
│   ├── 📄 manager.go              # ตัวจัดการ lifecycle ของ inference process
│   ├── 📄 options.go              # กำหนด options/parameters สำหรับ AI processing
│   ├── 📄 python_bridge.go        # ตัวเชื่อมระหว่าง Go กับ Python AI Server (IPC/HTTP)
│   └── 📄 status.go               # ติดตามสถานะของงาน inference (running/completed/failed)
│
├── 📂 frontend/                   # 🎨 React UI (Frontend ทั้งหมด)
│   ├── 📂 src/                    # ซอร์สโค้ดหลักของแอปพลิเคชัน
│   │   ├── 📂 components/         # UI Components ที่ใช้ซ้ำได้ (เช่น Waveform.tsx)
│   │   ├── 📂 pages/              # หน้าต่างหลักของแอป (Home, Demucs, Download, Share)
│   │   └── 📂 assets/             # ฟอนต์, รูปภาพ และไฟล์ CSS สำหรับ styling
│   ├── 📂 wailsjs/                # Auto-generated bindings สำหรับให้ JS คุยกับ Go
│   ├── 📄 index.html              # หน้าหลักของแอป (Entry point ของ HTML)
│   └── 📄 vite.config.ts          # ตั้งค่าการ Build Frontend ด้วย Vite
│
├── 📂 python/                     # 🤖 AI & Audio Processing Engine (Python)
│   ├── 📂 inference/              # ระบบประมวลผลเสียงด้วย AI
│   │   ├── 📂 uvr/                # โมเดลแยกเสียงร้อง (Ultimate Vocal Remover)
│   │   └── 📂 infer_pack/         # ตัวจัดการโมเดล AI (RVC Inference)
│   ├── 📂 demucs/                 # ระบบแยกเสียงเครื่องดนตรี (Demucs)
│   ├── 📄 server.py               # ไฟล์หลักสำหรับรัน AI Server (FastAPI/Flask)
│   ├── 📄 requirements.txt        # รายการ Python dependencies ทั้งหมด
│   └── 📄 packager-*.spec         # ไฟล์ PyInstaller สำหรับแพ็ก Python เป็น .exe/.app
│
├── 📂 data/                       # 💾 พื้นที่เก็บข้อมูล (Local Storage)
│   ├── 📂 models/                 # ที่เก็บไฟล์โมเดล AI (.pth files)
│   ├── 📂 uploads/                # ที่เก็บไฟล์เสียงต้นฉบับที่ผู้ใช้เลือกมาประมวลผล
│   └── 📂 outputs/                # ผลลัพธ์จากการประมวลผล (ไฟล์เสียงที่แปลง/แยกแล้ว)
│
├── 📂 scripts/                    # 🛠️ เครื่องมือช่วยเหลือนักพัฒนา (Developer Tools)
│   ├── 📂 build/                  # สคริปต์ช่วยการ Build โปรเจกต์
│   └── 📂 downloader/             # ตัวช่วยดาวน์โหลดโมเดล AI อัตโนมัติ
│
├── 📂 build/                      # 📦 สำหรับสร้างตัวติดตั้ง (Installer Artifacts)
│   ├── 📂 windows/                # ไฟล์ NSIS และไอคอนสำหรับ Windows installer
│   └── 📂 darwin/                 # ไฟล์ Info.plist สำหรับ macOS bundle
│
└── 📂 License-Markdown/           # 📜 เอกสารลิขสิทธิ์และคู่มือการใช้งาน
```

### 🆕 รายละเอียดโฟลเดอร์ใหม่

#### 📂 `initialization/` - ระบบเตรียมความพร้อม
```go
initialization.go  // ทำหน้าที่:
                   // ✓ ตรวจสอบ dependencies ที่จำเป็น
                   // ✓ สร้างโฟลเดอร์ data/ ถ้ายังไม่มี
                   // ✓ โหลด configuration เริ่มต้น
                   // ✓ ตรวจสอบ GPU/CUDA availability
                   // ✓ ดาวน์โหลดโมเดล AI ที่จำเป็น (ถ้ายังไม่มี)
```

#### 📂 `inference/` - ระบบจัดการ AI Inference (Go side)
```go
config.go          // โครงสร้าง Config สำหรับ inference job
file_utils.go      // อ่าน/เขียน/แปลงไฟล์เสียง (mp3/wav/flac)
manager.go         // จัดการ lifecycle: เริ่ม/หยุด inference, cleanup resources
options.go         // กำหนด parameters: pitch shift, voice model, quality
python_bridge.go   // ตัวเชื่อม: ส่ง request ไป Python server, รับ progress
status.go          // ติดตามสถานะ: queue position, progress %, completion
```

---

## 🏗 Architecture (สถาปัตยกรรมระบบ)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GG-Replay Architecture                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌──────────────────────────────────────────┐
│    Frontend     │         │            Go Backend (Wails)             │
│  (React + TS)   │◄───────►│  ┌────────────────────────────────────┐ │
│  frontend/      │  wails  │  │  app.go          (Main Bindings)   │ │
│                 │   JS    │  │  server.go       (HTTP Server)     │ │
│  - components/  │         │  │  queue.go        (Job Queue)       │ │
│  - pages/       │         │  │  models.go       (Model Manager)   │ │
│  - assets/      │         │  │  device.go       (GPU/CPU Check)   │ │
└─────────────────┘         │  └────────────────────────────────────┘ │
        │                   │                                          │
        │ reads/writes      │  ┌────────────────────────────────────┐ │
        ▼                   │  │  initialization/                   │ │
┌─────────────────┐         │  │  └─ initialization.go (Startup)   │ │
│   Local Data    │         │  └────────────────────────────────────┘ │
│    data/        │         │                                          │
│  - models/      │         │  ┌────────────────────────────────────┐ │
│  - uploads/     │         │  │  inference/                        │ │
│  - outputs/     │         │  │  ├─ config.go        (Config)     │ │
└─────────────────┘         │  │  ├─ manager.go       (Lifecycle)  │ │
                            │  │  ├─ options.go       (Params)     │ │
                            │  │  ├─ file_utils.go    (I/O)        │ │
                            │  │  ├─ python_bridge.go (IPC)        │ │
                            │  │  └─ status.go        (Tracking)   │ │
                            │  └────────────┬───────────────────────┘ │
                            └───────────────┼─────────────────────────┘
                                            │ HTTP/IPC
                                            ▼
                            ┌────────────────────────────────────┐
                            │      Python AI Server               │
                            │  ┌──────────────────────────────┐  │
                            │  │  server.py     (FastAPI)     │  │
                            │  │  inference/                  │  │
                            │  │  ├─ uvr/       (Vocal Sep.) │  │
                            │  │  └─ infer_pack/(RVC)         │  │
                            │  │  demucs/       (Track Sep.)  │  │
                            │  └──────────────────────────────┘  │
                            └────────────────────────────────────┘
```

### 🔄 Flow การทำงาน
1. **Startup** → `initialization/initialization.go` เตรียม environment
2. **User Action** → Frontend ส่งคำขอผ่าน Wails bindings
3. **Queue** → `queue.go` จัดลำดับงาน, `models.go` เตรียมโมเดล
4. **Inference** → `inference/manager.go` ส่งงานผ่าน `python_bridge.go`
5. **AI Processing** → `python/server.py` ประมวลผลด้วย PyTorch
6. **Result** → บันทึกผลลัพธ์ลง `data/outputs/` และแจ้งกลับ Frontend

---

## 📊 เปรียบเทียบการใช้ทรัพยากร (GG-Replay vs Replay App)

| ทรัพยากร | 🟢 GG-Replay (Wails) | 🔴 Replay App (Electron) | ความแตกต่าง |
|:---|:---:|:---:|:---|
| **RAM (Idle)** | ~80-150 MB | ~300-500 MB | ประหยัดกว่า ~3 เท่า |
| **RAM (Processing)** | ~500 MB - 1.5 GB* | ~1-2.5 GB* | ประหยัดกว่า ~40% |
| **CPU (Idle)** | ~0.5-2% | ~3-8% | นิ่งกว่า (Go compiled) |
| **Disk Space (ติดตั้ง)** | ~200-400 MB | ~800 MB - 1.2 GB | เล็กกว่า ~60% |
| **Startup Time** | 1-2 วินาที | 3-5 วินาที | เร็วกว่า ~2 เท่า |

> \* *ไม่รวม AI Models (.pth) ที่ทั้งสองแอปต้องใช้เท่ากัน*

### 🏆 ทำไม GG-Replay ถึงเบากว่า?
- **ไม่ Bundle Chromium** - ใช้ WebView ของ OS ที่มีอยู่แล้ว
- **Go Compiled** - เร็วกว่า Node.js ที่ต้องรันผ่าน V8 Engine
- **Single Process** - ลด overhead ของ multi-process ใน Electron

## ⚙️ Prerequisites (สิ่งที่ต้องติดตั้งก่อน)

1. **Go** (เวอร์ชัน 1.20 ขึ้นไป) - [Download](https://go.dev/dl/)
2. **Node.js** (เวอร์ชัน 18 ขึ้นไป) และ npm - [Download](https://nodejs.org/)
3. **Python** (แนะนำเวอร์ชัน 3.10) - [Download](https://www.python.org/downloads/)
4. **Wails CLI** - ติดตั้งผ่านคำสั่ง:
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```
5. **C/C++ Compiler** (สำหรับรัน Wails)
   - *Windows:* ติดตั้ง Visual Studio Build Tools หรือ gcc/MinGW
   - *macOS:* รันคำสั่ง `xcode-select --install`
   - *Linux:* `sudo apt install build-essential libgtk-3-dev libwebkit2gtk-4.0-dev`

---

## 🚀 Installation & How to Run (วิธีติดตั้งและรันโปรเจกต์)

### ขั้นตอนที่ 1: ติดตั้ง Python Dependencies (สำหรับ AI Server)

เพื่อให้ระบบประมวลผลเสียงทำงานได้ คุณต้องติดตั้งไลบรารีของ Python ก่อน:

```bash
# เข้าไปที่โฟลเดอร์ python
cd python

# สร้าง Virtual Environment 
python -m venv venv

# เปิดใช้งาน Virtual Environment
# สำหรับ Windows:
venv\Scripts\activate
# สำหรับ macOS/Linux:
source venv/bin/activate

# ติดตั้งไลบรารีทั้งหมด
pip install -r requirements.txt

# รันงานผ่าน GPU (Nvidia)
.\venv\Scripts\pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118 --force-reinstall
```

### ขั้นตอนที่ 2: ติดตั้ง Frontend Dependencies

```bash
# กลับมาที่หน้า root โฟลเดอร์ก่อน
cd ..

# เข้าไปที่โฟลเดอร์ frontend
cd frontend

# ติดตั้งไลบรารีของ Node.js
npm install
```

### ขั้นตอนที่ 3: การรันแอปพลิเคชัน (Development Mode)

ในโหมดนักพัฒนา (Dev Mode) การใช้คำสั่ง Wails จะทำการรันทั้ง Go Backend และ React Frontend อัตโนมัติ (และรองรับ Hot-Reload)

```bash
# กลับมาที่ root โฟลเดอร์
cd ..

# รันแอปพลิเคชันผ่าน Wails
wails dev
```

---

## 📦 Building for Production (การสร้างไฟล์ติดตั้ง .exe / .app)

เมื่อพัฒนาเสร็จสิ้น และต้องการ Build แอปพลิเคชันเพื่อให้คนอื่นใช้งาน:

### 1. Build Python Executable ก่อน (หากจำเป็น)

โปรเจกต์นี้มีไฟล์ `.spec` สำหรับ **PyInstaller** เพื่อแพ็กไฟล์ Python เป็น Executable ฝังไปกับแอป

```bash
cd python
# สำหรับ Windows
pyinstaller packager-win.spec
# สำหรับ macOS
pyinstaller packager-mac.spec
cd ..
```

### 2. Build Wails Application

```bash
# คำสั่ง Build สำหรับระบบปฏิบัติการปัจจุบันที่คุณใช้อยู่
wails build

# หากต้องการ Build ให้ไฟล์เล็กลง (ใช้ UPX) และซ่อนหน้าต่าง Console บน Windows
wails build -upx -clean -m
```

ไฟล์ที่ Build สำเร็จจะเข้าไปอยู่ในโฟลเดอร์ `build/bin/`

---

## 📝 License

ข้อมูลเกี่ยวกับลิขสิทธิ์และข้อตกลงการใช้งาน (ดูรายละเอียดเพิ่มเติมในโฟลเดอร์ `License-Markdown/`)

