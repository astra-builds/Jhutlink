import { useEffect, useRef } from 'react';

const MAX_PARTICLES = 200;
const CLUSTERS = 3;
const MAX_VELOCITY = 2.5;
const ATTRACTOR_STRENGTH = 0.025;
const TRAIL_LENGTH_MIN = 6;
const TRAIL_LENGTH_MAX = 15;
const CLUSTER_SWAP_INTERVAL = 600;
const PALETTE = ['#22d3ee', '#10b981', '#3b82f6', '#c9a96e', '#94a3b8'];

const RGB_CACHE = new Map<string, { r: number; g: number; b: number }>();

function hexToRgb(hex: string) {
  let cached = RGB_CACHE.get(hex);
  if (cached) return cached;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  cached = result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
  RGB_CACHE.set(hex, cached);
  return cached;
}

interface Attractor {
  x: number; y: number;
  targetX: number; targetY: number;
  vx: number; vy: number;
}

class Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  radius: number;
  mass: number;
  baseRadius: number;
  orbitAngle: number;
  orbitSpeed: number;
  attractorId: number;
  trailX: Float64Array;
  trailY: Float64Array;
  trailHead: number;
  trailLen: number;
  maxTrailLen: number;
  layer: number;

  constructor(x: number, y: number, color: string, attractorId: number) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.attractorId = attractorId;
    this.baseRadius = Math.random() * 1.2 + 0.4;

    const r = Math.random();
    if (r < 0.05) {
      this.radius = this.baseRadius * 2;
      this.mass = 1.5;
      this.layer = 2;
    } else if (r < 0.15) {
      this.radius = this.baseRadius * 1.5;
      this.mass = 1;
      this.layer = 1;
    } else {
      this.radius = this.baseRadius;
      this.mass = 0.8;
      this.layer = 0;
    }

    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * (Math.random() * 0.8 + 0.2);
    this.vy = Math.sin(angle) * (Math.random() * 0.8 + 0.2);
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.orbitSpeed = (Math.random() - 0.5) * 0.02;
    this.maxTrailLen = Math.floor(Math.random() * (TRAIL_LENGTH_MAX - TRAIL_LENGTH_MIN + 1)) + TRAIL_LENGTH_MIN;
    this.trailX = new Float64Array(this.maxTrailLen);
    this.trailY = new Float64Array(this.maxTrailLen);
    this.trailHead = 0;
    this.trailLen = 0;
  }

  update(attractors: Attractor[], width: number, height: number, frameCount: number) {
    const head = this.trailHead;
    this.trailX[head] = this.x;
    this.trailY[head] = this.y;
    this.trailHead = (head + 1) % this.maxTrailLen;
    if (this.trailLen < this.maxTrailLen) this.trailLen++;

    const attractor = attractors[this.attractorId];
    if (!attractor) return;

    const dx = attractor.x - this.x;
    const dy = attractor.y - this.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);
    const invDist = 1 / (dist + 0.1);

    const gX = dx * invDist;
    const gY = dy * invDist;
    this.vx += gX * ATTRACTOR_STRENGTH * this.mass;
    this.vy += gY * ATTRACTOR_STRENGTH * this.mass;

    this.orbitAngle += this.orbitSpeed;
    const cosAngle = Math.cos(this.orbitAngle);
    this.vx += -gY * cosAngle * 0.2;
    this.vy += gX * cosAngle * 0.2;

    this.vx *= 0.98;
    this.vy *= 0.98;

    const speedSq = this.vx * this.vx + this.vy * this.vy;
    if (speedSq > MAX_VELOCITY * MAX_VELOCITY) {
      const scale = MAX_VELOCITY / Math.sqrt(speedSq);
      this.vx *= scale;
      this.vy *= scale;
    }

    this.x += this.vx;
    this.y += this.vy;

    if (this.x < -50 || this.x > width + 50 || this.y < -50 || this.y > height + 50) {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { this.x = -10; this.y = Math.random() * height; }
      else if (edge === 1) { this.x = width + 10; this.y = Math.random() * height; }
      else if (edge === 2) { this.x = Math.random() * width; this.y = -10; }
      else { this.x = Math.random() * width; this.y = height + 10; }

      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * 0.5;
      this.vy = Math.sin(angle) * 0.5;
    }

    if (this.layer === 2) {
      this.radius = this.baseRadius * 2 + Math.sin(frameCount * 0.003 + this.orbitAngle) * 0.3;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const len = this.trailLen;
    if (len < 2) return;

    let layerAlpha: number;
    if (this.layer === 2) layerAlpha = 0.9;
    else if (this.layer === 1) layerAlpha = 0.7;
    else layerAlpha = 0.45;

    const rgb = hexToRgb(this.color);
    const head = this.trailHead;
    const maxTL = this.maxTrailLen;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < len; i++) {
      const idx = (head - len + i + maxTL * 2) % maxTL;
      const prevIdx = (head - len + i - 1 + maxTL * 2) % maxTL;
      const alpha = (i / len) * layerAlpha;
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
      ctx.lineWidth = this.radius * (i / len);
      ctx.beginPath();
      ctx.moveTo(this.trailX[prevIdx], this.trailY[prevIdx]);
      ctx.lineTo(this.trailX[idx], this.trailY[idx]);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    if (this.layer === 2) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`;
      ctx.fill();
    }
  }
}

interface ParticleOrbitProps {
  simplified?: boolean;
  className?: string;
}

export default function ParticleOrbit({ simplified = false, className = '' }: ParticleOrbitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxParticles = simplified ? 100 : MAX_PARTICLES;
    const clusters = simplified ? 3 : CLUSTERS;
    const clusterSwapInterval = simplified ? 720 : CLUSTER_SWAP_INTERVAL;
    const palette = simplified
      ? ['#10b981', '#c9a96e', '#34d399', '#a7f3d0', '#059669']
      : PALETTE;
    const clearAlpha = simplified ? 0.15 : 0.25;

    let frameCount = 0;
    let particles: Particle[] = [];
    let attractors: Attractor[] = [];
    function resizeCanvas() {
      canvas!.width = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
    }

    function initAttractors(width: number, height: number) {
      attractors = [];
      for (let i = 0; i < clusters; i++) {
        attractors.push({
          x: Math.random() * width * 0.6 + width * 0.2,
          y: Math.random() * height * 0.6 + height * 0.2,
          targetX: Math.random() * width,
          targetY: Math.random() * height,
          vx: 0,
          vy: 0,
        });
      }
    }

    function updateAttractors(width: number, height: number) {
      for (const a of attractors) {
        const dx = a.targetX - a.x;
        const dy = a.targetY - a.y;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          a.targetX = Math.random() * width * 0.8 + width * 0.1;
          a.targetY = Math.random() * height * 0.8 + height * 0.1;
        }
        a.vx += dx * 0.0005;
        a.vy += dy * 0.0005;
        a.vx *= 0.95;
        a.vy *= 0.95;
        a.x += a.vx;
        a.y += a.vy;

        if (a.x < width * 0.1) { a.x = width * 0.1; a.vx *= -0.5; }
        if (a.x > width * 0.9) { a.x = width * 0.9; a.vx *= -0.5; }
        if (a.y < height * 0.1) { a.y = height * 0.1; a.vy *= -0.5; }
        if (a.y > height * 0.9) { a.y = height * 0.9; a.vy *= -0.5; }
      }
    }

    function swapClusters() {
      const newAssignments: number[] = [];
      for (let i = 0; i < clusters; i++) {
        newAssignments.push((i + 1 + Math.floor(Math.random() * (clusters - 1))) % clusters);
      }
      for (let i = 0; i < particles.length; i++) {
        particles[i].attractorId = newAssignments[i % clusters];
      }
    }

    function initParticles(width: number, height: number) {
      initAttractors(width, height);
      particles = [];
      for (let i = 0; i < maxParticles; i++) {
        const attractorId = i % clusters;
        const attractor = attractors[attractorId];
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 120 + 40;
        const x = attractor.x + Math.cos(angle) * dist;
        const y = attractor.y + Math.sin(angle) * dist;
        const color = palette[Math.floor(Math.random() * palette.length)];
        particles.push(new Particle(x, y, color, attractorId));
      }
    }

    function animate() {
      if (!isVisibleRef.current) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      frameCount++;

      ctx!.fillStyle = `rgba(3,3,3,${clearAlpha})`;
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      if (frameCount % clusterSwapInterval === 0) {
        swapClusters();
      }

      updateAttractors(canvas!.width, canvas!.height);

      for (const p of particles) {
        p.update(attractors, canvas!.width, canvas!.height, frameCount);
      }
      for (const p of particles) {
        p.draw(ctx!);
      }

      if (frameCount % 120 === 0) {
        const attractor = attractors[Math.floor(Math.random() * attractors.length)];
        const glowColor = palette[Math.floor(Math.random() * palette.length)];
        const rgb = hexToRgb(glowColor);
        const gradient = ctx!.createRadialGradient(attractor.x, attractor.y, 0, attractor.x, attractor.y, 60);
        gradient.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`);
        gradient.addColorStop(1, 'rgba(3,3,3,0)');
        ctx!.fillStyle = gradient;
        ctx!.fillRect(attractor.x - 60, attractor.y - 60, 120, 120);
      }

      animRef.current = requestAnimationFrame(animate);
    }

    resizeCanvas();
    initParticles(canvas.width, canvas.height);
    animRef.current = requestAnimationFrame(animate);

    const observer = new IntersectionObserver(
      ([entry]) => { isVisibleRef.current = entry.isIntersecting; },
      { threshold: 0.01 }
    );
    observer.observe(canvas);

    window.addEventListener('resize', resizeCanvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [simplified]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ zIndex: 0, pointerEvents: 'none' }}
      aria-hidden="true"
      role="presentation"
    />
  );
}
