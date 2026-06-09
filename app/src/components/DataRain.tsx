import { useEffect, useRef } from 'react';

const GLYPHS = '0123456789ABCDEFabcdefঅআইঈঊএওকখগঘচছজঝটঠডঢনতথদধপফবভমযরলশষসহড়ঢ়য়।॥০১২৩৪৫৬৭৮৯রফতলজহটকগডপনসবমআইঊএও'.split('');
const CELL = 14;
const FALL_SPEED = 0.7;

interface Column {
  y: number;
  speed: number;
  len: number;
  chars: string[];
  flicker: number[];
  glitch: number;
  bright: boolean;
}

export default function DataRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cols: Column[] = [];
    let frameCount = 0;

    function resizeCanvas() {
      const w = canvas!.offsetWidth;
      const h = canvas!.offsetHeight;
      canvas!.width = w;
      canvas!.height = h;
      initCols();
    }

    function initCols() {
      const colCount = Math.floor(canvas!.width / CELL) + 1;
      cols = [];
      for (let i = 0; i < colCount; i++) {
        cols.push({
          y: Math.random() * canvas!.height * 0.5,
          speed: Math.random() * 1.5 + 0.8,
          len: Math.random() * 18 + 6,
          chars: [],
          flicker: [],
          glitch: 0,
          bright: Math.random() > 0.7,
        });
      }
    }

    function drawRain() {
      if (!isVisibleRef.current) {
        animRef.current = requestAnimationFrame(drawRain);
        return;
      }

      frameCount++;

      ctx!.fillStyle = 'rgba(3,3,3,0.12)';
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      ctx!.font = '14px "JetBrains Mono", monospace';
      ctx!.textAlign = 'center';

      const cLen = cols.length;

      for (let i = 0; i < cLen; i++) {
        const col = cols[i];
        col.y += col.speed * FALL_SPEED;

        if (col.glitch > 0) {
          col.glitch--;
        } else if (frameCount % 2500 === 0) {
          col.glitch = (Math.random() * 8 + 3) | 0;
          const maxJ = Math.min(3, cLen - i - 1);
          for (let j = 1; j <= maxJ; j++) {
            const c = cols[i + j];
            c.y = col.y;
            c.glitch = col.glitch;
            c.chars = [];
          }
        }

        const charLen = col.len | 0;
        while (col.chars.length < charLen) {
          col.chars.push(GLYPHS[(Math.random() * GLYPHS.length) | 0]);
        }
        while (col.flicker.length < col.chars.length) {
          col.flicker.push(col.bright ? 1 : (Math.random() < 0.04 ? 1 : 0));
        }

        const maxY = canvas!.height + charLen * CELL;
        if (col.y > maxY) {
          col.y = -charLen * CELL;
          col.chars = [];
        }

        const colX = i * CELL + CELL / 2;

        for (let j = 0; j < Math.min(col.chars.length, charLen - 1); j++) {
          const charY = ((col.y - j * CELL) / CELL) | 0;
          if (charY < 0 || charY * CELL > canvas!.height) continue;

          if (col.flicker[j]) {
            ctx!.fillStyle = 'rgba(16,185,129,0.9)';
          } else {
            const baseAlpha = Math.max(0.04, 0.6 - j / charLen * 0.55);
            ctx!.fillStyle = `rgba(34,211,238,${baseAlpha})`;
          }
          ctx!.fillText(col.chars[j], colX, charY * CELL);
        }

        const j = col.chars.length - 1;
        if (j >= 0) {
          const charY = ((col.y - j * CELL) / CELL) | 0;
          if (charY >= 0 && charY * CELL <= canvas!.height) {
            ctx!.shadowColor = 'rgba(244,244,244,0.8)';
            ctx!.shadowBlur = 10;
            ctx!.fillStyle = 'rgba(244,244,244,0.95)';
            ctx!.fillText(col.chars[j], colX, charY * CELL);
            ctx!.shadowBlur = 0;
          }
        }

        if (col.glitch > 0) {
          ctx!.fillStyle = `rgba(59,130,246,${col.glitch * 0.04})`;
          ctx!.fillRect(colX - CELL / 2, 0, CELL, canvas!.height);
        }
      }

      animRef.current = requestAnimationFrame(drawRain);
    }

    resizeCanvas();
    drawRain();

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
      style={{ zIndex: 0 }}
      aria-hidden="true"
      role="presentation"
    />
  );
}
