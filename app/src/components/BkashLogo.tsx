export default function BkashLogo({ className = "h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="bKash">
      <rect x="2" y="2" width="36" height="36" rx="8" fill="#E2136E" />
      <text x="20" y="27" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="20" fill="white">b</text>
      <text x="48" y="28" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="28" letterSpacing="-0.5" fill="#E2136E">bKash</text>
    </svg>
  );
}
