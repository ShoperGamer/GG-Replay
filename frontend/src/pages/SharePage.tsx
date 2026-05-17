import React, { useState, useEffect } from 'react';
import Waveform from '../components/Waveform';
import * as Wails from '../../wailsjs/go/main/App'; 

const SharePage: React.FC = () => {
  const [originals, setOriginals] = useState<string[]>([]);
  const [separated, setSeparated] = useState<string[]>([]);
  const [aiCovers, setAiCovers] = useState<string[]>([]);

  // สถานะจัดการเครื่องเล่นมีเดียความถี่เสียงตัวปัจจุบัน
  const [activePlay, setActivePlay] = useState<{ name: string, url: string } | null>(null);

  useEffect(() => {
    refreshAllFiles();
  }, []);

  const refreshAllFiles = async () => {
    try {
      const origList = await (Wails as any).GetOriginalFiles();
      const sepList = await (Wails as any).GetSeparatedFiles();
      const coverList = await (Wails as any).GetAICoverFiles();

      setOriginals(origList || []);
      setSeparated(sepList || []);
      setAiCovers(coverList || []);
    } catch (err) {
      console.error("Failed to fetch stored files:", err);
    }
  };

  const handlePlayFile = async (category: string, relPath: string, displayName: string) => {
    try {
      const streamUrl = await (Wails as any).GetFileStreamUrl(category, relPath);
      setActivePlay({ name: displayName, url: streamUrl });
    } catch (err) {
      alert("ไม่สามารถโหลดไฟล์เสียงนี้ได้");
    }
  };

  const handleDeleteFile = async (category: string, relPath: string) => {
    if (!window.confirm("คุณมั่นใจใช่ไหมที่จะลบไฟล์นี้ออกจากระบบถาวร?")) return;
    try {
      const ok = await (Wails as any).DeleteLocalFile(category, relPath);
      if (ok) {
        if (activePlay && activePlay.name.includes(relPath.split('/').pop() || '')) {
          setActivePlay(null);
        }
        refreshAllFiles();
        alert("ลบไฟล์สำเร็จ!");
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการลบไฟล์");
    }
  };

  // เรียกใช้ฟังก์ชันเซฟไฟล์ดาวน์โหลดข้ามสะพานระบบ Go
  const handleDownloadFile = async (category: string, relPath: string) => {
    try {
      const res = await (Wails as any).DownloadFile(category, relPath);
      if (res && res.status === "success") {
        alert(`ดาวน์โหลดและบันทึกไฟล์สำเร็จที่โฟลเดอร์:\n${res.path}`);
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์");
    }
  };

  const formatPath = (p: string) => {
    const parts = p.split('/');
    if (parts.length > 2) {
      return `${parts[parts.length - 2]} ➔ ${parts[parts.length - 1]}`;
    }
    return p;
  };

  return (
    <div className="max-w-6xl mx-auto animate-fadeIn space-y-8 text-slate-200 p-4 pb-24">
      <div>
        <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
          File & Asset Explorer
        </h1>
        <p className="text-slate-400 text-sm">ตรวจสอบ จัดการ และดาวน์โหลดไฟล์มีเดียทั้งหมดภายในคลังระบบโปรแกรม</p>
      </div>

      {/* แผงควบคุมเครื่องเล่นกลางเมื่อคลิกเล่นไฟล์เสียง */}
      {activePlay && (
        <div className="glass-card p-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/10 backdrop-blur shadow-2xl animate-fadeIn space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              🔊 NOW PLAYING PREVIEW
            </p>
            <button 
              onClick={() => setActivePlay(null)}
              className="text-slate-500 hover:text-white font-bold text-xs px-2 py-0.5 rounded bg-white/5 cursor-pointer"
            >
              ปิดเครื่องเล่น
            </button>
          </div>
          <p className="text-sm text-white font-mono truncate">{activePlay.name}</p>
          <div className="bg-slate-900/60 p-3 rounded-xl space-y-2">
            <Waveform color="#6366f1" audioUrl={activePlay.url} />
            <audio src={activePlay.url} controls autoPlay className="w-full h-8 opacity-90 accent-indigo-500" />
          </div>
        </div>
      )}

      {/* โครงสร้างแยก 3 คอลลัมน์อิสระ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ส่วนที่ 1: ไฟล์เพลงต้นฉบับ */}
        <div className="space-y-4">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">🎵 ไฟล์เพลงต้นฉบับ ({originals.length})</h3>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {originals.length === 0 ? (
              <p className="text-xs text-slate-600 italic p-4 text-center">ไม่มีไฟล์ค้างอยู่ในระบบ</p>
            ) : originals.map(f => (
              <div key={f} className="p-3 bg-slate-950/30 rounded-xl border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 group transition-all">
                <span className="text-xs font-mono text-slate-300 truncate flex-1" title={f}>{f}</span>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handlePlayFile("uploads", f, f)} className="p-1.5 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white rounded-lg cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                  {/* ปุ่มดาวน์โหลดไฟล์ต้นฉบับ */}
                  <button onClick={() => handleDownloadFile("uploads", f)} className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-white rounded-lg cursor-pointer" title="ดาวน์โหลดไฟล์">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button onClick={() => handleDeleteFile("uploads", f)} className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ส่วนที่ 2: ไฟล์แยกเสียงสเตมส์ */}
        <div className="space-y-4">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">🎤 ไฟล์แยกเสียงสเตมส์ ({separated.length})</h3>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {separated.length === 0 ? (
              <p className="text-xs text-slate-600 italic p-4 text-center">ไม่มีไฟล์ค้างอยู่ในระบบ</p>
            ) : separated.map(f => (
              <div key={f} className="p-3 bg-slate-950/30 rounded-xl border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 group transition-all">
                <span className="text-xs font-mono text-slate-300 truncate flex-1" title={f}>{formatPath(f)}</span>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handlePlayFile("outputs", `stems/${f}`, f)} className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white rounded-lg cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                  {/* ปุ่มดาวน์โหลดไฟล์คัดแยกสเตมส์ */}
                  <button onClick={() => handleDownloadFile("outputs", `stems/${f}`)} className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-white rounded-lg cursor-pointer" title="ดาวน์โหลดไฟล์">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button onClick={() => handleDeleteFile("outputs", `stems/${f}`)} className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ส่วนที่ 3: ไฟล์ผลลัพธ์ AI Cover */}
        <div className="space-y-4">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">✨ ไฟล์ AI COVER สำเร็จ ({aiCovers.length})</h3>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {aiCovers.length === 0 ? (
              <p className="text-xs text-slate-600 italic p-4 text-center">ไม่มีไฟล์ค้างอยู่ในระบบ</p>
            ) : aiCovers.map(f => (
              <div key={f} className="p-3 bg-slate-950/30 rounded-xl border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 group transition-all">
                <span className="text-xs font-mono text-slate-300 truncate flex-1" title={f}>{formatPath(f)}</span>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handlePlayFile("outputs", f, f)} className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-lg cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                  {/* ปุ่มดาวน์โหลดไฟล์คัฟเวอร์สมบูรณ์ */}
                  <button onClick={() => handleDownloadFile("outputs", f)} className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-white rounded-lg cursor-pointer" title="ดาวน์โหลดไฟล์">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button onClick={() => handleDeleteFile("outputs", f)} className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SharePage;