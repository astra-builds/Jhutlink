# backend/entities/notification.py
# JhutLink — Notification Entity
# Phase 1 | Entity Layer (built during Phase 2 notification integration)
# Demonstrates: Multi-enum domain modelling, Simple two-state lifecycle
#               without a full transition table (justified by problem size),
#               Metadata dict for flexible context storage

from datetime import datetime
from enum import Enum


# ---------------------------------------------------------------------------
# Domain Enums
# ---------------------------------------------------------------------------

class NotificationType(Enum):
    """
    Categorical event types that can trigger a notification.
    Each type maps to a (title, body_template) pair in NotificationService.
    Adding a new event type requires: one entry here + one entry in the
    template dict — no other changes needed anywhere in the system.
    """
    MATCH_FOUND        = "MATCH_FOUND"
    BID_PLACED         = "BID_PLACED"
    BID_MATCHED        = "BID_MATCHED"
    BID_OUTBID         = "BID_OUTBID"
    ORDER_CONFIRMED    = "ORDER_CONFIRMED"
    PAYMENT_RECEIVED   = "PAYMENT_RECEIVED"
    SHIPMENT_UPDATED   = "SHIPMENT_UPDATED"
    DELIVERY_CONFIRMED = "DELIVERY_CONFIRMED"
    DISPUTE_OPENED     = "DISPUTE_OPENED"
    DISPUTE_RESOLVED   = "DISPUTE_RESOLVED"
    ACCOUNT_VERIFIED   = "ACCOUNT_VERIFIED"
    ACCOUNT_BANNED     = "ACCOUNT_BANNED"
    NEW_LISTING        = "NEW_LISTING"


class NotificationChannel(Enum):
    """
    Delivery channel for a notification.
    One Notification object = one channel. If an event sends to both
    IN_APP and EMAIL, NotificationService creates two separate Notification
    objects — one per channel. This keeps each record clean and independently
    trackable (e.g. email delivered, in-app still unread).
    """
    IN_APP = "IN_APP"
    EMAIL  = "EMAIL"
    SMS    = "SMS"


class NotificationStatus(Enum):
    """
    Read lifecycle for a notification.
    Transitions:
        UNREAD → READ → ARCHIVED
    ARCHIVED is terminal — an archived notification cannot be unread.
    """
    UNREAD   = "UNREAD"
    READ     = "READ"
    ARCHIVED = "ARCHIVED"


# ---------------------------------------------------------------------------
# Custom Exception
# ---------------------------------------------------------------------------

class NotificationError(Exception):
    """
    Raised when a lifecycle operation is attempted on a Notification
    that is in an incompatible status.

    Examples:
        mark_read() on an already-READ notification
        archive() on an already-ARCHIVED notification
    """
    def __init__(self, notification_id: int, message: str) -> None:
        self.notification_id = notification_id
        super().__init__(
            f"Notification #{notification_id}: {message}"
        )


# ---------------------------------------------------------------------------
# Notification Entity
# ---------------------------------------------------------------------------

class Notification:
    """
    Represents a single notification event delivered to one recipient
    via one channel.

    Design note — one object per channel:
        If an event (e.g. BID_MATCHED) triggers both IN_APP and EMAIL
        delivery, NotificationService creates two separate Notification
        instances. This is intentional: each channel has independent
        read/archive state. An in-app notification being read does not
        mean the email was seen, and the audit trail stays clean.

    Metadata dict:
        Stores event-specific context (listing_id, order_id, score, etc.)
        as a flexible key-value dict. This avoids adding optional columns
        for every possible event type — the entity stays generic, and the
        template system in NotificationService interpolates metadata values
        into the body string at construction time.
    """

    _id_counter: int = 0

    def __init__(
        self,
        recipient_id:      int,
        notification_type: NotificationType,
        channel:           NotificationChannel,
        title:             str,
        body:              str,
        metadata:          dict = None,
    ) -> None:
        Notification._id_counter += 1
        self.notification_id:   int                  = Notification._id_counter
        self.recipient_id:      int                  = recipient_id
        self.recipient_email:   str | None           = metadata.get("recipient_email") if metadata else None
        self.notification_type: NotificationType     = notification_type
        self.channel:           NotificationChannel  = channel
        self.title:             str                  = title
        self.body:              str                  = body
        self.metadata:          dict                 = dict(metadata or {})
        self.status:            NotificationStatus   = NotificationStatus.UNREAD
        self.created_at:        datetime             = datetime.utcnow()
        self.read_at:           datetime | None      = None

    # ------------------------------------------------------------------
    # Lifecycle Methods
    # ------------------------------------------------------------------

    def mark_read(self) -> None:
        """
        Marks this notification as READ and stamps read_at.

        Design note: Notification uses per-method status guards rather
        than a full transition table (as used by Escrow and Listing).
        Notification has only two transitions from two possible states,
        making a dict with two keys more machinery than the problem needs.
        The pattern choice matches Bid — consistent across the codebase.

        Raises:
            NotificationError: if already READ or ARCHIVED.
        """
        if self.status == NotificationStatus.READ:
            raise NotificationError(
                self.notification_id,
                "Already marked as READ — cannot mark read again."
            )
        if self.status == NotificationStatus.ARCHIVED:
            raise NotificationError(
                self.notification_id,
                "Notification is ARCHIVED — cannot transition to READ."
            )
        self.status  = NotificationStatus.READ
        self.read_at = datetime.utcnow()

    def archive(self) -> None:
        """
        Archives this notification. Terminal state.
        Can be called from either UNREAD or READ status.

        Raises:
            NotificationError: if already ARCHIVED.
        """
        if self.status == NotificationStatus.ARCHIVED:
            raise NotificationError(
                self.notification_id,
                "Already ARCHIVED — cannot archive again."
            )
        self.status = NotificationStatus.ARCHIVED

    def is_unread(self) -> bool:
        """Returns True if and only if the notification is UNREAD."""
        return self.status == NotificationStatus.UNREAD

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """Serialisation-ready dict for the JSON storage layer and API."""
        return {
            "notification_id":   self.notification_id,
            "recipient_id":      self.recipient_id,
            "recipient_email":   self.recipient_email,
            "notification_type": self.notification_type.value,
            "channel":           self.channel.value,
            "title":             self.title,
            "body":              self.body,
            "metadata":          self.metadata,
            "status":            self.status.value,
            "created_at":        self.created_at.isoformat(),
            "read_at":           self.read_at.isoformat() if self.read_at else None,
        }

    # ------------------------------------------------------------------
    # Dunder Methods
    # ------------------------------------------------------------------

    def __str__(self) -> str:
        read_marker = "●" if self.is_unread() else "○"
        return (
            f"{read_marker} [NOTIF #{self.notification_id}] "
            f"→ Recipient #{self.recipient_id} | "
            f"{self.channel.value:<6} | "
            f"{self.notification_type.value:<20} | "
            f"Status: {self.status.value:<8} | "
            f'"{self.title}"'
        )

    def __repr__(self) -> str:
        return (
            f"Notification("
            f"id={self.notification_id!r}, "
            f"recipient={self.recipient_id!r}, "
            f"type={self.notification_type.value!r}, "
            f"channel={self.channel.value!r}, "
            f"status={self.status.value!r})"
        )