# Structured Production Package Import

The Freezone canvas includes **导入结构化制作包**. This path validates and
imports `ai-drama.production.v1` JSON as-is and does not call DeepSeek, Cognee,
or any other AI analysis service.

## API

- `POST /api/v1/projects/{project}/freezone/production-package/preview`
- `POST /api/v1/projects/{project}/freezone/production-package/import`

The UI supports selecting a `.json` file or pasting JSON. Import is enabled only
after preview succeeds and no character, dialogue, or audio resource references
are missing. Reusing the same `source_package_id` updates the existing stable
canvas graph and preserves generated URLs, review decisions, and failure details.

## Review flow

Imported scenes are group nodes containing shot, keyframe, audio, and video
nodes. Keyframe nodes use the existing local `comfyui_qwen_image` image path.
After a keyframe is generated, use **审核通过** or **驳回关键帧** on the node.
The existing video APIs use the existing H3 backend, but reject a Codex video
node until an upstream keyframe has an image and `reviewStatus=approved`.

The minimal acceptance fixture is
`tests/fixtures/production_package_minimal.json`.
