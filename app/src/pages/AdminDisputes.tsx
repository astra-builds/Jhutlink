import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import type { AdminDispute } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AdminSidebar } from "@/components/AdminSidebar";

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<number | null>(null);

  useEffect(() => {
    loadDisputes();
  }, []);

  const loadDisputes = async () => {
    setLoading(true);
    try {
      const data = await api.admin.listDisputes();
      setDisputes(data);
    } catch { setDisputes([]); }
    finally { setLoading(false); }
  };

  const handleResolve = async (orderId: number, ruling: string) => {
    setResolving(orderId);
    try {
      await api.admin.resolveDispute(orderId, ruling);
      toast.success(`Dispute resolved: ${ruling}`);
      loadDisputes();
    } catch (err: any) { toast.error(err.detail || "Failed to resolve."); }
    finally { setResolving(null); }
  };

  return (
    <div className="flex h-[100dvh] bg-void">
      <AdminSidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
          <h1 className="text-xl font-semibold text-text-primary">Disputed Orders</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner className="size-6" /></div>
          ) : disputes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-tertiary">No disputed orders.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {disputes.map(d => (
                <div key={d.order_id} className="glass-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-text-primary">Order #{d.order_id}</h3>
                      <p className="text-xs text-text-tertiary">
                        Listing #{d.listing_id} • Buyer #{d.buyer_id} • Seller #{d.seller_id} • {d.quantity_kg} kg
                      </p>
                      <p className="text-xs text-text-tertiary">
                        Value: ৳{d.total_value_taka.toLocaleString()} • Escrow: {d.escrow_state || "N/A"}
                      </p>
                    </div>
                    <Link to={`/orders/${d.order_id}`} className="text-xs text-cyan hover:underline">
                      View Order
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 pt-3 border-t border-white/[0.04]">
                    <span className="text-xs text-text-tertiary">Resolve as:</span>
                    <button
                      onClick={() => handleResolve(d.order_id, "refund")}
                      disabled={resolving === d.order_id}
                      className="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full border-none cursor-pointer disabled:opacity-50"
                    >
                      {resolving === d.order_id ? <Spinner className="size-3" /> : "Refund Buyer"}
                    </button>
                    <button
                      onClick={() => handleResolve(d.order_id, "release")}
                      disabled={resolving === d.order_id}
                      className="text-xs bg-emerald/20 text-emerald px-3 py-1 rounded-full border-none cursor-pointer disabled:opacity-50"
                    >
                      Release to Seller
                    </button>
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
