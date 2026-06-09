import { useEffect, useState, useRef, memo, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatKg, auctionCountdown, formatCurrency } from "@/utils/formatting";
import type { Listing } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { CursorSpotlight } from "@/components/CursorSpotlight";
import {
  Search, Star, ShoppingCart, RefreshCw, SlidersHorizontal,
  ArrowUpDown, AlertCircle, PackageOpen, RotateCcw, Home,
} from "lucide-react";
import { toast } from "sonner";

gsap.registerPlugin(ScrollTrigger);

const WASTE_TYPES = ["All", "Cotton", "Polyester", "Mixed", "Denim", "Synthetic Blend"];
const SORT_OPTIONS = [
  { value: "auction_end_time", label: "Ending Soon" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "quantity_desc", label: "Largest Qty" },
  { value: "created_at", label: "Newest First" },
];

const ListingCard = memo(function ListingCard({ listing }: { listing: Listing }) {
  const isActive = listing.status === "ACTIVE";
  const priceTaka = listing.current_highest_taka ?? listing.reserve_price_taka;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [watchlisted, setWatchlisted] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (user?.role === "buyer") {
      api.listings.watchlistStatus(listing.listing_id).then((r) => setWatchlisted(r.watchlisted)).catch(() => {});
    }
  }, [listing.listing_id, user?.role]);

  const handleWatchlist = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { navigate("/auth"); return; }
    setToggling(true);
    try {
      await api.listings.toggleWatchlist(listing.listing_id);
      setWatchlisted((p) => !p);
    } catch { toast.error("Failed to update watchlist"); }
    setToggling(false);
  }, [listing.listing_id, user, navigate]);

  const handleBid = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    navigate(`/listings/${listing.listing_id}`);
  }, [listing.listing_id, navigate]);

  return (
    <Link
      to={`/listings/${listing.listing_id}`}
      className="group glass-card glass-card-hover p-5 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[1.0625rem] font-medium text-text-primary truncate">{listing.waste_type}</h3>
            <span className="text-[0.6rem] bg-cyan/10 text-cyan px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">
              {listing.quality_grade}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {isActive && (
              <span className="flex items-center gap-1 text-[0.6rem] text-emerald tracking-wider uppercase">
                <span className="w-1 h-1 rounded-full bg-emerald animate-pulse-glow" />
                LIVE
              </span>
            )}
            <span className="text-[0.6rem] text-text-tertiary uppercase tracking-wider">
              {formatKg(listing.quantity_kg)}
            </span>
          </div>
        </div>
        <span className="font-mono text-cyan text-lg flex-shrink-0">৳{priceTaka.toFixed(2)}</span>
      </div>

      <div className="flex items-center gap-2 text-[0.65rem] text-text-tertiary flex-wrap">
        <span>{listing.location_district}</span>
        <span className="w-0.5 h-0.5 rounded-full bg-text-tertiary" />
        <span>{listing.auction_duration_hours}h auction</span>
        {isActive && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-text-tertiary" />
            <span className="text-cyan/80">{auctionCountdown(listing.auction_end_time)}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04] mt-auto">
        <button
          onClick={handleWatchlist}
          disabled={toggling}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[0.6rem] text-text-tertiary hover:text-amber-400 hover:border-amber-400/30 transition-all disabled:opacity-50 cursor-pointer"
          aria-label={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
        >
          <Star className={`w-3 h-3 ${watchlisted ? "fill-amber-400 text-amber-400" : ""}`} />
          {watchlisted ? "Watching" : "Watch"}
        </button>
        {isActive && (
          <button
            onClick={handleBid}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan/20 to-emerald/20 border border-cyan/20 text-[0.6rem] text-cyan hover:from-cyan/30 hover:to-emerald/30 transition-all ml-auto cursor-pointer"
          >
            <ShoppingCart className="w-3 h-3" /> Place Bid
          </button>
        )}
      </div>
    </Link>
  );
});

