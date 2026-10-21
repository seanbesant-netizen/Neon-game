/**
 * High-performance 3D Cyberpunk Rainbow Runner Engine.
 *
 * Fully integrated with Three.js WebGL 3D renderer:
 * - Real-time 3D PBR pipeline with RoomEnvironment reflections & soft lighting
 * - Composite 3D procedural player ship with volumetric conic headlights & dynamic roll banking
 * - 3D flowing 7-spectrum chromatic ribbon player trails
 * - 3D monolithic neon walls with glowing edge wireframes & corner pylons
 * - 3D rotating kaleidoscopic crystal shards with orbiting satellites
 * - 3D multi-ring Stargate exit portal
 * - 3D animated hazards (Seeker Drones, Laser Turrets, Electro-Gates, Blitz Hunters)
 * - 3 Switchable 3D Camera Modes: Action Chase 3D, Isometric Tactical 3D, Cockpit 3D
 * - Floating 3D combat score readouts and 3D particle bursts
 * - Pure collision detection and score progression preserved from rules.ts
 */

import {
  Wall,
  Player,
  DataShard,
  Hazard,
  SeekerDrone,
  LaserTurret,
  ElectroGate,
  BlitzHunter,
  generateMazeLayout,
  resolveCircleRectCollision,
  circleIntersectsCircle,
  circleIntersectsRect,
  lineIntersectsCircle,
  calculateScore,
  updateCombo,
  addComboShard,
} from './rules.ts';
import { ThreeRenderer, CameraViewMode, isSoftwareGl } from './threeRenderer.ts';
import { sound } from './audio.ts';

export type EngineState = 'title' | 'playing' | 'paused' | 'gameover';

export interface HUDData {
  score: number;
  highScore: number;
  multiplier: number;
  comboTimer: number;
  sector: number;
  shardsCollected: number;
  shardsTotal: number;
  health: number;
  maxHealth: number;
  dashReady: boolean;
  dashCooldownProgress: number; // 0 to 1
  gatewayUnlocked: boolean;
  cameraMode: CameraViewMode;
}

export interface RunSummary {
  score: number;
  highScore: number;
  isNewHigh: boolean;
  sectorReached: number;
  shardsCollected: number;
  maxMultiplier: number;
  timeAliveSec: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private renderer3D: ThreeRenderer;
  private state: EngineState = 'title';

  // Level data
  private sector: number = 1;
  private walls: Wall[] = [];
  private shards: DataShard[] = [];
  private hazards: Hazard[] = [];
  private worldBounds = { width: 1600, height: 1200 };
  private exitGateway = { x: 1400, y: 1000, radius: 40, unlocked: false };

  // Player state
  private player: Player = {
    x: 140,
    y: 140,
    vx: 0,
    vy: 0,
    radius: 13,
    angle: 0,
    speed: 340,
    maxSpeed: 380,
    health: 3,
    maxHealth: 3,
    dashCooldown: 0,
    dashCooldownMax: 1.3,
    dashDuration: 0,
    isDashing: false,
    invulnerableTimer: 0,
  };

  // Run statistics
  private score: number = 0;
  private highScore: number = 0;
  private multiplier: number = 1;
  private comboTimer: number = 0;
  private maxMultiplierAchieved: number = 1;
  private shardsCollectedCount: number = 0;
  private totalShardsRequired: number = 14;
  private runDuration: number = 0;

  // Input system
  private keysHeld = new Set<string>();
  private dashBuffered: boolean = false;
  private bufferTimer: number = 0;
  private touchVector = { x: 0, y: 0, active: false };

  // Juice & Timers
  private hitstopTimer: number = 0;
  private sectorWarpTimer: number = 0;

  // Loop control
  private lastTime: number = 0;
  private animationFrameId: number | null = null;
  private timeoutId: number | null = null;
  private isDestroyed: boolean = false;

  // React callbacks
  private onHUDUpdate?: (hud: HUDData) => void;
  private onStateChange?: (state: EngineState, summary?: RunSummary) => void;
  private lastHUDPushTime: number = 0;

