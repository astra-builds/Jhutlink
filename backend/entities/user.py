# backend/entities/user.py
# JhutLink — User Inheritance Hierarchy
# Phase 1 | Entity Layer
# Demonstrates: Inheritance, Encapsulation, Polymorphism, Class-level state

from datetime import datetime


# ---------------------------------------------------------------------------
# Custom Exceptions
# ---------------------------------------------------------------------------

class InvalidRoleError(Exception):
    """
    Raised when a caller attempts to instantiate a User with a role
    string that does not exist in the platform's role registry.

    Design note: We use a dedicated exception class rather than a bare
    ValueError so that callers can catch role errors specifically without
    accidentally swallowing unrelated ValueErrors from other parts of
    the system.
    """
    def __init__(self, role: str) -> None:
        self.role = role
        super().__init__(
            f"'{role}' is not a valid JhutLink role. "
            f"Allowed roles: seller, buyer, admin."
        )


class AccountStatusError(Exception):
    """
    Raised when an action is attempted on an account whose current
    status does not permit that action (e.g. a suspended buyer bidding).
    """
    def __init__(self, action: str, status: str) -> None:
        super().__init__(
            f"Cannot perform '{action}' — account status is '{status}'."
        )


# ---------------------------------------------------------------------------
# Base User Class
# ---------------------------------------------------------------------------

class User:
    """
    Base class for all JhutLink platform users.

    Holds identity, authentication, and lifecycle attributes that are
    common across every role. Subclasses (Seller, Buyer, Admin) extend
    this with role-specific state and behaviour — they never duplicate
    the fields defined here.

    Class-level counter (_id_counter) ensures every User instance gets
    a unique, auto-incremented integer ID regardless of how many
    subclasses are instantiated and in what order.

    Status lifecycle:
        pending_verification → active → suspended → banned
    """

    VALID_ROLES: set[str] = {"seller", "buyer", "admin"}
    VALID_STATUSES: set[str] = {"pending_verification", "active", "suspended", "banned"}

    _id_counter: int = 0  # Class-level — shared across ALL subclasses

    def __init__(self, name: str, email: str, password_hash: str, role: str, ) -> None:
        if role not in self.VALID_ROLES:
            raise InvalidRoleError(role)

        # Auto-increment: increment first, then assign — IDs start at 1
        User._id_counter += 1
        self.id: int = User._id_counter

        self.name: str = name
        self.email: str = email
        self.password_hash: str = password_hash
        self.role: str = role
        self.status: str = "pending_verification"
        self.created_at: datetime = datetime.utcnow()

    # ------------------------------------------------------------------
    # Public Methods
    # ------------------------------------------------------------------

    def register(self) -> str:
        """
        Marks the account as registered and returns a confirmation message.
        In production this would also persist the user via UserManager.
        Status stays 'pending_verification' until admin approves KYB.
        """
        return (
            f"User '{self.name}' registered successfully. "
            f"Status: {self.status}. Awaiting admin verification."
        )

    def login(self, password_hash_attempt: str) -> bool:
        """
        Validates a login attempt against the stored password hash.
        Returns True only if hash matches AND account is active.

        Design note: We compare hashes, never plaintext. The actual bcrypt
        comparison happens in UserManager — this method is the entity-level
        guard that checks account status independently.
        """
        if self.status != "active":
            raise AccountStatusError("login", self.status)
        return self.password_hash == password_hash_attempt

    def update_profile(self, name: str = None, email: str = None) -> None:
        """
        Updates mutable profile fields. Immutable fields (id, role,
        created_at) cannot be changed through this method by design.
        """
        if name:
            self.name = name
        if email:
            self.email = email

    def activate(self) -> None:
        """Transitions status from pending_verification to active."""
        if self.status != "pending_verification":
            raise AccountStatusError("activate", self.status)
        self.status = "active"

    def suspend(self) -> None:
        """Suspends an active account."""
        if self.status != "active":
            raise AccountStatusError("suspend", self.status)
        self.status = "suspended"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "password_hash": self.password_hash,
            "role": self.role,
            "status": self.status,
            "created_at": self.created_at.isoformat()
        }

    def ban(self) -> None:
        """Permanently bans an account. Terminal state — cannot be reversed."""
        self.status = "banned"

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        return (
            f"[{self.role.upper()} #{self.id}] "
            f"{self.name} <{self.email}> | Status: {self.status}"
        )

    def __repr__(self) -> str:
        return (
            f"User(id={self.id!r}, name={self.name!r}, "
            f"role={self.role!r}, status={self.status!r})"
        )


