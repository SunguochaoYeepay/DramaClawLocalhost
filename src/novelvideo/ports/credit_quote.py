"""Generation credit quote port."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CreditQuote:
    total_cost: int
    display: str


class CreditQuotePort(Protocol):
    async def generation_credit_quote(
        self,
        *,
        kind: str,
        model: str,
        params: dict,
        quantity: int,
    ) -> CreditQuote: ...
