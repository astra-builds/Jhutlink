import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Order } from "@/lib/api";
import { formatCurrency, formatKg } from "@/utils/formatting";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";

export default function SellerOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadOrders = async () => {
      if (!user) return;

      setLoading(true);
      setError("");
      try {
        const res = await api.orders.list();
        const sellerOrders = res.filter(order => order.seller_id === user.id);
        sellerOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setOrders(sellerOrders);
      } catch (err) {
        console.error("Failed to load orders:", err);
        setError("Failed to load orders. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Spinner className="size-8" />
            <p className="ml-4 text-text-secondary">Loading orders...</p>
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

  const statusStyle = (status: string) => {
    switch (status) {
      case "PAYMENT_PENDING": return "text-amber-500 bg-amber-500/10";
      case "CONFIRMED": return "text-blue-500 bg-blue-500/10";
      case "IN_TRANSIT": return "text-cyan bg-cyan/10";
      case "DELIVERED": return "text-emerald bg-emerald/10";
      case "COMPLETED": return "text-emerald bg-emerald/10";
      case "DISPUTED": return "text-red-500 bg-red-500/10";
      case "CANCELLED": return "text-text-tertiary bg-text-tertiary/10";
      default: return "text-text-secondary bg-text-secondary/10";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "PAYMENT_PENDING": return "Awaiting Payment";
      case "CONFIRMED": return "Payment Confirmed";
      case "IN_TRANSIT": return "In Transit";
      case "DELIVERED": return "Delivered";
      case "COMPLETED": return "Completed";
      case "DISPUTED": return "Disputed";
      case "CANCELLED": return "Cancelled";
      default: return status;
    }
  };

  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
          <h1 className="text-xl font-semibold text-text-primary">Orders</h1>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-tertiary">No orders yet.</p>
              <p className="text-sm text-text-tertiary mt-2">
                When buyers purchase your listings, orders will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.order_id} className="glass-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-text-primary">
                        Order #{order.order_id}
                      </h3>
                      <p className="text-text-tertiary text-sm">
                        Listing #{order.listing_id} • {formatKg(order.quantity_kg)} • {formatCurrency(order.total_value_taka)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle(order.status)}`}>
                        {statusLabel(order.status)}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-white/[0.04] pt-3 mt-3">
                    <div className="grid grid-cols-2 gap-4">
                      <p className="text-xs text-text-tertiary">
                        Buyer: <span className="font-medium">#{order.buyer_id}</span>
                      </p>
                      <p className="text-xs text-text-tertiary">
                        Created: {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => navigate(`/orders/${order.order_id}`)}
                        className="text-xs text-cyan hover:underline"
                      >
                        View Details
                      </button>
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
