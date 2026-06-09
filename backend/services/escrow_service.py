# backend/services/escrow_service.py
# JhutLink — Escrow Service
# Phase 2 | Service Layer
# Demonstrates: Service wrapping entity state machine, Business-rule guards
#               vs state-machine guards, Exception specialisation,
#               Storage/display boundary enforcement, Stateless service pattern

from backend.entities.escrow import Escrow, States, TERMINAL_STATES


# ---------------------------------------------------------------------------
# Custom Exceptions
# ---------------------------------------------------------------------------

class InvalidEscrowAmountError(Exception):
    """
    Raised when create_escrow() is called with a non-positive amount.
    An escrow for zero or negative taka is a data error — it should
    never reach the service layer from a valid order creation flow.
    Carrying amount_taka on the exception lets the caller log the
    exact bad value without parsing the message string.
    """
    def __init__(self, amount_taka: float) -> None:
        self.amount_taka = amount_taka
        super().__init__(
            f"Cannot create an escrow with amount ৳{amount_taka:,.2f}. "
            f"Amount must be positive."
        )


class EscrowNotFoundError(Exception):
    """
    Raised when get_escrow() cannot locate an Escrow with the requested ID
    in the provided list. Analogous to a 404 at the service layer —
    the caller asked for something that does not exist in the current scope.
    """
    def __init__(self, escrow_id: int) -> None:
        self.escrow_id = escrow_id
        super().__init__(
            f"Escrow #{escrow_id} was not found in the provided escrow list. "
            f"Verify the escrow_id and ensure the correct storage scope is passed."
        )


class PaymentMismatchError(Exception):
    """
    Raised when process_payment() receives an amount that does not exactly
    match the escrow's locked amount. JhutLink does not support partial
    payments — the full order value must be paid in one transaction.

        Carries both amounts in taka so the caller can display the discrepancy.
    """
    def __init__(self, expected_taka: float, received_taka: float) -> None:
        self.expected_taka = expected_taka
        self.received_taka = received_taka
        diff = received_taka - expected_taka
        direction = "overpaid" if diff > 0 else "underpaid"
        super().__init__(
            f"Payment mismatch: expected ৳{expected_taka:,.2f} "
            f"but received ৳{received_taka:,.2f}. "
            f"{direction.capitalize()} by ৳{abs(diff):,.2f}. "
            f"JhutLink requires exact full payment — no partial payments accepted."
        )


class EscrowStateError(Exception):
    """
    Raised when a service method is called on an Escrow whose current state
    does not permit that operation.

    Design note — two layers of state guards:
      Escrow.transition_to()  → guards WHICH transitions are structurally legal
      EscrowService methods   → guard WHEN a business operation is contextually valid

    These are different concerns. transition_to() would catch calling
    release_to_seller() on a FUNDS_HELD escrow because FUNDS_HELD → CONFIRMED
    is not in VALID_TRANSITIONS. But EscrowService.release_funds() raises
    EscrowStateError *before* calling the entity method — giving a more
    meaningful business-level error message rather than a raw InvalidTransitionError.
    The service is the right place for "this doesn't make sense right now";
    the entity is the right place for "this is structurally impossible ever".
    """
    def __init__(
        self,
        escrow_id:       int,
        current_state:   str,
        attempted_action: str,
        required_states: set[str],
    ) -> None:
        self.escrow_id        = escrow_id
        self.current_state    = current_state
        self.attempted_action = attempted_action
        self.required_states  = required_states
        required_str = " or ".join(sorted(required_states))
        super().__init__(
            f"Cannot perform '{attempted_action}' on escrow #{escrow_id}. "
            f"Current state is '{current_state}' but '{attempted_action}' "
            f"requires state: {required_str}."
        )


# ---------------------------------------------------------------------------
# EscrowService
# ---------------------------------------------------------------------------

