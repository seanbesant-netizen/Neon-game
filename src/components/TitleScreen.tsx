import React from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { sound } from '../game/audio.ts';

interface TitleScreenProps {
  onStart: () => void;
  highScore: number;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, highScore }) => {
  const [isMuted, setIsMuted] = React.useState(sound.getMuted());

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-between p-4 sm:p-8 md:p-12 pointer-events-none select-none">
      {/* Top utility row */}
      <div className="w-full max-w-5xl flex items-center justify-end pointer-events-auto">
        <button
          onClick={handleToggleMute}
          aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          className="p-2.5 rounded-lg border border-cyan-500/20 bg-slate-950/80 text-cyan-400 hover:border-cyan-400 hover:bg-cyan-950/30 transition-colors cursor-pointer"
          tabIndex={-1}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Centerpiece Hero Title Card */}
      <div className="pointer-events-auto flex flex-col items-center text-center my-auto max-w-lg w-full bg-slate-950/90 p-6 sm:p-8 md:p-10 rounded-2xl border border-purple-500/40 shadow-[0_0_70px_rgba(236,72,153,0.3)]">
        {/* Custom Inline SVG Rainbow Title Lockup */}
        <div className="mb-5 flex justify-center w-full">
          <svg
            viewBox="0 0 460 90"
            className="w-64 sm:w-80 md:w-[390px] drop-shadow-[0_0_24px_rgba(236,72,153,0.6)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="rainbowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="16%" stopColor="#f97316" />
                <stop offset="33%" stopColor="#eab308" />
                <stop offset="50%" stopColor="#10b981" />
                <stop offset="66%" stopColor="#06b6d4" />
                <stop offset="83%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>

            {/* Cyber circuit lines */}
            <path
              d="M10 45 L50 45 L70 20 L390 20 L410 45 L450 45"
              stroke="url(#rainbowGrad)"
              strokeWidth="2.5"
              strokeOpacity="0.8"
            />
            <circle cx="10" cy="45" r="3.5" fill="#ef4444" />
            <circle cx="450" cy="45" r="3.5" fill="#ec4899" />

            {/* Glowing Rainbow Title Text */}
            <text
              x="230"
              y="56"
              textAnchor="middle"
              className="font-black tracking-widest text-[40px]"
              fill="#ffffff"
              stroke="url(#rainbowGrad)"
              strokeWidth="1.8"
              style={{
                fontFamily: 'Outfit, sans-serif',
                letterSpacing: '0.16em',
                paintOrder: 'stroke fill',
              }}
            >
              NEON GRID
            </text>
            <text
              x="230"
              y="80"
              textAnchor="middle"
              className="font-extrabold tracking-[0.32em] text-[13px]"
              fill="url(#rainbowGrad)"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              3D RAINBOW MAZE RUNNER
            </text>
          </svg>
        </div>

        <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
          Pilot through 3D prismatic cyber corridors, harvest chromatic data crystals, and weave through lethal security drones and laser barriers in real-time 3D.
        </p>

        {/* High Score Readout */}
        <div className="mb-6 flex items-baseline gap-2 text-slate-400 font-mono text-xs sm:text-sm">
          <span>HIGH SCORE</span>
          <span className="text-xl sm:text-2xl font-bold text-amber-400 tabular-nums">
            {highScore.toLocaleString()}
          </span>
        </div>

        {/* Primary Rainbow Start CTA Button */}
        <button
          data-start="true"
          onClick={onStart}
          className="w-full sm:w-auto px-9 py-3.5 rounded-xl bg-gradient-to-r from-red-500 via-amber-400 via-emerald-400 via-cyan-400 to-purple-500 text-slate-950 font-black text-sm sm:text-base tracking-wider uppercase transition-all duration-150 hover:scale-105 active:scale-95 shadow-[0_0_35px_rgba(236,72,153,0.7)] cursor-pointer flex items-center justify-center gap-2.5"
        >
          <Play className="w-4 h-4 fill-slate-950" />
          <span>START 3D RUN</span>
          <span className="text-xs font-mono opacity-85 font-black hidden sm:inline">
            [SPACE / ENTER]
          </span>
        </button>
      </div>

      {/* Single Flat Control Hint Line */}
      <div className="w-full text-center text-[11px] sm:text-xs md:text-sm font-mono text-slate-400 pb-2">
        <span className="hidden sm:inline">WASD Steer · Space Dash · C 3D Camera · P Pause · R Restart</span>
        <span className="sm:hidden">Touch Joystick to Move · Tap Dash · Tap 3D to Switch Cam</span>
      </div>
    </div>
  );
};
