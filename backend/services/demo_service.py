# backend/services/demo_service.py
# JhutLink — Demo Mode Service

import logging
from datetime import datetime, timedelta

from backend.entities.user import Seller, Buyer
from backend.entities.listing import Listing, ListingStatus, WasteType, QualityGrade
from backend.entities.bid import Bid
from backend.entities.notification import NotificationType, NotificationChannel
from backend.storage.json_storage import JsonStorage
from backend.services.listing_manager import ListingManager
from backend.services.auction_engine import AuctionEngine
from backend.services.order_manager import OrderManager
from backend.services.notification_service import NotificationService

logger = logging.getLogger("jhutlink.demo")

DEMO_ACCOUNTS = [
    {"name": "Rahim Textiles",       "email": "rahim@test.com",     "password": "demo123", "role": "seller", "trade_license": "TL-2024-001"},
    {"name": "Green Recyclers Ltd",  "email": "green@test.com",    "password": "demo123", "role": "buyer"},
    {"name": "EcoFibre",             "email": "ecofibre@test.com", "password": "demo123", "role": "buyer"},
    {"name": "Big Factory Ltd",      "email": "bigfactory@test.com","password": "demo123", "role": "buyer"},
]


class DemoService:
    def __init__(
        self,
        storage: JsonStorage,
        listing_manager: ListingManager,
        auction_engine: AuctionEngine,
        order_manager: OrderManager,
        notification_service: NotificationService,
    ):
        self._storage = storage
        self._listing_manager = listing_manager
        self._auction_engine = auction_engine
        self._order_manager = order_manager
        self._notification_service = notification_service

    # ------------------------------------------------------------------
    # Seed demo accounts
    # ------------------------------------------------------------------

    def seed_accounts(self) -> dict:
        """Create demo accounts if they don't exist yet. Returns summary."""
        users = self._storage.load_users()
        existing_emails = {u.email for u in users}
        created = 0
        for info in DEMO_ACCOUNTS:
            if info["email"] in existing_emails:
                continue
            import bcrypt
            pw_hash = bcrypt.hashpw(info["password"].encode(), bcrypt.gensalt()).decode()
            if info["role"] == "seller":
                user = Seller(
                    name=info["name"],
                    email=info["email"],
                    password_hash=pw_hash,
                    trade_license=info.get("trade_license", ""),
                )
            else:
                user = Buyer(
                    name=info["name"],
                    email=info["email"],
                    password_hash=pw_hash,
                )
            user.status = "active"
            users.append(user)
            created += 1
        if created:
            self._storage.save("users", users)
        return {"created": created, "total": len(DEMO_ACCOUNTS)}

    # ------------------------------------------------------------------
    # Auto-generate realistic bids on a listing
    # ------------------------------------------------------------------

    def auto_generate_bids(self, listing_id: int) -> list[dict]:
        listings = self._storage.load_listings()
        listing = next((l for l in listings if l.listing_id == listing_id), None)
        if not listing or listing.status != ListingStatus.ACTIVE:
            raise ValueError("Listing not found or not active")

        demo_users = [u for u in self._storage.load_users() if u.email in {a["email"] for a in DEMO_ACCOUNTS}]
        buyers = [u for u in demo_users if isinstance(u, Buyer)]
        if len(buyers) < 2:
            raise ValueError("Need at least 2 demo buyers seeded")

        bids_data = self._storage.load_bids()
        existing = [b for b in bids_data if b.listing_id == listing_id]

        base_price = max(listing.reserve_price_taka, listing.current_highest_taka or listing.reserve_price_taka)
        min_incr = max(0.5, round(base_price * 0.02, 2))

        new_bids = []

        # Buyer 1: aggressive bid at base + increment
        bid1 = Bid(
            listing_id=listing.listing_id,
            buyer_id=buyers[0].id,
            buyer_name=buyers[0].name,
            quantity_kg=min(150, listing.remaining_kg),
            price_per_kg_taka=base_price + min_incr,
            reserve_price_taka=listing.reserve_price_taka,
        )
        self._auction_engine.place_bid(bid1, listing, existing + new_bids)
        new_bids.append(bid1)

        # Buyer 2: slightly lower bid
        bid2 = Bid(
            listing_id=listing.listing_id,
            buyer_id=buyers[1].id,
            buyer_name=buyers[1].name,
            quantity_kg=min(100, listing.remaining_kg),
            price_per_kg_taka=base_price,
            reserve_price_taka=listing.reserve_price_taka,
        )
        self._auction_engine.place_bid(bid2, listing, existing + new_bids)
        new_bids.append(bid2)

        # If 3 buyers, place a third mid-range bid
        if len(buyers) >= 3:
            mid_price = base_price + min_incr / 2
            bid3 = Bid(
                listing_id=listing.listing_id,
                buyer_id=buyers[2].id,
                buyer_name=buyers[2].name,
                quantity_kg=min(80, listing.remaining_kg),
                price_per_kg_taka=mid_price,
                reserve_price_taka=listing.reserve_price_taka,
            )
            self._auction_engine.place_bid(bid3, listing, existing + new_bids)
            new_bids.append(bid3)

        all_bids = bids_data + new_bids
        self._storage.save("bids", all_bids)
        self._storage.save("listings", listings)
        return [b.summary() for b in new_bids]

    # ------------------------------------------------------------------
    # Fast-forward: close + allocate a specific listing
    # ------------------------------------------------------------------

    def fast_forward_listing(self, listing_id: int) -> dict:
        listings = self._storage.load_listings()
        listing = next((l for l in listings if l.listing_id == listing_id), None)
        if not listing:
            raise ValueError("Listing not found")

        if listing.status == ListingStatus.CLOSED:
            pass
        elif listing.status == ListingStatus.ACTIVE:
            self._listing_manager.close_listing(listing)
            listings = self._storage.load_listings()
            listing = next((l for l in listings if l.listing_id == listing_id))
        else:
            raise ValueError(f"Cannot fast-forward listing in status {listing.status.value}")

        # Run allocation
        bids = self._storage.load_bids()
        result = self._auction_engine.run_allocation(listing, [b for b in bids if b.listing_id == listing_id and b.status.value == "PENDING"])

        if result.matched_bids:
            pairs = self._order_manager.create_orders_from_allocation(result, listing.seller_id)
            orders = [p[0] for p in pairs]
            escrows = [p[1] for p in pairs]
            listing.mark_sold()
            self._storage.save("listings", listings)
            self._storage.save("orders", self._storage.load_orders() + orders)
            self._storage.save("escrow", self._storage.load_escrows() + escrows)
            self._storage.save("bids", bids)

        self._storage.save("bids", bids)
        self._storage.save("listings", listings)

        return {
            "listing_id": listing_id,
            "new_status": listing.status.value,
            "matched": len(result.matched_bids) if result.matched_bids else 0,
            "outbid": len(result.outbid_bids) if result.outbid_bids else 0,
        }

    # ------------------------------------------------------------------
    # Fast-forward all active listings
    # ------------------------------------------------------------------

    def fast_forward_all(self) -> list[dict]:
        listings = self._storage.load_listings()
        actives = [l for l in listings if l.status == ListingStatus.ACTIVE]
        results = []
        for l in actives:
            self._listing_manager.close_listing(l)
        self._storage.save("listings", listings)

        closed = [l for l in listings if l.status == ListingStatus.CLOSED]
        for l in closed:
            try:
                bids = self._storage.load_bids()
                pending = [b for b in bids if b.listing_id == l.listing_id and b.status.value == "PENDING"]
                if not pending:
                    self._listing_manager.expire_listing(l)
                    continue
                result = self._auction_engine.run_allocation(l, pending)
                if result.matched_bids:
                    pairs = self._order_manager.create_orders_from_allocation(result, l.seller_id)
                    orders = [p[0] for p in pairs]
                    escrows = [p[1] for p in pairs]
                    l.mark_sold()
                    self._storage.save("orders", self._storage.load_orders() + orders)
                    self._storage.save("escrow", self._storage.load_escrows() + escrows)
                self._storage.save("bids", bids)
                results.append({"listing_id": l.listing_id, "matched": len(result.matched_bids), "outbid": len(result.outbid_bids)})
            except Exception as e:
                logger.warning("Allocation failed for listing %d: %s", l.listing_id, e)
        self._storage.save("listings", listings)
        return results

    # ------------------------------------------------------------------
    # Time warp — execute all steps up to a given story step
    # ------------------------------------------------------------------

    def time_warp(self, step: int) -> dict:
        step = max(1, min(8, step))
        summary = {"step": step, "actions": []}

        if step >= 1:
            demo_sellers = [u for u in self._storage.load_users() if getattr(u, "email", "") == "rahim@test.com"]
            if not demo_sellers:
                self.seed_accounts()
        if step >= 2:
            listings = self._storage.load_listings()
            active = [l for l in listings if l.status == ListingStatus.ACTIVE]
            if not active:
                users = self._storage.load_users()
                seller = next((u for u in users if getattr(u, "email", "") == "rahim@test.com"), None)
                if seller:
                    new = self._listing_manager.create_listing(
                        seller=seller,
                        waste_type=WasteType.POLYESTER,
                        quantity_kg=200,
                        reserve_price_taka=25.0,
                        quality_grade=QualityGrade.B,
                        location_district="Savar",
                        photos=["front.jpg", "side.jpg"],
                        auction_duration_hours=24,
                        existing_listings=listings,
                    )
                    self._listing_manager.open_listing(new)
                    listings.append(new)
                    self._storage.save("listings", listings)
                    summary["actions"].append("Created demo listing")
                    active = [new]
            if active and step >= 3:
                for l in active:
                    if l.status == ListingStatus.ACTIVE:
                        try:
                            bids = self.auto_generate_bids(l.listing_id)
                            summary["actions"].append(f"Generated {len(bids)} bids on listing {l.listing_id}")
                        except ValueError as e:
                            summary["actions"].append(f"Bid gen skipped: {e}")
        if step >= 4:
            results = self.fast_forward_all()
            summary["actions"].append(f"Fast-forwarded {len(results)} listings")
        if step >= 5:
            summary["actions"].append("Allocation completed in fast_forward")
        if step >= 6:
            orders = self._storage.load_orders()
            summary["actions"].append(f"{len(orders)} orders created")
        return summary
