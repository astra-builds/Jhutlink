import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatKg } from '@/utils/formatting';
import type { Listing } from '@/lib/api';
import { toast } from 'sonner';
import { useScrollFade, splitText } from '@/hooks/useScrollReveal';

type DistrictStats = {
  district: string;
  listingCount: number;
  sellerCount: number;
  totalVolumeKg: number;
  activeCount: number;
};

function RouteAnimation() {
  return (
    <svg className="w-full h-[60px] mt-4" viewBox="0 0 200 60" preserveAspectRatio="none">
      <path
        id="routePath"
        d="M0 30 Q50 10 100 30 T200 30"
        fill="none"
        stroke="rgba(34,211,238,0.2)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <circle r="3" fill="#22d3ee">
        <animateMotion dur="4s" repeatCount="indefinite" path="M0 30 Q50 10 100 30 T200 30" />
      </circle>
    </svg>
  );
}

export default function Logistics() {
  const sectionRef = useRef<HTMLElement>(null);
  const [districts, setDistricts] = useState<DistrictStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listings
      .list({ limit: 500 })
      .then((res) => {
        const map = new Map<string, { listingIds: Set<number>; sellerIds: Set<number>; totalKg: number; active: number }>();

        res.listings.forEach((l) => {
          const d = l.location_district;
          if (!map.has(d)) map.set(d, { listingIds: new Set(), sellerIds: new Set(), totalKg: 0, active: 0 });
          const entry = map.get(d)!;
          entry.listingIds.add(l.listing_id);
          entry.sellerIds.add(l.seller_id);
          entry.totalKg += l.quantity_kg;
          if (l.status === "ACTIVE") entry.active++;
        });

        const sorted = Array.from(map.entries())
          .map(([district, data]) => ({
            district,
            listingCount: data.listingIds.size,
            sellerCount: data.sellerIds.size,
            totalVolumeKg: data.totalKg,
            activeCount: data.active,
          }))
          .sort((a, b) => b.listingCount - a.listingCount)
          .slice(0, 3);

        setDistricts(sorted);
      })
      .catch(() => toast.error("Failed to load district data."))
      .finally(() => setLoading(false));
  }, []);

  useScrollFade(sectionRef, [".logistics-header", ".logistics-card"]);

  return (
    <section ref={sectionRef} id="logistics" className="relative bg-base-elevated py-24 md:py-32">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12">
        <div className="logistics-header text-center">
          <span className="accent-label text-cyan">LOGISTICS NETWORK</span>
          <h2 className="text-h2 text-text-primary mt-4">
            {splitText("Connected Across Bangladesh's Manufacturing Heartland.", "logistics-word")}
          </h2>
          <p className="text-[0.9375rem] text-text-secondary max-w-[640px] mx-auto mt-4" style={{ lineHeight: 1.75 }}>
            Platform-arranged logistics with real-time tracking across Bangladesh&apos;s garment production zones.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="logistics-card glass-card p-8 animate-pulse">
                <div className="h-6 bg-white/5 rounded w-1/2 mb-2" />
                <div className="h-3 bg-white/5 rounded w-1/3 mb-6" />
                <div className="grid grid-cols-2 gap-4">
                  {[...Array(4)].map((_, j) => (
                    <div key={j}>
                      <div className="h-5 bg-white/5 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-white/5 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : districts.length === 0 ? (
            <div className="col-span-3 text-center py-12">
              <p className="text-text-tertiary text-sm">No listings yet to show district data.</p>
            </div>
          ) : (
            districts.map((d, i) => (
              <div
                key={i}
                className="logistics-card glass-card glass-card-hover p-8 overflow-hidden relative"
              >
                <h3 className="text-2xl font-display font-semibold text-text-primary" style={{ fontFamily: '"Clash Display", system-ui' }}>
                  {d.district}
                </h3>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div>
                    <span className="font-mono text-cyan text-base">{d.listingCount}</span>
                    <span className="text-[0.7rem] text-text-tertiary tracking-wide block">Listings</span>
                  </div>
                  <div>
                    <span className="font-mono text-cyan text-base">{d.sellerCount}</span>
                    <span className="text-[0.7rem] text-text-tertiary tracking-wide block">Sellers</span>
                  </div>
                  <div>
                    <span className="font-mono text-cyan text-base">{formatKg(d.totalVolumeKg)}</span>
                    <span className="text-[0.7rem] text-text-tertiary tracking-wide block">Volume</span>
                  </div>
                  <div>
                    <span className="font-mono text-cyan text-base">{d.activeCount}</span>
                    <span className="text-[0.7rem] text-text-tertiary tracking-wide block">Active</span>
                  </div>
                </div>

                <RouteAnimation />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
