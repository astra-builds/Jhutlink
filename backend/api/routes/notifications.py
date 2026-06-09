from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional

from backend.storage.json_storage import JsonStorage
from backend.api.dependencies import get_storage, get_notification_service
from backend.services.notification_service import NotificationService
from backend.api.routes.auth import get_current_user

router = APIRouter()


@router.get("")
def list_notifications(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: unread"),
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
    notification_service: NotificationService = Depends(get_notification_service),
):
    user_id = int(current_user["sub"])
    notifications = storage.load_notifications()

    # Filter by recipient
    user_notifs = [n for n in notifications if n.recipient_id == user_id]

    if status_filter and status_filter.lower() == "unread":
        user_notifs = [n for n in user_notifs if n.is_unread()]

    # Sort newest first
    user_notifs.sort(key=lambda n: n.created_at, reverse=True)

    return [n.to_dict() for n in user_notifs]


@router.get("/count")
def get_notification_count(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    user_id = int(current_user["sub"])
    notifications = storage.load_notifications()
    unread = len([n for n in notifications if n.recipient_id == user_id and n.is_unread()])
    return {"unread": unread}


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    user_id = int(current_user["sub"])
    notifications = storage.load_notifications()

    notif = next((n for n in notifications if n.notification_id == notification_id), None)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notif.recipient_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot mark another user's notification as read")

    try:
        notif.mark_read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    storage.save("notifications", notifications)
    return notif.to_dict()


@router.post("/read-all")
def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage),
):
    user_id = int(current_user["sub"])
    notifications = storage.load_notifications()

    count = 0
    for notif in notifications:
        if notif.recipient_id == user_id and notif.is_unread():
            try:
                notif.mark_read()
                count += 1
            except Exception:
                pass

    if count > 0:
        storage.save("notifications", notifications)

    return {"marked_read": count}
