# backend/entities/bid.py
# JhutLink — Bid Entity
# Phase 1 | Entity Layer
# Demonstrates: Enum status guards, Constructor-level validation,
#               Computed properties, Partial fill tracking,
#               Lightweight transition guards (vs. full table)

from datetime import datetime
from enum import Enum


# ---------------------------------------------------------------------------
# Domain Enums
# ---------------------------------------------------------------------------

class BidStatus(Enum):
    """
    Lifecycle states for a single bid.

    State diagram:
        PENDING → MATCHED  (allocation engine selected this bid)
        PENDING → OUTBID   (a higher bid took the quantity)
        PENDING → VOID     (buyer cancelled, payment missed, or admin voided)

    All three transitions originate from PENDING — there is exactly one
    starting state and three terminal states. This is why Bid uses per-method
    guards instead of a full transition table: a dict with one key and three
    values would be more machinery than the problem needs.
    """
    PENDING = "PENDING"
    MATCHED = "MATCHED"
    OUTBID  = "OUTBID"
    VOID    = "VOID"



# ---------------------------------------------------------------------------
# Custom Exceptions
# ---------------------------------------------------------------------------

class InvalidBidQuantityError(Exception):
    """
    Raised when a bid quantity is zero, negative, or below the platform
    minimum of 50 kg per bid (Section 7.2).

    Storing the attempted quantity on the exception lets upstream handlers
    log or display it without parsing the message string.
    """
    def __init__(self, quantity_kg: int) -> None:
        self.quantity_kg = quantity_kg
        super().__init__(
            f"Invalid bid quantity: {quantity_kg} kg. "
            f"Bids must be for a minimum of 50 kg."
        )


class BidBelowReserveError(Exception):
    """
    Raised when a buyer's offered price per kg is below the seller's
    reserve price. Bids below reserve are categorically invalid and
    are never stored (Section 7.2 — 'Bids below reserve price are invalid').
    """
    def __init__(self, bid_taka: float, reserve_taka: float) -> None:
        self.bid_taka     = bid_taka
        self.reserve_taka = reserve_taka
        super().__init__(
            f"Bid price ৳{bid_taka:.2f}/kg is below the listing "
            f"reserve price of ৳{reserve_taka:.2f}/kg. "
            f"Bid rejected — must meet or exceed reserve."
        )


class InvalidBidTransitionError(Exception):
    """
    Raised when a state-changing method (match, outbid, void) is called
    on a Bid that is not in PENDING status.

    Unlike Escrow and Listing where transitions form a graph, Bid
    transitions are all one-hop from PENDING — so this exception carries
    the current status and the attempted action name rather than
    from/to states.
    """
    def __init__(self, current_status: BidStatus, attempted_action: str) -> None:
        self.current_status   = current_status
        self.attempted_action = attempted_action
        super().__init__(
            f"Cannot perform '{attempted_action}' on a bid "
            f"with status '{current_status.value}'. "
            f"This action is only valid on PENDING bids."
        )


# ---------------------------------------------------------------------------
# Bid Entity
# ---------------------------------------------------------------------------

