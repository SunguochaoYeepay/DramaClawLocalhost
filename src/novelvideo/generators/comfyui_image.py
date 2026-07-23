"""ComfyUI 本地图像生成模块。

通过 ComfyUI API 提交 FLUX2 Klein 或 Qwen Image 工作流，支持：
- 纯文生图（text2img）
- 1~3 张参考图生图（img2img with ReferenceLatent chain）
- 高清修复/放大（upscale）

与 NanoBananaCharacterGenerator 完全解耦，作为独立 provider 接入
IMAGE_GENERATION_SELECTIONS 体系。
"""

from __future__ import annotations

import asyncio
import base64
import copy
import json
import os
import random
import time
from pathlib import Path
from typing import Optional

import httpx

from novelvideo.config import (
    COMFYUI_FLUX2_CFG,
    COMFYUI_FLUX2_CLIP,
    COMFYUI_FLUX2_DENOISE,
    COMFYUI_FLUX2_SAMPLER,
    COMFYUI_FLUX2_SCHEDULER,
    COMFYUI_FLUX2_STEPS,
    COMFYUI_FLUX2_UNET,
    COMFYUI_FLUX2_VAE,
    COMFYUI_IMAGE_URL,
    COMFYUI_IMAGE_WORKFLOW_DIR,
    COMFYUI_QWEN_CFG,
    COMFYUI_QWEN_CLIP,
    COMFYUI_QWEN_DENOISE,
    COMFYUI_QWEN_EDIT_CFG,
    COMFYUI_QWEN_EDIT_LORA,
    COMFYUI_QWEN_EDIT_SHIFT,
    COMFYUI_QWEN_EDIT_STEPS,
    COMFYUI_QWEN_EDIT_UNET,
    COMFYUI_QWEN_LORA,
    COMFYUI_QWEN_SAMPLER,
    COMFYUI_QWEN_SCHEDULER,
    COMFYUI_QWEN_SHIFT,
    COMFYUI_QWEN_STEPS,
    COMFYUI_QWEN_UNET,
    COMFYUI_QWEN_VAE,
    IMAGE_GENERATION_SELECTIONS,
)
from novelvideo.generators.image_generator import ImageGenResult
from novelvideo.shared.billing_errors import is_insufficient_credits_error


# 工作流模板名称映射
_WORKFLOW_TEXT2IMG = "text2img.json"
_WORKFLOW_IMG2IMG_1REF = "img2img_1ref.json"
_WORKFLOW_IMG2IMG_2REF = "img2img_2ref.json"
_WORKFLOW_IMG2IMG_3REF = "img2img_3ref.json"
_WORKFLOW_UPSCALE = "upscale.json"

_QWEN_WORKFLOW_TEXT2IMG = "qwen_text2img.json"
_QWEN_WORKFLOW_IMG2IMG = "qwen_img2img.json"

_QWEN_MODEL_NAMES = {"qwen-image", "qwen_image", "comfyui_qwen_image"}

# 参考图 base64 注入节点映射
_REF_BASE64_NODES = {
    0: "76",    # Group1: 参考图1
    1: "164",   # Group2: 参考图2
    2: "179",   # Group3: 参考图3
}

# 轮询配置
_POLL_INTERVAL = 2.0  # 秒
_POLL_TIMEOUT = 300.0  # 秒


def _strip_data_url_prefix(b64_or_url: str) -> str:
    """去掉 data:...;base64, 前缀，返回纯 base64 字符串。"""
    if "," in b64_or_url and b64_or_url.startswith("data:"):
        return b64_or_url.split(",", 1)[1].replace(" ", "")
    return b64_or_url.replace(" ", "")


def _load_image_as_base64(image_path: str, quality: int = 60) -> str:
    """读取本地图片并转为 base64 字符串（带 JPEG 压缩）。

    Args:
        image_path: 图片路径
        quality: JPEG 压缩质量 (1-100)，0 表示不压缩

    Returns:
        纯 base64 字符串（无 data URL 前缀）
    """
    from PIL import Image
    import io

    img = Image.open(image_path)
    original_size = os.path.getsize(image_path)

    if quality > 0:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=quality, optimize=True)
        image_data = buffer.getvalue()
        compressed_size = len(image_data)
        ratio = (1 - compressed_size / original_size) * 100
        print(
            f"[ComfyUI压缩] {os.path.basename(image_path)}: "
            f"{original_size / 1024:.0f}KB -> {compressed_size / 1024:.0f}KB "
            f"({ratio:.0f}% 压缩)",
            flush=True,
        )
    else:
        with open(image_path, "rb") as f:
            image_data = f.read()

    return base64.b64encode(image_data).decode()


