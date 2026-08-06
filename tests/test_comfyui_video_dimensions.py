import copy
import json

import pytest

import novelvideo.generators.video_generator as video_generator_module
from novelvideo.generators.video_generator import (
    ComfyUIVideoGenerator,
    ShotReference,
    create_video_generator,
)


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


@pytest.mark.asyncio
async def test_ltx23_rejects_last_frame_instead_of_using_wan_flf_workflow(tmp_path):
    generator = ComfyUIVideoGenerator(workflow_type="ltx23")

    result = await generator.generate(
        image_path=str(tmp_path / "first.png"),
        last_frame_path=str(tmp_path / "last.png"),
        prompt="A continuous shot.",
        output_path=str(tmp_path / "result.mp4"),
    )

    assert result.status.value == "failed"
    assert "only supports a first frame" in (result.error or "")


def test_minimax_h3_workflow_is_registered_with_first_and_last_frame_inputs():
    from novelvideo.api.routes.generation import _api_video_backend_options

    generator = ComfyUIVideoGenerator(workflow_type="minimax_h3")
    workflow = copy.deepcopy(generator._workflow_templates["minimax_h3"])

    generator._apply_minimax_h3_dimensions(workflow, "3:4")

    assert workflow["105:104"]["class_type"] == "MiniMaxH3ImageToVideo"
    assert workflow["105:104"]["inputs"]["first_frame"] == ["114", 0]
    assert workflow["105:104"]["inputs"]["last_frame"] == ["121", 0]
    assert workflow["115"]["inputs"]["aspect_ratio"] == "3:4 (Portrait Standard)"
    assert create_video_generator("minimax_h3").workflow_type == "minimax_h3"
    backend = next(option for option in _api_video_backend_options() if option.value == "minimax_h3")
    assert backend.supported_modes == ["first_frame", "first_last_frame", "multimodal_reference"]
    assert backend.reference_image_max == 9
    assert backend.min_duration == 5
    assert backend.max_duration == 15


def test_minimax_h3_workflows_use_the_same_half_megapixel_canvas():
    generator = ComfyUIVideoGenerator(workflow_type="minimax_h3")

    assert generator._workflow_templates["minimax_h3"]["115"]["inputs"]["megapixels"] == 0.5
    assert generator._workflow_templates["minimax_h3_r2v"]["115"]["inputs"]["megapixels"] == 0.5


def test_minimax_h3_reference_prompt_adapts_numbered_drama_claw_assets():
    prompt = ComfyUIVideoGenerator._build_minimax_h3_reference_prompt(
        "@图1为主角，带着@图片2中的道具进入场景；参考@视频1的运镜和@音频1的节奏。",
        image_roles=["首帧主体", "道具参考"],
        video_roles=["镜头运动"],
        audio_roles=["节奏与氛围"],
    )

    assert "@图" not in prompt
    assert "@图片" not in prompt
    assert "<Picture 1>为主角" in prompt
    assert "<Picture 2>中的道具" in prompt
    assert "<Video 1>的运镜" in prompt
    assert "<Audio 1>的节奏" in prompt
    assert "primary identity and visual anchor" in prompt
    assert "auxiliary reference for 道具参考" in prompt
    assert "do not make a slideshow" in prompt


@pytest.mark.asyncio
async def test_minimax_h3_multiple_images_use_reference_workflow(monkeypatch, tmp_path):
    first_image = tmp_path / "first.png"
    reference_image = tmp_path / "reference.png"
    output = tmp_path / "result.mp4"
    first_image.write_bytes(b"first")
    reference_image.write_bytes(b"reference")
    generator = ComfyUIVideoGenerator(workflow_type="minimax_h3")
    captured: dict[str, object] = {}
    uploaded: list[str] = []

    async def fake_upload(_data, filename, **_kwargs):
        uploaded.append(filename)
        return {"name": filename}

    async def fake_queue(workflow, _client_id):
        captured["workflow"] = workflow
        return {"prompt_id": "h3-test"}

    async def fake_history(_prompt_id):
        return {"h3-test": {"outputs": {"92": {"images": [{"filename": "result.mp4"}]}}}}

    async def fake_download(_filename, _subfolder=""):
        return b"video"

    class FakeWebSocket:
        async def recv(self):
            return json.dumps({"type": "executing", "data": {"prompt_id": "h3-test", "node": None}})

        async def close(self):
            return None

    async def fake_connect(*_args, **_kwargs):
        return FakeWebSocket()

    monkeypatch.setattr(generator, "_upload_image", fake_upload)
    monkeypatch.setattr(generator, "_queue_prompt", fake_queue)
    monkeypatch.setattr(generator, "_get_history", fake_history)
    monkeypatch.setattr(generator, "_download_video", fake_download)
    monkeypatch.setattr(video_generator_module.websockets, "connect", fake_connect)

    result = await generator.generate(
        image_path=str(first_image),
        prompt="@图1为主角，带着@图2中的形象连续行走。",
        output_path=str(output),
        duration=5,
        references=[ShotReference("image", str(reference_image), "同伴形象")],
    )

    workflow = captured["workflow"]
    h3_inputs = workflow["136"]["inputs"]
    assert result.status.value == "done"
    assert output.read_bytes() == b"video"
    assert uploaded[0].startswith("h3_image_")
    assert uploaded[1].startswith("h3_image_")
    assert workflow["136"]["class_type"] == "MiniMaxH3ReferenceToVideo"
    assert h3_inputs["ref_images.ref_image_0"] == ["h3_reference_image_0", 0]
    assert h3_inputs["ref_images.ref_image_1"] == ["h3_reference_image_1", 0]
    assert "<Picture 1>" in h3_inputs["prompt"]
    assert "<Picture 2>" in h3_inputs["prompt"]
    assert "<Picture 1>为主角" in h3_inputs["prompt"]
    assert "auxiliary reference for 同伴形象" in h3_inputs["prompt"]
    assert "do not make a slideshow" in h3_inputs["prompt"]


