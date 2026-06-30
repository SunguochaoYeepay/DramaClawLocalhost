"""认证端点：登出 / 当前用户信息。"""

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from novelvideo.api.auth import (
    AUTH_COOKIE_NAME,
    get_api_user,
    resolve_auth_cookie_from_request,
)
from novelvideo.ports import get_auth_port
from novelvideo.shared.runtime_env import cookie_secure as runtime_cookie_secure

router = APIRouter()

_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60


def _cookie_secure() -> bool:
    return runtime_cookie_secure()


def _set_auth_cookie(response: Response, cookie_value: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=cookie_value,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        max_age=_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    # Mirror the cookie attributes used on set so CDN edges and Safari ITP
    # match it reliably. secure is echoed for the same reason.
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=_cookie_secure(),
    )


@router.post("/auth/logout")
async def logout(request: Request, user: dict = Depends(get_api_user)):  # noqa: ARG001
    """清除 HttpOnly cookie + 在控制平面启用时吊销会话。"""
    cookie_value = resolve_auth_cookie_from_request(request)
    if cookie_value:
        await get_auth_port().revoke_session(cookie_value)

    response = JSONResponse({"ok": True})
    _clear_auth_cookie(response)
    return response


@router.get("/auth/me")
async def me(user: dict = Depends(get_api_user)):
    credit_balance = 0
    user_id = str(user.get("user_id") or user.get("id") or "").strip()
    if user_id:
        from novelvideo.ports.registry import get_port

        balance = await get_port("usage_meter").get_user_credit_balance(user_id)
        credit_balance = balance if balance is not None else 0

    return JSONResponse(
        {
            "ok": True,
            "data": {
                "username": user["username"],
                "role": user["role"],
                "credit_balance": credit_balance,
                "credential_kind": user.get("credential_kind") or "user",
                "current_scope_kind": user.get("current_scope_kind"),
                "current_project_id": user.get("current_project_id"),
                "scopes": user.get("scopes"),
            },
        }
    )
