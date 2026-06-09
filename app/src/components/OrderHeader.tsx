import { formatCurrency } from "@/utils/formatting";

interface OrderHeaderProps {
  orderId: number;
  status: string;
  escrowState: string;
  createdAt: string;
  updatedAt?: string;
  userRole: "buyer" | "seller" | undefined;
  totalValueTaka: number;
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  PAYMENT_PENDING: { label: "Awaiting Payment", classes: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  CONFIRMED: { label: "Payment Confirmed", classes: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  IN_TRANSIT: { label: "In Transit", classes: "text-cyan bg-cyan/10 border-cyan/20" },
  DELIVERED: { label: "Delivered", classes: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  COMPLETED: { label: "Completed", classes: "text-emerald bg-emerald/10 border-emerald/20" },
  DISPUTED: { label: "Disputed", classes: "text-red-500 bg-red-500/10 border-red-500/20" },
  CANCELLED: { label: "Cancelled", classes: "text-text-tertiary bg-text-tertiary/10 border-text-tertiary/20" },
};

export default function OrderHeader({ orderId, status, escrowState, createdAt, updatedAt, userRole, totalValueTaka }: OrderHeaderProps) {
  const config = statusConfig[status] || { label: status, classes: "text-text-secondary bg-text-secondary/10 border-text-secondary/20" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Order #{orderId}
          </h1>
          <p className="text-sm text-text-tertiary mt-1">
            Created {new Date(createdAt).toLocaleDateString("en-BD", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {updatedAt && ` · Updated ${new Date(updatedAt).toLocaleDateString("en-BD", { year: "numeric", month: "long", day: "numeric" })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${config.classes}`}>
            {config.label}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
            userRole === "buyer" ? "text-cyan bg-cyan/10 border-cyan/20" : "text-emerald bg-emerald/10 border-emerald/20"
          }`}>
            {userRole === "buyer" ? "Buyer" : "Seller"}
          </span>
        </div>
      </div>
      <div className="text-lg font-mono text-text-primary">
        Total: {formatCurrency(totalValueTaka)}
      </div>
    </div>
  );
}
