/**
 * ScoreRing — Radial score visualiser for recommendation cards.
 * Renders an SVG ring that fills proportionally to `score` (0-100).
 */

interface ScoreRingProps {
  score: number;       // 0-100
  size?: number;       // px, default 64
  strokeWidth?: number;
  className?: string;
}

export default function ScoreRing({
  score,
  size = 64,
  strokeWidth = 5,
  className = "",
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  // Colour stops based on score tier
  const color =
    score >= 80
      ? "#059669" // emerald – strong match
      : score >= 60
        ? "#06b6d4" // cyan – good match
        : "#d97706"; // gold – possible match

  const gradientId = `score-ring-${score}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </svg>

      {/* Centre text */}
      <span
        className="absolute font-mono font-semibold"
        style={{ fontSize: size * 0.22, color }}
      >
        {score}
      </span>
    </div>
  );
}
