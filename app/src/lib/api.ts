const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "buyer" | "seller" | "admin";
  status: string;
  created_at: string;
  trade_license?: string;
  rating?: number;
  listing_count?: number;
  strikes?: number;
  watchlist?: string[];
  department?: string;
}

export interface Listing {
  listing_id: number;
  seller_id: number;
  waste_type: string;
  quantity_kg: number;
  remaining_kg: number;
  current_highest_taka: number;
  reserve_price_taka: number;
  quality_grade: string;
  location_district: string;
  photos: string[];
  auction_duration_hours: number;
  extension_count: number;
  status: string;
  created_at: string;
  auction_end_time?: string;
}

export interface ListingResponse {
  listings: Listing[];
  total: number;
  offset: number;
  limit?: number | null;
}

export interface Bid {
  bid_id: number;
  listing_id: number;
  buyer_id: number;
  quantity_kg: number;
  price_per_kg_taka: number;
  status: string;
  created_at: string;
  waste_type?: string;
  quality_grade?: string;
  listing_status?: string;
}

export interface Notification {
  notification_id: number;
  recipient_id: number;
  notification_type: string;
  channel: string;
  title: string;
  body: string;
  metadata: Record<string, any>;
  status: string;
  created_at: string;
  read_at: string | null;
}

export interface NotificationCount {
  unread: number;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  strikes?: number;
  listing_count?: number;
}

export interface AdminDispute {
  order_id: number;
  listing_id: number;
  buyer_id: number;
  seller_id: number;
  quantity_kg: number;
  total_value_taka: number;
  status: string;
  escrow_state?: string;
  created_at: string;
}

export interface AllocateResult {
  listing_id: number;
  matched_count: number;
  outbid_count: number;
  unallocated_kg: number;
  weighted_avg_price_taka: number;
  orders_created: Array<{
    order_id: number;
    buyer_id: number;
    quantity_kg: number;
    total_value_taka: number;
    escrow_id: number;
  }>;
}

export interface BulkCreateResult {
  total_attempted: number;
  total_created: number;
  total_failed: number;
  created: Array<Record<string, any>>;
  failed: Array<{ row: Record<string, any>; reason: string }>;
}

export interface Order {
  order_id: number;
  listing_id: number;
  buyer_id: number;
  seller_id: number;
  quantity_kg: number;
  price_per_kg_taka: number;
  total_value_taka: number;
  status: string;
  escrow_id: number;
  escrow_state: string;
  created_at: string;
  updated_at: string;
}

export interface OrderDetail extends Order {
  price_per_kg_taka: number;
  seller_payout_taka?: number;
  platform_fee_taka?: number;
  reason?: string;
  history?: Array<{ timestamp: string; event: string; from_state?: string; to_state?: string }>;
}

export interface Recommendation {
  listing_id: number;
  waste_type: string;
  quality_grade: string;
  quantity_kg: number;
  reserve_price_taka: number;
  location_district: string;
  auction_end_time?: string;
  score: number;
  score_breakdown: Record<string, number>;
  recommendation_label: string;
}

export interface Preferences {
  preference_id: number;
  buyer_id: number;
  preferred_waste_types: string[];
  preferred_grades: string[];
  min_quantity_kg: number;
  max_quantity_kg?: number;
  max_price_per_kg_taka?: number;
  preferred_districts: string[];
  updated_at: string;
}

export interface ApiError {
  status: number;
  detail?: string;
  message?: string;
}

export interface PlatformStats {
  active_listings: number;
  total_transactions_taka: number;
  total_waste_kg: number;
  pending_orders: number;
}

class ApiClient {
  private async fetch(path: string, options: RequestInit = {}): Promise<any> {
    const token = localStorage.getItem("jhutlink_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(API_BASE + path, { ...options, headers });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const error: ApiError = { status: res.status, ...errorData };
      throw error;
    }
    return res.json();
  }

