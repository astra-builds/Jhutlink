import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatCurrency, formatKg } from "@/utils/formatting";
import type { Listing, Order } from "@/lib/api";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import SkeletonLoader from "@/components/SkeletonLoader";
import {
  BarChart3, Package, ShoppingBag, ChevronRight, AlertTriangle,
  Eye, Truck, XCircle, List,
} from "lucide-react";
import { toast } from "sonner";

export default function DashboardSeller() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const [listingsData, ordersData] = await Promise.all([
          api.listings.list({ limit: 100 }),
          api.orders.list(),
        ]);
        setListings(listingsData.listings);
        setOrders(ordersData);
      } catch (e: any) {
        toast.error("Failed to load dashboard data");
      }
      setLoading(false);
    }
    load();
  }, [user]);

  const myListings = listings.filter((l) => l.seller_id === user?.id);
  const myOrders = orders.filter((o) => o.seller_id === user?.id);
  const activeListings = myListings.filter((l) => l.status === "ACTIVE");
  const pendingShipments = myOrders.filter((o) => o.status === "CONFIRMED");
  const totalRevenue = myOrders
    .filter((o) => o.status === "COMPLETED")
    .reduce((s, o) => s + o.total_value_taka, 0);
  const soldCount = myListings.filter((l) => l.status === "SOLD").length;

  const stats = [
    { label: "Active Listings", value: String(activeListings.length), icon: List, color: "text-cyan" },
    { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: BarChart3, color: "text-emerald" },
    { label: "Pending Shipments", value: String(pendingShipments.length), icon: Truck, color: "text-amber-400" },
    { label: "Sold", value: String(soldCount), icon: Package, color: "text-blue-400" },
  ];

  async function handleClose(listingId: number) {
    try {
      const r = await api.listings.close(listingId);
      toast.success(`Listing closed — ${r.matched_bids} bid(s) matched`);
      setListings((prev) =>
        prev.map((l) => (l.listing_id === listingId ? { ...l, status: "CLOSED" } : l))
      );
    } catch (e: any) {
      toast.error(e.detail || "Failed to close listing");
    }
  }

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

  const recentListings = myListings.slice(0, 5);
  const activeOrders = myOrders.filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status)).slice(0, 5);

  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-medium text-text-primary">Seller Dashboard</h1>
            {(user as any)?.strikes > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[0.55rem] font-medium">
                <AlertTriangle className="w-3 h-3" />
                {(user as any).strikes} strike(s)
              </span>
            )}
          </div>
          <Link
            to="/dashboard/seller/listings"
            className="text-xs px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan/20 to-emerald/20 border border-cyan/20 text-cyan hover:from-cyan/30 hover:to-emerald/30 transition-all"
          >
            + New Listing
          </Link>
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

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <List className="w-4 h-4 text-cyan" />
                  <h2 className="text-sm font-medium text-text-primary">My Listings</h2>
                  {activeListings.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-cyan/10 border border-cyan/20 text-[0.55rem] text-cyan font-medium">
                      {activeListings.length} active
                    </span>
                  )}
                </div>
                <Link
                  to="/dashboard/seller/listings"
                  className="text-xs text-cyan hover:text-cyan/80 transition-colors flex items-center gap-1"
                >
                  View All <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {recentListings.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingBag className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-tertiary">You haven't created any listings yet</p>
                  <Link
                    to="/dashboard/seller/listings"
                    className="inline-flex items-center gap-1 mt-3 text-xs text-cyan hover:text-cyan/80 transition-colors"
                  >
                    Create your first listing <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentListings.map((l) => (
                    <div
                      key={l.listing_id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all border border-transparent hover:border-white/[0.08]"
                    >
                      <Link to={`/listings/${l.listing_id}`} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan/20 to-emerald/20 flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="w-4 h-4 text-cyan" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm text-text-primary truncate">{l.waste_type} — Grade {l.quality_grade}</div>
                          <div className="text-xs text-text-tertiary">{formatKg(l.quantity_kg)}</div>
                        </div>
                      </Link>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[0.55rem] font-medium uppercase tracking-wider ${
                          l.status === "ACTIVE" ? "bg-emerald/10 text-emerald border border-emerald/20" :
                          l.status === "CLOSED" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          l.status === "SOLD" ? "bg-cyan/10 text-cyan border border-cyan/20" :
                          "bg-white/10 text-text-secondary border border-white/10"
                        }`}>
                          {l.status === "ACTIVE" ? `${l.status} · ${l.remaining_kg}kg left` : l.status}
                        </span>
                        {l.status === "ACTIVE" && (
                          <button
                            onClick={() => handleClose(l.listing_id)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[0.55rem] hover:bg-amber-500/20 transition-all cursor-pointer"
                          >
                            Close
                          </button>
                        )}
                        {(l.status === "CLOSED" || l.status === "SOLD") && (
                          <Link
                            to={`/listings/${l.listing_id}`}
                            className="flex items-center gap-0.5 px-2.5 py-1 rounded-lg bg-cyan/10 border border-cyan/20 text-cyan text-[0.55rem] hover:bg-cyan/20 transition-all"
                          >
                            <Eye className="w-3 h-3" /> Results
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-medium text-text-primary">Active Orders</h2>
                  </div>
                  <Link
                    to="/dashboard/seller/orders"
                    className="text-xs text-cyan hover:text-cyan/80 transition-colors flex items-center gap-1"
                  >
                    View All <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                {activeOrders.length === 0 ? (
                  <div className="text-center py-6">
                    <Package className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                    <p className="text-sm text-text-tertiary">No active orders</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeOrders.map((o) => (
                      <Link
                        key={o.order_id}
                        to={`/orders/${o.order_id}`}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all border border-transparent hover:border-white/[0.08] cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-amber-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm text-text-primary">Order #{o.order_id}</div>
                            <div className="text-xs text-text-tertiary">
                              Buyer #{o.buyer_id} · {formatKg(o.quantity_kg)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[0.55rem] font-medium uppercase tracking-wider ${
                            o.status === "PAYMENT_PENDING" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            o.status === "CONFIRMED" ? "bg-cyan/10 text-cyan border border-cyan/20" :
                            o.status === "IN_TRANSIT" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                            "bg-white/10 text-text-secondary border border-white/10"
                          }`}>
                            {o.status === "CONFIRMED" ? "Ship" : o.status.replace("_", " ")}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-emerald" />
                  <h2 className="text-sm font-medium text-text-primary">Quick Stats</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-xs text-text-tertiary mb-1">Total Orders</div>
                    <div className="text-lg font-semibold font-mono text-text-primary">{myOrders.length}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-xs text-text-tertiary mb-1">Revenue</div>
                    <div className="text-lg font-semibold font-mono text-emerald">{formatCurrency(totalRevenue)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-xs text-text-tertiary mb-1">Active Listings</div>
                    <div className="text-lg font-semibold font-mono text-cyan">{activeListings.length}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-xs text-text-tertiary mb-1">Sold This Month</div>
                    <div className="text-lg font-semibold font-mono text-blue-400">{soldCount}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