# ---------------------------------------------------------------------------
# Seller — extends User
# ---------------------------------------------------------------------------

class Seller(User):
    """
    A verified business entity that uploads and sells textile waste listings.

    Extends User with:
    - trade_license: required for KYB verification (admin reviews this)
    - rating: float 0.0–5.0, updated after each completed order
    - listing_count: tracks how many active listings this seller has posted
    - strikes: disciplinary counter — 3 strikes results in a ban (see Section 15.4)

    Seller-specific methods encapsulate actions only a seller can perform.
    A Buyer object physically cannot call accept_bid() — enforced by class
    structure, not by a conditional role check buried inside a function.
    """

    MAX_STRIKES: int = 3

    def __init__(
        self,
        name: str,
        email: str,
        password_hash: str,
        trade_license: str,
    ) -> None:
        super().__init__(name, email, password_hash, role="seller")
        self.trade_license: str = trade_license
        self.rating: float = 0.0
        self.listing_count: int = 0
        self.strikes: int = 0

    # ------------------------------------------------------------------
    # Seller Actions
    # ------------------------------------------------------------------

    def create_listing_slot(self) -> str:
        """
        Increments the active listing counter and confirms the seller
        can open a new listing slot. The actual Listing object is
        created by ListingManager — this method represents the seller's
        side of the interaction.
        """
        if self.status != "active":
            raise AccountStatusError("create_listing_slot", self.status)
        self.listing_count += 1
        return (
            f"Listing slot #{self.listing_count} opened for seller "
            f"'{self.name}' (ID {self.id})."
        )

    def accept_bid(self, bid_id: int, listing_id: int) -> str:
        """
        Records the seller's decision to accept a matched bid.
        In the full system, this triggers Order and Escrow creation
        via OrderManager — the method here represents the entity-level action.
        """
        if self.status != "active":
            raise AccountStatusError("accept_bid", self.status)
        return (
            f"Seller '{self.name}' accepted bid #{bid_id} "
            f"on listing #{listing_id}. Order creation initiated."
        )

    def get_strike(self, reason: str) -> str:
        """
        Applies a disciplinary strike to this seller's account.
        If MAX_STRIKES is reached, the account is automatically banned.
        Mirrors the Account Strikes System in Section 15.4.
        """
        self.strikes += 1
        message = (
            f"Strike {self.strikes}/{self.MAX_STRIKES} applied to "
            f"seller '{self.name}'. Reason: {reason}."
        )
        if self.strikes >= self.MAX_STRIKES:
            self.ban()
            message += " Account has been permanently banned."
        return message

    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({
            "trade_license": self.trade_license,
            "rating": self.rating,
            "listing_count": self.listing_count,
            "strikes": self.strikes
        })
        return data

    def update_rating(self, new_score: float) -> None:
        """
        Updates seller rating. Expects a pre-calculated rolling average
        from AnalyticsEngine — does not compute the average itself
        (Single Responsibility principle).
        """
        if not (0.0 <= new_score <= 5.0):
            raise ValueError(f"Rating must be between 0.0 and 5.0, got {new_score}.")
        self.rating = round(new_score, 2)

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        return (
            f"[SELLER #{self.id}] {self.name} <{self.email}> | "
            f"Status: {self.status} | Rating: {self.rating}/5.0 | "
            f"Listings: {self.listing_count} | Strikes: {self.strikes}"
        )

    def __repr__(self) -> str:
        return (
            f"Seller(id={self.id!r}, name={self.name!r}, "
            f"rating={self.rating!r}, strikes={self.strikes!r}, "
            f"status={self.status!r})"
        )


# ---------------------------------------------------------------------------
# Buyer — extends User
# ---------------------------------------------------------------------------

