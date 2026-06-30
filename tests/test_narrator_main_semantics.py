import pytest


@pytest.mark.asyncio
async def test_character_extraction_keeps_single_narrator_main(monkeypatch):
    from cognee.infrastructure.llm.LLMGateway import LLMGateway
    from novelvideo.cognee import pipeline
    from novelvideo.models import NovelCharacter

    class _Result:
        characters = [
            pipeline.CharacterEnrichment(name="桑落", role="主角", is_main=True, gender="女"),
            pipeline.CharacterEnrichment(name="楚寒", role="师尊", is_main=True, gender="男"),
            pipeline.CharacterEnrichment(name="林清清", role="师妹", is_main=False, gender="女"),
        ]

    async def fake_search(**kwargs):
        return [{"search_result": "桑落第一人称叙述，楚寒和林清清是关键角色。"}]

    async def fake_structured_output(*args, **kwargs):
        return _Result()

    monkeypatch.setattr("cognee.search", fake_search)
    monkeypatch.setattr(LLMGateway, "acreate_structured_output", fake_structured_output)

    characters = await pipeline.extract_characters_from_graph()

    assert [c.name for c in characters if c.is_main] == ["桑落"]
    assert all(isinstance(c, NovelCharacter) for c in characters)


def test_first_person_narrator_copy_uses_narrator_main_terms(tmp_path):
    from novelvideo.models import CharacterIdentity, NovelCharacter
    from novelvideo.seedance2_i2v.voice_clone import NARRATION_STYLES, resolve_narrator_source

    project_dir = tmp_path / "proj"
    voice_path = project_dir / "assets" / "characters" / "桑落" / "voices" / "voice_default.mp3"
    voice_path.parent.mkdir(parents=True)
    voice_path.write_bytes(b"voice")

    character = NovelCharacter(
        name="桑落",
        gender="女",
        is_main=True,
        reference_audio_path="assets/characters/桑落/voices/voice_default.mp3",
    )
    character.identities = [
        CharacterIdentity(
            identity_id="桑落_重生后",
            character_name="桑落",
            identity_name="重生后",
        )
    ]

    class _Store:
        def get_all_characters(self):
            return [character]

    store = _Store()
    store.project_dir = str(project_dir)
    resolution = resolve_narrator_source(
        store=store,
        narration_style="first_person",
        project_narrator_stored_path="",
    )

    assert resolution.source == "protagonist_identity"
    assert NARRATION_STYLES["first_person"]["label"] == "第一人称（解说主角视角）"
    assert "解说主角" in NARRATION_STYLES["first_person"]["prompt"]
