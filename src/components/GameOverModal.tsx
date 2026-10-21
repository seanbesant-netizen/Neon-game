import React from 'react';
import { RotateCcw, Home, Trophy, Award } from 'lucide-react';
import { RunSummary } from '../game/engine.ts';

interface GameOverModalProps {
  summary: RunSummary;
  onRestart: () => void;
  onTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  summary,
  onRestart,
  onTitle,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/85 select-none">
      <div className="w-full max-w-md rounded-2xl border border-purple-500/40 bg-slate-950 p-6 sm:p-8 shadow-[0_0_70px_rgba(236,72,153,0.35)] flex flex-col items-center text-center">
        {/* Banner */}
        <div className="mb-2">
          {summary.isNewHigh ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 font-mono text-xs font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(245,158,11,0.5)]">
              <Trophy className="w-3.5 h-3.5 fill-current" />
              <span>NEW HIGH SCORE!</span>
            </div>
          ) : (
            <div className="text-xs font-mono font-bold tracking-widest text-purple-400 uppercase">
              GRID BREACH DETECTED
            </div>
          )}
        </div>

        <h2 className="text-3xl sm:text-4xl font-black tracking-widest text-white uppercase font-sans drop-shadow-[0_0_20px_rgba(236,72,153,0.8)]">
          GAME OVER
        </h2>

        {/* Hero Score Tile */}
        <div className="my-6 w-full py-4 px-6 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center">
          <div className="text-xs font-mono text-slate-400 font-semibold uppercase tracking-wider">
            FINAL SCORE
          </div>
          <div className="text-4xl sm:text-5xl font-extrabold font-mono text-white tabular-nums tracking-tight mt-1 drop-shadow-[0_0_20px_rgba(236,72,153,0.9)]">
            {summary.score.toLocaleString()}
          </div>
          <div className="mt-2 text-xs font-mono text-slate-400 flex items-center gap-1">
            <span>HIGH SCORE:</span>
            <span className="text-amber-400 font-bold tabular-nums">
              {summary.highScore.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Detailed Run Mastery Breakdown */}
        <div className="grid grid-cols-3 gap-2 w-full mb-6 text-left">
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">SECTOR</div>
            <div className="text-base font-bold font-mono text-cyan-400 tabular-nums">
              {summary.sectorReached.toString().padStart(2, '0')}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">PEAK COMBO</div>
            <div className="text-base font-bold font-mono text-pink-400 tabular-nums">
              {summary.maxMultiplier}x
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] font-mono text-slate-400">SHARDS</div>
            <div className="text-base font-bold font-mono text-emerald-400 tabular-nums">
              {summary.shardsCollected}
            </div>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-col gap-3 w-full">
          <button
            data-start="true"
            onClick={onRestart}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-red-500 via-amber-400 via-emerald-400 via-cyan-400 to-purple-500 hover:opacity-95 text-slate-950 font-black tracking-wider text-base uppercase transition-all shadow-[0_0_35px_rgba(236,72,153,0.7)] cursor-pointer flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5 stroke-[2.5]" />
            <span>TRY AGAIN</span>
            <span className="text-xs opacity-85 font-mono hidden sm:inline">[SPACE / ENTER]</span>
          </button>

          <button
            onClick={onTitle}
            className="w-full py-3 px-4 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>TITLE MENU</span>
          </button>
        </div>
      </div>
    </div>
  );
};
