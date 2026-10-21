/**
 * Zero-GC High Performance Pooled Particle Engine for 60fps Neon Rainbow Juice.
 * Pre-allocates fixed memory to eliminate garbage collection pauses during gameplay.
 */

export type ParticleShape = 'circle' | 'spark' | 'ring' | 'ghost' | 'text' | 'star' | 'lightning';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  shape: ParticleShape;
  angle: number;
  angularVelocity: number;
  scaleX: number;
  scaleY: number;
  text?: string;
  fontSize?: number;
}

export class ParticlePool {
  private capacity: number;
  private pool: Particle[];
  private cursor: number = 0;

  constructor(capacity: number = 650) {
    this.capacity = capacity;
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 0,
        maxRadius: 0,
        life: 0,
        maxLife: 1,
        color: '#06b6d4',
        shape: 'circle',
        angle: 0,
        angularVelocity: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }
  }

  public emit(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    maxLife: number,
    color: string,
    shape: ParticleShape = 'circle',
    angle: number = 0,
    scaleX: number = 1,
    scaleY: number = 1,
    angularVelocity: number = 0,
    text?: string,
    fontSize?: number
  ) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;

    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.radius = radius;
    p.maxRadius = radius;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.color = color;
    p.shape = shape;
    p.angle = angle;
    p.angularVelocity = angularVelocity;
    p.scaleX = scaleX;
    p.scaleY = scaleY;
    p.text = text;
    p.fontSize = fontSize || 14;
  }

  public emitBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    speedMin: number = 60,
    speedMax: number = 220,
    maxLife: number = 0.45
  ) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const r = 2 + Math.random() * 3.5;
      this.emit(
        x,
        y,
        vx,
        vy,
        r,
        maxLife * (0.7 + Math.random() * 0.6),
        color,
        'spark',
        angle,
        1,
        1,
        (Math.random() - 0.5) * 8
      );
    }
  }

  public emitRainbowBurst(
    x: number,
    y: number,
    count: number = 18,
    speedMin: number = 80,
    speedMax: number = 280,
    maxLife: number = 0.55
  ) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const r = 2.5 + Math.random() * 4;
      const hue = Math.floor((i * 360) / count);
      const color = `hsl(${hue}, 100%, 65%)`;
      this.emit(
        x,
        y,
        vx,
        vy,
        r,
        maxLife * (0.8 + Math.random() * 0.5),
        color,
        'star',
        angle,
        1,
        1,
        (Math.random() - 0.5) * 12
      );
    }
  }

  public emitShockwave(x: number, y: number, color: string = '#ec4899', maxRadius: number = 130) {
    this.emit(x, y, 0, 0, 8, 0.45, color, 'ring', 0, maxRadius, maxRadius);
  }

  public emitGhost(x: number, y: number, angle: number, radius: number, color: string = '#06b6d4') {
    this.emit(x, y, 0, 0, radius, 0.24, color, 'ghost', angle);
  }

  public emitFloatingText(x: number, y: number, text: string, color: string = '#ffffff', fontSize: number = 14) {
    const vx = (Math.random() - 0.5) * 15;
    const vy = -45 - Math.random() * 25;
    this.emit(x, y, vx, vy, 0, 0.85, color, 'text', 0, 1, 1, 0, text, fontSize);
  }

  public emitEmber(x: number, y: number, color: string = '#06b6d4') {
    const vx = (Math.random() - 0.5) * 20;
    const vy = -15 - Math.random() * 25;
    const r = 1 + Math.random() * 2;
    this.emit(x, y, vx, vy, r, 1.2 + Math.random() * 0.8, color, 'spark');
  }

  public update(dt: number) {
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.angularVelocity * dt;

      if (p.shape === 'text') {
        p.vy *= 0.96;
      } else {
        p.vx *= 0.94; // slight drag
        p.vy *= 0.94;
      }

      if (p.shape === 'ring') {
        const progress = 1 - p.life / p.maxLife;
        // Ease out quad expansion
        const eased = 1 - Math.pow(1 - progress, 3);
        p.radius = 8 + eased * p.scaleX;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    // Additive glow blending for luminous neon energy
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;

      if (p.shape === 'ring') {
        // Multi-ring rainbow shockwave
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.5, 4.5 * alpha);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner harmonic echo ring
        if (p.radius > 25) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 0.88, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (p.shape === 'ghost') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.strokeStyle = p.color;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 16;
        ctx.globalAlpha = alpha * 0.6;
        // Faceted ship silhouette
        ctx.beginPath();
        ctx.moveTo(p.radius * 1.5, 0);
        ctx.lineTo(-p.radius * 1.0, -p.radius * 0.95);
        ctx.lineTo(-p.radius * 0.5, 0);
        ctx.lineTo(-p.radius * 1.0, p.radius * 0.95);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (p.shape === 'star') {
        // 4-point glowing starburst
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;

        const currentR = Math.max(1, p.radius * alpha * 1.3);
        ctx.beginPath();
        ctx.moveTo(0, -currentR * 1.8);
        ctx.lineTo(currentR * 0.4, -currentR * 0.4);
        ctx.lineTo(currentR * 1.8, 0);
        ctx.lineTo(currentR * 0.4, currentR * 0.4);
        ctx.lineTo(0, currentR * 1.8);
        ctx.lineTo(-currentR * 0.4, currentR * 0.4);
        ctx.lineTo(-currentR * 1.8, 0);
        ctx.lineTo(-currentR * 0.4, -currentR * 0.4);
        ctx.closePath();
        ctx.fill();

        // Brilliant white diamond core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, currentR * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.shape === 'spark') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        const currentR = Math.max(0.6, p.radius * alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentR, 0, Math.PI * 2);
        ctx.fill();

        // White-hot center
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentR * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'text' && p.text) {
        ctx.save();
        ctx.translate(p.x, p.y);
        const scale = 1 + (1 - alpha) * 0.3;
        ctx.scale(scale, scale);
        ctx.font = `900 ${p.fontSize || 14}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  public reset() {
    for (let i = 0; i < this.capacity; i++) {
      this.pool[i].active = false;
    }
  }
}
