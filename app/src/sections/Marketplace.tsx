import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Layers, TrendingUp, Package, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { formatKg, auctionCountdown } from "@/utils/formatting";
import type { Listing } from "@/lib/api";
import { toast } from "sonner";
import { useScrollFade, splitText } from "@/hooks/useScrollReveal";

function MiniSparkline() {
  const points = [20, 35, 28, 45, 38, 55, 48, 60, 52, 65, 58, 70];
  const width = 200;
  const height = 40;
  const maxVal = Math.max(...points);
  const minVal = Math.min(...points);
  const range = maxVal - minVal || 1;

  const pathD = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - minVal) / range) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10 mt-3" preserveAspectRatio="none">
      <path d={pathD} fill="none" stroke="#06b6d4" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  const isActive = listing.status === "ACTIVE";
  const priceTaka = listing.reserve_price_taka.toFixed(2);

  return (
    <Link
      to={`/listings/${listing.listing_id}`}
      className="marketplace-card glass-card glass-card-hover min-w-[250px] max-w-[250px] flex-shrink-0 snap-start p-6 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[1.125rem] font-medium text-text-primary leading-tight">
            {listing.waste_type}
          </h3>
          <span className="text-[0.7rem] text-text-tertiary uppercase tracking-wider font-semibold">
            Grade {listing.quality_grade}
          </span>
        </div>
        {isActive && (
          <span className="flex items-center gap-1.5 text-[0.68rem] text-emerald tracking-wider font-semibold uppercase bg-emerald/10 border border-emerald/20 px-2 py-0.5 rounded whitespace-nowrap ml-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
            LIVE
          </span>
        )}
      </div>

      <span className="font-mono text-cyan text-xl">৳{priceTaka}/kg</span>

      <div className="flex items-center gap-2 mt-3 text-[0.7rem] text-text-tertiary tracking-wide">
        <span>Qty: {formatKg(listing.quantity_kg)}</span>
        <span className="w-0.5 h-0.5 rounded-full bg-text-tertiary" />
        <span>{listing.location_district}</span>
      </div>

      <div className="mt-2 text-[0.65rem] text-text-tertiary">
        Ends: {auctionCountdown(listing.auction_end_time)}
      </div>

      <MiniSparkline />
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div
      className="min-w-[250px] max-w-[250px] flex-shrink-0 rounded-xl p-6 glass-card animate-pulse"
    >
      <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
      <div className="h-3 bg-white/5 rounded w-1/2 mb-4" />
      <div className="h-6 bg-white/5 rounded w-1/3 mb-3" />
      <div className="h-3 bg-white/5 rounded w-2/3 mb-4" />
      <div className="h-10 bg-white/5 rounded" />
    </div>
  );
}

function MarketStats({ stats }: { stats: { activeListings: number; avgPrice: number; totalVolume: number; pendingOrders: number } }) {
  return (
    <div className="marketplace-stats hidden lg:grid grid-cols-2 gap-3 min-w-[260px]">
      <div className="glass-card p-4">
        <Layers className="w-4 h-4 text-cyan/60 mb-2" />
        <span className="font-mono text-cyan text-xl block">{stats.activeListings}</span>
        <p className="text-[0.65rem] text-text-tertiary tracking-wide uppercase mt-1">Active listings</p>
      </div>
      <div className="glass-card p-4">
        <TrendingUp className="w-4 h-4 text-cyan/60 mb-2" />
        <span className="font-mono text-cyan text-xl block">৳{stats.avgPrice.toFixed(0)}</span>
        <p className="text-[0.65rem] text-text-tertiary tracking-wide uppercase mt-1">Avg price/kg</p>
      </div>
      <div className="glass-card p-4">
        <Package className="w-4 h-4 text-cyan/60 mb-2" />
        <span className="font-mono text-cyan text-xl block">{formatKg(stats.totalVolume)}</span>
        <p className="text-[0.65rem] text-text-tertiary tracking-wide uppercase mt-1">Available volume</p>
      </div>
      <div className="glass-card p-4">
        <Clock className="w-4 h-4 text-cyan/60 mb-2" />
        <span className="font-mono text-cyan text-xl block">{stats.pendingOrders}</span>
        <p className="text-[0.65rem] text-text-tertiary tracking-wide uppercase mt-1">Pending orders</p>
      </div>
    </div>
  );
}

export default function Marketplace() {
  const sectionRef = useRef<HTMLElement>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ activeListings: 0, avgPrice: 0, totalVolume: 0, pendingOrders: 0 });

  useEffect(() => {
    Promise.all([
      api.stats.get(),
      api.listings.list({ limit: 100 }),
    ])
      .then(([statsData, listingsData]) => {
        const prices = listingsData.listings.map(l => l.reserve_price_taka);
        const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        const vol = listingsData.listings.reduce((sum, l) => sum + l.remaining_kg, 0);
        setStats({
          activeListings: statsData.active_listings,
          avgPrice: avg,
          totalVolume: vol,
          pendingOrders: statsData.pending_orders,
        });
        setListings(listingsData.listings.slice(0, 6));
      })
      .catch(() => toast.error("Failed to load marketplace data."))
      .finally(() => setLoading(false));
  }, []);

  useScrollFade(sectionRef, [".marketplace-text", ".marketplace-stats", ".marketplace-card"]);

  return (
    <section ref={sectionRef} id="marketplace" className="relative min-h-[100dvh] overflow-hidden bg-void">
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px", zIndex: 0 }} />

      <div className="absolute top-0 left-0 right-0 h-[20%] bg-gradient-to-b from-void to-transparent z-[1] pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-[20%] bg-gradient-to-t from-void to-transparent z-[1] pointer-events-none" />

      <div className="relative z-[2] flex flex-col min-h-[100dvh] py-16 px-6 md:px-12">
        <div className="flex items-start justify-between gap-8 mt-8">
          <div className="marketplace-text max-w-[420px]">
            <span className="accent-label text-cyan">LIVE MARKETPLACE</span>
            <h2 className="text-h2 text-text-primary mt-4" style={{ textShadow: "0 0 40px rgba(3,3,3,0.8)" }}>
              {splitText("Real-Time Commodity Exchange", "marketplace-word")}
            </h2>
            <p className="text-[0.9375rem] text-text-secondary mt-4" style={{ lineHeight: 1.75 }}>
              Browse cotton waste, polyester scraps, denim offcuts, and mixed fiber lots. Live prices, active bidding, and instant matching across Bangladesh&apos;s garment manufacturing zones.
            </p>
            <Link
              to="/marketplace"
              className="inline-flex items-center gap-2 mt-4 text-sm text-cyan hover:text-cyan/80 transition-colors"
            >
              View all listings
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4l4 4-4 4" />
              </svg>
            </Link>
          </div>
          <MarketStats stats={stats} />
        </div>

        <div className="mt-auto">
          {loading ? (
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
              {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-tertiary text-sm">No active listings yet. Be the first to list.</p>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 mt-4 text-sm text-cyan hover:underline"
              >
                Start Selling
              </Link>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
              {listings.map((listing) => (
                <ListingCard key={listing.listing_id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}