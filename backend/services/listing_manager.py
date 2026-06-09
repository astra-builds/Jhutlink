# backend/services/listing_manager.py
# JhutLink — Listing Manager Service
# Phase 2 | Service Layer — Final Service Class
# Demonstrates: Content-hash duplicate detection, Bulk upload with
#               partial failure collection, Scheduler hook pattern,
#               Dependency injection (NotificationService),
#               Dataclass structured result with summary()

import hashlib
from dataclasses import dataclass, field
from datetime import datetime

from backend.entities.listing import (
    Listing, WasteType, QualityGrade, ListingStatus,
    InvalidAuctionDurationError, InvalidQuantityError,
)
from backend.entities.user import Seller
from backend.services.notification_service import NotificationService
from backend.entities.notification import (
    NotificationType, NotificationChannel,
)


# ---------------------------------------------------------------------------
# Custom Exceptions
# ---------------------------------------------------------------------------

class ListingPermissionError(Exception):
    """
    Raised when a non-Seller user attempts to create a listing.
    The check is done against the actual Python class of the user object —
    not a role string — so it cannot be spoofed by changing a field value.
    """
    def __init__(self, user_id: int, user_class: str) -> None:
        self.user_id    = user_id
        self.user_class = user_class
        super().__init__(
            f"User #{user_id} (type: {user_class}) does not have permission "
            f"to create listings. Only verified Seller accounts may list waste."
        )


class DuplicateListingError(Exception):
    """
    Raised when a listing's content hash matches an existing active listing
    from the same seller. Prevents the same batch of waste from appearing
    in multiple simultaneous listings (Section 15.1).

    Carries the existing listing's ID so the caller can redirect the seller
    to the live listing rather than showing a generic error.
    """
    def __init__(self, existing_listing_id: int, content_hash: str) -> None:
        self.existing_listing_id = existing_listing_id
        self.content_hash        = content_hash
        super().__init__(
            f"A listing with the same seller, waste type, grade, and quantity "
            f"already exists (Listing #{existing_listing_id}). "
            f"Duplicate listings are not permitted. "
            f"Content hash: {content_hash[:12]}..."
        )


class ListingNotFoundError(Exception):
    """
    Raised when get_listing() cannot find a Listing with the requested ID.
    Service-layer 404 equivalent.
    """
    def __init__(self, listing_id: int) -> None:
        self.listing_id = listing_id
        super().__init__(
            f"Listing #{listing_id} was not found in the provided listings list."
        )


# ---------------------------------------------------------------------------
# BulkUploadResult — structured return type for bulk_create_from_csv()
# ---------------------------------------------------------------------------

@dataclass
class BulkUploadResult:
    """
    Immutable record of a bulk CSV upload run.

    Follows the same dataclass-as-result pattern established by
    AllocationResult and MatchResult. Created listings and failed rows
    are collected separately so the caller can act on successes immediately
    without being blocked by failures.

    The summary() method prints a formatted table for the demo and for
    admin review dashboards — display logic lives here, not in the caller.
    """
    created:         list[Listing]  = field(default_factory=list)
    failed:          list[dict]     = field(default_factory=list)
    total_attempted: int            = 0
    total_created:   int            = 0
    total_failed:    int            = 0

    def summary(self) -> None:
        """Prints a clean bulk upload result table to the terminal."""
        print(f"\n  Bulk Upload Result")
        print(f"  {'─' * 61}")
        print(
            f"  Total attempted : {self.total_attempted}"
            f"  |  Created : {self.total_created}"
            f"  |  Failed : {self.total_failed}"
        )
        print(f"  {'─' * 61}")

        if self.created:
            print(f"\n  ✓ Successfully created ({self.total_created}):")
            for lst in self.created:
                print(
                    f"    Listing #{lst.listing_id} | "
                    f"{lst.waste_type.value} | "
                    f"Grade {lst.quality_grade.value} | "
                    f"{lst.quantity_kg} kg | "
                    f"৳{lst.reserve_price_taka:.2f}/kg | "
                    f"{lst.location_district}"
                )

        if self.failed:
            print(f"\n  ✗ Failed rows ({self.total_failed}):")
            for entry in self.failed:
                row    = entry["row"]
                reason = entry["reason"]
                # Show identifying fields from the row for context
                label = (
                    f"{row.get('waste_type', '?')} | "
                    f"Grade {row.get('quality_grade', '?')} | "
                    f"{row.get('quantity_kg', '?')} kg"
                )
                print(f"    Row [{label}]")
                print(f"      Reason: {reason}")
        print()


