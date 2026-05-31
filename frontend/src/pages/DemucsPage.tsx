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

const DEMUCS_MODELS: { value: DemucsModel; label: string; desc: string; icon: string }[] = [
  { value: 'htdemucs_ft', label: 'HTDemucs FT', desc: 'คุณภาพดีที่สุด', icon: '⭐' },
  { value: 'htdemucs', label: 'HTDemucs', desc: 'ความเร็วมาตรฐาน', icon: '⚡' },
  { value: 'htdemucs_6s', label: 'HTDemucs 6S', desc: '6 Stems', icon: '🎹' },
  { value: 'hdemucs_mmi', label: 'HDemucs MMI', desc: 'โมเดลเสถียร', icon: '🛡️' },
];

const DEVICES: { value: DeviceType; label: string; icon: string; speed: string }[] = [
  { value: 'auto', label: 'Auto Detect', icon: '🤖', speed: 'อัตโนมัติ' },
  { value: 'cuda', label: 'NVIDIA GPU', icon: '⚡', speed: 'เร็วที่สุด' },
  { value: 'mps', label: 'Apple Silicon', icon: '🍎', speed: 'เร็ว' },
  { value: 'cpu', label: 'CPU Only', icon: '🐢', speed: 'ช้า' },
];

// ✅ FIX: คำนวณ Progress ให้แม่นยำ และบังคับ 100% เมื่อเสร็จสิ้น
const calcProgress = (status: string, msg: string, backendProgress: number): number => {
  if (status === 'completed') return 100;
  if (status === 'errored') return backendProgress || 0;
  if (status === 'queued') return 5;
  if (backendProgress > 0) return backendProgress;

  // Fallback estimation
  const m = (msg || '').toLowerCase();
  if (m.includes('export') || m.includes('saving')) return 90;
  if (m.includes('separating') || m.includes('processing')) return 60;
  if (m.includes('loading model')) return 30;
  if (m.includes('hardware') || m.includes('device')) return 15;
  return 40;
};

const getStage = (msg: string): string => {
  const m = (msg || '').toLowerCase();
  if (m.includes('export') || m.includes('saving')) return '💾 กำลังส่งออก...';
  if (m.includes('separating') || m.includes('processing')) return '🎵 กำลังแยกเสียง...';
  if (m.includes('loading model')) return '📦 โหลดโมเดล...';
  if (m.includes('hardware') || m.includes('device')) return '⚙️ ตั้งค่า...';
  if (m.includes('queued')) return '⏳ รอในคิว...';
  return msg || 'กำลังประมวลผล...';
};

