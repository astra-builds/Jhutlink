import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatCurrency, formatKg, auctionCountdown, timeAgo } from "@/utils/formatting";
import type { Order, Bid } from "@/lib/api";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import SkeletonLoader from "@/components/SkeletonLoader";
import { Spinner } from "@/components/ui/spinner";
import {
  TrendingUp, Clock, Package, ShoppingBag, ChevronRight,
  Eye, Star, AlertCircle, Gavel,
} from "lucide-react";
import { toast } from "sonner";

export default function DashboardBuyer() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<Bid[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [watchlistListings, setWatchlistListings] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const [bidsData, ordersData] = await Promise.all([
          api.bids.list(),
          api.orders.list(),
        ]);
        setBids(bidsData);
        setOrders(ordersData);
        const wl = await api.listings.list({ limit: 100 });
        setWatchlistListings(wl.listings);
      } catch (e: any) {
        toast.error("Failed to load dashboard data");
      }
      setLoading(false);
    }
    load();
  }, [user]);

  const userOrders = orders.filter((o) => o.buyer_id === user?.id);
  const pendingOrders = userOrders.filter((o) =>
    ["PAYMENT_PENDING", "CONFIRMED"].includes(o.status)
  );
  const activeBids = bids.filter((b) => b.status === "PENDING" && b.buyer_id === user?.id);
  const totalSpent = userOrders
    .filter((o) => o.status === "COMPLETED")
    .reduce((s, o) => s + o.total_value_taka, 0);

  const stats = [
    { label: "Total Spent", value: formatCurrency(totalSpent), icon: TrendingUp, color: "text-cyan" },
    { label: "Active Bids", value: String(activeBids.length), icon: Gavel, color: "text-emerald" },
    { label: "Pending Orders", value: String(pendingOrders.length), icon: Clock, color: "text-amber-400" },
    { label: "Total Orders", value: String(userOrders.length), icon: ShoppingBag, color: "text-blue-400" },
  ];

  if (loading) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex flex-col">
          <div className="h-16 border-b border-white/[0.06] flex items-center px-6">
            <div className="h-5 bg-white/5 rounded w-40" />
          </div>
          <div className="flex-1 p-6 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <SkeletonLoader key={i} variant="stats" />)}
            </div>
            <SkeletonLoader variant="card" />
            <SkeletonLoader variant="card" />
          </div>
        </main>
      </div>
    );
  }

  const topActiveBids = activeBids.slice(0, 5);
  const recentOrders = userOrders.slice(0, 5);

  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-lg font-medium text-text-primary">Buyer Dashboard</h1>
          <p className="text-xs text-text-tertiary">
            {new Date().toLocaleDateString("en-BD", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-[0.6rem] uppercase tracking-widest text-text-tertiary">{s.label}</span>
                </div>
                <span className={`text-lg font-semibold font-mono ${s.color}`}>{s.value}</span>
              </div>
            ))}
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gavel className="w-4 h-4 text-cyan" />
                <h2 className="text-sm font-medium text-text-primary">My Active Bids</h2>
                {activeBids.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-cyan/10 border border-cyan/20 text-[0.55rem] text-cyan font-medium">
                    {activeBids.length}
                  </span>
                )}
              </div>
              <Link
                to="/dashboard/buyer/bids"
                className="text-xs text-cyan hover:text-cyan/80 transition-colors flex items-center gap-1"
              >
                View All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {topActiveBids.length === 0 ? (
              <div className="text-center py-8">
                <Gavel className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                <p className="text-sm text-text-tertiary">No active bids yet</p>
                <Link
                  to="/marketplace"
                  className="inline-flex items-center gap-1 mt-3 text-xs text-cyan hover:text-cyan/80 transition-colors"
                >
                  Browse listings <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {topActiveBids.map((bid) => (
                  <Link
                    key={bid.bid_id}
                    to={`/listings/${bid.listing_id}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all border border-transparent hover:border-white/[0.08] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan/20 to-emerald/20 flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="w-4 h-4 text-cyan" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary truncate">
                          {(bid as any).waste_type || `Listing #${bid.listing_id}`}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-tertiary">
                          <span>{formatKg(bid.quantity_kg)}</span>
                          <span>@ {formatCurrency(bid.price_per_kg_taka)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-text-tertiary font-mono">
                        {timeAgo(bid.created_at)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-cyan/10 border border-cyan/20 text-[0.55rem] text-cyan font-medium uppercase tracking-wider">
                        Leading
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-medium text-text-primary">My Watchlist</h2>
              </div>
              <Link
                to="/dashboard/buyer/watchlist"
                className="text-xs text-cyan hover:text-cyan/80 transition-colors flex items-center gap-1"
              >
                View All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {watchlistListings.slice(0, 4).map((l: any) => (
                <Link
                  key={l.listing_id}
                  to={`/listings/${l.listing_id}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all border border-transparent hover:border-white/[0.08] cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Star className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary truncate">{l.waste_type} — Grade {l.quality_grade}</div>
                      <div className="text-xs text-text-tertiary">{l.location_district}</div>
                    </div>
                  </div>
                  <div className="text-xs text-cyan font-mono flex-shrink-0">
                    {l.auction_end_time ? auctionCountdown(l.auction_end_time) : "No deadline"}
                  </div>
                </Link>
              ))}
              {watchlistListings.length === 0 && (
                <div className="text-center py-6">
                  <Star className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-tertiary">No watchlisted listings</p>
                  <Link
                    to="/marketplace"
                    className="inline-flex items-center gap-1 mt-3 text-xs text-cyan hover:text-cyan/80 transition-colors"
                  >
                    Browse listings <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-medium text-text-primary">Recent Orders</h2>
              </div>
              <Link
                to="/dashboard/buyer/orders"
                className="text-xs text-cyan hover:text-cyan/80 transition-colors flex items-center gap-1"
              >
                View All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <div className="text-center py-6">
                <Package className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                <p className="text-sm text-text-tertiary">No orders yet. Start bidding on listings!</p>
                <Link
                  to="/marketplace"
                  className="inline-flex items-center gap-1 mt-3 text-xs text-cyan hover:text-cyan/80 transition-colors"
                >
                  Browse listings <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((o) => (
                  <Link
                    key={o.order_id}
                    to={`/orders/${o.order_id}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all border border-transparent hover:border-white/[0.08] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary">Order #{o.order_id}</div>
                        <div className="text-xs text-text-tertiary">
                          {formatKg(o.quantity_kg)} · {formatCurrency(o.total_value_taka)} total
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-[0.55rem] font-medium uppercase tracking-wider ${
                        o.status === "PAYMENT_PENDING" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                        o.status === "CONFIRMED" ? "bg-cyan/10 text-cyan border border-cyan/20" :
                        o.status === "IN_TRANSIT" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                        o.status === "COMPLETED" ? "bg-emerald/10 text-emerald border border-emerald/20" :
                        "bg-white/10 text-text-secondary border border-white/10"
                      }`}>
                        {o.status === "PAYMENT_PENDING" ? "Pay now" :
                         o.status === "IN_TRANSIT" ? "Track" :
                         o.status.replace("_", " ")}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
