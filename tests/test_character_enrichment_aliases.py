from novelvideo.cognee.pipeline import CharacterEnrichment


def test_character_enrichment_normalizes_missing_aliases() -> None:
    assert CharacterEnrichment(name="A", aliases=None).aliases == []
    assert CharacterEnrichment(name="A", aliases="").aliases == []


def test_character_enrichment_normalizes_scalar_alias() -> None:
    assert CharacterEnrichment(name="A", aliases=" Alias ").aliases == ["Alias"]


def test_character_enrichment_preserves_alias_list() -> None:
    assert CharacterEnrichment(name="A", aliases=["Alias A", "Alias B"]).aliases == [
        "Alias A",
        "Alias B",
    ]
