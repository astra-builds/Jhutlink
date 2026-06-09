# JhutLink Marketplace v2 — Full Specification

> **Status:** Draft / Pre-Implementation
> **Last Updated:** 2026-06-07
> **Supersedes:** Original sealed-bid + two-pool + tier system (deprecated)

---

## 1. Vision

A clean, real-time textile waste marketplace where buyers and sellers transact with full transparency. Every bid is visible, every price is competitive, and the entire lifecycle from listing to payment completion is automatic.

### Core Principles

| Principle | What it means |
|-----------|---------------|
| **One market, one pool** | No reserved pools, no tier splitting. Everyone competes for the full listing quantity. |
| **Real-time visibility** | All bids are visible to all participants instantly. Price competition drives value. |
| **Automatic lifecycle** | Auctions close on timer, allocation runs automatically, no manual Accept/Allocate confusion. |
| **Simplicity first** | If a feature requires a paragraph of explanation, it's too complex. Remove it. |

### What's Removed (from v1)

| Feature | Reason |
|---------|--------|
| Micro/Mid/Enterprise tier system | Artificial pool reservation wastes seller supply. Pure price competition is simpler and fairer. |
| Two-pool allocation (20/80 split) | Confusing, inefficient, never tracked correctly after manual accepts. |
| Individual bid Accept mid-auction | Undermines the allocation engine. Sellers get one fair allocation at auction end. |
| Sealed bids | Zero competitive tension. Buyers can't see what they need to beat. |
| AI listing description generator | Useless — paraphrases 4 data fields into 80 words. No genuine insight. |
| Hardcoded marketing analytics (`Analytics.tsx`) | Fake data, no real value. Replaced with real transaction analytics. |

---

## 2. Auction Model: Real-Time Visible Bidding

### How It Works

1. Seller creates a listing → goes `ACTIVE` immediately
2. Live countdown starts (`24h` / `48h` / `72h`)
3. Buyers see the **price ladder** — all bids sorted by price descending, with buyer names visible
4. **Current highest bid** is always displayed prominently at the top
5. Buyers place bids at or above `current_highest + min_increment`
6. When countdown hits zero → **auto-closes** → **auto-allocates** → orders + escrows created

### Bid Board Layout

```
┌──────────────────────────────────────────────┐
│  ৳28.00/kg    Current Best    Bidder A       │ ← always visible, prominent
│  + ৳1.00/kg   min increment                  │
├──────────────────────────────────────────────┤
│  Live Bids                                     │
├──────────────────────────────────────────────┤
│  ↓ Bidder A      80 kg    ৳28.00    2m ago  │ ← current leader
│    Bidder B     100 kg    ৳27.00    5m ago  │
│    Bidder C      60 kg    ৳25.50   12m ago  │
│    Bidder A      50 kg    ৳25.00   15m ago  │ ← previous bid (history)
├──────────────────────────────────────────────┤
│  Timer: 11h 31m  (auto-extend: ON)           │
│  [Place Bid — minimum ৳28.00/kg]            │ ← one-click bid
└──────────────────────────────────────────────┘
```

### Bidding Rules

| Rule | Value |
|------|-------|
| Minimum bid quantity | 50 kg |
| Minimum price increment | `max(50 paisa, current_highest × 0.02)` — i.e. 2% or ৳0.50, whichever is larger |
| Maximum per buyer | 60% of total listing quantity (prevents monopoly) |
| Must meet reserve | Bid price per kg must be ≥ listing's `reserve_price_paisa` |

### Anti-Sniping

- If a bid arrives in the **last 60 seconds** → auction end time extends by **+60 seconds**
- Maximum **5 extensions** per auction (prevents infinite loop)

### Auto-Close

- A background job runs every 30 seconds
- Finds all `ACTIVE` listings where `auction_end_time < now`
- Transitions them to `CLOSED` and triggers allocation automatically

---

## 3. Entity Design

### Listing

