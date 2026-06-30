from novelvideo.task_backend.runners.identity import _build_identity_planner_result


def test_identity_runner_result_includes_auto_promoted_characters():
    result = _build_identity_planner_result(
        episode=1,
        new_count=2,
        resolved_count=3,
        identities=[
            {
                "character_name": "陆辰",
                "identity_id": "陆辰_默认",
                "identity_name": "默认",
                "appearance_details": "",
            }
        ],
        auto_promoted_characters=["陆辰"],
    )

    assert result == {
        "episode": 1,
        "new_count": 2,
        "resolved_count": 3,
        "identities": [
            {
                "character_name": "陆辰",
                "identity_id": "陆辰_默认",
                "identity_name": "默认",
                "appearance_details": "",
            }
        ],
        "auto_promoted_characters": ["陆辰"],
    }
