"""MCP bridge for DramaClaw tools.

Hermes uses ``.hermes/plugins/dramaclaw`` directly. Claude, Codex, and other
MCP-speaking agents use this stdio server to call that same toolset without
duplicating DramaClaw API wrappers.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
import types as py_types
from pathlib import Path
from typing import Any

from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _install_hermes_registry_shim() -> None:
    if "tools.registry" in sys.modules:
        return

    tools_pkg = py_types.ModuleType("tools")
    registry = py_types.ModuleType("tools.registry")

    def tool_result(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    def tool_error(message: Any) -> str:
        return json.dumps({"ok": False, "error": str(message)}, ensure_ascii=False)

    registry.tool_result = tool_result
    registry.tool_error = tool_error
    tools_pkg.registry = registry
    sys.modules.setdefault("tools", tools_pkg)
    sys.modules["tools.registry"] = registry


def _load_dramaclaw_plugin() -> Any:
    _install_hermes_registry_shim()
    plugin_path = _repo_root() / ".hermes" / "plugins" / "dramaclaw" / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        "_dramaclaw_hermes_plugin_for_mcp",
        plugin_path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load DramaClaw plugin from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _tool_index(plugin: Any) -> dict[str, tuple[dict[str, Any], Any]]:
    index: dict[str, tuple[dict[str, Any], Any]] = {}
    for entry in getattr(plugin, "TOOLS", ()):
        if not isinstance(entry, tuple) or len(entry) != 3:
            continue
        name, schema, handler = entry
        if isinstance(name, str) and isinstance(schema, dict) and callable(handler):
            index[name] = (schema, handler)
    return index


PLUGIN = _load_dramaclaw_plugin()
TOOLS = _tool_index(PLUGIN)
SERVER = Server("dramaclaw", version="0.1.0")


@SERVER.list_tools()
async def list_tools() -> list[types.Tool]:
    result: list[types.Tool] = []
    for name, (schema, _handler) in sorted(TOOLS.items()):
        parameters = schema.get("parameters") if isinstance(schema, dict) else None
        result.append(
            types.Tool(
                name=name,
                description=str(schema.get("description") or ""),
                inputSchema=parameters if isinstance(parameters, dict) else {"type": "object"},
            )
        )
    return result


@SERVER.call_tool(validate_input=True)
async def call_tool(name: str, arguments: dict[str, Any]) -> list[types.TextContent]:
    item = TOOLS.get(name)
    if item is None:
        raise ValueError(f"unknown DramaClaw tool: {name}")
    _schema, handler = item
    text = handler(arguments or {})
    return [types.TextContent(type="text", text=str(text or ""))]


async def _main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await SERVER.run(
            read_stream,
            write_stream,
            SERVER.create_initialization_options(),
        )


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
