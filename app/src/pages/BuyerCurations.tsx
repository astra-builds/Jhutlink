import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatCurrency, formatKg, auctionCountdown } from "@/utils/formatting";
import type { Recommendation } from "@/lib/api";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";
import ScoreRing from "@/components/ScoreRing";
import ScoreBreakdownBar from "@/components/ScoreBreakdownBar";
import { toast } from "sonner";

/* ─── tier helpers ─── */
type MatchTier = "strong" | "good" | "possible";

function getTier(score: number): MatchTier {
  if (score >= 80) return "strong";
  if (score >= 60) return "good";
  return "possible";
}

const TIER_STYLES: Record<MatchTier, { bg: string; text: string; label: string; glow: string }> = {
  strong:   { bg: "bg-emerald/10",        text: "text-emerald",     label: "Strong Match",   glow: "shadow-glow-emerald" },
  good:     { bg: "bg-cyan/10",            text: "text-cyan",        label: "Good Match",     glow: "shadow-glow" },
  possible: { bg: "bg-amber-500/10",       text: "text-amber-400",   label: "Possible Match", glow: "" },
};

/* ─── sort options ─── */
type SortKey = "score" | "price" | "quantity" | "deadline";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score",    label: "Match Score" },
  { value: "price",    label: "Price" },
  { value: "quantity", label: "Quantity" },
  { value: "deadline", label: "Auction Deadline" },
];

/* ─── filter options ─── */
const TIER_FILTER_OPTIONS = [
  { value: "", label: "All Matches" },
  { value: "strong", label: "Strong (80+)" },
  { value: "good", label: "Good (60-79)" },
  { value: "possible", label: "Possible (<60)" },
];

