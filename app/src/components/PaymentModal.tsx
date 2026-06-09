import { useState, useEffect } from "react";
import { formatCurrency } from "@/utils/formatting";
import BkashLogo from "@/components/BkashLogo";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (amountTaka: number) => void;
  totalValueTaka: number;
  loading?: boolean;
  paymentStep?: "idle" | "confirming" | "success" | "error";
  transactionId?: string;
}

const BKASH_MERCHANT = "01712345678";

export default function PaymentModal({
  open,
  onClose,
  onConfirm,
  totalValueTaka,
  loading,
  paymentStep = "idle",
  transactionId = "",
}: PaymentModalProps) {
  const amountTaka = Math.round(totalValueTaka * 100) / 100;
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    if (paymentStep === "success") {
      setCountdown(4);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);

      const closeTimer = setTimeout(() => onClose(), 3500);
      return () => {
        clearInterval(timer);
        clearTimeout(closeTimer);
      };
    }
  }, [paymentStep, onClose]);

  if (!open) return null;

  const handlePay = () => {
    onConfirm(amountTaka);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-card p-6 w-full max-w-md mx-4 relative overflow-hidden">

        {paymentStep === "idle" && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <BkashLogo className="h-10" />
            </div>

            <div className="text-center space-y-1">
              <p className="text-xs text-text-tertiary uppercase tracking-wider">Send Money to</p>
              <p className="text-xl font-mono font-bold text-text-primary tracking-widest">{BKASH_MERCHANT}</p>
              <p className="text-xs text-text-tertiary">Merchant Account</p>
            </div>

            <div className="bg-surface/30 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-tertiary">Order Total</span>
                <span className="text-text-primary font-mono">{formatCurrency(amountTaka)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-tertiary">Platform Fee</span>
                <span className="text-text-primary font-mono">{formatCurrency(amountTaka * 0.01)} (1%)</span>
              </div>
              <div className="border-t border-white/10 pt-3 flex justify-between text-base font-semibold">
                <span className="text-text-primary">Amount to Pay</span>
                <span className="text-emerald font-mono">{formatCurrency(amountTaka)}</span>
              </div>
            </div>

            <button
              onClick={handlePay}
              className="w-full py-3 rounded-lg font-semibold text-base text-white"
              style={{ backgroundColor: "#E2136E" }}
            >
              Pay {formatCurrency(amountTaka)}
            </button>

            <div className="flex gap-2 items-center justify-center">
              <svg className="size-3 text-emerald" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2">
                <path d="M2 6l3 3 5-5" />
              </svg>
              <span className="text-xs text-text-tertiary">Secured by bKash Merchant Services</span>
            </div>
          </div>
        )}

        {paymentStep === "confirming" && (
          <div className="space-y-6 py-8">
            <div className="flex justify-center">
              <div className="relative">
                <BkashLogo className="h-10 opacity-50" />
                <div className="absolute -inset-4 flex items-center justify-center">
                  <div
                    className="size-8 rounded-full border-2 border-transparent animate-spin"
                    style={{ borderTopColor: "#E2136E", borderRightColor: "#E2136E" }}
                  />
                </div>
              </div>
            </div>

            <div className="text-center space-y-2">
              <p className="text-text-primary font-medium text-lg">Connecting to bKash...</p>
              <p className="text-text-tertiary text-sm">
                Sending {formatCurrency(amountTaka)} to {BKASH_MERCHANT}
              </p>
              <div className="w-48 h-1.5 bg-surface-highlight rounded-full mx-auto overflow-hidden mt-4">
                <div
                  className="h-full rounded-full animate-pulse"
                  style={{ backgroundColor: "#E2136E", width: "60%" }}
                />
              </div>
            </div>
          </div>
        )}

        {paymentStep === "success" && (
          <div className="space-y-6 py-8 text-center">
            <div className="flex justify-center">
              <div className="size-16 rounded-full bg-emerald/15 flex items-center justify-center">
                <svg className="size-8 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-text-primary font-semibold text-xl">Payment Successful!</p>
              <p className="text-text-tertiary text-sm">
                {formatCurrency(amountTaka)} has been securely held in escrow.
              </p>
            </div>

            <div className="bg-surface/30 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-tertiary">Transaction ID</span>
                <span className="text-text-primary font-mono text-xs tracking-wider">{transactionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Merchant</span>
                <span className="text-text-primary font-mono">{BKASH_MERCHANT}</span>
              </div>
            </div>

            <p className="text-xs text-text-tertiary">
              Closing in {countdown}s...
            </p>
          </div>
        )}

        {paymentStep === "error" && (
          <div className="space-y-6 py-8 text-center">
            <div className="flex justify-center">
              <div className="size-16 rounded-full bg-red-500/15 flex items-center justify-center">
                <svg className="size-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-text-primary font-semibold text-lg">Payment Failed</p>
              <p className="text-text-tertiary text-sm">
                Something went wrong. Please try again.
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button onClick={onClose} className="btn-primary bg-transparent border border-white/12 text-text-primary px-5 py-2">
                Cancel
              </button>
              <button onClick={handlePay} className="btn-primary bg-emerald text-void px-5 py-2">
                Try Again
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
