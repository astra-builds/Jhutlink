# backend/api/routes/orders.py
# JhutLink — Order Routes
# Phase 4 | Route Group 4
# Endpoints: GET /orders, GET /orders/{id},
#            POST /orders/{id}/confirm, POST /orders/{id}/ship,
#            POST /orders/{id}/deliver, POST /orders/{id}/complete,
#            POST /orders/{id}/dispute

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.storage.json_storage import JsonStorage
from backend.api.dependencies import get_storage, get_order_manager, get_listing_manager, get_payment_gateway, get_notification_service
from backend.api.routes.auth import get_current_user
from backend.services.order_manager import OrderManager
from backend.services.listing_manager import ListingManager
from backend.services.escrow_service import EscrowService, EscrowStateError
from backend.services.payment_gateway import PaymentGateway
from backend.services.notification_service import NotificationService
from backend.entities.order import OrderStatus, InvalidOrderTransitionError
from backend.entities.notification import NotificationType, NotificationChannel
from backend.entities.user import Buyer

router = APIRouter()


# ---------------------------------------------------------------------------
# Request Bodies
# ---------------------------------------------------------------------------

class ConfirmOrderRequest(BaseModel):
    amount_taka: int
    payment_method: str = "bkash"
    merchant_id: str = ""


class DisputeOrderRequest(BaseModel):
    reason: str


class CancelOrderRequest(BaseModel):
    reason: str = "Order cancelled by user"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_order_and_escrow(order_id: int, storage: JsonStorage):
    """
    Loads all orders and escrows, finds the matching pair by order_id.
    Raises HTTP 404 if the order or its attached escrow cannot be found.
    """
    orders = storage.load_orders()
    order = next((o for o in orders if o.order_id == order_id), None)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order #{order_id} not found.",
        )

    escrows = storage.load_escrows()
    escrow = next((e for e in escrows if e.escrow_id == order.escrow_id), None)
    if not escrow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Escrow for order #{order_id} not found.",
        )

    return order, escrow, orders, escrows


def _assert_participant(order, user_id: int):
    """Raises 403 if user_id is neither the buyer nor the seller on this order."""
    if order.buyer_id != user_id and order.seller_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you are not the buyer or seller on this order.",
        )


def _assert_buyer(order, user_id: int):
    """Raises 403 if user_id is not the buyer on this order."""
    if order.buyer_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the buyer on this order can perform this action.",
        )


def _assert_seller(order, user_id: int):
    """Raises 403 if user_id is not the seller on this order."""
    if order.seller_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the seller on this order can perform this action.",
        )


def _save_order_and_escrow(order, escrow, orders, escrows, storage: JsonStorage):
    """Persists the updated order and escrow back to storage in one call each."""
    # Replace in-memory objects with the mutated versions
    updated_orders  = [order if o.order_id  == order.order_id   else o for o in orders]
    updated_escrows = [escrow if e.escrow_id == escrow.escrow_id else e for e in escrows]
    storage.save("orders", updated_orders)
    storage.save("escrow", updated_escrows)


# ---------------------------------------------------------------------------
# GET /orders
# ---------------------------------------------------------------------------

