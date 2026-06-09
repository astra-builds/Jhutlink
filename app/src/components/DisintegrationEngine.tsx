import { useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface Block {
  x: number;
  y: number;
  size: number;
  color: string;
  alpha: number;
  speed: number;
  angle: number;
}

export default function DisintegrationEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [telemetry, setTelemetry] = useState({
    percent: 12,
    yieldRate: "2.4T/HR",
    upload: "94%",
    status: "SCAN ACTIVE",
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const particles: Particle[] = [];
    const blocks: Block[] = [];
    let scanY = height * 0.3;
    let scanDirection = 1;
    let time = 0;

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", handleResize);

    const spawnBlock = (spawnY: number) => {
      if (blocks.length > 25) return;
      blocks.push({
        x: width * 0.3 + Math.random() * (width * 0.4),
        y: spawnY,
        size: 8 + Math.random() * 14,
        color: Math.random() > 0.4 ? "#06b6d4" : "#059669",
        alpha: 0.8,
        speed: 0.5 + Math.random() * 1.5,
        angle: Math.random() * Math.PI * 2,
      });
    };

    const spawnParticles = (x: number, y: number, count: number, color: string) => {
      for (let i = 0; i < count; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 2.5,
          vy: -(1.5 + Math.random() * 2),
          size: 1 + Math.random() * 3,
          color,
          alpha: 1,
          life: 0,
          maxLife: 60 + Math.random() * 40,
        });
      }
    };

    // Ambient floating dust particles
    const dustParticles: { x: number; y: number; size: number; speed: number; alpha: number }[] = Array.from(
      { length: 40 },
      () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 0.5 + Math.random() * 1.5,
        speed: 0.1 + Math.random() * 0.3,
        alpha: 0.1 + Math.random() * 0.3,
      })
    );

    const animate = () => {
      time += 0.016;
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Ambient Dust
      dustParticles.forEach((dust) => {
        dust.y -= dust.speed;
        if (dust.y < 0) {
          dust.y = height;
          dust.x = Math.random() * width;
        }
        ctx.fillStyle = `rgba(6, 182, 212, ${dust.alpha})`;
        ctx.beginPath();
        ctx.arc(dust.x, dust.y, dust.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // 2. Laser Scan Line Sweep
      scanY += scanDirection * 1.5;
      if (scanY > height * 0.75 || scanY < height * 0.25) {
        scanDirection *= -1;
      }

      // Occasional spawn on scanline crossing
      if (Math.random() < 0.15) {
        spawnBlock(scanY);
      }

      // 3. Draw and Update Data Blocks
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        b.y -= b.speed;
        b.angle += 0.01;

        // Disintegrate block as it floats higher
        const distFromScan = Math.abs(b.y - scanY);
        if (distFromScan < 25 && Math.random() < 0.1) {
          spawnParticles(b.x, b.y, 4, b.color);
        }

        if (b.y < height * 0.15) {
          spawnParticles(b.x, b.y, 6, b.color);
          blocks.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1;
        ctx.fillStyle = b.color === "#06b6d4" ? "rgba(6, 182, 212, 0.05)" : "rgba(5, 150, 105, 0.05)";
        ctx.beginPath();
        ctx.rect(-b.size / 2, -b.size / 2, b.size, b.size);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 4. Draw and Update Floating Disintegrated Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        p.alpha = 1 - p.life / p.maxLife;

        if (p.life >= p.maxLife || p.x < 0 || p.x > width) {
          particles.splice(i, 1);
          continue;
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // 5. Draw Laser Scanning Ring / Laser line
      const gradient = ctx.createLinearGradient(width * 0.2, scanY, width * 0.8, scanY);
      gradient.addColorStop(0, "rgba(6, 182, 212, 0)");
      gradient.addColorStop(0.2, "rgba(6, 182, 212, 0.4)");
      gradient.addColorStop(0.5, "rgba(5, 150, 105, 0.9)");
      gradient.addColorStop(0.8, "rgba(6, 182, 212, 0.4)");
      gradient.addColorStop(1, "rgba(6, 182, 212, 0)");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width * 0.15, scanY);
      ctx.lineTo(width * 0.85, scanY);
      ctx.stroke();

      // Laser glow underlay
      ctx.strokeStyle = "rgba(5, 150, 105, 0.15)";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(width * 0.2, scanY);
      ctx.lineTo(width * 0.8, scanY);
      ctx.stroke();

      // 6. Update HUD Metrics
      if (Math.floor(time * 60) % 30 === 0) {
        setTelemetry({
          percent: Math.floor(45 + Math.sin(time * 0.5) * 35),
          yieldRate: `${(2.1 + Math.sin(time * 0.2) * 0.6).toFixed(1)}T/HR`,
          upload: `${Math.floor(88 + Math.sin(time) * 6)}%`,
          status: Math.random() > 0.5 ? "SCAN ACTIVE" : "SHREDDING BALE",
        });
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Corner Brackets */}
      <div className="absolute top-8 left-8 w-6 h-6 border-t border-l border-cyan/20" />
      <div className="absolute top-8 right-8 w-6 h-6 border-t border-r border-cyan/20" />
      <div className="absolute bottom-8 left-8 w-6 h-6 border-b border-l border-cyan/20" />
      <div className="absolute bottom-8 right-8 w-6 h-6 border-b border-r border-cyan/20" />

      {/* Background Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Left HUD readout overlay */}
      <div className="absolute left-8 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-2 z-10 select-none">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-cyan animate-pulse" />
          <span className="font-mono text-[0.62rem] text-cyan/70 tracking-widest">{telemetry.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-cyan/50" />
          <span className="font-mono text-[0.62rem] text-text-tertiary tracking-widest">BALE: #JH-0842</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-cyan/50" />
          <span className="font-mono text-[0.62rem] text-text-tertiary tracking-widest">CLASS: 100% COTTON</span>
        </div>
        <div className="w-24 h-px bg-white/5 my-1" />
        <div className="font-mono text-xl text-cyan/80 tracking-tighter">{telemetry.percent}%</div>
        <span className="font-mono text-[0.55rem] text-text-tertiary tracking-widest">FABRICATED</span>
      </div>

      {/* Right HUD readout overlay */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-2 items-end z-10 select-none">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.62rem] text-emerald/80 tracking-widest">YIELD: {telemetry.yieldRate}</span>
          <span className="w-1 h-1 rounded-full bg-emerald" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.62rem] text-text-tertiary tracking-widest">COMPRESS: 1,842</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.62rem] text-text-tertiary tracking-widest">UPLOAD: {telemetry.upload}</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}
