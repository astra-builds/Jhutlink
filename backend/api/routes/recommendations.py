# backend/api/routes/recommendations.py
# JhutLink — Recommendation Routes
# Phase 4 | Route Group 5
# Endpoints: GET /recommendations,
#            POST /recommendations/preferences,
#            GET  /recommendations/preferences

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from backend.storage.json_storage import JsonStorage
from backend.api.dependencies import (
    get_storage,
    get_matching_engine,
    get_notification_service,
)
from backend.api.routes.auth import get_current_user
from backend.services.matching_engine import MatchingEngine
from backend.services.notification_service import NotificationService
from backend.entities.preference import Preference
from backend.entities.listing import WasteType, QualityGrade
from backend.entities.user import Buyer

router = APIRouter()


# ---------------------------------------------------------------------------
# Request Body
# ---------------------------------------------------------------------------

class PreferenceRequest(BaseModel):
    preferred_waste_types:  list[str]
    preferred_grades:       list[str]
    min_quantity_kg:        int
    max_quantity_kg:        Optional[int] = None
    max_price_per_kg_taka: Optional[int] = None
    preferred_districts:    list[str]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _assert_buyer_role(current_user: dict):
    """Raises 403 if the token role is not 'buyer'."""
    if current_user["role"] != "buyer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only buyers can access recommendation endpoints.",
        )


def _load_buyer(user_id: int, storage: JsonStorage) -> Buyer:
    """Finds and returns the Buyer object from storage. Raises 404 if not found."""
    users = storage.load_users()
    buyer = next((u for u in users if u.id == user_id and isinstance(u, Buyer)), None)
    if not buyer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Buyer account not found.",
        )
    return buyer


def _preference_to_response(pref: Preference) -> dict:
    """Converts a Preference object to a JSON-serialisable dict for API responses."""
    return {
        "preference_id":          pref.preference_id,
        "buyer_id":               pref.buyer_id,
        "preferred_waste_types":  [w.value for w in pref.preferred_waste_types],
        "preferred_grades":       [g.value for g in pref.preferred_grades],
        "min_quantity_kg":        pref.min_quantity_kg,
        "max_quantity_kg":        pref.max_quantity_kg,
        "max_price_per_kg_taka": pref.max_price_per_kg_taka,
        "preferred_districts":    list(pref.preferred_districts),
        "updated_at":             pref.updated_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /recommendations
# ---------------------------------------------------------------------------

@router.get("")
def get_recommendations(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    matching_engine: MatchingEngine = Depends(get_matching_engine),
    notification_service: NotificationService = Depends(get_notification_service),
):
    """
    Returns scored and ranked listing recommendations for the authenticated buyer.

    Pipeline:
      1. Load buyer, preferences, and listings from storage
      2. Find buyer's preference record — 404 if none set
      3. Run MatchingEngine.get_matches() for hard-filter + soft-score
      4. Notify top 3 results via NotificationService.notify_match()
      5. Return list sorted by score descending
    """
    _assert_buyer_role(current_user)
    user_id = int(current_user["sub"])
    buyer   = _load_buyer(user_id, storage)

    # Load preferences — find this buyer's record
    all_preferences = storage.load_preferences()
    buyer_pref = next(
        (p for p in all_preferences if p.buyer_id == user_id), None
    )
    if buyer_pref is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No preferences set. "
                "Use POST /recommendations/preferences to set them."
            ),
        )

    # Load all listings and run the matching engine
    listings = storage.load_listings()
    matches  = matching_engine.get_matches(
        buyer=buyer,
        listings=listings,
        preferences=all_preferences,
    )

    # Notify only the top 3 matches
    notifs = notification_service.notify_match(
        buyer_id=user_id,
        buyer_email=buyer.email,
        match_results=matches[:3],
    )
    storage.append_notifications(notifs)

    # Build response — sorted by score descending (engine already sorts, but explicit)
    result = []
    for match in sorted(matches, key=lambda m: m.score, reverse=True):
        listing = match.listing
        result.append({
            "listing_id":          listing.listing_id,
            "waste_type":          listing.waste_type.value,
            "quality_grade":       listing.quality_grade.value,
            "quantity_kg":         listing.quantity_kg,
            "reserve_price_taka":  listing.reserve_price_taka,
            "location_district":   listing.location_district,
            "auction_end_time":    (
                listing.auction_end_time.isoformat()
                if listing.auction_end_time else None
            ),
            "score":               match.score,
            "score_breakdown":     match.score_breakdown,
            "recommendation_label": match.recommendation_label,
        })

    return result


# ---------------------------------------------------------------------------
# POST /recommendations/preferences
# ---------------------------------------------------------------------------

@router.post("/preferences", status_code=status.HTTP_201_CREATED)
def set_preferences(
    request: PreferenceRequest,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    """
    Creates or updates the buyer's preference record.

    - If a record already exists for this buyer_id, updates it field by field
      using Preference.update() to stamp updated_at cleanly.
    - If no record exists, creates a new Preference object.

    The WasteType and QualityGrade string values from the request body are
    converted to their Enum instances here, before reaching the entity layer.
    """
    _assert_buyer_role(current_user)
    user_id = int(current_user["sub"])

    # Convert raw strings to Enum instances — raise 400 on invalid values
    try:
        waste_types = [WasteType(v) for v in request.preferred_waste_types]
        grades      = [QualityGrade(v) for v in request.preferred_grades]
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid enum value: {e}",
        )

    all_preferences = storage.load_preferences()
    existing = next((p for p in all_preferences if p.buyer_id == user_id), None)

    if existing:
        # Update all fields on the existing record using Preference.update()
        existing.update("preferred_waste_types",  waste_types)
        existing.update("preferred_grades",        grades)
        existing.update("min_quantity_kg",         request.min_quantity_kg)
        existing.update("max_quantity_kg",         request.max_quantity_kg)
        existing.update("max_price_per_kg_taka",  request.max_price_per_kg_taka)
        existing.update("preferred_districts",     list(request.preferred_districts))
        pref = existing
        # Replace in-list
        all_preferences = [
            pref if p.buyer_id == user_id else p for p in all_preferences
        ]
    else:
        pref = Preference(
            buyer_id=user_id,
            preferred_waste_types=waste_types,
            preferred_grades=grades,
            min_quantity_kg=request.min_quantity_kg,
            max_quantity_kg=request.max_quantity_kg,
            max_price_per_kg_taka=request.max_price_per_kg_taka,
            preferred_districts=list(request.preferred_districts),
        )
        all_preferences.append(pref)

    storage.save("preferences", all_preferences)
    return _preference_to_response(pref)


# ---------------------------------------------------------------------------
# GET /recommendations/preferences
# ---------------------------------------------------------------------------

@router.get("/preferences")
def get_preferences(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    """
    Returns the authenticated buyer's current preference record.
    HTTP 404 if none has been set yet.
    """
    _assert_buyer_role(current_user)
    user_id = int(current_user["sub"])

    all_preferences = storage.load_preferences()
    pref = next((p for p in all_preferences if p.buyer_id == user_id), None)
    if not pref:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No preferences set. "
                "Use POST /recommendations/preferences to set them."
            ),
        )

    return _preference_to_response(pref)
