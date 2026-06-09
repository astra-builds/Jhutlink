import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api, type OrderDetail, type Listing } from "@/lib/api";
import { formatCurrency, formatKg } from "@/utils/formatting";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import OrderHeader from "@/components/OrderHeader";
import EscrowTimeline from "@/components/EscrowTimeline";
import EscrowDetailsPanel from "@/components/EscrowDetailsPanel";
import OrderParticipants from "@/components/OrderParticipants";
import OrderActions from "@/components/OrderActions";
import PaymentModal from "@/components/PaymentModal";
import DisputeModal from "@/components/DisputeModal";

export default function OrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [paymentStep, setPaymentStep] = useState<"idle" | "confirming" | "success" | "error">("idle");
  const [transactionId, setTransactionId] = useState("");

  useEffect(() => {
    const loadData = async () => {
      if (!id || !user) return;

      setLoading(true);
      setError("");
      try {
        const orderData = await api.orders.get(parseInt(id, 10));
        setOrder(orderData);

        const listingData = orderData.listing_id
          ? await api.listings.get(orderData.listing_id).catch(() => null)
          : null;
        setListing(listingData);
      } catch (err) {
        console.error("Failed to load order:", err);
        if (err.status === 404) {
          setError("Order not found.");
        } else {
          setError("Failed to load order details. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, user]);

  // Auto-open payment modal when navigated from "Pay Escrow" button
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "pay") {
        setShowPayment(true);
        // Clean the URL so refresh doesn't re-trigger
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const handleAction = useCallback(async (action: string, ...args: any[]) => {
    if (!order) return;
    setActionLoading(true);
    try {
      switch (action) {
        case "pay": {
          setPaymentStep("confirming");
          const confirmRes = await api.orders.confirm(order.order_id, args[0]);
          setTransactionId(confirmRes.transaction_id || "");
          setPaymentStep("success");
          break;
        }
        case "ship":
          await api.orders.ship(order.order_id);
          break;
        case "deliver":
          await api.orders.deliver(order.order_id);
          break;
        case "complete":
          await api.orders.complete(order.order_id);
          break;
        case "dispute":
          await api.orders.dispute(order.order_id, args[0]);
          break;
        case "cancel":
          if (!window.confirm("Are you sure you want to cancel this order? This may refund the buyer if payment was already made.")) {
            setActionLoading(false);
            return;
          }
          await api.orders.cancel(order.order_id);
          break;
      }

      if (action !== "pay") {
        toast.success("Action completed successfully!");
      }
      const updated = await api.orders.get(order.order_id);
      setOrder(updated);
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
      if (action === "pay") {
        setPaymentStep("error");
      } else {
        toast.error(err.detail || `Failed to ${action}. Please try again.`);
      }
    } finally {
      setActionLoading(false);
      if (action !== "pay") {
        setShowPayment(false);
      }
      setShowDispute(false);
    }
  }, [order]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-void">
        <div className="text-center">
          <Spinner className="size-8" />
          <p className="ml-4 text-text-secondary mt-4">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-void">
        <div className="glass-card p-8 max-w-md text-center">
          <p className="text-text-tertiary">{error || "Order not found."}</p>
          <div className="mt-6 flex justify-center gap-4">
            <Link to="/" className="text-cyan hover:underline">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isBuyer = user?.role === "buyer";

  const buyerParticipant = {
    id: order.buyer_id,
    name: isBuyer ? user?.name : undefined,
    role: "buyer",
    rating: isBuyer ? user?.rating : undefined,
  };

  const sellerParticipant = {
    id: order.seller_id,
    name: !isBuyer ? user?.name : undefined,
    role: "seller",
    rating: !isBuyer ? user?.rating : undefined,
    listingCount: !isBuyer ? user?.listing_count : undefined,
    tradeLicense: !isBuyer ? user?.trade_license : undefined,
  };

  return (
    <div className="min-h-[100dvh] bg-void">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link to={isBuyer ? "/dashboard/buyer/orders" : "/dashboard/seller/orders"} className="text-sm text-cyan hover:underline mb-4 inline-block">
          ← Back to Orders
        </Link>

        <div className="flex flex-col lg:flex-row gap-6 mt-2">
          <div className="flex-1 space-y-6">
            <OrderHeader
              orderId={order.order_id}
              status={order.status}
              escrowState={order.escrow_state}
              createdAt={order.created_at}
              updatedAt={order.updated_at}
              userRole={user?.role}
              totalValueTaka={order.total_value_taka}
            />

            {listing && (
              <div className="glass-card p-5">
                <h3 className="text-sm font-medium text-text-primary mb-4 uppercase tracking-wide">
                  Item Details
                </h3>
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-lg bg-surface-highlight flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {listing.photos && listing.photos[0] ? (
                      <img src={listing.photos[0]} alt={listing.waste_type} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-text-tertiary text-xs">No Image</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h4 className="font-medium text-text-primary">{listing.waste_type}</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <p className="text-text-tertiary">
                        Grade: <span className="text-text-primary">{listing.quality_grade}</span>
                      </p>
                      <p className="text-text-tertiary">
                        Quantity: <span className="text-text-primary">{formatKg(order.quantity_kg)}</span>
                      </p>
                      <p className="text-text-tertiary">
                        Price: <span className="text-text-primary">{formatCurrency(order.price_per_kg_taka)}/kg</span>
                      </p>
                      <p className="text-text-tertiary">
                        Location: <span className="text-text-primary">{listing.location_district}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <OrderParticipants
              buyer={buyerParticipant}
              seller={sellerParticipant}
            />

            <EscrowDetailsPanel
              totalValueTaka={order.total_value_taka}
              platformFeeTaka={order.platform_fee_taka}
              sellerPayoutTaka={order.seller_payout_taka}
              escrowState={order.escrow_state}
            />

            <OrderActions
              orderId={order.order_id}
              status={order.status}
              escrowState={order.escrow_state}
              userRole={user?.role}
              loading={actionLoading}
              onPayEscrow={() => setShowPayment(true)}
              onMarkShipped={() => handleAction("ship")}
              onConfirmDelivery={() => handleAction("deliver")}
              onReleaseFunds={() => handleAction("complete")}
              onOpenDispute={() => setShowDispute(true)}
              onCancelOrder={() => handleAction("cancel")}
            />

            {order.reason && (
              <div className="glass-card p-5">
                <h3 className="text-sm font-medium text-red-500 mb-2 uppercase tracking-wide">
                  Dispute Reason
                </h3>
                <p className="text-sm text-text-secondary">{order.reason}</p>
                <p className="text-xs text-text-tertiary mt-2">
                  Under review by Jhutlink team. Resolution typically within 72 hours.
                </p>
              </div>
            )}
          </div>

          <div className="w-full lg:w-80 flex-shrink-0">
            <EscrowTimeline
              escrowState={order.escrow_state}
              status={order.status}
              history={order.history}
            />
          </div>
        </div>
      </div>

      <PaymentModal
        open={showPayment}
        onClose={() => { setShowPayment(false); setPaymentStep("idle"); setTransactionId(""); }}
        onConfirm={(amountPaisa) => handleAction("pay", amountPaisa)}
        totalValueTaka={order.total_value_taka}
        loading={actionLoading}
        paymentStep={paymentStep}
        transactionId={transactionId}
      />

      <DisputeModal
        open={showDispute}
        onClose={() => setShowDispute(false)}
        onSubmit={(reason) => handleAction("dispute", reason)}
        loading={actionLoading}
      />
    </div>
  );
}
