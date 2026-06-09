import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Order } from "@/lib/api";
import { formatCurrency, formatKg } from "@/utils/formatting";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

export default function BuyerOrders() {
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
        // Filter to only buyer's orders
        const buyerOrders = res.filter(order => order.buyer_id === user.id);
        setOrders(buyerOrders);
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

  if (error && !loading) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex items-center justify-center text-center py-12">
          <div className="glass-card p-8 max-w-md">
            <p className="text-text-tertiary">{error}</p>
            <div className="mt-6 flex justify-center">
              <Link to="/dashboard/buyer" className="text-cyan hover:underline">
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex h-[100dvh] bg-void">
        <DashboardSidebar />
        <main className="flex-1 flex flex-col">
          <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
            <h1 className="text-xl font-semibold text-text-primary">My Orders</h1>
          </div>
          <div className="flex-1 p-6">
            <div className="text-center py-12">
              <p className="text-text-tertiary">You don't have any orders yet.</p>
              <p className="text-sm text-text-tertiary mb-4">
                When you win auctions and complete purchases, they will appear here.
              </p>
              <div className="flex justify-center">
                <Link
                  to="/marketplace"
                  className="btn-primary bg-cyan text-void"
                >
                  Browse Listings
                </Link>
              </div>
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
          <h1 className="text-xl font-semibold text-text-primary">My Orders</h1>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-4">
            {orders.map((order) => {
              // Determine status color and text
              let statusClass = "text-text-secondary";
              let statusLabel = order.status;
              
              switch (order.status) {
                case "PAYMENT_PENDING":
                  statusClass = "text-amber-500";
                  statusLabel = "Awaiting Payment";
                  break;
                case "CONFIRMED":
                  statusClass = "text-blue-500";
                  statusLabel = "Payment Confirmed";
                  break;
                case "IN_TRANSIT":
                  statusClass = "text-cyan-500";
                  statusLabel = "In Transit";
                  break;
                case "DELIVERED":
                  statusClass = "text-amber-500";
                  statusLabel = "Delivered";
                  break;
                case "COMPLETED":
                  statusClass = "text-emerald-500";
                  statusLabel = "Completed";
                  break;
                case "DISPUTED":
                  statusClass = "text-red-500";
                  statusLabel = "In Dispute";
                  break;
                case "CANCELLED":
                  statusClass = "text-gray-500";
                  statusLabel = "Cancelled";
                  break;
              }
              
              return (
                <div key={order.order_id} className="glass-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-text-primary">
                        Order #{order.order_id}
                      </h3>
                      <p className="text-text-tertiary">
                        Listing #{order.listing_id} • {formatKg(order.quantity_kg)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-white/[0.04] pt-3 mt-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-text-tertiary">
                          Price/kg: <span className="font-mono">{formatCurrency(order.price_per_kg_taka)}</span>
                        </p>
                        <p className="text-xs text-text-tertiary">
                          Total: <span className="font-mono">{formatCurrency(order.total_value_taka)}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-tertiary">
                          Created: <span className="text-sm">{new Date(order.created_at).toLocaleDateString()}</span>
                        </p>
                        <p className="text-xs text-text-tertiary">
                          Updated: <span className="text-sm">{new Date(order.updated_at).toLocaleDateString()}</span>
                        </p>
                      </div>
                    </div>
                    
                    {/* Action buttons based on status */}
                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                      {order.status === "PAYMENT_PENDING" && (
                        <button
                          onClick={() => {
                            navigate(`/orders/${order.order_id}?action=pay`);
                          }}
                          className="btn-primary bg-emerald text-void px-4 py-2 hover:bg-emerald/80"
                        >
                          Pay Escrow
                        </button>
                      )}
                      {order.status === "CONFIRMED" && (
                        <button
                          onClick={() => {
                            navigate(`/orders/${order.order_id}`);
                          }}
                          className="btn-primary bg-cyan text-void px-4 py-2 hover:bg-cyan/80"
                        >
                          Mark as Shipped
                        </button>
                      )}
                      {order.status === "IN_TRANSIT" && (
                        <button
                          onClick={() => {
                            navigate(`/orders/${order.order_id}`);
                          }}
                          className="btn-primary bg-amber-500 text-void px-4 py-2 hover:bg-amber-500/80"
                        >
                          Confirm Delivery
                        </button>
                      )}
                      {order.status === "DELIVERED" && (
                        <>
                          <button
                            onClick={() => {
                              navigate(`/orders/${order.order_id}`);
                            }}
                            className="btn-primary bg-emerald text-void px-4 py-2 mr-2 hover:bg-emerald/80"
                          >
                            Release Funds
                          </button>
                          <button
                            onClick={() => {
                              navigate(`/orders/${order.order_id}`);
                            }}
                            className="btn-primary bg-transparent border border-white/12 text-text-primary px-4 py-2 hover:border-cyan/40 hover:text-cyan"
                          >
                            Open Dispute
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}