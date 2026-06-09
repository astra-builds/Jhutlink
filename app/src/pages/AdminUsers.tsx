import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AdminUser } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AdminSidebar } from "@/components/AdminSidebar";

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    loadUsers();
  }, [roleFilter, statusFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.admin.listUsers(roleFilter || undefined, statusFilter || undefined);
      setUsers(data);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  };

  const handleVerify = async (userId: number) => {
    try {
      await api.admin.verifyUser(userId);
      toast.success("User verified!");
      loadUsers();
    } catch (err: any) { toast.error(err.detail || "Failed to verify."); }
  };

  const handleBan = async (userId: number) => {
    const reason = prompt("Enter ban reason:");
    if (!reason) return;
    try {
      await api.admin.banUser(userId, reason);
      toast.success("User banned.");
      loadUsers();
    } catch (err: any) { toast.error(err.detail || "Failed to ban."); }
  };

  return (
    <div className="flex h-[100dvh] bg-void">
      <AdminSidebar />
      <main className="flex-1 flex flex-col">
        <div className="bg-base-elevated border-b border-white/[0.04] px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-text-primary">User Management</h1>
            <div className="flex items-center gap-3">
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                className="bg-surface/20 border border-white/10 rounded px-2 py-1 text-xs text-text-secondary">
                <option value="">All Roles</option>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="admin">Admin</option>
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-surface/20 border border-white/10 rounded px-2 py-1 text-xs text-text-secondary">
                <option value="">All Status</option>
                <option value="pending_verification">Pending</option>
                <option value="active">Active</option>
                <option value="banned">Banned</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner className="size-6" /></div>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="glass-card p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text-primary">{u.name}</p>
                    <p className="text-xs text-text-tertiary">{u.email} • {u.role} • ID #{u.id}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[0.55rem] px-2 py-0.5 rounded-full uppercase ${
                        u.status === "active" ? "bg-emerald/10 text-emerald" :
                        u.status === "banned" ? "bg-red-500/10 text-red-400" :
                        "bg-amber-500/10 text-amber-400"
                      }`}>{u.status}</span>
                      {u.strikes > 0 && <span className="text-[0.55rem] text-red-400">{u.strikes} strike(s)</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.status === "pending_verification" && (
                      <button onClick={() => handleVerify(u.id)}
                        className="text-xs bg-emerald/20 text-emerald px-3 py-1 rounded-full border-none cursor-pointer">
                        Verify
                      </button>
                    )}
                    {u.status !== "banned" && (
                      <button onClick={() => handleBan(u.id)}
                        className="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full border-none cursor-pointer">
                        Ban
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
