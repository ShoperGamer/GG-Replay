import React, { useState, useRef, useEffect } from 'react';
import * as Wails from '../../wailsjs/go/main/App';

type DemucsModel = 'htdemucs_ft' | 'htdemucs' | 'htdemucs_6s' | 'hdemucs_mmi';
type DeviceType = 'auto' | 'cuda' | 'mps' | 'cpu';

interface DemucsJob {
  id: string;
  trackName: string;
  status: 'queued' | 'processing' | 'completed' | 'errored';
  progress: number;
  message: string;
  stage: string;
  stems?: { vocals?: string; drums?: string; bass?: string; other?: string; piano?: string; guitar?: string };
}

const DEMUCS_MODELS: { value: DemucsModel; label: string; desc: string }[] = [
  { value: 'htdemucs_ft', label: 'HTDemucs FT (แนะนำ)', desc: 'คุณภาพดีที่สุด Fine-tuned ระดับสตูดิโอ' },
  { value: 'htdemucs', label: 'HTDemucs', desc: 'ความเร็วมาตรฐาน' },
  { value: 'htdemucs_6s', label: 'HTDemucs 6S', desc: 'แยก 6 Stems (เพิ่ม Piano + Guitar)' },
  { value: 'hdemucs_mmi', label: 'HDemucs MMI', desc: 'โมเดลเสถียรรุ่นดั้งเดิม' },
];

const DEVICES: { value: DeviceType; label: string; icon: string }[] = [
  { value: 'auto', label: 'Auto Detect', icon: '🤖' },
  { value: 'cuda', label: 'NVIDIA GPU (CUDA)', icon: '⚡' },
  { value: 'mps', label: 'Apple Silicon (MPS)', icon: '🍎' },
  { value: 'cpu', label: 'CPU Only', icon: '🐢' },
];

// 🎯 คำนวณ progress จาก message จริง
const calcProgress = (status: string, msg: string): number => {
  if (status === 'completed') return 100;
  if (status === 'errored') return 0;
  if (status === 'queued') return 5;
  
  const m = (msg || '').toLowerCase();
  if (m.includes('export') || m.includes('saving') || m.includes('writing')) return 90;
  if (m.includes('separating') || m.includes('processing') || m.includes('inference')) return 60;
  if (m.includes('loading model') || m.includes('loading demucs')) return 30;
  if (m.includes('hardware') || m.includes('allocat') || m.includes('device')) return 15;
  if (m.includes('queued') || m.includes('คิว')) return 5;
  return 40;
};

// 🎯 ดึง stage ข้อความสั้นๆ
const getStage = (msg: string): string => {
  const m = (msg || '').toLowerCase();
  if (m.includes('export') || m.includes('saving')) return '💾 กำลังส่งออกไฟล์...';
  if (m.includes('separating') || m.includes('processing')) return '🎵 กำลังแยกเสียง...';
  if (m.includes('loading model')) return '📦 กำลังโหลดโมเดล...';
  if (m.includes('hardware') || m.includes('device')) return '⚙️ ตั้งค่าฮาร์ดแวร์...';
  if (m.includes('queued') || m.includes('คิว')) return '⏳ รอในคิว...';
  return msg || 'กำลังประมวลผล...';
};

