from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


pytestmark = pytest.mark.m09


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_legacy_batch_render_route_is_removed_from_generation_source() -> None:
    source = (REPO_ROOT / "src/novelvideo/api/routes/generation.py").read_text(
        encoding="utf-8"
    )

    assert "/grids/batch-render" not in source
    assert "batch_generate_render" not in source
    assert "start_batch_render_task" not in source


def test_legacy_batch_render_ray_surface_is_removed() -> None:
    from novelvideo.task_identity import TASK_IDENTITY_SPECS

    assert "batch_render" not in TASK_IDENTITY_SPECS
    assert importlib.util.find_spec("novelvideo.ray_tasks") is None
