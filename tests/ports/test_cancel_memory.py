import pytest

from novelvideo.ports.local.tasks import InMemoryCancellationStore
from novelvideo.ports.tasks import cancel_key


def test_cancel_key_matches_existing_shape() -> None:
    assert (
        cancel_key(
            project_id="p1",
            task_type="render",
            episode=2,
            beat_num=3,
            scope="scene",
            task_id="t1",
        )
        == "task:cancel:p1:render:2:3:scene:t1"
    )


@pytest.mark.asyncio
async def test_memory_cancellation_store_can_write_read_and_isolate_keys() -> None:
    store = InMemoryCancellationStore()

    await store.request_cancel(
        project_id="p1",
        task_type="render",
        episode=2,
        task_id="t1",
        beat_num=3,
    )

    assert await store.is_cancel_requested(
        project_id="p1",
        task_type="render",
        episode=2,
        task_id="t1",
        beat_num=3,
    )
    assert not await store.is_cancel_requested(
        project_id="p1",
        task_type="render",
        episode=2,
        task_id="different",
        beat_num=3,
    )