```
listing_id:              int           (auto-increment)
seller_id:               int
waste_type:              enum          {Cotton, Polyester, Mixed, Denim, Synthetic Blend}
quality_grade:           enum          {A, B, C}
quantity_kg:             int           (total, no pool split)
remaining_kg:            int           (runtime: total - reserved - sold)
reserve_price_paisa:     int           (minimum price per kg in paisa)
location_district:       str
photos:                  list[str]
auction_duration_hours:  int           {24, 48, 72}
status:                  enum          {DRAFT, ACTIVE, CLOSED, SOLD, EXPIRED}
current_highest_paisa:   int           (runtime: highest bid price, updated in real-time)
created_at:              datetime
auction_end_time:        datetime
history:                 list[dict]    (state transition audit log)
```

**Changes from v1:**
- Removed `quantity_reserved_kg` and `quantity_available_kg` — one pool
- Added `current_highest_paisa` — updated on each new bid
- `remaining_kg` still tracks runtime available quantity

### Bid

```
bid_id:                  int           (auto-increment)
listing_id:              int
buyer_id:                int
buyer_name:              str           (denormalized for bid board display)
quantity_kg:             int
price_per_kg_paisa:      int
status:                  enum          {PENDING, MATCHED, OUTBID, VOID}
quantity_allocated_kg:   int | None    (set by allocation engine)
created_at:              datetime
matched_at:              datetime | None
```

**Changes from v1:**
- Removed `buyer_tier`, `original_quantity_kg` — no longer needed
- Added `buyer_name` for direct display on bid board

### Order (unchanged from v1 structure)

```
order_id:                int
listing_id:              int
seller_id:               int
buyer_id:                int
quantity_kg:             int
price_per_kg_paisa:      int
total_value_paisa:       int
status:                  enum          {PAYMENT_PENDING, CONFIRMED, IN_TRANSIT, DELIVERED, COMPLETED, DISPUTED, CANCELLED}
escrow_id:               int
created_at:              datetime
updated_at:              datetime
history:                 list[dict]
```

### Escrow (unchanged)

```
escrow_id:               int
order_id:                int
amount_paisa:            int
state:                   enum          {AWAITING_PAYMENT, FUNDS_HELD, SELLER_PREPARING, IN_TRANSIT, DELIVERED_PENDING, CONFIRMED, COMPLETED, IN_DISPUTE, CANCELLED}
created_at:              datetime
```

### User (simplified — no tiers)

```
id:                      int
name:                    str
email:                   str
password_hash:           str
role:                    enum          {buyer, seller, admin}
status:                  enum          {pending_verification, active, suspended, banned}
created_at:              datetime
```

**Changes from v1:**
- Removed `tier`, `monthly_volume` from Buyer
- Removed buyer-specific bid limits tied to tier

---

## 4. Allocation Engine

### Trigger

Allocation runs automatically when an auction closes (either by timer expiry or seller-initiated close).

### Algorithm

```
Input:  Listing (CLOSED), all PENDING bids for this listing
Output: AllocationResult (matched, outbid, unallocated)

1. Filter bids to only PENDING status for this listing
2. Sort by price_per_kg_paisa DESC, then created_at ASC (highest price wins, earliest breaks ties)
3. Apply per-buyer volume cap:
   - max_per_buyer = listing.quantity_kg × 0.60
   - Each buyer's total allocated quantity cannot exceed max_per_buyer
4. Walk sorted list:
   for each bid:
     available = listing.remaining_kg
     if available == 0:
       bid.outbid()
     elif bid.quantity_kg <= available:
       bid.match(bid.quantity_kg)       // full fill
       listing.confirm_sold(bid.quantity_kg)
     else:
       bid.match(available)              // partial fill
       listing.confirm_sold(available)
5. Create Order + Escrow for each matched bid
6. If listing.remaining_kg > 0:
     // partial sale — seller keeps remainder
     listing remains CLOSED
   else:
     listing.mark_sold()
7. Notify matched and outbid buyers
```

### Key Properties

- **Greedy** — highest price gets filled first, always
- **Deterministic** — same input always produces same output
- **Fair** — earliest bid wins ties at the same price
- **No pool splitting** — single pass, single pool

