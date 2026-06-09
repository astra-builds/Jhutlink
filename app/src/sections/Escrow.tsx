import { useRef, type ReactNode } from 'react';
import GoldenStarfield from '../components/GoldenStarfield';
import { useSectionPin, useCounter, splitText, isMobile } from '@/hooks/useScrollReveal';

const escrowStates = [
  { label: 'Payment', icon: 'lock', active: true },
  { label: 'Held', icon: 'clock', active: true },
  { label: 'Transit', icon: 'truck', active: false },
  { label: 'Delivered', icon: 'check', active: false },
  { label: 'Released', icon: 'shield', active: false },
];



function EscrowIcon({ type, active }: { type: string; active: boolean }) {
  const color = active ? '#c9a96e' : 'rgba(255,255,255,0.3)';

  const icons: Record<string, ReactNode> = {
    lock: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    clock: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    truck: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    check: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    shield: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  };

  return icons[type] || null;
}

export default function Escrow() {
  const sectionRef = useRef<HTMLElement>(null);

  const slaRef = useRef<HTMLSpanElement>(null);
  const fundRef = useRef<HTMLSpanElement>(null);

  useCounter(slaRef, 72, { suffix: "h" });
  useCounter(fundRef, 100, { suffix: "%" });

  useSectionPin(
    sectionRef,
    [
      { selector: '.escrow-text', from: { opacity: 0, y: 20 }, to: { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' } },
      { selector: '.escrow-node', from: { opacity: 0, scale: 0.8 }, to: { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)', stagger: 0.15 }, position: 0.5 },
      { selector: '.escrow-line', from: { scaleX: 0 }, to: { scaleX: 1, duration: 0.4, ease: 'power2.out', stagger: 0.15 }, position: 0.5 },
      { selector: '.escrow-stat', from: { opacity: 0, y: 15 }, to: { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.1 }, position: 1.5 },
    ],
    { disabled: isMobile() }
  );

  return (
    <section
      ref={sectionRef}
      id="escrow"
      className="relative min-h-[100dvh] overflow-hidden"
    >
      {/* Canvas background */}
      <GoldenStarfield />

      {/* Content overlay */}
      <div className="relative z-[2] flex flex-col items-center justify-center min-h-[100dvh] py-16 px-6 md:px-12">
        <div className="max-w-[800px] text-center">
            <div className="escrow-text">
            <span className="accent-label text-gold">ESCROW & TRUST</span>
            <h2 className="text-h2 text-text-primary mt-4">
              {splitText("Every Transaction Protected. Every Party Accountable.", "escrow-word")}
            </h2>
            <p className="text-[1.125rem] text-text-secondary mt-4" style={{ lineHeight: 1.8 }}>
              Independent escrow instances for every matched order. Funds are only released when both buyer and seller confirm delivery. Disputes resolved within 72 hours with full audit trails.
            </p>
          </div>

          {/* Escrow state flow */}
          <div className="flex flex-wrap items-center justify-center gap-0 mt-12">
            {escrowStates.map((state, i) => (
              <div key={i} className="flex items-center">
                <div className="escrow-node flex flex-col items-center" style={{ width: 80 }}>
                  <div
                    className="w-12 h-12 rounded-full border-2 flex items-center justify-center"
                    style={{
                      borderColor: state.active ? '#c9a96e' : 'rgba(255,255,255,0.06)',
                      background: state.active ? 'rgba(201,169,110,0.1)' : 'transparent',
                    }}
                  >
                    <EscrowIcon type={state.icon} active={state.active} />
                  </div>
                  <span className="text-[0.8125rem] text-text-secondary mt-3">{state.label}</span>
                </div>

                {i < escrowStates.length - 1 && (
                  <div className="escrow-line hidden sm:flex items-center justify-center w-10 origin-left" style={{ transformOrigin: 'left center' }}>
                    <div
                      className="h-0.5 w-full relative"
                      style={{ background: escrowStates[i].active && escrowStates[i + 1].active ? '#c9a96e' : 'rgba(255,255,255,0.06)' }}
                    >
                      {escrowStates[i].active && escrowStates[i + 1].active && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-gold"
                          style={{
                            animation: 'travel-dot 2s linear infinite',
                            left: 0,
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="escrow-stats flex flex-wrap items-center justify-center gap-8 md:gap-16 mt-12">
            <div className="escrow-stat flex flex-col items-center">
              <span className="font-mono text-gold text-2xl">{'\u09F3'}0</span>
              <span className="text-[0.7rem] text-text-tertiary tracking-wide text-center max-w-[140px]">Platform fee for first 3 months</span>
            </div>
            <div className="escrow-stat flex flex-col items-center">
              <span ref={slaRef} className="font-mono text-gold text-2xl">0h</span>
              <span className="text-[0.7rem] text-text-tertiary tracking-wide text-center max-w-[140px]">Dispute resolution SLA</span>
            </div>
            <div className="escrow-stat flex flex-col items-center">
              <span ref={fundRef} className="font-mono text-gold text-2xl">0%</span>
              <span className="text-[0.7rem] text-text-tertiary tracking-wide text-center max-w-[140px]">Funds held in independent escrow</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
