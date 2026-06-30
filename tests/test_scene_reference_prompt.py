from novelvideo.generators.scene_reference_images import build_scene_reference_prompt
from novelvideo.models import NovelScene


def test_scene_reference_prompt_combines_base_prompt_for_variant_without_base_image():
    base_scene = NovelScene(
        name="卫生间",
        scene_type="interior",
        environment_prompt="白瓷砖墙面，正面是洗手台。",
    )
    variant_scene = NovelScene(
        name="卫生间_漏水",
        scene_type="interior",
        base_scene_id="卫生间",
        variant_id="漏水",
        variant_prompt="地面积水，天花板持续滴水。",
        environment_prompt="",
    )

    prompt = build_scene_reference_prompt(
        "master",
        variant_scene,
        base_scene=base_scene,
    )

    assert "白瓷砖墙面" in prompt
    assert "地面积水" in prompt


def test_scene_reference_prompt_keeps_variant_delta_out_of_scene_description():
    base_scene = NovelScene(
        name="城市街道",
        scene_type="exterior",
        environment_prompt="正面：深灰色双向车道。左侧：现代商业立面。",
    )
    variant_scene = NovelScene(
        name="城市街道_雨夜版",
        scene_type="exterior",
        base_scene_id="城市街道",
        variant_id="雨夜版",
        variant_prompt="下着小雨，地面湿润有积水，反射微弱路灯光。",
        environment_prompt="",
    )

    prompt = build_scene_reference_prompt(
        "master",
        variant_scene,
        base_scene=base_scene,
    )

    assert "VARIANT DELTA PROMPT:\n下着小雨" in prompt
    scene_description = prompt.split("SCENE DESCRIPTION:", 1)[1].split(
        "PROJECT STYLE PRESET:", 1
    )[0]
    assert "正面：深灰色双向车道" in scene_description
    assert "下着小雨" not in scene_description
    assert "地面湿润有积水" not in scene_description
