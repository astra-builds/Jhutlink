from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from backend.storage.json_storage import JsonStorage
from backend.api.dependencies import get_storage
from backend.api.routes.auth import get_current_user
from backend.services.analytics_service import AnalyticsService

router = APIRouter()


def _get_svc(storage: JsonStorage = Depends(get_storage)) -> AnalyticsService:
    return AnalyticsService(storage)


@router.get("/transactions")
def list_transactions(
    waste_type: Optional[str] = Query(None, description="Filter by waste type"),
    seller_id: Optional[int] = Query(None, description="Filter by seller ID"),
    buyer_id: Optional[int] = Query(None, description="Filter by buyer ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    svc: AnalyticsService = Depends(_get_svc),
):
    results, total = svc.get_transactions(
        waste_type=waste_type, seller_id=seller_id,
        buyer_id=buyer_id, limit=limit, offset=offset,
    )
    return {"transactions": results, "total": total, "offset": offset, "limit": limit}


@router.get("/summary")
def get_summary(
    current_user: dict = Depends(get_current_user),
    svc: AnalyticsService = Depends(_get_svc),
):
    return svc.get_summary()


@router.get("/by-waste-type")
def by_waste_type(
    current_user: dict = Depends(get_current_user),
    svc: AnalyticsService = Depends(_get_svc),
):
    return svc.get_by_waste_type()


@router.get("/top-buyers")
def top_buyers(
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    svc: AnalyticsService = Depends(_get_svc),
):
    return svc.get_top_buyers(limit=limit)


@router.get("/top-sellers")
def top_sellers(
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    svc: AnalyticsService = Depends(_get_svc),
):
    return svc.get_top_sellers(limit=limit)
