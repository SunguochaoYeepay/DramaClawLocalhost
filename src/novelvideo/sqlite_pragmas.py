"""Unified SQLite connection pragmas."""

from __future__ import annotations

import os

_PRAGMAS_COMMON = (
    ("journal_mode", "WAL"),
    ("synchronous", "NORMAL"),
    ("busy_timeout", "10000"),
    ("foreign_keys", "ON"),
)


def litestream_enabled() -> bool:
    """Return whether ST_LITESTREAM_ENABLED is truthy."""

    return os.environ.get("ST_LITESTREAM_ENABLED", "").strip().lower() not in (
        "",
        "0",
        "false",
        "no",
    )


def _wal_autocheckpoint_value() -> str:
    return "0" if litestream_enabled() else "2000"


def configure_sqlite_connection(conn) -> None:
    """Apply project-wide pragmas to a synchronous sqlite3 connection."""

    for name, value in _PRAGMAS_COMMON:
        conn.execute(f"PRAGMA {name}={value}")
    conn.execute(f"PRAGMA wal_autocheckpoint={_wal_autocheckpoint_value()}")


async def configure_sqlite_connection_async(db) -> None:
    """Apply project-wide pragmas to an aiosqlite connection."""

    for name, value in _PRAGMAS_COMMON:
        await db.execute(f"PRAGMA {name}={value}")
    await db.execute(f"PRAGMA wal_autocheckpoint={_wal_autocheckpoint_value()}")
