import { useState } from "react";

interface DisputeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  loading?: boolean;
}

export default function DisputeModal({ open, onClose, onSubmit, loading }: DisputeModalProps) {
  const [reason, setReason] = useState("");

  if (!open) return null;

  const handleSubmit = () => {
    if (!reason.trim()) return;
    onSubmit(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-card p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Open Dispute</h2>
        <p className="text-sm text-text-tertiary mb-4">
          Describe the issue with this order. The Jhutlink team will review and mediate.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              Reason for Dispute
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe what went wrong..."
              rows={4}
              className="w-full p-3 border border-white/10 rounded-md bg-surface/20 focus:border-cyan/50 focus:outline-none text-sm resize-none"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={loading}
              className="btn-primary bg-transparent border border-white/12 text-text-primary px-4 py-2 hover:border-cyan/40"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !reason.trim()}
              className="btn-primary bg-red-500 text-void px-6 py-2 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit Dispute"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
