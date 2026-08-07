from __future__ import annotations

import io

import pytest
from PIL import Image

from novelvideo.generators.huimengi import validate_huimeng_media_download


def test_huimeng_image_download_requires_a_decodable_image() -> None:
    """A PNG signature alone must not allow corrupt image bytes into the pool."""
    with pytest.raises(RuntimeError, match="图片解码失败"):
        validate_huimeng_media_download(
            b"\x89PNG\r\n\x1a\nbroken image payload",
            "image/png",
            expected_media_type="image",
        )


def test_huimeng_image_download_accepts_a_complete_image() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buffer, format="PNG")

    validate_huimeng_media_download(
        buffer.getvalue(),
        "image/png",
        expected_media_type="image",
    )