  constructor(
    canvas: HTMLCanvasElement,
    onStateChange?: (state: EngineState, summary?: RunSummary) => void,
    onHUDUpdate?: (hud: HUDData) => void
  ) {
    this.canvas = canvas;
    this.onStateChange = onStateChange;
    this.onHUDUpdate = onHUDUpdate;

    // Initialize Three.js 3D WebGL renderer
    this.renderer3D = new ThreeRenderer(canvas);

    const savedBest = localStorage.getItem('neon_runner_highscore');
    if (savedBest) {
      this.highScore = parseInt(savedBest, 10) || 0;
    }

    this.bindInputs();
    this.loadSector(1);
    this.syncDocumentState('title');

    // Expose engine instance for debugging/tests
    if (typeof window !== 'undefined') {
      (window as unknown as { __gameEngine?: GameEngine }).__gameEngine = this;
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        this.startRun();
      }
    }

    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.scheduleNextFrame();
  }

  private scheduleNextFrame() {
    if (this.isDestroyed) return;

    if (isSoftwareGl) {
      // Pace software WebGL gently to ensure reliable snapshots without stalling
      this.timeoutId = window.setTimeout(() => {
        this.animationFrameId = requestAnimationFrame(this.loop);
      }, 33);
    } else {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  private syncDocumentState(state: EngineState) {
    this.state = state;
    if (typeof document !== 'undefined') {
      document.body.dataset.state = state;
    }
  }

  private bindInputs() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleBlur);
  }

  private unbindInputs() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleBlur);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.state === 'playing') {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    }

    const code = e.code;
    this.keysHeld.add(code);

    if (code === 'KeyM') {
      sound.toggleMute();
      return;
    }

    if (code === 'KeyC') {
      this.toggleCameraMode();
      return;
    }

    if (this.state === 'title') {
      if (code === 'Enter' || code === 'Space') {
        e.preventDefault();
        this.startRun();
      }
      return;
    }

    if (this.state === 'gameover') {
      if (code === 'Enter' || code === 'Space' || code === 'KeyR') {
        e.preventDefault();
        this.startRun();
      }
      return;
    }

    if (this.state === 'playing') {
      if (code === 'KeyP' || code === 'Escape') {
        this.pauseRun();
        return;
      }
      if (code === 'KeyR') {
        this.startRun();
        return;
      }
      if (code === 'Space') {
        this.triggerDash();
      }
    } else if (this.state === 'paused') {
      if (code === 'KeyP' || code === 'Escape') {
        this.resumeRun();
        return;
      }
      if (code === 'KeyR') {
        this.startRun();
        return;
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  private handleBlur = () => {
    this.keysHeld.clear();
    this.touchVector = { x: 0, y: 0, active: false };
    if (this.state === 'playing') {
      this.pauseRun();
    }
  };

  public toggleCameraMode(): CameraViewMode {
    const nextMode = this.renderer3D.toggleCameraMode();
    const modeName = nextMode === 'chase' ? 'CHASE 3D' : nextMode === 'iso' ? 'ISOMETRIC 3D' : 'COCKPIT 3D';
    this.renderer3D.spawnCombatText(`CAM: ${modeName}`, this.player.x, this.player.y, '#38bdf8');
    this.pushHUDToReact(true);
    return nextMode;
  }

  public setCameraMode(mode: CameraViewMode) {
    this.renderer3D.setCameraMode(mode);
    this.pushHUDToReact(true);
  }

  public setTouchVector(x: number, y: number, active: boolean) {
    this.touchVector = { x, y, active };
  }

  public triggerDash() {
    if (this.state !== 'playing') return;

    if (this.player.dashCooldown <= 0 && !this.player.isDashing) {
      this.executeDash();
    } else {
      this.dashBuffered = true;
      this.bufferTimer = 0.15;
    }
  }

  private executeDash() {
    this.player.isDashing = true;
    this.player.dashDuration = 0.24;
    this.player.dashCooldown = this.player.dashCooldownMax;
    this.dashBuffered = false;

    const currentSpeed = Math.hypot(this.player.vx, this.player.vy);
    const dashSpeed = 680;
    if (currentSpeed > 10) {
      this.player.vx = (this.player.vx / currentSpeed) * dashSpeed;
      this.player.vy = (this.player.vy / currentSpeed) * dashSpeed;
    } else {
      this.player.vx = Math.cos(this.player.angle) * dashSpeed;
      this.player.vy = Math.sin(this.player.angle) * dashSpeed;
    }

    sound.playDash();
    this.renderer3D.addTrauma(0.35);

    // 3D shockwave particles
    this.renderer3D.spawnParticles(this.player.x, this.player.y, 24, 0x06b6d4, 140);
  }

  public startRun() {
    this.score = 0;
    this.multiplier = 1;
    this.comboTimer = 0;
    this.maxMultiplierAchieved = 1;
    this.shardsCollectedCount = 0;
    this.runDuration = 0;

    this.player.health = this.player.maxHealth;
    this.player.dashCooldown = 0;
    this.player.isDashing = false;
    this.player.dashDuration = 0;
    this.player.invulnerableTimer = 0;

    this.loadSector(1);
    this.syncDocumentState('playing');
    sound.startMusic();
    this.onStateChange?.('playing');
    this.pushHUDToReact(true);
  }

  public pauseRun() {
    if (this.state === 'playing') {
      this.syncDocumentState('paused');
      sound.stopMusic();
      this.onStateChange?.('paused');
    }
  }

  public resumeRun() {
    if (this.state === 'paused') {
      this.syncDocumentState('playing');
      this.lastTime = performance.now();
      sound.startMusic();
      this.onStateChange?.('playing');
    }
  }

  public returnToTitle() {
    this.syncDocumentState('title');
    sound.stopMusic();
    this.loadSector(1);
    this.onStateChange?.('title');
  }

  public triggerGameOver() {
    if (this.state === 'gameover') return;

    this.syncDocumentState('gameover');
    sound.stopMusic();
    sound.playGameOver();

    const isNewHigh = this.score > this.highScore;
    if (isNewHigh) {
      this.highScore = this.score;
      localStorage.setItem('neon_runner_highscore', String(this.highScore));
    }

    const summary: RunSummary = {
      score: Math.round(this.score),
      highScore: Math.round(this.highScore),
      isNewHigh,
      sectorReached: this.sector,
      shardsCollected: this.shardsCollectedCount,
      maxMultiplier: this.maxMultiplierAchieved,
      timeAliveSec: Math.floor(this.runDuration),
    };

    this.onStateChange?.('gameover', summary);
    this.pushHUDToReact(true);
  }

  private loadSector(sec: number) {
    this.sector = sec;
    const layout = generateMazeLayout(sec);

    this.walls = layout.walls;
    this.shards = layout.shards;
    this.hazards = layout.hazards;
    this.worldBounds = layout.worldBounds;
    this.exitGateway = {
      x: layout.exitGateway.x,
      y: layout.exitGateway.y,
      radius: layout.exitGateway.radius,
      unlocked: false,
    };

    // Position player safely at start
    this.player.x = layout.playerSpawn.x;
    this.player.y = layout.playerSpawn.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.angle = 0;

    this.totalShardsRequired = this.shards.length;

    // Rebuild 3D walls in the 3D scene
    this.renderer3D.rebuildWalls(this.walls);
  }

  private advanceSector() {
    sound.playSectorClear();
    this.sectorWarpTimer = 0.6;
    this.renderer3D.addTrauma(0.55);

    this.renderer3D.spawnParticles(this.player.x, this.player.y, 45, 0x10b981, 160);
    this.renderer3D.spawnCombatText('SECTOR CLEARED!', this.player.x, this.player.y, '#10b981');

    const clearBonus = 1500 * this.sector * this.multiplier;
    this.score += clearBonus;

    this.loadSector(this.sector + 1);
    this.pushHUDToReact(true);
  }

  private pushHUDToReact(force: boolean = false) {
    const now = performance.now();
    if (!force && now - this.lastHUDPushTime < 60) return;
    this.lastHUDPushTime = now;

    if (!this.onHUDUpdate) return;

    const collectedThisSector = this.shards.filter((s) => s.collected).length;
    const progress =
      this.player.dashCooldownMax > 0
        ? Math.min(1, Math.max(0, 1 - this.player.dashCooldown / this.player.dashCooldownMax))
        : 1;

    this.onHUDUpdate({
      score: this.score,
      highScore: this.highScore,
      multiplier: this.multiplier,
      comboTimer: this.comboTimer,
      sector: this.sector,
      shardsCollected: collectedThisSector,
      shardsTotal: this.totalShardsRequired,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      dashReady: this.player.dashCooldown <= 0,
      dashCooldownProgress: progress,
      gatewayUnlocked: this.exitGateway.unlocked,
      cameraMode: this.renderer3D.cameraMode,
    });
  }

  private takeDamage() {
    if (this.player.invulnerableTimer > 0 || this.player.isDashing) return;

    this.player.health -= 1;
    sound.playDamage();
    this.renderer3D.addTrauma(0.75);
    this.hitstopTimer = 0.05;
    this.player.invulnerableTimer = 1.4;

    this.multiplier = 1;
    this.comboTimer = 0;

    this.renderer3D.spawnParticles(this.player.x, this.player.y, 30, 0xef4444, 150);
    this.renderer3D.spawnCombatText('CRITICAL HIT!', this.player.x, this.player.y, '#ef4444');

    if (this.player.health <= 0) {
      this.triggerGameOver();
    } else {
      this.pushHUDToReact(true);
    }
  }

  private loop(currentTime: number) {
    if (this.isDestroyed) return;

    let dt = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    if (dt > 0.1) dt = 0.1;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.renderer3D.render(
        this.player,
        this.shards,
        this.hazards,
        this.exitGateway,
        dt,
        this.state
      );
      this.scheduleNextFrame();
      return;
    }

    if (this.sectorWarpTimer > 0) this.sectorWarpTimer -= dt;

    if (this.state === 'playing') {
      this.runDuration += dt;
      this.update(dt);
    }

    // Render 3D Scene
    this.renderer3D.render(
      this.player,
      this.shards,
      this.hazards,
      this.exitGateway,
      dt,
      this.state
    );

    this.scheduleNextFrame();
  }

  private update(dt: number) {
    // 1. Process Player Movement & Input
    let moveX = 0;
    let moveY = 0;

    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) moveY -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) moveY += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) moveX -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) moveX += 1;

    if (this.touchVector.active) {
      moveX = this.touchVector.x;
      moveY = this.touchVector.y;
    }

    const inputMagnitude = Math.hypot(moveX, moveY);
    if (inputMagnitude > 1) {
      moveX /= inputMagnitude;
      moveY /= inputMagnitude;
    }

    if (this.bufferTimer > 0) {
      this.bufferTimer -= dt;
      if (this.bufferTimer <= 0) this.dashBuffered = false;
    }
    if (this.dashBuffered && this.player.dashCooldown <= 0 && !this.player.isDashing) {
      this.executeDash();
    }

    if (this.player.dashCooldown > 0) {
      this.player.dashCooldown -= dt;
    }

    if (this.player.isDashing) {
      this.player.dashDuration -= dt;
      if (this.player.dashDuration <= 0) {
        this.player.isDashing = false;
      }
    }

    if (this.player.invulnerableTimer > 0) {
      this.player.invulnerableTimer -= dt;
    }

    const currentMaxSpeed = this.player.isDashing ? 680 : this.player.maxSpeed;
    const accel = this.player.isDashing ? 3200 : 2100;
    const drag = this.player.isDashing ? 0.98 : 0.88;

    if (inputMagnitude > 0.05 && !this.player.isDashing) {
      this.player.vx += moveX * accel * dt;
      this.player.vy += moveY * accel * dt;
      this.player.angle = Math.atan2(this.player.vy, this.player.vx);
    } else if (!this.player.isDashing) {
      this.player.vx *= Math.pow(drag, dt * 60);
      this.player.vy *= Math.pow(drag, dt * 60);
    }

    const currentSpeed = Math.hypot(this.player.vx, this.player.vy);
    if (currentSpeed > currentMaxSpeed) {
      this.player.vx = (this.player.vx / currentSpeed) * currentMaxSpeed;
      this.player.vy = (this.player.vy / currentSpeed) * currentMaxSpeed;
    }

    // Integrate position with Wall Collisions
    this.player.x += this.player.vx * dt;
    for (const wall of this.walls) {
      const res = resolveCircleRectCollision(
        this.player.x,
        this.player.y,
        this.player.radius,
        wall.x,
        wall.y,
        wall.w,
        wall.h
      );
      if (res.collided) {
        this.player.x = res.x;
        this.player.y = res.y;
        this.player.vx = 0;
      }
    }

    this.player.y += this.player.vy * dt;
    for (const wall of this.walls) {
      const res = resolveCircleRectCollision(
        this.player.x,
        this.player.y,
        this.player.radius,
        wall.x,
        wall.y,
        wall.w,
        wall.h
      );
      if (res.collided) {
        this.player.x = res.x;
        this.player.y = res.y;
        this.player.vy = 0;
      }
    }

    // World boundary clamps
    this.player.x = Math.max(
      this.player.radius + 8,
      Math.min(this.worldBounds.width - this.player.radius - 8, this.player.x)
    );
    this.player.y = Math.max(
      this.player.radius + 8,
      Math.min(this.worldBounds.height - this.player.radius - 8, this.player.y)
    );

    // Update Combo Decay
    const comboUpdate = updateCombo(this.multiplier, this.comboTimer, dt);
    this.multiplier = comboUpdate.multiplier;
    this.comboTimer = comboUpdate.timer;

    // 2. Data Shards Collection
    for (const shard of this.shards) {
      if (shard.collected) continue;

      if (
        circleIntersectsCircle(
          this.player.x,
          this.player.y,
          this.player.radius,
          shard.x,
          shard.y,
          shard.radius + 6
        )
      ) {
        shard.collected = true;
        this.shardsCollectedCount++;

        const nextCombo = addComboShard(this.multiplier);
        this.multiplier = nextCombo.multiplier;
        this.comboTimer = nextCombo.timer;
        if (this.multiplier > this.maxMultiplierAchieved) {
          this.maxMultiplierAchieved = this.multiplier;
        }

        const pts = calculateScore(shard.value, this.multiplier);
        this.score += pts;

        const ptsColor = shard.isSuperCore ? '#f59e0b' : '#38bdf8';
        this.renderer3D.spawnCombatText(`+${pts}`, shard.x, shard.y, ptsColor);
        if (this.multiplier > 1) {
          this.renderer3D.spawnCombatText(`${this.multiplier}x COMBO!`, shard.x, shard.y, '#f43f5e');
        }

        if (shard.isSuperCore) {
          sound.playSuperCore();
          this.renderer3D.addTrauma(0.45);
          this.renderer3D.spawnParticles(shard.x, shard.y, 40, 0xf59e0b, 180);

          this.player.dashCooldown = 0;
          this.clearNearbyHazards(shard.x, shard.y, 250);
          this.renderer3D.spawnCombatText('OVERDRIVE!', shard.x, shard.y, '#f59e0b');
        } else {
          sound.playShardPickup(this.multiplier);
          this.renderer3D.spawnParticles(shard.x, shard.y, 16, 0x06b6d4, 110);
        }

        if (this.shardsCollectedCount >= this.totalShardsRequired && !this.exitGateway.unlocked) {
          this.exitGateway.unlocked = true;
          sound.playSectorClear();
          this.renderer3D.spawnCombatText('GATEWAY UNLOCKED!', this.exitGateway.x, this.exitGateway.y, '#10b981');
          this.renderer3D.spawnParticles(this.exitGateway.x, this.exitGateway.y, 45, 0x10b981, 160);
        }

        this.pushHUDToReact();
      }
    }

    // 3. Exit Gateway check
    if (this.exitGateway.unlocked) {
      if (
        circleIntersectsCircle(
          this.player.x,
          this.player.y,
          this.player.radius,
          this.exitGateway.x,
          this.exitGateway.y,
          this.exitGateway.radius
        )
      ) {
        this.advanceSector();
        return;
      }
    }

    // 4. Hazards Update & Collision
    for (const hazard of this.hazards) {
      if (!hazard.active) continue;

      if (hazard.type === 'seeker_drone') {
        this.updateSeekerDrone(hazard, dt);
      } else if (hazard.type === 'electro_gate') {
        this.updateElectroGate(hazard, dt);
      } else if (hazard.type === 'laser_turret') {
        this.updateLaserTurret(hazard, dt);
      } else if (hazard.type === 'blitz_hunter') {
        this.updateBlitzHunter(hazard, dt);
      }
    }

    this.pushHUDToReact();
  }

  private clearNearbyHazards(x: number, y: number, radius: number) {
    for (const h of this.hazards) {
      if (Math.hypot(h.x - x, h.y - y) < radius) {
        h.active = false;
        this.renderer3D.spawnParticles(h.x, h.y, 25, 0xf59e0b, 140);
        this.score += 250 * this.multiplier;
        this.renderer3D.spawnCombatText('+250 CLEAR', h.x, h.y, '#10b981');
      }
    }
  }

  private updateSeekerDrone(drone: SeekerDrone, dt: number) {
    const distToPlayer = Math.hypot(this.player.x - drone.x, this.player.y - drone.y);

    if (distToPlayer < 360) {
      const angle = Math.atan2(this.player.y - drone.y, this.player.x - drone.x);
      drone.vx += Math.cos(angle) * (drone.speed * 2.2) * dt;
      drone.vy += Math.sin(angle) * (drone.speed * 2.2) * dt;

      const spd = Math.hypot(drone.vx, drone.vy);
      if (spd > drone.speed) {
        drone.vx = (drone.vx / spd) * drone.speed;
        drone.vy = (drone.vy / spd) * drone.speed;
      }
    } else {
      drone.patrolAngle += 0.8 * dt;
      const targetX = drone.centerX + Math.cos(drone.patrolAngle) * drone.patrolRadius;
      const targetY = drone.centerY + Math.sin(drone.patrolAngle) * drone.patrolRadius;
      drone.vx += (targetX - drone.x) * 2.0 * dt;
      drone.vy += (targetY - drone.y) * 2.0 * dt;
    }

    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;

    if (
      circleIntersectsCircle(
        this.player.x,
        this.player.y,
        this.player.radius,
        drone.x,
        drone.y,
        drone.radius
      )
    ) {
      this.takeDamage();
    }
  }

  private updateElectroGate(gate: ElectroGate, dt: number) {
    gate.currentTime = (gate.currentTime + dt) % gate.cycleTime;

    if (gate.currentTime < gate.offDuration) {
      gate.state = 'off';
    } else if (gate.currentTime < gate.offDuration + gate.warningDuration) {
      gate.state = 'warning';
    } else {
      gate.state = 'active';
    }

    if (gate.state === 'active') {
      const minX = gate.x - gate.w / 2;
      const minY = gate.y - gate.h / 2;
      if (
        circleIntersectsRect(
          this.player.x,
          this.player.y,
          this.player.radius,
          minX,
          minY,
          gate.w,
          gate.h
        )
      ) {
        this.takeDamage();
      }
    }
  }

  private updateLaserTurret(turret: LaserTurret, dt: number) {
    turret.cycleTimer += dt;
    const cycle = turret.cycleTimer % 4.5;

    if (cycle < 2.0) {
      turret.isTelegraphing = false;
      turret.isFiring = false;
      turret.angle += turret.sweepSpeed * dt;
    } else if (cycle < 3.2) {
      turret.isTelegraphing = true;
      turret.isFiring = false;
      turret.telegraphTimer = 3.2 - cycle;
    } else {
      turret.isTelegraphing = false;
      if (!turret.isFiring) {
        sound.playLaserFire();
        this.renderer3D.addTrauma(0.18);
      }
      turret.isFiring = true;
      turret.fireTimer = 4.5 - cycle;

      const endX = turret.x + Math.cos(turret.angle) * turret.range;
      const endY = turret.y + Math.sin(turret.angle) * turret.range;

      if (
        lineIntersectsCircle(
          turret.x,
          turret.y,
          endX,
          endY,
          this.player.x,
          this.player.y,
          this.player.radius
        )
      ) {
        this.takeDamage();
      }
    }
  }

  private updateBlitzHunter(hunter: BlitzHunter, dt: number) {
    const distToPlayer = Math.hypot(this.player.x - hunter.x, this.player.y - hunter.y);

    if (hunter.state === 'stalking') {
      hunter.timer -= dt;
      const angle = Math.atan2(this.player.y - hunter.y, this.player.x - hunter.x);
      hunter.x += Math.cos(angle) * (hunter.speed * 0.35) * dt;
      hunter.y += Math.sin(angle) * (hunter.speed * 0.35) * dt;

      if (hunter.timer <= 0 && distToPlayer < 500) {
        hunter.state = 'charging';
        hunter.timer = 0.55;
        hunter.targetX = this.player.x;
        hunter.targetY = this.player.y;
      }
    } else if (hunter.state === 'charging') {
      hunter.timer -= dt;
      const chargeAngle = Math.atan2(hunter.targetY - hunter.y, hunter.targetX - hunter.x);
      hunter.x += Math.cos(chargeAngle) * (hunter.speed * 1.8) * dt;
      hunter.y += Math.sin(chargeAngle) * (hunter.speed * 1.8) * dt;

      if (hunter.timer <= 0) {
        hunter.state = 'cooldown';
        hunter.timer = 1.4;
      }
    } else if (hunter.state === 'cooldown') {
      hunter.timer -= dt;
      if (hunter.timer <= 0) {
        hunter.state = 'stalking';
        hunter.timer = 1.8;
      }
    }

    if (
      circleIntersectsCircle(
        this.player.x,
        this.player.y,
        this.player.radius,
        hunter.x,
        hunter.y,
        hunter.radius
      )
    ) {
      this.takeDamage();
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }
    this.unbindInputs();
    this.renderer3D.dispose();
  }
}