const getStemIcon = (name: string) => {
  const icons: Record<string, string> = {
    vocals: '🎤', drums: '🥁', bass: '🎸', other: '🎵', piano: '🎹', guitar: '🎸'
  };
  return icons[name] || '🎵';
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
    (async () => {
      try {
        const saved = await (Wails as any).GetDeviceSetting();
        if (saved && ['cuda', 'mps', 'cpu'].includes(saved)) setDevice(saved as DeviceType);
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
      const res = await (Wails as any).SelectAndSaveAudio();
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
      
      const jobId = res.JobId || res.jobId;
      const newJob: DemucsJob = {
        id: jobId,
        trackName: selectedFile.name.replace(/\.[^/.]+$/, ''),
        status: 'queued',
        progress: 5,
        message: 'อยู่ในคิว...',
        stage: '⏳ รอในคิว...',
      };
      
      setJobs(prev => [newJob, ...prev]);
      
      pollRef.current = setInterval(async () => {
        try {
          const p = await (Wails as any).GetDemucsProgress(jobId);
          if (!p) return;
          
          setJobs(prev => prev.map(j => j.id === jobId ? {
            ...j,
            status: p.status,
            progress: Math.max(j.progress, calcProgress(p.status, p.message, p.progress)),
            message: p.message,
            stage: getStage(p.message),
            stems: p.stems,
          } : j));
          
          if (p.status === 'completed' || p.status === 'errored') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setIsProcessing(false);
          }
        } catch (e) { console.error(e); }
      }, 800);
    } catch (e) {
      alert('Error: ' + e);
      setIsProcessing(false);
    }
  };

  const handlePlay = async (jobId: string, path: string, name: string) => {
    try {
      if (activeAudio?.jobId === jobId && activeAudio?.url?.includes(path.split(/[/\\]/).pop() || '')) {
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

  const selectedModelData = DEMUCS_MODELS.find(m => m.value === selectedModel);
  const selectedDeviceData = DEVICES.find(d => d.value === device);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn text-slate-200 p-4 pb-24">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-400">
          🎧 AI Stem Splitter
        </h1>
        <p className="text-sm text-slate-400">
          แยกเสียงร้องและดนตรีด้วย AI อัจฉริยะ รองรับ GPU Acceleration
        </p>
      </div>

      {/* Control Panel */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 space-y-5 shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* File Select */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              📁 ไฟล์เสียง
            </label>
            <button
              onClick={handleSelectFile}
              className={`w-full px-4 py-3 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                selectedFile
                  ? 'bg-purple-500/10 border-purple-500/50 text-white'
                  : 'bg-slate-950/50 border-slate-700 hover:border-purple-500/50 text-slate-400 hover:text-white'
              }`}
            >
              {selectedFile ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg">✓</span>
                  <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>📂</span>
                  <span className="text-sm">เลือกไฟล์...</span>
                </div>
              )}
            </button>
          </div>

          {/* Model Select */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              🧠 โมเดล AI
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as DemucsModel)}
              className="w-full px-4 py-3 bg-slate-950/50 border-2 border-slate-700 hover:border-indigo-500/50 rounded-xl text-sm text-white cursor-pointer outline-none transition-all"
            >
              {DEMUCS_MODELS.map(m => (
                <option key={m.value} value={m.value}>
                  {m.icon} {m.label}
                </option>
              ))}
            </select>
            {selectedModelData && (
              <p className="text-[10px] text-slate-500 mt-1">{selectedModelData.desc}</p>
            )}
          </div>

          {/* Device Select */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              ⚡ อุปกรณ์
            </label>
            <select
              value={device}
              onChange={(e) => saveDeviceSetting(e.target.value as DeviceType)}
              className="w-full px-4 py-3 bg-slate-950/50 border-2 border-slate-700 hover:border-emerald-500/50 rounded-xl text-sm text-white cursor-pointer outline-none transition-all"
            >
              {DEVICES.map(d => (
                <option key={d.value} value={d.value}>
                  {d.icon} {d.label}
                </option>
              ))}
            </select>
            {selectedDeviceData && (
              <p className="text-[10px] text-slate-500 mt-1">{selectedDeviceData.speed}</p>
            )}
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={!selectedFile || isProcessing}
          className="w-full py-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:opacity-95 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-black text-sm uppercase tracking-widest cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-purple-500/20"
        >
          {isProcessing ? '⏳ กำลังเริ่มต้น...' : '🚀 เริ่มแยกเสียง'}
        </button>
      </div>

      {/* Jobs List */}
      <div className="space-y-4">
        {jobs.map(job => (
          <div
            key={job.id}
            className="bg-slate-900/60 backdrop-blur border border-white/5 rounded-2xl p-5 space-y-4 animate-fadeIn shadow-xl"
          >
            {/* Job Header */}
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white truncate flex items-center gap-2">
                  <span>🎵</span>
                  {job.trackName}
                </h3>
                <p className="text-xs text-slate-400 mt-1">{job.stage}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase whitespace-nowrap ${
                job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                job.status === 'errored' ? 'bg-red-500/20 text-red-400' :
                job.status === 'processing' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                'bg-slate-800 text-slate-400'
              }`}>
                {job.status === 'processing' ? `${Math.round(job.progress)}%` : job.status}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden relative">
                <div
                  className={`h-full transition-all duration-500 ease-out rounded-full ${
                    job.status === 'errored' ? 'bg-red-500' :
                    job.status === 'completed' ? 'bg-gradient-to-r from-emerald-500 to-teal-500' :
                    'bg-gradient-to-r from-purple-500 to-indigo-500'
                  }`}
                  style={{ width: `${job.progress}%` }}
                />
                {job.status === 'processing' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" />
                )}
              </div>
              {job.status === 'processing' && (
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>{job.stage}</span>
                  <span className="font-mono">{Math.round(job.progress)}%</span>
                </div>
              )}
            </div>

            {/* Stems Grid */}
            {job.status === 'completed' && job.stems && (
              <div className="space-y-3 pt-3 border-t border-white/5 animate-fadeIn">
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  ✨ แยกสำเร็จ — {Object.keys(job.stems).length} stems
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(job.stems).map(([name, path]) => {
                    const isPlaying = activeAudio?.jobId === job.id && activeAudio?.url?.includes((path as string).split(/[/\\]/).pop() || '');
                    return (
                      <div
                        key={name}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          isPlaying
                            ? 'bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                            : 'bg-slate-950/40 border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{getStemIcon(name)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white capitalize">{name}</p>
                            <p className="text-[10px] text-slate-500 truncate">{(path as string).split(/[/\\]/).pop()}</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handlePlay(job.id, path as string, name)}
                              className={`p-2 rounded-lg transition-all cursor-pointer ${
                                isPlaying
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              }`}
                            >
                              {isPlaying ? '⏸' : '▶'}
                            </button>
                            <button
                              onClick={() => handleSave(path as string, `${job.trackName}_${name}.wav`)}
                              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 cursor-pointer transition-all"
                              title="บันทึกลงเครื่อง"
                            >
                              💾
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Audio Player */}
                {activeAudio?.jobId === job.id && (
                  <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-500/30 space-y-2 animate-fadeIn">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-indigo-400">🔊 {activeAudio.name}</span>
                      <button
                        onClick={() => setActiveAudio(null)}
                        className="text-slate-500 hover:text-white font-bold text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <audio src={activeAudio.url} controls autoPlay className="w-full h-10 accent-indigo-500" />
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {job.status === 'errored' && (
              <div className="p-3 bg-red-950/30 rounded-xl border border-red-500/30 text-sm text-red-400 flex items-start gap-2">
                <span>❌</span>
                <span>{job.message}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {jobs.length === 0 && (
        <div className="text-center py-16 space-y-4 animate-fadeIn">
          <div className="text-6xl mb-4">🎧</div>
          <h3 className="text-lg font-bold text-white">ยังไม่มีงานแยกเสียง</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            เลือกไฟล์เสียง → เลือกโมเดล AI → เลือกอุปกรณ์ → กดเริ่ม <br />
            ระบบจะแยกเสียงร้องและดนตรีให้อัตโนมัติ
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <div className="px-3 py-1.5 bg-slate-900/60 rounded-lg text-xs text-slate-400">
              ⚡ GPU Acceleration
            </div>
            <div className="px-3 py-1.5 bg-slate-900/60 rounded-lg text-xs text-slate-400">
              🎵 4 Stems
            </div>
            <div className="px-3 py-1.5 bg-slate-900/60 rounded-lg text-xs text-slate-400">
              💾 WAV Export
            </div>
          </div>
        </div>
      )}

      {/* Shimmer Animation */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}