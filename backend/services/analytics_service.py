from typing import Optional
from collections import Counter, defaultdict

from backend.entities.order import Order, OrderStatus
from backend.storage.json_storage import JsonStorage


class AnalyticsService:
    def __init__(self, storage: JsonStorage) -> None:
        self._storage = storage

    # ------------------------------------------------------------------
    # Public Query Methods
    # ------------------------------------------------------------------

    def get_transactions(
        self,
        waste_type: Optional[str] = None,
        seller_id: Optional[int] = None,
        buyer_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        orders = self._load_completed_orders()

        if waste_type:
            orders = [o for o in orders if o.waste_type and o.waste_type.value == waste_type]
        if seller_id is not None:
            orders = [o for o in orders if o.seller_id == seller_id]
        if buyer_id is not None:
            orders = [o for o in orders if o.buyer_id == buyer_id]

        orders.sort(key=lambda o: o.updated_at or o.created_at, reverse=True)
        total = len(orders)
        page = orders[offset : offset + limit]

        return [self._order_to_tx(o) for o in page], total

    def get_summary(self) -> dict:
        orders = self._load_completed_orders()
        users = self._storage.load_users()

        total_volume_kg = sum(o.quantity_kg for o in orders)
        total_revenue_taka = sum(o.total_value_taka for o in orders)
        total_orders = len(orders)

        active_listings = self._count_active_listings()
        total_users = len(users)
        seller_count = len([u for u in users if u.role == "seller"])
        buyer_count = len([u for u in users if u.role == "buyer"])

        return {
            "total_orders": total_orders,
            "total_volume_kg": total_volume_kg,
            "total_revenue_taka": round(total_revenue_taka, 2),
            "active_listings": active_listings,
            "total_users": total_users,
            "seller_count": seller_count,
            "buyer_count": buyer_count,
        }

    def get_by_waste_type(self) -> list[dict]:
        orders = self._load_completed_orders()
        buckets: dict[str, dict] = defaultdict(
            lambda: {"waste_type": "", "volume_kg": 0, "revenue_taka": 0, "order_count": 0}
        )

        for o in orders:
            wt = o.waste_type.value if o.waste_type else "unknown"
            b = buckets[wt]
            b["waste_type"] = wt
            b["volume_kg"] += o.quantity_kg
            b["revenue_taka"] += o.total_value_taka
            b["order_count"] += 1

        result = list(buckets.values())
        result.sort(key=lambda x: x["volume_kg"], reverse=True)
        for r in result:
            r["revenue_taka"] = round(r["revenue_taka"], 2)
        return result

    def get_top_buyers(self, limit: int = 10) -> list[dict]:
        return self._top_by_role("buyer", limit)

    def get_top_sellers(self, limit: int = 10) -> list[dict]:
        return self._top_by_role("seller", limit)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _load_completed_orders(self) -> list[Order]:
        orders = self._storage.load_orders()
        listings_map = {l.listing_id: l for l in self._storage.load_listings()}
        for o in orders:
            listing = listings_map.get(o.listing_id)
            if listing:
                o.waste_type = listing.waste_type
        return [o for o in orders if o.status == OrderStatus.COMPLETED]

    def _count_active_listings(self) -> int:
        listings = self._storage.load_listings()
        return len([l for l in listings if l.status.value == "ACTIVE"])

    def _order_to_tx(self, order: Order) -> dict:
        return {
            "order_id": order.order_id,
            "listing_id": order.listing_id,
            "seller_id": order.seller_id,
            "buyer_id": order.buyer_id,
            "quantity_kg": order.quantity_kg,
            "price_per_kg_taka": order.price_per_kg_taka,
            "total_value_taka": order.total_value_taka,
            "status": order.status.value,
            "waste_type": order.waste_type.value if hasattr(order, "waste_type") and order.waste_type else None,
            "created_at": order.created_at.isoformat(),
            "completed_at": order.updated_at.isoformat() if order.updated_at else None,
        }

    def _top_by_role(self, role: str, limit: int) -> list[dict]:
        orders = self._load_completed_orders()
        user_orders: dict[int, list[Order]] = defaultdict(list)
        id_field = "buyer_id" if role == "buyer" else "seller_id"

        for o in orders:
            uid = getattr(o, id_field)
            user_orders[uid].append(o)

        users = self._storage.load_users()
        user_map = {u.id: u for u in users}

        ranking = []
        for uid, u_orders in user_orders.items():
            user = user_map.get(uid)
            ranking.append({
                "user_id": uid,
                "name": user.name if user else f"{role.capitalize()} #{uid}",
                "total_volume_kg": sum(o.quantity_kg for o in u_orders),
                "total_revenue_taka": round(sum(o.total_value_taka for o in u_orders), 2),
                "order_count": len(u_orders),
            })

        ranking.sort(key=lambda x: x["total_volume_kg"], reverse=True)
        return ranking[:limit]
