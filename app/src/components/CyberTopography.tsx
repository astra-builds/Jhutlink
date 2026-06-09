import { useEffect, useRef } from 'react';

const PEAK_C = [244, 244, 244];
const VALLEY_C = [3, 3, 3];
const GLOW_C = [34, 211, 238];

function noise(x: number, z: number, t: number): number {
  const s1 = Math.sin(x * 0.05 + t) * Math.cos(z * 0.05 + t * 0.7);
  const s2 = Math.sin(x * 0.12 - t * 0.4) * Math.cos(z * 0.08 + t * 0.5);
  return s1 * 5 + s2 * 3 + Math.sin(t * 0.2) * 2;
}

function project3D(x: number, y: number, z: number, t: number) {
  const angle = 0.4 + Math.sin(t * 0.03) * 0.05;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = x * cos - z * sin;
  const rz = x * sin + z * cos;
  const persp = 700 / (700 - rz);
  return { sx: rx * persp, sy: y * persp, scale: persp };
}

const COLOR_CACHE = new Map<string, string>();

function getColor(h: number, _t: number, _x: number, _z: number): string {
  const norm = Math.max(-1, Math.min(1, h / 8));
  let r = Math.floor(GLOW_C[0] + (PEAK_C[0] - GLOW_C[0]) * Math.max(0, norm));
  let g = Math.floor(GLOW_C[1] + (PEAK_C[1] - GLOW_C[1]) * Math.max(0, norm));
  let b = Math.floor(GLOW_C[2] + (PEAK_C[2] - GLOW_C[2]) * Math.max(0, norm));
  if (norm < 0) {
    const blend = Math.min(1, Math.abs(norm) * 1.5);
    r = Math.floor(r + (VALLEY_C[0] - r) * blend);
    g = Math.floor(g + (VALLEY_C[1] - g) * blend);
    b = Math.floor(b + (VALLEY_C[2] - b) * blend);
  }
  const key = `${r},${g},${b}`;
  const cached = COLOR_CACHE.get(key);
  if (cached) return cached;
  const val = `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  if (COLOR_CACHE.size < 500) COLOR_CACHE.set(key, val);
  return val;
}

interface Shockwave {
  x: number;
  z: number;
  birth: number;
}

export default function CyberTopography() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let GRID_W = 60;
    let GRID_H = 60;
    const CELL = 18;
    let time = 0;
    let shockwaves: Shockwave[] = [];

    function resizeCanvas() {
      const w = canvas!.offsetWidth;
      const h = canvas!.offsetHeight;
      canvas!.width = w;
      canvas!.height = h;
      GRID_W = Math.ceil(w / CELL) + 5;
      GRID_H = Math.ceil(h / CELL) + 5;
    }

    function draw() {
      if (!isVisibleRef.current) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      time += 0.012;

      ctx!.fillStyle = 'rgba(3,3,3,0.25)';
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      const cx = canvas!.width / 2;
      const cy = canvas!.height / 2 + 50;

      const grid: { sx: number; sy: number; scale: number; h: number; x: number; z: number }[][] = [];

      if (Math.random() < 0.005) {
        shockwaves.push({
          x: (Math.random() - 0.5) * GRID_W * CELL,
          z: (Math.random() - 0.5) * GRID_H * CELL,
          birth: time,
        });
      }
      shockwaves = shockwaves.filter((s) => time - s.birth < 4);

      let shockAmp = 0;
      for (const s of shockwaves) {
        shockAmp += Math.exp(-(time - s.birth) * 2) * 4;
      }

      for (let z = 0; z <= GRID_H; z++) {
        const row: typeof grid[0] = [];
        for (let x = 0; x <= GRID_W; x++) {
          const worldX = (x - GRID_W / 2) * CELL;
          const worldZ = (z - GRID_H / 2) * CELL;
          const colT = time + x * 0.05;
          let h = noise(worldX, worldZ, colT);

          for (const s of shockwaves) {
            const dx = worldX - s.x;
            const dz = worldZ - s.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const waveT = time - s.birth;
            const waveFront = waveT * 120;
            if (Math.abs(dist - waveFront) < 50) {
              h += Math.cos((dist - waveFront) * 0.1) * shockAmp * Math.exp(-Math.abs(dist - waveFront) * 0.02);
            }
          }

          const p = project3D(worldX, h * 8 - 30, worldZ, time);
          row.push({ sx: p.sx, sy: p.sy, scale: p.scale, h, x: worldX, z: worldZ });
        }
        grid.push(row);
      }

      for (let z = 0; z < GRID_H; z++) {
        for (let x = 0; x < GRID_W; x++) {
          const a = grid[z][x];
          const b = grid[z][x + 1];
          const c = grid[z + 1][x + 1];
          const d = grid[z + 1][x];
          const avgH = (a.h + b.h + c.h + d.h) / 4;
          if (avgH > 4) {
            const alpha = Math.min(0.4, (avgH - 4) * 0.06);
            const color = getColor(avgH, time, a.x, a.z);
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const bVal = parseInt(color.slice(5, 7), 16);
            ctx!.fillStyle = `rgba(${r},${g},${bVal},${alpha.toFixed(2)})`;
            ctx!.beginPath();
            ctx!.moveTo(a.sx + cx, a.sy + cy);
            ctx!.lineTo(b.sx + cx, b.sy + cy);
            ctx!.lineTo(c.sx + cx, c.sy + cy);
            ctx!.lineTo(d.sx + cx, d.sy + cy);
            ctx!.closePath();
            ctx!.fill();
          }
        }
      }

      ctx!.lineWidth = 0.6;

      for (let z = 0; z <= GRID_H; z++) {
        for (let x = 0; x < GRID_W; x++) {
          const p1 = grid[z][x];
          const p2 = grid[z][x + 1];
          const avgH = (p1.h + p2.h) / 2;
          ctx!.strokeStyle = getColor(avgH, time, p1.x, p1.z);
          ctx!.beginPath();
          ctx!.moveTo(p1.sx + cx, p1.sy + cy);
          ctx!.lineTo(p2.sx + cx, p2.sy + cy);
          ctx!.stroke();
        }
      }

      for (let z = 0; z < GRID_H; z++) {
        for (let x = 0; x <= GRID_W; x++) {
          const p1 = grid[z][x];
          const p2 = grid[z + 1][x];
          const avgH = (p1.h + p2.h) / 2;
          ctx!.strokeStyle = getColor(avgH, time, p1.x, p1.z);
          ctx!.beginPath();
          ctx!.moveTo(p1.sx + cx, p1.sy + cy);
          ctx!.lineTo(p2.sx + cx, p2.sy + cy);
          ctx!.stroke();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    }

    resizeCanvas();
    draw();

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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0, pointerEvents: 'none' }}
      aria-hidden="true"
      role="presentation"
    />
  );
}
