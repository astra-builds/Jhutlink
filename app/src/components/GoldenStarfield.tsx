import { useEffect, useRef } from 'react';

const STAR_COUNT = 600;
const DRIFT_VELOCITY = 0.15;
const DEPTH_LAYERS = 3;
const layerSpeeds = [0.25, 0.65, 1.3];
const layerSizes = [0.8, 1.6, 2.8];

const COLORS = [
  [148, 136, 110],
  [201, 169, 110],
  [244, 244, 244],
];

interface Star {
  x: number; y: number;
  layer: number;
  vx: number; vy: number;
  phase: number;
  baseColor: number[];
  driftGroup: number;
}

export default function GoldenStarfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const isVisibleRef = useRef(true);
  const mouseRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let FRAME = 0;
    let STARS: Star[] = [];
    const DRIFT = { active: false, startFrame: 0 };
    let driftCounter = 0;

    function resizeCanvas() {
      canvas!.width = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
    }

    function initStars() {
      STARS = [];
      for (let i = 0; i < STAR_COUNT; i++) {
        const layer = Math.floor(Math.random() * DEPTH_LAYERS);
        STARS.push({
          x: Math.random(),
          y: Math.random(),
          layer,
          vx: (Math.random() - 0.5) * 0.0003,
          vy: (Math.random() - 0.5) * 0.0003,
          phase: Math.random() * Math.PI * 2,
          baseColor: COLORS[layer],
          driftGroup: Math.floor(Math.random() * 8),
        });
      }
    }

    function drawStarfield(mouseX: number | null, mouseY: number | null) {
      if (!isVisibleRef.current) {
        animRef.current = requestAnimationFrame(() => drawStarfield(mouseRef.current.x, mouseRef.current.y));
        return;
      }

      const W = canvas!.width;
      const H = canvas!.height;

      ctx!.fillStyle = 'rgba(3,3,3,1)';
      ctx!.fillRect(0, 0, W, H);

      if (FRAME < 2 && W > 0 && H > 0) {
        const amb = ctx!.createLinearGradient(0, 0, W, H);
        amb.addColorStop(0, 'rgba(201,169,110,0.015)');
        amb.addColorStop(1, 'rgba(3,3,3,0)');
        ctx!.fillStyle = amb;
        ctx!.fillRect(0, 0, W, H);
      }

      driftCounter++;
      let dWave = 0;
      if (DRIFT.active) {
        const dAge = FRAME - DRIFT.startFrame;
        if (dAge > 1400) {
          DRIFT.active = false;
        } else {
          dWave = Math.sin(dAge * 0.005) * 0.0004;
        }
      }

      if (!DRIFT.active && driftCounter > 1250) {
        driftCounter = 0;
        DRIFT.active = true;
        DRIFT.startFrame = FRAME;
      }

      const ptrX = mouseX !== null ? (mouseX - W * 0.5) * -0.0005 : 0;
      const ptrY = mouseY !== null ? (mouseY - H * 0.5) * -0.0005 : 0;

      for (const star of STARS) {
        const layer = star.layer;
        const speed = layerSpeeds[layer];
        star.x += star.vx * speed + DRIFT_VELOCITY * speed * 0.0005 + dWave * (star.driftGroup % 4 - 1.5);
        star.y += star.vy * speed + Math.sin(FRAME * 0.002 + star.phase) * 0.00005;

        const margin = 0.02;
        if (star.x > 1 + margin) star.x = -margin;
        else if (star.x < -margin) star.x = 1 + margin;
        if (star.y > 1 + margin) star.y = -margin;
        else if (star.y < -margin) star.y = 1 + margin;

        const px = (star.x + ptrX * (1 + layer * 0.5)) * W;
        const py = (star.y + ptrY * (1 + layer * 0.5)) * H;

        let ta: number;
        if (layer === 2) {
          ta = 0.7 + 0.3 * Math.sin(FRAME * 0.02 + star.phase);
        } else {
          ta = 0.5 + 0.5 * Math.sin(FRAME * 0.015 + star.phase);
        }

        const fa = py < H * 0.25 ? 0.25 + (py / (H * 0.25)) * 0.75 : 1.0;
        const alpha = ta * fa;

        if (alpha > 0.01 && px >= 0 && px < W && py >= 0 && py < H) {
          const size = layerSizes[layer];
          ctx!.fillStyle = `rgba(${star.baseColor[0]},${star.baseColor[1]},${star.baseColor[2]},${alpha})`;
          ctx!.fillRect(px|0, py|0, size, size);
        }
      }

      FRAME++;
      animRef.current = requestAnimationFrame(() => drawStarfield(mouseRef.current.x, mouseRef.current.y));
    }

    resizeCanvas();
    initStars();
    drawStarfield(null, null);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);

    const observer = new IntersectionObserver(
      ([entry]) => { isVisibleRef.current = entry.isIntersecting; },
      { threshold: 0.01 }
    );
    observer.observe(canvas);

    window.addEventListener('resize', resizeCanvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
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