class Bid:
    """
    Represents a single buyer's offer on a specific waste listing.

    A Bid is immutable after creation in all fields except status,
    matched_at, and quantity_allocated_kg — the allocation engine
    sets those after the auction closes. This immutability is enforced
    by convention (no setters) rather than by Python's property machinery,
    keeping the class readable.

    Design note on partial fills (Section 7.3):
    A buyer bids for quantity_kg but may receive less if the listing runs
    out of stock before their bid is fully filled. The match() method accepts
    quantity_allocated_kg separately from quantity_kg so the Bid object
    records both what was asked for and what was actually granted.
    This distinction matters for order creation and buyer notification.
    """

    _id_counter: int = 0

    def __init__(
        self,
        listing_id:          int,
        buyer_id:            int,
        buyer_name:          str,
        quantity_kg:         int,
        price_per_kg_taka:  float,
        reserve_price_taka: float,
    ) -> None:

        # --- Validate quantity -------------------------------------------
        if quantity_kg < 50:
            raise InvalidBidQuantityError(quantity_kg)

        # --- Validate price against reserve (Section 7.2) ----------------
        if price_per_kg_taka < reserve_price_taka:
            raise BidBelowReserveError(
                bid_taka=price_per_kg_taka,
                reserve_taka=reserve_price_taka,
            )

        # --- Identity and core attributes --------------------------------
        Bid._id_counter += 1
        self.bid_id:             int      = Bid._id_counter
        self.listing_id:         int      = listing_id
        self.buyer_id:           int      = buyer_id
        self.buyer_name:         str      = buyer_name
        self.quantity_kg:        int      = quantity_kg
        self.price_per_kg_taka: float    = price_per_kg_taka

        # --- Lifecycle state ---------------------------------------------
        self.status:              BidStatus       = BidStatus.PENDING
        self.created_at:          datetime        = datetime.utcnow()
        self.matched_at:          datetime | None = None

        # Set by match() — may be less than quantity_kg on partial fill
        self.quantity_allocated_kg: int | None = None

        # Reserve is stored so downstream code can reference it without
        # needing to re-fetch the Listing (e.g. in audit logs)
        self._reserve_price_taka: float = reserve_price_taka

    # ------------------------------------------------------------------
    # Computed Properties — derived, never stored
    # ------------------------------------------------------------------

    @property
    def total_value_taka(self) -> float:
        """
        Total order value in taka.
        Uses quantity_allocated_kg if matched (partial fill may apply),
        otherwise uses the originally requested quantity_kg.

        Design note: this property changes meaning after match() is called —
        before matching it is the *requested* value, after matching it is
        the *actual* order value. This is intentional: the property always
        reflects the most accurate value available at any point in time.
        """
        quantity = (
            self.quantity_allocated_kg
            if self.quantity_allocated_kg is not None
            else self.quantity_kg
        )
        return quantity * self.price_per_kg_taka

    @property
    def is_partial_fill(self) -> bool:
        """
        Returns True if this bid was matched but for less than
        the originally requested quantity. Useful for buyer notifications.
        """
        if self.status != BidStatus.MATCHED:
            return False
        return self.quantity_allocated_kg < self.quantity_kg

    # ------------------------------------------------------------------
    # State Transition Methods
    # ------------------------------------------------------------------

    def match(self, quantity_allocated_kg: int) -> None:
        """
        Marks this bid as matched by the allocation engine.
        Transitions PENDING → MATCHED.

        quantity_allocated_kg is the actual amount granted — may equal
        quantity_kg (full fill) or be less (partial fill, Section 7.3).
        The AuctionEngine passes this value after running the greedy
        allocation algorithm.

        Raises:
            InvalidBidTransitionError: if status is not PENDING.
            InvalidBidQuantityError:   if allocated quantity is nonsensical.
        """
        if self.status != BidStatus.PENDING:
            raise InvalidBidTransitionError(
                current_status=self.status,
                attempted_action="match",
            )
        if quantity_allocated_kg <= 0:
            raise InvalidBidQuantityError(quantity_allocated_kg)
        if quantity_allocated_kg > self.quantity_kg:
            raise ValueError(
                f"Allocated quantity ({quantity_allocated_kg} kg) cannot exceed "
                f"requested quantity ({self.quantity_kg} kg)."
            )

        self.quantity_allocated_kg = quantity_allocated_kg
        self.matched_at            = datetime.utcnow()
        self.status                = BidStatus.MATCHED  # commit last

    def outbid(self) -> None:
        """
        Marks this bid as outbid — a higher-priced bid has taken the
        available quantity. Transitions PENDING → OUTBID.
        Called by AuctionEngine during allocation when this bid ranks
        too low to receive any quantity.

        Raises:
            InvalidBidTransitionError: if status is not PENDING.
        """
        if self.status != BidStatus.PENDING:
            raise InvalidBidTransitionError(
                current_status=self.status,
                attempted_action="outbid",
            )
        self.status = BidStatus.OUTBID

    def void(self) -> None:
        """
        Voids this bid. Transitions PENDING → VOID.
        Valid reasons: buyer cancellation, payment timeout (24h window
        missed), admin action, or off-platform dealing detected.
        Quantity is returned to the listing for re-allocation.

        Raises:
            InvalidBidTransitionError: if status is not PENDING.
        """
        if self.status != BidStatus.PENDING:
            raise InvalidBidTransitionError(
                current_status=self.status,
                attempted_action="void",
            )
        self.status = BidStatus.VOID

    # ------------------------------------------------------------------
    # Query Methods
    # ------------------------------------------------------------------

    def is_active(self) -> bool:
        """
        Returns True if and only if the bid is still in PENDING status.
        AuctionEngine uses this to filter the bid pool before running
        allocation — OUTBID and VOID bids must never enter the allocator.
        """
        return self.status == BidStatus.PENDING

    def to_dict(self) -> dict:
        """
        Full serialisation for the JSON storage layer.
        Includes all fields needed by JsonStorage.load_bids()
        to reconstruct the object exactly.
        """
        return {
            "bid_id":                  self.bid_id,
            "listing_id":              self.listing_id,
            "buyer_id":                self.buyer_id,
            "buyer_name":              self.buyer_name,
            "quantity_kg":             self.quantity_kg,
            "quantity_allocated_kg":   self.quantity_allocated_kg,
            "price_per_kg_taka":      self.price_per_kg_taka,
            "reserve_price_taka":     self._reserve_price_taka,
            "status":                  self.status.value,
            "created_at":              self.created_at.isoformat(),
            "matched_at": (
                self.matched_at.isoformat() if self.matched_at else None
            ),
        }

    def summary(self) -> dict:
        """Serialisation-ready dict for API responses."""
        return {
            "bid_id":                  self.bid_id,
            "listing_id":              self.listing_id,
            "buyer_id":                self.buyer_id,
            "buyer_name":              self.buyer_name,
            "quantity_kg":             self.quantity_kg,
            "quantity_allocated_kg":   self.quantity_allocated_kg,
            "price_per_kg_taka":      self.price_per_kg_taka,
            "total_value_taka":       self.total_value_taka,
            "status":                  self.status.value,
            "is_partial_fill":         self.is_partial_fill,
            "created_at":              self.created_at.isoformat(),
            "matched_at": (
                self.matched_at.isoformat() if self.matched_at else None
            ),
        }

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        alloc_info = ""
        if self.status == BidStatus.MATCHED:
            alloc_info = (
                f" | Allocated: {self.quantity_allocated_kg} kg"
                + (" [PARTIAL FILL]" if self.is_partial_fill else " [FULL FILL]")
            )

        return (
            f"[BID #{self.bid_id}] "
            f"Buyer #{self.buyer_id} ({self.buyer_name}) | "
            f"Listing #{self.listing_id} | "
            f"{self.quantity_kg} kg @ "
            f"৳{self.price_per_kg_taka:.2f}/kg | "
            f"Total: ৳{self.total_value_taka:,.2f} | "
            f"Status: {self.status.value}"
            f"{alloc_info}"
        )

    def __repr__(self) -> str:
        return (
            f"Bid("
            f"bid_id={self.bid_id!r}, "
            f"listing_id={self.listing_id!r}, "
            f"buyer_id={self.buyer_id!r}, "
            f"buyer_name={self.buyer_name!r}, "
            f"quantity_kg={self.quantity_kg!r}, "
            f"price_per_kg_taka={self.price_per_kg_taka!r}, "
            f"status={self.status!r})"
        )

    def __lt__(self, other: "Bid") -> bool:
        """
        Comparison support: bids are ordered by price per kg, descending.
        Defining __lt__ lets the AuctionEngine call sorted(bids, reverse=True)
        to rank bids without writing a custom key function every time.
        Higher price per kg = higher priority in allocation.
        """
        return self.price_per_kg_taka < other.price_per_kg_taka


