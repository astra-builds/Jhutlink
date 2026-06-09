import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatKg } from '@/utils/formatting';
import { useScrollFade } from '@/hooks/useScrollReveal';
import { toast } from 'sonner';

type Pattern = {
  pattern: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  impact: 'positive' | 'negative' | 'neutral';
};

type Insights = {
  summary: string;
  price_forecast: Array<{ waste_type: string; direction: 'up' | 'flat' | 'down'; range: string; reason: string }>;
  district_spotlight: string;
  key_insight: string;
  patterns_found: Pattern[];
};

function DirectionArrow({ direction }: { direction: 'up' | 'flat' | 'down' }) {
  if (direction === 'up') return <span className="text-emerald font-mono">↑</span>;
  if (direction === 'down') return <span className="text-red-400 font-mono">↓</span>;
  return <span className="text-yellow-400 font-mono">→</span>;
}

export default function Analytics() {
  const sectionRef = useRef<HTMLElement>(null);
  const [stats, setStats] = useState({ activeListings: 0, totalVolumeKg: 0, totalRevenueTaka: 0, pendingOrders: 0 });
  const [insights, setInsights] = useState<Insights | null>(null);
  const [generating, setGenerating] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    api.stats.get()
      .then((data) => {
        setStats({
          activeListings: data.active_listings,
          totalVolumeKg: data.total_waste_kg,
          totalRevenueTaka: data.total_transactions_taka,
          pendingOrders: data.pending_orders,
        });
      })
      .catch(() => toast.error('Failed to load analytics stats.'));
  }, []);

  useScrollFade(sectionRef, ['.analytics-header', '.analytics-stat']);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await api.analytics.aiInsights();
      setInsights(data);
      setCooldown(10);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch {
      toast.error('Failed to generate AI insights.');
    } finally {
      setGenerating(false);
    }
  };

  const formatTaka = (val: number) => {
    if (val >= 10000000) return `৳${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `৳${(val / 100000).toFixed(1)}L`;
    return `৳${val.toLocaleString('en-US')}`;
  };

  return (
    <section ref={sectionRef} id="analytics" className="relative bg-void py-24 md:py-32">
      <div className="max-w-[1000px] mx-auto px-6 md:px-12">
        <div className="analytics-header text-center">
          <span className="accent-label text-cyan">PLATFORM ANALYTICS</span>
          <h2 className="text-h2 text-text-primary mt-4">
            AI-Powered Market Intelligence
          </h2>
          <p className="text-[0.9375rem] text-text-secondary max-w-[640px] mx-auto mt-4" style={{ lineHeight: 1.75 }}>
            Real-time platform metrics and AI-generated insights powered by live marketplace data.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
          <div className="analytics-stat glass-card p-5 text-center">
            <span className="font-mono text-cyan text-xl block">{stats.activeListings}</span>
            <span className="text-[0.7rem] text-text-tertiary tracking-wide block mt-1">Active Listings</span>
          </div>
          <div className="analytics-stat glass-card p-5 text-center">
            <span className="font-mono text-cyan text-xl block">{formatKg(stats.totalVolumeKg)}</span>
            <span className="text-[0.7rem] text-text-tertiary tracking-wide block mt-1">Volume Traded</span>
          </div>
          <div className="analytics-stat glass-card p-5 text-center">
            <span className="font-mono text-cyan text-xl block">{formatTaka(stats.totalRevenueTaka)}</span>
            <span className="text-[0.7rem] text-text-tertiary tracking-wide block mt-1">Market Revenue</span>
          </div>
          <div className="analytics-stat glass-card p-5 text-center">
            <span className="font-mono text-cyan text-xl block">{stats.pendingOrders}</span>
            <span className="text-[0.7rem] text-text-tertiary tracking-wide block mt-1">Pending Orders</span>
          </div>
        </div>

        <div className="mt-12">
          {!insights ? (
            <div className="text-center">
              <div className="analytics-stat glass-card p-8 inline-block">
                <div className="w-12 h-12 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center mx-auto">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a4 4 0 0 1 4 4c0 2-2 3-4 5-2-2-4-3-4-5a4 4 0 0 1 4-4z" />
                    <path d="M12 13v4" />
                    <path d="M8 22h8" />
                  </svg>
                </div>
                <p className="text-[0.9375rem] text-text-secondary mt-4 max-w-[400px]" style={{ lineHeight: 1.75 }}>
                  AI analyzes live marketplace data to generate market summaries, price forecasts, district insights, and actionable recommendations.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="mt-6 text-sm font-medium bg-gradient-to-r from-cyan to-emerald text-void px-6 py-3 rounded-full hover:shadow-lg transition-all duration-300 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                      </svg>
                      Generating...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a4 4 0 0 1 4 4c0 2-2 3-4 5-2-2-4-3-4-5a4 4 0 0 1 4-4z" />
                        <path d="M12 13v4" />
                        <path d="M8 22h8" />
                      </svg>
                      Generate AI Insights
                    </span>
                  )}
                </button>
                <p className="text-[0.6rem] text-text-tertiary mt-3">One-time analysis — only fires when you click</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="analytics-stat glass-card p-6">
                  <h3 className="text-[0.7rem] text-text-tertiary tracking-wide uppercase font-semibold mb-3 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
                    </svg>
                    Market Summary
                  </h3>
                  <p className="text-[0.8125rem] text-text-secondary leading-relaxed">{insights.summary}</p>
                </div>
                <div className="analytics-stat glass-card p-6">
                  <h3 className="text-[0.7rem] text-text-tertiary tracking-wide uppercase font-semibold mb-3 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                    </svg>
                    Price Forecast
                  </h3>
                  <div className="space-y-2">
                    {insights.price_forecast.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-[0.8125rem]">
                        <span className="text-text-primary">{f.waste_type}</span>
                        <span className="flex items-center gap-2">
                          <DirectionArrow direction={f.direction} />
                          <span className="font-mono text-text-secondary">{f.range}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="analytics-stat glass-card p-6">
                  <h3 className="text-[0.7rem] text-text-tertiary tracking-wide uppercase font-semibold mb-3 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    District Spotlight
                  </h3>
                  <p className="text-[0.8125rem] text-text-secondary leading-relaxed">{insights.district_spotlight}</p>
                </div>
                <div className="analytics-stat glass-card p-6">
                  <h3 className="text-[0.7rem] text-text-tertiary tracking-wide uppercase font-semibold mb-3 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Key Insight
                  </h3>
                  <p className="text-[0.8125rem] text-emerald leading-relaxed">{insights.key_insight}</p>
                </div>
              </div>
              {insights.patterns_found && insights.patterns_found.length > 0 && (
                <div className="analytics-stat glass-card p-6 mt-4">
                  <h3 className="text-[0.7rem] text-text-tertiary tracking-wide uppercase font-semibold mb-4 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                    </svg>
                    Patterns & Anomalies
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {insights.patterns_found.map((p, i) => (
                      <div key={i} className="bg-void/50 rounded-lg p-4 border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[0.8125rem] text-text-primary font-medium">{p.pattern}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[0.6rem] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded ${
                              p.confidence === 'high' ? 'bg-emerald/10 text-emerald' :
                              p.confidence === 'medium' ? 'bg-yellow-400/10 text-yellow-400' :
                              'bg-text-tertiary/10 text-text-tertiary'
                            }`}>
                              {p.confidence}
                            </span>
                            <span className={`text-[0.6rem] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded ${
                              p.impact === 'positive' ? 'bg-emerald/10 text-emerald' :
                              p.impact === 'negative' ? 'bg-red-400/10 text-red-400' :
                              'bg-text-tertiary/10 text-text-tertiary'
                            }`}>
                              {p.impact}
                            </span>
                          </div>
                        </div>
                        <p className="text-[0.75rem] text-text-secondary leading-relaxed">{p.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between mt-4">
                <p className="text-[0.6rem] text-text-tertiary">AI-generated from live market data — Cached 5 min</p>
                <button
                  onClick={handleGenerate}
                  disabled={generating || cooldown > 0}
                  className="text-[0.7rem] text-cyan hover:underline bg-transparent border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cooldown > 0 ? `Regenerate (${cooldown}s)` : 'Regenerate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