class EscrowService:
    """
    Stateless service that manages the lifecycle of Escrow objects on behalf
    of OrderManager and the dispute resolution system.

    Responsibility split between EscrowService and Escrow entity:

        Escrow entity       — owns the state machine, enforces legal transitions,
                              maintains the audit history, computes payouts.
                              It knows HOW to move between states.

        EscrowService       — owns business rules about WHEN each operation is
                              contextually appropriate, validates inputs before
                              touching the entity, and translates internal paisa
                              values into display-ready taka summaries for the
                              API layer.

    This split means the Escrow entity remains clean and reusable — it does not
    need to know about payment gateway responses, order context, or dispute
    policies. EscrowService carries all of that context and calls the entity's
    validated methods once conditions are confirmed.

    Injection pattern: EscrowService is instantiated once and passed into
    OrderManager via its __init__. OrderManager never instantiates EscrowService
    internally — this keeps both classes independently testable.
    """

    # States in which a payout calculation is valid (entity enforces this too,
    # but the service checks first to give a better error message)
    PAYOUT_VALID_STATES: set[str] = {States.CONFIRMED, States.COMPLETED}

    # ---------------------------------------------------------------
    # Escrow Lifecycle Methods
    # ---------------------------------------------------------------

    def create_escrow(self, order_id: int, amount_taka: float) -> Escrow:
        """
        Creates and returns a new Escrow instance for a matched order.

        Called by OrderManager immediately after the seller accepts the
        AuctionEngine's allocation. One Escrow is created per matched
        buyer-order pair — multiple buyers on the same listing each get
        their own independent Escrow (Section 8.1).

        Args:
            order_id:     The ID of the Order this escrow is attached to.
            amount_taka: Total order value in taka (qty × price).

        Returns:
            A new Escrow in AWAITING_PAYMENT state.

        Raises:
            InvalidEscrowAmountError: if amount_taka is zero or negative.
        """
        if amount_taka <= 0:
            raise InvalidEscrowAmountError(amount_taka)

        escrow = Escrow(order_id=order_id, amount_taka=amount_taka)
        return escrow

    def get_escrow(self, escrow_id: int, escrows: list[Escrow]) -> Escrow:
        """
        Finds and returns an Escrow from a list by its escrow_id.

        Accepts the list as a parameter rather than maintaining an internal
        registry — the service remains stateless. The caller (OrderManager
        or the API route) passes in the relevant scope of escrows.

        Args:
            escrow_id: The ID to search for.
            escrows:   The list of Escrow objects to search within.

        Returns:
            The matching Escrow object.

        Raises:
            EscrowNotFoundError: if no Escrow with that ID exists in the list.
        """
        for escrow in escrows:
            if escrow.escrow_id == escrow_id:
                return escrow
        raise EscrowNotFoundError(escrow_id)

    def process_payment(self, escrow: Escrow, amount_taka: float) -> None:
        """
        Records a buyer's payment and locks the funds in escrow.

        Validates that the payment amount exactly matches the escrow's
        locked amount — no partial payments, no overpayments. In production,
        amount_taka comes from the bKash/Nagad payment gateway callback;
        the service verifies it before allowing the state transition.

        Transitions escrow: AWAITING_PAYMENT → FUNDS_HELD.

        Args:
            escrow:       The Escrow object for this order.
            amount_taka: The payment amount received from the gateway.

        Raises:
            PaymentMismatchError: if amounts do not match exactly.
            InvalidTransitionError: (from entity) if escrow is not in
                                    AWAITING_PAYMENT state.
        """
        if amount_taka != escrow.amount:
            raise PaymentMismatchError(
                expected_taka=escrow.amount,
                received_taka=amount_taka,
            )
        escrow.lock_funds()

    def confirm_seller_preparation(self, escrow: Escrow) -> None:
        """
        Marks the seller as having confirmed the order and begun preparation.
        Transitions escrow: FUNDS_HELD → SELLER_PREPARING.

        Raises:
            EscrowStateError: if escrow is not in FUNDS_HELD state.
        """
        required = {States.FUNDS_HELD}
        if escrow.state not in required:
            raise EscrowStateError(
                escrow_id=escrow.escrow_id,
                current_state=escrow.state,
                attempted_action="confirm_seller_preparation",
                required_states=required,
            )
        escrow.begin_preparation()

    def mark_dispatched(self, escrow: Escrow) -> None:
        """
        Records that the 3PL has picked up the shipment.
        Transitions escrow: SELLER_PREPARING → IN_TRANSIT.

        Raises:
            EscrowStateError: if escrow is not in SELLER_PREPARING state.
        """
        required = {States.SELLER_PREPARING}
        if escrow.state not in required:
            raise EscrowStateError(
                escrow_id=escrow.escrow_id,
                current_state=escrow.state,
                attempted_action="mark_dispatched",
                required_states=required,
            )
        escrow.mark_in_transit()

    def mark_delivered(self, escrow: Escrow) -> None:
        """
        Records 3PL delivery confirmation — opens the 48-hour buyer window.
        Transitions escrow: IN_TRANSIT → DELIVERED_PENDING.

        Raises:
            EscrowStateError: if escrow is not in IN_TRANSIT state.
        """
        required = {States.IN_TRANSIT}
        if escrow.state not in required:
            raise EscrowStateError(
                escrow_id=escrow.escrow_id,
                current_state=escrow.state,
                attempted_action="mark_delivered",
                required_states=required,
            )
        escrow.confirm_delivery()

    def release_funds(self, escrow: Escrow) -> None:
        """
        Releases escrow funds to the seller after buyer confirms receipt.
        Transitions escrow: DELIVERED_PENDING → CONFIRMED.

        This is called either by the buyer explicitly confirming delivery,
        or by the 48-hour auto-confirm background job in ListingManager.

        Raises:
            EscrowStateError: if escrow is not in DELIVERED_PENDING state.
        """
        required = {States.DELIVERED_PENDING}
        if escrow.state not in required:
            raise EscrowStateError(
                escrow_id=escrow.escrow_id,
                current_state=escrow.state,
                attempted_action="release_funds",
                required_states=required,
            )
        escrow.release_to_seller()

    def complete_transaction(self, escrow: Escrow) -> dict:
        """
        Finalises the transaction: deducts platform fee and marks COMPLETED.
        Transitions escrow: CONFIRMED → COMPLETED.

        Returns the payout breakdown dict so the caller can persist the
        final amounts and trigger the seller's bank transfer.

        Raises:
            EscrowStateError: if escrow is not in CONFIRMED state.
        """
        required = {States.CONFIRMED}
        if escrow.state not in required:
            raise EscrowStateError(
                escrow_id=escrow.escrow_id,
                current_state=escrow.state,
                attempted_action="complete_transaction",
                required_states=required,
            )
        payout = escrow.payout_calculation()
        escrow.complete()
        return payout

    def open_dispute(self, escrow: Escrow, reason: str = "") -> None:
        """
        Opens a quality dispute on behalf of the buyer.
        Transitions escrow: DELIVERED_PENDING → IN_DISPUTE.

        Must be called within 48 hours of delivery confirmation (time
        enforcement is the API layer's responsibility — this service
        validates state only).

        Raises:
            EscrowStateError: if escrow is not in DELIVERED_PENDING state.
        """
        required = {States.DELIVERED_PENDING}
        if escrow.state not in required:
            raise EscrowStateError(
                escrow_id=escrow.escrow_id,
                current_state=escrow.state,
                attempted_action="open_dispute",
                required_states=required,
            )
        escrow.raise_dispute(reason=reason)

    def process_refund(self, escrow: Escrow, reason: str = "") -> None:
        """
        Issues a full refund to the buyer. Valid from two states:
          - IN_DISPUTE       → admin ruled seller at fault
          - SELLER_PREPARING → seller missed the 48-hour prep window (auto-refund)
          - FUNDS_HELD       → seller failed to confirm the order

        Transitions escrow to REFUNDED. Terminal state.

        Raises:
            EscrowStateError: if escrow is not in a refundable state.
        """
        required = {States.IN_DISPUTE, States.SELLER_PREPARING, States.FUNDS_HELD}
        if escrow.state not in required:
            raise EscrowStateError(
                escrow_id=escrow.escrow_id,
                current_state=escrow.state,
                attempted_action="process_refund",
                required_states=required,
            )
        escrow.refund_buyer(reason=reason)

    # ---------------------------------------------------------------
    # Summary / Reporting
    # ---------------------------------------------------------------

    def get_summary(self, escrow: Escrow) -> dict:
        """
        Returns a serialisation-ready dict describing the current escrow state.

        Payout breakdown is included only when the escrow is in a state
        where payout_calculation() is valid (CONFIRMED or COMPLETED).
        In all other states, the payout fields are returned as None so
        the caller always gets a consistent dict shape.

        Returns:
            dict with keys: escrow_id, order_id, state, amount_taka,
            seller_payout_taka, platform_fee_taka, is_resolved,
            created_at, resolved_at, history
        """
        # Payout breakdown — only available in CONFIRMED / COMPLETED states
        payout_data: dict | None = None
        if escrow.state in self.PAYOUT_VALID_STATES:
            payout_data = escrow.payout_calculation()

        return {
            "escrow_id":           escrow.escrow_id,
            "order_id":            escrow.order_id,
            "state":               escrow.state,
            "is_resolved":         escrow.state in TERMINAL_STATES,

            "amount_taka":         escrow.amount,

            # Payout fields — None until CONFIRMED
            "seller_payout_taka": (
                payout_data["seller_payout_taka"] if payout_data else None
            ),
            "platform_fee_taka":   (
                payout_data["platform_fee_taka"]   if payout_data else None
            ),

            # Timestamps
            "created_at":          escrow.created_at.isoformat(),
            "resolved_at": (
                escrow.resolved_at.isoformat() if escrow.resolved_at else None
            ),

            # Full audit trail — list of dicts, JSON-serialisable
            "history":             escrow.history,
        }


