import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatCurrency, formatKg } from "@/utils/formatting";
import type { Listing } from "@/lib/api";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";

export default function BuyerWatchlist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWatchlist = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const watchlistIds: number[] = (user as any).watchlist || [];
        if (watchlistIds.length === 0) { setListings([]); return; }
        const res = await api.listings.list();
        const watchlisted = res.listings.filter(l => watchlistIds.includes(l.listing_id));
        setListings(watchlisted);
      } catch { setListings([]); }
      finally { setLoading(false); }
    };
    loadWatchlist();
  }, [user]);

  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
          <h1 className="text-xl font-semibold text-text-primary">Watchlist</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner className="size-6" /></div>
          ) : listings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-tertiary">Your watchlist is empty.</p>
              <p className="text-sm text-text-tertiary mb-4">Save listings to track them here.</p>
              <Link to="/marketplace" className="btn-primary bg-cyan text-void">
                Browse Listings
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {listings.map(l => (
                <div key={l.listing_id} className="glass-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-text-primary">{l.waste_type} <span className="text-text-tertiary font-normal">Grade {l.quality_grade}</span></h3>
                      <p className="text-text-tertiary text-sm">{formatKg(l.quantity_kg)} • {l.location_district}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      l.status === "ACTIVE" ? "text-cyan bg-cyan/10" : "text-text-tertiary bg-text-tertiary/10"
                    }`}>{l.status}</span>
                  </div>
                  <div className="border-t border-white/[0.04] pt-3 mt-3 flex items-center justify-between">
                    <span className="text-xs text-text-tertiary">Reserve: {formatCurrency(l.reserve_price_taka)}/kg</span>
                    <Link to={`/listings/${l.listing_id}`} className="text-xs text-cyan hover:underline">
                      View & Bid
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