  auth = {
    login: (email: string, password: string) =>
      this.fetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    register: (body: {
      name: string;
      email: string;
      password: string;
      role: string;
      trade_license?: string;
      department?: string;
    }) => this.fetch("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    me: (): Promise<AuthUser> => this.fetch("/auth/me"),
  };

  stats = {
    get: (): Promise<PlatformStats> => this.fetch("/stats"),
  };

  listings = {
    list: (params?: {
      waste_type?: string;
      quality_grade?: string;
      district?: string;
      search?: string;
      sort_by?: string;
      sort_order?: string;
      limit?: number;
      offset?: number;
    }): Promise<ListingResponse> => {
      const qs = new URLSearchParams();
      if (params?.waste_type) qs.set("waste_type", params.waste_type);
      if (params?.quality_grade) qs.set("quality_grade", params.quality_grade);
      if (params?.district) qs.set("district", params.district);
      if (params?.search) qs.set("search", params.search);
      if (params?.sort_by) qs.set("sort_by", params.sort_by);
      if (params?.sort_order) qs.set("sort_order", params.sort_order);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return this.fetch(`/listings${query ? `?${query}` : ""}`);
    },
    get: (id: number): Promise<Listing> =>
      this.fetch(`/listings/${id}`),
    create: (body: {
      waste_type: string;
      quantity_kg: number;
      reserve_price_taka: number;
      quality_grade: string;
      location_district: string;
      photos: string[];
      auction_duration_hours: number;
    }) =>
      this.fetch("/listings", { method: "POST", body: JSON.stringify(body) }),
    bids: (id: number): Promise<Bid[]> =>
      this.fetch(`/listings/${id}/bids`),
    bulkCreate: (csvRows: Record<string, any>[]): Promise<BulkCreateResult> =>
      this.fetch("/listings/bulk", {
        method: "POST",
        body: JSON.stringify(csvRows),
      }),
    close: (id: number): Promise<{
      listing_id: number; status: string; matched_bids: number;
      outbid_bids: number; orders_created: number; weighted_avg_price_taka: number;
    }> => this.fetch(`/listings/${id}/close`, { method: "POST" }),
    allocate: (id: number): Promise<{
      listing_id: number; status: string; matched_bids: number;
      outbid_bids: number; orders_created: number; weighted_avg_price_taka: number;
    }> => this.fetch(`/listings/${id}/allocate`, { method: "POST" }),
    toggleWatchlist: (listingId: number) =>
      this.fetch(`/listings/${listingId}/watchlist`, { method: "POST" }),
    watchlistStatus: (listingId: number): Promise<{ watchlisted: boolean }> =>
      this.fetch(`/listings/${listingId}/watchlist/status`),
  };

  bids = {
    list: (): Promise<Bid[]> =>
      this.fetch("/bids"),
    place: (listingId: number, quantity_kg: number, price_per_kg_taka: number) =>
      this.fetch(`/listings/${listingId}/bids`, {
        method: "POST",
        body: JSON.stringify({ quantity_kg, price_per_kg_taka }),
      }),
  };

  orders = {
    list: (): Promise<Order[]> => this.fetch("/orders"),
    get: (id: number): Promise<OrderDetail> =>
      this.fetch(`/orders/${id}`),
    confirm: (id: number, amount_taka: number) =>
      this.fetch(`/orders/${id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ amount_taka }),
      }),
    ship: (id: number) =>
      this.fetch(`/orders/${id}/ship`, { method: "POST" }),
    deliver: (id: number) =>
      this.fetch(`/orders/${id}/deliver`, { method: "POST" }),
    complete: (id: number) =>
      this.fetch(`/orders/${id}/complete`, { method: "POST" }),
    dispute: (id: number, reason: string) =>
      this.fetch(`/orders/${id}/dispute`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    cancel: (id: number, reason?: string) =>
      this.fetch(`/orders/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || "Order cancelled by user" }),
      }),
  };

  notifications = {
    list: (status?: string): Promise<Notification[]> => {
      const qs = status ? `?status=${status}` : "";
      return this.fetch(`/notifications${qs}`);
    },
    getCount: (): Promise<NotificationCount> =>
      this.fetch("/notifications/count"),
    markRead: (id: number) =>
      this.fetch(`/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () =>
      this.fetch("/notifications/read-all", { method: "POST" }),
  };

  admin = {
    listUsers: (role?: string, status?: string): Promise<AdminUser[]> => {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (status) params.set("status", status);
      const qs = params.toString();
      return this.fetch(`/admin/users${qs ? `?${qs}` : ""}`);
    },
    verifyUser: (userId: number) =>
      this.fetch(`/admin/users/${userId}/verify`, { method: "POST" }),
    banUser: (userId: number, reason: string) =>
      this.fetch(`/admin/users/${userId}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    listDisputes: (): Promise<AdminDispute[]> =>
      this.fetch("/admin/disputes"),
    resolveDispute: (orderId: number, ruling: string) =>
      this.fetch(`/admin/disputes/${orderId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ ruling }),
      }),
  };

  analytics = {
    transactions: (params?: {
      waste_type?: string; seller_id?: number; buyer_id?: number;
      limit?: number; offset?: number;
    }): Promise<{ transactions: any[]; total: number; offset: number; limit: number }> => {
      const qs = new URLSearchParams();
      if (params?.waste_type) qs.set("waste_type", params.waste_type);
      if (params?.seller_id) qs.set("seller_id", String(params.seller_id));
      if (params?.buyer_id) qs.set("buyer_id", String(params.buyer_id));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return this.fetch(`/analytics/transactions${query ? `?${query}` : ""}`);
    },
    summary: (): Promise<{
      total_orders: number; total_volume_kg: number; total_revenue_taka: number;
      active_listings: number; total_users: number; seller_count: number; buyer_count: number;
    }> => this.fetch("/analytics/summary"),
    byWasteType: (): Promise<Array<{
      waste_type: string; volume_kg: number; revenue_taka: number; order_count: number;
    }>> => this.fetch("/analytics/by-waste-type"),
    topBuyers: (limit?: number): Promise<Array<{
      user_id: number; name: string; total_volume_kg: number;
      total_revenue_taka: number; order_count: number;
    }>> => this.fetch(`/analytics/top-buyers${limit ? `?limit=${limit}` : ""}`),
    topSellers: (limit?: number): Promise<Array<{
      user_id: number; name: string; total_volume_kg: number;
      total_revenue_taka: number; order_count: number;
    }>> => this.fetch(`/analytics/top-sellers${limit ? `?limit=${limit}` : ""}`),
    aiInsights: (): Promise<{
      summary: string;
      price_forecast: Array<{ waste_type: string; direction: "up" | "flat" | "down"; range: string; reason: string }>;
      district_spotlight: string;
      key_insight: string;
    }> => this.fetch("/analytics/ai-insights"),
  };

  demo = {
    seed: (): Promise<{ created: number; total: number }> =>
      this.fetch("/demo/seed", { method: "POST" }),
    autoBids: (listingId: number): Promise<{ count: number; bids: any[] }> =>
      this.fetch(`/demo/auto-bids/${listingId}`, { method: "POST" }),
    fastForward: (listingId: number): Promise<{ listing_id: number; new_status: string; matched: number; outbid: number }> =>
      this.fetch(`/demo/fast-forward/${listingId}`, { method: "POST" }),
    fastForwardAll: (): Promise<{ count: number; results: any[] }> =>
      this.fetch("/demo/fast-forward-all", { method: "POST" }),
    timeWarp: (step: number): Promise<{ step: number; actions: string[] }> =>
      this.fetch(`/demo/time-warp/${step}`, { method: "POST" }),
  };

  recommendations = {
    list: (): Promise<Recommendation[]> =>
      this.fetch("/recommendations"),
    getPreferences: (): Promise<Preferences> =>
      this.fetch("/recommendations/preferences"),
    setPreferences: (body: {
      preferred_waste_types: string[];
      preferred_grades: string[];
      min_quantity_kg: number;
      max_quantity_kg?: number;
      max_price_per_kg_taka?: number;
      preferred_districts: string[];
    }): Promise<Preferences> =>
      this.fetch("/recommendations/preferences", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  };
}

export const api = new ApiClient();