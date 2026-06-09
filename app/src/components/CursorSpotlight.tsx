import { useEffect, useRef } from "react";

export function CursorSpotlight() {
  const spotlightRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -400, y: -400 });
  const targetRef = useRef({ x: -400, y: -400 });
  const rafRef = useRef<number>(0);
  const idleTimerRef = useRef<number>(0);
  const activeRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const spotlight = spotlightRef.current;
    if (!spotlight) return;

    const handleMouseMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY };
      if (!activeRef.current) {
        activeRef.current = true;
        rafRef.current = requestAnimationFrame(animate);
      }
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        activeRef.current = false;
      }, 2000);
    };

    const animate = () => {
      if (!activeRef.current) return;

      posRef.current.x += (targetRef.current.x - posRef.current.x) * 0.12;
      posRef.current.y += (targetRef.current.y - posRef.current.y) * 0.12;

      if (spotlight) {
        spotlight.style.background = `radial-gradient(400px circle at ${posRef.current.x >> 0}px ${posRef.current.y >> 0}px, rgba(34,211,238,0.03), transparent 60%)`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
      clearTimeout(idleTimerRef.current);
    };
  }, []);

  if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) return null;

  return <div ref={spotlightRef} className="fixed inset-0 pointer-events-none z-[9999]" aria-hidden="true" />;
}