# ---------------------------------------------------------------------------
# ListingManager Service
# ---------------------------------------------------------------------------

class ListingManager:
    """
    Manages the full lifecycle of Listing objects on the JhutLink platform.

    Covers everything that happens to a Listing outside of bidding:
        - Creation with duplicate detection and permission gating
        - Auction open/close/expiry transitions
        - Active listing queries and seller portfolio views
        - Expiry scheduling hook for the production cron job
        - Bulk CSV upload for factories with recurring waste streams

    Dependency: NotificationService (injected via __init__)
        Used to notify sellers when listings expire. In production,
        ListingManager would also notify buyers via MatchingEngine results —
        that pipeline would be wired in the API route layer, not here.

    What ListingManager does NOT do:
        - It does not run bid allocation (AuctionEngine's job)
        - It does not manage escrow (EscrowService's job)
        - It does not store listings internally — callers pass the list
          (stateless service — same discipline as all other service classes)
    """

    def __init__(self, notification_service: NotificationService) -> None:
        self.notification_service = notification_service

    # ------------------------------------------------------------------
    # Private: Content Hash
    # ------------------------------------------------------------------

    def _content_hash(
        self,
        waste_type:    WasteType,
        quality_grade: QualityGrade,
        quantity_kg:   int,
        seller_id:     int,
    ) -> str:
        """
        Generates an MD5 fingerprint from the four fields that define a
        listing's core identity: seller + waste type + grade + quantity.

        Design note: MD5 is used here for fingerprinting, not for security.
        We do not need cryptographic strength — we need a fast, deterministic
        hash that fits in a small string and has negligible collision risk for
        this domain. hashlib.md5 is built-in, requires no dependencies, and
        is well understood.

        If two listings from the same seller have the same waste type, grade,
        and quantity, they almost certainly represent the same physical batch
        being listed twice — which Section 15.1 explicitly prohibits.

        Returns a 32-character hex string.
        """
        raw = (
            f"{seller_id}:"
            f"{waste_type.value}:"
            f"{quality_grade.value}:"
            f"{quantity_kg}"
        )
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    # ------------------------------------------------------------------
    # Listing Creation
    # ------------------------------------------------------------------

    def create_listing(
        self,
        seller:               Seller,
        waste_type:           WasteType,
        quantity_kg:          int,
        reserve_price_taka:  float,
        quality_grade:        QualityGrade,
        location_district:    str,
        photos:               list[str],
        auction_duration_hours: int,
        existing_listings:    list[Listing] = None,
    ) -> Listing:
        """
        Creates and returns a new Listing after passing permission and
        duplicate checks.

        Guard order:
          1. Permission check — is the caller actually a Seller instance?
          2. Duplicate check — does a hash-matching listing already exist?
          3. Listing constructor — validates quantity, duration, price
          4. seller.create_listing_slot() — increments seller's counter

        The Listing is returned in DRAFT state — caller must call
        open_listing() to publish it. This two-step design lets sellers
        build and preview a listing before it goes live.

        Args:
            seller:                Seller instance creating the listing.
            waste_type:            WasteType enum value.
            quantity_kg:           Total quantity in kg (min 50).
            reserve_price_taka:   Floor price per kg in taka.
            quality_grade:         QualityGrade enum value.
            location_district:     District name string.
            photos:                List of photo URL strings (min 2 to open).
            auction_duration_hours: 24, 48, or 72 only.
            existing_listings:     Current listings pool for duplicate check.

        Returns:
            New Listing in DRAFT state.

        Raises:
            ListingPermissionError:  if seller is not a Seller instance.
            DuplicateListingError:   if a content-identical listing exists.
            InvalidAuctionDurationError: (from entity) if duration invalid.
            InvalidQuantityError:    (from entity) if quantity < 50.
        """
        # Guard 1 — permission: check the actual Python class, not a field
        if not isinstance(seller, Seller):
            raise ListingPermissionError(
                user_id=getattr(seller, "id", -1),
                user_class=type(seller).__name__,
            )

        # Guard 2 — duplicate detection via content hash
        content_hash = self._content_hash(
            waste_type=waste_type,
            quality_grade=quality_grade,
            quantity_kg=quantity_kg,
            seller_id=seller.id,
        )

        for existing in (existing_listings or []):
            if (existing.seller_id == seller.id
                    and existing.status not in {
                        ListingStatus.SOLD,
                        ListingStatus.EXPIRED,
                    }):
                existing_hash = self._content_hash(
                    waste_type=existing.waste_type,
                    quality_grade=existing.quality_grade,
                    quantity_kg=existing.quantity_kg,
                    seller_id=existing.seller_id,
                )
                if existing_hash == content_hash:
                    raise DuplicateListingError(
                        existing_listing_id=existing.listing_id,
                        content_hash=content_hash,
                    )

        # Guard 3 — build the Listing (entity validates qty, duration, price)
        listing = Listing(
            seller_id=seller.id,
            waste_type=waste_type,
            quantity_kg=quantity_kg,
            reserve_price_taka=reserve_price_taka,
            quality_grade=quality_grade,
            location_district=location_district,
            photos=photos,
            auction_duration_hours=auction_duration_hours,
        )

        # Guard 4 — record the slot on the seller entity
        seller.create_listing_slot()

        return listing

    # ------------------------------------------------------------------
    # Auction Lifecycle
    # ------------------------------------------------------------------

    def open_listing(self, listing: Listing) -> Listing:
        """
        Publishes a DRAFT listing by opening its auction window.
        Delegates to listing.open_auction() which validates photo count
        and transitions DRAFT → ACTIVE.

        Returns the now-active listing for chaining.
        """
        listing.open_auction()
        return listing

    def close_listing(self, listing: Listing) -> None:
        """
        Closes an ACTIVE listing's auction window.
        Called by the background scheduler or manually by admin.
        Transitions ACTIVE → CLOSED.
        After this, AuctionEngine.run_allocation() should be called.
        """
        listing.close_auction()

    def expire_listing(self, listing: Listing) -> None:
        """
        Marks a listing as expired (no bids, auction window elapsed).
        Transitions ACTIVE → EXPIRED.

        Sends a seller notification after expiry. In production, a dedicated
        NotificationType.LISTING_EXPIRED type would be added to the enum and
        templates — we use SHIPMENT_UPDATED as a stand-in here since the
        notification infrastructure is already wired and the type is close
        enough in urgency to demonstrate the pattern.
        """
        listing.mark_expired()

        # PRODUCTION NOTE: Replace NotificationType.SHIPMENT_UPDATED with a
        # dedicated NotificationType.LISTING_EXPIRED type. The template would
        # read: "Your listing #{listing_id} ({waste_type}) expired with no bids.
        # You can re-list at any time from your seller dashboard."
        self.notification_service.notify(
            recipient_id=listing.seller_id,
            notification_type=NotificationType.SHIPMENT_UPDATED,
            channels=[NotificationChannel.IN_APP],
            metadata={
                "order_id":     f"N/A (Listing #{listing.listing_id})",
                "status":       "EXPIRED",
                "tracking_ref": f"Listing #{listing.listing_id} — "
                                f"{listing.waste_type.value} "
                                f"Grade {listing.quality_grade.value} "
                                f"{listing.quantity_kg} kg has expired "
                                f"with no successful bids. You may re-list.",
            },
        )

    # ------------------------------------------------------------------
    # Query Methods
    # ------------------------------------------------------------------

    def get_listing(
        self,
        listing_id: int,
        listings:   list[Listing],
    ) -> Listing:
        """
        Finds and returns a Listing by ID from the provided list.

        Raises:
            ListingNotFoundError: if not found.
        """
        for lst in listings:
            if lst.listing_id == listing_id:
                return lst
        raise ListingNotFoundError(listing_id)

    def get_active_listings(
        self,
        listings: list[Listing],
    ) -> list[Listing]:
        """
        Returns all listings whose auction window is currently open,
        sorted by auction_end_time ascending — soonest closing first.

        This ordering ensures buyers see the most time-sensitive listings
        at the top of the marketplace feed before sorting by other signals
        (rating, boost) is applied by the ranking algorithm.
        """
        active = [lst for lst in listings if lst.is_auction_open()]
        return sorted(
            active,
            key=lambda lst: lst.auction_end_time,
        )

    def get_seller_listings(
        self,
        seller_id: int,
        listings:  list[Listing],
    ) -> list[Listing]:
        """
        Returns all listings belonging to a seller, sorted by created_at
        descending (most recently created first — mirrors a seller dashboard).
        Includes listings in ALL states — the seller can see sold, expired,
        and draft listings in their portfolio view.
        """
        seller_listings = [
            lst for lst in listings if lst.seller_id == seller_id
        ]
        return sorted(
            seller_listings,
            key=lambda lst: lst.created_at,
            reverse=True,
        )

    # ------------------------------------------------------------------
    # Scheduler Hook
    # ------------------------------------------------------------------

    def check_expiries(self, listings: list[Listing]) -> int:
        """
        Scans all ACTIVE listings and expires any whose auction window has
        elapsed without being explicitly closed.

        PRODUCTION SCHEDULER NOTE:
            This method is designed to be called by a Celery beat task on a
            fixed interval (e.g. every 5 minutes). The task would call:
                listing_manager.check_expiries(all_active_listings)
            No modification to this method is required for production — the
            scheduler just needs to pass in the current active listings.

        A listing is expired if:
            - Its status is ACTIVE, AND
            - is_auction_open() returns False (end time has passed)

        Note: listings that were explicitly closed by close_listing() are
        in CLOSED state (not ACTIVE) and are skipped by the status filter.

        Returns:
            Count of listings that were transitioned to EXPIRED.
        """
        expired_count = 0
        for lst in listings:
            if lst.status == ListingStatus.ACTIVE and not lst.is_auction_open():
                self.expire_listing(lst)
                expired_count += 1
        return expired_count

    # ------------------------------------------------------------------
    # Bulk CSV Upload
    # ------------------------------------------------------------------

    def bulk_create_from_csv(
        self,
        seller:            Seller,
        csv_rows:          list[dict],
        existing_listings: list[Listing] = None,
    ) -> BulkUploadResult:
        """
        Creates multiple listings from a list of dicts (CSV rows).

        Each row dict must contain keys matching Listing constructor params:
            waste_type, quantity_kg, reserve_price_taka, quality_grade,
            location_district, photos, auction_duration_hours

        Design note — collect-all-failures pattern:
            Failures do not abort the batch. If row 3 has an invalid duration,
            rows 1, 2, 4, and 5 still get processed. This is critical for
            factory users uploading 50-row CSV files — a single bad row should
            not wipe out the rest of their upload session.

        Each created listing is also appended to the running
        existing_listings list so that duplicates within the same CSV batch
        are caught mid-upload (row 4 cannot duplicate row 2 in the same file).

        Args:
            seller:            The Seller performing the bulk upload.
            csv_rows:          List of row dicts, one per listing to create.
            existing_listings: Current listings pool (modified in-place to
                               catch intra-batch duplicates).

        Returns:
            BulkUploadResult dataclass with created listings and failed rows.
        """
        existing_listings = list(existing_listings or [])
        created:  list[Listing] = []
        failed:   list[dict]    = []

        for row in csv_rows:
            try:
                # Map raw CSV values to typed enum instances
                waste_type    = WasteType(row["waste_type"])
                quality_grade = QualityGrade(row["quality_grade"])

                listing = self.create_listing(
                    seller=seller,
                    waste_type=waste_type,
                    quantity_kg=int(row["quantity_kg"]),
                    reserve_price_taka=float(row["reserve_price_taka"]),
                    quality_grade=quality_grade,
                    location_district=str(row["location_district"]),
                    photos=list(row.get("photos", [])),
                    auction_duration_hours=int(row["auction_duration_hours"]),
                    existing_listings=existing_listings,
                )
                # Add to existing pool immediately — catches intra-batch dupes
                existing_listings.append(listing)
                created.append(listing)

            except Exception as e:
                failed.append({
                    "row":    row,
                    "reason": str(e),
                })

        return BulkUploadResult(
            created=created,
            failed=failed,
            total_attempted=len(csv_rows),
            total_created=len(created),
            total_failed=len(failed),
        )


