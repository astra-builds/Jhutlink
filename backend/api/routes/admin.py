from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import Optional

from backend.storage.json_storage import JsonStorage
from backend.api.dependencies import get_storage
from backend.api.routes.auth import get_current_user
from backend.entities.user import Admin, Seller, Buyer, User
from backend.entities.order import Order, OrderStatus
from backend.services.escrow_service import EscrowService, EscrowStateError

router = APIRouter()


def _require_admin(current_user: dict):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


class BanRequest(BaseModel):
    reason: str


class ResolveDisputeRequest(BaseModel):
    ruling: str  # "refund" or "release"


@router.get("/users")
def list_users(
    role: Optional[str] = Query(None, description="Filter by role"),
    status: Optional[str] = Query(None, description="Filter by status"),
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    _require_admin(current_user)
    users = storage.load_users()

    if role:
        users = [u for u in users if u.role == role]
    if status:
        users = [u for u in users if u.status == status]

    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "created_at": u.created_at.isoformat(),
            "strikes": getattr(u, "strikes", None),
            "listing_count": getattr(u, "listing_count", None),
        }
        for u in users
    ]


@router.post("/users/{user_id}/verify")
def verify_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    _require_admin(current_user)
    users = storage.load_users()

    user = next((u for u in users if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        user.activate()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    storage.save("users", users)
    return {"message": f"User #{user_id} activated", "status": user.status}


@router.post("/users/{user_id}/ban")
def ban_user(
    user_id: int,
    request: BanRequest,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    _require_admin(current_user)
    users = storage.load_users()

    user = next((u for u in users if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.ban()
    storage.save("users", users)
    return {"message": f"User #{user_id} banned", "reason": request.reason, "status": user.status}


@router.get("/disputes")
def list_disputes(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    _require_admin(current_user)
    orders = storage.load_orders()
    disputed = [o for o in orders if o.status == OrderStatus.DISPUTED]

    escrows = storage.load_escrows()
    escrow_map = {e.escrow_id: e for e in escrows}

    return [
        {
            "order_id": o.order_id,
            "listing_id": o.listing_id,
            "buyer_id": o.buyer_id,
            "seller_id": o.seller_id,
            "quantity_kg": o.quantity_kg,
            "total_value_taka": o.total_value_taka,
            "status": o.status.value,
            "escrow_state": escrow_map.get(o.escrow_id).state if escrow_map.get(o.escrow_id) else None,
            "created_at": o.created_at.isoformat(),
        }
        for o in disputed
    ]


@router.post("/disputes/{order_id}/resolve")
def resolve_dispute(
    order_id: int,
    request: ResolveDisputeRequest,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    _require_admin(current_user)

    orders = storage.load_orders()
    order = next((o for o in orders if o.order_id == order_id), None)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status != OrderStatus.DISPUTED:
        raise HTTPException(status_code=400, detail="Order is not disputed")

    escrows = storage.load_escrows()
    escrow = next((e for e in escrows if e.escrow_id == order.escrow_id), None)
    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")

    escrow_svc = EscrowService()

    try:
        if request.ruling == "refund":
            escrow_svc.refund_to_buyer(escrow)
            order.transition_to(OrderStatus.CANCELLED)
        elif request.ruling == "release":
            escrow_svc.release_funds(escrow)
            escrow_svc.complete_transaction(escrow)
            order.transition_to(OrderStatus.COMPLETED)
        else:
            raise HTTPException(status_code=400, detail="Ruling must be 'refund' or 'release'")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    storage.save("orders", orders)
    storage.save("escrow", escrows)

    return {
        "order_id": order_id,
        "ruling": request.ruling,
        "order_status": order.status.value,
        "escrow_state": escrow.state,
    }
