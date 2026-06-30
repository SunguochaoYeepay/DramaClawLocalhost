from pathlib import Path

import pytest

from novelvideo.project_context import ProjectContext


def _ctx(tmp_path: Path) -> ProjectContext:
    return ProjectContext(
        project_id="proj_audio_123",
        project_name="demo",
        owner_type="user",
        owner_id="user_owner",
        owner_username="alice",
        requester_user_id="user_editor",
        requester_username="bob",
        requester_principals=(("user", "user_editor"),),
        effective_role="editor",
        home_node_id="node_a",
        output_dir=tmp_path / "output" / "alice" / "demo",
        state_dir=tmp_path / "state" / "alice" / "demo",
        runtime_dir=tmp_path / "runtime" / "alice" / "demo",
        is_home_node=True,
    )


@pytest.mark.asyncio
async def test_audio_separate_runner_returns_public_urls_without_internal_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from novelvideo.task_backend.runners import freezone as freezone_runner

    ctx = _ctx(tmp_path)
    project_dir = Path(ctx.output_dir)
    audio_path = project_dir / "freezone" / "_outputs" / "freezone_audio_separate" / "job.m4a"
    mute_video_path = (
        project_dir / "freezone" / "_outputs" / "freezone_audio_separate" / "job_mute.mp4"
    )
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    audio_path.write_bytes(b"audio")
    mute_video_path.write_bytes(b"video")

    class FakeTaskManager:
        def update_progress_for_project(self, *_args, **_kwargs):
            pass

    async def fake_run_freezone_audio_separate(**_kwargs):
        return {"audio_path": audio_path, "mute_video_path": mute_video_path}

    monkeypatch.setattr(freezone_runner, "get_task_manager", lambda: FakeTaskManager())
    monkeypatch.setattr(
        "novelvideo.freezone.jobs.run_freezone_audio_separate",
        fake_run_freezone_audio_separate,
    )

    result = await freezone_runner._run_freezone_audio_separate_async(
        {
            "task_type": "freezone_audio_separate",
            "payload": {
                "job_id": "job",
                "project_dir": str(project_dir),
                "source_path": str(project_dir / "source.mp4"),
            },
        },
        ctx,
    )

    assert "audio_path" not in result
    assert "mute_video_path" not in result
    assert result["audio_url"].startswith("/static/projects/proj_audio_123/")
    assert result["mute_video_url"].startswith("/static/projects/proj_audio_123/")
    assert "/alice/demo/" not in result["audio_url"]
    assert "/alice/demo/" not in result["mute_video_url"]
