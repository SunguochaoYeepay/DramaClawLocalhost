"""Operator authorization helpers shared by REST and UI layers."""

from __future__ import annotations

import os


def get_prompt_export_password() -> str | None:
    """Return the configured operator password, or None if unset.

    No hardcoded fallback: when PROMPT_EXPORT_PASSWORD is unset/empty the
    operator gate fails closed (verification can never succeed).
    """
    value = os.getenv("PROMPT_EXPORT_PASSWORD", "").strip()
    return value or None


__all__ = ["get_prompt_export_password"]
