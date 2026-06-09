import { formatCurrency } from "@/utils/formatting";

interface EscrowDetailsPanelProps {
  totalValueTaka: number;
  platformFeeTaka?: number;
  sellerPayoutTaka?: number;
  escrowState: string;
}

export default function EscrowDetailsPanel({ totalValueTaka, platformFeeTaka, sellerPayoutTaka, escrowState }: EscrowDetailsPanelProps) {
  const fee = platformFeeTaka ?? Math.round(totalValueTaka * 0.01);
  const payout = sellerPayoutTaka ?? totalValueTaka - fee;

  const isHeld = escrowState !== "COMPLETED" && escrowState !== "CANCELLED" && escrowState !== "IN_DISPUTE";

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-text-primary mb-4 uppercase tracking-wide">
        Escrow Details
      </h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-tertiary">Total Amount</span>
          <span className="font-mono text-text-primary">{formatCurrency(totalValueTaka)}</span>
        </div>

        <div className="border-t border-white/[0.04] pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-tertiary">Platform Fee (1%)</span>
            <span className="font-mono text-text-tertiary">-{formatCurrency(fee)}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-text-tertiary">Seller Payout</span>
            <span className="font-mono text-emerald">{formatCurrency(payout)}</span>
          </div>
        </div>

        <div className="border-t border-white/[0.04] pt-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-tertiary">Status</span>
            <span className={`text-sm font-medium ${
              escrowState === "COMPLETED" ? "text-emerald" :
              escrowState === "IN_DISPUTE" ? "text-red-500" :
              escrowState === "CANCELLED" ? "text-text-tertiary" :
              "text-cyan"
            }`}>
              {escrowState.replace(/_/g, " ")}
            </span>
          </div>
          {isHeld && (
            <p className="text-xs text-text-tertiary mt-2">
              Funds are held securely in escrow until both parties fulfill their obligations.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
