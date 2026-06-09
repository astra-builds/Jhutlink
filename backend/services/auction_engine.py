from dataclasses import dataclass, field
from datetime import datetime, timedelta
from backend.entities.bid import Bid, BidStatus
from backend.entities.listing import Listing, ListingStatus


MIN_BID_QTY = 50
MAX_BUYER_SHARE = 0.60
SNIPING_WINDOW_SECONDS = 60
MAX_EXTENSIONS = 5


class AuctionValidationError(Exception):
    def __init__(self, reason_code: str, message: str) -> None:
        self.reason_code = reason_code
        super().__init__(f"[{reason_code}] {message}")


@dataclass
class AllocationResult:
    listing_id:               int
    total_quantity_kg:        int
    matched_bids:             list[Bid]  = field(default_factory=list)
    outbid_bids:              list[Bid]  = field(default_factory=list)
    unallocated_kg:           int        = 0
    weighted_avg_price_taka: float      = 0.0


class AuctionEngine:

    def validate_bid(self, bid: Bid, listing: Listing, existing_bids: list[Bid]) -> None:
        if bid.listing_id != listing.listing_id:
            raise AuctionValidationError(
                "LISTING_MISMATCH",
                f"Bid references listing #{bid.listing_id} but target is #{listing.listing_id}.",
            )
        if not listing.is_auction_open():
            raise AuctionValidationError(
                "AUCTION_CLOSED",
                f"Listing #{listing.listing_id} is not accepting bids.",
            )
        if bid.status != BidStatus.PENDING:
            raise AuctionValidationError(
                "BID_NOT_PENDING",
                f"Bid #{bid.bid_id} has status '{bid.status.value}'.",
            )
        min_price = self._minimum_bid_price(listing)
        if bid.price_per_kg_taka < min_price:
            raise AuctionValidationError(
                "BELOW_MIN_INCREMENT",
                f"Bid price ৳{bid.price_per_kg_taka:.2f}/kg is below minimum "
                f"৳{min_price:.2f}/kg (current highest ৳{listing.current_highest_taka:.2f}/kg + increment).",
            )
        buyer_total = self._buyer_total_including(bid, existing_bids)
        max_allowed = int(listing.quantity_kg * MAX_BUYER_SHARE)
        if buyer_total > max_allowed:
            raise AuctionValidationError(
                "EXCEEDS_BUYER_CAP",
                f"Buyer #{bid.buyer_id} would have {buyer_total} kg active, "
                f"exceeding the {max_allowed} kg cap ({MAX_BUYER_SHARE*100:.0f}% of {listing.quantity_kg} kg).",
            )

    def place_bid(self, bid: Bid, listing: Listing, existing_bids: list[Bid]) -> None:
        self.validate_bid(bid, listing, existing_bids)
        self._apply_anti_sniping(listing)
        if bid.price_per_kg_taka > listing.current_highest_taka:
            listing.current_highest_taka = bid.price_per_kg_taka

    def run_allocation(self, listing: Listing, bids: list[Bid]) -> AllocationResult:
        eligible = [
            b for b in bids
            if b.status == BidStatus.PENDING and b.listing_id == listing.listing_id
        ]
        if not eligible:
            return AllocationResult(
                listing_id=listing.listing_id,
                total_quantity_kg=listing.quantity_kg,
                unallocated_kg=listing.remaining_kg,
            )
        max_per_buyer = int(listing.quantity_kg * MAX_BUYER_SHARE)
        buyer_allocated: dict[int, int] = {}
        by_time = sorted(eligible, key=lambda b: b.created_at)
        by_price = sorted(by_time, key=lambda b: b.price_per_kg_taka, reverse=True)
        matched = []
        outbid = []
        remaining = listing.remaining_kg
        for bid in by_price:
            buyer_used = buyer_allocated.get(bid.buyer_id, 0)
            effective_qty = min(bid.quantity_kg, max_per_buyer - buyer_used)
            if effective_qty <= 0 or remaining <= 0:
                bid.outbid()
                outbid.append(bid)
                continue
            alloc_qty = min(effective_qty, remaining)
            bid.match(quantity_allocated_kg=alloc_qty)
            buyer_allocated[bid.buyer_id] = buyer_used + alloc_qty
            remaining -= alloc_qty
            matched.append(bid)
        unallocated = max(remaining, 0)
        weighted_avg = self._calc_weighted_avg(matched)
        return AllocationResult(
            listing_id=listing.listing_id,
            total_quantity_kg=listing.quantity_kg,
            matched_bids=matched,
            outbid_bids=outbid,
            unallocated_kg=unallocated,
            weighted_avg_price_taka=weighted_avg,
        )

    def check_auto_close(self, listings: list[Listing]) -> list[Listing]:
        now = datetime.utcnow()
        closed = []
        for lst in listings:
            if lst.status == ListingStatus.ACTIVE and lst.auction_end_time and now >= lst.auction_end_time:
                lst.close_auction()
                closed.append(lst)
        return closed

    def _minimum_bid_price(self, listing: Listing) -> float:
        if listing.current_highest_taka == 0:
            return listing.reserve_price_taka
        increment = max(0.5, round(listing.current_highest_taka * 0.02, 2))
        return listing.current_highest_taka + increment

    def _apply_anti_sniping(self, listing: Listing) -> None:
        if not listing.auction_end_time:
            return
        now = datetime.utcnow()
        remaining_seconds = (listing.auction_end_time - now).total_seconds()
        if 0 < remaining_seconds <= SNIPING_WINDOW_SECONDS and listing.extension_count < MAX_EXTENSIONS:
            listing.auction_end_time += timedelta(seconds=SNIPING_WINDOW_SECONDS)
            listing.extension_count += 1

    def _buyer_total_including(self, bid: Bid, existing_bids: list[Bid]) -> int:
        total = bid.quantity_kg
        for b in existing_bids:
            if b.buyer_id == bid.buyer_id and b.bid_id != bid.bid_id and b.status == BidStatus.PENDING:
                total += b.quantity_kg
        return total

    def finalize_listing(
        self,
        listing:             Listing,
        bids:                list[Bid],
        order_manager,
        notification_service,
        users:               list,
    ) -> tuple[AllocationResult, list[tuple], list]:
        """
        Full Section 4 pipeline: allocation → order creation → listing state
        update → buyer notifications.

        Args:
            listing:             The CLOSED listing to finalize.
            bids:                All bids in the system (filtered internally).
            order_manager:       OrderManager instance for order/escrow creation.
            notification_service: NotificationService for buyer notifications.
            users:               All users in the system (for email lookups).

        Returns:
            Tuple of (AllocationResult, list of (Order, Escrow) pairs,
                      list of Notification objects).
        """
        from backend.entities.user import Buyer

        # Step 1 — Run allocation algorithm
        result = self.run_allocation(listing, bids)

        # Step 2 — If no bids matched, mark expired and stop
        if not result.matched_bids:
            listing.mark_expired()
            return result, [], []

        # Step 3 — Create Order + Escrow for each matched bid
        pairs = order_manager.create_orders_from_allocation(result, listing.seller_id)

        # Step 4 — Reserve matched quantities before confirming sale (two-phase tracking)
        for b in result.matched_bids:
            listing.reserve_quantity(b.quantity_allocated_kg)

        # Step 5 — Update listing quantity tracking
        total_matched_kg = sum(b.quantity_allocated_kg for b in result.matched_bids)
        if total_matched_kg > 0:
            listing.confirm_sold(total_matched_kg)

        # Step 6 — Update listing state
        if listing.is_fully_sold:
            listing.mark_sold()

        # Step 6 — Notify matched buyers
        all_notifs: list = []
        user_map = {u.id: u for u in users}
        for bid in result.matched_bids:
            buyer = user_map.get(bid.buyer_id)
            buyer_email = buyer.email if isinstance(buyer, Buyer) else ""
            all_notifs.extend(
                notification_service.notify_bid_outcome(bid, matched=True, buyer_email=buyer_email)
            )

        # Step 7 — Notify outbid buyers
        for bid in result.outbid_bids:
            buyer = user_map.get(bid.buyer_id)
            buyer_email = buyer.email if isinstance(buyer, Buyer) else ""
            all_notifs.extend(
                notification_service.notify_bid_outcome(bid, matched=False, buyer_email=buyer_email)
            )

        return result, pairs, all_notifs

    def _calc_weighted_avg(self, matched_bids: list[Bid]) -> float:
        if not matched_bids:
            return 0.0
        total_value = sum(b.price_per_kg_taka * b.quantity_allocated_kg for b in matched_bids)
        total_kg = sum(b.quantity_allocated_kg for b in matched_bids)
        if total_kg == 0:
            return 0.0
        return round(total_value / total_kg, 2)


