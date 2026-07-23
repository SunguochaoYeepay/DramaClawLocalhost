import copy

from novelvideo.generators.video_generator import ComfyUIVideoGenerator


def test_wan_dimensions_use_requested_portrait_ratio():
    assert ComfyUIVideoGenerator._wan_dimensions("9:16", "720p") == (720, 1280)
    assert ComfyUIVideoGenerator._wan_dimensions("16:9", "720p") == (1280, 720)
    assert ComfyUIVideoGenerator._wan_dimensions("1:1", "480p") == (480, 480)
    assert ComfyUIVideoGenerator._wan_dimensions("21:9", "720p") == (1680, 720)


def test_wan_backend_options_and_request_values_are_explicit():
    from novelvideo.api.routes.generation import (
        LOCAL_WAN_RATIO_OPTIONS,
        LOCAL_WAN_RESOLUTION_OPTIONS,
        _api_video_backend_options,
        _local_wan_ratio,
        _local_wan_resolution,
    )

    wan = next(option for option in _api_video_backend_options() if option.value == "comfyui")
    assert wan.resolution_options == list(LOCAL_WAN_RESOLUTION_OPTIONS)
    assert wan.ratio_options == list(LOCAL_WAN_RATIO_OPTIONS)
    director = next(
        option for option in _api_video_backend_options() if option.value == "ltx23_director"
    )
    assert director.resolution_options == ["720p", "1080p"]
    assert director.ratio_options == list(LOCAL_WAN_RATIO_OPTIONS)
    assert _local_wan_resolution("1080p") == "1080p"
    assert _local_wan_ratio("9:16") == "9:16"


def test_director_uses_24fps_timeline():
    assert ComfyUIVideoGenerator.LTX23_DIRECTOR_FPS == 24
    assert ComfyUIVideoGenerator._director_timeline_frames(5) == 120


def test_director_fast_profile_uses_fp8_model_and_one_sampling_pass():
    generator = ComfyUIVideoGenerator(workflow_type="ltx23_director_fast")
    workflow = copy.deepcopy(generator._workflow_templates["ltx23_director"])

    generator._apply_director_fast_profile(workflow)

    assert workflow["77"]["class_type"] == "UNETLoader"
    assert workflow["77"]["inputs"]["unet_name"] == (
        "ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors"
    )
    assert workflow["46"]["inputs"]["model"] == ["77", 0]
    assert workflow["11"]["inputs"]["steps"] == 10
    assert workflow["94"]["inputs"]["samples"] == ["13", 0]
    assert workflow["16"]["inputs"]["samples"] == ["13", 1]


def test_wan_workflow_dimensions_are_applied_to_each_variant():
    generator = ComfyUIVideoGenerator(resolution="720p")

    gguf = copy.deepcopy(generator._workflow_templates["gguf"])
    generator._apply_wan_dimensions(gguf, "gguf", "9:16")
    assert gguf["63"]["inputs"]["width"] == 720
    assert gguf["63"]["inputs"]["height"] == 1280

    fp8 = copy.deepcopy(generator._workflow_templates["fp8_i2v"])
    generator._apply_wan_dimensions(fp8, "fp8_i2v", "9:16")
    assert fp8["369"]["inputs"]["aspect_ratio"] == "9:16"
    assert fp8["30"]["inputs"]["Number"] == "1280"

    first_last_frame = copy.deepcopy(generator._workflow_templates["fp8_flf"])
    generator._apply_wan_dimensions(first_last_frame, "fp8_flf", "16:9")
    assert first_last_frame["112"]["inputs"]["value"] == 1280
    assert first_last_frame["114"]["inputs"]["value"] == 720


def test_ltx23_workflow_dimensions_follow_the_requested_canvas():
    generator = ComfyUIVideoGenerator(workflow_type="ltx23", resolution="1080p")
    workflow = copy.deepcopy(generator._workflow_templates["ltx23"])

    generator._apply_ltx23_dimensions(workflow, "9:16")

    assert workflow["167:102"]["inputs"]["resize_type.width"] == 1088
    assert workflow["167:102"]["inputs"]["resize_type.height"] == 1920
