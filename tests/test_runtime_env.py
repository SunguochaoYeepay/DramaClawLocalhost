from __future__ import annotations

import os


def test_preserve_st_env_restores_changed_and_added_st_keys(monkeypatch) -> None:
    from novelvideo.shared.env_guard import preserve_st_env

    monkeypatch.setenv("ST_EXISTING", "before")
    monkeypatch.delenv("ST_ADDED", raising=False)
    monkeypatch.setenv("LLM_API_KEY", "before")

    with preserve_st_env():
        monkeypatch.setenv("ST_EXISTING", "after")
        monkeypatch.setenv("ST_ADDED", "new")
        monkeypatch.setenv("LLM_API_KEY", "after")

    assert "ST_ADDED" not in os.environ
    assert os.environ["ST_EXISTING"] == "before"
    assert os.environ["LLM_API_KEY"] == "after"


def test_cookie_secure_defaults_true_and_parses_boolean_values(monkeypatch) -> None:
    import novelvideo.shared.runtime_env as runtime_env

    monkeypatch.setattr(runtime_env, "load_project_dotenv", lambda override=False: None)
    cookie_secure = runtime_env.cookie_secure

    monkeypatch.delenv("ST_COOKIE_SECURE", raising=False)
    assert cookie_secure() is True

    for value in ("1", "true"):
        monkeypatch.setenv("ST_COOKIE_SECURE", value)
        assert cookie_secure() is True

    for value in ("0", "false"):
        monkeypatch.setenv("ST_COOKIE_SECURE", value)
        assert cookie_secure() is False


def test_is_ce_effective_requires_ce_without_control_plane_dsn(monkeypatch) -> None:
    import novelvideo.shared.runtime_env as runtime_env

    monkeypatch.setattr(runtime_env, "load_project_dotenv", lambda override=False: None)

    cases = (
        ("", "ce", True),
        (" postgresql://example ", "ce", False),
        ("postgresql://example", "", False),
        ("", "", False),
    )
    for dsn, edition, expected in cases:
        if dsn:
            monkeypatch.setenv("ST_CONTROL_PLANE_DSN", dsn)
        else:
            monkeypatch.delenv("ST_CONTROL_PLANE_DSN", raising=False)
        if edition:
            monkeypatch.setenv("ST_EDITION", edition)
        else:
            monkeypatch.delenv("ST_EDITION", raising=False)

        assert runtime_env.is_ce_effective() is expected
