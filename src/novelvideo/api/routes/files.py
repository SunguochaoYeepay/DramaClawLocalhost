"""文件下载端点（带路径遍历防护）。"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

logger = logging.getLogger("novelvideo.api.files")

from novelvideo.api.auth import get_api_user
from novelvideo.api.deps import ProjectResolution, resolve_project_scope

router = APIRouter()


def _resolve_project_file(resolved: ProjectResolution, file_path: str) -> Path:
    project_dir = resolved.project_dir
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    requested = (project_dir / file_path).resolve()
    if not requested.is_relative_to(project_dir.resolve()):
        raise HTTPException(status_code=403, detail="Access denied")

    if not requested.exists() or not requested.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return requested


@router.get("/projects/{project}/files/{file_path:path}")
async def download_file(
    project: str,
    file_path: str,
    user: dict = Depends(get_api_user),
):
    """下载项目内的生成文件。

    路径相对于 output/{username}/{project}/，
    自动防止目录遍历攻击。
    """
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    requested = _resolve_project_file(resolved, file_path)

    return FileResponse(
        path=str(requested),
        filename=requested.name,
    )


@router.get("/projects/{project}/media/{file_path:path}")
async def preview_file(
    project: str,
    file_path: str,
    user: dict = Depends(get_api_user),
):
    """预览项目内媒体文件。

    与 /files 使用同样的鉴权和路径防护，但返回 inline 响应，供 React 的
    <img>/<video>/<audio> 直接使用，避免裸 /static 依赖 NiceGUI session。
    """
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    requested = _resolve_project_file(resolved, file_path)
    return FileResponse(path=str(requested))


async def preview_project_media_file(project: str, file_path: str, user: dict) -> FileResponse:
    """Serve a project media file for non-/api routes such as /static/projects."""
    resolved = await resolve_project_scope(project, user, required_role="viewer")
    requested = _resolve_project_file(resolved, file_path)
    return FileResponse(path=str(requested))