if __name__ == "__main__":
    from backend.entities.listing import Listing, WasteType, QualityGrade
    from backend.entities.bid import Bid
    from backend.entities.user import Seller, Buyer
    from backend.services.order_manager import OrderManager
    from backend.services.escrow_service import EscrowService
    from backend.services.notification_service import NotificationService
    from backend.services.email_sender import ConsoleEmailSender

    print("=== Section 4 — Allocation Engine Demo ===\n")

    engine = AuctionEngine()
    order_mgr = OrderManager(EscrowService())
    notif_svc = NotificationService(email_sender=ConsoleEmailSender())

    listing = Listing(
        seller_id=1, waste_type=WasteType.COTTON, quantity_kg=500,
        reserve_price_taka=12.0, quality_grade=QualityGrade.A,
        location_district="Gazipur", photos=["a.jpg", "b.jpg"],
        auction_duration_hours=48,
    )
    listing.open_auction()
    print(f"Listing: {listing}\n")

    # Submit bids at climbing prices (anti-sniping requires each bid > current highest + increment)
    bid_specs = [
        (201, "Bidder A", 80,  12.0),
        (202, "Bidder B", 60,  14.0),
        (203, "Bidder C", 300, 16.0),
        (204, "Bidder D", 150, 17.0),
    ]
    bids = []
    for bid_id, name, qty, price in bid_specs:
        b = Bid(
            listing_id=listing.listing_id, buyer_id=bid_id, buyer_name=name,
            quantity_kg=qty, price_per_kg_taka=price,
            reserve_price_taka=listing.reserve_price_taka,
        )
        engine.place_bid(b, listing, bids)
        bids.append(b)
        print(f"  Placed: {name} — {qty} kg @ ৳{price:.2f}")

    print(f"\n  Current highest: ৳{listing.current_highest_taka:.2f}\n")

    # Build user list
    users: list = [
        Seller(name="Seller", email="seller@test.com", password_hash="pw", trade_license="L"),
        Buyer(name="Bidder A", email="a@test.com", password_hash="pw"),
        Buyer(name="Bidder B", email="b@test.com", password_hash="pw"),
        Buyer(name="Bidder C", email="c@test.com", password_hash="pw"),
        Buyer(name="Bidder D", email="d@test.com", password_hash="pw"),
    ]
    # Patch IDs to match bid buyer_ids
    users[0].id = 1
    for i, u in enumerate(users[1:], start=1):
        u.id = 200 + i

    # Close auction and finalize
    listing.close_auction()
    result, pairs, notifs = engine.finalize_listing(
        listing, bids, order_mgr, notif_svc, users,
    )

    print(f"  Result: {len(result.matched_bids)} matched, {len(result.outbid_bids)} outbid")
    for b in result.matched_bids:
        fill = " [PARTIAL]" if b.is_partial_fill else " [FULL]"
        print(f"    MATCHED: {b.buyer_name} — {b.quantity_allocated_kg} kg @ {b.price_per_kg_taka:.2f}/kg{fill}")
    for b in result.outbid_bids:
        print(f"    OUTBID:  {b.buyer_name} — {b.quantity_kg} kg @ {b.price_per_kg_taka:.2f}/kg")
    print(f"  Listing status: {listing.status.value} (remaining={listing.remaining_kg} kg)")
    print(f"  Orders created: {len(pairs)}")
    print(f"  Notifications:  {len(notifs)}")
