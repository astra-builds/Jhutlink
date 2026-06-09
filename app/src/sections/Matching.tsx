import { useRef } from 'react';
import DataRain from '../components/DataRain';
import { useScrollFade, splitText } from '@/hooks/useScrollReveal';

const matchCards = [
  { score: 94, type: 'Cotton Waste — Grade B', location: 'Gazipur, Dhaka', price: '৳15.20/kg' },
  { score: 87, type: 'Polyester Scraps', location: 'Narayanganj', price: '৳11.80/kg' },
  { score: 79, type: 'Denim Offcuts', location: 'Savar, Dhaka', price: '৳20.50/kg' },
];

function CircularProgress({ score }: { score: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(34,211,238,0.2)" strokeWidth="2.5" />
        <circle
          cx="20" cy="20" r={radius}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] text-cyan font-medium">
        {score}%
      </span>
    </div>
  );
}

export default function Matching() {
  const sectionRef = useRef<HTMLElement>(null);

  useScrollFade(sectionRef, [".matching-text", ".matching-card"]);

  return (
    <section
      ref={sectionRef}
      id="matching"
      className="relative min-h-[100dvh] overflow-hidden"
    >
      {/* Canvas background */}
      <DataRain />

      {/* Gradient overlays */}
      <div className="absolute top-0 left-0 right-0 h-[20%] bg-gradient-to-b from-void to-transparent z-[1] pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-[20%] bg-gradient-to-t from-void to-transparent z-[1] pointer-events-none" />

      {/* Content overlay */}
      <div className="relative z-[2] flex flex-col justify-center min-h-[100dvh] py-16 px-6 md:px-12">
        <div className="max-w-[520px]">
          <div className="matching-text">
            <span className="accent-label text-cyan">SMART MATCHING</span>
            <h2 className="text-h2 text-text-primary mt-4" style={{ textShadow: '0 0 30px rgba(3,3,3,0.9)' }}>
              {splitText("Intelligent Recommendations, Not Just Listings.", "matching-word")}
            </h2>
            <p className="text-[0.9375rem] text-text-secondary mt-4" style={{ lineHeight: 1.75 }}>
              Our matching engine actively learns each buyer's preferences — waste type, location radius, price range, quality grade — and proactively surfaces the most relevant listings. Convert passive browsing into active trading.
            </p>
          </div>

          <div className="flex flex-col gap-4 mt-8">
            {matchCards.map((card, i) => (
              <div
                key={i}
                className="matching-card glass-card glass-card-hover p-4 flex items-center gap-4 cursor-pointer"
                style={{ background: 'rgba(3,3,3,0.8)' }}
              >
                <CircularProgress score={card.score} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[1.125rem] font-medium text-text-primary truncate">{card.type}</h3>
                  <p className="text-[0.8125rem] text-text-tertiary">{card.location}</p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="accent-label text-cyan text-[0.65rem]">MATCH</span>
                  <span className="font-mono text-cyan text-sm">{card.price}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
