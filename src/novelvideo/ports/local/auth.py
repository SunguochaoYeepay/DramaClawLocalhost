"""Local CE authentication port implementations."""

from __future__ import annotations

import os
import time
from dataclasses import replace

from ulid import ULID

from novelvideo.ports.auth_contract import (
    AgentAuthenticatedUser,
    AgentSessionToken,
    AuthenticatedUser,
    AuthError,
    AuthFailureReason,
)


class FileAuthPort:
    async def verify_session(self, raw_cookie: str | None) -> dict:
        username = os.environ.get("ST_LOCAL_USERNAME", "").strip() or "local"
        return AuthenticatedUser(id="local", username=username, role="owner").to_legacy_dict()

    async def revoke_session(self, raw_cookie: str) -> None:
        return None


class LocalAuthSession:
    def __init__(self) -> None:
        self._sessions: dict[str, AgentAuthenticatedUser] = {}

    async def create_agent_session(
        self,
        *,
        username: str,
        scopes,
        ttl_seconds: int | None = None,
        agent_kind: str = "agent",
        worker_id: str | None = None,
        parent_session_id: str | None = None,
        current_scope_kind: str = "home",
        current_project_id: str | None = None,
        metadata: dict | None = None,
    ) -> AgentSessionToken:
        session_id = str(ULID())
        token_value = f"local-{ULID()}"
        exp = int(time.time()) + int(ttl_seconds or 2 * 3600)
        normalized_scopes = tuple(scopes or ())
        self._sessions[token_value] = AgentAuthenticatedUser(
            id="local",
            username=username,
            role="owner",
            agent_session_id=session_id,
            agent_kind=agent_kind,
            worker_id=worker_id,
            scopes=normalized_scopes,
            current_scope_kind=current_scope_kind,
            current_project_id=current_project_id,
            parent_session_id=parent_session_id,
        )
        return AgentSessionToken(
            value=token_value,
            session_id=session_id,
            user=username,
            scopes=normalized_scopes,
            exp=exp,
            worker_id=worker_id or "",
            agent_kind=agent_kind,
        )

    async def verify_agent_session(self, token: str) -> dict:
        session = self._sessions.get(token)
        if session is None:
            raise AuthError(AuthFailureReason.INVALID, "agent session not found")
        # CE local agent tokens intentionally do not expire. The single-user
        # trust boundary is local machine ownership; revoke invalidates workers.
        return session.to_legacy_dict()

    async def update_agent_session_scope(
        self,
        token_value: str,
        *,
        scope_kind: str,
        project_id: str | None,
    ) -> None:
        session = self._sessions.get(token_value)
        if session is None:
            raise AuthError(AuthFailureReason.INVALID, "agent session not found")
        self._sessions[token_value] = replace(
            session,
            current_scope_kind=scope_kind,
            current_project_id=project_id,
        )

    async def revoke_agent_session(self, token_value: str) -> None:
        self._sessions.pop(token_value, None)
