"""Freezone path layout helpers.

Layout under `output/<user>/<project>/freezone/`:

```
freezone/
├── _uploads/<ts>_<safe_name>          # external images dropped onto the canvas
├── _outputs/<task_type>/<job_id>.png  # results from /freezone/{edit,gen}
├── canvases/<canvas_id>.json          # F5 — persisted canvas state
└── _history/                          # F5 — push backups of overwritten files
```
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlsplit

# canvas id whitelist for `/freezone/canvases/{canvas_id}` (F5)
CANVAS_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")


def freezone_root(project_dir: Path) -> Path:
    return project_dir / "freezone"


def uploads_dir(project_dir: Path) -> Path:
    return freezone_root(project_dir) / "_uploads"


def outputs_dir(project_dir: Path, task_type: str) -> Path:
    return freezone_root(project_dir) / "_outputs" / task_type


def output_path_for_job(project_dir: Path, task_type: str, job_id: str) -> Path:
    return outputs_dir(project_dir, task_type) / f"{job_id}.png"


def canvases_dir(project_dir: Path) -> Path:
    return freezone_root(project_dir) / "canvases"


def canvas_path(project_dir: Path, canvas_id: str) -> Path:
    if not CANVAS_ID_RE.match(canvas_id):
        raise ValueError(f"invalid canvas_id: {canvas_id!r}")
    return canvases_dir(project_dir) / f"{canvas_id}.json"


def safe_upload_filename(original: str | None) -> str:
    """Sanitize a user-provided filename and prefix it with a timestamp."""
    base = (original or "upload").split("/")[-1].split("\\")[-1]
    base = re.sub(r"[^a-zA-Z0-9_\-.]", "_", base) or "upload"
    if "." not in base:
        base = f"{base}.png"
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    return f"{ts}_{base}"


# `/static/<u>/<p>/...`, `/static/projects/<project_id>/...`, or the
# backend media endpoint path → absolute filesystem path under project_dir.
_STATIC_RE = re.compile(r"^/static/(?P<user>[^/]+)/(?P<project>[^/]+)/(?P<rel>.+)$")
_MEDIA_RE = re.compile(r"^/api/v1/projects/(?P<project>[^/]+)/media/(?P<rel>.+)$")


def resolve_static_url_to_path(url: str, project_dir: Path) -> Path:
    """Map a same-origin static URL to a local file path.

    Falls back to interpreting the input as a project-relative path. Raises
    ValueError if the resolved path escapes `project_dir`.
    """
    # Strip query string + fragment — frontend cache-busters like `?v=<ts>`
    # must not become part of the filesystem path.
    url = urlsplit(url).path or url
    candidate: Path
    if url.startswith("/static/"):
        m = _STATIC_RE.match(url)
        if not m:
            raise ValueError(f"unrecognized static url: {url!r}")
        candidate = project_dir / unquote(m.group("rel"))
    elif url.startswith("/api/v1/projects/"):
        m = _MEDIA_RE.match(url)
        if not m:
            raise ValueError(f"unrecognized media url: {url!r}")
        candidate = project_dir / unquote(m.group("rel"))
    elif url.startswith("/"):
        # Treat as project-relative absolute path, e.g. /freezone/_uploads/foo.png
        candidate = project_dir / unquote(url.lstrip("/"))
    else:
        candidate = project_dir / unquote(url)

    resolved = candidate.resolve()
    project_resolved = project_dir.resolve()
    try:
        resolved.relative_to(project_resolved)
    except ValueError as exc:
        raise ValueError(f"url resolves outside project: {url!r}") from exc
    return resolved
