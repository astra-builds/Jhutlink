# JhutLink — AI-Native Textile Waste Marketplace

A full-stack marketplace platform connecting textile waste sellers with verified buyers in Bangladesh. Features AI-powered listing descriptions, smart bidding engine, escrow-based payments, and real-time order tracking.

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS (shadcn/ui), GSAP, React Router
**Backend:** FastAPI, Python 3.11+, JWT auth, bcrypt
**Storage:** JSON file-based (ready for PostgreSQL migration)

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
uvicorn backend.api.main:app --reload --port 8000
```

### Frontend

```bash
cd app
npm install
npm run dev
```

Opens at `http://localhost:5173`. Backend runs at `http://localhost:8000`.

### Environment Variables

Copy `app/.env.example` to `app/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE` | No | `http://127.0.0.1:8000` | Backend URL |
| `VITE_GROQ_API_KEY` | No | — | Groq key for AI descriptions |
| `JWT_SECRET` | No | `jhutlink-dev-secret` | **Change in production** |

## Project Structure

```
backend/
  api/           FastAPI routes (auth, listings, bids, orders, admin, etc.)
  entities/      Domain models (Listing, Order, Bid, Escrow, User)
  services/      Business logic (BiddingEngine, OrderManager, EscrowService)
  storage/       JSON persistence layer
  data/          Runtime JSON files

app/
  src/
    pages/       Route-level components
    components/  Reusable UI (shadcn/ui + custom)
    sections/    Landing page sections
    lib/         API client, utilities
    utils/       Formatting helpers
    hooks/       Custom React hooks
    contexts/    Auth context
```

## Key Features

- **Smart Bidding Engine:** Tier-based allocation with Micro/Mid/Enterprise buyer pools
- **Escrow Payments:** Multi-state escrow with platform fee deduction and seller payout
- **Order Lifecycle:** PAYMENT_PENDING → CONFIRMED → IN_TRANSIT → DELIVERED → COMPLETED
- **AI Descriptions:** Auto-generated listing descriptions via Groq LLM
- **Watchlist:** Buyer bookmarks with toggle
- **Admin Panel:** User verification, dispute resolution, platform oversight

## API Overview

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /auth/register` | — | Register buyer/seller/admin |
| `POST /auth/login` | — | Returns JWT token |
| `GET /listings` | — | Active listings (paginated, filterable) |
| `GET /listings/{id}` | — | Listing detail |
| `POST /listings/{id}/bids` | Buyer | Place a bid |
| `POST /listings/{id}/bids/{bid_id}/accept` | Seller | Accept a bid |
| `GET /orders` | User | User's orders |
| `POST /orders/{id}/confirm` | Buyer | Pay escrow |
| `POST /orders/{id}/ship` | Seller | Mark shipped |
| `POST /orders/{id}/deliver` | Buyer | Confirm delivery |
| `POST /orders/{id}/complete` | Buyer | Release funds |
