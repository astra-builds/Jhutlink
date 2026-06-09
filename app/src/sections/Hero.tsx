import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { formatKg } from "@/utils/formatting";
import type { PlatformStats } from "@/lib/api";
import DisintegrationEngine from "../components/DisintegrationEngine";
import {
  useSectionPin,
  useCounter,
  splitText,
  isMobile,
} from "@/hooks/useScrollReveal";
import { toast } from "sonner";

function formatTakaCrore(taka: number): string {
  if (taka >= 10000000) return `\u09F3${(taka / 10000000).toFixed(1)}Cr+`;
  if (taka >= 100000) return `\u09F3${(taka / 100000).toFixed(0)}L+`;
  return `\u09F3${taka.toLocaleString("en-BD")}`;
}

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);

  const transactionsRef = useRef<HTMLSpanElement>(null);
  const activeBidsRef = useRef<HTMLSpanElement>(null);
  const wasteTradedRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    api.stats.get().then(setStats).catch(() => toast.error("Failed to load platform stats."));
  }, []);

  useCounter(transactionsRef, stats?.total_transactions_taka ?? 0, {
    format: (v) => formatTakaCrore(v),
  });
  useCounter(activeBidsRef, stats?.active_listings ?? 0, { suffix: "+" });
  useCounter(wasteTradedRef, stats?.total_waste_kg ?? 0, {
    format: (v) => formatKg(v),
  });

  useSectionPin(
    sectionRef,
    [
      { selector: ".hero-label", from: { opacity: 0, y: 10 }, to: { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" } },
      { selector: ".hero-word", from: { opacity: 0, y: 40 }, to: { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.08 } },
      { selector: ".hero-sub", from: { opacity: 0, y: 10 }, to: { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" } },
      { selector: ".hero-cta", from: { opacity: 0, y: 20 }, to: { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" } },
      { selector: ".hero-stat", from: { opacity: 0, y: 15 }, to: { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" } },
    ],
    { disabled: isMobile() }
  );

  return (
    <section ref={sectionRef} className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden" id="hero">
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #090D1A 0%, #0E1424 40%, #141D33 100%)", zIndex: -1 }} />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px", zIndex: 0 }} />
      <DisintegrationEngine />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 50%, transparent 30%, rgba(9,13,26,0.65) 100%)", zIndex: 0 }} />

      <div ref={contentRef} className="relative z-[1] flex flex-col items-center text-center max-w-[900px] px-6">
        <span className="hero-label accent-label text-cyan mb-6 opacity-0 tracking-[0.18em]">
          B2B TEXTILE WASTE MARKETPLACE — BANGLADESH
        </span>

        <h1 className="text-display text-text-primary mb-6">
          {splitText("Turning Textile Waste Into Trade.", "hero-word", { 2: "#06b6d4", 3: "#06b6d4" })}
        </h1>

        <p className="hero-sub text-body-large text-text-secondary max-w-[640px] opacity-0" style={{ fontSize: "1.125rem", lineHeight: 1.8 }}>
          Jhutlink is a digital commodity exchange that transforms textile waste from garment factories, mills, and dyeing units into a tradable, traceable asset — connecting suppliers with recyclers and raw material buyers across Bangladesh.
        </p>

        <div className="hero-cta flex items-center gap-4 mt-10 opacity-0">
          <Link to="/auth" className="btn-primary bg-emerald text-void hover:bg-emerald/80 hover:shadow-glow-emerald">
            Start Selling
          </Link>
          <Link to="/marketplace" className="btn-primary bg-transparent border border-white/12 text-text-primary hover:border-cyan/40 hover:text-cyan">
            Explore Marketplace
          </Link>
        </div>

        <div ref={statsRef} className="hero-stat glass-card p-6 mt-16 max-w-2xl w-full flex flex-wrap md:flex-nowrap items-center justify-between gap-6 md:gap-12">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
            <span className="accent-label text-emerald text-[0.68rem] tracking-widest font-semibold">LIVE NETWORK</span>
          </div>
          
          <div className="flex items-center justify-around w-full gap-4 md:gap-8">
            <div className="flex flex-col items-center md:items-start">
              <span ref={transactionsRef} className="font-mono text-cyan text-2xl font-medium tracking-tight">
                {formatTakaCrore(0)}
              </span>
              <span className="text-[0.68rem] text-text-secondary uppercase tracking-wider font-semibold mt-1">Transactions</span>
            </div>

            <div className="w-px h-8 bg-white/10 hidden md:block" />

            <div className="flex flex-col items-center md:items-start">
              <span ref={activeBidsRef} className="font-mono text-cyan text-2xl font-medium tracking-tight">
                0
              </span>
              <span className="text-[0.68rem] text-text-secondary uppercase tracking-wider font-semibold mt-1">Active Bids</span>
            </div>

            <div className="w-px h-8 bg-white/10 hidden md:block" />

            <div className="flex flex-col items-center md:items-start">
              <span ref={wasteTradedRef} className="font-mono text-cyan text-2xl font-medium tracking-tight">
                {formatKg(0)}
              </span>
              <span className="text-[0.68rem] text-text-secondary uppercase tracking-wider font-semibold mt-1">Waste Traded</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}