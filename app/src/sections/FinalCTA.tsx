import { useRef } from 'react';
import { Link } from 'react-router';
import ParticleOrbit from '../components/ParticleOrbit';
import { useSectionPin, splitText, isMobile } from '@/hooks/useScrollReveal';

const trustBadges = ['SSL Secured', 'bKash/Nagad', 'BKash Merchant', '24/7 Support'];

export default function FinalCTA() {
  const sectionRef = useRef<HTMLElement>(null);

  useSectionPin(
    sectionRef,
    [
      { selector: '.cta-element', from: { opacity: 0, y: 30 }, to: { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1 } },
    ],
    { disabled: isMobile() }
  );

  return (
    <section
      ref={sectionRef}
      id="cta"
      className="relative min-h-[100dvh] overflow-hidden flex items-center justify-center"
    >
      {/* Particle background */}
      <ParticleOrbit simplified />

      {/* Content */}
      <div className="relative z-[1] max-w-[800px] mx-auto text-center px-6">
        <span className="cta-element accent-label text-emerald block opacity-0">
          JOIN THE CIRCULAR ECONOMY
        </span>

        <h2
          className="cta-element text-text-primary mt-6"
          style={{
            fontFamily: '"Clash Display", system-ui',
            fontSize: 'clamp(2.5rem, 7vw, 5rem)',
            fontWeight: 600,
            lineHeight: 1.0,
            letterSpacing: '-0.04em',
          }}
        >
          {splitText("Where Industrial Waste Becomes Economic Value.", "cta-word", { 4: "#10b981" })}
        </h2>

        <p className="cta-element text-[1.125rem] text-text-secondary mt-6 max-w-[560px] mx-auto opacity-0" style={{ lineHeight: 1.8 }}>
          Whether you're a garment factory looking to monetize waste, or a recycler seeking reliable supply — Jhutlink is your platform.
        </p>

        <div className="cta-element flex items-center justify-center gap-4 mt-10 opacity-0">
          <Link to="/auth" className="btn-primary bg-emerald text-void px-10 py-4 hover:bg-emerald/80 hover:shadow-glow-emerald">
            Start Selling Today
          </Link>
          <Link to="/auth" className="btn-primary bg-transparent border border-white/12 text-text-primary hover:border-emerald/40 hover:text-emerald px-8 py-4">
            Talk to Our Team
          </Link>
        </div>

        <div className="cta-element flex flex-wrap items-center justify-center gap-6 mt-12 opacity-0">
          {trustBadges.map((badge, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="6" fill="#10b981" />
                <path d="M3.5 6L5 7.5L8.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="accent-label text-text-tertiary text-[0.65rem]">{badge}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
