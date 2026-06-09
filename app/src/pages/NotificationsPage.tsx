import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { timeAgo } from "@/utils/formatting";
import type { Notification } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

interface SectionConfig {
  label: string;
  icon: string;
  color: string;
}

const SECTION_MAP: Record<string, SectionConfig> = {
  MATCH_FOUND:        { label: "Matches",       icon: "✓", color: "text-emerald" },
  BID_PLACED:         { label: "Bids",           icon: "⚡", color: "text-cyan" },
  BID_MATCHED:        { label: "Bids",           icon: "🏆", color: "text-emerald" },
  BID_OUTBID:         { label: "Bids",           icon: "▲", color: "text-amber" },
  ORDER_CONFIRMED:    { label: "Orders",         icon: "📦", color: "text-cyan" },
  PAYMENT_RECEIVED:   { label: "Payments",       icon: "💰", color: "text-emerald" },
  SHIPMENT_UPDATED:   { label: "Shipments",      icon: "🚚", color: "text-cyan" },
  DELIVERY_CONFIRMED: { label: "Deliveries",     icon: "✅", color: "text-emerald" },
  DISPUTE_OPENED:     { label: "Disputes",       icon: "⚠️", color: "text-red-500" },
  DISPUTE_RESOLVED:   { label: "Disputes",       icon: "🔒", color: "text-emerald" },
  ACCOUNT_VERIFIED:   { label: "Account",        icon: "🛡️", color: "text-cyan" },
  ACCOUNT_BANNED:     { label: "Account",        icon: "🚫", color: "text-red-500" },
  NEW_LISTING:        { label: "Listings",       icon: "🏷️", color: "text-cyan" },
};

function getSection(n: Notification): SectionConfig {
  return SECTION_MAP[n.notification_type] || { label: "Other", icon: "•", color: "text-text-tertiary" };
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    loadNotifications();
  }, [filter]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await api.notifications.list(filter === "unread" ? "unread" : undefined);
      setNotifications(data);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, { config: SectionConfig; items: Notification[] }>();
    for (const n of notifications) {
      const sec = getSection(n);
      if (!map.has(sec.label)) map.set(sec.label, { config: sec, items: [] });
      map.get(sec.label)!.items.push(n);
    }
    const order = ["Bids", "Orders", "Payments", "Shipments", "Deliveries", "Matches", "Listings", "Disputes", "Account", "Other"];
    return Array.from(map.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0]), bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [notifications]);

  const handleMarkRead = async (id: number) => {
    try {
      await api.notifications.markRead(id);
      setNotifications(prev =>
        prev.map(n => n.notification_id === id ? { ...n, status: "READ" as const, read_at: new Date().toISOString() } : n)
      );
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, status: "READ" as const, read_at: new Date().toISOString() })));
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-[100dvh] bg-void pt-20 pb-16">
      <div className="max-w-[800px] mx-auto px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Notifications</h1>
            <p className="text-sm text-text-tertiary">Stay updated on your bids, orders, and platform activity</p>
          </div>
          <Link to={user?.role === "buyer" ? "/dashboard/buyer" : "/dashboard/seller"} className="text-sm text-cyan hover:underline">
            ← Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex bg-surface/20 rounded-lg p-1">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-1.5 text-xs rounded-md border-none cursor-pointer transition-colors ${
                filter === "all" ? "bg-cyan/20 text-cyan" : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-4 py-1.5 text-xs rounded-md border-none cursor-pointer transition-colors ${
                filter === "unread" ? "bg-cyan/20 text-cyan" : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              Unread
            </button>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-cyan hover:underline bg-transparent border-none cursor-pointer"
          >
            Mark all read
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="size-6" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-2xl mb-2">🔔</p>
            <p className="text-text-tertiary">No notifications yet.</p>
            <p className="text-xs text-text-tertiary mt-2">Notifications about your bids, orders, and platform updates will appear here.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([sectionName, { config, items }]) => (
              <div key={sectionName}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm">{config.icon}</span>
                  <h2 className={`text-xs font-semibold tracking-widest uppercase ${config.color}`}>
                    {sectionName}
                  </h2>
                  <span className="text-[0.55rem] text-text-tertiary bg-surface/20 px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((n) => (
                    <div
                      key={n.notification_id}
                      className={`glass-card p-4 cursor-pointer transition-all duration-200 hover:border-white/[0.12] ${
                        n.status === "UNREAD" ? "border-l-2 border-l-cyan" : ""
                      }`}
                      onClick={() => n.status === "UNREAD" && handleMarkRead(n.notification_id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${n.status === "UNREAD" ? "font-medium text-text-primary" : "text-text-secondary"}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-text-tertiary mt-1 line-clamp-2">{n.body}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[0.6rem] text-text-tertiary">{timeAgo(n.created_at)}</span>
                            <span className="text-[0.5rem] text-text-tertiary/60 uppercase tracking-wider">{n.channel}</span>
                          </div>
                        </div>
                        <span className={`text-[0.55rem] px-2 py-0.5 rounded-full uppercase ml-3 ${
                          n.status === "UNREAD"
                            ? "bg-cyan/10 text-cyan"
                            : "bg-text-tertiary/10 text-text-tertiary"
                        }`}>
                          {n.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
