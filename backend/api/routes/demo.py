# backend/api/routes/demo.py
# JhutLink — Demo Mode API Routes

import logging

from fastapi import APIRouter, Depends, HTTPException

from backend.storage.json_storage import JsonStorage
from backend.api.dependencies import (
    get_storage, get_listing_manager, get_auction_engine,
    get_order_manager, get_notification_service, get_demo_service,
)
from backend.api.routes.auth import get_current_user
from backend.services.demo_service import DemoService

logger = logging.getLogger("jhutlink.demo")

router = APIRouter()


@router.post("/seed")
def seed_demo_accounts(
    current_user: dict = Depends(get_current_user),
    demo: DemoService = Depends(get_demo_service),
):
    result = demo.seed_accounts()
    return result


@router.post("/auto-bids/{listing_id}")
def auto_generate_bids(
    listing_id: int,
    current_user: dict = Depends(get_current_user),
    demo: DemoService = Depends(get_demo_service),
):
    try:
        bids = demo.auto_generate_bids(listing_id)
        return {"count": len(bids), "bids": bids}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fast-forward/{listing_id}")
def fast_forward_listing(
    listing_id: int,
    current_user: dict = Depends(get_current_user),
    demo: DemoService = Depends(get_demo_service),
):
    try:
        result = demo.fast_forward_listing(listing_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fast-forward-all")
def fast_forward_all(
    current_user: dict = Depends(get_current_user),
    demo: DemoService = Depends(get_demo_service),
):
    results = demo.fast_forward_all()
    return {"count": len(results), "results": results}


@router.post("/time-warp/{step}")
def time_warp(
    step: int,
    current_user: dict = Depends(get_current_user),
    demo: DemoService = Depends(get_demo_service),
):
    result = demo.time_warp(step)
    return result
