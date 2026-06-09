from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import List, Optional

from backend.storage.json_storage import JsonStorage
from backend.api.dependencies import (
    get_storage, get_listing_manager, get_notification_service,
    get_auction_engine, get_order_manager,
)
from backend.services.listing_manager import ListingManager
from backend.services.notification_service import NotificationService
from backend.services.auction_engine import AuctionEngine
from backend.services.order_manager import OrderManager
from backend.api.routes.auth import get_current_user
from backend.entities.listing import ListingStatus, WasteType, QualityGrade
from backend.entities.user import Seller, Buyer
from backend.entities.notification import NotificationType, NotificationChannel

router = APIRouter()

class CreateListingRequest(BaseModel):
    waste_type: str
    quantity_kg: int
    reserve_price_taka: int
    quality_grade: str
    location_district: str
    photos: List[str]
    auction_duration_hours: int

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_listing(
    request: CreateListingRequest,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    listing_manager: ListingManager = Depends(get_listing_manager),
    notification_service: NotificationService = Depends(get_notification_service),
):
    if current_user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can create listings")
    
    users = storage.load_users()
    user_id = int(current_user["sub"])
    seller = next((u for u in users if u.id == user_id), None)
    if not seller or not isinstance(seller, Seller):
        raise HTTPException(status_code=403, detail="Seller account not found or invalid type")

    listings = storage.load_listings()

    try:
        listing = listing_manager.create_listing(
            seller=seller,
            waste_type=WasteType(request.waste_type),
            quantity_kg=request.quantity_kg,
            reserve_price_taka=request.reserve_price_taka,
            quality_grade=QualityGrade(request.quality_grade),
            location_district=request.location_district,
            photos=request.photos,
            auction_duration_hours=request.auction_duration_hours,
            existing_listings=listings
        )
        listing_manager.open_listing(listing)
        
        # Save updated state
        listings.append(listing)
        storage.save("listings", listings)
        storage.save("users", users)  # Save seller because listing_count was incremented

        # Notify all buyers about the new listing
        all_notifs = []
        for user in users:
            if isinstance(user, Buyer):
                notifs = notification_service.notify(
                    recipient_id=user.id,
                    notification_type=NotificationType.NEW_LISTING,
                    channels=[NotificationChannel.IN_APP, NotificationChannel.EMAIL],
                    metadata={
                        "seller_name":  seller.name,
                        "waste_type":   request.waste_type,
                        "quantity_kg":  request.quantity_kg,
                        "grade":        request.quality_grade,
                        "price_taka":   f"{listing.reserve_price_taka:.2f}",
                        "district":     request.location_district,
                        "recipient_email": user.email,
                    },
                )
                all_notifs.extend(notifs)
        storage.append_notifications(all_notifs)
        
        return listing.summary()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/")
