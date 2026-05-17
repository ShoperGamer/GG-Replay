import React, { useState, useEffect } from 'react';
import Waveform from '../components/Waveform';
import * as Wails from '../../wailsjs/go/main/App'; 

interface SongOptions {
  pitch: number;
  instrumentalsPitch: number;
  preStemmed: boolean;
  vocalsOnly: boolean;
  sampleMode: boolean;
  deEchoDeReverb: boolean;
  sampleModeStartTime: number;
  f0Method: string;
  stemmingMethod: string;
  indexRatio: number;
  consonantProtection: number;
  outputFormat: string;
  volumeEnvelope: number;
}

const DemucsPage: React.FC = () => {
  const [audioFile, setAudioFile] = useState<{name: string, path: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  
  // ตั้งค่าเริ่มต้นของระบบคัดแยกเสียงเสียงร้องหลัก
  const [stemmingMethod, setStemmingMethod] = useState('UVR-MDX-NET Voc FT');
  
  const [vocalsFile, setVocalsFile] = useState<{name: string, streamUrl: string, fullPath: string} | null>(null);
  const [instrumentsFile, setInstrumentsFile] = useState<{name: string, streamUrl: string, fullPath: string} | null>(null);

  const handleSelectAudio = async () => {
    try {
      const res = await Wails.SelectAndSaveAudio();
      if (res && res.name) {
        const streamUrl = await (Wails as any).GetAudioUrl(res.name, "uploads");
        setAudioFile({ name: res.name, path: streamUrl });
        setVocalsFile(null);
        setInstrumentsFile(null);
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเลือกไฟล์เพลง");
    }
  };

  const handleProcess = async () => {
    if (!audioFile) return alert("กรุณาเลือกไฟล์เพลงที่ต้องการแยกเสียงก่อน");
    
    setIsProcessing(true);
    setProgress(0);
    setStatusMessage('กำลังเริ่มต้นระบบคัดแยกเลเยอร์เสียง...');

    try {
      const options: SongOptions = {
        pitch: 0,
        instrumentalsPitch: 0,
        preStemmed: false,
        vocalsOnly: true, 
        sampleMode: false,
        deEchoDeReverb: false,
        sampleModeStartTime: 0,
        f0Method: "rmvpe",
        stemmingMethod: stemmingMethod, 
        indexRatio: 0.75,
        consonantProtection: 0.35,
        outputFormat: "wav",
        volumeEnvelope: 1.0
      };

      const jobId = await Wails.CreateSong("none_model", audioFile.name, options);
      if (!jobId) throw new Error("ไม่สามารถเริ่มส่งงานเข้าสายพานได้");

      const interval = setInterval(async () => {
        const jobStatus: any = await Wails.GetJobProgress(jobId);
        
        if (jobStatus) {
           if (jobStatus.message) setStatusMessage(jobStatus.message);
           
           if (jobStatus.progress !== undefined) {
             setProgress(Math.round(jobStatus.progress));
           } else if (jobStatus.status === 'processing') {
             setProgress(prev => (prev < 95 ? prev + 2 : prev));
           }
           
           if (jobStatus.status === 'success' || jobStatus.status === 'completed') {
             clearInterval(interval);
             setIsProcessing(false);
             setProgress(100);
             
             if (jobStatus.originalVocalsPath && jobStatus.instrumentalsPath) {
                const vocalsUrl = await (Wails as any).GetAudioUrlByFullPath(jobStatus.originalVocalsPath);
                const instUrl = await (Wails as any).GetAudioUrlByFullPath(jobStatus.instrumentalsPath);
                
                setVocalsFile({ 
                  name: stemmingMethod.includes("Kim") ? "vocals.wav (เหลือเฉพาะเสียงร้องหลัก)" : "vocals.wav (เสียงร้องรวม)", 
                  streamUrl: vocalsUrl, 
                  fullPath: jobStatus.originalVocalsPath 
                });
                setInstrumentsFile({ 
                  name: stemmingMethod.includes("Kim") ? "no_vocals.wav (ดนตรี + เสียงประสาน)" : "no_vocals.wav (ดนตรีเปล่า)", 
                  streamUrl: instUrl, 
                  fullPath: jobStatus.instrumentalsPath 
                });
             }
             alert("คัดแยกเลเยอร์เสียงเพลงเสร็จสมบูรณ์!");
           } else if (jobStatus.status === 'failed' || jobStatus.status === 'errored') {
             clearInterval(interval);
             setIsProcessing(false);
             alert("การประมวลผลล้มเหลว: " + (jobStatus.error || "Unknown Error"));
           }
        }
      }, 1500);

    } catch (err) {
      setIsProcessing(false);
      alert("Error: " + err);
    }
  };

  const handleDownloadFile = async (fullPath: string, defaultName: string) => {
    try {
      const res = await (Wails as any).SaveFileAs(fullPath, defaultName);
      if (res && res.status === "success") {
        alert(`บันทึกไฟล์ดาวน์โหลดสำเร็จที่ตำแหน่ง:\n${res.path}`);
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกไฟล์");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn text-slate-200 p-4">
      <header className="mb-6">
        <h2 className="text-3xl font-black text-white uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
          UVR Stem Splitter Studio
        </h2>
        <p className="text-slate-400 text-sm">แยกเสียงร้องและดนตรีออกจากกัน พร้อมโหมดแก้ทางลบเสียงประสานหลายคน</p>
      </header>

      <div className="glass-card p-6 rounded-3xl border border-white/5 bg-slate-950/20 backdrop-blur shadow-2xl space-y-4">
        
        {/* กล่องเลือกโมเดลแยกเสียงสเตมส์ */}
        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 flex flex-col space-y-2">
          <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Stemming Model Method (โหมดแยกไฟล์เสียง)</label>
          <select 
            value={stemmingMethod} 
            onChange={(e) => setStemmingMethod(e.target.value)}
            className="w-full bg-slate-950 text-sm font-medium text-slate-200 border border-white/10 p-3 rounded-xl outline-none cursor-pointer"
          >
            <optgroup label="โมเดลสกัดเสียงคอรัส / ร้องนำชั้นเยี่ยม (Vocal Isolation)">
              <option value="UVR-MDX-NET Voc FT">UVR-MDX-NET Voc FT (โหมดดั้งเดิมยอดนิยม)</option>
              <option value="Kim_Vocal_1">Kim_Vocal_1 (โหมดพิเศษ: ดึงเฉพาะเสียงหลัก ลบเสียงประสานคอรัสออก)</option>
            </optgroup>

            <optgroup label="โมเดลคัดแยกตัดดนตรีทำคาราโอเกะ (Karaoke Modules)">
              <option value="UVR-MDX-NET Karaoke">UVR-MDX-NET Karaoke</option>
              <option value="UVR-MDX-NET Karaoke 2">UVR-MDX-NET Karaoke 2</option>
              <option value="5_HP-Karaoke-UVR">5_HP-Karaoke-UVR</option>
              <option value="6_HP-Karaoke-UVR">6_HP-Karaoke-UVR</option>
              <option value="UVR_MDXNET_9482">UVR_MDXNET_9482</option>
            </optgroup>

            <optgroup label="โมเดลแยกเครื่องดนตรีหลายชิ้น (Demucs Transformers)">
              <option value="v4 | htdemucs_ft">v4 | htdemucs_ft (แยกละเอียด 4 สเตม HQ)</option>
              <option value="v4 | htdemucs">v4 | htdemucs (สเตมมาตรฐาน)</option>
            </optgroup>

            <optgroup label="โมเดลล้างเสียงห้องก้อง / เสียงสะท้อน (Acoustics Fixer)">
              <option value="UVR-DeEcho-DeReverb by FoxJoy">UVR-DeEcho-DeReverb by FoxJoy</option>
            </optgroup>
          </select>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center">
           <button 
             disabled={isProcessing}
             onClick={handleSelectAudio}
             className="w-full md:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 border border-white/10 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30"
           >
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
              เลือกไฟล์เพลงมิกซ์
           </button>
           {audioFile ? (
             <span className="text-white font-mono bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5 rounded-xl flex-1 truncate text-sm">
                🎵 {audioFile.name}
             </span>
           ) : (
             <span className="text-slate-500 text-sm italic pl-2">ยังไม่ได้เลือกไฟล์เพลง...</span>
           )}
        </div>

        {audioFile && !vocalsFile && (
          <div className="p-4 bg-slate-900/40 rounded-2xl border border-white/5 animate-fadeIn">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Original Track Preview</p>
            <Waveform color="#6366f1" audioUrl={audioFile.path} />
            <audio src={audioFile.path} controls className="w-full h-8 mt-2 opacity-70 accent-indigo-500" />
          </div>
        )}

        <button 
          onClick={handleProcess}
          disabled={!audioFile || isProcessing}
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white rounded-2xl font-black shadow-xl shadow-indigo-900/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-[0.99] text-sm tracking-widest uppercase"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2 justify-center">
               <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               {statusMessage} ({progress}%)
            </span>
          ) : "START STEM SEPARATION"}
        </button>

        {/* แผงเครื่องเล่นและดาวน์โหลดหลังคัดแยก */}
        {(vocalsFile || instrumentsFile) && (
          <div className="space-y-6 pt-4 border-t border-white/5 animate-fadeIn">
            
            {vocalsFile && (
              <div className="p-4 bg-indigo-950/10 rounded-2xl border border-indigo-500/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                  <h4 className="text-indigo-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    🎤 {vocalsFile.name}
                  </h4>
                  <button 
                    onClick={() => handleDownloadFile(vocalsFile.fullPath, "clean_lead_vocals.wav")}
                    className="flex items-center justify-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow transition-all cursor-pointer w-full sm:w-auto"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    ดาวน์โหลดไฟล์เสียงร้องนำ (.WAV)
                  </button>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl space-y-3">
                   <Waveform audioUrl={vocalsFile.streamUrl} color="#818cf8" />
                   <audio src={vocalsFile.streamUrl} controls className="w-full h-8 opacity-90 accent-indigo-500" />
                </div>
              </div>
            )}
            
            {instrumentsFile && (
              <div className="p-4 bg-purple-950/10 rounded-2xl border border-purple-500/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                  <h4 className="text-purple-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    🎸 {instrumentsFile.name}
                  </h4>
                  <button 
                    onClick={() => handleDownloadFile(instrumentsFile.fullPath, "backing_tracks_with_harmonies.wav")}
                    className="flex items-center justify-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg shadow transition-all cursor-pointer w-full sm:w-auto"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    ดาวน์โหลดไฟล์ดนตรี+เสียงประสาน (.WAV)
                  </button>
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl space-y-3">
                   <Waveform audioUrl={instrumentsFile.streamUrl} color="#c084fc" />
                   <audio src={instrumentsFile.streamUrl} controls className="w-full h-8 opacity-90 accent-purple-500" />
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

export default DemucsPage;