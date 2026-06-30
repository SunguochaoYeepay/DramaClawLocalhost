import pytest
from importlib import import_module


@pytest.mark.asyncio
async def test_close_releases_cached_cognee_graph_engine(monkeypatch):
    from novelvideo.cognee.store import CogneeStore

    graph_config_module = import_module("cognee.infrastructure.databases.graph.config")
    graph_engine_module = import_module("cognee.infrastructure.databases.graph.get_graph_engine")

    calls = []

    class FakeSQLiteStore:
        async def close(self):
            calls.append("sqlite.close")

    class FakeGraphConnection:
        def close(self):
            calls.append("graph.connection.close")

    class FakeGraphDatabase:
        def close(self):
            calls.append("graph.db.close")

    class FakeGraphEngine:
        def __init__(self):
            self.connection = FakeGraphConnection()
            self.db = FakeGraphDatabase()

        def close(self):
            calls.append("graph.close")

    class FakeCachedFactory:
        def cache_clear(self):
            calls.append("graph.cache_clear")

    fake_engine = FakeGraphEngine()
    monkeypatch.setattr(
        graph_config_module,
        "get_graph_context_config",
        lambda: {"graph_database_provider": "kuzu", "graph_file_path": "/tmp/project.pkl"},
    )
    monkeypatch.setattr(
        graph_engine_module,
        "create_graph_engine",
        lambda **config: fake_engine,
    )
    monkeypatch.setattr(graph_engine_module, "_create_graph_engine", FakeCachedFactory())

    store = CogneeStore.__new__(CogneeStore)
    store._owns_sqlite_store = True
    store.sqlite_store = FakeSQLiteStore()

    await store.close()

    assert calls == [
        "sqlite.close",
        "graph.connection.close",
        "graph.db.close",
        "graph.close",
        "graph.cache_clear",
    ]
