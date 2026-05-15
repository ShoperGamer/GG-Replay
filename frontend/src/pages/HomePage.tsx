import React, { useState, useEffect } from 'react';
import Waveform from '../components/Waveform';
import * as Wails from '../../wailsjs/go/main/App'; 

const HomePage: React.FC = () => {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [audioFile, setAudioFile] = useState<{name: string, path: string} | null>(null);
  const [pitch, setPitch] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const list = await Wails.GetStoredModels();
      setModels(list || []);
    } catch (err) {
      console.error("Failed to load models:", err);
    }
  };

  const handleSelectAudio = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res && res.path) {
        setAudioFile({ name: res.name, path: res.path });
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเลือกไฟล์");
    }
  };

  const handleRunInference = async () => {
    if (!audioFile || !selectedModel) return alert("กรุณาเลือกโมเดลและไฟล์เสียงก่อน");
    
    setIsLoading(true);
    setProgress(0);

    try {
      // 1. เริ่มสร้าง Job ใน Python Backend (ส่งค่า pitch ไปด้วย)
      const jobId = await Wails.CreateSong(selectedModel, audioFile.name, pitch);
      if (!jobId) throw new Error("ไม่สามารถเริ่มการประมวลผลได้");

      // 2. Poll ดูสถานะความคืบหน้า
      const interval = setInterval(async () => {
        const jobStatus: any = await Wails.GetJobProgress(jobId);
        
        if (jobStatus) {
           if (jobStatus.progress !== undefined) {
             setProgress(Math.round(jobStatus.progress));
           }
           
           if (jobStatus.status === 'success' || jobStatus.status === 'completed') {
             clearInterval(interval);
             setIsLoading(false);
             setProgress(100);
             alert("แปลงเสียงสำเร็จ!");
           } else if (jobStatus.status === 'failed') {
             clearInterval(interval);
             setIsLoading(false);
             alert("การประมวลผลล้มเหลว: " + (jobStatus.message || "Unknown Error"));
           }
        }
      }, 1500);

    } catch (err) {
      setIsLoading(false);
      alert("Error: " + err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <h1 className="text-3xl font-bold text-white mb-8 text-center uppercase tracking-tighter">AI Voice Conversion</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="glass-card p-5 rounded-2xl border border-white/5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Voice Model</label>
            <select 
              className="w-full glass-input rounded-lg p-2.5 text-sm text-white outline-none"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="">-- เลือกโมเดลเสียง --</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="glass-card p-5 rounded-2xl border border-white/5">
            <div className="flex justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pitch Transpose</label>
              <span className="text-indigo-400 font-mono text-sm">{pitch > 0 ? `+${pitch}` : pitch}</span>
            </div>
            <input 
              type="range" min="-12" max="12" 
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
              value={pitch} 
              onChange={(e) => setPitch(parseInt(e.target.value))}
            />
            <p className="text-[10px] text-slate-500 mt-2 text-center italic">ชายไปหญิง (+12) | หญิงไปชาย (-12)</p>
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div 
            onClick={handleSelectAudio}
            className={`glass-card h-48 rounded-3xl border-dashed border-2 transition-all flex flex-col items-center justify-center cursor-pointer ${
              audioFile ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/10 hover:border-indigo-500/30'
            }`}
          >
            {audioFile ? (
              <div className="text-center p-4">
                <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-3">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                </div>
                <p className="text-white font-medium truncate max-w-xs">{audioFile.name}</p>
                <button className="text-xs text-slate-500 hover:text-indigo-400 mt-2 underline">คลิกเพื่อเปลี่ยนไฟล์</button>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <p className="text-slate-400 font-medium">คลิกเพื่อเลือกไฟล์เสียง (.mp3, .wav)</p>
              </>
            )}
          </div>

          <button 
            disabled={isLoading || !audioFile || !selectedModel}
            onClick={handleRunInference}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-bold shadow-xl shadow-indigo-600/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isLoading ? (
              <span className="flex flex-col items-center justify-center">
                <span className="flex items-center gap-2 mb-1">
                   <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                   กำลังประมวลผล... {progress}%
                </span>
              </span>
            ) : "START CONVERSION"}
          </button>

          {audioFile && (
            <div className="mt-6 animate-fadeIn">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Input Preview</p>
              <Waveform color="#6366f1" audioUrl={audioFile.path} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;