interface StateDef {
  key: string;
  label: string;
  icon: string;
}

const STATES: StateDef[] = [
  { key: "AWAITING_PAYMENT", label: "Awaiting Payment", icon: "🔒" },
  { key: "FUNDS_HELD", label: "Funds Held", icon: "⏳" },
  { key: "SELLER_PREPARING", label: "Seller Preparing", icon: "🔧" },
  { key: "IN_TRANSIT", label: "In Transit", icon: "🚚" },
  { key: "DELIVERED_PENDING", label: "Delivered (Pending)", icon: "📦" },
  { key: "CONFIRMED", label: "Confirmed", icon: "✅" },
  { key: "COMPLETED", label: "Completed", icon: "🎉" },
];

const TERMINAL_STATES: Record<string, StateDef> = {
  IN_DISPUTE: { key: "IN_DISPUTE", label: "In Dispute", icon: "⚖️" },
  CANCELLED: { key: "CANCELLED", label: "Cancelled", icon: "↩️" },
};

interface EscrowTimelineProps {
  escrowState: string;
  status: string;
  history?: Array<{ timestamp: string; event: string; from_state?: string; to_state?: string }>;
}

export default function EscrowTimeline({ escrowState, status, history }: EscrowTimelineProps) {
  const stateIndex = STATES.findIndex(s => s.key === escrowState);
  const isTerminal = escrowState in TERMINAL_STATES;
  const isDisputed = escrowState === "IN_DISPUTE" || status === "DISPUTED";
  const isCancelled = escrowState === "CANCELLED" || status === "CANCELLED";

  return (
    <div className="glass-card p-5 sticky top-6">
      <h3 className="text-sm font-medium text-text-primary mb-5 uppercase tracking-wide">
        Escrow Progress
      </h3>

      <div className="relative">
        {STATES.map((state, idx) => {
          const isPast = stateIndex >= idx && !isDisputed && !isCancelled;
          const isCurrent = stateIndex === idx && !isDisputed && !isCancelled;

          return (
            <div key={state.key} className="flex items-start gap-3 pb-6 last:pb-0 relative">
              {idx < STATES.length - 1 && (
                <div className={`absolute left-[11px] top-6 w-0.5 h-full -z-0 ${
                  isPast ? "bg-cyan" : "bg-white/[0.06]"
                }`} />
              )}
              <div className={`z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${
                isCurrent ? "bg-cyan text-void ring-2 ring-cyan/30" :
                isPast ? "bg-cyan/20 text-cyan" :
                "bg-white/[0.04] text-text-tertiary"
              }`}>
                {isPast && !isCurrent ? "✓" : isCurrent ? "●" : idx + 1}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className={`text-sm ${isCurrent ? "text-text-primary font-medium" : isPast ? "text-text-secondary" : "text-text-tertiary"}`}>
                  {state.label}
                </p>
                {history && (() => {
                  const entry = history.find(h => h.to_state === state.key);
                  if (!entry) return null;
                  return (
                    <p className="text-[0.65rem] text-text-tertiary mt-0.5">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  );
                })()}
              </div>
            </div>
          );
        })}

        {(isDisputed || isCancelled) && (
          <div className="flex items-start gap-3 pt-2 relative">
            <div className={`z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${
              isDisputed ? "bg-red-500/20 text-red-500 ring-2 ring-red-500/30" :
              "bg-text-tertiary/20 text-text-tertiary"
            }`}>
              {isDisputed ? "⚖" : "↩"}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className={`text-sm font-medium ${isDisputed ? "text-red-500" : "text-text-tertiary"}`}>
                {isDisputed ? "In Dispute" : "Cancelled"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
