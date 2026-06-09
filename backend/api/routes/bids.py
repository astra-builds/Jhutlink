import logging

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger("jhutlink.bids")

from backend.storage.json_storage import JsonStorage
from backend.api.dependencies import get_storage, get_listing_manager, get_auction_engine, get_notification_service
from backend.services.listing_manager import ListingManager
from backend.services.auction_engine import AuctionEngine
from backend.services.notification_service import NotificationService
from backend.api.routes.auth import get_current_user
from backend.api.websocket import manager
from backend.entities.bid import Bid
from backend.entities.user import Buyer, Seller

router = APIRouter()

class PlaceBidRequest(BaseModel):
    quantity_kg: int
    price_per_kg_taka: int


@router.get("/listings/{listing_id}/bids")
def get_listing_bids(
    listing_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    bids = storage.load_bids()
    listing_bids = [b for b in bids if b.listing_id == listing_id]
    listing_bids.sort(key=lambda b: b.price_per_kg_taka, reverse=True)

    listings = storage.load_listings()
    listing = next((l for l in listings if l.listing_id == listing_id), None)

    result = []
    for bid in listing_bids:
        entry = bid.summary()
        if listing:
            entry["waste_type"] = listing.waste_type.value
            entry["quality_grade"] = listing.quality_grade.value
            entry["listing_status"] = listing.status.value
        else:
            entry["waste_type"] = None
            entry["quality_grade"] = None
            entry["listing_status"] = None
        result.append(entry)

    return result


@router.get("/bids")
def list_bids(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    user_id = int(current_user["sub"])
    user_role = current_user["role"]

    bids = storage.load_bids()
    listings = storage.load_listings()
    listing_map = {l.listing_id: l for l in listings}

    if user_role == "buyer":
        filtered = [b for b in bids if b.buyer_id == user_id]
    elif user_role == "seller":
        seller_listing_ids = [l.listing_id for l in listings if l.seller_id == user_id]
        filtered = [b for b in bids if b.listing_id in seller_listing_ids]
    else:
        filtered = bids

    filtered.sort(key=lambda b: b.created_at, reverse=True)

    result = []
    for bid in filtered:
        listing = listing_map.get(bid.listing_id)
        entry = bid.summary()
        if listing:
            entry["waste_type"] = listing.waste_type.value
            entry["quality_grade"] = listing.quality_grade.value
            entry["listing_status"] = listing.status.value
        else:
            entry["waste_type"] = None
            entry["quality_grade"] = None
            entry["listing_status"] = None
        result.append(entry)

    return result


@router.post("/listings/{listing_id}/bids", status_code=status.HTTP_201_CREATED)
def place_bid(
    listing_id: int,
    request: PlaceBidRequest,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    listing_manager: ListingManager = Depends(get_listing_manager),
    auction_engine: AuctionEngine = Depends(get_auction_engine),
    notification_service: NotificationService = Depends(get_notification_service),
):
    if current_user["role"] != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can place bids")
        
    user_id = int(current_user["sub"])
    users = storage.load_users()
    buyer = next((u for u in users if u.id == user_id), None)
    if not buyer or not isinstance(buyer, Buyer):
        raise HTTPException(status_code=403, detail="Buyer account not found or invalid type")

    listings = storage.load_listings()
    try:
        listing = listing_manager.get_listing(listing_id, listings)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    if request.quantity_kg > listing.remaining_kg:
        raise HTTPException(
            status_code=400,
            detail=f"Listing only has {listing.remaining_kg} kg remaining. "
                   f"Your bid is for {request.quantity_kg} kg.",
        )

    # Re-read listing from storage for fresh state (defense-in-depth against race conditions)
    listings = storage.load_listings()
    listing = listing_manager.get_listing(listing_id, listings)
    if request.quantity_kg > listing.remaining_kg:
        raise HTTPException(
            status_code=400,
            detail=f"Listing only has {listing.remaining_kg} kg remaining. "
                   f"Your bid is for {request.quantity_kg} kg.",
        )

    try:
        bid = Bid(
            listing_id=listing.listing_id,
            buyer_id=buyer.id,
            buyer_name=buyer.name,
            quantity_kg=request.quantity_kg,
            price_per_kg_taka=request.price_per_kg_taka,
            reserve_price_taka=listing.reserve_price_taka
        )
        bids = storage.load_bids()
        auction_engine.place_bid(bid, listing, bids)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    bids.append(bid)
    storage.save("bids", bids)
    storage.save("listings", listings)

    # Notify seller about the new bid
    seller = next((u for u in users if u.id == listing.seller_id), None)
    if seller and isinstance(seller, Seller):
        notifs = notification_service.notify_bid_placed(
            bid=bid,
            seller_id=seller.id,
            seller_email=seller.email,
        )
        storage.append_notifications(notifs)

    # Broadcast updated bid board to WebSocket clients
    import asyncio
    try:
        updated_bids = sorted(
            [b.summary() for b in storage.load_bids() if b.listing_id == listing_id],
            key=lambda x: x["price_per_kg_taka"], reverse=True,
        )
        for b in updated_bids:
            b["waste_type"] = listing.waste_type.value
            b["quality_grade"] = listing.quality_grade.value
            b["listing_status"] = listing.status.value
        asyncio.create_task(manager.broadcast(listing_id, {"type": "bid_update", "bids": updated_bids}))
    except Exception:
        logger.exception("WS broadcast failed")
    
    return bid.summary()
