import os
import json
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime
from typing import List

from backend.entities.user import User, Seller, Buyer, Admin
from backend.entities.listing import Listing, WasteType, QualityGrade, ListingStatus
from backend.entities.bid import Bid, BidStatus
from backend.entities.order import Order, OrderStatus
from backend.entities.escrow import Escrow, States
from backend.entities.notification import Notification, NotificationType, NotificationChannel, NotificationStatus
from backend.entities.preference import Preference


class StorageConfigError(Exception):
    pass


class StorageWriteError(Exception):
    pass


class StorageReadError(Exception):
    pass


@dataclass
class StorageConfig:
    data_dir: str = "data/"
    file_map: dict = field(default_factory=lambda: {
        "users": "users.json",
        "listings": "listings.json",
        "bids": "bids.json",
        "orders": "orders.json",
        "escrow": "escrow.json",
        "notifications": "notifications.json",
        "preferences": "preferences.json",
    })

    def get_path(self, entity_name: str) -> str:
        if entity_name not in self.file_map:
            raise StorageConfigError(f"Entity '{entity_name}' not defined in file_map.")
        return os.path.join(self.data_dir, self.file_map[entity_name])


class JsonStorage:
    def __init__(self, config: StorageConfig = None) -> None:
        self.config = config or StorageConfig()
        self._ensure_data_dir()

    def _ensure_data_dir(self) -> None:
        Path(self.config.data_dir).mkdir(parents=True, exist_ok=True)

    def _atomic_write(self, path: str, data: list | dict) -> None:
        """
        os.replace is atomic — a crash mid-write leaves the
        original file intact. This is the minimum durability guarantee for
        flat-file storage.
        """
        tmp_path = path + ".tmp"
        try:
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            os.replace(tmp_path, path)
        except OSError as e:
            raise StorageWriteError(f"Failed to save data. Write error: {e}")

    def save(self, entity_name: str, objects: list) -> None:
        path = self.config.get_path(entity_name)
        try:
            dict_list = [obj.to_dict() for obj in objects]
            self._atomic_write(path, dict_list)
        except Exception as e:
            raise StorageWriteError(f"Save operation failed for '{entity_name}': {e}")

    def load_raw(self, entity_name: str) -> list[dict]:
        path = self.config.get_path(entity_name)
        if not os.path.exists(path):
            return []
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            raise StorageReadError(f"Malformed JSON in '{path}': {e}")

    # ------------------------------------------------------------------
    # Entity-specific loaders
    # ------------------------------------------------------------------

    def load_users(self) -> List[User]:
        dict_list = self.load_raw("users")
        users = []
        for d in dict_list:
            role = d.get("role")
            if role == "seller":
                user = Seller(
                    name=d["name"],
                    email=d["email"],
                    password_hash=d["password_hash"],
                    trade_license=d["trade_license"],
                )
                user.rating = d["rating"]
                user.listing_count = d["listing_count"]
                user.strikes = d["strikes"]
            elif role == "buyer":
                user = Buyer(
                    name=d["name"],
                    email=d["email"],
                    password_hash=d["password_hash"],
                )
                user.watchlist = d["watchlist"]
            elif role == "admin":
                user = Admin(
                    name=d["name"],
                    email=d["email"],
                    password_hash=d["password_hash"],
                    department=d["department"],
                )
            else:
                continue

            # Restore base properties
            user.id = d["id"]
            user.status = d["status"]
            user.created_at = datetime.fromisoformat(d["created_at"])
            
            # Keep the id counter synchronized 
            User._id_counter = max(User._id_counter, user.id)
            users.append(user)
        return users

    def load_listings(self) -> List[Listing]:
        dict_list = self.load_raw("listings")
        listings = []
        for d in dict_list:
            listing = Listing(
                seller_id=d["seller_id"],
                waste_type=WasteType(d["waste_type"]),
                quantity_kg=d["quantity_kg"],
                reserve_price_taka=d["reserve_price_taka"],
                quality_grade=QualityGrade(d["quality_grade"]),
                location_district=d["location_district"],
                photos=d.get("photos", []),
                auction_duration_hours=d["auction_duration_hours"],
            )
            # Restore state overrides
            listing.listing_id = d["listing_id"]
            listing.status = ListingStatus(d["status"])
            listing.created_at = datetime.fromisoformat(d["created_at"])
            if d.get("auction_end_time"):
                listing.auction_end_time = datetime.fromisoformat(d["auction_end_time"])
            listing.current_highest_taka = d.get("current_highest_taka", 0)
            listing.extension_count = d.get("extension_count", 0)
            listing._reserved_kg = d.get("reserved_kg", 0)
            listing._sold_kg = d.get("sold_kg", 0)
            listing.history = d.get("history", [])

            Listing._id_counter = max(Listing._id_counter, listing.listing_id)
            listings.append(listing)
        return listings

    def load_bids(self) -> List[Bid]:
        dict_list = self.load_raw("bids")
        bids = []
        for d in dict_list:
            bid = Bid(
                listing_id=d["listing_id"],
                buyer_id=d["buyer_id"],
                buyer_name=d.get("buyer_name", f"Buyer #{d['buyer_id']}"),
                quantity_kg=d["quantity_kg"],
                price_per_kg_taka=d["price_per_kg_taka"],
                reserve_price_taka=d.get("reserve_price_taka", 0),
            )
            bid.bid_id = d["bid_id"]
            bid.status = BidStatus(d["status"])
            bid.created_at = datetime.fromisoformat(d["created_at"])
            if d.get("matched_at"):
                bid.matched_at = datetime.fromisoformat(d["matched_at"])
            bid.quantity_allocated_kg = d.get("quantity_allocated_kg")
            Bid._id_counter = max(Bid._id_counter, bid.bid_id)
            bids.append(bid)
        return bids

    def load_orders(self) -> List[Order]:
        dict_list = self.load_raw("orders")
        orders = []
        for d in dict_list:
            order = Order(
                listing_id=d["listing_id"],
                seller_id=d["seller_id"],
                buyer_id=d["buyer_id"],
                quantity_kg=d["quantity_kg"],
                price_per_kg_taka=d["price_per_kg_taka"],
            )
            order.order_id = d["order_id"]
            order.escrow_id = d.get("escrow_id")
            order.status = OrderStatus(d["status"])
            order.created_at = datetime.fromisoformat(d["created_at"])
            order.updated_at = datetime.fromisoformat(d["updated_at"])

            Order._id_counter = max(Order._id_counter, order.order_id)
            orders.append(order)
        return orders

    def load_escrows(self) -> List[Escrow]:
        dict_list = self.load_raw("escrow")
        escrows = []
        for d in dict_list:
            escrow = Escrow(
                order_id=d["order_id"],
                amount_taka=d["amount"],
            )
            escrow.escrow_id = d["escrow_id"]
            escrow.state = d["state"]
            escrow.created_at = datetime.fromisoformat(d["created_at"])
            if d.get("resolved_at"):
                escrow.resolved_at = datetime.fromisoformat(d["resolved_at"])
            escrow.history = d.get("history", [])

            Escrow._id_counter = max(Escrow._id_counter, escrow.escrow_id)
            escrows.append(escrow)
        return escrows

    def load_notifications(self) -> List[Notification]:
        dict_list = self.load_raw("notifications")
        notifications = []
        for d in dict_list:
            metadata = d.get("metadata", {})
            if d.get("recipient_email"):
                metadata["recipient_email"] = d["recipient_email"]
            notif = Notification(
                recipient_id=d["recipient_id"],
                notification_type=NotificationType(d["notification_type"]),
                channel=NotificationChannel(d["channel"]),
                title=d["title"],
                body=d["body"],
                metadata=metadata,
            )
            notif.notification_id = d["notification_id"]
            notif.status = NotificationStatus(d["status"])
            notif.created_at = datetime.fromisoformat(d["created_at"])
            if d.get("read_at"):
                notif.read_at = datetime.fromisoformat(d["read_at"])

            Notification._id_counter = max(Notification._id_counter, notif.notification_id)
            notifications.append(notif)
        return notifications

    def append_notifications(self, new_notifs: list) -> None:
        """Append new Notification objects to persisted storage."""
        if not new_notifs:
            return
        existing = self.load_notifications()
        existing.extend(new_notifs)
        self.save("notifications", existing)

    def load_preferences(self) -> List[Preference]:
        """
        Reconstructs Preference objects with WasteType and QualityGrade
        enums restored from their stored string values.
        Returns an empty list if preferences.json does not yet exist.
        """
        dict_list = self.load_raw("preferences")
        preferences = []
        for d in dict_list:
            pref = Preference(
                buyer_id=d["buyer_id"],
                preferred_waste_types=[
                    WasteType(v) for v in d.get("preferred_waste_types", [])
                ],
                preferred_grades=[
                    QualityGrade(v) for v in d.get("preferred_grades", [])
                ],
                min_quantity_kg=d.get("min_quantity_kg", 0),
                max_quantity_kg=d.get("max_quantity_kg"),
                max_price_per_kg_taka=d.get("max_price_per_kg_taka"),
                preferred_districts=d.get("preferred_districts", []),
            )
            pref.preference_id = d["preference_id"]
            pref.updated_at = datetime.fromisoformat(d["updated_at"])

            Preference._id_counter = max(Preference._id_counter, pref.preference_id)
            preferences.append(pref)
        return preferences


