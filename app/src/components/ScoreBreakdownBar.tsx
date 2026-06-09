/**
 * ScoreBreakdownBar — A horizontal bar chart showing breakdown of
 * recommendation score dimensions (waste_type, grade, quantity, price, location).
 */

interface ScoreBreakdownBarProps {
  breakdown: Record<string, number>;
}

const DIMENSION_META: Record<string, { label: string; color: string }> = {
  waste_type:  { label: "Type",     color: "#06b6d4" }, // cyan
  grade:       { label: "Grade",    color: "#059669" }, // emerald
  quantity:    { label: "Qty",      color: "#2563eb" }, // electric-blue
  price:       { label: "Price",    color: "#d97706" }, // gold
  location:    { label: "Location", color: "#8b5cf6" }, // violet
};

export default function ScoreBreakdownBar({ breakdown }: ScoreBreakdownBarProps) {
  if (!breakdown || Object.keys(breakdown).length === 0) return null;

  // Normalise: find max value for bar width scaling
  const entries = Object.entries(breakdown);
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => {
        const meta = DIMENSION_META[key] || { label: key, color: "#94a3b8" };
        const pct = Math.round((value / maxVal) * 100);

        return (
          <div key={key} className="flex items-center gap-3">
            <span className="text-[0.65rem] text-text-tertiary uppercase tracking-wide w-14 text-right flex-shrink-0">
              {meta.label}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${meta.color}, ${meta.color}80)`,
                }}
              />
            </div>
            <span className="text-[0.6rem] font-mono text-text-tertiary w-6 text-right flex-shrink-0">
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