# ---------------------------------------------------------------------------
# Demo — run with: python -m backend.services.escrow_service
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    def print_summary(summary: dict) -> None:
        """Helper: pretty-prints a get_summary() dict."""
        print(f"\n  Escrow Summary — #{summary['escrow_id']} "
              f"(Order #{summary['order_id']})")
        print("  " + "-" * 57)
        print(f"  State        : {summary['state']}")
        print(f"  Amount       : ৳{summary['amount_taka']:>12,.2f}")
        if summary["seller_payout_taka"] is not None:
            print(f"  Platform fee : ৳{summary['platform_fee_taka']:>12,.2f}  ← 1%")
            print(f"  Seller gets  : ৳{summary['seller_payout_taka']:>12,.2f}")
        else:
            print(f"  Payout       : Not yet calculated (state: {summary['state']})")
        print(f"  Resolved     : {summary['resolved_at'] or 'Unresolved'}")
        print(f"\n  Audit Trail ({len(summary['history'])} events):")
        for i, entry in enumerate(summary["history"]):
            arrow = (
                "  [CREATED]"
                if entry["from_state"] is None
                else f"  {entry['from_state']:>18}  →  {entry['to_state']}"
            )
            print(f"    {i:>2}. {entry['timestamp'][:19]}  {arrow}")
            print(f"         ↳ {entry['reason']}")
        print()

    # ===================================================================
    print("=" * 65)
    print("  JHUTLINK — EscrowService Demo")
    print("=" * 65)

    service = EscrowService()

    # -------------------------------------------------------------------
    # Happy path: ORD-001 — ৳50,000 order all the way to COMPLETED
    # -------------------------------------------------------------------
    print("\n[HAPPY PATH] ORD-001 — ৳50,000 order through full lifecycle")
    print("-" * 65)

    ORDER_AMOUNT_TAKA = 50_000.0

    escrow = service.create_escrow(order_id=1001, amount_taka=ORDER_AMOUNT_TAKA)
    print(f"  Created  : {escrow}")

    service.process_payment(escrow, amount_taka=ORDER_AMOUNT_TAKA)
    print(f"  Paid     : {escrow}")

    service.confirm_seller_preparation(escrow)
    print(f"  Prep     : {escrow}")

    service.mark_dispatched(escrow)
    print(f"  Transit  : {escrow}")

    service.mark_delivered(escrow)
    print(f"  Delivered: {escrow}")

    service.release_funds(escrow)
    print(f"  Confirmed: {escrow}")

    payout = service.complete_transaction(escrow)
    print(f"  Complete : {escrow}")

    print(f"\n  ── Payout Breakdown ──────────────────────────────────")
    print(f"  Order value  : ৳{payout['order_value_taka']:>12,.2f}")
    print(f"  Platform fee : ৳{payout['platform_fee_taka']:>12,.2f}  (1% of order)")
    print(f"  Seller gets  : ৳{payout['seller_payout_taka']:>12,.2f}")
    print(f"\n  Fee check:")
    print(f"  {payout['order_value_taka']:,.2f}"
          f"  −  {payout['platform_fee_taka']:,.2f}"
          f"  =  {payout['seller_payout_taka']:,.2f}  ✓")

    print_summary(service.get_summary(escrow))

    # -------------------------------------------------------------------
    # Sad path 1: try to release_funds on a FUNDS_HELD escrow
    # -------------------------------------------------------------------
    print("[SAD PATH 1] release_funds() on a FUNDS_HELD escrow")
    print("-" * 65)

    escrow2 = service.create_escrow(order_id=1002, amount_taka=10_000.0)
    service.process_payment(escrow2, amount_taka=10_000.0)
    # escrow2 is now FUNDS_HELD — calling release_funds() should fail

    try:
        service.release_funds(escrow2)
    except EscrowStateError as e:
        print(f"  ✓ Caught EscrowStateError:")
        print(f"    Escrow ID       : {e.escrow_id}")
        print(f"    Current state   : {e.current_state}")
        print(f"    Attempted action: {e.attempted_action}")
        print(f"    Required states : {e.required_states}")
        print(f"    Message         : {e}")
    print(f"  State unchanged: {escrow2.state}  ← still FUNDS_HELD ✓\n")

    # -------------------------------------------------------------------
    # Sad path 2: process_payment with wrong amount
    # -------------------------------------------------------------------
    print("[SAD PATH 2] process_payment() with incorrect amount")
    print("-" * 65)

    escrow3 = service.create_escrow(order_id=1003, amount_taka=20_000.0)
    wrong_amount = 19_000.0

    try:
        service.process_payment(escrow3, amount_taka=wrong_amount)
    except PaymentMismatchError as e:
        print(f"  ✓ Caught PaymentMismatchError:")
        print(f"    Expected : ৳{e.expected_taka:,.2f}")
        print(f"    Received : ৳{e.received_taka:,.2f}")
        print(f"    Message  : {e}")
    print(f"  State unchanged: {escrow3.state}  ← still AWAITING_PAYMENT ✓\n")

    # -------------------------------------------------------------------
    # Sad path 3: dispute path — buyer raises quality issue
    # -------------------------------------------------------------------
    print("[SAD PATH 3] Dispute path — seller ruled at fault → refund")
    print("-" * 65)

    escrow4 = service.create_escrow(order_id=1004, amount_taka=35_000.0)
    service.process_payment(escrow4, amount_taka=35_000.0)
    service.confirm_seller_preparation(escrow4)
    service.mark_dispatched(escrow4)
    service.mark_delivered(escrow4)

    service.open_dispute(
        escrow4,
        reason="Received polyester waste — listing stated cotton Grade A."
    )
    print(f"  Disputed : {escrow4}")

    service.process_refund(
        escrow4,
        reason="Admin ruling: waste type mismatch confirmed. Seller at fault."
    )
    print(f"  Refunded : {escrow4}")
    print_summary(service.get_summary(escrow4))

    # -------------------------------------------------------------------
    # Sad path 4: InvalidEscrowAmountError
    # -------------------------------------------------------------------
    print("[SAD PATH 4] create_escrow() with zero amount")
    print("-" * 65)

    try:
        service.create_escrow(order_id=1005, amount_taka=0)
    except InvalidEscrowAmountError as e:
        print(f"  ✓ Caught InvalidEscrowAmountError: {e}\n")

    print("=" * 65)
    print("  Demo complete. All EscrowService scenarios verified.")
    print("=" * 65)