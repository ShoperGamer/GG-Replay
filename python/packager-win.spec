# -*- mode: python ; coding: utf-8 -*-

# 👇 แก้ RecursionError 👇
import sys
sys.setrecursionlimit(sys.getrecursionlimit() * 5)

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# ========================
# กำหนดค่าเริ่มต้น
# ========================
block_cipher = None
datas = []
binaries = []
hiddenimports = []

# ========================
# เพิ่มเฉพาะสิ่งที่จำเป็นจริงๆ
# ========================

# 1. Core inference modules (เลือกเฉพาะที่ใช้)
hiddenimports += [
    'torch',
    'torch.nn',
    'torch.nn.functional',
    'torch.optim',
    'torch.utils.data',
    'numpy',
    'scipy',
    'scipy.signal',
    'librosa',
    'soundfile',
    'json',
    'os',
    'sys',
    'pathlib',
]

# 2. Fairseq - เอาเฉพาะ data files ที่จำเป็น (ไม่ใช้ collect_all)
try:
    fairseq_data = collect_data_files('fairseq', include_py_files=False)
    datas += fairseq_data
    # เพิ่มเฉพาะ submodules ที่ใช้จริง
    hiddenimports += [
        'fairseq',
        'fairseq.tasks',
        'fairseq.models',
        'fairseq.optim',
        'fairseq.criterions',
    ]
except:
    pass

# 3. เพิ่ม inference modules จากโปรเจกต์
hiddenimports += [
    'app',
    'inference',
    'inference.uvr',
    'inference.infer_pack',
    'demucs',
]

# ========================
# Analysis - วิเคราะห์ dependencies
# ========================
a = Analysis(
    ['run_job.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    
    # 👇 EXCLUDES - ตัดสิ่งที่ไม่จำเป็นออก 👇
    excludes=[
        # ===== FastAPI & Web Frameworks (ไม่ใช้) =====
        'fastapi',
        'uvicorn',
        'flask',
        'django',
        'starlette',
        'werkzeug',
        
        # ===== GUI & Visualization (ไม่จำเป็น) =====
        'tkinter',
        'matplotlib',
        'PIL',
        'Pillow',
        'plotly',
        'bokeh',
        'seaborn',
        
        # ===== Testing & Development Tools =====
        'pytest',
        'unittest',
        'doctest',
        'IPython',
        'jupyter',
        'notebook',
        'jupyterlab',
        'setuptools',
        'pip',
        'distutils',
        
        # ===== ML Frameworks อื่นๆ (ใช้ PyTorch เท่านั้น) =====
        'tensorflow',
        'keras',
        'theano',
        'caffe',
        'caffe2',
        
        # ===== CUDA Libraries (แยกโหลดทีหลังได้) =====
        # ถ้าต้องการใช้ CPU เป็นหลัก หรือให้ user ดาวน์โหลด CUDA แยก
        # 'torch.cuda',  # uncomment ถ้าต้องการ exclude CUDA
        # 'cupy',
        # 'cudf',
        
        # ===== Documentation & Examples =====
        'sphinx',
        'docutils',
        'examples',
        'tests',
        'testing',
        
        # ===== Large Optional Libraries =====
        'pandas',
        'polars',
        'dask',
        'ray',
        'transformers',  # ถ้าไม่ได้ใช้ HuggingFace models
        'datasets',
        
        # ===== Audio Libraries ที่ไม่จำเป็น =====
        'pygame',
        'pydub',  # ถ้าใช้ librosa แทน
    ],
    
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# ========================
# EXE Configuration
# ========================
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='GG-Replay-Worker',  # เปลี่ยนชื่อให้ชัดเจน
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,  # ใช้ UPX เพื่อลดขนาด
    console=True,  # แสดง console สำหรับ debug
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='..\\build\\windows\\icon.ico',
)

# ========================
# COLLECT - รวบรวมไฟล์ทั้งหมด
# ========================
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[
        # ไม่ใช้ UPX กับไฟล์เหล่านี้ (อาจทำให้พัง)
        '*.dll',
        '*.so',
        '*.dylib',
    ],
    name='GG-Replay-Worker',
)