class Buyer(User):
    """
    A verified business entity that browses listings, places bids,
    and purchases textile waste.

    Extends User with:
    - watchlist: list of listing IDs this buyer is tracking
    """

    def __init__(
        self,
        name: str,
        email: str,
        password_hash: str,
    ) -> None:
        super().__init__(name, email, password_hash, role="buyer")
        self.watchlist: list[int] = []

    # ------------------------------------------------------------------
    # Buyer Actions
    # ------------------------------------------------------------------

    def place_bid(self, listing_id: int, quantity_kg: int, price_per_kg: float) -> str:
        """
        Represents the buyer's intent to bid on a listing.
        The actual Bid object is created and validated by AuctionEngine.
        This method is the entity-level action — it confirms the buyer
        is active and the quantity meets the platform minimum (50 kg).
        """
        if self.status != "active":
            raise AccountStatusError("place_bid", self.status)
        if quantity_kg < 50:
            raise ValueError(
                f"Minimum bid quantity is 50 kg. Got {quantity_kg} kg."
            )
        return (
            f"Buyer '{self.name}' placed a bid on "
            f"listing #{listing_id} — {quantity_kg} kg @ ৳{price_per_kg}/kg."
        )

    def confirm_delivery(self, order_id: int) -> str:
        """
        Buyer confirms they have received the goods.
        This triggers the CONFIRMED transition in the Escrow state machine,
        releasing funds to the seller.
        """
        if self.status != "active":
            raise AccountStatusError("confirm_delivery", self.status)
        return (
            f"Buyer '{self.name}' confirmed delivery for order #{order_id}. "
            f"Escrow release initiated."
        )

    def raise_dispute(self, order_id: int, reason: str) -> str:
        """
        Opens a dispute against a delivered order.
        Must happen within 48 hours of delivery confirmation (enforced
        by EscrowService, not here — Single Responsibility).
        """
        if self.status != "active":
            raise AccountStatusError("raise_dispute", self.status)
        return (
            f"Dispute raised by buyer '{self.name}' on order #{order_id}. "
            f"Reason: {reason}. Escrow funds frozen pending admin review."
        )

    def add_to_watchlist(self, listing_id: int) -> str:
        """Adds a listing to the buyer's watchlist if not already present."""
        if listing_id in self.watchlist:
            return f"Listing #{listing_id} is already on your watchlist."
        self.watchlist.append(listing_id)
        return f"Listing #{listing_id} added to watchlist."

    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({
            "watchlist": self.watchlist
        })
        return data

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        return (
            f"[BUYER #{self.id}] {self.name} <{self.email}> | "
            f"Status: {self.status} | "
            f"Watchlist: {len(self.watchlist)} listing(s)"
        )

    def __repr__(self) -> str:
        return (
            f"Buyer(id={self.id!r}, name={self.name!r}, "
            f"status={self.status!r})"
        )


# ---------------------------------------------------------------------------
# Admin — extends User
# ---------------------------------------------------------------------------

class Admin(User):
    """
    Internal platform operator with elevated permissions for moderation,
    dispute resolution, and user management.

    Extends User with:
    - department: the team this admin belongs to (e.g. 'Trust & Safety',
      'Operations') — useful when the platform scales to multiple staff

    Admin accounts are created internally — they bypass KYB and are
    activated immediately. They cannot place bids or post listings.
    """

    def __init__(
        self,
        name: str,
        email: str,
        password_hash: str,
        department: str,
    ) -> None:
        super().__init__(name, email, password_hash, role="admin")
        self.department: str = department
        # Admins are pre-verified — activated immediately on creation
        self.status = "active"

    # ------------------------------------------------------------------
    # Admin Actions
    # ------------------------------------------------------------------

    def verify_user(self, user: User) -> str:
        """
        Approves a pending user's KYB/KYC verification,
        transitioning their account from pending_verification to active.
        """
        user.activate()
        return (
            f"Admin '{self.name}' ({self.department}) verified "
            f"{user.role} '{user.name}' (ID {user.id}). Account is now active."
        )

    def resolve_dispute(self, order_id: int, ruling: str, notes: str) -> str:
        """
        Records an admin ruling on a disputed order.
        'ruling' should be 'seller_fault' or 'buyer_fault' —
        EscrowService reads this to determine refund or release.
        """
        valid_rulings = {"seller_fault", "buyer_fault"}
        if ruling not in valid_rulings:
            raise ValueError(
                f"Invalid ruling '{ruling}'. Must be one of: {valid_rulings}."
            )
        return (
            f"Admin '{self.name}' resolved dispute for order #{order_id}. "
            f"Ruling: {ruling}. Notes: {notes}"
        )

    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({
            "department": self.department
        })
        return data

    def ban_user(self, user: User, reason: str) -> str:
        """
        Permanently bans any user account. Terminal action.
        Logs the admin who performed the action for the audit trail.
        """
        user.ban()
        return (
            f"Admin '{self.name}' ({self.department}) permanently banned "
            f"{user.role} '{user.name}' (ID {user.id}). Reason: {reason}"
        )

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        return (
            f"[ADMIN #{self.id}] {self.name} <{self.email}> | "
            f"Department: {self.department} | Status: {self.status}"
        )

    def __repr__(self) -> str:
        return (
            f"Admin(id={self.id!r}, name={self.name!r}, "
            f"department={self.department!r}, status={self.status!r})"
        )


