import React, { useState, useEffect } from 'react';
import * as Wails from '../../wailsjs/go/main/App';

export default function DownloadPage() {
  const [models, setModels] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { loadModels(); }, []);

  const loadModels = async () => {
    try {
      const list = await (Wails as any).GetStoredModels();
      setModels(list || []);
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  };

  const handleImportLocal = async () => {
    try {
      const res = await (Wails as any).SelectAndSaveModel();
      if (res?.name) {
        await loadModels();
      }
    } catch {
      alert('นำเข้าโมเดลล้มเหลว');
    }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`🗑 ลบโมเดล "${name}"?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    try {
      await (Wails as any).DeleteModel(name);
      await loadModels();
    } catch {
      alert('เกิดข้อผิดพลาดในการลบ');
    }
  };

  const handleDownload = () => {
    if (!url.trim()) return alert('กรุณาใส่ URL');
    setIsDownloading(true);
    setTimeout(() => {
      alert('⚠️ ฟีเจอร์ดาวน์โหลดอัตโนมัติกำลังพัฒนา\n\nวิธีใช้ตอนนี้:\n1. ดาวน์โหลดไฟล์ .pth เอง\n2. กดปุ่ม "Import Local Model"\n3. เลือกไฟล์ที่ดาวน์โหลดมา');
      setIsDownloading(false);
      setUrl('');
    }, 500);
  };

  const filteredModels = models.filter(m => 
    m.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getModelIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('index')) return '📊';
    if (n.includes('vocal') || n.includes('singer')) return '🎤';
    if (n.includes('instrument')) return '🎸';
    return '🧠';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn text-slate-200 p-4 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            🧠 Model Manager
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            จัดการโมเดล AI สำหรับแปลงเสียง ({models.length} โมเดล)
          </p>
        </div>
        <button
          onClick={handleImportLocal}
          className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Import Model
        </button>
      </div>

      {/* URL Download Section */}
      <div className="p-5 bg-slate-900/40 backdrop-blur border border-white/5 rounded-2xl space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌐</span>
          <h2 className="text-sm font-bold text-white">ดาวน์โหลดจาก URL</h2>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="วางลิงก์ Google Drive, Mega.nz หรือ Direct Link..."
            className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 text-white placeholder-slate-600"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
          />
          <button
            onClick={handleDownload}
            disabled={isDownloading || !url.trim()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all cursor-pointer text-sm whitespace-nowrap"
          >
            {isDownloading ? '⏳...' : 'Download'}
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          💡 รองรับ: Google Drive, Mega.nz, Direct HTTP links (.pth, .zip)
        </p>
      </div>

      {/* Search Bar */}
      {models.length > 5 && (
        <div className="relative">
          <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="ค้นหาโมเดล..."
            className="w-full bg-slate-950 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-sm outline-none focus:border-indigo-500 text-white placeholder-slate-600"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}

      {/* Models Grid */}
      {filteredModels.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredModels.map(model => (
            <div
              key={model}
              className="p-4 bg-slate-900/40 backdrop-blur border border-white/5 hover:border-indigo-500/30 rounded-2xl flex items-center justify-between group transition-all"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-11 h-11 bg-indigo-500/10 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                  {getModelIcon(model)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate" title={model}>
                    {model}
                  </p>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    ✓ Ready to use
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(model)}
                className="p-2 hover:bg-red-500/20 text-slate-500 hover:text-red-500 rounded-lg transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                title="ลบโมเดล"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : models.length === 0 ? (
        /* Empty State */
        <div className="text-center py-16 space-y-4">
          <div className="text-6xl mb-2">🧠</div>
          <h3 className="text-lg font-bold text-white">ยังไม่มีโมเดล</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            นำเข้าโมเดล AI (.pth) เพื่อเริ่มแปลงเสียง<br/>
            รองรับโมเดล RVC ทุกประเภท
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <div className="px-3 py-1.5 bg-slate-900/60 rounded-lg text-xs text-slate-400">
              🎤 Voice Models
            </div>
            <div className="px-3 py-1.5 bg-slate-900/60 rounded-lg text-xs text-slate-400">
              📊 Index Files
            </div>
          </div>
        </div>
      ) : (
        /* No Search Results */
        <div className="text-center py-12 space-y-2">
          <div className="text-4xl mb-2">🔍</div>
          <p className="text-sm text-slate-400">
            ไม่พบโมเดลที่ตรงกับ "{searchTerm}"
          </p>
        </div>
      )}

      {/* Info Footer */}
      {models.length > 0 && (
        <div className="p-4 bg-indigo-950/10 border border-indigo-500/20 rounded-xl">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            <span className="text-indigo-400 font-bold">💡 Tips:</span> โฟลเดอร์เก็บโมเดลอยู่ที่{' '}
            <code className="px-1.5 py-0.5 bg-slate-900 rounded text-indigo-300 font-mono">data/models/</code>
            {' '}สามารถ copy ไฟล์ .pth เข้าไปได้โดยตรง
          </p>
        </div>
      )}
    </div>
  );
}