export default function BuyerCurations() {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  /* filters & sort */
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [tierFilter, setTierFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  /* ─── data loading ─── */
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      setError("");
      try {
        const res = await api.recommendations.list();
        setRecommendations(res || []);
      } catch (err: any) {
        console.error("Failed to load recommendations:", err);
        if (err.status === 404) {
          // No preferences set – handled in empty state
          setRecommendations([]);
        } else {
          setError("Failed to load recommendations. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  /* ─── derived / filtered list ─── */
  const filtered = useMemo(() => {
    let list = [...recommendations];

    // tier filter
    if (tierFilter) {
      list = list.filter((r) => getTier(r.score) === tierFilter);
    }

    // search by waste type or district
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          r.waste_type.toLowerCase().includes(q) ||
          r.location_district.toLowerCase().includes(q)
      );
    }

    // sort
    list.sort((a, b) => {
      switch (sortKey) {
        case "score":
          return b.score - a.score;
        case "price":
          return a.reserve_price_taka - b.reserve_price_taka;
        case "quantity":
          return b.quantity_kg - a.quantity_kg;
        case "deadline": {
          const aTime = a.auction_end_time ? new Date(a.auction_end_time).getTime() : Infinity;
          const bTime = b.auction_end_time ? new Date(b.auction_end_time).getTime() : Infinity;
          return aTime - bTime;
        }
        default:
          return 0;
      }
    });

    return list;
  }, [recommendations, sortKey, tierFilter, searchTerm]);

  /* ─── stats summary ─── */
  const stats = useMemo(() => {
    const strong = recommendations.filter((r) => r.score >= 80).length;
    const good = recommendations.filter((r) => r.score >= 60 && r.score < 80).length;
    const possible = recommendations.filter((r) => r.score < 60).length;
    const avgScore =
      recommendations.length > 0
        ? Math.round(recommendations.reduce((s, r) => s + r.score, 0) / recommendations.length)
        : 0;
    return { strong, good, possible, avgScore, total: recommendations.length };
  }, [recommendations]);

  /* ─── loading state ─── */
  if (loading) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="relative mx-auto w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-cyan/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan animate-spin" />
            </div>
            <p className="text-text-secondary text-sm">Analyzing your preferences…</p>
          </div>
        </main>
      </div>
    );
  }

  /* ─── error state ─── */
  if (error && !loading) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center text-center py-12">
          <div className="glass-card p-8 max-w-md">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-text-tertiary">{error}</p>
            <div className="mt-6 flex justify-center gap-4">
              <button
                onClick={() => window.location.reload()}
                className="text-xs text-cyan hover:underline"
              >
                Retry
              </button>
              <Link to="/dashboard/buyer" className="text-xs text-text-tertiary hover:underline">
                ← Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ─── empty / no preferences state ─── */
  if (recommendations.length === 0) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex flex-col">
          <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
            <h1 className="text-xl font-semibold text-text-primary">AI Curations</h1>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-md space-y-5">
              {/* Animated icon */}
              <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 rounded-full bg-cyan/5 animate-pulse" />
                <div className="absolute inset-2 rounded-full bg-cyan/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-2">
                  No curations yet
                </h2>
                <p className="text-sm text-text-tertiary leading-relaxed">
                  Set up your sourcing preferences so our matching engine can find the
                  best textile waste listings for you.
                </p>
              </div>

              <Link
                to="/dashboard/buyer/preferences"
                className="btn-primary bg-cyan text-void inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Set Preferences
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ─── main content ─── */
  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ── Header ── */}
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-text-primary">AI Curations</h1>
              <p className="text-xs text-text-tertiary mt-0.5">
                {stats.total} listing{stats.total !== 1 ? "s" : ""} matched to your preferences
              </p>
            </div>
            <Link
              to="/dashboard/buyer/preferences"
              className="text-xs text-cyan hover:underline flex items-center gap-1 self-start"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Edit Preferences
            </Link>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="px-6 py-3 border-b border-white/[0.03] bg-void">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-card px-4 py-3">
              <p className="text-[0.6rem] text-text-tertiary uppercase tracking-widest mb-0.5">Avg Score</p>
              <p className="font-mono text-lg text-cyan">{stats.avgScore}<span className="text-xs text-text-tertiary">%</span></p>
            </div>
            <div className="glass-card px-4 py-3">
              <p className="text-[0.6rem] text-text-tertiary uppercase tracking-widest mb-0.5">Strong</p>
              <p className="font-mono text-lg text-emerald">{stats.strong}</p>
            </div>
            <div className="glass-card px-4 py-3">
              <p className="text-[0.6rem] text-text-tertiary uppercase tracking-widest mb-0.5">Good</p>
              <p className="font-mono text-lg text-cyan">{stats.good}</p>
            </div>
            <div className="glass-card px-4 py-3">
              <p className="text-[0.6rem] text-text-tertiary uppercase tracking-widest mb-0.5">Possible</p>
              <p className="font-mono text-lg text-amber-400">{stats.possible}</p>
            </div>
          </div>
        </div>

        {/* ── Toolbar: search / filter / sort ── */}
        <div className="px-6 py-3 border-b border-white/[0.03] bg-void flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search type or location…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface/20 border border-white/[0.06] rounded-lg text-text-primary placeholder:text-text-tertiary focus:border-cyan/40 focus:outline-none transition-colors"
            />
          </div>

          {/* Tier filter */}
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="text-xs bg-surface/20 border border-white/[0.06] rounded-lg px-3 py-1.5 text-text-secondary focus:border-cyan/40 focus:outline-none appearance-none cursor-pointer"
          >
            {TIER_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-xs bg-surface/20 border border-white/[0.06] rounded-lg px-3 py-1.5 text-text-secondary focus:border-cyan/40 focus:outline-none appearance-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
            ))}
          </select>

          {/* Result count */}
          <span className="text-[0.65rem] text-text-tertiary ml-auto">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Recommendation cards ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-text-tertiary text-sm">
                No matches for the current filters.
              </p>
              <button
                onClick={() => { setTierFilter(""); setSearchTerm(""); }}
                className="text-xs text-cyan hover:underline mt-2"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((rec) => {
                const tier = getTier(rec.score);
                const style = TIER_STYLES[tier];
                const isExpanded = expandedId === rec.listing_id;

                return (
                  <div
                    key={rec.listing_id}
                    className={`glass-card glass-card-hover overflow-hidden transition-all duration-300 ${
                      isExpanded ? "ring-1 ring-cyan/20" : ""
                    }`}
                  >
                    {/* ── Card top ── */}
                    <div className="p-5 flex items-start gap-4">
                      {/* Score ring */}
                      <ScoreRing score={rec.score} size={60} strokeWidth={4} className="flex-shrink-0" />

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-medium text-text-primary">{rec.waste_type}</h3>
                          <span className={`text-[0.6rem] px-2 py-0.5 rounded-full uppercase tracking-wide ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                          <span className="text-[0.6rem] bg-cyan/10 text-cyan px-2 py-0.5 rounded-full uppercase tracking-wide">
                            Grade {rec.quality_grade}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary mt-1">
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="font-mono text-cyan">{formatCurrency(rec.reserve_price_taka)}/kg</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                            {formatKg(rec.quantity_kg)}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {rec.location_district}
                          </span>
                          {rec.auction_end_time && (
                            <span className="flex items-center gap-1 text-amber-400">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span className="text-xs">{auctionCountdown(rec.auction_end_time)}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Toggle breakdown + View listing */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <Link
                          to={`/listings/${rec.listing_id}`}
                          className="btn-primary bg-cyan text-void text-xs px-4 py-1.5 hover:bg-cyan/80"
                        >
                          View Listing →
                        </Link>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : rec.listing_id)}
                          className="text-[0.65rem] text-text-tertiary hover:text-cyan transition-colors flex items-center gap-1"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          {isExpanded ? "Hide" : "Score"} Details
                        </button>
                      </div>
                    </div>

                    {/* ── Expanded details panel ── */}
                    <div
                      className="overflow-hidden transition-all duration-300 ease-out"
                      style={{
                        maxHeight: isExpanded ? "400px" : "0px",
                        opacity: isExpanded ? 1 : 0,
                      }}
                    >
                      <div className="px-5 pb-5 pt-0">
                        <div className="border-t border-white/[0.04] pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Score breakdown bars */}
                          <div>
                            <p className="text-[0.65rem] text-text-tertiary uppercase tracking-widest mb-3">
                              Score Breakdown
                            </p>
                            <ScoreBreakdownBar breakdown={rec.score_breakdown} />
                          </div>

                          {/* AI insight */}
                          <div>
                            <p className="text-[0.65rem] text-text-tertiary uppercase tracking-widest mb-3">
                              AI Insight
                            </p>
                            <p className="text-[0.8125rem] text-text-secondary leading-relaxed">
                              {rec.recommendation_label ||
                                "This listing matches your preferences based on waste type, quality, quantity, price, and location."}
                            </p>

                            {/* Quick stat pills */}
                            <div className="flex flex-wrap gap-2 mt-4">
                              <span className="text-[0.6rem] px-2.5 py-1 rounded-full bg-surface-highlight text-text-tertiary">
                                Listing #{rec.listing_id}
                              </span>
                              <span className="text-[0.6rem] px-2.5 py-1 rounded-full bg-surface-highlight text-text-tertiary">
                                Overall: {rec.score}/100
                              </span>
                              {rec.auction_end_time && (
                                <span className="text-[0.6rem] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400">
                                  ⏱ {auctionCountdown(rec.auction_end_time)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}