---

## 5. API Routes

### Listings

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/listings` | Marketplace feed (filters + sort + pagination) | Public |
| POST | `/api/listings` | Create listing | Seller |
| GET | `/api/listings/:id` | Listing detail (with current highest bid) | Public |
| POST | `/api/listings/:id/close` | Manually close auction | Seller (owner) |
| GET | `/api/listings/:id/bids` | Bid board (sorted by price desc) | Auth |
| POST | `/api/listings/:id/bids` | Place a bid | Buyer |
| POST | `/api/listings/:id/allocate` | Trigger allocation (redundant if auto, useful for manual) | Seller (owner) |
| POST | `/api/listings/:id/watchlist` | Toggle watchlist | Buyer |
| GET | `/api/listings/:id/watchlist/status` | Check watchlist status | Buyer |

### Orders

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/orders` | List my orders (buyer or seller) | Auth |
| GET | `/api/orders/:id` | Order detail + escrow summary | Participant |
| POST | `/api/orders/:id/confirm` | Buyer pays escrow (bKash simulation) | Buyer |
| POST | `/api/orders/:id/ship` | Seller marks shipped | Seller |
| POST | `/api/orders/:id/deliver` | Buyer confirms delivery | Buyer |
| POST | `/api/orders/:id/complete` | Buyer releases funds | Buyer |
| POST | `/api/orders/:id/dispute` | Buyer opens dispute | Buyer |
| POST | `/api/orders/:id/cancel` | Cancel order (refund if escrowed) | Participant |

### Analytics

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/analytics/transactions` | Completed transactions with filters | Auth |
| GET | `/api/analytics/summary` | Aggregated stats (revenue, volume, trends) | Auth |
| GET | `/api/analytics/by-waste-type` | Volume/revenue breakdown by waste type | Auth |
| GET | `/api/analytics/top-buyers` | Top buyers by volume | Auth |
| GET | `/api/analytics/top-sellers` | Top sellers by volume | Auth |

### Auth

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/auth/register` | Register user | Public |
| POST | `/api/auth/login` | Login | Public |
| GET | `/api/auth/me` | Current user info | Auth |

### Platform

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/stats` | Platform stats (listings, transactions, volume) | Public |

---

## 6. Frontend Pages

### A. Marketplace Page (`/marketplace`)

```
┌─────────────────────────────────────────────┐
│  🔍 Search...  [Polyester] [Grade B] [Sort] │ ← filter bar
├─────────────────────────────────────────────┤
│  [Polyester] [Denim] [Mixed] [All]          │ ← waste type tabs
├─────────────────────────────────────────────┤
│  ┌──────────── Listing Cards ─────────────┐ │
│  │ Polyester Grade B        ৳28.00/kg ↑  │ │
│  │ 200 kg · Savar · Ends 11h             │ │
│  │ ★ Watchlist    3 bids                  │ │
│  │ [Place Bid]                             │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │ Denim Grade A              ৳15.00/kg  │ │
│  │ 500 kg · Gazipur · Ends 2d             │ │
│  │ ★ Watchlist    7 bids                  │ │
│  │ [Place Bid]                             │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Key states:**
- **Empty:** "No listings match your filters" with link to clear filters
- **Loading:** Skeleton cards (3-4)
- **Error:** "Failed to load marketplace" with retry button
- **No results:** Friendly message + suggested actions

### B. Listing Detail Page (`/listings/:id`)

Two-column layout:

```
┌───────────────────────────┬──────────────────────────┐
│  Polyester — Grade B      │  ৳28.00/kg              │
│  Location: Savar          │  ↑ Current Best          │
│  200 kg total             │  Bidder A                │
│  ──── Photo Gallery ────  │                          │
│  [img] [img] [img] [img]  │  ── Bid Board ──         │
│                           │  A  80kg  ৳28   2m ago  │
│  ──── Info Grid ────      │  B 100kg  ৳27   5m ago  │
│  Duration: 24h            │  C  60kg  ৳25  12m ago  │
│  Time Left: 11h 31m       │  A  50kg  ৳25  15m ago  │
│  Reserve: ৳25.00/kg      │                          │
│                           │  ── Place Bid ──         │
│  ──── Seller Info ──      │  Min increment: ৳1.00   │
│  Rahim Textile Mills      │  Qty: [___] kg           │
│  ★ 4.2 (12 orders)        │  Price: [৳___] /kg      │
│                           │  ──────────────────────  │
│  ──── Trust ──────        │  Total: ৳2,240          │
│  ✓ Escrow Protected       │                          │
│  ✓ Quality Verified       │  [Place Bid at ৳28.00]  │
│                           │                          │
└───────────────────────────┴──────────────────────────┘
```

**Key states:**
- **Not started (DRAFT):** "Listing not yet live"
- **Active:** Full bid board + place bid form
- **Closed (allocating):** "Auction ended. Allocation in progress..."
- **Sold:** "Auction ended. X bids matched." Show allocation results.
- **Expired:** "No bids were placed." Seller can re-list.
- **Loading:** Skeleton layout (2-column skeleton)
- **Not found:** "Listing not found" with back link

### C. Buyer Dashboard (`/dashboard/buyer`)

```
┌─ My Active Bids ───────────────────────────┐
│  Poly B | 80kg @ ৳28 | 11h left | LEADING │
│  Denim A | 50kg @ ৳15 | 3h left | OUTBID  │ ← "Bid Again" button
├─ My Watchlist ─────────────────────────────┤
│  Polyester Grade B — Savar — Ends 11h      │
│  Denim Grade A — Gazipur — Ends 2d         │
├─ Recent Orders ────────────────────────────┤
│  #42 | Poly B | 80kg | PAYMENT PENDING     │ → Pay now
│  #41 | Mixed C | 60kg | IN TRANSIT         │ → Track
└────────────────────────────────────────────┘
```

### D. Seller Dashboard (`/dashboard/seller`)

```
┌─ My Listings ──────────────────────────────┐
│  Poly B | 200kg | ACTIVE | 3 bids | CLOSE  │
│  Denim A | 100kg | CLOSED | ALLOCATED      │ → View Results
├─ Active Orders ────────────────────────────┤
│  #42 | Buyer A | 80kg | PAYMENT PENDING    │
│  #41 | Buyer B | 100kg | IN TRANSIT        │ → Ship
├─ Quick Stats ──────────────────────────────┤
│  12 total orders  ·  ৳45,200 revenue       │
│  4 active listings ·  2 sold this month    │
└────────────────────────────────────────────┘
```

### E. Order Detail Page (`/orders/:id`)

```
┌────────────────────────────────────────────┐
│  Order #42 — Polyester Grade B             │
│  80 kg @ ৳28.00/kg = ৳2,240               │
│  Buyer: Green Recyclers Ltd                │
│  Seller: Rahim Textiles                    │
├─ Escrow Timeline ──────────────────────────┤
│  ● Payment Pending  (you are here)         │
│  ○ Funds Held                              │
│  ○ In Transit                              │
│  ○ Delivered                               │
│  ○ Completed                               │
│                                            │
│  ── Escrow Details ──                      │
│  Total: ৳2,240  ·  Fee: ৳22.40  ·         │
│  Payout: ৳2,217.60                         │
│                                            │
│  [Pay Now — ৳2,240 via bKash]             │
│  [Cancel Order]                            │
└────────────────────────────────────────────┘
```

### F. Analytics & Transaction History (`/dashboard/analytics`)

