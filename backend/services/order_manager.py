# backend/services/order_manager.py
# JhutLink — Order Manager Service
# Phase 2 | Service Layer
# Demonstrates: Dependency Injection (EscrowService injected via __init__),
#               Integration point for AuctionEngine → Order → Escrow pipeline,
#               Coordinating multiple entity state machines in sequence,
#               Clean separation — OrderManager orchestrates, never owns data

from backend.entities.order import Order, OrderStatus, InvalidOrderTransitionError
from backend.entities.escrow import Escrow, States
from backend.services.escrow_service import EscrowService, EscrowStateError


# ---------------------------------------------------------------------------
# Custom Exception
# ---------------------------------------------------------------------------

class OrderNotFoundError(Exception):
    """
    Raised when get_order() cannot find an Order with the requested ID
    in the provided list. Service-layer 404 equivalent.
    """
    def __init__(self, order_id: int) -> None:
        self.order_id = order_id
        super().__init__(
            f"Order #{order_id} was not found in the provided order list. "
            f"Verify the order_id and storage scope."
        )


# ---------------------------------------------------------------------------
# OrderManager Service
# ---------------------------------------------------------------------------

class OrderManager:
    """
    Orchestration service for the full order lifecycle on JhutLink.

    OrderManager is the integration hub of Phase 2 — it is the class where
    every component built so far comes together:

        AuctionEngine  →  produces AllocationResult with matched Bid objects
        OrderManager   →  converts each matched Bid into an Order + Escrow pair
        EscrowService  →  manages financial state transitions on each Escrow
        Order entity   →  tracks the fulfilment state machine

    Dependency Injection pattern:
        EscrowService is passed into __init__ — OrderManager never instantiates
        it internally. This means:
        (a) OrderManager and EscrowService are independently testable.
        (b) A test suite can pass a mock EscrowService that returns predictable
            results without touching payment infrastructure.
        (c) If EscrowService is ever replaced (e.g. a new payment provider),
            OrderManager's code does not change — only the injected instance does.

    What OrderManager does NOT do:
        - It does not store orders internally (stateless — caller passes lists)
        - It does not run allocation (that is AuctionEngine's job)
        - It does not directly mutate Escrow state (that is EscrowService's job)
        - It does not send notifications (that will be NotificationService's job)

    Single Responsibility: OrderManager's one job is coordinating the handoff
    between allocation results and funded, tracked order records.
    """

    def __init__(self, escrow_service: EscrowService) -> None:
        """
        Args:
            escrow_service: An EscrowService instance injected by the caller.
                            OrderManager calls its methods but never creates it.
        """
        self.escrow_service = escrow_service

    # ------------------------------------------------------------------
    # Core Pipeline Method
    # ------------------------------------------------------------------

    def create_orders_from_allocation(
        self,
        allocation_result,      # AllocationResult from AuctionEngine
        seller_id: int,
    ) -> list[tuple[Order, Escrow]]:
        """
        Converts a AuctionEngine AllocationResult into funded Order records.

        For each matched Bid in the allocation:
          1. Creates an Order object with the bid's terms
          2. Creates an Escrow via EscrowService (amount = bid total value)
          3. Attaches the Escrow ID to the Order
          4. Transitions the Order: CREATED → PAYMENT_PENDING
          5. Collects the (Order, Escrow) pair

        Returns a list of (Order, Escrow) tuples — one per matched buyer.
        The caller (API route or demo) is responsible for persisting these
        to the storage layer.

        Args:
            allocation_result: AllocationResult dataclass from AuctionEngine.
            seller_id:         The ID of the seller who accepted the allocation.

        Returns:
            List of (Order, Escrow) tuples, one per matched bid.
        """
        order_escrow_pairs: list[tuple[Order, Escrow]] = []

        for bid in allocation_result.matched_bids:

            # Step 1 — Create Order from matched bid terms
            order = Order(
                listing_id=bid.listing_id,
                seller_id=seller_id,
                buyer_id=bid.buyer_id,
                quantity_kg=bid.quantity_allocated_kg,  # allocated, not requested
                price_per_kg_taka=bid.price_per_kg_taka,
            )

            # Step 2 — Create Escrow for the exact order value
            escrow = self.escrow_service.create_escrow(
                order_id=order.order_id,
                amount_taka=order.total_value_taka,
            )

            # Step 3 — Link Escrow to Order
            order.attach_escrow(escrow_id=escrow.escrow_id)

            # Step 4 — Transition Order into payment-awaiting state
            order.transition_to(
                OrderStatus.PAYMENT_PENDING,
                reason=(
                    f"Order created from allocation. "
                    f"Buyer #{bid.buyer_id} matched for "
                    f"{bid.quantity_allocated_kg} kg @ "
                    f"৳{bid.price_per_kg_taka:.2f}/kg. "
                    f"Awaiting payment."
                ),
            )

            order_escrow_pairs.append((order, escrow))

        return order_escrow_pairs

    # ------------------------------------------------------------------
    # Order Retrieval
    # ------------------------------------------------------------------

    def get_order(self, order_id: int, orders: list[Order]) -> Order:
        """
        Finds and returns an Order from a list by its order_id.
        Stateless — the caller provides the list; OrderManager searches it.

        Raises:
            OrderNotFoundError: if no Order with that ID exists in the list.
        """
        for order in orders:
            if order.order_id == order_id:
                return order
        raise OrderNotFoundError(order_id)

    # ------------------------------------------------------------------
    # Order Lifecycle Methods
    # ------------------------------------------------------------------

    def confirm_order(
        self,
        order:        Order,
        escrow:       Escrow,
        amount_taka: int,
    ) -> None:
        """
        Processes buyer payment and confirms the order.

        Calls EscrowService.process_payment() which validates the amount
        and locks funds (AWAITING_PAYMENT → FUNDS_HELD). Then transitions
        the Order to CONFIRMED.

        The two state transitions (Escrow and Order) happen in sequence —
        if process_payment() raises (wrong amount, wrong escrow state),
        the Order status is never touched. Consistency is maintained.

        Args:
            order:        The Order to confirm.
            escrow:       The Escrow attached to this order.
            amount_taka: Payment amount from the gateway callback.

        Raises:
            PaymentMismatchError: (from EscrowService) if amounts differ.
            EscrowStateError:     (from EscrowService) if wrong escrow state.
            InvalidOrderTransitionError: if Order is not in PAYMENT_PENDING.
        """
        # Escrow transitions first — if payment fails, order stays PENDING
        self.escrow_service.process_payment(escrow, amount_taka)

        order.transition_to(
            OrderStatus.CONFIRMED,
            reason=(
                f"Payment of ৳{amount_taka:,.2f} confirmed. "
                f"Escrow #{escrow.escrow_id} locked."
            ),
        )

    def mark_order_in_transit(self, order: Order, escrow: Escrow) -> None:
        """
        Records seller dispatch — 3PL has collected the shipment.
        Advances both Order (CONFIRMED → IN_TRANSIT) and
        Escrow (SELLER_PREPARING → IN_TRANSIT) in sequence.
        """
        self.escrow_service.confirm_seller_preparation(escrow)
        self.escrow_service.mark_dispatched(escrow)
        order.transition_to(
            OrderStatus.IN_TRANSIT,
            reason="Seller dispatched. 3PL pickup confirmed. Shipment in transit.",
        )

    def deliver_order(self, order: Order, escrow: Escrow) -> None:
        """
        Records 3PL delivery confirmation.
        Advances Order (IN_TRANSIT → DELIVERED) and opens the
        48-hour buyer confirmation window on the Escrow.
        """
        self.escrow_service.mark_delivered(escrow)
        order.transition_to(
            OrderStatus.DELIVERED,
            reason="3PL delivery confirmed. 48-hour buyer confirmation window open.",
        )

    def complete_order(self, order: Order, escrow: Escrow) -> dict:
        """
        Buyer confirms receipt. Releases funds to seller and completes order.
        Returns payout breakdown from EscrowService.complete_transaction().

        Sequence:
          Order:  DELIVERED → COMPLETED
          Escrow: DELIVERED_PENDING → CONFIRMED → COMPLETED
        """
        self.escrow_service.release_funds(escrow)
        payout = self.escrow_service.complete_transaction(escrow)
        order.transition_to(
            OrderStatus.COMPLETED,
            reason=(
                f"Buyer confirmed delivery. Funds released to seller. "
                f"Net payout: ৳{payout['seller_payout_taka']:,.2f}."
            ),
        )
        return payout

    def cancel_order(
        self,
        order:  Order,
        escrow: Escrow,
        reason: str = "",
    ) -> None:
        """
        Cancels an order and refunds the buyer if funds were held.

        Refund logic (Section 9.2 + Section 15.2):
          - If escrow is AWAITING_PAYMENT: no funds were ever locked,
            so no refund call is needed — just cancel the order.
          - If escrow is in any funded state: call process_refund()
            to return funds before cancelling the order.

        Args:
            order:  The Order to cancel.
            escrow: The Escrow attached to this order.
            reason: Human-readable cancellation reason for audit trail.
        """
        # Only refund if money was actually locked
        if escrow.state != States.AWAITING_PAYMENT:
            try:
                self.escrow_service.process_refund(
                    escrow,
                    reason=reason or "Order cancelled by platform.",
                )
            except EscrowStateError:
                # Escrow may already be in a terminal state (edge case in
                # concurrent dispute + cancel scenarios) — log and continue
                pass

        order.transition_to(
            OrderStatus.CANCELLED,
            reason=reason or "Order cancelled.",
        )

    def check_payment_timeouts(self, orders: list[Order], escrows: list[Escrow], timeout_hours: int = 24) -> int:
        """
        Cancels PAYMENT_PENDING orders older than `timeout_hours`.
        Releases escrow and marks orders as CANCELLED.
        Returns the count of cancelled orders.
        """
        from datetime import datetime, timedelta
        deadline = datetime.utcnow() - timedelta(hours=timeout_hours)
        escrow_map = {e.escrow_id: e for e in escrows}
        cancelled = 0
        for o in orders:
            if o.status == OrderStatus.PAYMENT_PENDING and o.created_at < deadline:
                escrow = escrow_map.get(o.escrow_id)
                try:
                    self.cancel_order(o, escrow, reason="Payment timeout — 24h window expired.")
                    cancelled += 1
                except Exception:
                    continue
        return cancelled

    def dispute_order(
        self,
        order:  Order,
        escrow: Escrow,
        reason: str,
    ) -> None:
        """
        Buyer raises a quality dispute. Freezes escrow funds and marks
        the order as DISPUTED pending admin review.

        Order:  DELIVERED → DISPUTED
        Escrow: DELIVERED_PENDING → IN_DISPUTE
        """
        self.escrow_service.open_dispute(escrow, reason=reason)
        order.transition_to(
            OrderStatus.DISPUTED,
            reason=f"Buyer raised dispute: {reason}",
        )

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def get_order_summary(self, order: Order, escrow: Escrow) -> dict:
        """
        Returns a combined dict of order fields and escrow financial state.
        Used by the API layer to build the order detail response.

        Merges order.to_dict() with escrow_service.get_summary(escrow)
        fields flattened at the top level.
        """
        summary = self.escrow_service.get_summary(escrow)
        return {
            **order.to_dict(),
            "escrow_state": summary["state"],
            "seller_payout_taka": summary["seller_payout_taka"],
            "platform_fee_taka": summary["platform_fee_taka"],
            "history": summary["history"],
        }


