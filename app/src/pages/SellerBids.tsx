import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatCurrency, formatKg, timeAgo } from "@/utils/formatting";
import type { Bid } from "@/lib/api";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";

export default function SellerBids() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadBids = async () => {
      if (!user) return;

      setLoading(true);
      setError("");
      try {
        const data = await api.bids.list();
        setBids(data);
      } catch (err) {
        console.error("Failed to load bids:", err);
        setError("Failed to load incoming bids.");
      } finally {
        setLoading(false);
      }
    };

    loadBids();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Spinner className="size-8" />
            <p className="ml-4 text-text-secondary">Loading incoming bids...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center text-center py-12">
          <div className="glass-card p-8 max-w-md">
            <p className="text-text-tertiary">{error}</p>
            <div className="mt-6 flex justify-center">
              <Link to="/dashboard/seller" className="text-cyan hover:underline">
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
          <h1 className="text-xl font-semibold text-text-primary">Incoming Bids ({bids.length})</h1>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {bids.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-tertiary">No incoming bids yet.</p>
              <p className="text-sm text-text-tertiary mt-2">
                Bids from buyers will appear here when they bid on your listings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {bids.map((bid) => (
                <div key={bid.bid_id} className="glass-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-text-primary">
                        {bid.waste_type || `Listing #${bid.listing_id}`}
                        {bid.quality_grade && <span className="text-text-tertiary font-normal"> Grade {bid.quality_grade}</span>}
                      </h3>
                      <p className="text-text-tertiary text-sm">
                        Buyer #{bid.buyer_id} • {formatKg(bid.quantity_kg)} @ {formatCurrency(bid.price_per_kg_taka)}/kg
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        bid.status === "MATCHED" ? "text-emerald bg-emerald/10" :
                        bid.status === "OUTBID" ? "text-amber-500 bg-amber-500/10" :
                        bid.status === "VOID" ? "text-text-tertiary bg-text-tertiary/10" :
                        "text-cyan bg-cyan/10"
                      }`}>
                        {bid.status}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-white/[0.04] pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-text-tertiary">
                        {timeAgo(bid.created_at)}
                      </p>
                      <Link
                        to={`/listings/${bid.listing_id}`}
                        className="text-xs text-cyan hover:underline"
                      >
                        View Listing
                      </Link>
                    </div>
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
