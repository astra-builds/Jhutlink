# backend/entities/order.py
# JhutLink — Order Entity
# Phase 1 | Entity Layer (built during Phase 2 integration)
# Demonstrates: State machine pattern (third application — now clearly a system idiom),
#               Computed properties, Escrow attachment guard,
#               updated_at timestamp discipline

from datetime import datetime
from enum import Enum


# ---------------------------------------------------------------------------
# Domain Enum
# ---------------------------------------------------------------------------

class OrderStatus(Enum):
    """
    Lifecycle states for a JhutLink order.

    An Order is created when the AuctionEngine matches a bid and the seller
    accepts. It progresses through payment, fulfilment, and delivery before
    reaching a terminal state (COMPLETED or CANCELLED).

    State diagram:
        CREATED        → PAYMENT_PENDING
        PAYMENT_PENDING → CONFIRMED, CANCELLED
        CONFIRMED      → IN_TRANSIT
        IN_TRANSIT     → DELIVERED
        DELIVERED      → COMPLETED, DISPUTED
        DISPUTED       → COMPLETED, CANCELLED
    """
    CREATED         = "CREATED"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    CONFIRMED       = "CONFIRMED"
    IN_TRANSIT      = "IN_TRANSIT"
    DELIVERED       = "DELIVERED"
    COMPLETED       = "COMPLETED"
    DISPUTED        = "DISPUTED"
    CANCELLED       = "CANCELLED"


# ---------------------------------------------------------------------------
# Valid Order Transitions
# ---------------------------------------------------------------------------

VALID_ORDER_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.CREATED:         {OrderStatus.PAYMENT_PENDING},
    OrderStatus.PAYMENT_PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED:       {OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED},
    OrderStatus.IN_TRANSIT:      {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED:       {OrderStatus.COMPLETED, OrderStatus.DISPUTED},
    OrderStatus.DISPUTED:        {OrderStatus.COMPLETED, OrderStatus.CANCELLED},
    # Terminal states
    OrderStatus.COMPLETED:       set(),
    OrderStatus.CANCELLED:       set(),
}

TERMINAL_ORDER_STATES: set[OrderStatus] = {
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
}


# ---------------------------------------------------------------------------
# Custom Exceptions
# ---------------------------------------------------------------------------

class InvalidOrderTransitionError(Exception):
    """
    Raised when a caller attempts an illegal order state transition.
    Carries both states so upstream handlers can log or display the
    exact illegal move without parsing the message string.
    """
    def __init__(
        self,
        from_status: OrderStatus,
        to_status:   OrderStatus,
    ) -> None:
        self.from_status = from_status
        self.to_status   = to_status
        super().__init__(
            f"Illegal order transition: "
            f"'{from_status.value}' → '{to_status.value}'. "
            f"This move is not permitted by platform order rules."
        )


class OrderError(Exception):
    """
    General-purpose order error for violations that are not state
    transitions — currently used when attach_escrow() is called on
    an order that already has an escrow attached.
    """
    def __init__(self, message: str) -> None:
        super().__init__(message)


# ---------------------------------------------------------------------------
# Order Entity
# ---------------------------------------------------------------------------

