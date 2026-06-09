# backend/entities/escrow.py
# JhutLink — Escrow State Machine
# Phase 1 | Entity Layer
# Demonstrates: State Pattern, Encapsulation, Transition Validation,
#               Audit Logging

from datetime import datetime


# ---------------------------------------------------------------------------
# Custom Exceptions
# ---------------------------------------------------------------------------

class InvalidTransitionError(Exception):
    """
    Raised when a caller attempts to move an Escrow instance into a state
    that is not a legal successor of the current state.

    Design note: Carrying both states on the exception object means any
    except block — or a future logging service — can inspect exactly what
    went wrong without parsing a string message.
    """
    def __init__(self, from_state: str, to_state: str) -> None:
        self.from_state = from_state
        self.to_state   = to_state
        super().__init__(
            f"Illegal escrow transition: '{from_state}' → '{to_state}'. "
            f"This transition is not permitted by the platform rules."
        )


class InsufficientFundsError(Exception):
    """
    Raised when a financial operation cannot be completed because
    the escrow amount does not cover the required deductions.
    """
    def __init__(self, required_taka: float, available_taka: float) -> None:
        self.required_taka  = required_taka
        self.available_taka = available_taka
        super().__init__(
            f"Insufficient funds: required ৳{required_taka:.2f}, "
            f"available ৳{available_taka:.2f}."
        )


# ---------------------------------------------------------------------------
# States — all platform escrow states as named string constants
# ---------------------------------------------------------------------------

class States:
    """
    Namespace class holding every valid escrow state as a string constant.

    Design note: We use a plain class with class attributes rather than
    an Enum so that state values are simple strings — easy to serialise
    to JSON for the storage layer and readable in log output without
    needing .value accessors everywhere. The tradeoff (no iteration or
    membership testing built-in) is handled by the VALID_TRANSITIONS dict.

    Every state in Section 8.2 of the design doc maps 1-to-1 to a
    constant here — if the doc changes, this is the single place to update.
    """
    AWAITING_PAYMENT  = "AWAITING_PAYMENT"
    FUNDS_HELD        = "FUNDS_HELD"
    SELLER_PREPARING  = "SELLER_PREPARING"
    IN_TRANSIT        = "IN_TRANSIT"
    DELIVERED_PENDING = "DELIVERED_PENDING"
    CONFIRMED         = "CONFIRMED"
    COMPLETED         = "COMPLETED"
    IN_DISPUTE        = "IN_DISPUTE"
    REFUNDED          = "REFUNDED"
    BID_EXPIRED       = "BID_EXPIRED"


# ---------------------------------------------------------------------------
# Valid Transitions — the state machine's rule table
# ---------------------------------------------------------------------------

# Maps every state to the set of states it may legally transition into.
# If a (from, to) pair is not in this table, the transition is forbidden.
#
# Design note: A dict of sets rather than a flat list of tuples gives
# O(1) membership testing: `to_state in VALID_TRANSITIONS[current_state]`.
# The table is module-level (not inside Escrow) because it describes the
# platform's business rules — not the behaviour of one instance. Any future
# rule change is made here and propagates automatically to every Escrow object.

VALID_TRANSITIONS: dict[str, set[str]] = {

    # Buyer has 24 hours to pay — can expire or pay
    States.AWAITING_PAYMENT: {
        States.FUNDS_HELD,
        States.BID_EXPIRED,
    },

    # Funds locked — seller confirms the order to begin preparing
    States.FUNDS_HELD: {
        States.SELLER_PREPARING,
        States.REFUNDED,          # seller no-show within 48h → auto-refund
    },

    # Seller packs and dispatches — 3PL picks up
    States.SELLER_PREPARING: {
        States.IN_TRANSIT,
        States.REFUNDED,          # seller misses preparation window → auto-refund
    },

    # Shipment in motion — delivery confirmed by 3PL
    States.IN_TRANSIT: {
        States.DELIVERED_PENDING,
    },

    # 48-hour buyer confirmation window — confirm or dispute
    States.DELIVERED_PENDING: {
        States.CONFIRMED,
        States.IN_DISPUTE,
    },

    # Buyer confirmed — trigger payout and move to completed
    States.CONFIRMED: {
        States.COMPLETED,
    },

    # IN_DISPUTE can resolve either way — admin decides
    States.IN_DISPUTE: {
        States.COMPLETED,         # admin rules buyer at fault → seller paid
        States.REFUNDED,          # admin rules seller at fault → buyer refunded
    },

    # Terminal states — no legal successor
    States.COMPLETED:   set(),
    States.REFUNDED:    set(),
    States.BID_EXPIRED: set(),
}

# Convenience set used to detect when resolved_at should be stamped
TERMINAL_STATES: set[str] = {
    States.COMPLETED,
    States.REFUNDED,
    States.BID_EXPIRED,
}


