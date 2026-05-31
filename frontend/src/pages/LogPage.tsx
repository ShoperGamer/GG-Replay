import React, { useState, useEffect, useRef } from 'react';
import * as Wails from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';

interface LogEntry {
  timestamp: number;
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'SUCCESS';
  source: 'SYSTEM' | 'DEMUCS' | 'RVC' | 'MERGE' | 'CLEANUP' | 'FILE' | 'MODEL';
  message: string;
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  INFO:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/30' },
  WARN:    { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' },
  ERROR:   { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30' },
  DEBUG:   { bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/30' },
  SUCCESS: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

const SOURCE_ICONS: Record<string, string> = {
  SYSTEM: '⚙️', DEMUCS: '🎧', RVC: '🎤', MERGE: '🎛️',
  CLEANUP: '🧹', FILE: '📁', MODEL: '🧠',
};

const LEVEL_ICONS: Record<string, string> = {
  INFO: 'ℹ️', WARN: '⚠️', ERROR: '❌', DEBUG: '🔍', SUCCESS: '✅',
};

export default function LogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({ total: 0 });
  const [filterLevel, setFilterLevel] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  useEffect(() => {
    refreshLogs();
    refreshStats();

    EventsOn('log:new', (entry: LogEntry) => {
      if (!isPausedRef.current) {
        setLogs(prev => [...prev.slice(-1499), entry]);
      }
    });

    EventsOn('log:cleared', () => {
      setLogs([]);
      refreshStats();
    });

    return () => {
      EventsOff('log:new');
      EventsOff('log:cleared');
    };
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const refreshLogs = async () => {
    try {
      const result = await (Wails as any).GetLogs(filterLevel, filterSource, search);
      setLogs(result || []);
    } catch (err) {
      console.error('Failed to get logs:', err);
    }
  };

  const refreshStats = async () => {
    try {
      const result = await (Wails as any).GetLogStats();
      setStats(result || {});
    } catch (err) {
      console.error('Failed to get stats:', err);
    }
  };

  useEffect(() => {
    refreshLogs();
  }, [filterLevel, filterSource, search]);

  const handleClear = async () => {
    if (!window.confirm('ล้าง Logs ทั้งหมด?')) return;
    await (Wails as any).ClearLogs();
    setLogs([]);
    refreshStats();
  };

  const handleClearDiskLogs = async () => {
    if (!window.confirm(
      '⚠️ ต้องการลบไฟล์ Log (.log) ทั้งหมดจากโฟลเดอร์ logs/ หรือไม่?\n\n' +
      '⚡ การกระทำนี้ไม่สามารถย้อนกลับได้\n' +
      '🛡️ ไฟล์ป้องกัน (log.txt, .gitkeep, README.md) จะไม่ถูกลบ'
    )) return;

    try {
      const res = await (Wails as any).ClearDiskLogs();

      if (res.status === 'success') {
        let detail = res.message || 'เสร็จสิ้น';
        if (res.deletedFiles && res.deletedFiles.length > 0) {
          detail += '\n\n📄 ไฟล์ที่ถูกลบ:\n';
          detail += res.deletedFiles.slice(0, 10).map((f: string) => `  • ${f}`).join('\n');
          if (res.deletedFiles.length > 10) {
            detail += `\n  ... และอีก ${res.deletedFiles.length - 10} ไฟล์`;
          }
        }
        if (res.errors && res.errors.length > 0) {
          detail += '\n\n❌ ข้อผิดพลาด:\n';
          detail += res.errors.slice(0, 5).map((e: string) => `  • ${e}`).join('\n');
        }
        alert(detail);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + (res.message || 'ไม่ทราบสาเหตุ'));
      }
      refreshStats();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ: ' + err);
    }
  };

  const handleExport = async () => {
    try {
      const content = await (Wails as any).ExportLogs();
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gg-replay-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err);
    }
  };

  const handleCopyEntry = (entry: LogEntry) => {
    const text = `[${entry.time}] [${entry.source}] [${entry.level}] ${entry.message}`;
    navigator.clipboard.writeText(text);
  };

  const handleCopyAll = () => {
    const text = logs.map(e => `[${e.time}] [${e.source}] [${e.level}] ${e.message}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 animate-fadeIn text-slate-200 p-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-400">
            📊 System Logs
          </h1>
          <p className="text-sm text-slate-400 mt-1">Real-time monitoring & diagnostics</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[
          { label: 'Total', value: stats.total || 0, color: 'slate' },
          { label: 'Success', value: stats.SUCCESS || 0, color: 'emerald' },
          { label: 'Info', value: stats.INFO || 0, color: 'blue' },
          { label: 'Warn', value: stats.WARN || 0, color: 'amber' },
          { label: 'Error', value: stats.ERROR || 0, color: 'red' },
          { label: 'Debug', value: stats.DEBUG || 0, color: 'slate' },
        ].map(s => (
          <div key={s.label} className={`p-3 rounded-xl bg-${s.color}-500/10 border border-${s.color}-500/20`}>
            <p className="text-[10px] uppercase font-bold tracking-wider opacity-70">{s.label}</p>
            <p className={`text-2xl font-black font-mono mt-1 text-${s.color}-400`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="🔍 ค้นหา logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-500/50"
            />
          </div>

          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer"
          >
            <option value="">All Levels</option>
            <option value="SUCCESS">✅ Success</option>
            <option value="INFO">ℹ️ Info</option>
            <option value="WARN">⚠️ Warning</option>
            <option value="ERROR">❌ Error</option>
            <option value="DEBUG">🔍 Debug</option>
          </select>

          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer"
          >
            <option value="">All Sources</option>
            <option value="SYSTEM">⚙️ System</option>
            <option value="RVC">🎤 RVC</option>
            <option value="DEMUCS">🎧 Demucs</option>
            <option value="MERGE">🎛️ Merge</option>
            <option value="FILE">📁 File</option>
            <option value="MODEL">🧠 Model</option>
            <option value="CLEANUP">🧹 Cleanup</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
              isPaused
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5'
            }`}
          >
            {isPaused ? '▶️ Resume' : '⏸ Pause'}
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              autoScroll
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            📜 Auto-scroll {autoScroll ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={refreshLogs}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5 rounded-lg text-xs font-bold cursor-pointer"
          >
            🔄 Refresh
          </button>

          <div className="flex-1" />

          <button
            onClick={handleClearDiskLogs}
            className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
            title="ลบไฟล์ .log ออกจากโฟลเดอร์ logs/ (ไม่รวม .txt)"
          >
            🗑️ ล้างไฟล์ Log เก่า
          </button>

          <button
            onClick={handleCopyAll}
            disabled={logs.length === 0}
            className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-30"
          >
            📋 Copy All
          </button>

          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-30"
          >
            💾 Export .txt
          </button>

          <button
            onClick={handleClear}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 rounded-lg text-xs font-bold cursor-pointer transition-all"
          >
            🗑 Clear Memory
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="bg-slate-950/80 border border-white/5 rounded-xl overflow-y-auto font-mono text-xs"
        style={{ height: 'calc(100vh - 420px)', minHeight: '400px' }}
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 py-20">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-bold">ไม่มี Logs</p>
            <p className="text-xs text-slate-700 mt-1">ลองรันงาน AI หรือเปลี่ยน filter</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {logs.map((log, idx) => {
              const colors = LEVEL_COLORS[log.level] || LEVEL_COLORS.INFO;
              return (
                <div
                  key={`${log.timestamp}-${idx}`}
                  className={`group flex items-start gap-2 px-2 py-1 rounded hover:bg-white/5 transition-colors border-l-2 ${colors.border}`}
                >
                  <span className="text-slate-600 flex-shrink-0 w-16">{log.time}</span>
                  <span className={`flex-shrink-0 px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} font-bold text-[10px] min-w-[60px] text-center`}>
                    {LEVEL_ICONS[log.level]} {log.level}
                  </span>
                  <span className="flex-shrink-0 text-slate-500 min-w-[70px]">
                    {SOURCE_ICONS[log.source]} {log.source}
                  </span>
                  <span className="flex-1 text-slate-300 break-all">{log.message}</span>
                  <button
                    onClick={() => handleCopyEntry(log)}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-400 cursor-pointer transition-opacity"
                    title="Copy"
                  >
                    📋
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-600 px-2">
        <span>
          แสดง {logs.length} logs
          {isPaused && <span className="ml-2 text-amber-400 font-bold">⏸ PAUSED</span>}
        </span>
        <span>Max buffer: 1500 entries</span>
      </div>
    </div>
  );
}