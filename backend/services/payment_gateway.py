from abc import ABC, abstractmethod
from dataclasses import dataclass
import random
import string


@dataclass
class PaymentResult:
    success: bool
    transaction_id: str | None = None
    gateway_ref: str | None = None
    message: str = ""


class PaymentGateway(ABC):
    @abstractmethod
    def process_payment(
        self,
        amount_taka: int,
        method: str = "bkash",
        merchant_id: str = "",
    ) -> PaymentResult:
        ...


class SimulatedGateway(PaymentGateway):
    BKASH_MERCHANT = "01712345678"

    def process_payment(
        self,
        amount_taka: int,
        method: str = "bkash",
        merchant_id: str = "",
    ) -> PaymentResult:
        if amount_taka <= 0:
            return PaymentResult(success=False, message="Invalid payment amount.")

        digits = "".join(random.choices(string.digits, k=8))
        trx_id = f"{method.upper()}-{digits}"

        return PaymentResult(
            success=True,
            transaction_id=trx_id,
            gateway_ref=f"SIM-{trx_id}",
            message="Payment processed successfully via simulated gateway.",
        )