# ---------------------------------------------------------------------------
# Demo — run with: python backend/entities/user.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 65)
    print("  JHUTLINK — User Hierarchy Demo")
    print("=" * 65)

    # --- 1. Create three users and verify auto-incremented IDs ----------
    seller = Seller(
        name="Rahim Textile Mills",
        email="rahim@rahimtextile.com",
        password_hash="hashed_password_abc123",
        trade_license="TL-DHK-2024-00881",
    )

    buyer = Buyer(
        name="Green Recyclers Ltd",
        email="procurement@greenrecyclers.bd",
        password_hash="hashed_password_xyz789",
    )

    admin = Admin(
        name="Fatema Akter",
        email="fatema@jhutlink.com",
        password_hash="hashed_admin_pass_999",
        department="Trust & Safety",
    )

    # --- 2. Print all three via __str__ ----------------------------------
    print("\n--- User Objects (via __str__) ---")
    print(seller)
    print(buyer)
    print(admin)

    print("\n--- Repr Output ---")
    print(repr(seller))
    print(repr(buyer))
    print(repr(admin))

    # --- 3. Confirm auto-incremented IDs are sequential -----------------
    print(f"\n--- ID Check ---")
    print(f"Seller ID: {seller.id}  |  Buyer ID: {buyer.id}  |  Admin ID: {admin.id}")
    assert seller.id < buyer.id < admin.id, "IDs are not sequential!"
    print("✓ IDs are sequential and unique across all subclasses.")

    # --- 4. Admin verifies the seller account ---------------------------
    print(f"\n--- KYB Verification Flow ---")
    print(f"Seller status before: {seller.status}")
    result = admin.verify_user(seller)
    print(result)
    print(f"Seller status after:  {seller.status}")

    # --- 5. Seller opens a listing slot ---------------------------------
    print(f"\n--- Seller Creates a Listing Slot ---")
    print(seller.create_listing_slot())

    # --- 6. Admin also verifies the buyer -------------------------------
    admin.verify_user(buyer)
    print(f"\n--- Buyer Places a Bid ---")
    print(buyer.place_bid(listing_id=1, quantity_kg=150, price_per_kg=14.50))

    # --- 7. Buyer adds a listing to watchlist ---------------------------
    print(f"\n--- Buyer Watchlist ---")
    print(buyer.add_to_watchlist(listing_id=1))
    print(buyer.add_to_watchlist(listing_id=1))  # duplicate — should warn

    # --- 8. Seller receives a strike ------------------------------------
    print(f"\n--- Strikes System ---")
    print(seller.get_strike("Mislabeled waste grade on listing #1"))

    # --- 9. InvalidRoleError: attempt to create User with bad role ------
    print(f"\n--- Invalid Role Guard ---")
    try:
        bad_user = User(
            name="Hacker",
            email="hacker@fake.com",
            password_hash="irrelevant",
            role="superuser",   # Not in VALID_ROLES
        )
    except InvalidRoleError as e:
        print(f"✓ Caught InvalidRoleError: {e}")

    # --- 10. AccountStatusError: suspended buyer tries to bid -----------
    print(f"\n--- Account Status Guard ---")
    buyer.suspend()
    try:
        buyer.place_bid(listing_id=2, quantity_kg=100, price_per_kg=12.0)
    except AccountStatusError as e:
        print(f"✓ Caught AccountStatusError: {e}")

    print("\n" + "=" * 65)
    print("  Demo complete. All OOP concepts verified.")
    print("=" * 65)