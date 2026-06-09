import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { AdminSidebar } from "@/components/AdminSidebar";

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [users, platformStats] = await Promise.all([
          api.admin.listUsers(),
          api.stats.get(),
        ]);
        const disputes = await api.admin.listDisputes().catch(() => []);

        setStats({
          totalUsers: users.length,
          activeListings: platformStats.active_listings,
          pendingOrders: platformStats.pending_orders,
          disputedOrders: disputes.length,
          pendingUsers: users.filter((u: any) => u.status === "pending_verification").length,
        });
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    loadStats();
  }, []);

  if (loading) return (
    <div className="flex h-[100dvh] bg-void">
      <AdminSidebar />
      <main className="flex-1 flex items-center justify-center">
        <Spinner className="size-8" />
      </main>
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-void">
      <AdminSidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
          <h1 className="text-xl font-semibold text-text-primary">Admin Dashboard</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-4">
              <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">Total Users</p>
              <p className="font-mono text-cyan text-xl">{stats?.totalUsers || 0}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">Pending Verification</p>
              <p className="font-mono text-amber-400 text-xl">{stats?.pendingUsers || 0}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">Active Listings</p>
              <p className="font-mono text-cyan text-xl">{stats?.activeListings || 0}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">Disputed Orders</p>
              <p className="font-mono text-red-400 text-xl">{stats?.disputedOrders || 0}</p>
            </div>
          </div>

          <div className="mt-8 glass-card p-6">
            <h2 className="text-lg font-medium text-text-primary mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a href="/admin/users" className="glass-card p-4 text-center hover:border-cyan/30 transition-colors block">
                <p className="text-sm text-cyan font-medium">Manage Users</p>
                <p className="text-xs text-text-tertiary mt-1">Verify, ban, or review users</p>
              </a>
              <a href="/admin/disputes" className="glass-card p-4 text-center hover:border-cyan/30 transition-colors block">
                <p className="text-sm text-cyan font-medium">Disputes ({stats?.disputedOrders || 0})</p>
                <p className="text-xs text-text-tertiary mt-1">Resolve open disputes</p>
              </a>
              <div className="glass-card p-4 text-center">
                <p className="text-sm text-text-secondary font-medium">Platform Stats</p>
                <p className="text-xs text-text-tertiary mt-1">Pending orders: {stats?.pendingOrders || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
