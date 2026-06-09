from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from backend.storage.json_storage import JsonStorage

from backend.services.notification_service import NotificationService
from backend.services.listing_manager import ListingManager
from backend.services.auction_engine import AuctionEngine
from backend.services.escrow_service import EscrowService
from backend.services.order_manager import OrderManager
from backend.services.matching_engine import MatchingEngine
from backend.services.email_sender import ConsoleEmailSender
from backend.services.payment_gateway import SimulatedGateway
from backend.services.demo_service import DemoService

# We create a singleton storage instance 
# as JSONStorage reads/writes files heavily.
storage = JsonStorage()

def get_storage() -> JsonStorage:
    return storage

_notification_service = NotificationService(email_sender=ConsoleEmailSender())
_listing_manager = ListingManager(_notification_service)
_auction_engine = AuctionEngine()
_escrow_service = EscrowService()
_order_manager = OrderManager(_escrow_service)
_matching_engine = MatchingEngine()
_payment_gateway = SimulatedGateway()
_demo_service = DemoService(storage, _listing_manager, _auction_engine, _order_manager, _notification_service)

def get_listing_manager(): return _listing_manager
def get_auction_engine(): return _auction_engine
def get_order_manager(): return _order_manager
def get_matching_engine(): return _matching_engine
def get_notification_service(): return _notification_service
def get_payment_gateway(): return _payment_gateway
def get_demo_service(): return _demo_service
