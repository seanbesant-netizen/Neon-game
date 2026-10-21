import React from 'react';
import { Play, RotateCcw, Home, Volume2, VolumeX } from 'lucide-react';
import { sound } from '../game/audio.ts';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
  score: number;
  sector: number;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onTitle,
  score,
  sector,
}) => {
  const [isMuted, setIsMuted] = React.useState(sound.getMuted());

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/85">
      <div className="w-full max-w-sm rounded-2xl border border-purple-500/40 bg-slate-950 p-6 md:p-8 shadow-[0_0_60px_rgba(236,72,153,0.3)] flex flex-col items-center text-center">
        <h2 className="text-2xl font-black tracking-widest text-white uppercase drop-shadow-[0_0_15px_rgba(236,72,153,0.8)] font-sans">
          PAUSED
        </h2>

        {/* Quick run stats */}
        <div className="grid grid-cols-2 gap-3 w-full my-6 text-left">
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">SECTOR</div>
            <div className="text-lg font-bold font-mono text-cyan-400 tabular-nums">
              {sector.toString().padStart(2, '0')}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">CURRENT SCORE</div>
            <div className="text-lg font-bold font-mono text-white tabular-nums">
              {Math.round(score).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={onResume}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-red-500 via-amber-400 via-emerald-400 via-cyan-400 to-purple-500 text-slate-950 font-black tracking-wider text-sm uppercase transition-all hover:scale-[1.02] shadow-[0_0_28px_rgba(236,72,153,0.6)] cursor-pointer flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            <span>RESUME RUN</span>
            <span className="text-xs opacity-85 font-mono">[ESC / P]</span>
          </button>

          <button
            onClick={onRestart}
            className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold tracking-wider text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>RESTART</span>
            <span className="text-xs opacity-75 font-mono text-slate-400">[R]</span>
          </button>

          <div className="flex gap-2 w-full mt-1">
            <button
              onClick={handleToggleMute}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 font-mono text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              <span>{isMuted ? 'UNMUTE [M]' : 'MUTE [M]'}</span>
            </button>

            <button
              onClick={onTitle}
              className="py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
              aria-label="Return to Title"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