@router.get("")
def list_orders(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    """
    Returns all orders where the authenticated user is buyer or seller.
    Escrow state is included for each order.
    """
    user_id = int(current_user["sub"])
    orders  = storage.load_orders()
    escrows = storage.load_escrows()

    escrow_map = {e.escrow_id: e for e in escrows}

    result = []
    for order in orders:
        if order.buyer_id != user_id and order.seller_id != user_id:
            continue  # Not a participant — skip

        escrow = escrow_map.get(order.escrow_id)
        escrow_state = escrow.state if escrow else None

        result.append({
            **order.to_dict(),
            "escrow_state": escrow_state,
        })

    return result


# ---------------------------------------------------------------------------
# GET /orders/{order_id}
# ---------------------------------------------------------------------------

@router.get("/{order_id}")
def get_order(
    order_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    order_manager: OrderManager = Depends(get_order_manager),
):
    """
    Returns full order detail plus full escrow summary for a single order.
    Raises 403 if the requesting user is not buyer or seller on this order.
    """
    user_id = int(current_user["sub"])
    order, escrow, _, _ = _load_order_and_escrow(order_id, storage)
    _assert_participant(order, user_id)

    return order_manager.get_order_summary(order, escrow)


# ---------------------------------------------------------------------------
# POST /orders/{order_id}/confirm  (Buyer only)
# ---------------------------------------------------------------------------

@router.post("/{order_id}/confirm")
def confirm_order(
    order_id: int,
    request: ConfirmOrderRequest,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    order_manager: OrderManager = Depends(get_order_manager),
    listing_manager: ListingManager = Depends(get_listing_manager),
    payment_gateway: PaymentGateway = Depends(get_payment_gateway),
):
    """
    Buyer pays the escrow amount via simulated bKash/Nagad gateway.
    Transitions order PAYMENT_PENDING → CONFIRMED
    and escrow AWAITING_PAYMENT → FUNDS_HELD.
    """
    user_id = int(current_user["sub"])
    order, escrow, orders, escrows = _load_order_and_escrow(order_id, storage)
    _assert_buyer(order, user_id)

    gateway_result = payment_gateway.process_payment(
        amount_taka=request.amount_taka,
        method=request.payment_method,
        merchant_id=request.merchant_id or "",
    )
    if not gateway_result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment failed: {gateway_result.message}",
        )

    try:
        order_manager.confirm_order(order, escrow, amount_taka=request.amount_taka)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    _save_order_and_escrow(order, escrow, orders, escrows, storage)

    # Move reserved quantity to sold on the associated listing.
    # For orders created via accept_bid the qty is in _reserved_kg;
    # for batch allocation it is already in _sold_kg (confirm_sold caps
    # the move to whatever is actually reserved, making this safe).
    listings = storage.load_listings()
    try:
        listing = listing_manager.get_listing(order.listing_id, listings)
    except Exception:
        listing = None
    if listing is not None and listing._reserved_kg > 0:
        listing.confirm_sold(min(order.quantity_kg, listing._reserved_kg))
        if listing.is_fully_sold:
            listing.mark_sold()
        storage.save("listings", listings)

    # Payout data available immediately after FUNDS_HELD? No — only after CONFIRMED.
    # EscrowService.get_summary() handles None gracefully for pre-release states.
    from backend.services.escrow_service import EscrowService
    escrow_svc = EscrowService()
    summary    = escrow_svc.get_summary(escrow)

    return {
        "order_id":           order.order_id,
        "order_status":       order.status.value,
        "escrow_state":       escrow.state,
        "seller_payout_taka": summary["seller_payout_taka"],
        "platform_fee_taka":  summary["platform_fee_taka"],
        "transaction_id":     gateway_result.transaction_id,
        "payment_method":     request.payment_method,
    }


# ---------------------------------------------------------------------------
# POST /orders/{order_id}/ship  (Seller only)
# ---------------------------------------------------------------------------