```
┌─ Tabs ─────────────────────────────────────┐
│  [Transactions]  [Analytics]               │
├─ Transactions Tab ─────────────────────────┤
│  🔍 Search by order ID, buyer, seller...   │
│  [Last 30 days] [Polyester] [Completed]    │
├────────────────────────────────────────────┤
│  #42 | Poly B | 80kg | ৳2,240 | 06/05/26  │
│  #41 | Mixed C | 60kg | ৳1,380 | 06/03/26  │
│  #40 | Denim A | 100kg | ৳1,700 | 05/28/26 │
│  #39 | Poly B | 50kg | ৳1,400 | 05/25/26   │
│                                            │
│  [← Prev]  Page 1 of 5  [Next →]          │
│  [Export CSV]                              │
├─ Analytics Tab (when active) ──────────────┤
│  ┌─ Revenue (Last 30 days) ──────────┐     │
│  │  📈 Line chart: daily revenue      │     │
│  │  Total: ৳45,200  ·  Avg: ৳1,507  │     │
│  └────────────────────────────────────┘     │
│  ┌──  By Waste Type  ──┐ ┌── Top Buyers ──┐│
│  │ 🥧 Polyester: 42%   │ │ G.Recyclers:  ││
│  │    Denim: 28%       │ │  ৳12,400       ││
│  │    Mixed: 18%       │ │ EcoFibre:      ││
│  │    Cotton: 12%      │ │  ৳8,200        ││
│  └─────────────────────┘ └────────────────┘│
└────────────────────────────────────────────┘
```

**Key analytics metrics (computed from real order data):**
- Total revenue (completed orders only)
- Pending payout (payment_pending + confirmed)
- Total kg sold
- Average price per kg
- Revenue by waste type (breakdown)
- Top buyers by volume
- Top sellers by volume
- Active listing count
- Order conversion rate (sold / total)

### G. Auth Page (`/auth`)

```
┌────────────────────────────────────┐
│  [Login]  [Register]               │
├────────────────────────────────────┤
│  Email: [________________]         │
│  Password: [______________]        │
│                                    │
│  [Sign In]                         │
│                                    │
│  Don't have an account? Register   │
└────────────────────────────────────┘
```

### H. Demo Console (`/demo`)

```
┌─ Demo Controls ────────────────────────────┐
│  ⏩ Speed: [1x] [10x] [100x]               │
│                                            │
│  👤 Active Account: Rahim Textiles         │
│  ┌─ Switch Account ─────────────────┐      │
│  │  Rahim Textiles (Seller)          │      │
│  │  Green Recyclers (Buyer)          │      │
│  │  EcoFibre (Buyer - Small)         │      │
│  │  Big Factory Ltd (Buyer - Large)  │      │
│  └───────────────────────────────────┘      │
│                                            │
│  ▶ Story Mode: Step 3/8 — Bidding          │
│  [Auto-generate bids]  [Skip to end]       │
│                                            │
│  ── Story Steps ──                         │
│  1. Listing created ✓                      │
│  2. Bids placed ✓                          │ ← back
│  3. Counter-bids in progress               │ ← here
│  4. Auction closes                        │ → next
│  5. Allocation runs                        │
│  6. Orders created                         │
│  7. Payment + shipment                     │
│  8. Delivery + completion                  │
└────────────────────────────────────────────┘
```

---

## 7. Layout & Navigation

### Main Navigation

```
[Logo]  [Marketplace]  [Dashboard]  [Analytics]  [Sign In/Sign Up]

→ When signed in as buyer:         [My Bids]    [My Orders]   [Watchlist]
→ When signed in as seller:        [My Listings] [Orders]      [Create Listing]
→ When in demo mode:               [Demo Console] (highlighted)
```

### Route Map

| Route | Page | Roles |
|-------|------|-------|
| `/` | Home (landing) | Public |
| `/marketplace` | Marketplace feed | Public |
| `/listings/:id` | Listing detail | Public |
| `/auth` | Login / Register | Public |
| `/dashboard/buyer` | Buyer dashboard | Buyer |
| `/dashboard/buyer/orders` | Buyer's orders | Buyer |
| `/dashboard/buyer/watchlist` | Buyer's watchlist | Buyer |
| `/dashboard/seller` | Seller dashboard | Seller |
| `/dashboard/seller/listings` | Seller's listings | Seller |
| `/dashboard/seller/orders` | Incoming orders | Seller |
| `/dashboard/seller/analytics` | Seller analytics | Seller |
| `/dashboard/analytics` | Analytics & Transactions | Auth |
| `/orders/:id` | Order detail | Participant |
| `/demo` | Demo console | Demo mode |