function SkeletonCard() {
  return (
    <div className="glass-card p-5 animate-shimmer">
      <div className="flex justify-between mb-3">
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-white/5 rounded w-2/3" />
          <div className="h-3 bg-white/5 rounded w-1/3" />
        </div>
        <div className="h-6 bg-white/5 rounded w-16" />
      </div>
      <div className="h-3 bg-white/5 rounded w-1/2 mb-4" />
      <div className="flex gap-2 pt-3 border-t border-white/[0.04]">
        <div className="h-6 bg-white/5 rounded w-14" />
        <div className="h-6 bg-white/5 rounded w-20 ml-auto" />
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("waste_type") || "All");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [page, setPage] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const sortBy = searchParams.get("sort_by") || "auction_end_time";
  const sortOrder = searchParams.get("sort_order") || "asc";

  const fetchListings = useCallback(() => {
    setLoading(true);
    setError(false);
    const params: Parameters<typeof api.listings.list>[0] = { sort_by: sortBy, sort_order: sortOrder };
    if (activeTab !== "All") params.waste_type = activeTab;
    if (searchQuery) params.search = searchQuery;
    params.limit = PAGE_SIZE;
    if (page > 0) params.offset = page * PAGE_SIZE;
    api.listings.list(params)
      .then((res) => { setListings(res.listings); setTotal(res.total); })
      .catch(() => { setError(true); toast.error("Failed to load marketplace"); })
      .finally(() => setLoading(false));
  }, [sortBy, sortOrder, activeTab, searchQuery, page]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".mp-fade", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.06, ease: "power3.out" });
    }, sectionRef.current);
    return () => ctx.revert();
  }, [loading]);

  function handleTabClick(tab: string) {
    setActiveTab(tab);
    setPage(0);
    const next = new URLSearchParams(searchParams);
    if (tab === "All") next.delete("waste_type");
    else next.set("waste_type", tab);
    setSearchParams(next);
  }

  function updateSort(value: string) {
    setPage(0);
    const next = new URLSearchParams(searchParams);
    if (value === "price_asc") { next.set("sort_by", "price"); next.set("sort_order", "asc"); }
    else if (value === "price_desc") { next.set("sort_by", "price"); next.set("sort_order", "desc"); }
    else if (value === "quantity_desc") { next.set("sort_by", "quantity"); next.set("sort_order", "desc"); }
    else if (value === "created_at") { next.set("sort_by", "created_at"); next.set("sort_order", "desc"); }
    else { next.set("sort_by", "auction_end_time"); next.set("sort_order", "asc"); }
    setSearchParams(next);
  }

  function getSortValue(): string {
    if (sortBy === "price") return `price_${sortOrder}`;
    if (sortBy === "quantity") return "quantity_desc";
    if (sortBy === "created_at") return "created_at";
    return "auction_end_time";
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div ref={sectionRef} className="min-h-[100dvh] bg-void pt-20 pb-16 px-6 md:px-12">
      <CursorSpotlight />

      <div className="max-w-[1280px] mx-auto">
        <div className="mp-fade mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-cyan transition-colors mb-4">
            <Home className="w-4 h-4" /> Home
          </Link>
          <h1 className="text-h2 text-text-primary">Marketplace</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Browse live textile waste auctions across Bangladesh
          </p>
        </div>

        <div className="mp-fade flex flex-col lg:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
            <Input
              type="text"
              placeholder="Search by waste type, district, grade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 bg-surface border-white/[0.08] text-sm text-text-primary placeholder:text-text-tertiary"
              aria-label="Search listings"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-text-tertiary" />
            <select
              value={getSortValue()}
              onChange={(e) => updateSort(e.target.value)}
              className="bg-surface text-text-secondary text-sm px-3 py-2 rounded-lg border border-white/10 cursor-pointer outline-none min-w-[140px]"
              aria-label="Sort listings"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mp-fade flex flex-wrap gap-2 mb-8">
          {WASTE_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => handleTabClick(type)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                activeTab === type
                  ? "bg-cyan/20 text-cyan border border-cyan/30 shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                  : "bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:border-white/[0.15] hover:text-text-primary"
              }`}
            >
              {type === "All" ? "All Types" : type}
            </button>
          ))}
        </div>

        <div className="mp-fade flex items-center justify-between mb-5">
          <p className="text-sm text-text-tertiary">
            {loading ? "Loading..." : `${total} listing${total !== 1 ? "s" : ""}`}
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <div className="glass-card p-12 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">Failed to load marketplace</h3>
            <p className="text-sm text-text-tertiary mb-6">Could not reach the server. Please check your connection.</p>
            <button
              onClick={fetchListings}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan/20 to-emerald/20 border border-cyan/20 text-sm text-cyan hover:from-cyan/30 hover:to-emerald/30 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : listings.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <PackageOpen className="w-10 h-10 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">
              {searchQuery || activeTab !== "All" ? "No listings match your filters" : "No listings available"}
            </h3>
            <p className="text-sm text-text-tertiary mb-6 max-w-md mx-auto">
              {(searchQuery || activeTab !== "All")
                ? "Try adjusting your search or filter criteria to find what you're looking for."
                : "There are no active listings on the marketplace right now. Check back later or create a listing."}
            </p>
            <div className="flex items-center justify-center gap-3">
              {(searchQuery || activeTab !== "All") && (
                <button
                  onClick={() => { setSearchQuery(""); setActiveTab("All"); setSearchParams(new URLSearchParams()); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-text-secondary hover:text-text-primary transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> Clear all filters
                </button>
              )}
              <button
                onClick={() => { setSearchQuery(""); setActiveTab("All"); setSearchParams(new URLSearchParams()); setPage(0); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan/20 to-emerald/20 border border-cyan/20 text-sm text-cyan hover:from-cyan/30 hover:to-emerald/30 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Browse all
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {listings.map((l) => <ListingCard key={l.listing_id} listing={l} />)}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-text-secondary hover:text-text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  ← Prev
                </button>
                <span className="text-sm text-text-tertiary">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-text-secondary hover:text-text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
