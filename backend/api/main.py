import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.api.routes import auth, listings, bids, orders, recommendations, notifications, admin, analytics, demo
from backend.api.websocket import manager
from backend.api.dependencies import get_storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("jhutlink")

from backend.storage.json_storage import JsonStorage as _JsonStorage
from backend.services.listing_manager import ListingManager as _ListingManager
from backend.services.order_manager import OrderManager as _OrderManager
from backend.services.escrow_service import EscrowService as _EscrowService
from backend.services.notification_service import NotificationService as _NotificationService
from backend.services.ai_service import AIService as _AIService

# ---------------------------------------------------------------------------
# Startup recovery + periodic background checks
# ---------------------------------------------------------------------------

_RECOVERY_RUN = False
_BG_THREAD = None

def _run_startup_recovery():
    global _RECOVERY_RUN
    try:
        storage = _JsonStorage()
        notif_svc = _NotificationService()
        listing_mgr = _ListingManager(notif_svc)
        escrow_svc = _EscrowService()
        order_mgr = _OrderManager(escrow_svc)

        listings = storage.load_listings()
        expired = listing_mgr.check_expiries(listings)
        if expired:
            storage.save("listings", listings)

        orders = storage.load_orders()
        escrows = storage.load_escrows()
        cancelled = order_mgr.check_payment_timeouts(orders, escrows)
        if cancelled:
            storage.save("orders", orders)
            storage.save("escrow", escrows)

        logger.info("Startup recovery: expired=%d listings, timed-out=%d orders", expired, cancelled)
    except Exception as e:
        logger.warning("Startup recovery skipped: %s", e)
    _RECOVERY_RUN = True

def _background_loop(interval_s: int = 30):
    while True:
        time.sleep(interval_s)
        try:
            storage = _JsonStorage()
            notif_svc = _NotificationService()
            listing_mgr = _ListingManager(notif_svc)
            escrow_svc = _EscrowService()
            order_mgr = _OrderManager(escrow_svc)

            listings = storage.load_listings()
            expired = listing_mgr.check_expiries(listings)
            if expired:
                storage.save("listings", listings)

            orders = storage.load_orders()
            escrows = storage.load_escrows()
            cancelled = order_mgr.check_payment_timeouts(orders, escrows)
            if cancelled:
                storage.save("orders", orders)
                storage.save("escrow", escrows)

            if expired or cancelled:
                logger.info("Background sweep: expired=%d, timed-out=%d", expired, cancelled)
        except Exception:
            pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_startup_recovery()
    bg = threading.Thread(target=_background_loop, daemon=True)
    bg.start()
    yield

app = FastAPI(title="JhutLink API", version="0.1.0", lifespan=lifespan)


@app.websocket("/ws/listings/{listing_id}")
async def listing_websocket(ws: WebSocket, listing_id: int):
    await manager.connect(listing_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(listing_id, ws)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again later."},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,            prefix="/auth",            tags=["Authentication"])
app.include_router(listings.router,        prefix="/listings",        tags=["Listings"])
app.include_router(bids.router,                                       tags=["Bids"])
app.include_router(orders.router,          prefix="/orders",          tags=["Orders"])
app.include_router(recommendations.router, prefix="/recommendations", tags=["Recommendations"])
app.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
app.include_router(demo.router, prefix="/demo", tags=["Demo"])


@app.get("/")
def health_check():
    return {"status": "ok", "message": "JhutLink API Phase 4 Running"}


@app.get("/stats")
def get_platform_stats(
    storage: _JsonStorage = Depends(get_storage),
):
    listings = storage.load_listings()
    orders = storage.load_orders()

    active_listings = [l for l in listings if l.status.value == "ACTIVE"]
    completed_orders = [o for o in orders if o.status.value == "COMPLETED"]

    total_waste_kg = sum(o.quantity_kg for o in completed_orders)
    total_transactions_taka = sum(o.total_value_taka for o in completed_orders)

    return {
        "active_listings": len(active_listings),
        "total_transactions_taka": total_transactions_taka,
        "total_waste_kg": total_waste_kg,
        "pending_orders": len([o for o in orders if o.status.value not in ("COMPLETED", "CANCELLED")]),
    }


@app.get("/analytics/ai-insights")
def get_ai_insights(storage: _JsonStorage = Depends(get_storage)):
    service = _AIService(storage)
    return service.get_insights()