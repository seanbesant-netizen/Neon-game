/**
 * Pure game rules, math, and layout logic for Neon Grid Runner.
 * Fully decoupled from DOM and rendering for fast unit testing.
 */

export interface Vector2D {
  x: number;
  y: number;
}

export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
  neonColor: string; // e.g., '#06b6d4' | '#a855f7' | '#ec4899'
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  health: number;
  maxHealth: number;
  dashCooldown: number; // remaining seconds
  dashCooldownMax: number;
  dashDuration: number; // remaining seconds during active dash
  isDashing: boolean;
  invulnerableTimer: number; // seconds of invulnerability after taking hit
}

export interface DataShard {
  id: string;
  x: number;
  y: number;
  radius: number;
  value: number;
  collected: boolean;
  isSuperCore: boolean; // Clears nearby threats & instant dash recharge
}

export type HazardType = 'seeker_drone' | 'laser_turret' | 'electro_gate' | 'blitz_hunter';

export interface BaseHazard {
  id: string;
  type: HazardType;
  x: number;
  y: number;
  active: boolean;
}

export interface SeekerDrone extends BaseHazard {
  type: 'seeker_drone';
  radius: number;
  vx: number;
  vy: number;
  speed: number;
  patrolAngle: number;
  patrolRadius: number;
  centerX: number;
  centerY: number;
}

export interface LaserTurret extends BaseHazard {
  type: 'laser_turret';
  angle: number;
  range: number;
  sweepSpeed: number;
  telegraphTimer: number; // countdown during windup
  fireTimer: number;      // duration of active laser beam
  cycleTimer: number;     // loop time
  isTelegraphing: boolean;
  isFiring: boolean;
}

export interface ElectroGate extends BaseHazard {
  type: 'electro_gate';
  w: number;
  h: number;
  cycleTime: number; // total cycle time (e.g., 3.6s)
  offDuration: number; // 2.0s
  warningDuration: number; // 0.6s
  activeDuration: number; // 1.0s
  state: 'off' | 'warning' | 'active';
  currentTime: number;
}

export interface BlitzHunter extends BaseHazard {
  type: 'blitz_hunter';
  radius: number;
  speed: number;
  state: 'stalking' | 'charging' | 'cooldown';
  timer: number;
  targetX: number;
  targetY: number;
  chargeAngle: number;
}

export type Hazard = SeekerDrone | LaserTurret | ElectroGate | BlitzHunter;

export interface SectorConfig {
  sector: number;
  gridWidth: number;
  gridHeight: number;
  shardsRequired: number;
  speedMultiplier: number;
  hazardDensity: number;
}

/**
 * Circle to Axis-Aligned Bounding Box intersection check.
 */
export function circleIntersectsRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));

  const distanceX = cx - closestX;
  const distanceY = cy - closestY;

  return distanceX * distanceX + distanceY * distanceY <= r * r;
}

/**
 * Circle to Circle intersection check.
 */
export function circleIntersectsCircle(
  c1x: number,
  c1y: number,
  r1: number,
  c2x: number,
  c2y: number,
  r2: number
): boolean {
  const dx = c2x - c1x;
  const dy = c2y - c1y;
  const combinedR = r1 + r2;
  return dx * dx + dy * dy < combinedR * combinedR;
}

/**
 * Resolves player collision against an axis-aligned box with smooth wall sliding.
 */
export function resolveCircleRectCollision(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { x: number; y: number; collided: boolean } {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= r * r || distSq === 0) {
    // If inside or outside without depth
    if (distSq === 0) {
      // Degenerate center inside rectangle, push out along shortest axis
      const leftDist = cx - rx;
      const rightDist = rx + rw - cx;
      const topDist = cy - ry;
      const bottomDist = ry + rh - cy;
      const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
      if (minDist === leftDist) return { x: rx - r, y: cy, collided: true };
      if (minDist === rightDist) return { x: rx + rw + r, y: cy, collided: true };
      if (minDist === topDist) return { x: cx, y: ry - r, collided: true };
      return { x: cx, y: ry + rh + r, collided: true };
    }
    return { x: cx, y: cy, collided: false };
  }

  const dist = Math.sqrt(distSq);
  const overlap = r - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  return {
    x: cx + nx * overlap,
    y: cy + ny * overlap,
    collided: true,
  };
}

/**
 * Calculates score earned for collecting an item or clearing milestones.
 */
export function calculateScore(
  baseValue: number,
  multiplier: number,
  bonusMultiplier: number = 1
): number {
  return Math.round(baseValue * multiplier * bonusMultiplier);
}

/**
 * Updates combo multiplier and decay timer.
 * Multiplier decays if player doesn't collect shards within combo decay threshold.
 */
