"""Public runtime configuration for the frontend."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from ulid import ULID

from novelvideo.shared import runtime_env

router = APIRouter()

RuntimeEdition = Literal["ce", "ee"]
_INSTANCE_ID = str(ULID())


def _runtime_edition() -> RuntimeEdition:
    return "ce" if runtime_env.is_ce_effective() else "ee"


@router.get("/config")
async def get_runtime_config():
    edition = _runtime_edition()
    return JSONResponse(
        {
            "ok": True,
            "data": {
                "edition": edition,
                "auth_required": edition == "ee",
                "instance_id": _INSTANCE_ID,
            },
        }
    )
