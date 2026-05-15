
# 🎵 GG-Replay (อยู่ในช่วงพัฒนา)

<div align="center">
  <p>
    <img src="https://img.shields.io/github/repo-size/ShoperGamer/GG-Replay?style=for-the-badge&color=44cc11)" alt="Repo Size">
    <img src="https://img.shields.io/badge/Wails-990000?style=for-the-badge&logo=wails&logoColor=white" alt="Wails">
    <img src="https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go">
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
    <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
    <img src="https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white" alt="PyTorch">
  </p>
</div>

GG-Replay เป็นแอปพลิเคชันเดสก์ท็อปสำหรับการประมวลผลเสียงด้วย AI (AI Audio Processing) รองรับการทำ Voice Conversion (RVC), การแยกเสียงร้อง/เครื่องดนตรี (Demucs/UVR) และ โดยใช้ **Wails** เป็นแกนหลักในการผสานระหว่าง Go Backend, React Frontend และ Python AI Inference Server
ได้รับแรงบัลดาลใจ และ พัฒนาต่อยอดมาจาก Replay (https://github.com/THE-SINDOL/replay-app or https://www.weights.com/replay)

---

## 🛠 Tech Stack (เทคโนโลยีที่ใช้)

**Frontend (หน้าบ้าน):**
* **React + TypeScript** - ไลบรารีหลักสำหรับสร้าง UI
* **Vite** - เครื่องมือ Build Tool ที่มีความเร็วสูง
* **CSS / Tailwind** - สำหรับจัดการสไตล์ของหน้าแอปพลิเคชัน

**Backend (หลังบ้าน):**
* **Go (Golang)** - จัดการระบบของแอปพลิเคชันเดสก์ท็อปผ่าน Wails Framework
* **Python (3.10+)** - จัดการระบบ AI Inference และ Audio Processing (Server & Packager)

**AI & Audio Processing:**
* **RVC (Retrieval-based Voice Conversion)** - สำหรับแปลงเสียงร้อง
* **Demucs / UVR (Ultimate Vocal Remover)** - สำหรับแยก Track เสียง
* **PyTorch** - Framework สำหรับรันโมเดล AI

---

## 📂 Directory Tree (โครงสร้างโปรเจกต์)

ขนาดโปรเจกต์โดยประมาณ: **~100+ ไฟล์** (ไม่รวมไฟล์ออฟไลน์โมเดลและ `node_modules`)

```text
replay-go/
├── app.go                  # ไฟล์หลักที่เชื่อม Go Backend กับ Frontend
├── main.go                 # จุดเริ่มต้นการรัน Wails Application
├── wails.json              # ไฟล์กำหนดค่าโปรเจกต์ Wails
├── go.mod / go.sum         # จัดการ Library ของภาษา Go
├── package.json            # จัดการ Node.js dependencies
│
├── frontend/               # 🎨 React UI (Frontend)
│   ├── src/                # ซอร์สโค้ดหลักของแอป
│   │   ├── components/     # UI Components (เช่น Waveform.tsx)
│   │   ├── pages/          # หน้าต่างหลัก (Home, Demucs, Download, Share)
│   │   └── assets/         # ฟอนต์, รูปภาพ และสไตล์ (CSS)
│   ├── wailsjs/            # ส่วนที่ Go และ JS คุยกัน (Auto-generated)
│   ├── index.html          # หน้าหลักของแอป (Entry point)
│   └── vite.config.ts      # ตั้งค่าการ Build Frontend
│
├── python/                 # 🧠 AI & Audio Engine
│   ├── inference/          # ระบบประมวลผลเสียง (RVC, UVR, TTS)
│   │   ├── uvr/            # โมเดลแยกเสียงร้อง (Ultimate Vocal Remover)
│   │   └── infer_pack/     # ตัวจัดการโมเดล AI
│   ├── demucs/             # ระบบแยกเสียงเครื่องดนตรี
│   ├── server.py           # ไฟล์หลักสำหรับรัน AI Server
│   ├── requirements.txt    # รายการ Library ของ Python
│   └── packager-*.spec     # ไฟล์สำหรับแพ็ก Python เป็น .exe/.app
│
├── data/                   # 📁 พื้นที่เก็บข้อมูล (Local Storage)
│   ├── models/             # ที่เก็บไฟล์โมเดล AI (.pth)
│   └── uploads/            # ที่เก็บไฟล์เสียงที่ผู้ใช้เลือกมาประมวลผล
│   └── outputs/            # ผลลัพธ์
│
├── scripts/                # 📜 เครื่องมือช่วยเหลือนักพัฒนา
│   ├── build/              # สคริปต์ช่วยการ Build โปรเจกต์
│   └── downloader/         # ตัวช่วยดาวน์โหลดโมเดล AI
│
├── build/                  # 📦 สำหรับสร้างตัวติดตั้ง (Installer Artifacts)
│   ├── windows/            # ไฟล์ NSIS และไอคอนสำหรับ Windows
│   └── darwin/             # ไฟล์ Info.plist สำหรับ macOS
│
└── License-Markdown/      # 📄 เอกสารลิขสิทธิ์และคู่มือการใช้งาน
```

----------

## ⚙️ Prerequisites (สิ่งที่ต้องติดตั้งก่อน)

1.  **Go** (เวอร์ชัน 1.20 ขึ้นไป) - [Download](https://go.dev/dl/)
    
2.  **Node.js** (เวอร์ชัน 18 ขึ้นไป) และ npm - [Download](https://nodejs.org/)
    
3.  **Python** (แนะนำเวอร์ชัน 3.10) - [Download](https://www.python.org/downloads/)
    
4.  **Wails CLI** - ติดตั้งผ่านคำสั่ง:
    
    Bash
    
    ```
    go install https://github.com/wailsapp/wails/v2/cmd/wails@latest
    ```
    
5.  **C/C++ Compiler** (สำหรับรัน Wails)
    
    -   _Windows:_ ติดตั้ง Visual Studio Build Tools หรือ gcc/MinGW
        
    -   _macOS:_ รันคำสั่ง `xcode-select --install`
        
    -   _Linux:_ `sudo apt install build-essential libgtk-3-dev libwebkit2gtk-4.0-dev`
        

----------

## 🚀 Installation & How to Run (วิธีติดตั้งและรันโปรเจกต์)

### ขั้นตอนที่ 1: ติดตั้ง Python Dependencies (สำหรับ AI Server)

เพื่อให้ระบบประมวลผลเสียงทำงานได้ คุณต้องติดตั้งไลบรารีของ Python ก่อน:

Bash

```
# เข้าไปที่โฟลเดอร์ python
cd python

# สร้าง Virtual Environment (แนะนำ)
python -m venv venv

# เปิดใช้งาน Virtual Environment
# สำหรับ Windows:
venv\Scripts\activate
# สำหรับ macOS/Linux:
source venv/bin/activate

# ติดตั้งไลบรารีทั้งหมด
pip install -r requirements.txt
```

### ขั้นตอนที่ 2: ติดตั้ง Frontend Dependencies

Bash

```
# กลับมาที่หน้า root โฟลเดอร์ก่อน
cd ..

# เข้าไปที่โฟลเดอร์ frontend
cd frontend

# ติดตั้งไลบรารีของ Node.js
npm install
```

### ขั้นตอนที่ 3: การรันแอปพลิเคชัน (Development Mode)

ในโหมดนักพัฒนา (Dev Mode) การใช้คำสั่ง Wails จะทำการรันทั้ง Go Backend และ React Frontend อัตโนมัติ (และรองรับ Hot-Reload)

Bash

```
# กลับมาที่ root โฟลเดอร์
cd ..

# รันแอปพลิเคชันผ่าน Wails
wails dev
```

_หมายเหตุ: ในขณะพัฒนา หากระบบ Go ไม่ได้สั่งรันเซิร์ฟเวอร์ Python ให้อัตโนมัติ คุณอาจต้องเปิด Terminal อีกหน้าต่าง แล้วรัน `python python/server.py` แยกไว้ด้วย (ขึ้นอยู่กับลอจิกในไฟล์ `app.go`)_

----------

## 📦 Building for Production (การสร้างไฟล์ติดตั้ง .exe / .app)

เมื่อพัฒนาเสร็จสิ้น และต้องการ Build แอปพลิเคชันเพื่อให้คนอื่นใช้งาน:

### 1. Build Python Executable ก่อน (หากจำเป็น)

โปรเจกต์นี้มีไฟล์ `.spec` สำหรับ **PyInstaller** เพื่อแพ็กไฟล์ Python เป็น Executable ฝังไปกับแอป

Bash

```
cd python
# สำหรับ Windows
pyinstaller packager-win.spec
# สำหรับ macOS
pyinstaller packager-mac.spec
cd ..
```

### 2. Build Wails Application

Bash

```
# คำสั่ง Build สำหรับระบบปฏิบัติการปัจจุบันที่คุณใช้อยู่
wails build

# หากต้องการ Build ให้ไฟล์เล็กลง (ใช้ UPX) และซ่อนหน้าต่าง Console บน Windows
wails build -upx -clean -m

```

ไฟล์ที่ Build สำเร็จจะเข้าไปอยู่ในโฟลเดอร์ `build/bin/`

----------

## 📝 License

ข้อมูลเกี่ยวกับลิขสิทธิ์และข้อตกลงการใช้งาน (ดูรายละเอียดเพิ่มเติมในโฟลเดอร์ `License-Markdown/`)

