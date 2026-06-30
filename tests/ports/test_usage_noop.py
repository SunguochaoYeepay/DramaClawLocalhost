import pytest

from novelvideo.ports.local.usage import NoOpProviderInstrumentation, NoOpUsageMeter


@pytest.mark.asyncio
async def test_noop_usage_meter_matches_disabled_semantics() -> None:
    meter = NoOpUsageMeter()

    reservation = await meter.reserve_current_model_call_credit(model="gpt-test")
    await meter.refund_model_call_credit_reservation(reservation)
    await meter.bump_model_call(user_id="u1", model="gpt-test")
    meter.set_llm_usage_context("u1", project_id="proj-1", resource_kind="script")
    meter.clear_llm_usage_context()
    await meter.set_project_llm_usage_context(username="alice", project_name="demo")

    assert reservation == ""
    assert await meter.get_user_credit_balance("u1") == 0


def test_noop_provider_instrumentation_is_idempotent() -> None:
    instrumentation = NoOpProviderInstrumentation()
    instrumentation.install()
    instrumentation.install()
