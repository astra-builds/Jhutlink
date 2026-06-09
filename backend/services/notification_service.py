# backend/services/notification_service.py
# JhutLink — Notification Service
# Phase 2 | Service Layer
# Demonstrates: Template-driven message construction (data-driven dispatch),
#               In-memory queue as justified stateful service,
#               Pipeline pattern (MatchingEngine → NotificationService),
#               One-object-per-channel delivery model,
#               Batch flush pattern for production readiness

from backend.entities.notification import (
    Notification,
    NotificationType,
    NotificationChannel,
    NotificationStatus,
)
from backend.entities.order import Order
from backend.services.email_sender import EmailSender, ConsoleEmailSender


# ---------------------------------------------------------------------------
# Message Template Registry
# ---------------------------------------------------------------------------
# Maps every NotificationType to a (title, body_template) pair.
# Body templates use Python's str.format(**metadata) — any key in metadata
# can be interpolated using {key_name} syntax in the template string.
#
# Design note: keeping templates here (module-level, outside the class)
# means they are defined once, visible at a glance, and editable without
# touching any method logic. Adding a new NotificationType requires only:
#   1. One new entry in NotificationType enum (notification.py)
#   2. One new entry in this dict
# No changes to any method body are needed — the system is open for
# extension without modification (Open/Closed Principle in practice).

NOTIFICATION_TEMPLATES: dict[NotificationType, tuple[str, str]] = {

    NotificationType.MATCH_FOUND: (
        "New listing matches your preferences",
        "Listing #{listing_id} is a {score}% match for your preferences. "
        "{waste_type} waste, Grade {grade}, {quantity_kg} kg available "
        "at ৳{price_taka}/kg in {district}. Check it out before bidding closes.",
    ),
    NotificationType.BID_PLACED: (
        "Bid received on your listing",
        "Buyer #{buyer_id} placed a bid of ৳{price_taka}/kg for "
        "{quantity_kg} kg on your listing #{listing_id}.",
    ),
    NotificationType.BID_MATCHED: (
        "Your bid was matched — payment required",
        "Congratulations! Your bid on listing #{listing_id} was matched. "
        "You have been allocated {quantity_kg} kg at ৳{price_taka}/kg "
        "(total: ৳{total_taka}). Please complete payment within 24 hours.",
    ),
    NotificationType.BID_OUTBID: (
        "Your bid was not selected",
        "Your bid on listing #{listing_id} was not selected in the allocation. "
        "Higher bids filled the available quantity. "
        "Set up a preference alert to catch similar listings.",
    ),
    NotificationType.ORDER_CONFIRMED: (
        "Order confirmed",
        "Order #{order_id} has been confirmed. "
        "Seller #{seller_id} will prepare your shipment within 48 hours.",
    ),
    NotificationType.PAYMENT_RECEIVED: (
        "Payment received — prepare your shipment",
        "Payment for order #{order_id} has been received and locked in escrow. "
        "Please pack and dispatch within 48 hours to avoid an automatic refund.",
    ),
    NotificationType.SHIPMENT_UPDATED: (
        "Shipment update for your order",
        "Order #{order_id} status updated to: {status}. "
        "Tracking reference: {tracking_ref}.",
    ),
    NotificationType.DELIVERY_CONFIRMED: (
        "Delivery confirmed — please verify",
        "Order #{order_id} has been marked as delivered. "
        "Please confirm receipt within 48 hours. "
        "If there is a quality issue, raise a dispute before the window closes.",
    ),
    NotificationType.DISPUTE_OPENED: (
        "Dispute opened on order",
        "A dispute has been raised on order #{order_id}. "
        "Reason: {reason}. "
        "Our team will review within 72 hours. Funds are frozen until resolved.",
    ),
    NotificationType.DISPUTE_RESOLVED: (
        "Dispute resolved",
        "The dispute on order #{order_id} has been resolved. "
        "Ruling: {ruling}. {outcome_message}",
    ),
    NotificationType.ACCOUNT_VERIFIED: (
        "Account verified — welcome to JhutLink",
        "Your account has been verified by our team. "
        "You can now post listings and place bids on the platform.",
    ),
    NotificationType.ACCOUNT_BANNED: (
        "Account suspended",
        "Your account has been suspended due to: {reason}. "
        "Contact support@jhutlink.com if you believe this is an error.",
    ),
    NotificationType.NEW_LISTING: (
        "New listing available on JhutLink",
        "Seller {seller_name} listed {quantity_kg} kg of {waste_type} "
        "(Grade {grade}) at ৳{price_taka}/kg in {district}.",
    ),
}


