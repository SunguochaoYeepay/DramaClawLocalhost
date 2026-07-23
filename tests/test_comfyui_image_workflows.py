from __future__ import annotations

from pathlib import Path

from PIL import Image

from novelvideo.config import (
    COMFYUI_QWEN_EDIT_LORA,
    COMFYUI_QWEN_EDIT_UNET,
    COMFYUI_QWEN_LORA,
    COMFYUI_QWEN_UNET,
    image_generation_selection_options,
    infer_image_generation_selection,
)
from novelvideo.generators.comfyui_image import ComfyUIImageGenerator


WORKFLOW_DIR = (
    Path(__file__).parents[1]
    / "src"
    / "novelvideo"
    / "generators"
    / "comfyui_workflows"
)


def test_qwen_image_is_a_visible_comfyui_selection() -> None:
    options = image_generation_selection_options()

    assert options["comfyui_flux2"] == "ComfyUI FLUX2 (Local)"
    assert options["comfyui_qwen_image"] == "ComfyUI Qwen Image (Local)"
    assert (
        infer_image_generation_selection("comfyui", "qwen-image")
        == "comfyui_qwen_image"
    )


def test_flux2_workflow_remains_the_default_family() -> None:
    generator = ComfyUIImageGenerator(
        api_url="http://127.0.0.1:8188",
        workflow_dir=str(WORKFLOW_DIR),
    )

    workflow = generator._build_workflow(
        generator.text2img_template,
        prompt="test prompt",
        width=768,
        height=1024,
    )

    assert generator.workflow_family == "flux2"
    assert workflow["107"]["inputs"]["type"] == "flux2"
    assert workflow["128"]["class_type"] == "EmptyFlux2LatentImage"
    assert workflow["108"]["inputs"]["text"] == "test prompt"
    assert "198" not in workflow


def test_qwen_text2img_uses_qwen_image_and_lightning() -> None:
    generator = ComfyUIImageGenerator(
        api_url="http://127.0.0.1:8188",
        workflow_dir=str(WORKFLOW_DIR),
        model="comfyui_qwen_image",
    )

    workflow = generator._build_workflow(
        generator.text2img_template,
        prompt="明代历史剧角色定妆照",
        negative_prompt="影楼古装",
        width=768,
        height=1024,
    )

    assert generator.workflow_family == "qwen_image"
    assert workflow["197"]["inputs"]["unet_name"] == COMFYUI_QWEN_UNET
    assert workflow["198"]["inputs"]["lora_name"] == COMFYUI_QWEN_LORA
    assert workflow["107"]["inputs"]["type"] == "qwen_image"
    assert workflow["128"]["class_type"] == "EmptySD3LatentImage"
    assert workflow["128"]["inputs"]["width"] == 768
    assert workflow["128"]["inputs"]["height"] == 1024
    assert workflow["108"]["inputs"]["text"] == "明代历史剧角色定妆照"
    assert workflow["109"]["inputs"]["text"] == "影楼古装"
    assert workflow["146"]["inputs"]["steps"] == 8


def test_qwen_edit_injects_references_and_removes_unused_optional_nodes(
    tmp_path: Path,
) -> None:
    ref1 = tmp_path / "ref1.png"
    ref2 = tmp_path / "ref2.png"
    Image.new("RGB", (256, 384), "red").save(ref1)
    Image.new("RGB", (384, 256), "blue").save(ref2)

    generator = ComfyUIImageGenerator(
        api_url="http://127.0.0.1:8188",
        workflow_dir=str(WORKFLOW_DIR),
        model="qwen-image",
    )
    workflow = generator._build_workflow(
        generator.img2img_templates[2],
        prompt="保持人物面容，改为明制圆领袍",
        negative_prompt="和服",
        width=1024,
        height=768,
        reference_images=[str(ref1), str(ref2)],
    )

    assert workflow["197"]["inputs"]["unet_name"] == COMFYUI_QWEN_EDIT_UNET
    assert workflow["198"]["inputs"]["lora_name"] == COMFYUI_QWEN_EDIT_LORA
    assert workflow["108"]["class_type"] == "TextEncodeQwenImageEditPlus"
    assert workflow["108"]["inputs"]["prompt"] == "保持人物面容，改为明制圆领袍"
    assert workflow["109"]["inputs"]["prompt"] == "和服"
    assert workflow["76"]["inputs"]["base64_data"]
    assert workflow["164"]["inputs"]["base64_data"]
    assert "179" not in workflow
    assert "180" not in workflow
    assert "image3" not in workflow["108"]["inputs"]
    assert workflow["128"]["inputs"]["width"] == 1024
    assert workflow["128"]["inputs"]["height"] == 768
    assert workflow["146"]["inputs"]["steps"] == 4