export function updateCombo(
  currentMultiplier: number,
  comboTimer: number,
  dt: number,
  decayThreshold: number = 3.5
): { multiplier: number; timer: number; decayed: boolean } {
  let newTimer = comboTimer - dt;
  let newMultiplier = currentMultiplier;
  let decayed = false;

  if (newTimer <= 0) {
    if (currentMultiplier > 1) {
      newMultiplier = Math.max(1, currentMultiplier - 1);
      newTimer = decayThreshold * 0.75; // Shorter grace period before dropping again
      decayed = true;
    } else {
      newMultiplier = 1;
      newTimer = 0;
    }
  }

  return {
    multiplier: newMultiplier,
    timer: Math.max(0, newTimer),
    decayed,
  };
}

/**
 * Increments combo multiplier up to max 8x.
 */
export function addComboShard(
  currentMultiplier: number,
  decayThreshold: number = 3.5
): { multiplier: number; timer: number } {
  const newMultiplier = Math.min(8, currentMultiplier + 1);
  return {
    multiplier: newMultiplier,
    timer: decayThreshold,
  };
}

/**
 * Calculates difficulty parameters for a given sector level.
 */
export function calculateDifficultyParams(sector: number): SectorConfig {
  const safeSector = Math.max(1, Math.floor(sector));
  return {
    sector: safeSector,
    gridWidth: Math.min(2200, 1400 + safeSector * 150),
    gridHeight: Math.min(1800, 1100 + safeSector * 120),
    shardsRequired: Math.min(50, 14 + safeSector * 4),
    speedMultiplier: Math.min(1.8, 1.0 + (safeSector - 1) * 0.1),
    hazardDensity: Math.min(2.5, 1.0 + (safeSector - 1) * 0.25),
  };
}

/**
 * Line segment to circle intersection check for laser beams.
 */
export function lineIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const distSq = (cx - x1) * (cx - x1) + (cy - y1) * (cy - y1);
    return distSq <= r * r;
  }

  // Projection scalar of center onto segment
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  const distX = cx - projX;
  const distY = cy - projY;

  return distX * distX + distY * distY <= r * r;
}

/**
 * Generates procedural cyber maze layout for a sector.
 * Guaranteeing wide corridors (at least 80-120px) so player can maneuver freely,
 * multiple connecting circuits, zero single dead ends, and open spawn zone.
 */
