interface SkeletonLoaderProps {
  variant?: "card" | "list" | "stats" | "text";
  count?: number;
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-md bg-surface-highlight/50 ${className || ""}`}
      style={{ background: "linear-gradient(90deg, rgba(28,30,36,0.5) 25%, rgba(40,42,50,0.5) 50%, rgba(28,30,36,0.5) 75%)", backgroundSize: "200% 100%" }}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="glass-card p-4 space-y-3">
      <SkeletonBlock className="h-5 w-2/3" />
      <SkeletonBlock className="h-3 w-1/2" />
      <div className="border-t border-white/[0.04] pt-3 mt-3">
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-3/4 mt-2" />
      </div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="glass-card p-4 space-y-2">
      <SkeletonBlock className="h-3 w-1/2" />
      <SkeletonBlock className="h-6 w-1/3" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-3 border-b border-white/[0.04]">
          <div className="space-y-2 flex-1">
            <SkeletonBlock className="h-4 w-1/3" />
            <SkeletonBlock className="h-3 w-1/4" />
          </div>
          <SkeletonBlock className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function SkeletonLoader({ variant = "card", count = 1 }: SkeletonLoaderProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  switch (variant) {
    case "stats":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((i) => <StatsSkeleton key={i} />)}
        </div>
      );
    case "list":
      return <ListSkeleton />;
    case "text":
      return (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i} className="space-y-2">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
              <SkeletonBlock className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div className="space-y-4">
          {items.map((i) => <CardSkeleton key={i} />)}
        </div>
      );
  }
}