# ---------------------------------------------------------------------------
# Escrow Entity
# ---------------------------------------------------------------------------

class Escrow:
    """
    Represents a single, per-order financial escrow instance.

    Each matched buyer-order pair gets its own independent Escrow object
    (Section 8.1). This isolation is critical: a dispute on one order
    never blocks funds on another. The escrow is a child of the Order
    entity — it holds the money, enforces state rules, and records every
    transition in an append-only history log.

    The state machine is enforced through a single gateway method:
    transition_to(). Every convenience method calls transition_to() —
    there is no other way to change self.state. This is the core of
    the encapsulation design.
    """

    _id_counter: int = 0  # Auto-increment, class-level (same pattern as User)

    def __init__(self, order_id: int, amount_taka: float) -> None:
        if amount_taka <= 0:
            raise InsufficientFundsError(
                required_taka=1.0,
                available_taka=amount_taka,
            )

        Escrow._id_counter += 1
        self.escrow_id:   int            = Escrow._id_counter
        self.order_id:    int            = order_id
        self.amount:      float          = amount_taka
        self.state:       str            = States.AWAITING_PAYMENT
        self.created_at:  datetime       = datetime.utcnow()
        self.resolved_at: datetime | None = None

        # Append-only audit log — each entry is a dict for easy JSON serialisation
        self.history: list[dict] = []
        self._log_event(
            from_state=None,
            to_state=States.AWAITING_PAYMENT,
            reason="Escrow created. Awaiting buyer payment.",
        )

    # ------------------------------------------------------------------
    # Core State Machine Gateway
    # ------------------------------------------------------------------

    def transition_to(self, new_state: str, reason: str = "") -> None:
        """
        THE single point of state mutation for this escrow instance.

        Validates the requested transition against VALID_TRANSITIONS,
        records the move in history, updates resolved_at for terminal
        states, and then — and only then — commits the state change.

        Design note: the state is updated LAST. If the log write or
        timestamp fails (unlikely but possible), the escrow stays in
        its previous valid state rather than landing in a new state
        with a missing audit record. Order of operations matters.

        Raises:
            InvalidTransitionError: if the (current → new) pair is illegal.
        """
        allowed: set[str] = VALID_TRANSITIONS.get(self.state, set())

        if new_state not in allowed:
            raise InvalidTransitionError(
                from_state=self.state,
                to_state=new_state,
            )

        from_state = self.state  # capture before mutation

        # Stamp terminal resolution time
        if new_state in TERMINAL_STATES:
            self.resolved_at = datetime.utcnow()

        self._log_event(
            from_state=from_state,
            to_state=new_state,
            reason=reason or f"Transitioned from {from_state} to {new_state}.",
        )

        self.state = new_state  # commit — always last

    # ------------------------------------------------------------------
    # Convenience Methods (all delegate to transition_to)
    # ------------------------------------------------------------------

    def lock_funds(self) -> None:
        """
        Buyer's payment has been received and confirmed.
        Moves escrow from AWAITING_PAYMENT → FUNDS_HELD.
        Called by EscrowService after payment gateway callback.
        """
        self.transition_to(
            States.FUNDS_HELD,
            reason="Buyer payment received. Funds locked in escrow.",
        )

    def begin_preparation(self) -> None:
        """
        Seller confirms the order and begins packing.
        Moves escrow from FUNDS_HELD → SELLER_PREPARING.
        """
        self.transition_to(
            States.SELLER_PREPARING,
            reason="Seller confirmed order. 48-hour preparation window started.",
        )

    def mark_in_transit(self) -> None:
        """
        3PL has picked up the shipment.
        Moves escrow from SELLER_PREPARING → IN_TRANSIT.
        """
        self.transition_to(
            States.IN_TRANSIT,
            reason="3PL pickup confirmed. Shipment in transit. Tracking issued.",
        )

    def confirm_delivery(self) -> None:
        """
        3PL delivery confirmed — opens the 48-hour buyer confirmation window.
        Moves escrow from IN_TRANSIT → DELIVERED_PENDING.
        """
        self.transition_to(
            States.DELIVERED_PENDING,
            reason="Delivery confirmed by 3PL. 48-hour buyer confirmation window open.",
        )

    def release_to_seller(self) -> None:
        """
        Buyer has confirmed receipt (or 48-hour auto-confirm triggered).
        Moves escrow from DELIVERED_PENDING → CONFIRMED.
        Payout calculation should be called immediately after.
        """
        self.transition_to(
            States.CONFIRMED,
            reason="Buyer confirmed delivery. Escrow approved for seller release.",
        )

    def complete(self) -> None:
        """
        Platform fee deducted, net amount transferred to seller.
        Moves escrow from CONFIRMED → COMPLETED. Terminal state.
        Also valid from IN_DISPUTE when admin rules buyer at fault.
        """
        self.transition_to(
            States.COMPLETED,
            reason="Funds released to seller. Transaction complete. Ratings unlocked.",
        )

    def raise_dispute(self, reason: str) -> None:
        """
        Buyer raises a quality dispute within 48 hours of delivery.
        Moves escrow from DELIVERED_PENDING → IN_DISPUTE.
        Funds remain frozen until admin resolves.
        """
        self.transition_to(
            States.IN_DISPUTE,
            reason=f"Dispute raised: {reason}. Funds frozen. Admin review initiated.",
        )

    def refund_buyer(self, reason: str) -> None:
        """
        Full refund issued to buyer. Valid from multiple states:
        - FUNDS_HELD      → seller no-show
        - SELLER_PREPARING → seller missed preparation window
        - IN_DISPUTE       → admin ruled seller at fault
        Terminal state.
        """
        self.transition_to(
            States.REFUNDED,
            reason=f"Refund issued to buyer. Reason: {reason}",
        )

    def expire_bid(self) -> None:
        """
        Buyer failed to pay within the 24-hour window.
        Moves escrow from AWAITING_PAYMENT → BID_EXPIRED. Terminal state.
        """
        self.transition_to(
            States.BID_EXPIRED,
            reason="Buyer did not pay within 24 hours. Bid voided. Quantity returned to seller.",
        )

    # ------------------------------------------------------------------
    # Financial Calculation
    # ------------------------------------------------------------------

    def payout_calculation(self) -> dict[str, float]:
        """
        Calculates the net seller payout at the CONFIRMED stage.

        Formula (Section 8.3):
            Seller Payout = Order Value − Platform Fee (1%)

        Raises:
            InvalidTransitionError: if called outside of CONFIRMED or COMPLETED state.
            InsufficientFundsError: if fee somehow exceeds the held amount.
        """
        allowed_states = {States.CONFIRMED, States.COMPLETED}
        if self.state not in allowed_states:
            raise InvalidTransitionError(
                from_state=self.state,
                to_state="PAYOUT_CALCULATION (requires CONFIRMED or COMPLETED state)",
            )

        platform_fee_taka: float = round(self.amount * 0.01, 2)
        seller_payout_taka: float = round(self.amount - platform_fee_taka, 2)

        if seller_payout_taka <= 0:
            raise InsufficientFundsError(
                required_taka=platform_fee_taka,
                available_taka=self.amount,
            )

        return {
            "order_value_taka":    self.amount,
            "platform_fee_taka":   platform_fee_taka,
            "seller_payout_taka":  seller_payout_taka,
        }

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """
        Full serialisation for the JSON storage layer.
        Includes all fields needed by JsonStorage.load_escrows()
        to reconstruct the object exactly.
        """
        return {
            "escrow_id":   self.escrow_id,
            "order_id":    self.order_id,
            "amount":      self.amount,
            "state":       self.state,
            "created_at":  self.created_at.isoformat(),
            "resolved_at": (
                self.resolved_at.isoformat() if self.resolved_at else None
            ),
            "history":     self.history,
        }

    # ------------------------------------------------------------------
    # History Log (private helper)
    # ------------------------------------------------------------------

    def _log_event(
        self,
        from_state: str | None,
        to_state: str,
        reason: str,
    ) -> None:
        """
        Appends an immutable audit entry to the history list.
        Private by convention (_prefix) — only transition_to and __init__
        should ever call this directly.
        """
        self.history.append({
            "timestamp":  datetime.utcnow().isoformat(),
            "from_state": from_state,
            "to_state":   to_state,
            "reason":     reason,
        })

    def print_history(self) -> None:
        """Pretty-prints the full audit trail for this escrow instance."""
        print(f"\n  Audit Trail — Escrow #{self.escrow_id} (Order #{self.order_id})")
        print("  " + "-" * 61)
        for i, entry in enumerate(self.history):
            arrow = (
                f"  {'[CREATED]':18}"
                if entry["from_state"] is None
                else f"  {entry['from_state']:>18}  →  {entry['to_state']}"
            )
            print(f"  Step {i:>2} | {entry['timestamp']}")
            print(f"         {arrow}")
            print(f"          ↳ {entry['reason']}")
        print()

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        resolved = (
            self.resolved_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            if self.resolved_at
            else "Unresolved"
        )
        return (
            f"[ESCROW #{self.escrow_id}] "
            f"Order #{self.order_id} | "
            f"State: {self.state} | "
            f"Amount: ৳{self.amount:,.2f} | "
            f"Resolved: {resolved}"
        )

    def __repr__(self) -> str:
        return (
            f"Escrow(escrow_id={self.escrow_id!r}, "
            f"order_id={self.order_id!r}, "
            f"amount_taka={self.amount!r}, "
            f"state={self.state!r})"
        )