# ---------------------------------------------------------------------------
# NotificationService
# ---------------------------------------------------------------------------

class NotificationService:
    """
    Event-driven notification dispatcher for the JhutLink platform.

    This is the ONE stateful service in the system — it maintains an
    internal queue (self._queue) of Notification objects. This is a
    justified exception to the stateless service pattern because
    notifications are inherently accumulative: they are created by many
    different events, queued together, and dispatched in batches.

    In production, flush_queue() would iterate the queue and:
        - IN_APP  → write to the notifications table in PostgreSQL
        - EMAIL   → dispatch via SendGrid or Amazon SES
        - SMS     → dispatch via a Bangladesh SMS gateway (e.g. SSL Wireless)
    For the project, flush_queue() returns the queued list and clears it,
    demonstrating the batch dispatch pattern without external dependencies.

    Template system:
        Every NotificationType maps to a (title, body_template) in
        NOTIFICATION_TEMPLATES. Body templates use str.format(**metadata)
        for interpolation. If a template key is missing from metadata, the
        format call raises a KeyError — the caller is responsible for passing
        complete metadata. This is intentional: a missing key means a bug
        in the caller, not in the notification system.

    One-object-per-channel model:
        A single notify() call for channels=[IN_APP, EMAIL] creates TWO
        Notification objects — one per channel. Each has its own read/archive
        lifecycle. This mirrors how real notification systems work: in-app
        and email delivery are independent events.
    """

    def __init__(self, email_sender: EmailSender | None = None) -> None:
        # In-memory queue — accumulates notifications until flush_queue() is called.
        # In production, this would be replaced with a Redis list or Celery task queue.
        self._queue: list[Notification] = []
        self._email_sender: EmailSender = email_sender or ConsoleEmailSender()

    # ------------------------------------------------------------------
    # Core Construction
    # ------------------------------------------------------------------

    def _build_notification(
        self,
        recipient_id:      int,
        notification_type: NotificationType,
        channel:           NotificationChannel,
        metadata:          dict,
    ) -> Notification:
        """
        Private factory method — constructs a Notification from a type
        and metadata dict using the NOTIFICATION_TEMPLATES registry.

        Keeps object construction out of notify() so that method stays
        focused on routing and queuing. Single Responsibility at the
        method level.

        Args:
            recipient_id:      The user ID receiving this notification.
            notification_type: The event type — used to look up template.
            channel:           Delivery channel for this instance.
            metadata:          Dict of values to interpolate into body template.

        Returns:
            A new Notification object in UNREAD status.
        """
        title_template, body_template = NOTIFICATION_TEMPLATES[notification_type]

        # Interpolate metadata into body. Missing keys raise KeyError — by design.
        # A missing key means the caller didn't provide required context.
        try:
            body = body_template.format(**metadata)
        except KeyError as e:
            # Provide a clear error so the developer knows exactly what's missing
            raise KeyError(
                f"Notification template for {notification_type.value} "
                f"requires metadata key {e} which was not provided. "
                f"Metadata received: {list(metadata.keys())}"
            )

        return Notification(
            recipient_id=recipient_id,
            notification_type=notification_type,
            channel=channel,
            title=title_template,
            body=body,
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # Core Dispatch
    # ------------------------------------------------------------------

    def notify(
        self,
        recipient_id:      int,
        notification_type: NotificationType,
        channels:          list[NotificationChannel],
        metadata:          dict = None,
    ) -> list[Notification]:
        """
        Creates one Notification per channel and appends all to the queue.

        This is the single entry point for all notification creation.
        Every higher-level method (notify_match, notify_bid_outcome, etc.)
        calls this method internally — they are convenience wrappers that
        know which channels and metadata to pass for their event type.

        Args:
            recipient_id:      User ID of the notification recipient.
            notification_type: Event type — drives template selection.
            channels:          List of channels to deliver on.
            metadata:          Context dict for template interpolation.

        Returns:
            List of created Notification objects (one per channel).
        """
        metadata = metadata or {}
        created: list[Notification] = []

        for channel in channels:
            notif = self._build_notification(
                recipient_id=recipient_id,
                notification_type=notification_type,
                channel=channel,
                metadata=metadata,
            )
            self._queue.append(notif)
            created.append(notif)

        return created

    # ------------------------------------------------------------------
    # Event-Specific Convenience Methods
    # ------------------------------------------------------------------

    def notify_match(
        self,
        buyer_id:      int,
        buyer_email:   str,
        match_results: list,   # list[MatchResult] — avoid circular import
    ) -> list:
        """
        Sends IN_APP + EMAIL match notifications for each MatchResult from
        MatchingEngine.get_matches(). One notification per matched listing.

        Called immediately after MatchingEngine.get_matches() returns,
        forming the MatchingEngine → NotificationService pipeline.

        Args:
            buyer_id:      The buyer receiving the recommendations.
            buyer_email:   The buyer's email address for EMAIL channel.
            match_results: List of MatchResult objects from MatchingEngine.

        Returns:
            List of all Notification objects created (one per channel per match).
        """
        all_notifs = []
        for match in match_results:
            listing = match.listing
            notifs = self.notify(
                recipient_id=buyer_id,
                notification_type=NotificationType.MATCH_FOUND,
                channels=[NotificationChannel.IN_APP, NotificationChannel.EMAIL],
                metadata={
                    "listing_id":  listing.listing_id,
                    "score":       match.score,
                    "waste_type":  listing.waste_type.value,
                    "grade":       listing.quality_grade.value,
                    "quantity_kg": listing.quantity_kg,
                    "price_taka":  f"{listing.reserve_price_taka:.2f}",
                    "district":    listing.location_district,
                    "recipient_email": buyer_email,
                },
            )
            all_notifs.extend(notifs)
        return all_notifs

    def notify_bid_placed(
        self,
        bid,
        seller_id:   int,
        seller_email: str,
    ) -> list[Notification]:
        """
        Notifies a seller that a buyer placed a bid on their listing.
        Sends IN_APP + EMAIL.

        Args:
            bid:          The Bid that was just placed.
            seller_id:    The seller's user ID.
            seller_email: The seller's email address.

        Returns:
            List of created Notification objects (2 — one per channel).
        """
        return self.notify(
            recipient_id=seller_id,
            notification_type=NotificationType.BID_PLACED,
            channels=[NotificationChannel.IN_APP, NotificationChannel.EMAIL],
            metadata={
                "buyer_id":    bid.buyer_id,
                "listing_id":  bid.listing_id,
                "quantity_kg": bid.quantity_kg,
                "price_taka":  f"{bid.price_per_kg_taka:.2f}",
                "recipient_email": seller_email,
            },
        )

    def notify_bid_outcome(
        self,
        bid,                    # Bid entity — avoid circular import with type hint
        matched: bool = True,
        buyer_email: str = "",
    ) -> list[Notification]:
        """
        Notifies a buyer whether their bid was matched or outbid.
        Sends to both IN_APP and EMAIL channels — bid outcomes are
        high-priority events that warrant multi-channel delivery.

        Args:
            bid:     The Bid object with outcome (BidStatus.MATCHED or OUTBID).
            matched: True if the bid was matched, False if outbid.

        Returns:
            List of created Notification objects (2 — one per channel).
        """
        if matched:
            notification_type = NotificationType.BID_MATCHED
            quantity = bid.quantity_allocated_kg or bid.quantity_kg
            metadata = {
                "listing_id":  bid.listing_id,
                "quantity_kg": quantity,
                "price_taka":  f"{bid.price_per_kg_taka:.2f}",
                "total_taka":  f"{bid.total_value_taka:,.2f}",
                "recipient_email": buyer_email,
            }
        else:
            notification_type = NotificationType.BID_OUTBID
            metadata = {
                "listing_id": bid.listing_id,
                "recipient_email": buyer_email,
            }

        return self.notify(
            recipient_id=bid.buyer_id,
            notification_type=notification_type,
            channels=[NotificationChannel.IN_APP, NotificationChannel.EMAIL],
            metadata=metadata,
        )

    def notify_order_event(
        self,
        order:             Order,
        notification_type: NotificationType,
        extra_metadata:    dict = None,
    ) -> list[Notification]:
        """
        Sends an order lifecycle notification to BOTH buyer and seller.

        Order events (confirmed, dispatched, delivered, etc.) are relevant
        to both parties — buyer tracks their purchase, seller tracks their
        fulfilment. Two notify() calls produce two independent notification
        records per channel.

        Channel: IN_APP only for order events. Critical path events (delivery
        confirmation, dispute resolution) use SMS — that escalation is handled
        by the caller passing a different channels list via direct notify() calls.

        Args:
            order:             The Order being notified about.
            notification_type: The event type.
            extra_metadata:    Additional context beyond order fields.

        Returns:
            Combined list of all Notification objects created.
        """
        base_metadata = {
            "order_id":  order.order_id,
            "seller_id": order.seller_id,
            "buyer_id":  order.buyer_id,
            "status":    order.status.value,
            **(extra_metadata or {}),
        }

        buyer_notifs = self.notify(
            recipient_id=order.buyer_id,
            notification_type=notification_type,
            channels=[NotificationChannel.IN_APP],
            metadata=base_metadata,
        )
        seller_notifs = self.notify(
            recipient_id=order.seller_id,
            notification_type=notification_type,
            channels=[NotificationChannel.IN_APP],
            metadata=base_metadata,
        )
        return buyer_notifs + seller_notifs

    # ------------------------------------------------------------------
    # Queue Management
    # ------------------------------------------------------------------

    def get_unread(self, recipient_id: int) -> list[Notification]:
        """
        Returns all unread notifications for a recipient, newest first.
        Does not remove from queue — read state is managed separately
        via mark_read() on each Notification object.

        Args:
            recipient_id: The user ID to filter by.

        Returns:
            List of UNREAD Notification objects, sorted by created_at DESC.
        """
        unread = [
            n for n in self._queue
            if n.recipient_id == recipient_id and n.is_unread()
        ]
        return sorted(unread, key=lambda n: n.created_at, reverse=True)

    def flush_queue(self) -> list[Notification]:
        """
        Dispatches all queued notifications:
          - IN_APP:   returned in the list (caller persists to storage)
          - EMAIL:    sent via EmailSender then returned in the list

        Returns:
            All notifications that were in the queue at time of call.
        """
        dispatched = list(self._queue)
        self._queue.clear()

        for notif in dispatched:
            if notif.channel == NotificationChannel.EMAIL and self._email_sender:
                self._email_sender.send(
                    to=notif.recipient_email or "",
                    subject=notif.title,
                    body=notif.body,
                )

        return dispatched

    def mark_all_read(self, recipient_id: int) -> int:
        """
        Marks every unread notification for a recipient as READ.
        Useful for "mark all as read" UI action in the notification feed.

        Calls mark_read() on each notification — the entity's own method
        handles status validation. If a notification was already READ (race
        condition between two concurrent requests), the error is silently
        swallowed here because the desired outcome (notification is READ)
        is already achieved.

        Args:
            recipient_id: The user whose notifications to mark read.

        Returns:
            Count of notifications successfully marked as READ.
        """
        from backend.entities.notification import NotificationError

        count = 0
        for notif in self._queue:
            if notif.recipient_id == recipient_id and notif.is_unread():
                try:
                    notif.mark_read()
                    count += 1
                except NotificationError:
                    pass  # Already read — desired state achieved, continue
        return count

    def queue_size(self) -> int:
        """Returns the current number of notifications in the queue."""
        return len(self._queue)


# ---------------------------------------------------------------------------
# Demo — run with: python -m backend.services.notification_service
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    from backend.entities.listing import Listing, WasteType, QualityGrade
    from backend.entities.user import Buyer, Seller
    from backend.entities.preference import Preference
    from backend.entities.bid import Bid
    from backend.services.matching_engine import MatchingEngine

    def section(title: str) -> None:
        print(f"\n{'=' * 65}")
        print(f"  {title}")
        print(f"{'=' * 65}")

    def print_notif_detail(notif: Notification) -> None:
        """Prints full title and body for a notification."""
        print(f"\n  {notif}")
        print(f"    Title : {notif.title}")
        print(f"    Body  : {notif.body}")
        if notif.metadata:
            print(f"    Meta  : {notif.metadata}")

    # ===================================================================
    section("JHUTLINK — NotificationService + MatchingEngine Pipeline Demo")

    notif_svc = NotificationService()

    # -------------------------------------------------------------------
    # Step 1: Set up buyer and preferences
    # -------------------------------------------------------------------
    section("STEP 1 — Buyer, Preferences, and Listings")

    buyer = Buyer(
        name="Green Recyclers Ltd",
        email="buyer@greenrecyclers.bd",
        password_hash="hashed",
        tier="Mid",
    )
    buyer.status = "active"

    pref = Preference(
        buyer_id=buyer.id,
        preferred_waste_types=[WasteType.COTTON, WasteType.DENIM],
        preferred_grades=[QualityGrade.A, QualityGrade.B],
        min_quantity_kg=100,
        max_price_per_kg_taka=80.0,
        preferred_districts=["Dhaka", "Gazipur"],
    )

    # Four listings: 2 strong/good matches, 1 possible, 1 hard-filtered
    l1 = Listing(
        seller_id=10, waste_type=WasteType.COTTON,
        quantity_kg=250, reserve_price_taka=70.0,
        quality_grade=QualityGrade.A, location_district="Dhaka",
        photos=["a.jpg", "b.jpg"], auction_duration_hours=48,
    )
    l1.open_auction()

    l2 = Listing(
        seller_id=11, waste_type=WasteType.DENIM,
        quantity_kg=180, reserve_price_taka=75.0,
        quality_grade=QualityGrade.B, location_district="Dhaka",
        photos=["a.jpg", "b.jpg"], auction_duration_hours=24,
    )
    l2.open_auction()

    l3 = Listing(
        seller_id=12, waste_type=WasteType.COTTON,
        quantity_kg=120, reserve_price_taka=60.0,
        quality_grade=QualityGrade.B, location_district="Gazipur",
        photos=["a.jpg", "b.jpg"], auction_duration_hours=48,
    )
    l3.open_auction()

    l4 = Listing(
        seller_id=13, waste_type=WasteType.POLYESTER,  # fails hard filter
        quantity_kg=300, reserve_price_taka=40.0,
        quality_grade=QualityGrade.C, location_district="Dhaka",
        photos=["a.jpg", "b.jpg"], auction_duration_hours=24,
    )
    l4.open_auction()

    all_listings = [l1, l2, l3, l4]
    print(f"\n  Buyer   : {buyer}")
    print(f"  Pref    : {pref}")
    print(f"  Listings: {len(all_listings)} created "
          f"({len(all_listings) - 1} expected to pass hard filter)")

    # -------------------------------------------------------------------
    # Step 2: Run MatchingEngine, pipe results to NotificationService
    # -------------------------------------------------------------------
    section("STEP 2 — MatchingEngine → NotificationService pipeline")

    engine = MatchingEngine()
    matches = engine.get_matches(
        buyer=buyer,
        listings=all_listings,
        preferences=[pref],
    )

    print(f"\n  MatchingEngine returned {len(matches)} match(es):")
    for m in matches:
        print(f"    Listing #{m.listing_id} | Score: {m.score}/100 "
              f"| {m.recommendation_label}")

    print(f"\n  Queue size before notify_match: {notif_svc.queue_size()}")
    created_count = notif_svc.notify_match(
        buyer_id=buyer.id,
        buyer_email=buyer.email,
        match_results=matches,
    )
    print(f"  notify_match() created {created_count} notification(s)")
    print(f"  Queue size after notify_match : {notif_svc.queue_size()}")

    # -------------------------------------------------------------------
    # Step 3: Print all unread notifications for the buyer
    # -------------------------------------------------------------------
    section("STEP 3 — Unread notifications for buyer")

    unread = notif_svc.get_unread(recipient_id=buyer.id)
    print(f"\n  {len(unread)} unread notification(s) for buyer #{buyer.id}:\n")
    for notif in unread:
        print_notif_detail(notif)

    # -------------------------------------------------------------------
    # Step 4: Bid outcome notifications
    # -------------------------------------------------------------------
    section("STEP 4 — Bid outcome notifications (matched + outbid)")

    # Matched bid — buyer gets IN_APP + EMAIL
    matched_bid = Bid(
        listing_id=l1.listing_id, buyer_id=buyer.id,
        buyer_name="Matched Buyer", quantity_kg=150,
        price_per_kg_taka=70.0, reserve_price_taka=70.0,
    )
    matched_bid.match(quantity_allocated_kg=150)

    print(f"\n  Sending BID_MATCHED notifications (IN_APP + EMAIL)...")
    matched_notifs = notif_svc.notify_bid_outcome(matched_bid, matched=True)
    for notif in matched_notifs:
        print_notif_detail(notif)

    # Outbid — buyer gets IN_APP + EMAIL
    outbid_bid = Bid(
        listing_id=l2.listing_id, buyer_id=buyer.id,
        buyer_name="Outbid Buyer", quantity_kg=100,
        price_per_kg_taka=75.0, reserve_price_taka=75.0,
    )
    outbid_bid.outbid()

    print(f"\n  Sending BID_OUTBID notifications (IN_APP + EMAIL)...")
    outbid_notifs = notif_svc.notify_bid_outcome(outbid_bid, matched=False)
    for notif in outbid_notifs:
        print_notif_detail(notif)

    # -------------------------------------------------------------------
    # Step 5: Order event notification
    # -------------------------------------------------------------------
    section("STEP 5 — Order event notification (buyer + seller)")

    from backend.entities.order import Order, OrderStatus

    order = Order(
        listing_id=l1.listing_id,
        seller_id=10,
        buyer_id=buyer.id,
        quantity_kg=150,
        price_per_kg_taka=70.0,
    )
    order.transition_to(OrderStatus.PAYMENT_PENDING)
    order.transition_to(OrderStatus.CONFIRMED)

    print(f"\n  Sending ORDER_CONFIRMED to both buyer and seller...")
    order_notifs = notif_svc.notify_order_event(
        order=order,
        notification_type=NotificationType.ORDER_CONFIRMED,
    )
    print(f"  Created {len(order_notifs)} notification(s) "
          f"(1 buyer + 1 seller, IN_APP only):")
    for notif in order_notifs:
        print(f"    {notif}")

    # -------------------------------------------------------------------
    # Step 6: Queue size, flush, and mark all read
    # -------------------------------------------------------------------
    section("STEP 6 — Queue management: flush and mark all read")

    print(f"\n  Queue size before flush : {notif_svc.queue_size()}")

    # Mark all buyer notifications read before flush
    marked = notif_svc.mark_all_read(recipient_id=buyer.id)
    print(f"  mark_all_read() marked  : {marked} notification(s) as READ")

    # Verify none are unread anymore
    still_unread = notif_svc.get_unread(recipient_id=buyer.id)
    print(f"  Unread after mark_all   : {len(still_unread)}  ← should be 0 ✓")

    # Flush entire queue
    flushed = notif_svc.flush_queue()
    print(f"\n  flush_queue() returned  : {len(flushed)} notification(s)")
    print(f"  Queue size after flush  : {notif_svc.queue_size()}  ← should be 0 ✓")

    print(f"\n  Channel breakdown of flushed notifications:")
    from collections import Counter
    channel_counts = Counter(n.channel.value for n in flushed)
    for channel, count in sorted(channel_counts.items()):
        print(f"    {channel:<8}: {count} notification(s)")

    # -------------------------------------------------------------------
    # Step 7: NotificationError guard — double mark_read
    # -------------------------------------------------------------------
    section("STEP 7 — NotificationError guard")

    from backend.entities.notification import NotificationError

    solo_notif = notif_svc.notify(
        recipient_id=99,
        notification_type=NotificationType.ACCOUNT_VERIFIED,
        channels=[NotificationChannel.IN_APP],
        metadata={},
    )[0]

    solo_notif.mark_read()
    print(f"\n  Notification marked read once: {solo_notif.status.value}")

    try:
        solo_notif.mark_read()   # second call — should raise
    except NotificationError as e:
        print(f"  ✓ Caught NotificationError: {e}")

    section("Demo complete — full notification pipeline verified")