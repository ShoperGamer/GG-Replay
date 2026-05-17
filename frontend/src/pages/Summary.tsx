import React, { useState, useEffect } from 'react';
import Waveform from '../components/Waveform';
import * as Wails from '../../wailsjs/go/main/App'; 

const Summary: React.FC = () => {
  const [vocalFilesList, setVocalFilesList] = useState<string[]>([]);
  const [instFilesList, setInstFilesList] = useState<string[]>([]);

  const [selectedVocal, setSelectedVocal] = useState('');
  const [selectedInst, setSelectedInst] = useState('');
  
  const [vocalVolume, setVocalVolume] = useState(1.0);
  const [instVolume, setInstVolume] = useState(0.8);
  
  const [isMerging, setIsMerging] = useState(false);
  const [masterTrack, setMasterTrack] = useState<{name: string, streamUrl: string, relPath: string} | null>(null);

  useEffect(() => {
    fetchAvailableAssets();
  }, []);

  const fetchAvailableAssets = async () => {
    try {
      const vocals = await (Wails as any).GetAICoverFiles();
      const stems = await (Wails as any).GetSeparatedFiles();
      setVocalFilesList(vocals || []);
      setInstFilesList(stems || []);
    } catch (err) {
      console.error("Failed to scan project assets:", err);
    }
  };

  const handleBrowseVocalFile = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res && res.path) {
        setSelectedVocal(res.path);
        alert(`โหลดเสียงร้องภายนอกสำเร็จ: ${res.name}`);
      }
    } catch (err) {
      alert("ไม่สามารถเลือกไฟล์เสียงร้องได้");
    }
  };

  const handleBrowseInstrumentFile = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res && res.path) {
        setSelectedInst(res.path);
        alert(`โหลดดนตรีบรรเลงภายนอกสำเร็จ: ${res.name}`);
      }
    } catch (err) {
      alert("ไม่สามารถเลือกไฟล์ดนตรีได้");
    }
  };

  const handleMergeStudioMix = async () => {
    if (!selectedVocal) return alert("กรุณาเลือกหรือระบุแทร็กเสียงร้องนำ (AI Vocal)");
    if (!selectedInst) return alert("กรุณาเลือกหรือระบุแทร็กดนตรีบรรเลง (Instrumental)");

    setIsMerging(true);
    setMasterTrack(null);

    try {
      const res = await (Wails as any).MergeAudio(selectedVocal, selectedInst, vocalVolume, instVolume);
      
      if (res && res.status === "success") {
        setMasterTrack({
          name: res.fileName,
          streamUrl: res.streamUrl,
          relPath: res.relPath // เก็บค่าสัมพัทธ์เซฟตี้ข้ามปัญหา Windows Path พัง
        });
        alert("กระบวนการผสมสัญญาณเสียงเสร็จสิ้น! สามารถสตรีมฟังผลงานและส่งออกได้ทันที");
      } else {
        alert("การผสมเสียงล้มเหลว: " + (res.message || "Unknown Studio Error"));
      }
    } catch (err) {
      alert("Error processing audio merger: " + err);
    } finally {
      setIsMerging(false);
    }
  };

  // --- [แก้ไข Bug สำเร็จ]: เปลี่ยนมาเรียกใช้ DownloadFile ผ่านอาร์กิวเมนต์แบบเดียวกับ History เพื่อให้บันทึกไฟล์ได้ลื่นไหล 100% ---
  const handleExportFullSongMaster = async () => {
    if (!masterTrack) return;
    try {
      const res = await (Wails as any).DownloadFile("outputs", masterTrack.relPath);
      if (res && res.status === "success") {
        alert(`ส่งออกและดาวน์โหลดไฟล์เพลง AI Cover ตัวเต็มสำเร็จแล้วที่ตำแหน่ง:\n${res.path}`);
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดระหว่างส่งออกไฟล์มาสเตอร์");
    }
  };

  const cleanPathDisplay = (p: string) => {
    return p.replace(/\\/g, '/').split('/').pop() || p;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn text-slate-200 p-4 pb-20">
      <header className="mb-6">
        <h2 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
          Studio Master & Final Export
        </h2>
        <p className="text-slate-400 text-sm">ขั้นตอนสุดท้าย: รวมไฟล์เสียงร้องนำระดับ AI เข้ากับดนตรีแบ็กกิ้งแทร็กเพื่อแต่งมิกซ์ส่งออกเพลงเต็ม</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-6 rounded-3xl border border-white/5 bg-slate-950/20 backdrop-blur space-y-5 shadow-xl">
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest">🎤 1. AI Vocal Track Selector</label>
                <button onClick={handleBrowseVocalFile} className="text-[10px] font-bold text-slate-400 hover:text-white underline cursor-pointer">หรือกดค้นหาไฟล์ภายนอก...</button>
              </div>
              <select 
                value={selectedVocal.includes('/') || selectedVocal.includes('\\') ? '' : selectedVocal} 
                onChange={(e) => setSelectedVocal(e.target.value)}
                className="w-full bg-slate-900 text-white rounded-xl p-3 text-xs outline-none border border-white/10 focus:border-indigo-500 cursor-pointer"
              >
                <option value="">-- เลือกเสียงร้อง AI ที่แปลงไว้ --</option>
                {vocalFilesList.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              {selectedVocal && (
                <p className="text-[10px] font-mono text-indigo-400 bg-indigo-500/5 p-2 rounded-lg border border-indigo-500/10 truncate">📂 ไฟล์ร้องหลัก: {cleanPathDisplay(selectedVocal)}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-purple-400 uppercase tracking-widest">🎸 2. Instrumental Track Selector</label>
                <button onClick={handleBrowseInstrumentFile} className="text-[10px] font-bold text-slate-400 hover:text-white underline cursor-pointer">หรือกดค้นหาไฟล์ภายนอก...</button>
              </div>
              <select 
                value={selectedInst.includes('/') || selectedInst.includes('\\') ? '' : selectedInst} 
                onChange={(e) => setSelectedInst(e.target.value)}
                className="w-full bg-slate-900 text-white rounded-xl p-3 text-xs outline-none border border-white/10 focus:border-purple-500 cursor-pointer"
              >
                <option value="">-- เลือกไฟล์ดนตรีบรรเลงในเครื่อง --</option>
                {instFilesList.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
              {selectedInst && (
                <p className="text-[10px] font-mono text-purple-400 bg-purple-500/5 p-2 rounded-lg border border-purple-500/10 truncate">📂 ไฟล์ดนตรีบรรเลง: {cleanPathDisplay(selectedInst)}</p>
              )}
            </div>

          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="glass-card p-6 rounded-3xl border border-white/5 bg-slate-950/20 backdrop-blur space-y-6 shadow-xl h-full flex flex-col justify-between">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">🎚️ Master Gain Mixer</p>
            
            <div className="space-y-5 flex-1 py-4 flex flex-col justify-center">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-indigo-400">🎤 AI Vocal Gain</span>
                  <span className="font-mono text-white bg-indigo-500/10 px-2 py-0.5 rounded text-[11px]">{vocalVolume}x</span>
                </div>
                <input type="range" min="0.1" max="2.0" step="0.05" className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer" value={vocalVolume} onChange={(e) => setVocalVolume(parseFloat(e.target.value))} />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-purple-400">🎸 Instrumental Gain</span>
                  <span className="font-mono text-white bg-purple-500/10 px-2 py-0.5 rounded text-[11px]">{instVolume}x</span>
                </div>
                <input type="range" min="0.1" max="2.0" step="0.05" className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer" value={instVolume} onChange={(e) => setInstVolume(parseFloat(e.target.value))} />
              </div>
            </div>

            <button 
              disabled={isMerging || !selectedVocal || !selectedInst}
              onClick={handleMergeStudioMix}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:opacity-95 text-white rounded-2xl font-black shadow-xl disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-[0.99] text-xs tracking-widest uppercase cursor-pointer"
            >
              {isMerging ? "กำลังรวมช่องสัญญาณคลื่นความถี่..." : "COMPILE FULL COVER SONG"}
            </button>
          </div>
        </div>

      </div>

      {masterTrack && (
        <div className="glass-card p-6 rounded-3xl border border-emerald-500/20 bg-slate-950/40 backdrop-blur shadow-2xl space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/10 pb-3">
            <div>
              <span className="text-xs font-black text-emerald-400 uppercase tracking-widest block">🔥 STUDIO PREVIEW READY</span>
              <p className="text-slate-400 text-xs mt-0.5">บทเพลงคัฟเวอร์หลอมรวมระดับ HQ สเตอริโอ 320kbps เสร็จสมบูรณ์</p>
            </div>
            <button 
              onClick={handleExportFullSongMaster}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer tracking-wider w-full sm:w-auto uppercase shadow-emerald-950/30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              EXPORT FINAL AI COVER (.MP3)
            </button>
          </div>
          <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 shadow-inner">
            <Waveform color="#10b981" audioUrl={masterTrack.streamUrl} />
            <audio src={masterTrack.streamUrl} controls className="w-full h-8 accent-emerald-500 opacity-90 mt-2" />
          </div>
        </div>
      )}

    </div>
  );
};

export default Summary;