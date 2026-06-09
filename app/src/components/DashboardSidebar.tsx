import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { LogOutIcon, UserIcon, MenuIcon, XIcon } from "lucide-react";

export function DashboardSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const isBuyer = user?.role === "buyer";
  const isSeller = user?.role === "seller";

  const buyerNav = [
    { to: "/marketplace", label: "Marketplace", icon: "listings" },
    { to: "/dashboard/buyer", label: "Overview", icon: "overview" },
    { to: "/dashboard/buyer/bids", label: "Active Bids", icon: "bids" },
    { to: "/dashboard/buyer/orders", label: "Orders", icon: "orders" },
    { to: "/dashboard/buyer/curations", label: "AI Curations", icon: "curations" },
    { to: "/dashboard/buyer/preferences", label: "Preferences", icon: "preferences" },
    { to: "/dashboard/buyer/watchlist", label: "Watchlist", icon: "watchlist" },
  ];

  const sellerNav = [
    { to: "/marketplace", label: "Marketplace", icon: "listings" },
    { to: "/dashboard/seller", label: "Overview", icon: "overview" },
    { to: "/dashboard/seller/listings", label: "Market Listings", icon: "listings" },
    { to: "/dashboard/seller/bids", label: "Incoming Bids", icon: "bids" },
    { to: "/dashboard/seller/orders", label: "Orders", icon: "orders" },
    { to: "/dashboard/seller/analytics", label: "Analytics", icon: "analytics" },
  ];

  const navItems = isBuyer ? buyerNav : isSeller ? sellerNav : [];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-base-elevated border-r border-white/[0.04]">
        <div className="flex items-center gap-3 p-5">
          <div className="w-10 h-10 bg-cyan/20 rounded-full flex items-center justify-center relative">
            <UserIcon className="h-5 w-5 text-cyan" />
            {(user as any)?.strikes > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[0.5rem] font-bold rounded-full flex items-center justify-center">
                {(user as any).strikes}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary truncate">{user?.name || "User"}</p>
            <p className="text-xs text-text-tertiary capitalize">{user?.role}</p>
          </div>
        </div>

      <nav className="mt-6 flex-1 pb-4 overflow-y-auto" aria-label="Dashboard navigation">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-text-secondary hover:bg-surface/50 hover:text-cyan border-l-2 border-transparent hover:border-cyan transition-colors min-h-[44px]"
            aria-label={item.label}
          >
            <span className="h-4 w-4 flex-shrink-0">
              <NavIcon type={item.icon} />
            </span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-6 border-t border-white/[0.04]">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 text-left text-sm font-medium text-text-tertiary hover:text-cyan min-h-[44px]"
          aria-label="Sign out"
        >
          <LogOutIcon className="h-4 w-4 flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-10 h-10 flex items-center justify-center bg-base-elevated border border-white/[0.04] rounded-lg"
        aria-label="Open sidebar menu"
      >
        <MenuIcon className="h-5 w-5 text-text-primary" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 h-full animate-slide-in-left">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-highlight"
              aria-label="Close sidebar menu"
            >
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
    case "overview":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "bids":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      );
    case "orders":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      );
    case "curations":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "preferences":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "listings":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    case "analytics":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case "watchlist":
      return (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      );
    default:
      return null;
  }
}
