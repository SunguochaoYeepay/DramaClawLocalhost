"""Sandbox data roots follow configured NOVELVIDEO_*_DIR values."""

from novelvideo.security.sandbox_wrap import SUPERTALE_ROOT, SandboxSpec, _data_dir


def test_data_dir_prefers_env(monkeypatch, tmp_path):
    monkeypatch.setenv("NOVELVIDEO_STATE_DIR", str(tmp_path / "state"))

    assert _data_dir("state") == tmp_path / "state"

    monkeypatch.delenv("NOVELVIDEO_STATE_DIR")
    assert _data_dir("state") == SUPERTALE_ROOT / "state"


def test_other_user_paths_use_configured_data_roots(monkeypatch, tmp_path):
    state = tmp_path / "state"
    output = tmp_path / "output"
    runtime = tmp_path / "runtime"
    for root in (state, output, runtime):
        for name in ("alice", "bob", "_shared"):
            (root / name).mkdir(parents=True)
    monkeypatch.setenv("NOVELVIDEO_STATE_DIR", str(state))
    monkeypatch.setenv("NOVELVIDEO_OUTPUT_DIR", str(output))
    monkeypatch.setenv("NOVELVIDEO_RUNTIME_DIR", str(runtime))

    spec = SandboxSpec(user="alice")
    others = set(spec.other_user_paths())

    assert spec.resolved_hermes_home() == state / "alice" / ".hermes"
    assert set(spec.self_business_paths()) == {
        state / "alice",
        output / "alice",
        runtime / "alice",
    }
    assert {state / "bob", output / "bob", runtime / "bob"} <= others
    assert state / "alice" not in others
    assert state / "_shared" not in others
