import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine, EngineState, HUDData, RunSummary } from './game/engine.ts';
import { TitleScreen } from './components/TitleScreen.tsx';
import { GameHUD } from './components/GameHUD.tsx';
import { PauseModal } from './components/PauseModal.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<EngineState>('title');
  const [hudData, setHudData] = useState<HUDData>({
    score: 0,
    highScore: 0,
    multiplier: 1,
    comboTimer: 0,
    sector: 1,
    shardsCollected: 0,
    shardsTotal: 14,
    health: 3,
    maxHealth: 3,
    dashReady: true,
    dashCooldownProgress: 1,
    gatewayUnlocked: false,
    cameraMode: 'chase',
  });

  const [runSummary, setRunSummary] = useState<RunSummary>({
    score: 0,
    highScore: 0,
    isNewHigh: false,
    sectorReached: 1,
    shardsCollected: 0,
    maxMultiplier: 1,
    timeAliveSec: 0,
  });

  const handleStateChange = useCallback((state: EngineState, summary?: RunSummary) => {
    setGameState(state);
    if (summary) {
      setRunSummary(summary);
    }
  }, []);

  const handleHUDUpdate = useCallback((hud: HUDData) => {
    setHudData(hud);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(
      canvasRef.current,
      handleStateChange,
      handleHUDUpdate
    );
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [handleStateChange, handleHUDUpdate]);

  const handleStart = () => {
    engineRef.current?.startRun();
  };

  const handlePause = () => {
    engineRef.current?.pauseRun();
  };

  const handleResume = () => {
    engineRef.current?.resumeRun();
  };

  const handleRestart = () => {
    engineRef.current?.startRun();
  };

  const handleTitle = () => {
    engineRef.current?.returnToTitle();
  };

  const handleToggleCamera = () => {
    engineRef.current?.toggleCameraMode();
  };

  const handleTouchMove = (x: number, y: number, active: boolean) => {
    engineRef.current?.setTouchVector(x, y, active);
  };

  const handleTouchDash = () => {
    engineRef.current?.triggerDash();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#030408] select-none">
      {/* 3D WebGL Neon Simulation Canvas */}
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        className="absolute inset-0 block w-full h-full cursor-crosshair"
      />

      {/* Cyber CRT Scanline Overlay */}
      <div className="cyber-scanlines absolute inset-0 pointer-events-none z-10" />

      {/* Title Screen View */}
      {gameState === 'title' && (
        <TitleScreen
          onStart={handleStart}
          highScore={hudData.highScore}
        />
      )}

      {/* Active Playing HUD */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <GameHUD
          hud={hudData}
          onPause={handlePause}
          onRestart={handleRestart}
          onToggleCamera={handleToggleCamera}
          onTouchMove={handleTouchMove}
          onTouchDash={handleTouchDash}
        />
      )}

      {/* Paused Modal */}
      {gameState === 'paused' && (
        <PauseModal
          onResume={handleResume}
          onRestart={handleRestart}
          onTitle={handleTitle}
          score={hudData.score}
          sector={hudData.sector}
        />
      )}

      {/* Game Over Modal */}
      {gameState === 'gameover' && (
        <GameOverModal
          summary={runSummary}
          onRestart={handleRestart}
          onTitle={handleTitle}
        />
      )}
    </div>
  );
}
