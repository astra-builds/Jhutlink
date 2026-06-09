import { useEffect, useState, useRef, memo, useCallback } from "react";
import { useParams, Link } from "react-router";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency, formatKg, auctionCountdown } from "@/utils/formatting";
import type { Listing, Bid } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useListingSocket } from "@/hooks/useListingSocket";
import { CursorSpotlight } from "@/components/CursorSpotlight";
import {
  Shield, Star, MapPin, Clock, ChevronLeft, Image as ImageIcon,
  Award, TrendingUp, AlertCircle, Package, CheckCircle2,
  Timer, Users, Store,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const CountdownTimer = memo(function CountdownTimer({ endTime }: { endTime?: string }) {
  const [timeStr, setTimeStr] = useState(() => auctionCountdown(endTime));
  useEffect(() => {
    const id = setInterval(() => setTimeStr(auctionCountdown(endTime)), 1000);
    return () => clearInterval(id);
  }, [endTime]);
  return <span className="font-mono text-cyan">{timeStr}</span>;
});

const BidRow = memo(function BidRow({ bid }: { bid: any }) {
  const statusColor =
    bid.status === "MATCHED" ? "text-emerald" :
    bid.status === "OUTBID" ? "text-red-400" : "text-text-secondary";
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium text-text-primary">{bid.buyer_name || `Buyer #${bid.buyer_id}`}</span>
        <span className="text-xs text-text-tertiary">{formatKg(bid.quantity_kg)}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-mono text-sm text-cyan">{formatCurrency(bid.price_per_kg_taka)}</span>
        <span className={`text-[0.55rem] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${statusColor} bg-white/[0.04]`}>
          {bid.status}
        </span>
      </div>
    </div>
  );
});