def get_active_listings(
    waste_type: Optional[str] = Query(None, description="Filter by waste type"),
    quality_grade: Optional[str] = Query(None, description="Filter by quality grade"),
    district: Optional[str] = Query(None, description="Filter by district"),
    seller_id: Optional[int] = Query(None, description="Filter by seller ID"),
    search: Optional[str] = Query(None, description="Search text for waste_type, district, grade"),
    sort_by: Optional[str] = Query("auction_end_time", description="Sort by: auction_end_time, price, quantity, created_at"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    limit: Optional[int] = Query(None, description="Limit results"),
    offset: Optional[int] = Query(0, description="Offset for pagination"),
    storage: JsonStorage = Depends(get_storage),
    listing_manager: ListingManager = Depends(get_listing_manager)
):
    listings = storage.load_listings()

    if seller_id:
        seller_listings = [l for l in listings if l.seller_id == seller_id]
        active_listings = listing_manager.get_active_listings(seller_listings)
    else:
        active_listings = listing_manager.get_active_listings(listings)

    # Filter
    if waste_type:
        try:
            wt = WasteType(waste_type)
            active_listings = [l for l in active_listings if l.waste_type == wt]
        except ValueError:
            pass

    if quality_grade:
        try:
            qg = QualityGrade(quality_grade)
            active_listings = [l for l in active_listings if l.quality_grade == qg]
        except ValueError:
            pass

    if district:
        active_listings = [l for l in active_listings if l.location_district.lower() == district.lower()]

    if search:
        search_lower = search.lower()
        active_listings = [l for l in active_listings if (
            search_lower in l.waste_type.value.lower() or
            search_lower in l.location_district.lower() or
            search_lower in l.quality_grade.value.lower()
        )]

    # Sort
    sort_map = {
        "auction_end_time": lambda l: l.auction_end_time or "",
        "price": lambda l: l.reserve_price_taka,
        "quantity": lambda l: l.quantity_kg,
        "created_at": lambda l: l.created_at or "",
    }

    sort_fn = sort_map.get(sort_by, sort_map["auction_end_time"])
    active_listings = sorted(
        active_listings,
        key=sort_fn,
        reverse=(sort_order == "desc")
    )

    # Paginate
    total = len(active_listings)
    paginated = active_listings[offset : offset + (limit if limit else total)]

    return {
        "listings": [lst.summary() for lst in paginated],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
def bulk_create_listings(
    csv_rows: list[dict],
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    listing_manager: ListingManager = Depends(get_listing_manager),
):
    if current_user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can create listings")

    users = storage.load_users()
    user_id = int(current_user["sub"])
    seller = next((u for u in users if u.id == user_id), None)
    if not seller or not isinstance(seller, Seller):
        raise HTTPException(status_code=403, detail="Seller account not found")

    listings = storage.load_listings()
    result = listing_manager.bulk_create_from_csv(seller, csv_rows, listings)

    # Open all created listings and save
    for lst in result.created:
        listing_manager.open_listing(lst)
        listings.append(lst)

    if result.created:
        storage.save("listings", listings)
        storage.save("users", users)

    return {
        "total_attempted": result.total_attempted,
        "total_created": result.total_created,
        "total_failed": result.total_failed,
        "created": [lst.summary() for lst in result.created],
        "failed": result.failed,
    }


@router.post("/{listing_id}/watchlist")
def toggle_watchlist(
    listing_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    if current_user["role"] != "buyer":
        raise HTTPException(status_code=403, detail="Only buyers can use watchlist")

    users = storage.load_users()
    user_id = int(current_user["sub"])
    buyer = next((u for u in users if u.id == user_id), None)
    if not buyer or not isinstance(buyer, Buyer):
        raise HTTPException(status_code=403, detail="Buyer account not found")

    if listing_id in buyer.watchlist:
        buyer.watchlist.remove(listing_id)
        action = "removed"
    else:
        buyer.watchlist.append(listing_id)
        action = "added"

    storage.save("users", users)
    return {"action": action, "watchlist": buyer.watchlist}


@router.get("/{listing_id}/watchlist/status")
def get_watchlist_status(
    listing_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    if current_user["role"] != "buyer":
        return {"watchlisted": False}

    users = storage.load_users()
    user_id = int(current_user["sub"])
    buyer = next((u for u in users if u.id == user_id), None)
    if not buyer or not isinstance(buyer, Buyer):
        return {"watchlisted": False}

    return {"watchlisted": listing_id in buyer.watchlist}


@router.get("/{listing_id}")
def get_listing(
    listing_id: int,
    storage: JsonStorage = Depends(get_storage),
    listing_manager: ListingManager = Depends(get_listing_manager)
):
    listings = storage.load_listings()
    try:
        listing = listing_manager.get_listing(listing_id, listings)
        return listing.summary()
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/auto-close")
def auto_close_listings(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    auction_engine: AuctionEngine = Depends(get_auction_engine),
    order_manager: OrderManager = Depends(get_order_manager),
    notification_service: NotificationService = Depends(get_notification_service),
):
    if current_user["role"] not in ("seller", "admin"):
        raise HTTPException(status_code=403, detail="Only sellers or admins can trigger auto-close")

    listings = storage.load_listings()
    closed = auction_engine.check_auto_close(listings)

    results = []
    users = storage.load_users()
    all_bids = storage.load_bids()
    all_orders = storage.load_orders()
    all_escrows = storage.load_escrows()
    all_notifs = []

    for listing in closed:
        result, pairs, notifs = auction_engine.finalize_listing(
            listing, all_bids, order_manager, notification_service, users,
        )
        for order, escrow in pairs:
            all_orders.append(order)
            all_escrows.append(escrow)
        all_notifs.extend(notifs)
        results.append({
            "listing_id": listing.listing_id,
            "status": listing.status.value,
            "matched_bids": len(result.matched_bids),
            "outbid_bids": len(result.outbid_bids),
            "orders_created": len(pairs),
        })

    storage.save("listings", listings)
    storage.save("bids", all_bids)
    storage.save("orders", all_orders)
    storage.save("escrow", all_escrows)
    if all_notifs:
        storage.append_notifications(all_notifs)

    return {"closed": len(closed), "results": results}


@router.post("/{listing_id}/close")
def close_listing(
    listing_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    listing_manager: ListingManager = Depends(get_listing_manager),
    auction_engine: AuctionEngine = Depends(get_auction_engine),
    order_manager: OrderManager = Depends(get_order_manager),
    notification_service: NotificationService = Depends(get_notification_service),
):
    if current_user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can close auctions")

    user_id = int(current_user["sub"])
    listings = storage.load_listings()
    try:
        listing = listing_manager.get_listing(listing_id, listings)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    if listing.seller_id != user_id:
        raise HTTPException(status_code=403, detail="You can only close your own listings")

    if listing.status != ListingStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail=f"Listing is {listing.status.value}, cannot close",
        )

    listing.close_auction()
    users = storage.load_users()
    all_bids = storage.load_bids()
    result, pairs, notifs = auction_engine.finalize_listing(
        listing, all_bids, order_manager, notification_service, users,
    )

    storage.save("listings", listings)
    storage.save("bids", all_bids)
    if pairs:
        orders = storage.load_orders()
        escrows = storage.load_escrows()
        for order, escrow in pairs:
            orders.append(order)
            escrows.append(escrow)
        storage.save("orders", orders)
        storage.save("escrow", escrows)
    if notifs:
        storage.append_notifications(notifs)

    return {
        "listing_id": listing.listing_id,
        "status": listing.status.value,
        "matched_bids": len(result.matched_bids),
        "outbid_bids": len(result.outbid_bids),
        "unallocated_kg": result.unallocated_kg,
        "weighted_avg_price_taka": result.weighted_avg_price_taka,
        "orders_created": len(pairs),
    }


@router.post("/{listing_id}/allocate")
def allocate_listing(
    listing_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    listing_manager: ListingManager = Depends(get_listing_manager),
    auction_engine: AuctionEngine = Depends(get_auction_engine),
    order_manager: OrderManager = Depends(get_order_manager),
    notification_service: NotificationService = Depends(get_notification_service),
):
    if current_user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can trigger allocation")

    user_id = int(current_user["sub"])
    listings = storage.load_listings()
    try:
        listing = listing_manager.get_listing(listing_id, listings)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    if listing.seller_id != user_id:
        raise HTTPException(status_code=403, detail="You can only allocate your own listings")

    if listing.status != ListingStatus.CLOSED:
        raise HTTPException(
            status_code=400,
            detail=f"Listing is {listing.status.value}, must be CLOSED to allocate",
        )

    users = storage.load_users()
    all_bids = storage.load_bids()
    result, pairs, notifs = auction_engine.finalize_listing(
        listing, all_bids, order_manager, notification_service, users,
    )

    storage.save("listings", listings)
    storage.save("bids", all_bids)
    if pairs:
        orders = storage.load_orders()
        escrows = storage.load_escrows()
        for order, escrow in pairs:
            orders.append(order)
            escrows.append(escrow)
        storage.save("orders", orders)
        storage.save("escrow", escrows)
    if notifs:
        storage.append_notifications(notifs)

    return {
        "listing_id": listing.listing_id,
        "status": listing.status.value,
        "matched_bids": len(result.matched_bids),
        "outbid_bids": len(result.outbid_bids),
        "unallocated_kg": result.unallocated_kg,
        "weighted_avg_price_taka": result.weighted_avg_price_taka,
        "orders_created": len(pairs),
    }