export function generateMazeLayout(sector: number): {
  walls: Wall[];
  shards: DataShard[];
  hazards: Hazard[];
  playerSpawn: Vector2D;
  exitGateway: { x: number; y: number; radius: number; unlocked: boolean };
  worldBounds: { width: number; height: number };
} {
  const config = calculateDifficultyParams(sector);
  const width = config.gridWidth;
  const height = config.gridHeight;

  const walls: Wall[] = [];
  const rainbowColors = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#10b981', // Green
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#8b5cf6', // Violet
    '#ec4899', // Pink
  ];
  const baseColor = rainbowColors[(sector - 1) % rainbowColors.length];

  // Outer boundary walls
  const wallThickness = 28;
  walls.push({ x: 0, y: 0, w: width, h: wallThickness, neonColor: baseColor });
  walls.push({ x: 0, y: height - wallThickness, w: width, h: wallThickness, neonColor: baseColor });
  walls.push({ x: 0, y: 0, w: wallThickness, h: height, neonColor: baseColor });
  walls.push({ x: width - wallThickness, y: 0, w: wallThickness, h: height, neonColor: baseColor });

  // Grid maze blocks (modular blocks leaving generous open highways)
  const cellW = 240;
  const cellH = 200;
  const cols = Math.floor((width - 160) / cellW);
  const rows = Math.floor((height - 160) / cellH);

  const playerSpawn: Vector2D = { x: 140, y: 140 };

  for (let c = 1; c < cols; c++) {
    for (let r = 1; r < rows; r++) {
      const bx = 80 + c * cellW;
      const by = 80 + r * cellH;

      // Keep spawn sector clear
      if (bx < 360 && by < 360) continue;

      // Deterministic layout variation per sector
      const seed = (c * 37 + r * 19 + sector * 53) % 100;
      if (seed < 42) {
        // Horizontal divider with corridor gaps
        walls.push({
          x: bx - 70,
          y: by - 10,
          w: 140,
          h: 20,
          neonColor: baseColor,
        });
      } else if (seed < 84) {
        // Vertical divider with corridor gaps
        walls.push({
          x: bx - 10,
          y: by - 60,
          w: 20,
          h: 120,
          neonColor: baseColor,
        });
      } else {
        // Corner pillar / core junction
        walls.push({
          x: bx - 25,
          y: by - 25,
          w: 50,
          h: 50,
          neonColor: baseColor,
        });
      }
    }
  }

  // Generate Data Shards distributed throughout corridors
  const shards: DataShard[] = [];
  const shardCount = config.shardsRequired;
  const shardSpacingX = (width - 240) / Math.ceil(Math.sqrt(shardCount * 1.5));
  const shardSpacingY = (height - 240) / Math.ceil(Math.sqrt(shardCount * 1.5));

  let shardId = 0;
  for (let sx = 160; sx < width - 160 && shards.length < shardCount; sx += shardSpacingX) {
    for (let sy = 160; sy < height - 160 && shards.length < shardCount; sy += shardSpacingY) {
      // Don't spawn right on player
      if (Math.hypot(sx - playerSpawn.x, sy - playerSpawn.y) < 140) continue;

      // Check if inside a wall
      const inWall = walls.some((w) =>
        circleIntersectsRect(sx, sy, 24, w.x, w.y, w.w, w.h)
      );
      if (!inWall) {
        const isSuper = shardId % 8 === 7;
        shards.push({
          id: `shard_${shardId++}`,
          x: sx + (Math.sin(shardId) * 20),
          y: sy + (Math.cos(shardId) * 20),
          radius: isSuper ? 16 : 9,
          value: isSuper ? 500 : 100,
          collected: false,
          isSuperCore: isSuper,
        });
      }
    }
  }

  // Generate Hazards tailored to sector
  const hazards: Hazard[] = [];
  let hazardId = 0;

  // 1. Patrol Seeker Drones
  const droneCount = Math.min(10, 2 + Math.floor(sector * 1.4));
  for (let i = 0; i < droneCount; i++) {
    const cx = 350 + (i * 260) % (width - 500);
    const cy = 250 + (i * 210) % (height - 400);
    hazards.push({
      id: `drone_${hazardId++}`,
      type: 'seeker_drone',
      x: cx,
      y: cy,
      centerX: cx,
      centerY: cy,
      radius: 14,
      vx: 0,
      vy: 0,
      speed: 120 * config.speedMultiplier,
      patrolAngle: (i * Math.PI) / 3,
      patrolRadius: 90 + (i % 3) * 35,
      active: true,
    });
  }

  // 2. Electro-Gates (Pulsing forcefield barriers across corridors)
  const gateCount = Math.min(8, 2 + Math.floor(sector * 1.1));
  for (let i = 0; i < gateCount; i++) {
    const gx = 450 + (i * 240) % (width - 600);
    const gy = 320 + (i * 200) % (height - 500);
    const isVert = i % 2 === 1;
    hazards.push({
      id: `gate_${hazardId++}`,
      type: 'electro_gate',
      x: gx,
      y: gy,
      w: isVert ? 24 : 140,
      h: isVert ? 140 : 24,
      cycleTime: 3.4,
      offDuration: 1.8,
      warningDuration: 0.6,
      activeDuration: 1.0,
      state: 'off',
      currentTime: (i * 0.9) % 3.4,
      active: true,
    });
  }

  // 3. Laser Turrets (with visible telegraph aiming lines)
  const turretCount = Math.min(6, 1 + Math.floor(sector * 0.8));
  for (let i = 0; i < turretCount; i++) {
    const tx = 300 + (i * 320) % (width - 400);
    const ty = 280 + (i * 280) % (height - 400);
    hazards.push({
      id: `turret_${hazardId++}`,
      type: 'laser_turret',
      x: tx,
      y: ty,
      angle: (i * Math.PI) / 2,
      range: 420,
      sweepSpeed: 0.6 + sector * 0.08,
      telegraphTimer: 0.7,
      fireTimer: 0.45,
      cycleTimer: 2.8,
      isTelegraphing: false,
      isFiring: false,
      active: true,
    });
  }

  // 4. Blitz Hunters (introduced in Sector 2+)
  if (sector >= 2) {
    const hunterCount = Math.min(4, Math.floor(sector * 0.7));
    for (let i = 0; i < hunterCount; i++) {
      const hx = width - 260 - (i * 200);
      const hy = height - 260 - (i * 180);
      hazards.push({
        id: `hunter_${hazardId++}`,
        type: 'blitz_hunter',
        x: hx,
        y: hy,
        radius: 16,
        speed: 210 * config.speedMultiplier,
        state: 'stalking',
        timer: 1.5 + i * 0.5,
        targetX: hx,
        targetY: hy,
        chargeAngle: 0,
        active: true,
      });
    }
  }

  // Exit Gateway (spawns in far corner)
  const exitGateway = {
    x: width - 140,
    y: height - 140,
    radius: 36,
    unlocked: false,
  };

  return {
    walls,
    shards,
    hazards,
    playerSpawn,
    exitGateway,
    worldBounds: { width, height },
  };
}
