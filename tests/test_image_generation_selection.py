from __future__ import annotations


def test_image_generation_selection_preserves_visible_options():
    from novelvideo.config import (
        image_generation_selection_options,
        normalize_image_generation_selection,
    )

    options = image_generation_selection_options()

    assert normalize_image_generation_selection("huimeng_image2_official") == "huimeng_image2_official"
    assert normalize_image_generation_selection("huimeng_gpt_image2") == "huimeng_gpt_image2"
    assert normalize_image_generation_selection("comfyui_flux2") == "comfyui_flux2"
    assert normalize_image_generation_selection("comfyui_qwen_image") == "comfyui_qwen_image"
    assert normalize_image_generation_selection("unknown") in options


def test_character_image_selection_preserves_visible_options():
    from novelvideo.config import (
        character_image_selection_options,
        normalize_character_image_selection,
    )

    options = character_image_selection_options()

    assert normalize_character_image_selection("huimeng_gpt_image2") == "huimeng_gpt_image2"
    assert normalize_character_image_selection("comfyui_flux2") == "comfyui_flux2"
    assert normalize_character_image_selection("comfyui_qwen_image") == "comfyui_qwen_image"
    assert normalize_character_image_selection("seedream") in options
