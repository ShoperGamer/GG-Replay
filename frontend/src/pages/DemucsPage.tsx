import React, { useState } from 'react';
import Waveform from '../components/Waveform';

const DemucsPage: React.FC = () => {
  const [audioFile, setAudioFile] = useState<{name: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultReady, setResultReady] = useState(false);

  const handleProcess = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setResultReady(true);
    }, 4000); // Mock processing time
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Stem Splitter</h2>
        <p className="text-gray-400">แยกเสียงร้อง (Vocals) และดนตรี (Instruments) ออกจากกันด้วยโมเดล Demucs</p>
      </header>

      <div className="glass-panel p-6 rounded-2xl">
        <div className="flex flex-col md:flex-row gap-4 items-center mb-6">
           <button 
             onClick={() => setAudioFile({name: 'song_mix_final.mp3'})}
             className="w-full md:w-auto px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl border border-gray-600 transition-colors flex items-center justify-center gap-2"
           >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
              เลือกไฟล์เพลง
           </button>
           {audioFile && <span className="text-gray-300 font-mono bg-black/30 px-4 py-2 rounded-lg flex-1">{audioFile.name}</span>}
        </div>

        <button 
          onClick={handleProcess}
          disabled={!audioFile || isProcessing}
          className={`w-full py-3 rounded-xl font-bold mb-8 transition-all ${
            !audioFile || isProcessing 
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
            : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          {isProcessing ? 'กำลังแยกเลเยอร์เสียง...' : 'เริ่มต้นแยกเสียง (Split)'}
        </button>

        {/* ส่วนแสดงผลเมื่อเสร็จสิ้น */}
        {resultReady && (
          <div className="space-y-6 pt-6 border-t border-gray-800 animate-fade-in">
            <div>
              <h4 className="text-indigo-400 font-medium mb-3 flex items-center gap-2">
                🎤 Vocals (เสียงร้อง)
              </h4>
              <div className="bg-black/40 p-4 rounded-xl border border-gray-800">
                 <Waveform audioUrl="mock_vocal" color="#818cf8" />
              </div>
            </div>
            
            <div>
              <h4 className="text-purple-400 font-medium mb-3 flex items-center gap-2">
                🎸 Instruments (ดนตรีพื้นหลัง)
              </h4>
              <div className="bg-black/40 p-4 rounded-xl border border-gray-800">
                 <Waveform audioUrl="mock_inst" color="#c084fc" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DemucsPage;