# ---------------------------------------------------------------------------
# Demo — run with: python backend/entities/bid.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    print("=" * 65)
    print("  JHUTLINK — Bid Entity Demo")
    print("=" * 65)

    # Shared listing context — no Listing object needed, just the IDs
    LISTING_ID       = 7
    RESERVE_TAKA    = 12.0

    print(
        f"\n  Listing #{LISTING_ID} | "
        f"Reserve: ৳{RESERVE_TAKA:.2f}/kg\n"
    )

    # -------------------------------------------------------------------
    # Scenario 1: Create 3 bids
    # -------------------------------------------------------------------
    print("[SCENARIO 1] Three bids placed on the same listing")
    print("-" * 65)

    bid_a = Bid(
        listing_id=LISTING_ID, buyer_id=101, buyer_name="Enterprise Buyer",
        quantity_kg=300, price_per_kg_taka=15.0,
        reserve_price_taka=RESERVE_TAKA,
    )

    bid_b = Bid(
        listing_id=LISTING_ID, buyer_id=102, buyer_name="Mid Buyer",
        quantity_kg=150, price_per_kg_taka=13.0,
        reserve_price_taka=RESERVE_TAKA,
    )

    bid_c = Bid(
        listing_id=LISTING_ID, buyer_id=103, buyer_name="Micro Buyer",
        quantity_kg=200, price_per_kg_taka=12.0,
        reserve_price_taka=RESERVE_TAKA,
    )

    print(bid_a)
    print(bid_b)
    print(bid_c)

    # -------------------------------------------------------------------
    # Scenario 2: Allocation engine runs — match with partial fill
    # Bid A gets 300 kg (full fill)
    # Bid B gets 150 kg (full fill)
    # Bid C gets 50 kg (partial fill — only 50 kg remaining of 500 kg lot)
    # -------------------------------------------------------------------
    print("\n[SCENARIO 2] Allocation result — Bid A full, Bid C partial fill")
    print("-" * 65)

    bid_a.match(quantity_allocated_kg=300)
    print(f"Bid A after match : {bid_a}")
    print(
        f"  total_value_taka  : ৳{bid_a.total_value_taka:,.2f}  "
        f"← {bid_a.quantity_allocated_kg} kg × ৳{bid_a.price_per_kg_taka:.2f}/kg"
    )
    print(f"  is_partial_fill   : {bid_a.is_partial_fill}  ← full fill ✓")

    # Bid C: requested 200 kg, only 50 kg remain after A and B fill
    bid_c.match(quantity_allocated_kg=50)
    print(f"\nBid C after match : {bid_c}")
    print(f"  Requested         : {bid_c.quantity_kg} kg")
    print(f"  Allocated         : {bid_c.quantity_allocated_kg} kg")
    print(f"  is_partial_fill   : {bid_c.is_partial_fill}  ← partial fill ✓")
    print(
        f"  total_value_taka  : ৳{bid_c.total_value_taka:,.2f}  "
        f"← reflects allocated qty, not requested qty"
    )

    # -------------------------------------------------------------------
    # Scenario 3: Outbid — Bid B loses to higher bids
    # -------------------------------------------------------------------
    print("\n[SCENARIO 3] Bid B marked as OUTBID")
    print("-" * 65)

    bid_b.outbid()
    print(f"Bid B after outbid: {bid_b}")
    print(f"  is_active() → {bid_b.is_active()}  ← removed from active pool ✓")

    # -------------------------------------------------------------------
    # Scenario 4: Transition guard — try to match an OUTBID bid
    # -------------------------------------------------------------------
    print("\n[SCENARIO 4] Illegal transition — match() on an OUTBID bid")
    print("-" * 65)

    try:
        bid_b.match(quantity_allocated_kg=150)
    except InvalidBidTransitionError as e:
        print(f"✓ Caught InvalidBidTransitionError:")
        print(f"  Current status  : {e.current_status.value}")
        print(f"  Attempted action: {e.attempted_action}")
        print(f"  Message         : {e}")
    print(f"  Bid B status unchanged: {bid_b.status.value}  ← still OUTBID ✓")

    # -------------------------------------------------------------------
    # Scenario 5: BidBelowReserveError — price under reserve
    # -------------------------------------------------------------------
    print("\n[SCENARIO 5] Bid placed below reserve price")
    print("-" * 65)

    try:
        bad_bid = Bid(
            listing_id=LISTING_ID, buyer_id=104, buyer_name="Small Buyer",
            quantity_kg=100,
            price_per_kg_taka=11.0,
            reserve_price_taka=RESERVE_TAKA,
        )
    except BidBelowReserveError as e:
        print(f"✓ Caught BidBelowReserveError:")
        print(f"  Bid price  : ৳{e.bid_taka:.2f}/kg")
        print(f"  Reserve    : ৳{e.reserve_taka:.2f}/kg")
        print(f"  Message    : {e}")

    # -------------------------------------------------------------------
    # Scenario 6: InvalidBidQuantityError — quantity below 50 kg
    # -------------------------------------------------------------------
    print("\n[SCENARIO 6] Bid quantity below platform minimum")
    print("-" * 65)

    try:
        tiny_bid = Bid(
            listing_id=LISTING_ID, buyer_id=105, buyer_name="Tiny Buyer",
            quantity_kg=30,
            price_per_kg_taka=13.0,
            reserve_price_taka=RESERVE_TAKA,
        )
    except InvalidBidQuantityError as e:
        print(f"✓ Caught InvalidBidQuantityError: {e}")

    # -------------------------------------------------------------------
    # Scenario 7: Sorting — __lt__ lets sorted() rank by price desc
    # -------------------------------------------------------------------
    print("\n[SCENARIO 7] Natural sort order for allocation engine")
    print("-" * 65)

    bid_x = Bid(
        listing_id=LISTING_ID, buyer_id=201, buyer_name="Big Corp",
        quantity_kg=100, price_per_kg_taka=18.0,
        reserve_price_taka=RESERVE_TAKA,
    )
    bid_y = Bid(
        listing_id=LISTING_ID, buyer_id=202, buyer_name="Mid Corp",
        quantity_kg=80, price_per_kg_taka=13.5,
        reserve_price_taka=RESERVE_TAKA,
    )
    bid_z = Bid(
        listing_id=LISTING_ID, buyer_id=203, buyer_name="Small Shop",
        quantity_kg=60, price_per_kg_taka=12.5,
        reserve_price_taka=RESERVE_TAKA,
    )

    unsorted_pool = [bid_z, bid_x, bid_y]
    ranked = sorted(unsorted_pool, reverse=True)   # highest price first

    print("  Allocation priority order (highest price/kg first):")
    for rank, b in enumerate(ranked, start=1):
        print(f"  #{rank}  {b}")

    # -------------------------------------------------------------------
    # Final state of all original bids
    # -------------------------------------------------------------------
    print("\n[FINAL STATE] All three original bids")
    print("-" * 65)
    for b in [bid_a, bid_b, bid_c]:
        print(b)

    print("\n" + "=" * 65)
    print("  Demo complete. All 7 bid scenarios verified.")
    print("=" * 65)