class ComfyUIImageGenerator:
    """ComfyUI FLUX2 / Qwen Image 本地图像生成器。

    通过 ComfyUI HTTP API 提交工作流并获取结果。
    工作流 JSON 模板从 COMFYUI_IMAGE_WORKFLOW_DIR 加载。

    示例:
        >>> generator = ComfyUIImageGenerator()
        >>> result = await generator.generate(
        ...     prompt="anime girl with black hair",
        ...     output_path="output/image.png",
        ...     width=720,
        ...     height=1280,
        ... )
    """

    def __init__(
        self,
        api_url: Optional[str] = None,
        workflow_dir: Optional[str] = None,
        model: Optional[str] = None,
    ):
        """初始化生成器。

        Args:
            api_url: ComfyUI API 地址，默认从 COMFYUI_IMAGE_URL 读取
            workflow_dir: 工作流 JSON 目录，默认从 COMFYUI_IMAGE_WORKFLOW_DIR 读取
            model: 本地模型标识或 selection key，默认使用 FLUX2 Klein
        """
        self.api_url = (api_url or COMFYUI_IMAGE_URL).rstrip("/")
        self.workflow_dir = Path(workflow_dir or COMFYUI_IMAGE_WORKFLOW_DIR)

        requested_model = str(model or "flux2-klein").strip()
        selection = IMAGE_GENERATION_SELECTIONS.get(requested_model)
        if selection and selection.get("provider") == "comfyui":
            requested_model = selection.get("model", requested_model)
        self.model_name = requested_model
        self.workflow_family = (
            "qwen_image" if requested_model in _QWEN_MODEL_NAMES else "flux2"
        )

        if self.workflow_family == "qwen_image":
            self.clip_model = COMFYUI_QWEN_CLIP
            self.vae_model = COMFYUI_QWEN_VAE
            self.unet_model = COMFYUI_QWEN_UNET
            self.edit_unet_model = COMFYUI_QWEN_EDIT_UNET
            self.lora_model = COMFYUI_QWEN_LORA
            self.edit_lora_model = COMFYUI_QWEN_EDIT_LORA
            self.steps = COMFYUI_QWEN_STEPS
            self.edit_steps = COMFYUI_QWEN_EDIT_STEPS
            self.cfg = COMFYUI_QWEN_CFG
            self.edit_cfg = COMFYUI_QWEN_EDIT_CFG
            self.sampler = COMFYUI_QWEN_SAMPLER
            self.scheduler = COMFYUI_QWEN_SCHEDULER
            self.shift = COMFYUI_QWEN_SHIFT
            self.edit_shift = COMFYUI_QWEN_EDIT_SHIFT
            self.default_denoise = COMFYUI_QWEN_DENOISE
            self.text2img_template = _QWEN_WORKFLOW_TEXT2IMG
            self.img2img_templates = {
                1: _QWEN_WORKFLOW_IMG2IMG,
                2: _QWEN_WORKFLOW_IMG2IMG,
                3: _QWEN_WORKFLOW_IMG2IMG,
            }
            self.upscale_template = _QWEN_WORKFLOW_IMG2IMG
        else:
            self.clip_model = COMFYUI_FLUX2_CLIP
            self.vae_model = COMFYUI_FLUX2_VAE
            self.unet_model = COMFYUI_FLUX2_UNET
            self.edit_unet_model = COMFYUI_FLUX2_UNET
            self.lora_model = ""
            self.edit_lora_model = ""
            self.steps = COMFYUI_FLUX2_STEPS
            self.edit_steps = COMFYUI_FLUX2_STEPS
            self.cfg = COMFYUI_FLUX2_CFG
            self.edit_cfg = COMFYUI_FLUX2_CFG
            self.sampler = COMFYUI_FLUX2_SAMPLER
            self.scheduler = COMFYUI_FLUX2_SCHEDULER
            self.shift = 0.0
            self.edit_shift = 0.0
            self.default_denoise = COMFYUI_FLUX2_DENOISE
            self.text2img_template = _WORKFLOW_TEXT2IMG
            self.img2img_templates = {
                1: _WORKFLOW_IMG2IMG_1REF,
                2: _WORKFLOW_IMG2IMG_2REF,
                3: _WORKFLOW_IMG2IMG_3REF,
            }
            self.upscale_template = _WORKFLOW_UPSCALE

        # 预加载工作流模板
        self._templates: dict[str, dict] = {}
        self._load_templates()

        print(
            f"[ComfyUI] 初始化完成: url={self.api_url}, "
            f"family={self.workflow_family}, "
            f"workflows={list(self._templates.keys())}, "
            f"clip={self.clip_model}, unet={self.unet_model}",
            flush=True,
        )

    def _load_templates(self) -> None:
        """从磁盘加载所有工作流 JSON 模板。"""
        template_names = [
            self.text2img_template,
            *self.img2img_templates.values(),
            self.upscale_template,
        ]
        for name in template_names:
            path = self.workflow_dir / name
            if path.exists():
                with open(path, "r", encoding="utf-8") as f:
                    self._templates[name] = json.load(f)
            else:
                print(f"[ComfyUI] 警告: 工作流模板不存在: {path}", flush=True)

    def _build_workflow(
        self,
        template_name: str,
        *,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1280,
        height: int = 720,
        denoise: Optional[float] = None,
        reference_images: Optional[list[str]] = None,
    ) -> dict:
        """基于模板构建完整工作流 JSON。

        Args:
            template_name: 工作流模板文件名
            prompt: 正向提示词
            negative_prompt: 负向提示词
            width: 输出宽度
            height: 输出高度
            denoise: 去噪强度（img2img/upscale 时使用）
            reference_images: 参考图路径列表（img2img 时使用）

        Returns:
            填好参数的工作流 dict
        """
        if template_name not in self._templates:
            raise ValueError(f"工作流模板未加载: {template_name}")

        workflow = copy.deepcopy(self._templates[template_name])
        is_qwen_edit = (
            self.workflow_family == "qwen_image"
            and template_name != self.text2img_template
        )

        # 填入模型文件名
        if "107" in workflow:
            workflow["107"]["inputs"]["clip_name"] = self.clip_model
        if "110" in workflow:
            workflow["110"]["inputs"]["vae_name"] = self.vae_model
        if "197" in workflow:
            workflow["197"]["inputs"]["unet_name"] = (
                self.edit_unet_model if is_qwen_edit else self.unet_model
            )
        if "198" in workflow:
            workflow["198"]["inputs"]["lora_name"] = (
                self.edit_lora_model if is_qwen_edit else self.lora_model
            )
        if "199" in workflow:
            workflow["199"]["inputs"]["shift"] = (
                self.edit_shift if is_qwen_edit else self.shift
            )

        # 填入提示词
        if "108" in workflow:
            prompt_key = "text" if "text" in workflow["108"]["inputs"] else "prompt"
            workflow["108"]["inputs"][prompt_key] = prompt
        if "109" in workflow:
            prompt_key = "text" if "text" in workflow["109"]["inputs"] else "prompt"
            workflow["109"]["inputs"][prompt_key] = negative_prompt

        # 填入尺寸
        if "128" in workflow:
            workflow["128"]["inputs"]["width"] = width
            workflow["128"]["inputs"]["height"] = height

        # 填入采样参数
        if "146" in workflow:
            workflow["146"]["inputs"]["seed"] = random.randint(0, 10**18)
            workflow["146"]["inputs"]["steps"] = (
                self.edit_steps if is_qwen_edit else self.steps
            )
            workflow["146"]["inputs"]["cfg"] = (
                self.edit_cfg if is_qwen_edit else self.cfg
            )
            workflow["146"]["inputs"]["sampler_name"] = self.sampler
            workflow["146"]["inputs"]["scheduler"] = self.scheduler
            if denoise is not None:
                workflow["146"]["inputs"]["denoise"] = denoise

        if is_qwen_edit:
            ref_count = min(len(reference_images or []), 3)
            optional_nodes = {
                1: ("164", "165"),
                2: ("179", "180"),
            }
            for ref_index, node_ids in optional_nodes.items():
                if ref_index < ref_count:
                    continue
                for node_id in node_ids:
                    workflow.pop(node_id, None)
                input_name = f"image{ref_index + 1}"
                workflow.get("108", {}).get("inputs", {}).pop(input_name, None)
                workflow.get("109", {}).get("inputs", {}).pop(input_name, None)

        # 填入参考图 base64
        if reference_images:
            for idx, img_path in enumerate(reference_images[:3]):
                node_id = _REF_BASE64_NODES.get(idx)
                if node_id and node_id in workflow:
                    if img_path and os.path.exists(img_path):
                        b64 = _load_image_as_base64(img_path, quality=60)
                        workflow[node_id]["inputs"]["base64_data"] = b64
                        print(
                            f"[ComfyUI] 参考图{idx + 1}: {os.path.basename(img_path)}",
                            flush=True,
                        )
                    else:
                        print(
                            f"[ComfyUI] 警告: 参考图{idx + 1} 路径无效: {img_path}",
                            flush=True,
                        )

        return workflow

    async def _submit_workflow(self, workflow: dict) -> str:
        """提交工作流到 ComfyUI，返回 prompt_id。

        Args:
            workflow: 完整工作流 dict

        Returns:
            prompt_id
        """
        payload = {
            "prompt": workflow,
            "client_id": "dramaclaw",
        }

        async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
            response = await client.post(
                f"{self.api_url}/prompt",
                headers={"Content-Type": "application/json"},
                json=payload,
            )

        if response.status_code != 200:
            raise RuntimeError(
                f"ComfyUI 提交失败: HTTP {response.status_code} - {response.text[:500]}"
            )

        data = response.json()
        prompt_id = data.get("prompt_id")
        if not prompt_id:
            raise RuntimeError(f"ComfyUI 响应缺少 prompt_id: {data}")

        return prompt_id

    async def _poll_result(
        self,
        prompt_id: str,
        *,
        save_node_id: str = "195",
    ) -> str:
        """轮询 ComfyUI 直到任务完成，返回结果图的 URL。

        Args:
            prompt_id: 任务 ID
            save_node_id: SaveImage 节点 ID

        Returns:
            结果图的完整 URL
        """
        start_time = time.time()

        while time.time() - start_time < _POLL_TIMEOUT:
            await asyncio.sleep(_POLL_INTERVAL)

            async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
                response = await client.get(
                    f"{self.api_url}/history/{prompt_id}",
                )

            if response.status_code != 200:
                continue

            data = response.json()
            task = data.get(prompt_id)
            if not task:
                continue

            status = task.get("status", {})
            status_str = status.get("status_str", "").lower()

            if status_str in ("error", "failed"):
                error_msg = status.get("exception_message", "unknown error")
                raise RuntimeError(f"ComfyUI 任务失败: {error_msg}")

            if status_str == "success":
                outputs = task.get("outputs", {})
                save_output = outputs.get(save_node_id, {})
                images = save_output.get("images", [])
                if images:
                    img = images[0]
                    filename = img.get("filename", "")
                    img_type = img.get("type", "output")
                    subfolder = img.get("subfolder", "")
                    url = (
                        f"{self.api_url}/view?"
                        f"filename={filename}&type={img_type}"
                    )
                    if subfolder:
                        url += f"&subfolder={subfolder}"
                    return url
                raise RuntimeError(f"ComfyUI 成功但无图片输出: {outputs}")

        raise TimeoutError(
            f"ComfyUI 任务超时 ({_POLL_TIMEOUT}s): {prompt_id}"
        )

    async def _download_image(self, url: str, output_path: str) -> str:
        """从 ComfyUI 下载结果图并保存。

        Args:
            url: 图片 URL
            output_path: 保存路径

        Returns:
            base64 编码的图片数据
        """
        async with httpx.AsyncClient(
            timeout=60.0, follow_redirects=True, trust_env=False
        ) as client:
            response = await client.get(url)

        if response.status_code != 200:
            raise RuntimeError(f"ComfyUI 图片下载失败: HTTP {response.status_code}")

        image_bytes = response.content
        if not image_bytes:
            raise RuntimeError("ComfyUI 下载的图片为空")

        # 保存文件
        if output_path:
            output_dir = os.path.dirname(output_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(image_bytes)
            print(
                f"[ComfyUI] 图片已保存: {output_path} ({len(image_bytes)} bytes)",
                flush=True,
            )

        return base64.b64encode(image_bytes).decode()

    async def generate(
        self,
        prompt: str,
        output_path: Optional[str] = None,
        negative_prompt: str = "",
        width: Optional[int] = None,
        height: Optional[int] = None,
        style: Optional[str] = None,
        project_dir: str = "",
        reference_image: Optional[str] = None,
        reference_strength: float = 0.7,
        **kwargs,
    ) -> ImageGenResult:
        """生成图像（纯文生图或单参考图）。

        兼容 VolcengineImageGenerator.generate() 接口。

        Args:
            prompt: 正向提示词
            output_path: 输出路径
            negative_prompt: 负向提示词
            width: 宽度
            height: 高度
            style: 风格（ComfyUI 暂不使用，预留兼容）
            project_dir: 项目目录（预留兼容）
            reference_image: 参考图路径（可选）
            reference_strength: 参考图强度（预留兼容）

        Returns:
            ImageGenResult
        """
        start_time = time.time()

        w = width or 1280
        h = height or 720

        try:
            # 有参考图 -> 当前模型对应的单参考图模板，否则 -> 文生图
            if reference_image and os.path.exists(reference_image):
                template = self.img2img_templates[1]
                denoise = reference_strength
                ref_images = [reference_image]
            else:
                template = self.text2img_template
                denoise = 1.0
                ref_images = None

            workflow = self._build_workflow(
                template,
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=w,
                height=h,
                denoise=denoise,
                reference_images=ref_images,
            )

            print(
                f"[ComfyUI] 生成: {w}x{h}, template={template}, "
                f"prompt={prompt[:60]}...",
                flush=True,
            )

            prompt_id = await self._submit_workflow(workflow)
            print(f"[ComfyUI] 已提交: prompt_id={prompt_id}", flush=True)

            result_url = await self._poll_result(prompt_id)
            image_base64 = await self._download_image(result_url, output_path or "")

            generation_time = time.time() - start_time
            print(f"[ComfyUI] 生成完成，耗时 {generation_time:.1f}s", flush=True)

            return ImageGenResult(
                success=True,
                image_path=output_path,
                image_base64=image_base64,
                generation_time=generation_time,
            )

        except Exception as e:
            if is_insufficient_credits_error(e):
                raise
            return ImageGenResult(
                success=False,
                error=str(e),
                generation_time=time.time() - start_time,
            )

    async def generate_with_references(
        self,
        prompt: str,
        reference_images: list[str],
        output_path: Optional[str] = None,
        negative_prompt: str = "",
        width: int = 1280,
        height: int = 720,
        denoise: Optional[float] = None,
        **kwargs,
    ) -> ImageGenResult:
        """使用多张参考图生成图像（1~3 张）。

        根据参考图数量自动选择工作流模板。

        Args:
            prompt: 正向提示词
            reference_images: 参考图路径列表（1~3 张）
            output_path: 输出路径
            negative_prompt: 负向提示词
            width: 宽度
            height: 高度
            denoise: 去噪强度

        Returns:
            ImageGenResult
        """
        start_time = time.time()

        # 过滤有效参考图
        valid_refs = [p for p in reference_images if p and os.path.exists(p)]
        ref_count = min(len(valid_refs), 3)

        if ref_count == 0:
            # 无有效参考图，退化为文生图
            return await self.generate(
                prompt=prompt,
                output_path=output_path,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
            )

        # 根据参考图数量选模板
        template = self.img2img_templates[ref_count]
        effective_denoise = denoise if denoise is not None else self.default_denoise

        try:
            workflow = self._build_workflow(
                template,
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                denoise=effective_denoise,
                reference_images=valid_refs[:3],
            )

            print(
                f"[ComfyUI] 多参考图生成: {width}x{height}, refs={ref_count}, "
                f"template={template}, denoise={effective_denoise}",
                flush=True,
            )

            prompt_id = await self._submit_workflow(workflow)
            print(f"[ComfyUI] 已提交: prompt_id={prompt_id}", flush=True)

            result_url = await self._poll_result(prompt_id)
            image_base64 = await self._download_image(result_url, output_path or "")

            generation_time = time.time() - start_time
            print(f"[ComfyUI] 生成完成，耗时 {generation_time:.1f}s", flush=True)

            return ImageGenResult(
                success=True,
                image_path=output_path,
                image_base64=image_base64,
                generation_time=generation_time,
            )

        except Exception as e:
            if is_insufficient_credits_error(e):
                raise
            return ImageGenResult(
                success=False,
                error=str(e),
                generation_time=time.time() - start_time,
            )

    async def upscale(
        self,
        input_path: str,
        output_path: str,
        target_width: int = 720,
        target_height: int = 1280,
        strength: float = 0.9,
        enhancement_prompt: Optional[str] = None,
        **kwargs,
    ) -> ImageGenResult:
        """高清修复/放大。

        使用输入图作为参考，在目标尺寸下重新生成高清版本。

        Args:
            input_path: 输入图片路径（低分辨率）
            output_path: 输出路径（高分辨率）
            target_width: 目标宽度
            target_height: 目标高度
            strength: 相似度（0.85-0.95 适合高清修复）
            enhancement_prompt: 增强提示词（可选）

        Returns:
            ImageGenResult
        """
        start_time = time.time()

        if not os.path.exists(input_path):
            return ImageGenResult(
                success=False,
                error=f"输入文件不存在: {input_path}",
                generation_time=time.time() - start_time,
            )

        prompt = enhancement_prompt or (
            "高清，清晰，细节丰富，保持原图内容和构图，"
            "8K 分辨率，专业摄影，电影级画质"
        )

        try:
            workflow = self._build_workflow(
                self.upscale_template,
                prompt=prompt,
                width=target_width,
                height=target_height,
                denoise=strength,
                reference_images=[input_path],
            )

            print(
                f"[ComfyUI] 高清修复: {input_path} -> {target_width}x{target_height}, "
                f"strength={strength}",
                flush=True,
            )

            prompt_id = await self._submit_workflow(workflow)
            print(f"[ComfyUI] 已提交: prompt_id={prompt_id}", flush=True)

            result_url = await self._poll_result(prompt_id)
            image_base64 = await self._download_image(result_url, output_path)

            generation_time = time.time() - start_time
            print(f"[ComfyUI] 高清修复完成，耗时 {generation_time:.1f}s", flush=True)

            return ImageGenResult(
                success=True,
                image_path=output_path,
                image_base64=image_base64,
                generation_time=generation_time,
            )

        except Exception as e:
            if is_insufficient_credits_error(e):
                raise
            return ImageGenResult(
                success=False,
                error=str(e),
                generation_time=time.time() - start_time,
            )

    async def generate_character_reference(
        self,
        character_name: str,
        appearance_prompt: str,
        output_dir: str,
        count: int = 3,
        style: str = None,
        project_dir: str = "",
    ) -> list[str]:
        """生成角色参考图（兼容 VolcengineImageGenerator 接口）。

        Args:
            character_name: 角色名
            appearance_prompt: 外貌 Prompt
            output_dir: 输出目录
            count: 生成数量
            style: 风格名称
            project_dir: 项目目录

        Returns:
            生成的图片路径列表
        """
        from novelvideo.config import get_style_preset

        os.makedirs(output_dir, exist_ok=True)

        style_preset = get_style_preset(style or "chinese_period_drama", project_dir=project_dir)
        style_keywords = style_preset.get("style_instructions", "")
        negative_prompt = style_preset.get("avoid_instructions", "")

        solo_prefix = "solo, single subject, only one character"
        views = ["全身正面", "全身侧面", "全身背面"]
        paths = []

        for i in range(count):
            view = views[i] if i < len(views) else f"全身姿势{i + 1}"
            prompt = (
                f"{solo_prefix}, {style_keywords}, {appearance_prompt}，{view}，"
                f"角色参考图，仅锁定角色身份与外貌"
            )
            output_path = os.path.join(output_dir, f"reference_{i + 1:02d}.png")

            result = await self.generate(
                prompt=prompt,
                output_path=output_path,
                negative_prompt=negative_prompt,
                style=style,
                project_dir=project_dir,
            )

            if result.success and result.image_path:
                paths.append(result.image_path)

        return paths


    # 兼容 VolcengineImageGenerator 接口名
    upscale_with_img2img = upscale


def create_comfyui_image_generator(model: Optional[str] = None) -> ComfyUIImageGenerator:
    """创建 ComfyUI 图像生成器实例。

    Returns:
        ComfyUIImageGenerator
    """
    return ComfyUIImageGenerator(model=model)