---

## 8. Demo Mode (Project Show)

### Purpose

The demo mode exists so that at the project show, a presenter can walk through the **entire marketplace lifecycle** in 2-3 minutes without needing real users, real time, or manual data entry.

### Features

| Feature | Description |
|---------|-------------|
| **Pre-seeded accounts** | 1 seller + 3 buyers with realistic names and profiles |
| **Account switcher** | Click to switch between accounts instantly (no login required) |
| **Speed controls** | 1x / 10x / 100x — fast-forwards the auction countdown |
| **Skip to end** | Instantly closes the current auction and runs allocation |
| **Auto-bid generator** | Generates realistic competing bids at strategic price points |
| **Story Mode** | Guided 8-step walkthrough with Next/Back navigation |
| **Time warp** | Jump to any step of the lifecycle on demand |

### Story Mode Steps

| Step | Title | What happens |
|------|-------|-------------|
| 1 | Listing Created | Seller creates a Polyester Grade B listing. Demo auto-fills the form. |
| 2 | Bids Placed | Two buyers place initial bids at different prices. |
| 3 | Counter-Bids | A buyer outbids the leader. Price ladder updates. |
| 4 | Auction Closes | Timer hits zero (or user clicks Skip). Listing closes. |
| 5 | Allocation Runs | Engine matches bids. Winners and outbids displayed. |
| 6 | Orders Created | Orders + escrows auto-created. Payment pending. |
| 7 | Payment & Shipment | Buyer pays via bKash simulation. Seller ships. |
| 8 | Delivery & Complete | Buyer confirms delivery, releases funds. Transaction complete. |

---

## 9. Implementation Phases

| Phase | Scope | Key Files |
|-------|-------|-----------|
| **P1** | Simplified entities (remove tiers, pool split) | `backend/entities/listing.py`, `bid.py`, `user.py` |
| **P2** | Real-time auction engine (price ladder, anti-sniping, auto-close) | `backend/services/auction_engine.py` (new) |
| **P3** | Simplified allocation engine (single pool greedy fill) | `backend/services/auction_engine.py` |
| **P4** | API routes (listings, bids, allocation, analytics) | `backend/api/routes/*.py` |
| **P5** | Frontend: Listing Detail (bid board + place bid) | `app/src/pages/ListingDetailPage.tsx` |
| **P6** | Frontend: Marketplace, Dashboards, Order Detail | `app/src/pages/*.tsx` |
| **P7** | Analytics & Transaction History page | `app/src/pages/AnalyticsPage.tsx` + `backend/api/routes/analytics.py` |
| **P8** | Demo Console + Story Mode | `app/src/pages/DemoConsole.tsx` + `backend/services/demo_service.py` |
| **P9** | Cleanup: remove AI description, remove dead code | Various |

---

## 10. Data Flow Diagrams

### Auction Lifecycle

```
Seller                  System                  Buyers
  │                       │                       │
  ├── Create Listing ───→ │                       │
  │                       ├── Auction ACTIVE ────→│ (visible in marketplace)
  │                       │                       │
  │                       │◄──────────────────────├── Place Bid
  │                       ├── Update bid board ──→│ (all buyers see update)
  │                       │                       │
  │                       │◄──────────────────────├── Outbid, place higher
  │                       ├── Update bid board ──→│
  │                       │                       │
  │                       │  (countdown hits 0)   │
  │                       ├── Auto-close          │
  │                       ├── Run allocation      │
  │                       ├── Create orders       │
  │◄──────────────────────├── Allocation result ─→│ (matched/outbid)
  │                       │                       │
  │                       │  (order lifecycle)    │
  │◄──────────────────────├── Payment pending ───→│ (buyer pays)
  │◄──────────────────────├── Funds held ────────→│
  │── Ship order ───────→├── In transit ────────→│
  │                       │◄──────────────────────├── Confirm delivery
  │                       │◄──────────────────────├── Release funds
  │◄──────────────────────├── Completed ─────────→│
```

