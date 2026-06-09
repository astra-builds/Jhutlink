import { useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSectionPin, useCounter, splitText, isMobile } from '@/hooks/useScrollReveal';

const chartData = [
  { year: '2021', tonnes: 400000 },
  { year: '2022', tonnes: 435000 },
  { year: '2023', tonnes: 470000 },
  { year: '2024', tonnes: 510000 },
  { year: '2025', tonnes: 545000 },
];

export default function Problem() {
  const sectionRef = useRef<HTMLElement>(null);
  const wasteCounterRef = useRef<HTMLSpanElement>(null);

  useCounter(wasteCounterRef, 577000, {
    format: (v) => `${v.toLocaleString("en-US")}+`,
  });

  useSectionPin(
    sectionRef,
    [
      { selector: '.problem-left', from: { opacity: 0, x: -30 }, to: { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out' } },
      { selector: '.problem-right', from: { opacity: 0, x: 30 }, to: { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out' } },
    ],
    { disabled: isMobile() }
  );

  return (
    <section
      ref={sectionRef}
      id="problem"
      className="relative bg-void py-24 md:py-32"
    >
      <div className="max-w-[1280px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 items-center">
          {/* Left Column */}
          <div className="problem-left">
            <span className="accent-label text-cyan">THE OPPORTUNITY</span>
            <h2 className="text-h2 text-text-primary mt-4">
              {splitText("Bangladesh Generates Millions of Tons of Textile Waste. Most of It Goes Untapped.", "problem-word", { 9: "#06b6d4" })}
            </h2>
            <p className="text-[0.9375rem] text-text-secondary leading-relaxed mt-6" style={{ lineHeight: 1.75 }}>
              Garment factories, dyeing units, and spinning mills discard hundreds of thousands of tonnes of cotton waste, polyester scraps, and denim offcuts annually. Currently managed through informal, unorganized channels — leaving massive economic and environmental value unrealized.
            </p>

            <div className="glass-card glass-card-hover p-5 mt-8 inline-block">
              <span className="font-mono text-cyan text-lg">
                <span ref={wasteCounterRef}>0+</span> tonnes/year
              </span>
              <p className="text-[0.7rem] text-text-tertiary tracking-wide uppercase mt-1">
                Estimated textile waste in Bangladesh
              </p>
            </div>
          </div>

          {/* Right Column - Area Chart */}
          <div className="problem-right glass-card p-8">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wasteGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                    tick={{ fill: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(10,10,20,0.95)',
                      border: '1px solid rgba(34,211,238,0.2)',
                      borderRadius: '8px',
                      boxShadow: '0 0 20px rgba(34,211,238,0.1)',
                    }}
                    labelStyle={{ color: '#9ca3af', fontSize: '0.75rem', fontFamily: 'monospace' }}
                    formatter={(value: number) => [`${value.toLocaleString('en-US')} tonnes`, 'Textile Waste']}
                  />
                  <Area
                    type="monotone"
                    dataKey="tonnes"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fill="url(#wasteGradient)"
                    dot={{ fill: '#22d3ee', stroke: '#22d3ee', strokeWidth: 2, r: 4 }}
                    activeDot={{ fill: '#22d3ee', stroke: '#0a0a14', strokeWidth: 3, r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
