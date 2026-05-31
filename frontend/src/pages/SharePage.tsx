import React, { useState, useEffect } from 'react';
import * as Wails from '../../wailsjs/go/main/App';

interface DemucsFile {
  jobId: string;
  relPath: string;
  stemName: string;
  fullPath: string;
}

export default function SharePage() {
  const [originals, setOriginals] = useState<string[]>([]);
  const [separated, setSeparated] = useState<string[]>([]);
  const [demucsFiles, setDemucsFiles] = useState<DemucsFile[]>([]);
  const [aiCovers, setAiCovers] = useState<string[]>([]);
  const [activePlay, setActivePlay] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => { refreshAllFiles(); }, []);

  const refreshAllFiles = async () => {
    try {
      const [orig, sep, dem, cov] = await Promise.all([
        (Wails as any).GetOriginalFiles(),
        (Wails as any).GetSeparatedFiles(),
        (Wails as any).GetDemucsFiles(),
        (Wails as any).GetAICoverFiles(),
      ]);
      setOriginals(orig || []);
      setSeparated(sep || []);
      setDemucsFiles(dem || []);
      setAiCovers(cov || []);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    }
  };

  // ===== PLAY =====
  const handlePlay = async (category: string, relPath: string, name: string) => {
    try {
      const url = await (Wails as any).GetFileStreamUrl(category, relPath);
      setActivePlay(activePlay?.name === name ? null : { name, url });
    } catch { alert('ไม่สามารถเล่นได้'); }
  };

  const handlePlayDemucs = async (f: DemucsFile) => {
    try {
      const url = await (Wails as any).GetAudioUrlByFullPath(f.fullPath);
      const name = `${f.stemName} (${f.jobId.slice(-6)})`;
      setActivePlay(activePlay?.name === name ? null : { name, url });
    } catch { alert('ไม่สามารถเล่นได้'); }
  };

  // ===== DELETE =====
  const handleDelete = async (category: string, relPath: string, displayName?: string) => {
    if (!window.confirm(`ลบ ${displayName || relPath}?`)) return;
    try {
      await (Wails as any).DeleteLocalFile(category, relPath);
      if (activePlay?.name.includes(relPath.split('/').pop() || '')) setActivePlay(null);
      refreshAllFiles();
    } catch { alert('เกิดข้อผิดพลาด'); }
  };

  const handleDeleteAll = async (type: 'originals' | 'separated' | 'covers') => {
    const labels = { originals: 'ต้นฉบับ', separated: 'แยกเสียง (UVR+Demucs)', covers: 'AI Cover' };
    const counts = { originals: originals.length, separated: separated.length + demucsFiles.length, covers: aiCovers.length };
    if (!window.confirm(`🗑 ลบ ${labels[type]} ทั้งหมด (${counts[type]} ไฟล์)?`)) return;
    try {
      if (type === 'originals') await (Wails as any).DeleteAllOriginals();
      if (type === 'separated') {
        await Promise.all([(Wails as any).DeleteAllSeparated(), (Wails as any).DeleteAllDemucs()]);
      }
      if (type === 'covers') await (Wails as any).DeleteAllAICovers();
      setActivePlay(null);
      refreshAllFiles();
    } catch { alert('เกิดข้อผิดพลาด'); }
  };

  // ===== DOWNLOAD =====
  const handleDownload = async (category: string, relPath: string) => {
    try {
      const res = await (Wails as any).DownloadFile(category, relPath);
      if (res?.status === 'success') alert(`✅ บันทึกสำเร็จ:\n${res.path}`);
    } catch { alert('เกิดข้อผิดพลาด'); }
  };

  const handleDownloadDemucs = async (f: DemucsFile) => {
    try {
      const res = await (Wails as any).SaveFileAs(f.fullPath, `${f.jobId}_${f.stemName}.wav`);
      if (res?.status === 'success') alert(`✅ บันทึกสำเร็จ:\n${res.path}`);
    } catch { alert('เกิดข้อผิดพลาด'); }
  };

  // ===== HELPERS =====
  const cleanPath = (p: string) => p.split('/').pop() || p;
  const getIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('vocal')) return '🎤';
    if (n.includes('drum')) return '🥁';
    if (n.includes('bass')) return '🎸';
    if (n.includes('piano')) return '🎹';
    if (n.includes('guitar')) return '🎸';
    if (n.includes('other')) return '🎵';
    return '🎼';
  };

  const totalFiles = originals.length + separated.length + demucsFiles.length + aiCovers.length;

  // ===== ICON COMPONENTS =====
  const PlayIcon = () => (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z"/>
    </svg>
  );
  const DownloadIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
    </svg>
  );
  const TrashIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>
  );

  // ===== FILE ROW COMPONENT =====
  const FileRow = ({ name, icon, color, onPlay, onDownload, onDelete, subtitle }: any) => (
    <div className="p-3 bg-slate-950/40 rounded-xl border border-white/5 hover:border-white/10 group transition-all">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{name}</p>
            {subtitle && <p className="text-[9px] text-slate-500 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 flex-shrink-0">
          <button onClick={onPlay} className={`p-1.5 ${color.bg} hover:${color.hover} ${color.text} hover:text-white rounded-lg cursor-pointer`}>
            <PlayIcon />
          </button>
          <button onClick={onDownload} className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-white rounded-lg cursor-pointer">
            <DownloadIcon />
          </button>
          <button onClick={onDelete} className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg cursor-pointer">
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );

  // ===== SECTION COMPONENT =====
  const Section = ({ title, count, color, onDeleteAll, children }: any) => (
    <div className="space-y-3">
      <div className={`p-3 rounded-xl border border-${color.border}/20 bg-${color.bg}/5 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 bg-${color.dot} rounded-full shadow`} />
          <h3 className={`text-sm font-black text-${color.text} uppercase tracking-wider`}>
            {title} ({count})
          </h3>
        </div>
        {count > 0 && (
          <button
            onClick={onDeleteAll}
            className="px-2 py-1 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded text-[10px] font-bold cursor-pointer transition-all"
          >
            🗑 ลบทั้งหมด
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {children}
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn text-slate-200 p-4 pb-24">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
          📦 File & Asset Explorer
        </h1>
        <p className="text-sm text-slate-400">
          จัดการและดาวน์โหลดไฟล์มีเดียทั้งหมด • <span className="text-emerald-400 font-mono">{totalFiles}</span> ไฟล์ในระบบ
        </p>
      </div>

      {/* Now Playing */}
      {activePlay && (
        <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-2xl space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 uppercase">🔊 Now Playing: {activePlay.name}</span>
            <button onClick={() => setActivePlay(null)} className="text-xs text-slate-400 hover:text-white cursor-pointer">✕ ปิด</button>
          </div>
          <audio src={activePlay.url} controls autoPlay className="w-full h-10 accent-indigo-500" />
        </div>
      )}

      {/* 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* BOX 1: Originals */}
        <Section
          title="🎵 ต้นฉบับ"
          count={originals.length}
          color={{ dot: 'blue-500', text: 'blue-400', bg: 'blue-950', border: 'blue-500' }}
          onDeleteAll={() => handleDeleteAll('originals')}
        >
          {originals.length === 0 ? (
            <EmptyState icon="🎵" text="ไม่มีไฟล์ต้นฉบับ" />
          ) : originals.map(f => (
            <FileRow
              key={f}
              name={cleanPath(f)}
              icon="🎵"
              color={{ bg: 'bg-blue-500/10', hover: 'bg-blue-500', text: 'text-blue-400' }}
              onPlay={() => handlePlay('uploads', f, f)}
              onDownload={() => handleDownload('uploads', f)}
              onDelete={() => handleDelete('uploads', f)}
            />
          ))}
        </Section>

        {/* BOX 2: Separated (Demucs + UVR) */}
        <Section
          title="🎤 แยกเสียง"
          count={separated.length + demucsFiles.length}
          color={{ dot: 'indigo-500', text: 'indigo-400', bg: 'indigo-950', border: 'indigo-500' }}
          onDeleteAll={() => handleDeleteAll('separated')}
        >
          {(separated.length === 0 && demucsFiles.length === 0) ? (
            <EmptyState icon="🎤" text="ไม่มีไฟล์แยกเสียง" />
          ) : (
            <>
              {/* Demucs Files */}
              {demucsFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest px-1">
                    🎧 Demucs ({demucsFiles.length})
                  </div>
                  {demucsFiles.map(f => (
                    <FileRow
                      key={f.relPath}
                      name={f.stemName}
                      subtitle={`Job #${f.jobId.slice(-6)}`}
                      icon={getIcon(f.stemName)}
                      color={{ bg: 'bg-purple-500/10', hover: 'bg-purple-500', text: 'text-purple-400' }}
                      onPlay={() => handlePlayDemucs(f)}
                      onDownload={() => handleDownloadDemucs(f)}
                      onDelete={() => handleDelete('outputs', `demucs/${f.relPath}`, `${f.stemName}.wav`)}
                    />
                  ))}
                </div>
              )}

              {/* UVR Files */}
              {separated.length > 0 && (
                <div className="space-y-2 mt-3">
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest px-1">
                    🎼 UVR ({separated.length})
                  </div>
                  {separated.map(f => (
                    <FileRow
                      key={f}
                      name={cleanPath(f)}
                      subtitle={f.split('/').length > 1 ? f.split('/')[0] : undefined}
                      icon="🎼"
                      color={{ bg: 'bg-indigo-500/10', hover: 'bg-indigo-500', text: 'text-indigo-400' }}
                      onPlay={() => handlePlay('outputs', `stems/${f}`, f)}
                      onDownload={() => handleDownload('outputs', `stems/${f}`)}
                      onDelete={() => handleDelete('outputs', `stems/${f}`)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Section>

        {/* BOX 3: AI Covers */}
        <Section
          title="✨ AI Cover"
          count={aiCovers.length}
          color={{ dot: 'emerald-500', text: 'emerald-400', bg: 'emerald-950', border: 'emerald-500' }}
          onDeleteAll={() => handleDeleteAll('covers')}
        >
          {aiCovers.length === 0 ? (
            <EmptyState icon="✨" text="ไม่มีไฟล์ AI Cover" />
          ) : aiCovers.map(f => (
            <FileRow
              key={f}
              name={cleanPath(f)}
              subtitle={f.split('/').length > 1 ? f.split('/')[0] : undefined}
              icon="✨"
              color={{ bg: 'bg-emerald-500/10', hover: 'bg-emerald-500', text: 'text-emerald-400' }}
              onPlay={() => handlePlay('outputs', f, f)}
              onDownload={() => handleDownload('outputs', f)}
              onDelete={() => handleDelete('outputs', f)}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

// Empty State Component
const EmptyState = ({ icon, text }: { icon: string; text: string }) => (
  <div className="text-center py-8 space-y-2">
    <div className="text-4xl opacity-30">{icon}</div>
    <p className="text-xs text-slate-600">{text}</p>
  </div>
);