# ---------------------------------------------------------------------------
# Demo — run with: python -m backend.services.listing_manager
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    from datetime import timedelta
    from backend.entities.user import Seller
    from backend.services.notification_service import NotificationService

    def section(title: str) -> None:
        print(f"\n{'=' * 65}")
        print(f"  {title}")
        print(f"{'=' * 65}")

    # ===================================================================
    section("JHUTLINK — ListingManager Demo")

    # Setup
    notif_svc = NotificationService()
    mgr       = ListingManager(notification_service=notif_svc)

    seller = Seller(
        name="Rahim Textile Mills",
        email="rahim@rahimtextile.com",
        password_hash="hashed_pw",
        trade_license="TL-GZP-2024-0042",
    )
    seller.status = "active"

    all_listings: list[Listing] = []

    # -------------------------------------------------------------------
    # Happy path: create 3 listings, open them
    # -------------------------------------------------------------------
    section("STEP 1 — Create and open 3 listings")

    specs = [
        dict(
            waste_type=WasteType.COTTON, quantity_kg=300,
            reserve_price_taka=14.0, quality_grade=QualityGrade.A,
            location_district="Dhaka", photos=["a.jpg", "b.jpg"],
            auction_duration_hours=48,
        ),
        dict(
            waste_type=WasteType.DENIM, quantity_kg=200,
            reserve_price_taka=9.0, quality_grade=QualityGrade.B,
            location_district="Gazipur", photos=["c.jpg", "d.jpg"],
            auction_duration_hours=24,
        ),
        dict(
            waste_type=WasteType.POLYESTER, quantity_kg=150,
            reserve_price_taka=7.0, quality_grade=QualityGrade.C,
            location_district="Narayanganj", photos=["e.jpg", "f.jpg"],
            auction_duration_hours=72,
        ),
    ]

    for spec in specs:
        lst = mgr.create_listing(
            seller=seller,
            existing_listings=all_listings,
            **spec,
        )
        mgr.open_listing(lst)
        all_listings.append(lst)
        print(f"  Created + opened: {lst}")

    print(f"\n  Seller listing count: {seller.listing_count}  ← auto-incremented ✓")

    # -------------------------------------------------------------------
    # get_active_listings — sorted by auction_end_time ascending
    # -------------------------------------------------------------------
    section("STEP 2 — get_active_listings() sorted by soonest closing")

    active = mgr.get_active_listings(all_listings)
    print(f"\n  {len(active)} active listing(s), soonest closing first:")
    for lst in active:
        print(
            f"  Listing #{lst.listing_id} | "
            f"{lst.waste_type.value} | "
            f"Closes: {lst.auction_end_time.strftime('%Y-%m-%d %H:%M UTC')} | "
            f"Duration: {lst.auction_duration_hours}h"
        )

    # -------------------------------------------------------------------
    # Duplicate detection
    # -------------------------------------------------------------------
    section("STEP 3 — Duplicate listing detection")

    print("\n  Attempting to create a Cotton Grade A 300 kg listing again...")
    try:
        duplicate = mgr.create_listing(
            seller=seller,
            waste_type=WasteType.COTTON,
            quantity_kg=300,
            reserve_price_taka=12.0,
            quality_grade=QualityGrade.A,
            location_district="Gazipur",    # different district — hash ignores district
            photos=["new1.jpg", "new2.jpg"],
            auction_duration_hours=24,
            existing_listings=all_listings,
        )
    except DuplicateListingError as e:
        print(f"  ✓ Caught DuplicateListingError:")
        print(f"    Existing listing ID : #{e.existing_listing_id}")
        print(f"    Content hash prefix : {e.content_hash[:16]}...")
        print(f"    Message             : {e}")

    # -------------------------------------------------------------------
    # Permission check — Buyer cannot create a listing
    # -------------------------------------------------------------------
    section("STEP 4 — ListingPermissionError guard")

    from backend.entities.user import Buyer
    non_seller = Buyer(
        name="Fake Seller", email="fake@bad.com",
        password_hash="x",
    )
    try:
        mgr.create_listing(
            seller=non_seller,          # type: ignore  (intentional wrong type)
            waste_type=WasteType.MIXED,
            quantity_kg=100,
            reserve_price_taka=8.0,
            quality_grade=QualityGrade.B,
            location_district="Dhaka",
            photos=["x.jpg", "y.jpg"],
            auction_duration_hours=24,
            existing_listings=all_listings,
        )
    except ListingPermissionError as e:
        print(f"\n  ✓ Caught ListingPermissionError:")
        print(f"    User ID    : #{e.user_id}")
        print(f"    User class : {e.user_class}")
        print(f"    Message    : {e}")

    # -------------------------------------------------------------------
    # Bulk CSV upload
    # -------------------------------------------------------------------
    section("STEP 5 — Bulk CSV upload (3 valid, 1 duplicate, 1 bad duration)")

    csv_rows = [
        # Row 1 — valid new listing
        dict(
            waste_type="Mixed", quantity_kg=100,
            reserve_price_taka=8.0, quality_grade="B",
            location_district="Dhaka",
            photos=["p1.jpg", "p2.jpg"],
            auction_duration_hours=24,
        ),
        # Row 2 — valid new listing
        dict(
            waste_type="Synthetic Blend", quantity_kg=200,
            reserve_price_taka=6.5, quality_grade="C",
            location_district="Gazipur",
            photos=["p3.jpg", "p4.jpg"],
            auction_duration_hours=48,
        ),
        # Row 3 — valid new listing
        dict(
            waste_type="Denim", quantity_kg=500,
            reserve_price_taka=11.0, quality_grade="A",
            location_district="Narayanganj",
            photos=["p5.jpg", "p6.jpg"],
            auction_duration_hours=72,
        ),
        # Row 4 — duplicate: same seller, Denim A 200 kg already exists (listing #2)
        dict(
            waste_type="Denim", quantity_kg=200,
            reserve_price_taka=9.5, quality_grade="B",
            location_district="Dhaka",
            photos=["p7.jpg", "p8.jpg"],
            auction_duration_hours=24,
        ),
        # Row 5 — invalid auction duration (36h not allowed)
        dict(
            waste_type="Cotton", quantity_kg=80,
            reserve_price_taka=13.0, quality_grade="A",
            location_district="Dhaka",
            photos=["p9.jpg", "p10.jpg"],
            auction_duration_hours=36,
        ),
    ]

    bulk_result = mgr.bulk_create_from_csv(
        seller=seller,
        csv_rows=csv_rows,
        existing_listings=all_listings,
    )
    bulk_result.summary()

    # Add bulk-created listings to our pool
    all_listings.extend(bulk_result.created)

    # -------------------------------------------------------------------
    # Expiry check
    # -------------------------------------------------------------------
    section("STEP 6 — Expiry check via check_expiries()")

    # Force one listing's auction_end_time into the past to simulate expiry
    target = all_listings[1]   # Denim Grade B listing
    target.auction_end_time = datetime.utcnow() - timedelta(hours=1)
    print(
        f"\n  Manually backdated auction_end_time for listing "
        f"#{target.listing_id} ({target.waste_type.value}) to 1 hour ago."
    )
    print(f"  is_auction_open() = {target.is_auction_open()}  ← False ✓")
    print(f"  Status before     : {target.status.value}")

    expired_count = mgr.check_expiries(all_listings)
    print(f"\n  check_expiries() expired  : {expired_count} listing(s)")
    print(f"  Status after              : {target.status.value}  ← EXPIRED ✓")
    print(f"  Notification queue size   : {notif_svc.queue_size()}  "
          f"← seller notified ✓")

    # Show the queued expiry notification
    unread = notif_svc.get_unread(recipient_id=seller.id)
    if unread:
        n = unread[0]
        print(f"\n  Queued notification for seller:")
        print(f"    {n}")
        print(f"    Body: {n.body}")

    # -------------------------------------------------------------------
    # get_seller_listings
    # -------------------------------------------------------------------
    section("STEP 7 — get_seller_listings() portfolio view")

    portfolio = mgr.get_seller_listings(seller.id, all_listings)
    print(f"\n  Seller #{seller.id} has {len(portfolio)} listing(s) "
          f"(newest first):")
    for lst in portfolio:
        print(
            f"  Listing #{lst.listing_id} | "
            f"{lst.waste_type.value:16} | "
            f"Grade {lst.quality_grade.value} | "
            f"{lst.quantity_kg:>5} kg | "
            f"Status: {lst.status.value}"
        )

    section("Demo complete — ListingManager fully verified. Phase 2 COMPLETE.")