function SkeletonPage() {
  return (
    <div className="min-h-[100dvh] bg-void pt-20 pb-16 px-6 md:px-12">
      <div className="max-w-[1280px] mx-auto animate-shimmer">
        <div className="h-4 bg-white/5 rounded w-24 mb-8" />
        <div className="grid lg:grid-cols-[1fr_420px] gap-8">
          <div className="space-y-6">
            <div className="glass-card p-6">
              <div className="h-6 bg-white/5 rounded w-1/3 mb-4" />
              <div className="grid grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded" />)}
              </div>
            </div>
            <div className="glass-card p-6">
              <div className="h-5 bg-white/5 rounded w-1/4 mb-4" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-white/5 rounded" />)}
              </div>
            </div>
          </div>
          <div className="glass-card p-6">
            <div className="h-5 bg-white/5 rounded w-1/3 mb-6" />
            <div className="h-10 bg-white/5 rounded mb-3" />
            <div className="h-10 bg-white/5 rounded mb-3" />
            <div className="h-12 bg-white/5 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const sectionRef = useRef<HTMLDivElement>(null);

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bidQty, setBidQty] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [placingBid, setPlacingBid] = useState(false);
  const [bidErrors, setBidErrors] = useState<{ qty?: string; price?: string }>({});
  const [watchlisted, setWatchlisted] = useState(false);
  const [togglingWatch, setTogglingWatch] = useState(false);

  const isBuyer = user?.role === "buyer";
  const isSeller = user?.role === "seller";
  const isOwner = listing?.seller_id === user?.id;
  const isActive = listing?.status === "ACTIVE";
  const bestBidPrice = bids.length > 0 ? Math.max(...bids.map((b) => b.price_per_kg_taka)) : 0;
  const priceTaka = bestBidPrice || listing?.reserve_price_taka || 0;
  const totalCost = (Number(bidQty) || 0) * (Number(bidPrice) || 0);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    try {
      const [listingData, bidsData] = await Promise.all([
        api.listings.get(Number(id)).catch(() => null),
        api.listings.bids(Number(id)).catch(() => [] as Bid[]),
      ]);
      if (!listingData) { setNotFound(true); return; }
      setListing(listingData);
      setBids(bidsData);
      if (user?.role === "buyer") {
        api.listings.watchlistStatus(Number(id)).then((r) => setWatchlisted(r.watchlisted)).catch(() => {});
      }
    } catch { setNotFound(true); }
    setLoading(false);
  }, [id, user?.role]);

  useEffect(() => { loadData(); }, [loadData]);

  useListingSocket(
    id ? Number(id) : undefined,
    useCallback((data: any) => {
      if (data.type === "bid_update" && Array.isArray(data.bids)) {
        setBids(data.bids);
      }
    }, []),
  );

  useEffect(() => {
    if (!sectionRef.current || loading) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".ld-fade", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power3.out" });
    }, sectionRef.current);
    return () => ctx.revert();
  }, [loading]);

  function validateBid(): boolean {
    const errors: typeof bidErrors = {};
    const qty = Number(bidQty);
    const price = Number(bidPrice);
    if (!qty || qty < 50) errors.qty = "Minimum 50 kg";
    if (listing && qty > listing.remaining_kg) errors.qty = `Only ${listing.remaining_kg} kg remaining`;
    if (!price || price <= 0) errors.price = "Enter a valid price";
    if (listing && price < listing.reserve_price_taka) errors.price = "Below reserve price";
    setBidErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handlePlaceBid(e: React.FormEvent) {
    e.preventDefault();
    if (!validateBid() || !listing) return;
    setPlacingBid(true);
    try {
      await api.bids.place(listing.listing_id, Number(bidQty), Number(bidPrice));
      toast.success("Bid placed successfully!");
      setBidQty(""); setBidPrice(""); setBidErrors({});
      const bidsData = await api.listings.bids(listing.listing_id);
      setBids(bidsData);
    } catch (e: any) {
      toast.error(e.detail || "Failed to place bid");
    }
    setPlacingBid(false);
  }

  async function handleToggleWatchlist() {
    if (!listing || togglingWatch) return;
    setTogglingWatch(true);
    try {
      await api.listings.toggleWatchlist(listing.listing_id);
      setWatchlisted((p) => !p);
      toast.success(watchlisted ? "Removed from watchlist" : "Added to watchlist");
    } catch { toast.error("Failed to update watchlist"); }
    setTogglingWatch(false);
  }

  if (loading) return <SkeletonPage />;
  if (notFound || !listing) {
    return (
      <div className="min-h-[100dvh] bg-void pt-20 pb-16 flex items-center justify-center px-6">
        <div className="glass-card p-10 text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-medium text-text-primary mb-2">Listing not found</h2>
          <p className="text-sm text-text-tertiary mb-6">This listing may have been removed or doesn't exist.</p>
          <Link to="/marketplace" className="inline-flex items-center gap-1 text-cyan hover:text-cyan/80 transition-colors text-sm">
            <ChevronLeft className="w-4 h-4" /> Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  const statusBanner = !isActive ? (
    <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${
      listing.status === "SOLD" ? "bg-emerald/10 border border-emerald/20" :
      listing.status === "CLOSED" ? "bg-amber-500/10 border border-amber-500/20" :
      listing.status === "EXPIRED" ? "bg-white/5 border border-white/10" :
      "bg-cyan/10 border border-cyan/20"
    }`}>
      {listing.status === "SOLD" ? <CheckCircle2 className="w-5 h-5 text-emerald" /> :
       listing.status === "CLOSED" ? <Timer className="w-5 h-5 text-amber-400" /> :
       listing.status === "EXPIRED" ? <AlertCircle className="w-5 h-5 text-text-tertiary" /> :
       <AlertCircle className="w-5 h-5 text-cyan" />}
      <div>
        <p className="text-sm font-medium text-text-primary">
          {listing.status === "SOLD" && "Auction ended. Bids have been allocated."}
          {listing.status === "CLOSED" && "Auction ended. Allocation in progress..."}
          {listing.status === "EXPIRED" && "No bids were placed. This listing has expired."}
          {listing.status === "DRAFT" && "Listing is not yet live."}
        </p>
        {listing.status === "EXPIRED" && isOwner && (
          <Link to="/dashboard/seller/listings" className="text-xs text-cyan hover:underline">Create a new listing</Link>
        )}
        {listing.status === "SOLD" && (
          <span className="text-xs text-emerald">{bids.filter((b) => b.status === "MATCHED").length} bid(s) matched</span>
        )}
      </div>
    </div>
  ) : null;

  const sortedBids = [...bids].sort((a, b) => b.price_per_kg_taka - a.price_per_kg_taka);

  return (
    <div ref={sectionRef} className="min-h-[100dvh] bg-void pt-20 pb-16 px-6 md:px-12">
      <CursorSpotlight />
      <div className="max-w-[1280px] mx-auto">
        <Link to="/marketplace" className="ld-fade inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-cyan transition-colors mb-6">
          <ChevronLeft className="w-4 h-4" /> Marketplace
        </Link>

        {statusBanner}

        <div className="grid lg:grid-cols-[1fr_420px] gap-8 items-start">
          <div className="space-y-6">
            <div className="ld-fade glass-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-semibold text-text-primary">{listing.waste_type}</h1>
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan/10 text-cyan border border-cyan/20 text-[0.6rem] font-medium uppercase tracking-wider">
                      Grade {listing.quality_grade}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[0.6rem] text-emerald tracking-wider uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse-glow" />
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-text-tertiary mt-1">
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {listing.location_district}</span>
                    <span>{formatKg(listing.quantity_kg)} total</span>
                  </div>
                </div>
                {isBuyer && (
                  <button
                    onClick={handleToggleWatchlist}
                    disabled={togglingWatch}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-text-secondary hover:text-amber-400 hover:border-amber-400/30 transition-all disabled:opacity-50 cursor-pointer flex-shrink-0"
                  >
                    <Star className={`w-4 h-4 ${watchlisted ? "fill-amber-400 text-amber-400" : ""}`} />
                    {watchlisted ? "Watching" : "Watchlist"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3 mt-4">
                {listing.photos && listing.photos.length > 0 ? (
                  listing.photos.slice(0, 4).map((photo, i) => (
                    <div key={i} className="aspect-square rounded-xl bg-surface border border-white/[0.06] flex items-center justify-center overflow-hidden">
                      <img src={photo} alt={`${listing.waste_type} photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ))
                ) : (
                  [...Array(4)].map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl bg-surface border border-white/[0.06] flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-text-tertiary" />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="ld-fade glass-card p-6">
              <h3 className="text-sm font-medium text-text-primary mb-4">Listing Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[0.55rem] uppercase tracking-widest text-text-tertiary mb-1">Duration</div>
                  <div className="text-sm font-medium text-text-primary">{listing.auction_duration_hours}h</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[0.55rem] uppercase tracking-widest text-text-tertiary mb-1">Time Left</div>
                  <div className="text-sm font-medium"><CountdownTimer endTime={listing.auction_end_time} /></div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[0.55rem] uppercase tracking-widest text-text-tertiary mb-1">Reserve Price</div>
                  <div className="text-sm font-medium text-text-primary">{formatCurrency(listing.reserve_price_taka)}/kg</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[0.55rem] uppercase tracking-widest text-text-tertiary mb-1">Remaining</div>
                  <div className="text-sm font-medium text-text-primary">{formatKg(listing.remaining_kg)}</div>
                </div>
              </div>
            </div>

            <div className="ld-fade glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Store className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-medium text-text-primary">Seller Information</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan/20 to-emerald/20 flex items-center justify-center text-sm font-bold text-cyan">
                  S
                </div>
                <div>
                  <div className="text-sm text-text-primary font-medium">Seller #{listing.seller_id}</div>
                  <div className="flex items-center gap-2 text-xs text-text-tertiary mt-0.5">
                    <span className="flex items-center gap-0.5"><Star className="w-3 h-3 text-amber-400" /> --</span>
                    <span>Verified</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="ld-fade glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-emerald" />
                <h3 className="text-sm font-medium text-text-primary">Trust & Safety</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald/5 border border-emerald/10">
                  <CheckCircle2 className="w-4 h-4 text-emerald mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-text-primary">Escrow Protected</div>
                    <div className="text-[0.6rem] text-text-tertiary">Funds held securely until delivery confirmed</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan/5 border border-cyan/10">
                  <Award className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-text-primary">Quality Verified</div>
                    <div className="text-[0.6rem] text-text-tertiary">Grade confirmed by independent assessment</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="ld-fade glass-card p-6 sticky top-24">
              <div className="text-center mb-6">
                <div className="text-3xl font-bold font-mono text-cyan">৳{priceTaka.toFixed(2)}</div>
                <div className="text-xs text-text-tertiary mt-1">Current Best Price</div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-medium text-text-primary mb-3">Bid Board</h3>
                {sortedBids.length === 0 ? (
                  <div className="text-center py-6">
                    <Users className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
                    <p className="text-xs text-text-tertiary">No bids yet. Be the first!</p>
                  </div>
                ) : (
                  <div className="max-h-[240px] overflow-y-auto scrollbar-thin">
                    {sortedBids.map((b) => <BidRow key={b.bid_id} bid={b} />)}
                  </div>
                )}
              </div>

              <div className="border-t border-white/[0.06] pt-6">
                {isActive && isBuyer && !isOwner ? (
                  <form onSubmit={handlePlaceBid}>
                    <h3 className="text-sm font-medium text-text-primary mb-3">Place a Bid</h3>
                    <p className="text-xs text-text-tertiary mb-4">
                      Min bid: {formatCurrency(listing.reserve_price_taka)}/kg · {formatKg(listing.remaining_kg)} available
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[0.55rem] uppercase tracking-widest text-text-tertiary mb-1 block">Quantity (kg)</label>
                        <Input
                          type="number" min={50} max={listing.remaining_kg} step={1}
                          value={bidQty} onChange={(e) => setBidQty(e.target.value)}
                          placeholder="e.g. 100"
                          className="bg-surface border-white/[0.08] text-sm"
                          aria-label="Bid quantity in kilograms"
                        />
                        {bidErrors.qty && <p className="text-xs text-red-400 mt-1">{bidErrors.qty}</p>}
                      </div>
                      <div>
                        <label className="text-[0.55rem] uppercase tracking-widest text-text-tertiary mb-1 block">Price (৳/kg)</label>
                        <Input
                           type="number" min={listing.reserve_price_taka} step={0.5}
                          value={bidPrice} onChange={(e) => setBidPrice(e.target.value)}
                          placeholder="e.g. 28.00"
                          className="bg-surface border-white/[0.08] text-sm"
                          aria-label="Bid price per kilogram in taka"
                        />
                        {bidErrors.price && <p className="text-xs text-red-400 mt-1">{bidErrors.price}</p>}
                      </div>
                      {totalCost > 0 && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                          <span className="text-xs text-text-tertiary">Total</span>
                          <span className="font-mono text-sm text-cyan">{formatCurrency(totalCost)}</span>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={placingBid}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan to-emerald text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {placingBid ? <Spinner className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                        {placingBid ? "Placing bid..." : `Place Bid at ৳${bidPrice || priceTaka.toFixed(2)}`}
                      </button>
                    </div>
                  </form>
                ) : isOwner ? (
                  <div className="text-center py-4">
                    <Store className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                    <p className="text-sm text-text-tertiary">You are the seller of this listing</p>
                    <Link to="/dashboard/seller" className="text-xs text-cyan hover:underline mt-2 inline-block">
                      Go to Dashboard
                    </Link>
                  </div>
                ) : !user ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-text-tertiary mb-3">Sign in as a buyer to place a bid</p>
                    <Link
                      to="/auth"
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan/20 to-emerald/20 border border-cyan/20 text-sm text-cyan hover:from-cyan/30 hover:to-emerald/30 transition-all"
                    >
                      Sign In
                    </Link>
                  </div>
                ) : !isActive ? (
                  <div className="text-center py-4">
                    <AlertCircle className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
                    <p className="text-sm text-text-tertiary">Auction has ended</p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-text-tertiary">Sellers cannot place bids</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
