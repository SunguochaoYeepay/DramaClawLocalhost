from datetime import timezone
from pathlib import Path

from novelvideo.project_context import ProjectContext
from novelvideo.task_state import (
    TaskState,
    TaskStateManager,
    parse_task_timestamp,
    utc_now_iso,
)


def _ctx(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj_time",
        project_name="demo",
        owner_type="user",
        owner_id="owner",
        owner_username="alice",
        requester_user_id="editor",
        requester_username="bob",
        requester_principals=(("user", "editor"),),
        effective_role="editor",
        home_node_id="node_a",
        output_dir=tmp_path / "output",
        state_dir=tmp_path / "state",
        runtime_dir=tmp_path / "runtime",
        is_home_node=True,
    )


def test_utc_now_iso_uses_z_suffix() -> None:
    stamp = utc_now_iso()

    assert stamp.endswith("Z")
    parsed = parse_task_timestamp(stamp)
    assert parsed is not None
    assert parsed.tzinfo is timezone.utc


def test_parse_task_timestamp_treats_legacy_naive_values_as_utc() -> None:
    parsed = parse_task_timestamp("2026-06-04T08:01:57.503089")

    assert parsed is not None
    assert parsed.tzinfo is timezone.utc
    assert parsed.isoformat().startswith("2026-06-04T08:01:57.503089+00:00")


def test_project_task_timestamps_are_written_as_utc_z(tmp_path: Path) -> None:
    manager = TaskStateManager()
    ctx = _ctx(tmp_path)

    created = manager.create_task_for_project(ctx, "freezone_video_gen", 0, scope="job_1")
    manager.complete_task_for_project(ctx, "freezone_video_gen", 0, scope="job_1")
    completed = manager.get_task_for_project(ctx, "freezone_video_gen", 0, scope="job_1")

    assert created.created_at.endswith("Z")
    assert created.updated_at.endswith("Z")
    assert completed is not None
    assert completed.completed_at.endswith("Z")
    assert completed.updated_at.endswith("Z")


def test_stale_and_expiry_checks_accept_aware_and_legacy_times() -> None:
    aware_old = TaskState(
        task_id="aware",
        task_type="freezone_video_gen",
        status="starting",
        updated_at="2026-06-04T08:01:57Z",
    )
    legacy_old = TaskState(
        task_id="legacy",
        task_type="freezone_video_gen",
        status="starting",
        updated_at="2026-06-04T08:01:57",
    )

    assert isinstance(aware_old.is_starting_stale(1), bool)
    assert isinstance(legacy_old.is_starting_stale(1), bool)
    assert TaskStateManager._is_expired("2026-06-04T08:01:57Z") in {True, False}
    assert TaskStateManager._is_expired("2026-06-04T08:01:57") in {True, False}
