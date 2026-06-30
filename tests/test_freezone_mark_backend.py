from PIL import Image

from novelvideo.freezone.mark_node import build_mark_detection_task, crop_mark_focus_image


def test_build_mark_detection_task_includes_point() -> None:
    task = build_mark_detection_task(
        point_x=0.2,
        point_y=0.45,
    )
    assert "点击点归一化坐标" in task


def test_build_mark_detection_task_includes_box() -> None:
    task = build_mark_detection_task(
        box_x=0.1,
        box_y=0.2,
        box_width=0.3,
        box_height=0.25,
    )
    assert "框选区域归一化坐标" in task


def test_crop_mark_focus_image_returns_png_bytes(tmp_path) -> None:
    path = tmp_path / "mark.png"
    Image.new("RGB", (100, 100), color="white").save(path)
    data = crop_mark_focus_image(path, point_x=0.5, point_y=0.5)
    assert data.startswith(b"\x89PNG")