@pytest.mark.asyncio
async def test_minimax_h3_first_last_frame_uses_official_keyframe_slots(monkeypatch, tmp_path):
    first_image = tmp_path / "first.png"
    last_image = tmp_path / "last.png"
    output = tmp_path / "result.mp4"
    first_image.write_bytes(b"first")
    last_image.write_bytes(b"last")
    generator = ComfyUIVideoGenerator(workflow_type="minimax_h3")
    captured: dict[str, object] = {}
    uploaded: list[str] = []

    async def fake_upload(_data, filename, **_kwargs):
        uploaded.append(filename)
        return {"name": filename}

    async def fake_queue(workflow, _client_id):
        captured["workflow"] = workflow
        return {"prompt_id": "h3-first-last-test"}

    async def fake_history(_prompt_id):
        return {"h3-first-last-test": {"outputs": {"92": {"images": [{"filename": "result.mp4"}]}}}}

    async def fake_download(_filename, _subfolder=""):
        return b"video"

    class FakeWebSocket:
        async def recv(self):
            return json.dumps({"type": "executing", "data": {"prompt_id": "h3-first-last-test", "node": None}})

        async def close(self):
            return None

    async def fake_connect(*_args, **_kwargs):
        return FakeWebSocket()

    monkeypatch.setattr(generator, "_upload_image", fake_upload)
    monkeypatch.setattr(generator, "_queue_prompt", fake_queue)
    monkeypatch.setattr(generator, "_get_history", fake_history)
    monkeypatch.setattr(generator, "_download_video", fake_download)
    monkeypatch.setattr(video_generator_module.websockets, "connect", fake_connect)

    result = await generator.generate(
        image_path=str(first_image),
        last_frame_path=str(last_image),
        prompt="A single continuous transition from the first keyframe to the last keyframe.",
        output_path=str(output),
        duration=5,
    )

    workflow = captured["workflow"]
    h3_inputs = workflow["105:104"]["inputs"]
    assert result.status.value == "done"
    assert workflow["105:104"]["class_type"] == "MiniMaxH3ImageToVideo"
    assert h3_inputs["first_frame"] == ["114", 0]
    assert h3_inputs["last_frame"] == ["121", 0]
    assert workflow["114"]["inputs"]["image"].startswith("first_")
    assert workflow["121"]["inputs"]["image"].startswith("last_")
    assert len(uploaded) == 2


@pytest.mark.asyncio
async def test_minimax_h3_multimodal_references_use_official_input_slots(monkeypatch, tmp_path):
    reference_video = tmp_path / "motion.mp4"
    reference_audio = tmp_path / "sound.wav"
    output = tmp_path / "result.mp4"
    reference_video.write_bytes(b"video")
    reference_audio.write_bytes(b"audio")
    generator = ComfyUIVideoGenerator(workflow_type="minimax_h3")
    captured: dict[str, object] = {}

    async def fake_upload(_data, filename, **_kwargs):
        return {"name": filename}

    async def fake_queue(workflow, _client_id):
        captured["workflow"] = workflow
        return {"prompt_id": "h3-multimodal-test"}

    async def fake_history(_prompt_id):
        return {"h3-multimodal-test": {"outputs": {"92": {"images": [{"filename": "result.mp4"}]}}}}

    async def fake_download(_filename, _subfolder=""):
        return b"video"

    class FakeWebSocket:
        async def recv(self):
            return json.dumps({"type": "executing", "data": {"prompt_id": "h3-multimodal-test", "node": None}})

        async def close(self):
            return None

    async def fake_connect(*_args, **_kwargs):
        return FakeWebSocket()

    monkeypatch.setattr(generator, "_upload_file", fake_upload)
    monkeypatch.setattr(generator, "_queue_prompt", fake_queue)
    monkeypatch.setattr(generator, "_get_history", fake_history)
    monkeypatch.setattr(generator, "_download_video", fake_download)
    monkeypatch.setattr(video_generator_module.websockets, "connect", fake_connect)

    result = await generator.generate(
        image_path=None,
        prompt="Follow the reference performance",
        output_path=str(output),
        duration=5,
        references=[
            ShotReference("video", str(reference_video), "motion"),
            ShotReference("audio", str(reference_audio), "sound"),
        ],
    )

    workflow = captured["workflow"]
    h3_inputs = workflow["136"]["inputs"]
    assert result.status.value == "done"
    assert workflow["h3_reference_video_0"]["class_type"] == "VHS_LoadVideo"
    assert workflow["h3_reference_audio_0"]["class_type"] == "VHS_LoadAudioUpload"
    assert h3_inputs["ref_videos.ref_video_0"] == ["h3_reference_video_0", 0]
    assert h3_inputs["ref_video_audios.ref_video_audio_0"] == ["h3_reference_video_0", 2]
    assert h3_inputs["ref_audios.ref_audio_0"] == ["h3_reference_audio_0", 0]
    assert "<Video 1>" in h3_inputs["prompt"]
    assert "<Audio 1>" in h3_inputs["prompt"]
