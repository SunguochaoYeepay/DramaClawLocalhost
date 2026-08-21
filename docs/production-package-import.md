# Structured Production Package Import

The Freezone canvas includes **导入结构化制作包**. This path validates and
imports `ai-drama.production.v1` JSON as-is and does not call DeepSeek, Cognee,
or any other AI analysis service.

## API

- `POST /api/v1/projects/{project}/freezone/production-package/preview`
- `POST /api/v1/projects/{project}/freezone/production-package/import`

The UI supports selecting a `.json` file or pasting JSON. Import is enabled only
after preview succeeds and no character, dialogue, audio, location, or prop
resource references are missing. Reusing the same `source_package_id` updates
the existing stable canvas graph and preserves generated URLs, node positions,
review decisions, and failure details.

Top-level `locations[]` entries become reusable scene-reference image nodes.
Top-level `assets[]` entries with `role: "prop_reference"` become reusable prop
image nodes. Missing URLs intentionally produce visible `待生成` nodes using
`qwen_prompt` / `flux_prompt` for locations and `generation_prompt` for props.
Shot-level `location_reference_asset` and `prop_reference_assets` IDs connect
those nodes to the shot's keyframe and video generation nodes.

When a location defines `reference_asset_id`, that ID links its matching
top-level `role: "location_plate"` asset and becomes the stable scene-node ID.
Both the location `id` and `reference_asset_id` resolve to that same reusable
node, so re-importing the package cannot duplicate the scene reference.

## Review flow

Imported scenes are group nodes containing shot, keyframe, audio, and video
nodes. Keyframe nodes use the existing local `comfyui_qwen_image` image path.
The existing video APIs use the existing H3 backend and reject a Codex video
node until its designated upstream keyframe has an image. Scene or prop images
do not satisfy that requirement by themselves; review status remains optional
editorial metadata.

The minimal acceptance fixture is
`tests/fixtures/production_package_minimal.json`.