@router.post("/{order_id}/ship")
def ship_order(
    order_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    order_manager: OrderManager = Depends(get_order_manager),
):
    """
    Seller marks goods as dispatched. Transitions order CONFIRMED → IN_TRANSIT
    and escrow FUNDS_HELD → SELLER_PREPARING → IN_TRANSIT.
    """
    user_id = int(current_user["sub"])
    order, escrow, orders, escrows = _load_order_and_escrow(order_id, storage)
    _assert_seller(order, user_id)

    try:
        order.transition_to(OrderStatus.IN_TRANSIT)
        escrow_svc = EscrowService()
        escrow_svc.confirm_seller_preparation(escrow)
        escrow_svc.mark_dispatched(escrow)
    except (InvalidOrderTransitionError, EscrowStateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    _save_order_and_escrow(order, escrow, orders, escrows, storage)

    return {
        "order_id":     order.order_id,
        "order_status": order.status.value,
        "escrow_state": escrow.state,
    }


# ---------------------------------------------------------------------------
# POST /orders/{order_id}/deliver  (Buyer only)
# ---------------------------------------------------------------------------

@router.post("/{order_id}/deliver")
def deliver_order(
    order_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    order_manager: OrderManager = Depends(get_order_manager),
):
    """
    Buyer confirms receipt from 3PL. Transitions order IN_TRANSIT → DELIVERED
    and escrow IN_TRANSIT → DELIVERED_PENDING.
    """
    user_id = int(current_user["sub"])
    order, escrow, orders, escrows = _load_order_and_escrow(order_id, storage)
    _assert_buyer(order, user_id)

    try:
        order.transition_to(OrderStatus.DELIVERED)
        escrow_svc = EscrowService()
        escrow_svc.mark_delivered(escrow)
    except (InvalidOrderTransitionError, EscrowStateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    _save_order_and_escrow(order, escrow, orders, escrows, storage)

    return {
        "order_id":     order.order_id,
        "order_status": order.status.value,
        "escrow_state": escrow.state,
    }


# ---------------------------------------------------------------------------
# POST /orders/{order_id}/complete  (Buyer only)
# ---------------------------------------------------------------------------

@router.post("/{order_id}/complete")
def complete_order(
    order_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    order_manager: OrderManager = Depends(get_order_manager),
    notification_service: NotificationService = Depends(get_notification_service),
):
    """
    Buyer releases funds to seller. Transitions order DELIVERED → COMPLETED
    and escrow DELIVERED_PENDING → CONFIRMED → COMPLETED.
    """
    user_id = int(current_user["sub"])
    order, escrow, orders, escrows = _load_order_and_escrow(order_id, storage)
    _assert_buyer(order, user_id)

    try:
        escrow_svc = EscrowService()
        escrow_svc.release_funds(escrow)
        payout = escrow_svc.complete_transaction(escrow)
        order.transition_to(OrderStatus.COMPLETED)
    except (InvalidOrderTransitionError, EscrowStateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    _save_order_and_escrow(order, escrow, orders, escrows, storage)

    # Notify both parties
    all_notifs = []
    all_notifs += notification_service.notify_order_event(
        order=order,
        notification_type=NotificationType.PAYMENT_RECEIVED,
    )
    # Also send completion summary via email to both parties
    users = storage.load_users()
    buyer = next((u for u in users if u.id == order.buyer_id), None)
    seller = next((u for u in users if u.id == order.seller_id), None)

    buyer_email = buyer.email if buyer and isinstance(buyer, Buyer) else ""
    seller_email = seller.email if seller else ""

    all_notifs += notification_service.notify(
        recipient_id=order.buyer_id,
        notification_type=NotificationType.ORDER_CONFIRMED,
        channels=[NotificationChannel.EMAIL],
        metadata={
            "order_id":    order.order_id,
            "seller_id":   order.seller_id,
            "status":      order.status.value,
            "recipient_email": buyer_email,
        },
    )
    all_notifs += notification_service.notify(
        recipient_id=order.seller_id,
        notification_type=NotificationType.PAYMENT_RECEIVED,
        channels=[NotificationChannel.EMAIL],
        metadata={
            "order_id":    order.order_id,
            "buyer_id":    order.buyer_id,
            "status":      order.status.value,
            "recipient_email": seller_email,
        },
    )
    storage.append_notifications(all_notifs)

    return {
        "order_id":           order.order_id,
        "order_status":       order.status.value,
        "escrow_state":       escrow.state,
        "seller_payout_taka": payout["seller_payout_taka"],
    }


# ---------------------------------------------------------------------------
# POST /orders/{order_id}/dispute  (Buyer only)
# ---------------------------------------------------------------------------

@router.post("/{order_id}/dispute")
def dispute_order(
    order_id: int,
    request: DisputeOrderRequest,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    order_manager: OrderManager = Depends(get_order_manager),
):
    """
    Buyer opens a quality dispute. Transitions order DELIVERED → DISPUTED
    and escrow DELIVERED_PENDING → IN_DISPUTE. Funds are frozen.
    """
    user_id = int(current_user["sub"])
    order, escrow, orders, escrows = _load_order_and_escrow(order_id, storage)
    _assert_buyer(order, user_id)

    try:
        escrow_svc = EscrowService()
        escrow_svc.open_dispute(escrow, reason=request.reason)
        order.transition_to(OrderStatus.DISPUTED)
    except (InvalidOrderTransitionError, EscrowStateError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    _save_order_and_escrow(order, escrow, orders, escrows, storage)

    return {
        "order_id":     order.order_id,
        "order_status": order.status.value,
        "escrow_state": escrow.state,
        "reason":       request.reason,
    }


# ---------------------------------------------------------------------------
# POST /orders/{order_id}/cancel  (Buyer or Seller)
# ---------------------------------------------------------------------------

@router.post("/{order_id}/cancel")
def cancel_order(
    order_id: int,
    request: CancelOrderRequest,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    order_manager: OrderManager = Depends(get_order_manager),
    listing_manager: ListingManager = Depends(get_listing_manager),
):
    """
    Cancels an order. Either buyer or seller may cancel.
    Restores the order's quantity back to the listing's available pool.
    Refunds buyer if funds were already locked in escrow.
    """
    user_id = int(current_user["sub"])
    order, escrow, orders, escrows = _load_order_and_escrow(order_id, storage)
    _assert_participant(order, user_id)

    try:
        order_manager.cancel_order(order, escrow, reason=request.reason)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    _save_order_and_escrow(order, escrow, orders, escrows, storage)

    # Restore quantity to the listing's available pool
    listings = storage.load_listings()
    try:
        listing = listing_manager.get_listing(order.listing_id, listings)
    except Exception:
        listing = None
    if listing is not None:
        listing.release_quantity(order.quantity_kg)
        storage.save("listings", listings)

    return {
        "order_id":     order.order_id,
        "order_status": order.status.value,
        "escrow_state": escrow.state,
        "reason":       request.reason,
    }