class Order:
    """
    Represents a single buyer-seller transaction on the JhutLink platform.

    An Order is created by OrderManager from a matched Bid after the seller
    accepts the AuctionEngine's allocation. One Order is created per matched
    buyer — a listing with three matched buyers produces three independent
    Orders, each with its own Escrow instance (Section 8.1 isolation principle).

    The Order is the parent record that ties together:
        - The listing it came from  (listing_id)
        - The buyer and seller      (buyer_id, seller_id)
        - The financial terms       (quantity_kg, price_per_kg_taka)
        - The escrow holding funds  (escrow_id, set after creation)

    updated_at is re-stamped on every status transition — this gives
    OrderManager and the API layer a reliable "last modified" timestamp
    without maintaining a separate audit log on the Order itself.
    The Escrow entity already carries the detailed audit trail.
    """

    _id_counter: int = 0

    def __init__(
        self,
        listing_id:         int,
        seller_id:          int,
        buyer_id:           int,
        quantity_kg:        int,
        price_per_kg_taka: float,
    ) -> None:

        if quantity_kg <= 0:
            raise OrderError(
                f"Order quantity must be positive. Got {quantity_kg} kg."
            )
        if price_per_kg_taka <= 0:
            raise OrderError(
                f"Order price must be positive. Got {price_per_kg_taka}."
            )

        Order._id_counter += 1
        self.order_id:           int               = Order._id_counter
        self.listing_id:         int               = listing_id
        self.seller_id:          int               = seller_id
        self.buyer_id:           int               = buyer_id
        self.quantity_kg:        int               = quantity_kg
        self.price_per_kg_taka: float             = price_per_kg_taka
        self.escrow_id:          int | None        = None
        self.status:             OrderStatus       = OrderStatus.CREATED
        self.created_at:         datetime          = datetime.utcnow()
        self.updated_at:         datetime          = self.created_at

    # ------------------------------------------------------------------
    # Computed Properties
    # ------------------------------------------------------------------

    @property
    def total_value_taka(self) -> float:
        """
        Total order value in taka.
        Always derived from the two source-of-truth fields — never stored
        independently to prevent quantity × price going out of sync.
        """
        return self.quantity_kg * self.price_per_kg_taka

    # ------------------------------------------------------------------
    # State Machine
    # ------------------------------------------------------------------

    def transition_to(self, new_status: OrderStatus, reason: str = "") -> None:
        """
        Single validated gateway for all order state mutations.
        Updates updated_at on every successful transition.

        Design note: This is the third state machine in the system
        (after Escrow and Listing). By Phase 2, the pattern is an
        established system idiom — any new entity with lifecycle states
        should follow the same structure. Consistency here is an
        architectural signal, not repetition.
        """
        allowed: set[OrderStatus] = VALID_ORDER_TRANSITIONS.get(
            self.status, set()
        )

        if new_status not in allowed:
            raise InvalidOrderTransitionError(
                from_status=self.status,
                to_status=new_status,
            )

        self.status     = new_status
        self.updated_at = datetime.utcnow()

    # ------------------------------------------------------------------
    # Escrow Attachment
    # ------------------------------------------------------------------

    def attach_escrow(self, escrow_id: int) -> None:
        """
        Attaches an Escrow instance ID to this order.

        Called once by OrderManager immediately after create_escrow()
        returns. The guard prevents accidental re-attachment — an order
        can only ever be linked to one Escrow. If a second attach is
        attempted (e.g. a bug in OrderManager), this raises immediately
        rather than silently overwriting the existing escrow link.
        """
        if self.escrow_id is not None:
            raise OrderError(
                f"Order #{self.order_id} already has escrow "
                f"#{self.escrow_id} attached. "
                f"Cannot attach escrow #{escrow_id}. "
                f"Re-attaching an escrow is not permitted."
            )
        self.escrow_id  = escrow_id
        self.updated_at = datetime.utcnow()

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """
        Returns a serialisation-ready dict for the JSON storage layer.
        Enum values converted to strings.
        """
        return {
            "order_id":            self.order_id,
            "listing_id":          self.listing_id,
            "seller_id":           self.seller_id,
            "buyer_id":            self.buyer_id,
            "quantity_kg":         self.quantity_kg,
            "price_per_kg_taka":  self.price_per_kg_taka,
            "total_value_taka":    self.total_value_taka,
            "escrow_id":           self.escrow_id,
            "status":              self.status.value,
            "created_at":          self.created_at.isoformat(),
            "updated_at":          self.updated_at.isoformat(),
        }

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        escrow_info = (
            f"Escrow #{self.escrow_id}"
            if self.escrow_id
            else "No escrow attached"
        )
        return (
            f"[ORDER #{self.order_id}] "
            f"Listing #{self.listing_id} | "
            f"Buyer #{self.buyer_id} → Seller #{self.seller_id} | "
            f"{self.quantity_kg} kg @ ৳{self.price_per_kg_taka:.2f}/kg | "
            f"Total: ৳{self.total_value_taka:,.2f} | "
            f"Status: {self.status.value} | "
            f"{escrow_info}"
        )

    def __repr__(self) -> str:
        return (
            f"Order("
            f"order_id={self.order_id!r}, "
            f"buyer_id={self.buyer_id!r}, "
            f"seller_id={self.seller_id!r}, "
            f"quantity_kg={self.quantity_kg!r}, "
            f"status={self.status!r})"
        )