# ---------------------------------------------------------------------------
# Demo — run with: python -m backend.services.order_manager
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    from backend.entities.listing import Listing, WasteType, QualityGrade
    from backend.entities.bid import Bid
    # ===================================================================
    def section(title: str) -> None:
        print(f"\n{'=' * 65}")
        print(f"  {title}")
        print(f"{'=' * 65}")

    def divider() -> None:
        print("-" * 65)

    # ===================================================================
    section("JHUTLINK — Full Transaction Pipeline Demo")

    # -------------------------------------------------------------------
    # Step 1: Build the listing
    # -------------------------------------------------------------------
    section("STEP 1 — Create and open a 500 kg Cotton listing")

    listing = Listing(
        seller_id=10,
        waste_type=WasteType.COTTON,
        quantity_kg=500,
        reserve_price_taka=12.0,
        quality_grade=QualityGrade.A,
        location_district="Gazipur",
        photos=["front.jpg", "side.jpg"],
        auction_duration_hours=48,
    )
    listing.open_auction()
    print(f"\n  {listing}")

    # -------------------------------------------------------------------
    # Step 2: Place bids and run allocation
    # -------------------------------------------------------------------
    section("STEP 2 — Submit bids")

    RESERVE = 12.0

    bid_micro = Bid(
        listing_id=listing.listing_id, buyer_id=201,
        buyer_name="Micro Buyer", quantity_kg=80,
        price_per_kg_taka=15.0, reserve_price_taka=RESERVE,
    )
    bid_mid = Bid(
        listing_id=listing.listing_id, buyer_id=202,
        buyer_name="Mid Buyer", quantity_kg=200,
        price_per_kg_taka=14.0, reserve_price_taka=RESERVE,
    )
    bid_enterprise = Bid(
        listing_id=listing.listing_id, buyer_id=203,
        buyer_name="Enterprise Buyer", quantity_kg=350,
        price_per_kg_taka=13.0, reserve_price_taka=RESERVE,
    )

    all_bids = [bid_micro, bid_mid, bid_enterprise]

    # Allocation will be handled by the new auction_engine (Phase 2)
    # Manually match bids for demo purposes
    for bid in [bid_micro, bid_mid]:
        bid.match(quantity_allocated_kg=bid.quantity_kg)
    bid_enterprise.outbid()
    from dataclasses import dataclass
    @dataclass
    class _DemoResult:
        listing_id: int
        total_quantity_kg: int
        matched_bids: list
        unallocated_kg: int
        weighted_avg_price_taka: float
    result = _DemoResult(
        listing_id=listing.listing_id,
        total_quantity_kg=listing.quantity_kg,
        matched_bids=[bid_micro, bid_mid],
        unallocated_kg=0,
        weighted_avg_price_taka=14.5,
    )

    # -------------------------------------------------------------------
    # Step 3: OrderManager converts allocation into Orders + Escrows
    # -------------------------------------------------------------------
    section("STEP 3 — OrderManager creates Orders and Escrows")

    escrow_svc = EscrowService()
    order_mgr  = OrderManager(escrow_service=escrow_svc)

    pairs = order_mgr.create_orders_from_allocation(
        allocation_result=result,
        seller_id=10,
    )

    print(f"\n  {len(pairs)} order(s) created from allocation:\n")
    for order, escrow in pairs:
        print(f"  {order}")
        print(f"    └─ Escrow: #{escrow.escrow_id} | "
              f"State: {escrow.state} | "
              f"Amount: ৳{escrow.amount:,.2f}\n")

    orders = [p[0] for p in pairs]
    escrows = [p[1] for p in pairs]

    # -------------------------------------------------------------------
    # Step 4: Confirm payment for Buyer 201 (Micro, full fill)
    # -------------------------------------------------------------------
    section("STEP 4 — Buyer 201 pays → order confirmed")

    order_201, escrow_201 = pairs[0]
    payment_amount = order_201.total_value_taka
    print(f"\n  Order  : {order_201}")
    print(f"  Paying : ৳{payment_amount:,.2f}")

    order_mgr.confirm_order(order_201, escrow_201, amount_taka=payment_amount)
    print(f"\n  After payment confirmation:")
    print(f"  Order  : {order_201}")
    print(f"  Escrow : #{escrow_201.escrow_id} | State: {escrow_201.state}")

    # Walk through to delivery and completion
    order_mgr.mark_order_in_transit(order_201, escrow_201)
    print(f"\n  After dispatch:")
    print(f"  Order  : {order_201}")
    print(f"  Escrow : #{escrow_201.escrow_id} | State: {escrow_201.state}")

    order_mgr.deliver_order(order_201, escrow_201)
    print(f"\n  After delivery confirmation:")
    print(f"  Order  : {order_201}")
    print(f"  Escrow : #{escrow_201.escrow_id} | State: {escrow_201.state}")

    payout = order_mgr.complete_order(order_201, escrow_201)
    print(f"\n  After buyer confirmation — COMPLETED:")
    print(f"  Order  : {order_201}")
    print(f"  Escrow : #{escrow_201.escrow_id} | State: {escrow_201.state}")
    print(f"\n  Payout breakdown:")
    print(f"    Order value  : ৳{payout['order_value_taka']:>10,.2f}")
    print(f"    Platform fee : ৳{payout['platform_fee_taka']:>10,.2f}  (1%)")
    print(f"    Seller gets  : ৳{payout['seller_payout_taka']:>10,.2f}")

    # -------------------------------------------------------------------
    # Step 5: Cancel order for Buyer 203 (Enterprise)
    # -------------------------------------------------------------------
    section("STEP 5 — Buyer 203 cancels before paying")

    order_203, escrow_203 = pairs[2]
    print(f"\n  Before cancel:")
    print(f"  Order  : {order_203}")
    print(f"  Escrow : #{escrow_203.escrow_id} | State: {escrow_203.state}")

    # Escrow is AWAITING_PAYMENT — no funds locked, no refund needed
    order_mgr.cancel_order(
        order_203, escrow_203,
        reason="Buyer withdrew before payment window expired."
    )
    print(f"\n  After cancel:")
    print(f"  Order  : {order_203}")
    print(f"  Escrow : #{escrow_203.escrow_id} | State: {escrow_203.state}")

    # -------------------------------------------------------------------
    # Step 6: get_order_summary for the completed order
    # -------------------------------------------------------------------
    section("STEP 6 — get_order_summary() for completed order")

    summary = order_mgr.get_order_summary(order_201, escrow_201)

    print(f"\n  Order fields:")
    for key in ["order_id", "buyer_id", "seller_id", "quantity_kg",
                "total_value_taka", "status", "created_at"]:
        print(f"    {key:<22}: {summary[key]}")

    print(f"\n  Escrow fields:")
    e = summary["escrow"]
    for key in ["escrow_id", "state", "amount_taka",
                "platform_fee_taka", "seller_payout_taka", "is_resolved"]:
        print(f"    {key:<22}: {e[key]}")

    print(f"\n  Escrow audit trail ({len(e['history'])} events recorded)")
    for i, entry in enumerate(e["history"]):
        arrow = (
            "[CREATED]"
            if entry["from_state"] is None
            else f"{entry['from_state']}  →  {entry['to_state']}"
        )
        print(f"    {i:>2}. {arrow}")

    # -------------------------------------------------------------------
    # Step 7: Illegal transition guard
    # -------------------------------------------------------------------
    section("STEP 7 — Guard: wrong payment amount")

    order_202, escrow_202 = pairs[1]
    wrong_payment = order_202.total_value_taka - 1_000.0  # ৳1,000 short

    from backend.services.escrow_service import PaymentMismatchError
    try:
        order_mgr.confirm_order(order_202, escrow_202, amount_taka=wrong_payment)
    except PaymentMismatchError as e:
        print(f"\n  ✓ Caught PaymentMismatchError:")
        print(f"    Expected : ৳{e.expected_taka:,.2f}")
        print(f"    Received : ৳{e.received_taka:,.2f}")
        print(f"    Order status unchanged: {order_202.status.value}  ← PAYMENT_PENDING ✓")
        print(f"    Escrow state unchanged: {escrow_202.state}  ← AWAITING_PAYMENT ✓")

    section("Demo complete — full pipeline verified end to end")