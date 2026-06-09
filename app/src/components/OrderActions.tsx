interface OrderActionsProps {
  orderId: number;
  status: string;
  escrowState: string;
  userRole: "buyer" | "seller" | undefined;
  loading?: boolean;
  onPayEscrow: () => void;
  onMarkShipped: () => void;
  onConfirmDelivery: () => void;
  onReleaseFunds: () => void;
  onOpenDispute: () => void;
  onCancelOrder: () => void;
}

export default function OrderActions({
  orderId,
  status,
  escrowState,
  userRole,
  loading,
  onPayEscrow,
  onMarkShipped,
  onConfirmDelivery,
  onReleaseFunds,
  onOpenDispute,
  onCancelOrder,
}: OrderActionsProps) {
  const isBuyer = userRole === "buyer";
  const isSeller = userRole === "seller";

  const renderActions = () => {
    if (status === "COMPLETED" || status === "CANCELLED" || status === "DISPUTED") {
      return null;
    }

    if (isBuyer) {
      switch (escrowState) {
        case "AWAITING_PAYMENT":
          return (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onPayEscrow}
                disabled={loading}
                className="btn-primary bg-emerald text-void px-6 py-3 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Pay Escrow"}
              </button>
              <button
                onClick={onCancelOrder}
                disabled={loading}
                className="btn-primary bg-transparent border border-white/12 text-text-primary px-6 py-3 hover:border-red-500/40 hover:text-red-500"
              >
                Cancel Order
              </button>
            </div>
          );
        case "FUNDS_HELD":
        case "SELLER_PREPARING":
          return (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-text-tertiary">
                Waiting for the seller to prepare and ship your order.
              </div>
              <button
                onClick={onCancelOrder}
                disabled={loading}
                className="btn-primary bg-transparent border border-white/12 text-text-primary px-6 py-3 hover:border-red-500/40 hover:text-red-500"
              >
                Cancel Order (Refund)
              </button>
            </div>
          );
        case "IN_TRANSIT":
          return (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onConfirmDelivery}
                disabled={loading}
                className="btn-primary bg-emerald text-void px-6 py-3 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Confirm Receipt"}
              </button>
              <button
                onClick={onOpenDispute}
                disabled={loading}
                className="btn-primary bg-transparent border border-white/12 text-text-primary px-6 py-3 hover:border-red-500/40 hover:text-red-500"
              >
                Open Dispute
              </button>
            </div>
          );
        case "DELIVERED_PENDING":
          return (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onReleaseFunds}
                disabled={loading}
                className="btn-primary bg-emerald text-void px-6 py-3 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Release Funds"}
              </button>
              <button
                onClick={onOpenDispute}
                disabled={loading}
                className="btn-primary bg-transparent border border-white/12 text-text-primary px-6 py-3 hover:border-red-500/40 hover:text-red-500"
              >
                Open Dispute
              </button>
            </div>
          );
        case "CONFIRMED":
          return (
            <button
              onClick={onReleaseFunds}
              disabled={loading}
              className="btn-primary bg-emerald text-void px-6 py-3 disabled:opacity-50"
            >
              {loading ? "Processing..." : "Release Funds"}
            </button>
          );
      }
    }

    if (isSeller) {
      switch (escrowState) {
        case "AWAITING_PAYMENT":
          return (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-text-tertiary">
                Waiting for the buyer to make payment.
              </div>
              <button
                onClick={onCancelOrder}
                disabled={loading}
                className="btn-primary bg-transparent border border-white/12 text-text-primary px-6 py-3 hover:border-red-500/40 hover:text-red-500"
              >
                Cancel Order
              </button>
            </div>
          );
        case "FUNDS_HELD":
        case "SELLER_PREPARING":
          return (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onMarkShipped}
                disabled={loading}
                className="btn-primary bg-cyan text-void px-6 py-3 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Mark as Shipped"}
              </button>
              <button
                onClick={onCancelOrder}
                disabled={loading}
                className="btn-primary bg-transparent border border-white/12 text-text-primary px-6 py-3 hover:border-red-500/40 hover:text-red-500"
              >
                Cancel Order (Refund)
              </button>
            </div>
          );
        case "IN_TRANSIT":
        case "DELIVERED_PENDING":
          return (
            <div className="text-sm text-text-tertiary">
              Waiting for the buyer to confirm delivery.
            </div>
          );
        case "CONFIRMED":
          return (
            <div className="text-sm text-text-tertiary">
              Funds have been released. Check your payout below.
            </div>
          );
      }
    }

    return null;
  };

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-text-primary mb-4 uppercase tracking-wide">
        Actions
      </h3>
      {renderActions()}
      {status !== "COMPLETED" && status !== "CANCELLED" && status !== "DISPUTED" && renderActions() === null && (
        <p className="text-sm text-text-tertiary">No actions available at this time.</p>
      )}
      {status === "DISPUTED" && (
        <div className="text-sm text-red-500">
          This order is under dispute. Awaiting resolution.
        </div>
      )}
      {status === "COMPLETED" && (
        <div className="text-sm text-emerald">
          Transaction completed successfully.
        </div>
      )}
      {status === "CANCELLED" && (
        <div className="text-sm text-text-tertiary">
          This order has been cancelled.
        </div>
      )}
    </div>
  );
}
