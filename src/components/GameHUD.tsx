import React, { useRef, useState, useEffect } from 'react';
import { Volume2, VolumeX, Pause, RotateCcw, Zap, Camera } from 'lucide-react';
import { HUDData } from '../game/engine.ts';
import { sound } from '../game/audio.ts';

interface GameHUDProps {
  hud: HUDData;
  onPause: () => void;
  onRestart: () => void;
  onToggleCamera?: () => void;
  onTouchMove?: (x: number, y: number, active: boolean) => void;
  onTouchDash?: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  onPause,
  onRestart,
  onToggleCamera,
  onTouchMove,
  onTouchDash,
}) => {
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Virtual joystick state
  const joystickRef = useRef<HTMLDivElement>(null);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Detect touch capability or small mobile viewports
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768;
    setIsTouchDevice(hasTouch);
  }, []);

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    const next = sound.toggleMute();
    setIsMuted(next);
  };

  const handlePause = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    onPause();
  };

  const handleRestart = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    onRestart();
  };

  // Virtual Joystick touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleTouchDrag(e);
  };

  const handleTouchDrag = (e: React.TouchEvent) => {
    if (!joystickRef.current) return;
    const touch = e.touches[0];
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const maxRadius = rect.width / 2;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const posX = Math.cos(angle) * clampedDist;
    const posY = Math.sin(angle) * clampedDist;

    setStickPos({ x: posX, y: posY });

    if (onTouchMove) {
      onTouchMove(posX / maxRadius, posY / maxRadius, true);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setStickPos({ x: 0, y: 0 });
    if (onTouchMove) {
      onTouchMove(0, 0, false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Top Header Bar */}
      <div className="flex items-start justify-between w-full">
        {/* Top-Left Cluster: Score & Multiplier */}
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-mono tracking-wider text-slate-400 font-semibold uppercase">
              SCORE
            </span>
            <span className="text-3xl md:text-4xl font-extrabold text-white font-mono tabular-nums tracking-tight drop-shadow-[0_0_12px_rgba(6,182,212,0.6)]">
              {Math.round(hud.score).toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>BEST</span>
            <span className="text-amber-400 font-bold tabular-nums">
              {Math.round(hud.highScore).toLocaleString()}
            </span>
          </div>

          {/* Rainbow Combo Multiplier Bar */}
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`font-mono font-black text-xs px-2.5 py-0.5 rounded transition-all ${
                hud.multiplier > 1
                  ? 'bg-gradient-to-r from-rose-500 via-amber-400 via-emerald-400 via-cyan-400 to-purple-500 text-slate-950 shadow-[0_0_14px_rgba(236,72,153,0.6)]'
                  : 'bg-slate-800/40 text-slate-400 border border-slate-700/30'
              }`}
            >
              {hud.multiplier}x COMBO
            </span>
            {hud.multiplier > 1 && (
              <div className="w-20 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700/80 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 via-yellow-400 via-emerald-400 via-cyan-400 to-purple-500 rounded-full transition-all duration-75 ease-linear shadow-[0_0_10px_#ec4899]"
                  style={{ width: `${Math.min(100, (hud.comboTimer / 3.5) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Mobile-Only Compact Shields & Dash Gauge */}
          <div className="sm:hidden flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1">
              {[...Array(hud.maxHealth)].map((_, idx) => {
                const isFull = idx < hud.health;
                const rainbowShieldColors = ['#ef4444', '#10b981', '#06b6d4'];
                const color = rainbowShieldColors[idx % rainbowShieldColors.length];
                return (
                  <div
                    key={idx}
                    className="w-3 h-3 rounded-xs border"
                    style={{
                      backgroundColor: isFull ? color : 'rgba(15, 23, 42, 0.8)',
                      borderColor: isFull ? color : '#334155',
                      boxShadow: isFull ? `0 0 6px ${color}` : 'none',
                    }}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-1">
              <div
                className={`h-1.5 rounded-full border transition-all ${
                  hud.dashReady
                    ? 'w-12 bg-cyan-400 border-cyan-300 shadow-[0_0_6px_#06b6d4]'
                    : 'w-12 bg-slate-800 border-slate-700'
                }`}
              >
                {!hud.dashReady && (
                  <div
                    className="h-full bg-cyan-400 rounded-full"
                    style={{ width: `${hud.dashCooldownProgress * 100}%` }}
                  />
                )}
              </div>
              <span className="text-[9px] font-mono font-bold text-cyan-400">
                {hud.dashReady ? 'READY' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Center Cluster: Sector Level & Shard Goal */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase">
            SECTOR {hud.sector.toString().padStart(2, '0')}
          </div>
          <div
            className={`mt-1 text-xs md:text-sm font-mono font-semibold transition-colors ${
              hud.gatewayUnlocked
                ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'
                : 'text-slate-300'
            }`}
          >
            {hud.gatewayUnlocked ? (
              <span>GATEWAY UNLOCKED - EXIT</span>
            ) : (
              <span>
                {hud.shardsCollected} / {hud.shardsTotal} SHARDS
              </span>
            )}
          </div>
        </div>

        {/* Top-Right Cluster: Utility Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {onToggleCamera && (
            <button
              onClick={onToggleCamera}
              aria-label="Toggle 3D Camera View"
              title={`3D Camera: ${hud.cameraMode?.toUpperCase() || 'CHASE'} [C]`}
              className="flex items-center gap-1.5 px-2.5 py-2 md:py-2.5 rounded-lg border border-cyan-500/40 bg-slate-950/80 text-cyan-400 hover:bg-cyan-950/40 hover:border-cyan-400 transition-colors cursor-pointer text-xs font-mono font-bold"
              tabIndex={-1}
            >
              <Camera className="w-4 h-4 md:w-5 md:h-5 text-cyan-400" />
              <span className="hidden sm:inline uppercase">
                {hud.cameraMode === 'iso' ? '3D ISO' : hud.cameraMode === 'cockpit' ? '3D COCKPIT' : '3D CHASE'}
              </span>
            </button>
          )}
          <button
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            title="Mute [M]"
            className="p-2 md:p-2.5 rounded-lg border border-slate-700/60 bg-slate-950/80 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors cursor-pointer"
            tabIndex={-1}
          >
            {isMuted ? <VolumeX className="w-4 h-4 md:w-5 md:h-5" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5" />}
          </button>
          <button
            onClick={handlePause}
            aria-label="Pause Game"
            title="Pause [P / Esc]"
            className="p-2 md:p-2.5 rounded-lg border border-slate-700/60 bg-slate-950/80 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors cursor-pointer"
            tabIndex={-1}
          >
            <Pause className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button
            onClick={handleRestart}
            aria-label="Restart Run"
            title="Restart [R]"
            className="p-2 md:p-2.5 rounded-lg border border-slate-700/60 bg-slate-950/80 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors cursor-pointer"
            tabIndex={-1}
          >
            <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Footer HUD */}
      <div className="flex items-end justify-between w-full pointer-events-none">
        {/* Desktop Bottom-Left: Vitality Shield Sockets & Dash Meter */}
        <div className="hidden sm:flex flex-col gap-3 pointer-events-auto">
          {/* 3 Shield Vitality Sockets */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-wider text-slate-400 font-semibold mr-1">
              SHIELD
            </span>
            {[...Array(hud.maxHealth)].map((_, idx) => {
              const isFull = idx < hud.health;
              const rainbowShieldColors = ['#ef4444', '#10b981', '#06b6d4'];
              const color = rainbowShieldColors[idx % rainbowShieldColors.length];
              return (
                <svg
                  key={idx}
                  viewBox="0 0 24 24"
                  className={`w-6 h-6 md:w-7 md:h-7 transition-all ${
                    isFull ? '' : 'text-slate-800'
                  }`}
                  style={{
                    color: isFull ? color : '#334155',
                    filter: isFull ? `drop-shadow(0 0 8px ${color})` : 'none',
                  }}
                  fill="none"
                >
                  <polygon
                    points="12,2 22,8 22,16 12,22 2,16 2,8"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill={isFull ? 'currentColor' : 'rgba(15, 23, 42, 0.6)'}
                    fillOpacity={isFull ? '0.75' : '1'}
                  />
                  {isFull && (
                    <polygon
                      points="12,6 18,10 18,14 12,18 6,14 6,10"
                      fill="#ffffff"
                      fillOpacity="0.85"
                    />
                  )}
                </svg>
              );
            })}
          </div>

          {/* Dash Charge Gauge */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all ${
                hud.dashReady
                  ? 'border-cyan-400/60 bg-cyan-950/30 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${hud.dashReady ? 'fill-cyan-300' : ''}`} />
              <span className="text-[11px] font-mono font-bold tracking-wider">
                {hud.dashReady ? 'DASH READY' : 'RECHARGING'}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                [SPACE]
              </span>
            </div>

            {!hud.dashReady && (
              <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${hud.dashCooldownProgress * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>



        {/* Mobile Dual-Thumb Touch Controls (Left: Joystick, Right: Dash) */}
        {isTouchDevice && (
          <div className="sm:hidden w-full flex items-center justify-between pb-2 pointer-events-auto">
            {/* Left Thumb: Virtual Joystick */}
            <div
              ref={joystickRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchDrag}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              className="relative w-20 h-20 rounded-full border-2 border-cyan-500/40 bg-slate-950/70 flex items-center justify-center touch-none select-none"
            >
              <div
                className="w-8 h-8 rounded-full bg-cyan-400 shadow-[0_0_12px_#06b6d4] transition-transform duration-75"
                style={{
                  transform: `translate(${stickPos.x}px, ${stickPos.y}px)`,
                }}
              />
            </div>

            {/* Right Thumb: Boost Dash Button */}
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                onTouchDash?.();
              }}
              onClick={onTouchDash}
              aria-label="Dash"
              className={`w-16 h-16 rounded-full flex flex-col items-center justify-center border-2 transition-all active:scale-90 cursor-pointer ${
                hud.dashReady
                  ? 'border-cyan-400 bg-cyan-400/20 text-cyan-300 shadow-[0_0_18px_rgba(6,182,212,0.6)]'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500'
              }`}
            >
              <Zap className="w-5 h-5 fill-current" />
              <span className="text-[9px] font-mono font-bold mt-0.5">DASH</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