# ---------------------------------------------------------------------------
# Demo — run with: python backend/entities/escrow.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    print("=" * 65)
    print("  JHUTLINK — Escrow State Machine Demo")
    print("=" * 65)

    # -------------------------------------------------------------------
    # Scenario 1: Full Happy Path
    # AWAITING_PAYMENT → FUNDS_HELD → SELLER_PREPARING → IN_TRANSIT
    #   → DELIVERED_PENDING → CONFIRMED → COMPLETED
    # -------------------------------------------------------------------
    print("\n[SCENARIO 1] Happy Path — Successful Transaction")
    print("-" * 65)

    order_value_taka = 15_000.0

    escrow = Escrow(order_id=101, amount_taka=order_value_taka)
    print(f"Created:  {escrow}")

    escrow.lock_funds()
    print(f"Payment:  {escrow}")

    escrow.begin_preparation()
    print(f"Prep:     {escrow}")

    escrow.mark_in_transit()
    print(f"Transit:  {escrow}")

    escrow.confirm_delivery()
    print(f"Delivery: {escrow}")

    escrow.release_to_seller()
    print(f"Confirmed:{escrow}")

    # Show payout breakdown before completing
    payout = escrow.payout_calculation()
    print(
        f"\n  Payout Breakdown:"
        f"\n    Order Value  : ৳{payout['order_value_taka']:>10,.2f}"
        f"\n    Platform Fee : ৳{payout['platform_fee_taka']:>10,.2f}  (1%)"
        f"\n    Seller Gets  : ৳{payout['seller_payout_taka']:>10,.2f}"
    )

    escrow.complete()
    print(f"\nComplete: {escrow}")

    # Print full audit trail
    escrow.print_history()

    # -------------------------------------------------------------------
    # Scenario 2: Dispute Path — buyer raises quality dispute
    # AWAITING_PAYMENT → FUNDS_HELD → SELLER_PREPARING → IN_TRANSIT
    #   → DELIVERED_PENDING → IN_DISPUTE → REFUNDED
    # -------------------------------------------------------------------
    print("\n[SCENARIO 2] Dispute Path — Buyer Raises Quality Issue")
    print("-" * 65)

    escrow2 = Escrow(order_id=102, amount_taka=8_000.0)
    escrow2.lock_funds()
    escrow2.begin_preparation()
    escrow2.mark_in_transit()
    escrow2.confirm_delivery()
    escrow2.raise_dispute(
        reason="Waste type does not match listing — polyester delivered, cotton ordered."
    )
    print(f"Disputed: {escrow2}")

    # Admin reviews and rules seller at fault → refund
    escrow2.refund_buyer(reason="Admin ruling: waste type mismatch confirmed. Seller at fault.")
    print(f"Refunded: {escrow2}")
    escrow2.print_history()

    # -------------------------------------------------------------------
    # Scenario 3: Illegal Transition — caught by state machine
    # AWAITING_PAYMENT → COMPLETED (skips all required steps)
    # -------------------------------------------------------------------
    print("\n[SCENARIO 3] Illegal Transition Guard")
    print("-" * 65)

    escrow3 = Escrow(order_id=103, amount_taka=5_000.0)
    print(f"Current state: {escrow3.state}")

    try:
        # Attempt to jump directly from AWAITING_PAYMENT to COMPLETED
        escrow3.transition_to(States.COMPLETED)
    except InvalidTransitionError as e:
        print(f"✓ Caught InvalidTransitionError:")
        print(f"  From: {e.from_state}")
        print(f"  To:   {e.to_state}")
        print(f"  Msg:  {e}")

    # Verify state was NOT mutated — encapsulation held
    print(f"  State after failed transition: {escrow3.state}  ← unchanged ✓")

    # -------------------------------------------------------------------
    # Scenario 4: Bid Expiry — buyer never pays
    # -------------------------------------------------------------------
    print("\n[SCENARIO 4] Bid Expiry — Buyer No-Show")
    print("-" * 65)

    escrow4 = Escrow(order_id=104, amount_taka=3_000.0)
    print(f"Created:  {escrow4}")
    escrow4.expire_bid()
    print(f"Expired:  {escrow4}")

    # Verify terminal state — nothing can follow BID_EXPIRED
    try:
        escrow4.lock_funds()
    except InvalidTransitionError as e:
        print(f"✓ Cannot escape terminal state: {e.from_state} → {e.to_state}")

    print("\n" + "=" * 65)
    print("  Demo complete. All 4 escrow scenarios verified.")
    print("=" * 65)