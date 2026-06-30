"""Task runner registry shared by backend adapters."""

from __future__ import annotations

from typing import Any, Callable

ProjectTaskRunner = Callable[[dict[str, Any], Any], dict[str, Any] | None]

_PROJECT_TASK_RUNNERS: dict[str, ProjectTaskRunner] = {}


def register_project_task_runner(task_type: str, runner: ProjectTaskRunner) -> None:
    _PROJECT_TASK_RUNNERS[task_type] = runner


def get_project_task_runner(task_type: str) -> ProjectTaskRunner | None:
    return _PROJECT_TASK_RUNNERS.get(task_type)


def registered_project_task_types() -> tuple[str, ...]:
    return tuple(sorted(_PROJECT_TASK_RUNNERS))
