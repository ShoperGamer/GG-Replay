import React, { useState, useRef, useEffect } from 'react';
import * as Wails from '../../wailsjs/go/main/App'; 

type DemucsModel = 'htdemucs_ft' | 'htdemucs' | 'htdemucs_6s' | 'hdemucs_mmi';

interface DemucsJob {
  id: string;
  trackName: string;
  status: 'queued' | 'processing' | 'completed' | 'errored';
  progress: number;
  message: string;
  stems?: {
    vocals?: string;
    drums?: string;
    bass?: string;
    other?: string;
  };
}

const DEMUCS_MODELS: { value: DemucsModel; label: string; desc: string }[] = [
  { value: 'htdemucs_ft', label: 'HTDemucs FT (แนะนำ)', desc: 'คุณภาพดีที่สุด ผ่านการ Fine-tuned ระดับสตูดิโอ' },
  { value: 'htdemucs', label: 'HTDemucs', desc: 'Hybrid Transformer Demucs ความเร็วมาตรฐาน' },
  { value: 'htdemucs_6s', label: 'HTDemucs 6S', desc: 'แยกละเอียด 6 Stems (เพิ่มเลเยอร์ Piano และ Guitar)' },
  { value: 'hdemucs_mmi', label: 'HDemucs MMI', desc: 'โมเดลเสถียรรุ่นดั้งเดิม' },
];

export default function DemucsPage() {
  const [activeDevice, setActiveDevice] = useState('cpu');
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<{name: string, path: string} | null>(null);
  const [selectedModel, setSelectedModel] = useState<DemucsModel>('htdemucs_ft');
  const [jobs, setJobs] = useState<DemucsJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const deviceLabel: Record<string, string> = {
    cpu: '🐢 CPU RENDER (ช้า)',
    cuda: '🚀 NVIDIA GPU (CUDA Acceleration)',
    mps: '🍎 Apple Silicon (MPS)',
  };

  // 🔥 ซิงค์ค่าการเลือกฮาร์ดแวร์โดยตรงจากโมดูลของคู่หน้าหลักทันทีเมื่อเปิดหน้าจอ
  useEffect(() => {
    const fetchDevice = async () => {
      try {
        const savedDevice = await (Wails as any).GetDeviceSetting();
        setActiveDevice(savedDevice || 'cpu');
      } catch (err) {
        console.warn('Fallback to cpu:', err);
        setActiveDevice('cpu');
      } finally {
        setDeviceLoading(false);
      }
    };
    fetchDevice();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleSelectFile = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res && res.name && res.path) {
        setSelectedFile({ name: res.name, path: res.path });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartSeparation = async () => {
    if (!selectedFile) return alert('กรุณาเลือกไฟล์เสียงก่อนครับ');

    setIsProcessing(true);
    try {
      const response = await (Wails as any).StartDemucsJob({
        sourceAudioPath: selectedFile.path,
        model: selectedModel,
        device: activeDevice,
      });

      const newJob: DemucsJob = {
        id: response.jobId,
        trackName: selectedFile.name.replace(/\.[^/.]+$/, ''),
        status: 'queued',
        progress: 0,
        message: 'รอคิวระบบประมวลผล...',
      };

      setJobs(prev => [newJob, ...prev]);
      startPolling(response.jobId);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err);
    } finally {
      setIsProcessing(false);
    }
  };

  const startPolling = (jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const progressData = await (Wails as any).GetDemucsProgress(jobId);
        if (!progressData) return;

        setJobs(prev =>
          prev.map(j =>
            j.id === jobId
              ? {
                  ...j,
                  status: progressData.status,
                  progress: progressData.progress || 0,
                  message: progressData.message,
                  stems: progressData.stems,
                }
              : j
          )
        );

        if (progressData.status === 'completed' || progressData.status === 'errored') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (progressData.status === 'completed') {
            alert('AI คัดแยกเลเยอร์เสียงดนตรี Demucs เสร็จสมบูรณ์แล้ว!');
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 1200);
  };

  const handleSaveStemFile = async (fullPath: string, stemName: string) => {
    try {
      const res = await (Wails as any).SaveFileAs(fullPath, `${stemName}.wav`);
      if (res && res.status === "success") {
        alert(`บันทึกแทร็ก ${stemName} สำเร็จแล้วที่:\n${res.path}`);
      }
    } catch (err) {
      alert("ไม่สามารถบันทึกไฟล์ได้");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn text-slate-200 p-4">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 pb-4 border-b border-white/5">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            UVR Meta-Demucs Splitter
          </h2>
          <p className="text-slate-400 text-sm">แยกส่วนประกอบเพลงออกเป็น 4-6 ไลน์เครื่องดนตรีอิสระผ่านขุมพลังคำนวณตรง</p>
        </div>
        <div className={`mt-4 sm:mt-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border ${
          activeDevice === 'cuda' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
        }`}>
          {deviceLoading ? '🔄 Syncing Hardware...' : deviceLabel[activeDevice]}
        </div>
      </div>

      <div className="glass-card p-6 rounded-3xl border border-white/5 bg-slate-950/20 backdrop-blur shadow-2xl space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">เลือกไฟล์เพลงเป้าหมาย</label>
            <button
              onClick={handleSelectFile}
              className="w-full px-4 py-3.5 bg-slate-900 hover:bg-slate-800/80 border border-white/10 rounded-xl text-left truncate text-sm text-slate-300 cursor-pointer transition-all"
            >
              {selectedFile ? `✓ ${selectedFile.name}` : 'คลิกเลือกไฟล์เสียงคอมพิวเตอร์...'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">สถาปัตยกรรมโมเดล AI</label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value as DemucsModel)}
              className="w-full px-4 py-3.5 bg-slate-900 border border-white/10 rounded-xl text-sm outline-none text-slate-200 cursor-pointer"
            >
              {DEMUCS_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5 pl-1">
              {DEMUCS_MODELS.find(m => m.value === selectedModel)?.desc}
            </p>
          </div>
        </div>

        <button
          onClick={handleStartSeparation}
          disabled={!selectedFile || isProcessing || deviceLoading}
          className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 disabled:opacity-20 rounded-2xl font-black text-xs tracking-widest uppercase shadow-xl transition-all active:scale-[0.99] cursor-pointer"
        >
          {isProcessing ? '⏳กำลังจัดส่งงานเข้าสู่ระเบียบคิว...' : '🚀 เริ่มต้นคัดแยกแทร็กเสียง'}
        </button>

        <div className="space-y-4 pt-2">
          {jobs.map(job => (
            <div key={job.id} className="p-5 bg-slate-900/60 rounded-2xl border border-white/5 space-y-3 shadow-lg animate-fadeIn">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white">🎵 {job.trackName}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{job.message}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                  job.status === 'errored' ? 'bg-red-500/20 text-red-400' :
                  job.status === 'processing' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'
                }`}>
                  {job.status}
                </span>
              </div>

              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
                  style={{ width: `${job.progress}%` }}
                />
              </div>

              {job.status === 'completed' && job.stems && (
                <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5 animate-fadeIn">
                  {Object.entries(job.stems).map(([name, path]) => (
                    <button
                      key={name}
                      onClick={() => handleSaveStemFile(path, `${job.trackName}_${name}`)}
                      className="px-3 py-2 bg-slate-950/60 hover:bg-slate-800 border border-white/5 hover:border-indigo-500/30 rounded-xl text-xs font-bold text-slate-300 transition-all cursor-pointer truncate text-left flex items-center gap-1.5"
                    >
                      <span>📥</span> <span className="capitalize">{name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}