import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { LogOutIcon, UserIcon, MenuIcon, XIcon } from "lucide-react";

export function AdminSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const navItems = [
    { to: "/admin", label: "Dashboard", icon: "dashboard" },
    { to: "/admin/users", label: "Users", icon: "users" },
    { to: "/admin/disputes", label: "Disputes", icon: "disputes" },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-base-elevated border-r border-white/[0.04]">
      <div className="flex items-center gap-3 p-5">
        <div className="w-10 h-10 bg-cyan/20 rounded-full flex items-center justify-center">
          <UserIcon className="h-5 w-5 text-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary truncate">{user?.name || "Admin"}</p>
          <p className="text-xs text-text-tertiary capitalize">Admin</p>
        </div>
      </div>

      <nav className="mt-6 flex-1 pb-4 overflow-y-auto">
        <p className="px-4 text-[0.6rem] uppercase tracking-widest text-text-tertiary mb-2">Admin</p>
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-text-secondary hover:bg-surface/50 hover:text-cyan border-l-2 border-transparent hover:border-cyan transition-colors min-h-[44px]"
          >
            <span className="h-4 w-4 flex-shrink-0">
              <NavIcon type={item.icon} />
            </span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-6 border-t border-white/[0.04] space-y-2">
        <Link to={user?.role === "buyer" ? "/dashboard/buyer" : "/dashboard/seller"}
          className="flex items-center gap-3 text-sm font-medium text-text-tertiary hover:text-cyan min-h-[44px]">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          User Dashboard
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 text-left text-sm font-medium text-text-tertiary hover:text-cyan min-h-[44px] bg-transparent border-none cursor-pointer"
        >
          <LogOutIcon className="h-4 w-4 flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-10 h-10 flex items-center justify-center bg-base-elevated border border-white/[0.04] rounded-lg"
      >
        <MenuIcon className="h-5 w-5 text-text-primary" />
      </button>
      <aside className="hidden lg:flex w-64 flex-shrink-0">
        {sidebarContent}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full animate-slide-in-left">
            <button onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-highlight">
              <XIcon className="h-4 w-4 text-text-primary" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

function NavIcon({ type }: { type: string }) {
  switch (type) {
    case "dashboard":
      return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>;
    case "users":
      return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
      </svg>;
    case "disputes":
      return <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>;
    default:
      return null;
  }
}