### Bid Flow (Real-time)

```
Client A                          Server                     Client B
  │                                │                           │
  │── POST /listings/1/bids ──────→│                           │
  │   {qty: 80, price: 2800}      │                           │
  │                                ├── Validate bid            │
  │                                ├── Update current_highest  │
  │                                ├── Persist bid             │
  │                                │                           │
  │←── 201 Created ───────────────│                           │
  │                                │                           │
  │                                ├── Broadcast to WebSocket ─→│
  │                                │   {bidder: "Bidder A",    │
  │                                │    qty: 80, price: 28}    │
  │                                │                           │
  │                                │←── POST /listings/1/bids ─│
  │                                │   {qty: 100, price: 29}  │
  │                                │                           │
  │←── WebSocket: B outbid you ───│                           │
  │   {new_leader: "Bidder B",    │                           │
  │    new_price: 29}              │                           │
```

---

## 11. State Management (Frontend)

### Component Tree

```
App
├── AuthContext (user, login, logout, switchAccount)
├── DemoContext (speed, storyStep, isDemoMode)
├── Routes
│   ├── Home
│   │   ├── Hero (stats from /api/stats)
│   │   ├── Featured Listings
│   │   └── How It Works
│   ├── MarketplacePage
│   │   ├── FilterBar
│   │   └── ListingCard (×N)
│   ├── ListingDetailPage
│   │   ├── ListingInfo
│   │   ├── BidBoard (price ladder)
│   │   ├── BidForm (qty + price + total)
│   │   ├── CountdownTimer
│   │   └── TrustSignals
│   ├── BuyerDashboard
│   │   ├── ActiveBids
│   │   ├── Watchlist
│   │   └── RecentOrders
│   ├── SellerDashboard
│   │   ├── MyListings
│   │   ├── ActiveOrders
│   │   └── QuickStats
│   ├── OrderDetailPage
│   │   ├── OrderHeader
│   │   ├── EscrowTimeline
│   │   ├── EscrowDetailsPanel
│   │   ├── OrderActions
│   │   └── PaymentModal / DisputeModal
│   ├── AnalyticsPage
│   │   ├── TransactionHistory (table + filters + export)
│   │   ├── RevenueChart (line)
│   │   ├── WasteTypeBreakdown (pie)
│   │   └── TopBuyers / TopSellers
│   └── DemoConsole
│       ├── SpeedControls
│       ├── AccountSwitcher
│       └── StoryMode (8-step guide)
```

---

## 12. Key Decisions & Rationale

| Decision | Why |
|----------|-----|
| **No tiers** | Pure price competition is simpler and more efficient. Reserved pool waste is eliminated. |
| **No individual bid accept** | Eliminates confusing dual-path (Accept vs Allocate). One fair allocation at end. |
| **Visible buyer names** | Creates social proof and competitive tension. Buyers see who they're bidding against. |
| **Minimum price increment** | Prevents bidding wars at 1-paisa increments. Keeps prices moving meaningfully. |
| **Anti-sniping** | Prevents last-second sniping. Gives everyone a fair chance to respond. |
| **Auto-close on timer** | No manual "Close auction" needed. Timer is authoritative. |
| **Greedy allocation** | Simplest possible algorithm. Highest price wins. Deterministic and fair. |
| **60% per-buyer cap** | Prevents any single buyer from monopolizing a listing. Only structural protection needed. |
| **Analytics from real data** | No more hardcoded fake numbers. Every metric is computed from actual transactions. |

---

## 13. Files to Create vs. Modify

### New Files