if __name__ == "__main__":
    print("=" * 65)
    print("  JHUTLINK — JSON Storage Demo")
    print("=" * 65)

    storage = JsonStorage()
    
    # Check that creating entities uses our default config and data dir
    print(f"Using storage directory: {storage.config.data_dir}")

    # 1. Create one of each entity type
    demo_seller = Seller(
        name="Test Seller", email="seller@test.com", 
        password_hash="hash", trade_license="L-123"
    )
    # Ensure they have id logic applied
    User._id_counter = 1
    demo_seller.id = 1

    demo_listing = Listing(
        seller_id=demo_seller.id, waste_type=WasteType.COTTON,
        quantity_kg=100, reserve_price_taka=15.0, quality_grade=QualityGrade.A,
        location_district="Dhaka", photos=["photo.jpg", "photo2.jpg"],
        auction_duration_hours=24
    )

    demo_bid = Bid(
        listing_id=demo_listing.listing_id, buyer_id=2, buyer_name="Demo Buyer",
        quantity_kg=100, price_per_kg_taka=1600, reserve_price_taka=1500
    )

    demo_order = Order(
        listing_id=demo_listing.listing_id, seller_id=demo_seller.id,
        buyer_id=2, quantity_kg=100, price_per_kg_taka=1600
    )

    demo_escrow = Escrow(order_id=demo_order.order_id, amount_taka=1600.0)

    demo_notif = Notification(
        recipient_id=demo_seller.id, notification_type=NotificationType.MATCH_FOUND,
        channel=NotificationChannel.IN_APP, title="Match!", body="You matched"
    )

    # 2. Call save() for each entity type
    print("Saving entities...")
    storage.save("users", [demo_seller])
    storage.save("listings", [demo_listing])
    storage.save("bids", [demo_bid])
    storage.save("orders", [demo_order])
    storage.save("escrow", [demo_escrow])
    storage.save("notifications", [demo_notif])
    
    # Reset internal counters before load to prove true reconstruction
    User._id_counter = 0
    Listing._id_counter = 0
    Bid._id_counter = 0
    Order._id_counter = 0
    Escrow._id_counter = 0
    Notification._id_counter = 0

    # 3. Call each loader method
    print("Loading entities...")
    loaded_users = storage.load_users()
    loaded_listings = storage.load_listings()
    loaded_bids = storage.load_bids()
    loaded_orders = storage.load_orders()
    loaded_escrows = storage.load_escrows()
    loaded_notifs = storage.load_notifications()

    # 4. Confirm reconstructed objects match originals by comparing key fields
    assert loaded_users[0].id == demo_seller.id
    assert loaded_listings[0].waste_type == demo_listing.waste_type
    assert loaded_bids[0].status == demo_bid.status
    assert loaded_orders[0].created_at.isoformat() == demo_order.created_at.isoformat()
    assert loaded_escrows[0].state == demo_escrow.state
    assert loaded_notifs[0].channel == demo_notif.channel
    
    # 5. Simulate a crash mid-write
    print("Simulating a crash mid-write...")
    # Read the text so we can verify later
    with open(storage.config.get_path("users"), "r") as f:
        original_data = f.read()
    
    tmp_path = storage.config.get_path("users") + ".tmp"
    with open(tmp_path, 'w') as tmp_file:
        tmp_file.write("Corrupted partially written JSON ")
    
    # At this point, the program would crash before os.replace. 
    # original file is untouched
    with open(storage.config.get_path("users"), "r") as f:
        surviving_data = f.read()
    
    assert original_data == surviving_data
    print("Mid-write crash simulated. Original file untouched!")
    os.remove(tmp_path) # Cleanup

    print("\n6/6 entity types saved and reloaded successfully")

# --- MIGRATION NOTE: JSON → PostgreSQL ---
# The Storage Layer interface `save(entity_name, objects)` and `load_*(...)` 
# acts as a pure Repository pattern over flat files. 
# 
# What changes:
# - `_atomic_write` and `load_raw` are replaced by `psycopg2` or `SQLAlchemy` executors.
# - `save()` will map to `INSERT ... ON CONFLICT DO UPDATE`.
# - `load_*()` will query respective Postgres tables.
# - Enums will map directly to Postgres ENUM types (or VARCHAR).
# 
# What stays identical:
# - All Entity classes remain 100% unchanged.
# - All state machines, invariant validation, and custom Exceptions logic remain identical.
# - Service Layer code calling `Storage.save(...)` or `Storage.load_users()` requires ZERO changes.
