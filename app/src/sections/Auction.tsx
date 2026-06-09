import { useRef } from 'react';
import { useSectionPin, splitText, isMobile } from '@/hooks/useScrollReveal';

const steps = [
  { num: '01', title: 'List Your Waste', desc: 'Post your textile waste with reserve price, quantity, and quality grade. Set your auction window: 24, 48, or 72 hours.' },
  { num: '02', title: 'Buyers Bid', desc: 'Verified buyers place bids specifying quantity and price per kg. Our system enforces bid increment caps to prevent price manipulation.' },
  { num: '03', title: 'Smart Allocation', desc: "When the auction closes, our greedy allocation engine ranks bids by price and distributes portions to maximize seller revenue." },
  { num: '04', title: 'Secure Settlement', desc: 'Each winning match creates an independent escrow-protected order. Sellers review and approve before funds are locked.' },
];

export default function Auction() {
  const sectionRef = useRef<HTMLElement>(null);

  useSectionPin(
    sectionRef,
    [
      { selector: '.auction-header', from: { opacity: 0, y: 30 }, to: { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' } },
      { selector: '.auction-step', from: { opacity: 0, y: 40 }, to: { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.15 }, position: 0.3 },
      { selector: '.auction-arrow', from: { width: 0 }, to: { width: 60, duration: 0.4, ease: 'power2.out', stagger: 0.15 }, position: 0.3 },
      { selector: '.auction-banner', from: { opacity: 0, y: 20 }, to: { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, position: 1.2 },
    ],
    { disabled: isMobile() }
  );

  return (
    <section ref={sectionRef} id="auction" className="relative bg-void py-24 md:py-32">
      <div className="max-w-[1000px] mx-auto px-6 md:px-12">
        {/* Header */}
        <div className="auction-header text-center">
          <span className="accent-label text-cyan">HYBRID AUCTION ENGINE</span>
          <h2 className="text-h2 text-text-primary mt-4">
            {splitText("Smart Pricing. Fair Allocation. Maximum Value.", "auction-word", { 0: "#06b6d4", 1: "#06b6d4", 2: "#10b981", 3: "#10b981" })}
          </h2>
          <p className="text-[0.9375rem] text-text-secondary max-w-[640px] mx-auto mt-4" style={{ lineHeight: 1.75 }}>
            Our hybrid bidding engine combines open auctions with intelligent partial fulfillment — ensuring sellers get the best price while multiple buyers can win portions of a single lot.
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col md:flex-row items-stretch gap-4 mt-16">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="auction-step glass-card glass-card-hover p-6 text-center flex-1 min-w-0">
                <div className="w-8 h-8 rounded-full border border-cyan/30 flex items-center justify-center mx-auto">
                  <span className="font-mono text-cyan text-sm">{step.num}</span>
                </div>
                <h3 className="text-[1.125rem] font-medium text-text-primary mt-4">{step.title}</h3>
                <p className="text-[0.8125rem] text-text-secondary mt-2" style={{ lineHeight: 1.6 }}>
                  {step.desc}
                </p>
              </div>

              {i < steps.length - 1 && (
                <div className="auction-arrow hidden md:flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: 60 }}>
                  <div className="h-0.5 w-full border-shimmer relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[6px] border-l-cyan/20 border-y-[4px] border-y-transparent" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Anti-monopoly banner */}
        <div className="auction-banner mt-10 rounded-xl p-6 flex flex-col sm:flex-row items-center gap-4" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <p className="text-[0.9375rem] text-text-secondary text-center sm:text-left" style={{ lineHeight: 1.75 }}>
            <span className="text-emerald font-medium">Four-Layer Anti-Monopoly Protection</span> — Bid increment caps, volume caps per buyer, and circuit breakers ensure fair competition for all.
          </p>

        </div>
      </div>
    </section>
  );
}
