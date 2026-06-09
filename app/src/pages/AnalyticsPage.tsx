import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { formatCurrency, formatKg, formatDate } from "@/utils/formatting";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { Spinner } from "@/components/ui/spinner";
import {
  BarChart3, List, Search, Download, ChevronLeft, ChevronRight,
  TrendingUp, Package, Users, Building2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const WASTE_TYPES = ["", "Cotton", "Polyester", "Mixed", "Denim", "Synthetic Blend"];
const STATUS_OPTIONS = ["", "COMPLETED", "PAYMENT_PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "DISPUTED", "CANCELLED"];

export default function AnalyticsPage() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"transactions" | "analytics">("transactions");
  const [loading, setLoading] = useState(true);

  const [txData, setTxData] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txOffset, setTxOffset] = useState(0);
  const [txLimit] = useState(15);
  const [txSearch, setTxSearch] = useState("");
  const [txWasteFilter, setTxWasteFilter] = useState("");

  const [summary, setSummary] = useState<any>(null);
  const [byWasteType, setByWasteType] = useState<any[]>([]);
  const [topBuyers, setTopBuyers] = useState<any[]>([]);
  const [topSellers, setTopSellers] = useState<any[]>([]);

  const loadTransactions = useCallback(async (offset: number) => {
    try {
      const res = await api.analytics.transactions({
        waste_type: txWasteFilter || undefined,
        limit: txLimit,
        offset,
      });
      setTxData(res.transactions);
      setTxTotal(res.total);
    } catch { toast.error("Failed to load transactions"); }
  }, [txWasteFilter, txLimit]);

  const loadAnalytics = useCallback(async () => {
    try {
      const [s, w, buyers, sellers] = await Promise.all([
        api.analytics.summary(),
        api.analytics.byWasteType(),
        api.analytics.topBuyers(5),
        api.analytics.topSellers(5),
      ]);
      setSummary(s);
      setByWasteType(w);
      setTopBuyers(buyers);
      setTopSellers(sellers);
    } catch { toast.error("Failed to load analytics"); }
  }, []);

  useEffect(() => {
    setLoading(true);
    if (activeTab === "transactions") {
      loadTransactions(0).finally(() => setLoading(false));
    } else {
      loadAnalytics().finally(() => setLoading(false));
    }
  }, [activeTab, loadTransactions, loadAnalytics]);

  useEffect(() => { setTxOffset(0); loadTransactions(0); }, [txWasteFilter]);

  const txSearchFiltered = txSearch
    ? txData.filter((tx) =>
        String(tx.order_id).includes(txSearch) ||
        String(tx.buyer_id).includes(txSearch) ||
        String(tx.seller_id).includes(txSearch) ||
        (tx.waste_type || "").toLowerCase().includes(txSearch.toLowerCase())
      )
    : txData;

  const totalPages = Math.ceil(txTotal / txLimit);
  const currentPage = Math.floor(txOffset / txLimit) + 1;

  function handleExportCSV() {
    const headers = ["Order ID", "Listing ID", "Buyer ID", "Seller ID", "Waste Type", "Qty (kg)", "Price/kg (৳)", "Total (৳)", "Status", "Date"];
    const rows = txSearchFiltered.map((tx) =>
      [tx.order_id, tx.listing_id, tx.buyer_id, tx.seller_id, tx.waste_type, tx.quantity_kg, tx.price_per_kg_taka, tx.total_value_taka, tx.status, tx.completed_at || tx.created_at].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "jhutlink_transactions.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  return (
    <div className="flex h-[100dvh] bg-void">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-lg font-medium text-text-primary">Analytics &amp; Transactions</h1>
          <p className="text-xs text-text-tertiary">
            {new Date().toLocaleDateString("en-BD", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit">
            <button
              onClick={() => setActiveTab("transactions")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === "transactions"
                  ? "bg-cyan/20 text-cyan shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <List className="w-4 h-4" /> Transactions
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === "analytics"
                  ? "bg-cyan/20 text-cyan shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <BarChart3 className="w-4 h-4" /> Analytics
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner className="w-6 h-6" />
              <span className="ml-3 text-sm text-text-tertiary">Loading...</span>
            </div>
          ) : activeTab === "transactions" ? (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by order ID, buyer, seller..."
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    className="w-full pl-10 bg-surface border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-cyan/40 transition-colors"
                    aria-label="Search transactions"
                  />
                </div>
                <select
                  value={txWasteFilter}
                  onChange={(e) => setTxWasteFilter(e.target.value)}
                  className="bg-surface text-text-secondary text-sm px-3 py-2 rounded-lg border border-white/10 cursor-pointer outline-none"
                  aria-label="Filter by waste type"
                >
                  <option value="">All Waste Types</option>
                  {WASTE_TYPES.filter(Boolean).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-sm text-text-secondary hover:text-text-primary hover:border-white/[0.15] transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>

              {txSearchFiltered.length === 0 ? (
                <div className="glass-card p-10 text-center">
                  <Search className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
                  <p className="text-text-tertiary text-sm">No transactions found</p>
                </div>
              ) : (
                <div className="glass-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="text-left text-[0.6rem] uppercase tracking-widest text-text-tertiary font-medium px-4 py-3">Order</th>
                          <th className="text-left text-[0.6rem] uppercase tracking-widest text-text-tertiary font-medium px-4 py-3">Type</th>
                          <th className="text-right text-[0.6rem] uppercase tracking-widest text-text-tertiary font-medium px-4 py-3">Qty</th>
                          <th className="text-right text-[0.6rem] uppercase tracking-widest text-text-tertiary font-medium px-4 py-3">Total</th>
                          <th className="text-left text-[0.6rem] uppercase tracking-widest text-text-tertiary font-medium px-4 py-3">Status</th>
                          <th className="text-right text-[0.6rem] uppercase tracking-widest text-text-tertiary font-medium px-4 py-3">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txSearchFiltered.map((tx) => (
                          <tr key={tx.order_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3">
                              <Link to={`/orders/${tx.order_id}`} className="text-cyan hover:underline font-medium">
                                #{tx.order_id}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-text-primary">{tx.waste_type || "--"}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-text-secondary">{formatKg(tx.quantity_kg)}</td>
                            <td className="px-4 py-3 text-right font-mono text-text-primary">{formatCurrency(tx.total_value_taka)}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[0.55rem] font-medium uppercase tracking-wider ${
                                tx.status === "COMPLETED" ? "bg-emerald/10 text-emerald border border-emerald/20" :
                                tx.status === "PAYMENT_PENDING" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                tx.status === "CONFIRMED" ? "bg-cyan/10 text-cyan border border-cyan/20" :
                                tx.status === "IN_TRANSIT" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                                tx.status === "DELIVERED" ? "bg-violet-500/10 text-violet-400 border border-violet-500/20" :
                                tx.status === "DISPUTED" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                                "bg-white/10 text-text-secondary border border-white/10"
                              }`}>{tx.status.replace("_", " ")}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-text-tertiary text-xs">
                              {tx.completed_at ? formatDate(tx.completed_at) : formatDate(tx.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                      <p className="text-xs text-text-tertiary">
                        Showing {txOffset + 1}–{Math.min(txOffset + txLimit, txTotal)} of {txTotal}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { const o = txOffset - txLimit; setTxOffset(o); loadTransactions(o); }}
                          disabled={txOffset <= 0}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                          <ChevronLeft className="w-3 h-3" /> Prev
                        </button>
                        <span className="text-xs text-text-tertiary">Page {currentPage} of {totalPages}</span>
                        <button
                          onClick={() => { const o = txOffset + txLimit; setTxOffset(o); loadTransactions(o); }}
                          disabled={txOffset + txLimit >= txTotal}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                          Next <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-emerald" />
                      <span className="text-[0.6rem] uppercase tracking-widest text-text-tertiary">Total Revenue</span>
                    </div>
                    <span className="text-lg font-semibold font-mono text-emerald">{formatCurrency(summary.total_revenue_taka)}</span>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-cyan" />
                      <span className="text-[0.6rem] uppercase tracking-widest text-text-tertiary">Volume Sold</span>
                    </div>
                    <span className="text-lg font-semibold font-mono text-cyan">{formatKg(summary.total_volume_kg)}</span>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-blue-400" />
                      <span className="text-[0.6rem] uppercase tracking-widest text-text-tertiary">Buyers</span>
                    </div>
                    <span className="text-lg font-semibold font-mono text-blue-400">{summary.buyer_count}</span>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-4 h-4 text-amber-400" />
                      <span className="text-[0.6rem] uppercase tracking-widest text-text-tertiary">Sellers</span>
                    </div>
                    <span className="text-lg font-semibold font-mono text-amber-400">{summary.seller_count}</span>
                  </div>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-4 h-4 text-cyan" />
                    <h2 className="text-sm font-medium text-text-primary">Revenue by Waste Type</h2>
                  </div>
                  {byWasteType.length === 0 ? (
                    <p className="text-sm text-text-tertiary text-center py-6">No completed transactions yet</p>
                  ) : (
                    <div className="space-y-3">
                      {byWasteType.map((w) => {
                        const maxRevenue = Math.max(...byWasteType.map((b) => b.revenue_taka));
                        const pct = maxRevenue > 0 ? (w.revenue_taka / maxRevenue) * 100 : 0;
                        return (
                          <div key={w.waste_type}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-text-primary">{w.waste_type}</span>
                              <span className="text-xs font-mono text-text-secondary">{formatCurrency(w.revenue_taka)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan to-emerald transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[0.55rem] text-text-tertiary mt-0.5">
                              <span>{w.order_count} order(s)</span>
                              <span>{formatKg(w.volume_kg)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="glass-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="w-4 h-4 text-blue-400" />
                      <h2 className="text-sm font-medium text-text-primary">Top Buyers</h2>
                    </div>
                    {topBuyers.length === 0 ? (
                      <p className="text-sm text-text-tertiary text-center py-6">No data yet</p>
                    ) : (
                      <div className="space-y-2">
                        {topBuyers.map((b, i) => (
                          <div key={b.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                            <span className="w-5 text-center text-[0.6rem] font-bold text-text-tertiary">#{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-text-primary truncate">{b.name}</div>
                              <div className="text-xs text-text-tertiary">{b.order_count} orders · {formatKg(b.total_volume_kg)}</div>
                            </div>
                            <span className="font-mono text-sm text-emerald">{formatCurrency(b.total_revenue_taka)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="glass-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="w-4 h-4 text-amber-400" />
                      <h2 className="text-sm font-medium text-text-primary">Top Sellers</h2>
                    </div>
                    {topSellers.length === 0 ? (
                      <p className="text-sm text-text-tertiary text-center py-6">No data yet</p>
                    ) : (
                      <div className="space-y-2">
                        {topSellers.map((s, i) => (
                          <div key={s.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                            <span className="w-5 text-center text-[0.6rem] font-bold text-text-tertiary">#{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-text-primary truncate">{s.name}</div>
                              <div className="text-xs text-text-tertiary">{s.order_count} orders · {formatKg(s.total_volume_kg)}</div>
                            </div>
                            <span className="font-mono text-sm text-cyan">{formatCurrency(s.total_revenue_taka)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
