import { useEffect, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { useSmoothScroll } from "./hooks/useSmoothScroll";
import { AuthProvider } from "./contexts/AuthContext";
import { DemoProvider } from "./contexts/DemoContext";
import { Toaster } from "sonner";
import Navigation from "./sections/Navigation";
import Hero from "./sections/Hero";
import Problem from "./sections/Problem";
import Marketplace from "./sections/Marketplace";
import Auction from "./sections/Auction";
import Matching from "./sections/Matching";
import Escrow from "./sections/Escrow";
import Logistics from "./sections/Logistics";
import Analytics from "./sections/Analytics";
import FinalCTA from "./sections/FinalCTA";
import Footer from "./sections/Footer";
import RequireAuth from "./components/RequireAuth";
import ErrorBoundary from "./components/ErrorBoundary";

const AuthPage = lazy(() => import("./pages/Auth"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const ListingDetailPage = lazy(() => import("./pages/ListingDetailPage"));
const DashboardBuyer = lazy(() => import("./pages/DashboardBuyer"));
const DashboardSeller = lazy(() => import("./pages/DashboardSeller"));
const SellerListings = lazy(() => import("./pages/SellerListings"));
const SellerBids = lazy(() => import("./pages/SellerBids"));
const SellerOrders = lazy(() => import("./pages/SellerOrders"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const BuyerBids = lazy(() => import("./pages/BuyerBids"));
const BuyerOrders = lazy(() => import("./pages/BuyerOrders"));
const BuyerCurations = lazy(() => import("./pages/BuyerCurations"));
const BuyerPreferences = lazy(() => import("./pages/BuyerPreferences"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const BuyerWatchlist = lazy(() => import("./pages/BuyerWatchlist"));
const DemoConsole = lazy(() => import("./pages/DemoConsole"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminDisputes = lazy(() => import("./pages/AdminDisputes"));

function MarqueeStrip() {
  const items = ["Cotton Waste", "Polyester Scraps", "Denim Offcuts", "Mixed Fiber", "Synthetic Blend", "Cotton Waste", "Polyester Scraps", "Denim Offcuts", "Mixed Fiber", "Synthetic Blend"];

  return (
    <div className="w-full overflow-hidden py-3 border-y border-white/[0.03] bg-void">
      <div className="flex animate-marquee whitespace-nowrap" style={{ willChange: 'transform' }}>
        {items.map((item, i) => (
          <span key={i} className="flex items-center mx-4">
            <span className="accent-label text-text-secondary text-[0.65rem] tracking-widest">{item}</span>
            <span className="w-1 h-1 rounded-full bg-cyan/50 mx-4 flex-shrink-0" />
          </span>
        ))}
        {items.map((item, i) => (
          <span key={`dup-${i}`} className="flex items-center mx-4">
            <span className="accent-label text-text-secondary text-[0.65rem] tracking-widest">{item}</span>
            <span className="w-1 h-1 rounded-full bg-cyan/50 mx-4 flex-shrink-0" />
          </span>
        ))}
      </div>
    </div>
  );
}

function LandingPage() {
  return (
    <>
      <Navigation />
      <main>
        <Hero />
        <MarqueeStrip />
        <Problem />
        <Marketplace />
        <Auction />
        <Matching />
        <Escrow />
        <Logistics />
        <Analytics />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-void">
      <div className="text-center">
        <h1 className="text-h2 text-text-primary mb-4">{title}</h1>
        <p className="text-text-secondary">Coming soon...</p>
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-void">
      <div className="glass-card p-8">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}

function AppRoutes() {
  useSmoothScroll();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route path="/" element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
      <Route path="/marketplace" element={<ErrorBoundary><MarketplacePage /></ErrorBoundary>} />
      <Route path="/listings/:id" element={<ErrorBoundary><ListingDetailPage /></ErrorBoundary>} />
      <Route path="/auth" element={<ErrorBoundary><AuthPage /></ErrorBoundary>} />
      <Route path="/notifications" element={<ErrorBoundary><NotificationsPage /></ErrorBoundary>} />
      <Route path="/demo" element={<ErrorBoundary><DemoConsole /></ErrorBoundary>} />
      <Route element={<RequireAuth allowedRoles={["admin"]} />}>
        <Route path="/admin" element={<ErrorBoundary><AdminDashboard /></ErrorBoundary>} />
        <Route path="/admin/users" element={<ErrorBoundary><AdminUsers /></ErrorBoundary>} />
        <Route path="/admin/disputes" element={<ErrorBoundary><AdminDisputes /></ErrorBoundary>} />
      </Route>
      <Route element={<RequireAuth allowedRoles={["buyer"]} />}>
        <Route path="/dashboard/buyer" element={<ErrorBoundary><DashboardBuyer /></ErrorBoundary>} />
        <Route path="/dashboard/buyer/bids" element={<ErrorBoundary><BuyerBids /></ErrorBoundary>} />
        <Route path="/dashboard/buyer/orders" element={<ErrorBoundary><BuyerOrders /></ErrorBoundary>} />
        <Route path="/dashboard/buyer/curations" element={<ErrorBoundary><BuyerCurations /></ErrorBoundary>} />
        <Route path="/dashboard/buyer/preferences" element={<ErrorBoundary><BuyerPreferences /></ErrorBoundary>} />
        <Route path="/dashboard/buyer/watchlist" element={<ErrorBoundary><BuyerWatchlist /></ErrorBoundary>} />
      </Route>
      <Route element={<RequireAuth allowedRoles={["seller"]} />}>
        <Route path="/dashboard/seller" element={<ErrorBoundary><DashboardSeller /></ErrorBoundary>} />
        <Route path="/dashboard/seller/listings" element={<ErrorBoundary><SellerListings /></ErrorBoundary>} />
        <Route path="/dashboard/seller/bids" element={<ErrorBoundary><SellerBids /></ErrorBoundary>} />
        <Route path="/dashboard/seller/orders" element={<ErrorBoundary><SellerOrders /></ErrorBoundary>} />
        <Route path="/dashboard/seller/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
        <Route path="/dashboard/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/orders/:id" element={<ErrorBoundary><OrderDetailPage /></ErrorBoundary>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DemoProvider>
      <div className="relative bg-void min-h-[100dvh]">
        <AppRoutes />
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: "#141519",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#f4f4f4",
            },
          }}
        />
      </div>
      </DemoProvider>
    </AuthProvider>
  );
}