| File | Purpose | Phase |
|------|---------|-------|
| `backend/services/auction_engine.py` | Real-time bidding + allocation (replaces `bidding_engine.py`) | P2 |
| `backend/api/routes/analytics.py` | Analytics & transaction history endpoints | P4 |
| `backend/services/demo_service.py` | Demo mode: pre-seeded accounts, auto-bid, fast-forward | P8 |
| `app/src/pages/AnalyticsPage.tsx` | Analytics & transaction history UI | P7 |
| `app/src/pages/DemoConsole.tsx` | Demo mode console UI | P8 |

### Modified Files

| File | Changes | Phase |
|------|---------|-------|
| `backend/entities/listing.py` | Remove pool split, add `current_highest_paisa` | P1 |
| `backend/entities/bid.py` | Remove `buyer_tier`, remove `original_quantity_kg` | P1 |
| `backend/entities/user.py` | Remove tier from Buyer, remove tier thresholds | P1 |
| `backend/entities/order.py` | Minor adjustments for new flow | P1 |
| `backend/services/bidding_engine.py` | **Delete** — replaced by `auction_engine.py` | P2 |
| `backend/services/listing_manager.py` | Adjust for auto-close, no pool split | P2 |
| `backend/services/order_manager.py` | Minor adjustments | P3 |
| `backend/api/main.py` | Wire new routes, update `/stats` endpoint | P4 |
| `backend/api/routes/listings.py` | Remove allocate endpoint, add close endpoint | P4 |
| `backend/api/routes/bids.py` | Simplify (no tier, no manual accept) | P4 |
| `backend/api/dependencies.py` | Update service injections | P4 |
| `backend/storage/json_storage.py` | Minor adjustments for new entity shapes | P1 |
| `app/src/lib/api.ts` | Remove `generateAIDescription`, update bid interfaces | P5 |
| `app/src/pages/ListingDetailPage.tsx` | Complete rewrite — bid board, no AI, no manual accept | P5 |
| `app/src/pages/MarketplacePage.tsx` | Update for new listing format | P6 |
| `app/src/pages/DashboardBuyer.tsx` | Update for new bid/order model | P6 |
| `app/src/pages/DashboardSeller.tsx` | Remove manual accept, add close | P6 |
| `app/src/pages/OrderDetailPage.tsx` | Minor updates | P6 |
| `app/src/App.tsx` | Add analytics + demo routes | P6 |
| `app/src/sections/Analytics.tsx` | **Delete** — hardcoded fake data, replaced by real analytics page | P7 |

---

## 14. Demo Accounts (Pre-seeded)

| Name | Role | Tier Label | Email |
|------|------|-----------|-------|
| Rahim Textiles | Seller | — | rahim@demo.jhutlink |
| Green Recyclers Ltd | Buyer | Mid-volume | green@demo.jhutlink |
| EcoFibre Bangladesh | Buyer | Small buyer | eco@demo.jhutlink |
| Big Factory Ltd | Buyer | Large buyer | big@demo.jhutlink |

Each account has:
- Pre-configured profile with realistic data
- `demo_auto` flag — enables auto-bid generation when in demo mode
- Password: `demo123` (hardcoded for demo convenience)

---

## 15. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| **Zero bids at close** | Listing marked `EXPIRED`. Seller notified. Can re-list. |
| **Partial fill** | Remaining quantity stays on seller's inventory. Seller can re-list remainder. |
| **Two identical bids (same price, same time)** | Earlier `created_at` wins. Tiebreaker is deterministic. |
| **Bid exceeds remaining quantity** | Frontend validation blocks it. Backend validates again. Partial fill at allocation if needed. |
| **Buyer tries to bid >60% cap** | Frontend warns. Backend rejects with clear message. |
| **Auction extended 5 times already** | Anti-sniping stops extending. Auction closes at the 5th extension's end. |
| **Payment timeout (24h)** | Order auto-cancels after 24h of payment pending. Quantity released back. |
| **Network disconnect during bid** | Bid is submitted via POST (idempotent). Socket.IO reconnects and refreshes state. |
| **Server restarts during auction** | Auctions persist in JSON storage. On restart, timers are checked for expired auctions. |
| **Seller deletes account mid-auction** | Listing remains active until close. Funds held in escrow are released per normal flow. |
