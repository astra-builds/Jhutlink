import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { useDemo } from "../contexts/DemoContext";
import { api } from "../lib/api";
import {
  Play, SkipForward, RotateCcw, ChevronLeft, ChevronRight,
  Zap, Users, Clock, CheckCircle2, Circle, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const DEMO_ACCOUNTS = [
  { id: 1, name: "Rahim Textiles", role: "seller", email: "rahim@test.com", password: "demo123", trade_license: "TL-2024-001" },
  { id: 6, name: "Green Recyclers Ltd", role: "buyer", email: "green@test.com", password: "demo123" },
  { id: 7, name: "EcoFibre", role: "buyer", email: "ecofibre@test.com", password: "demo123" },
  { id: 8, name: "Big Factory Ltd", role: "buyer", email: "bigfactory@test.com", password: "demo123" },
];

const STORY_STEPS = [
  { id: 1, label: "Listing created", description: "A seller posts a new waste listing" },
  { id: 2, label: "Bids placed", description: "Buyers place initial bids" },
  { id: 3, label: "Counter-bids in progress", description: "Buyers outbid each other as price rises" },
  { id: 4, label: "Auction closes", description: "Auction timer expires, auto-close triggers" },
  { id: 5, label: "Allocation runs", description: "System allocates quantity to highest bids" },
  { id: 6, label: "Orders created", description: "Matched bids become orders with escrow" },
  { id: 7, label: "Payment + shipment", description: "Buyer pays, seller ships" },
  { id: 8, label: "Delivery + completion", description: "Buyer confirms, funds released" },
];

export default function DemoConsole() {
  const { user, login } = useAuth();
  const { speed, setSpeed, currentStep, goToStep, setDemoMode } = useDemo();
  const [running, setRunning] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(DEMO_ACCOUNTS[0]);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  async function handleSwitchAccount(account: typeof DEMO_ACCOUNTS[0]) {
    setLoggingIn(true);
    try {
      await login(account.email, account.password);
      setSelectedAccount(account);
      setShowAccountMenu(false);
      setDemoMode(true);
      toast.success(`Switched to ${account.name}`);
    } catch {
      toast.error(`Login failed for ${account.name}. Ensure demo accounts are seeded.`);
    }
    setLoggingIn(false);
  }

  async function handleAutoGenerate() {
    setRunning(true);
    try {
      const listings = await api.listings.list({ limit: 1 });
      if (listings.listings.length > 0) {
        await api.demo.autoBids(listings.listings[0].listing_id);
        toast.success("Demo bids generated");
      }
    } catch (e: any) {
      toast.error(e.detail || "Auto-generate failed");
    }
    setRunning(false);
  }

  async function handleSkipToEnd() {
    setRunning(true);
    try {
      const result = await api.demo.fastForwardAll();
      toast.success(`${result.count} listing(s) finalized`);
      goToStep(8);
    } catch (e: any) {
      toast.error(e.detail || "Skip failed");
    }
    setRunning(false);
  }

  const accountColor = selectedAccount.role === "seller" ? "text-cyan" : "text-emerald";
  const accountRole = selectedAccount.role === "seller" ? "Seller" : "Buyer";

  return (
    <div className="min-h-[100dvh] bg-void pt-20 pb-16">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-cyan transition-colors mb-6">
          <ChevronLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
          <div className="space-y-6">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan/20 to-emerald/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-cyan" />
                </div>
                <div>
                  <h1 className="text-h2 text-text-primary">Demo Console</h1>
                  <p className="text-sm text-text-secondary">Control and monitor the simulation</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                <span className="text-xs uppercase tracking-widest text-text-tertiary mr-2 self-center">Speed:</span>
                {([1, 10, 100] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSpeed(s); toast.info(`Speed set to ${s}x`); }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                      speed === s
                        ? "bg-cyan/20 text-cyan border border-cyan/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                        : "bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:border-white/[0.12] hover:text-text-primary"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
                <span className="text-xs text-text-tertiary self-center ml-2">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Simulation will run at {speed}x speed
                </span>
              </div>

              <div className="border-t border-white/[0.06] pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-text-primary">Story Mode</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan/10 border border-cyan/20 text-cyan text-xs font-medium">
                    Step {currentStep}/{STORY_STEPS.length}
                  </span>
                </div>

                <div className="space-y-0">
                  {STORY_STEPS.map((step, idx) => {
                    const isPast = step.id < currentStep;
                    const isCurrent = step.id === currentStep;
                    const isFuture = step.id > currentStep;
                    return (
                      <button
                        key={step.id}
                        onClick={() => goToStep(step.id)}
                        className={`w-full flex items-start gap-3 py-3 px-3 rounded-lg transition-all duration-200 cursor-pointer ${
                          isCurrent
                            ? "bg-cyan/[0.06] border-l-2 border-cyan"
                            : isPast
                            ? "hover:bg-white/[0.02] border-l-2 border-transparent"
                            : "opacity-40 hover:opacity-70 border-l-2 border-transparent"
                        }`}
                      >
                        <div className="mt-0.5">
                          {isPast ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald" />
                          ) : isCurrent ? (
                            <Loader2 className="w-4 h-4 text-cyan animate-spin" />
                          ) : (
                            <Circle className="w-4 h-4 text-text-tertiary" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <div className={`text-sm font-medium ${
                            isCurrent ? "text-cyan" : isPast ? "text-text-primary" : "text-text-tertiary"
                          }`}>
                            {step.id}. {step.label}
                          </div>
                          <div className="text-xs text-text-tertiary mt-0.5">{step.description}</div>
                        </div>
                        {isCurrent && (
                          <div className="flex items-center gap-1 text-xs text-cyan">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                            <span>In progress</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6 pt-6 border-t border-white/[0.06]">
                <button
                  onClick={() => goToStep(currentStep - 1)}
                  disabled={currentStep <= 1}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-text-secondary hover:text-text-primary hover:border-white/[0.15] transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => goToStep(currentStep + 1)}
                  disabled={currentStep >= STORY_STEPS.length}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-text-secondary hover:text-text-primary hover:border-white/[0.15] transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleAutoGenerate}
                  disabled={running}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan/20 to-emerald/20 border border-cyan/20 text-sm text-cyan hover:from-cyan/30 hover:to-emerald/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Auto-generate bids
                </button>
                <button
                  onClick={handleSkipToEnd}
                  disabled={running}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" /> Skip to end
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan/20 to-emerald/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-emerald" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary">Active Account</h3>
                  <p className={`text-xs ${accountColor}`}>{accountRole}</p>
                </div>
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowAccountMenu(!showAccountMenu)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] transition-all cursor-pointer"
                >
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-cyan/20 to-emerald/20 flex items-center justify-center text-sm font-bold ${accountColor}`}>
                    {selectedAccount.name.charAt(0)}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm text-text-primary font-medium">{selectedAccount.name}</div>
                    <div className="text-xs text-text-tertiary">{selectedAccount.email}</div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-text-tertiary transition-transform ${showAccountMenu ? "rotate-90" : ""}`} />
                </button>

                {showAccountMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-base-elevated border border-white/[0.08] shadow-xl shadow-black/40 overflow-hidden z-10">
                    {DEMO_ACCOUNTS.map((acc) => {
                      const isActive = acc.id === selectedAccount.id;
                      const isLoggedIn = user?.id === acc.id;
                      return (
                        <button
                          key={acc.id}
                          onClick={() => !isActive && handleSwitchAccount(acc)}
                          disabled={isActive || loggingIn}
                          className={`w-full flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer ${
                            isActive
                              ? "bg-cyan/[0.06] border-l-2 border-cyan"
                              : "hover:bg-white/[0.04] border-l-2 border-transparent"
                          } ${isActive ? "" : "cursor-pointer"}`}
                        >
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-cyan/20 to-emerald/20 flex items-center justify-center text-xs font-bold ${
                            acc.role === "seller" ? "text-cyan" : "text-emerald"
                          }`}>
                            {acc.name.charAt(0)}
                          </div>
                          <div className="flex-1 text-left">
                            <div className="text-sm text-text-primary">{acc.name}</div>
                            <div className="text-xs text-text-tertiary capitalize">{acc.role}</div>
                          </div>
                          {isLoggedIn && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald/10 border border-emerald/20 text-emerald text-[10px] font-medium">
                              Active
                            </span>
                          )}
                          {loggingIn && !isActive && (
                            <Loader2 className="w-4 h-4 text-text-tertiary animate-spin" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary">Quick Actions</h3>
                  <p className="text-xs text-text-tertiary">Demo utilities</p>
                </div>
              </div>
              <div className="space-y-3">
                <button
                  onClick={handleAutoGenerate}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-cyan/30 hover:bg-cyan/[0.04] transition-all group cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-sm text-text-secondary group-hover:text-cyan transition-colors">
                    <Play className="w-4 h-4" />
                    Auto-generate sample bids
                  </span>
                  <Zap className="w-4 h-4 text-text-tertiary group-hover:text-cyan transition-colors" />
                </button>
                <button
                  onClick={handleSkipToEnd}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-amber-500/30 hover:bg-amber-500/[0.04] transition-all group cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-sm text-text-secondary group-hover:text-amber-400 transition-colors">
                    <SkipForward className="w-4 h-4" />
                    Fast-forward to completion
                  </span>
                  <span className="text-xs text-text-tertiary group-hover:text-amber-400">Step 8</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