export default function DemucsPage() {
  const [selectedFile, setSelectedFile] = useState<{ name: string; path: string } | null>(null);
  const [selectedModel, setSelectedModel] = useState<DemucsModel>('htdemucs_ft');
  const [device, setDevice] = useState<DeviceType>('auto');
  const [jobs, setJobs] = useState<DemucsJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAudio, setActiveAudio] = useState<{ jobId: string; url: string; name: string } | null>(null);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    // โหลด device ที่บันทึกไว้
    (async () => {
      try {
        const saved = await (Wails as any).GetDeviceSetting();
        if (saved && ['cuda', 'mps', 'cpu'].includes(saved)) {
          setDevice(saved as DeviceType);
        }
      } catch {}
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const resolveDevice = async (): Promise<string> => {
    if (device !== 'auto') return device;
    try {
      const saved = await (Wails as any).GetDeviceSetting();
      if (saved && saved !== '') return saved;
    } catch {}
    return 'cuda';
  };

  const handleSelectFile = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res?.name) setSelectedFile({ name: res.name, path: res.path });
    } catch (e) { console.error(e); }
  };

  const handleStart = async () => {
    if (!selectedFile) return alert('กรุณาเลือกไฟล์เสียงก่อน');
    setIsProcessing(true);
    const realDevice = await resolveDevice();

    try {
      const res = await (Wails as any).StartDemucsJob({
        sourceAudioPath: selectedFile.path,
        model: selectedModel,
        device: realDevice,
      });

      const newJob: DemucsJob = {
        id: res.jobId,
        trackName: selectedFile.name.replace(/\.[^/.]+$/, ''),
        status: 'queued',
        progress: 5,
        message: 'อยู่ในคิวประมวลผล...',
        stage: '⏳ รอในคิว...',
      };

      setJobs(prev => [newJob, ...prev]);

      // Polling ทุก 800ms - คำนวณ progress แบบ smart
      pollRef.current = setInterval(async () => {
        try {
          const p = await (Wails as any).GetDemucsProgress(res.jobId);
          if (!p) return;

          const realProgress = calcProgress(p.status, p.message);
          const stage = getStage(p.message);

          setJobs(prev => prev.map(j => j.id === res.jobId ? {
            ...j,
            status: p.status,
            progress: Math.max(j.progress, realProgress), // ไม่ให้ progress ถอยหลัง
            message: p.message,
            stage,
            stems: p.stems,
          } : j));

          if (p.status === 'completed' || p.status === 'errored') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            if (p.status === 'completed') {
              // ไม่ต้อง alert - ให้ user ดูที่ UI เอง
            }
          }
        } catch (e) { console.error(e); }
      }, 800);
    } catch (e) {
      alert('Error: ' + e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlay = async (jobId: string, path: string, name: string) => {
    try {
      if (activeAudio?.jobId === jobId && activeAudio?.url?.includes(path.split(/[\\/]/).pop() || '')) {
        setActiveAudio(null);
        return;
      }
      const url = await (Wails as any).GetAudioUrlByFullPath(path);
      if (url) setActiveAudio({ jobId, url, name });
    } catch { alert('ไม่สามารถโหลดเสียงได้'); }
  };

  const handleSave = async (path: string, name: string) => {
    try {
      const res = await (Wails as any).SaveFileAs(path, name);
      if (res?.status === 'success') alert(`บันทึกสำเร็จที่:\n${res.path}`);
    } catch { alert('ไม่สามารถบันทึกได้'); }
  };

  const saveDeviceSetting = async (d: DeviceType) => {
    setDevice(d);
    if (d !== 'auto') {
      try { await (Wails as any).SaveDeviceSetting(d); } catch {}
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn text-slate-200 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            🎧 Meta-Demucs Splitter
          </h2>
          <p className="text-xs text-slate-400 mt-1">แยกเสียงร้อง/ดนตรี ด้วย AI + GPU Acceleration</p>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-card p-5 rounded-2xl border border-white/5 bg-slate-950/20 backdrop-blur space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* File Select */}
          <button onClick={handleSelectFile} className="px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-xl text-sm text-slate-300 truncate cursor-pointer">
            {selectedFile ? `✓ ${selectedFile.name}` : '📁 เลือกไฟล์เสียง...'}
          </button>

          {/* Model Select */}
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value as DemucsModel)} className="px-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-sm text-slate-200 cursor-pointer outline-none">
            {DEMUCS_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          {/* 🎯 Device Select */}
          <select value={device} onChange={e => saveDeviceSetting(e.target.value as DeviceType)} className="px-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-sm text-slate-200 cursor-pointer outline-none">
            {DEVICES.map(d => <option key={d.value} value={d.value}>{d.icon} {d.label}</option>)}
          </select>
        </div>

        {/* Device Info */}
        <div className="text-[10px] text-slate-500 flex items-center gap-2">
          <span>ℹ️</span>
          <span>
            {device === 'cuda' && '⚡ ใช้ NVIDIA GPU (แนะนำ) - เร็วกว่า CPU 5-10x'}
            {device === 'mps' && '🍎 ใช้ Apple Silicon GPU - เร็วกว่า CPU 3-5x'}
            {device === 'cpu' && '🐢 ใช้ CPU - ช้าแต่เสถียร'}
            {device === 'auto' && '🤖 ตรวจหา GPU อัตโนมัติ (CUDA → MPS → CPU)'}
          </span>
        </div>

        {/* Start Button */}
        <button onClick={handleStart} disabled={!selectedFile || isProcessing} className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 disabled:opacity-20 rounded-xl font-bold text-xs uppercase tracking-widest cursor-pointer transition-all active:scale-[0.99]">
          {isProcessing ? '⏳ กำลังเริ่ม...' : '🚀 แยกเสียงร้องและดนตรี'}
        </button>
      </div>

      {/* Jobs */}
      <div className="space-y-3">
        {jobs.map(job => (
          <div key={job.id} className="p-4 bg-slate-900/60 rounded-xl border border-white/5 space-y-3 animate-fadeIn">
            {/* Job Header */}
            <div className="flex justify-between items-center">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white truncate">🎵 {job.trackName}</h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{job.stage}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ml-2 flex-shrink-0 ${
                job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                job.status === 'errored' ? 'bg-red-500/20 text-red-400' :
                job.status === 'processing' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                'bg-slate-800 text-slate-400'
              }`}>
                {job.status === 'processing' ? `${Math.round(job.progress)}%` : job.status}
              </span>
            </div>

            {/* 🎯 Progress Bar แบบจริง */}
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden relative">
              <div
                className={`h-full transition-all duration-500 ease-out ${
                  job.status === 'errored' ? 'bg-red-500' :
                  job.status === 'completed' ? 'bg-gradient-to-r from-emerald-500 to-teal-500' :
                  'bg-gradient-to-r from-purple-500 to-indigo-500'
                } ${job.status === 'processing' ? 'animate-pulse' : ''}`}
                style={{ width: `${job.progress}%` }}
              />
              {job.status === 'processing' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2s_infinite]" />
              )}
            </div>

            {/* Progress Detail */}
            {job.status === 'processing' && (
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>{job.stage}</span>
                <span className="font-mono">{Math.round(job.progress)}%</span>
              </div>
            )}

            {/* 🎧 Stems - เมื่อเสร็จ */}
            {job.status === 'completed' && job.stems && (
              <div className="pt-2 space-y-2 animate-fadeIn">
                <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                  ✨ แยกสำเร็จ — {Object.keys(job.stems).length} stems
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(job.stems).map(([name, path]) => {
                    const isPlaying = activeAudio?.jobId === job.id && activeAudio?.url?.includes(path.split(/[\\/]/).pop() || '');
                    return (
                      <div key={name} className={`p-2.5 rounded-lg border flex items-center gap-2 transition-all ${
                        isPlaying ? 'bg-indigo-950/30 border-indigo-500/40' : 'bg-slate-950/60 border-white/5 hover:border-white/10'
                      }`}>
                        <span className="text-lg">{
                          name === 'vocals' ? '🎤' :
                          name === 'drums' ? '🥁' :
                          name === 'bass' ? '🎸' :
                          name === 'piano' ? '🎹' :
                          name === 'guitar' ? '🎸' : '🎵'
                        }</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white capitalize truncate">{name}</p>
                          <p className="text-[9px] text-slate-500 truncate">{path.split(/[\\/]/).pop()}</p>
                        </div>
                        <button onClick={() => handlePlay(job.id, path, name)} className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                          isPlaying ? 'bg-rose-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        }`}>
                          {isPlaying ? '⏸' : '▶'}
                        </button>
                        <button onClick={() => handleSave(path, `${job.trackName}_${name}.wav`)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] font-bold text-slate-300 cursor-pointer" title="เซฟลงเครื่อง">
                          📥
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Audio Player */}
                {activeAudio?.jobId === job.id && (
                  <div className="p-2.5 bg-indigo-950/20 rounded-lg border border-indigo-500/20 space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-indigo-400">🔊 {activeAudio.name}</span>
                      <button onClick={() => setActiveAudio(null)} className="text-slate-500 hover:text-white font-bold">✕</button>
                    </div>
                    <audio src={activeAudio.url} controls autoPlay className="w-full h-8 accent-indigo-500" />
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {job.status === 'errored' && (
              <div className="p-2.5 bg-red-950/20 rounded-lg border border-red-500/20 text-xs text-red-400">
                ❌ {job.message}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {jobs.length === 0 && (
        <div className="text-center py-12 text-slate-600">
          <div className="text-5xl mb-3">🎧</div>
          <p className="text-sm font-bold">ยังไม่มีงานแยกเสียง</p>
          <p className="text-xs mt-1 text-slate-500">เลือกไฟล์ → เลือกโมเดล → เลือก Device → กดเริ่ม</p>
        </div>
      )}

      {/* Shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}