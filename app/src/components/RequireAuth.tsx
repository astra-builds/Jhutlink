import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/contexts/AuthContext";

interface RequireAuthProps {
  allowedRoles?: string[];
}

export default function RequireAuth({ allowedRoles }: RequireAuthProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-void">
        <div className="glass-card p-8 flex items-center gap-4">
          <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
          <span className="text-text-secondary text-sm">Verifying session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === "buyer") return <Navigate to="/dashboard/buyer" replace />;
    if (user.role === "seller") return <Navigate to="/dashboard/seller" replace />;
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}