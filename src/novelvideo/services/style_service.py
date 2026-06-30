"""风格配置管理服务 - Single Source of Truth.

架构：
- 系统预设（文件，只读）：src/novelvideo/styles/presets/*.json
- 自定义风格（项目配置文件）：project_config.json

使用方式：
    from novelvideo.services import StyleService

    # 获取风格配置
    style = StyleService.get_style("chinese_period_drama", username="alice", project="demo")

    # 列出所有风格
    styles = StyleService.list_all_styles(username="alice", project="demo")

    # 保存自定义风格
    StyleService.save_custom_style("my_style", config, username="alice", project="demo")
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from novelvideo.config import OUTPUT_DIR
from novelvideo.models import StyleConfig
from novelvideo.project_config import load_project_config_file, update_project_config_file


class StyleService:
    """风格配置管理服务。

    提供统一的风格配置访问接口，支持：
    1. 系统预设风格（从 JSON 文件加载，只读）
    2. 自定义风格（从项目配置加载，可读写，项目隔离）

    所有风格访问都应通过此服务，确保 One Source of Truth。
    """

    # 预设文件目录
    PRESETS_DIR = Path(__file__).parent.parent / "styles" / "presets"

    # 预设风格缓存（避免重复读取文件）
    _preset_cache: dict[str, StyleConfig] = {}
    STYLE_FAMILY_LABELS = {
        "live_action": "真人",
        "animation": "动画",
    }
    ANIMATION_SUBTYPE_LABELS = {
        "2d": "2D",
        "3d": "3D",
        "hybrid": "混合媒介",
    }

    @staticmethod
    def _resolve_project_context(
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> tuple[str | None, str | None]:
        if username and project:
            return username, project
        inferred_username = None
        inferred_project = None
        if project_dir:
            try:
                rel_parts = Path(project_dir).resolve().relative_to(Path(OUTPUT_DIR).resolve()).parts
                if len(rel_parts) >= 2:
                    inferred_username, inferred_project = rel_parts[0], rel_parts[1]
            except Exception:
                pass
        return username or inferred_username, project or inferred_project

    @classmethod
    def _load_project_custom_style_map(
        cls,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> dict[str, dict]:
        username, project = cls._resolve_project_context(username, project, project_dir)
        if not username or not project:
            return {}
        config = load_project_config_file(username, project)
        styles = config.get("custom_styles") or {}
        return styles if isinstance(styles, dict) else {}

    @classmethod
    def _save_project_custom_style_map(
        cls,
        styles: dict[str, dict],
        *,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool:
        username, project = cls._resolve_project_context(username, project, project_dir)
        if not username or not project:
            print("[StyleService] 保存自定义风格失败: 缺少项目上下文")
            return False

        def _apply(existing: dict) -> None:
            existing["custom_styles"] = styles

        update_project_config_file(username, project, _apply)
        return True

    @classmethod
    def get_preset(cls, style_id: str) -> Optional[StyleConfig]:
        """获取系统预设风格（从文件）。

        Args:
            style_id: 风格 ID，如 'chinese_period_drama'

        Returns:
            StyleConfig 实例，如果不存在返回 None
        """
        # 检查缓存
        if style_id in cls._preset_cache:
            return cls._preset_cache[style_id]

        # 从文件加载
        preset_file = cls.PRESETS_DIR / f"{style_id}.json"
        if not preset_file.exists():
            return None

        try:
            data = json.loads(preset_file.read_text(encoding="utf-8"))
            data["is_preset"] = True
            config = StyleConfig(**data)
            cls._preset_cache[style_id] = config
            return config
        except Exception as e:
            print(f"[StyleService] 加载预设失败: {style_id}, {e}")
            return None

    @classmethod
    def get_custom_style(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> Optional[StyleConfig]:
        """获取自定义风格（从项目配置）。

        Args:
            style_id: 风格 ID

        Returns:
            StyleConfig 实例，如果不存在返回 None
        """
        try:
            styles = cls._load_project_custom_style_map(username, project, project_dir)
            config_data = styles.get(style_id)
            if config_data:
                config_data["is_preset"] = False
                return StyleConfig(**config_data)
        except Exception as e:
            print(f"[StyleService] 加载自定义风格失败: {style_id}, {e}")

        return None

    @classmethod
    def save_custom_style(
        cls,
        style_id: str,
        config: StyleConfig,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool:
        """保存自定义风格到项目配置。

        Args:
            style_id: 风格 ID
            config: 风格配置

        Returns:
            是否保存成功
        """
        try:
            # 确保 ID 一致
            config.id = style_id
            config.is_preset = False
            if not config.created_at:
                config.created_at = datetime.now()
            styles = cls._load_project_custom_style_map(username, project, project_dir)
            styles[style_id] = config.model_dump(mode="json")
            if not cls._save_project_custom_style_map(
                styles,
                username=username,
                project=project,
                project_dir=project_dir,
            ):
                return False

            print(f"[StyleService] 自定义风格已保存: {style_id}")
            return True
        except Exception as e:
            print(f"[StyleService] 保存自定义风格失败: {style_id}, {e}")
            return False

    @classmethod
    def delete_custom_style(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool:
        """删除自定义风格。

        Args:
            style_id: 风格 ID

        Returns:
            是否删除成功
        """
        try:
            styles = cls._load_project_custom_style_map(username, project, project_dir)
            if style_id not in styles:
                return False
            styles.pop(style_id, None)
            if not cls._save_project_custom_style_map(
                styles,
                username=username,
                project=project,
                project_dir=project_dir,
            ):
                return False
            print(f"[StyleService] 自定义风格已删除: {style_id}")
            return True
        except Exception as e:
            print(f"[StyleService] 删除自定义风格失败: {style_id}, {e}")
            return False

    @classmethod
    def list_custom_styles(
        cls,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> list[str]:
        """列出所有自定义风格 ID。

        Returns:
            自定义风格 ID 列表
        """
        try:
            styles = cls._load_project_custom_style_map(username, project, project_dir)
            return sorted(styles.keys())
        except Exception as e:
            print(f"[StyleService] 列出自定义风格失败: {e}")

        return []

    @classmethod
    def get_style(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> Optional[StyleConfig]:
        """获取风格配置（统一入口）。

        查找顺序：
        1. 先查自定义风格（Redis）
        2. 再查系统预设（文件）

        这样允许用户通过创建同名自定义风格来覆盖系统预设。

        Args:
            style_id: 风格 ID

        Returns:
            StyleConfig 实例，如果不存在返回 None
        """
        # 优先查找自定义风格（允许覆盖预设）
        custom = cls.get_custom_style(style_id, username=username, project=project, project_dir=project_dir)
        if custom:
            return custom

        # 回退到系统预设
        preset = cls.get_preset(style_id)
        if preset:
            return preset

        return None

    @classmethod
    def get_style_or_default(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> StyleConfig:
        """获取风格配置，如果不存在返回默认风格。

        Args:
            style_id: 风格 ID

        Returns:
            StyleConfig 实例（保证不为 None）
        """
        style = cls.get_style(style_id, username=username, project=project, project_dir=project_dir)
        if style:
            return style

        # 返回默认风格
        default = cls.get_preset("chinese_period_drama")
        if default:
            return default

        # 兜底：返回空配置
        return StyleConfig(id="unknown", name="Unknown Style")

    @classmethod
    def list_preset_styles(cls) -> list[dict]:
        """列出所有系统预设风格。

        Returns:
            预设风格列表，每项包含 {id, name, type}
        """
        styles = []
        if cls.PRESETS_DIR.exists():
            for f in sorted(cls.PRESETS_DIR.glob("*.json")):
                style_id = f.stem
                config = cls.get_preset(style_id)
                if config:
                    styles.append({
                        "id": style_id,
                        "name": config.name,
                        "label": config.label or config.name,
                        "type": "preset",
                        "style_family": config.style_family,
                        "animation_subtype": config.animation_subtype,
                    })
        return styles

    @classmethod
    def list_all_styles(
        cls,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> list[dict]:
        """列出所有可用风格（预设 + 自定义）。

        Returns:
            风格列表，每项包含 {id, name, label, type}
        """
        styles = []

        # 系统预设
        styles.extend(cls.list_preset_styles())

        # 自定义风格
        for style_id in cls.list_custom_styles(username=username, project=project, project_dir=project_dir):
            config = cls.get_custom_style(style_id, username=username, project=project, project_dir=project_dir)
            if config:
                styles.append({
                    "id": style_id,
                    "name": config.name,
                    "label": config.label or config.name,
                    "type": "custom",
                    "style_family": config.style_family,
                    "animation_subtype": config.animation_subtype,
                })

        return styles

    @classmethod
    def get_style_family(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> str:
        config = cls.get_style_or_default(style_id, username=username, project=project, project_dir=project_dir)
        return config.style_family or "live_action"

    @classmethod
    def get_animation_subtype(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> str:
        config = cls.get_style_or_default(style_id, username=username, project=project, project_dir=project_dir)
        return (config.animation_subtype or "").lower()

    @classmethod
    def get_style_branch(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> tuple[str, str]:
        config = cls.get_style_or_default(style_id, username=username, project=project, project_dir=project_dir)
        return config.style_family or "live_action", (config.animation_subtype or "").lower()

    @classmethod
    def is_animation_style(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool:
        return cls.get_style_family(style_id, username=username, project=project, project_dir=project_dir) == "animation"

    @classmethod
    def is_live_action_style(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> bool:
        return not cls.is_animation_style(style_id, username=username, project=project, project_dir=project_dir)

    @classmethod
    def format_style_family_label(cls, family: str, subtype: str = "") -> str:
        base = cls.STYLE_FAMILY_LABELS.get(family or "live_action", "真人")
        subtype = (subtype or "").lower()
        if family == "animation" and subtype:
            return f"{base} · {cls.ANIMATION_SUBTYPE_LABELS.get(subtype, subtype.upper())}"
        return base

    @classmethod
    def list_styles_by_family(
        cls,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> dict[str, list[dict]]:
        grouped = {
            "live_action": [],
            "animation": [],
        }
        for style in cls.list_all_styles(username=username, project=project, project_dir=project_dir):
            family = style.get("style_family") or "live_action"
            grouped.setdefault(family, []).append(style)
        return grouped

    @classmethod
    def get_default_style_for_family(
        cls,
        family: str,
        *,
        animation_subtype: str | None = None,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> str:
        grouped = cls.list_styles_by_family(username=username, project=project, project_dir=project_dir)
        styles = grouped.get(family or "live_action", [])
        subtype = (animation_subtype or "").lower()
        if family == "animation" and subtype:
            for preferred in ("guoman_fantasy", "anime"):
                if any(
                    style["id"] == preferred and (style.get("animation_subtype") or "").lower() == subtype
                    for style in styles
                ):
                    return preferred
            for style in styles:
                if (style.get("animation_subtype") or "").lower() == subtype:
                    return style["id"]
        if family == "animation":
            for preferred in ("guoman_fantasy", "anime"):
                if any(style["id"] == preferred for style in styles):
                    return preferred
        for preferred in ("chinese_period_drama", "realistic"):
            if any(style["id"] == preferred for style in styles):
                return preferred
        return styles[0]["id"] if styles else "chinese_period_drama"

    @classmethod
    def get_style_labels(
        cls,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> dict[str, str]:
        """获取风格 ID -> 显示标签的映射。

        用于 UI 下拉菜单等场景，兼容旧版 STYLE_LABELS 用法。

        Returns:
            {style_id: label} 字典
        """
        labels = {}
        for style in cls.list_all_styles(username=username, project=project, project_dir=project_dir):
            labels[style["id"]] = style["label"]
        return labels

    @classmethod
    def clear_cache(cls):
        """清除预设缓存（用于热重载）。"""
        cls._preset_cache.clear()

    @classmethod
    def get_legacy_style_preset(
        cls,
        style_id: str,
        username: str | None = None,
        project: str | None = None,
        project_dir: str | Path | None = None,
    ) -> dict:
        """获取旧版格式的风格预设（向后兼容）。

        保持与 config.py 中 STYLE_PRESETS 相同的字典格式。

        Args:
            style_id: 风格 ID

        Returns:
            旧版格式的风格配置字典
        """
        config = cls.get_style_or_default(style_id, username=username, project=project, project_dir=project_dir)
        return config.to_legacy_dict()
