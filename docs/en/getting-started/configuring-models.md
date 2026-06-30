<!-- lang-switch -->
**English** · [简体中文](../../zh/getting-started/configuring-models.md)

# Configuring Model Providers

> The several ways to connect models; how to map the roughly 30 `*_MODEL` logical model names when going BYO / local.

DramaClaw connects to all text/image/video/audio models through a single OpenAI-compatible gateway. The recommended setup is the DramaClaw official gateway (RelayClaw) + a DC key — **paste it in the web UI and you're done**; bringing your own gateway or self-hosting a fully local one is also supported.

## A. DC official key (recommended, simplest)

The default `docker-compose.yml` already routes models through the "Official Channel". After `docker compose up -d --build` is running:

1. Open **`http://localhost:8080`** in your browser and go to Settings → **Model Configuration → Official Channel**.
2. The gateway address is already prefilled as `https://relayclaw.cdnfg.com/v1` (from `.env`); **paste your DC key** and click "Save and Enable".
3. It works immediately — RelayClaw has all of DramaClaw's logical models configured on its backend, so **no `*_MODEL` mapping is required**.

> Don't have a DC key yet? Sign up / purchase at **<https://relayclaw.cdnfg.com>**.

You can also skip the web UI and set it directly in `.env` (headless/CI-friendly):

```bash
NEWAPI_BASE_URL=https://relayclaw.cdnfg.com/v1
NEWAPI_API_KEY=your_DC_key
```

## B. Bring your own gateway (BYO)

Already have your own OpenAI-compatible gateway (including a self-hosted newAPI)? In the same **Official Channel** panel (or in `.env`), replace the address with your gateway:

```bash
NEWAPI_BASE_URL=https://your-gateway/v1
NEWAPI_API_KEY=your_token
```

BYO requires you to map the logical model names yourself (see below).

## C. (Advanced) Fully local built-in newapi

Fully local with no dependency on an external gateway: use the selfhosted orchestration, which additionally brings up a built-in `newapi` container:

```bash
docker compose -f docker-compose.selfhosted.yml up -d --build
```

On first start, go to `http://localhost:3000` to register an admin and configure upstream channels and tokens (or initialize it in the web UI under "Model Configuration → Custom NewAPI"), then put the token back into `NEWAPI_API_KEY` in `.env`. See the [Self-Hosting Handbook](../guides/self-hosting.md) for details.

### Mapping logical model names (required for B / C)

`.env.example` has roughly 30 `*_MODEL` entries that use logical names (e.g. `HERMES_MODEL=DC-hermes-LLM`, `SCENE_BUILD_MODEL=DC-scene-builder-LLM`). Two ways to handle them:

1. **Configure same-named logical models on your gateway's backend** (recommended, leaves `.env` nearly untouched); or
2. **Change each `*_MODEL` to a model name your gateway actually provides.**

Grouped by purpose: text (Hermes/Cognee/the various planners/normalizers, etc.), image (`NEWAPI_IMAGE_MODEL`, `NEWAPI_NANOBANANA2_MODEL` and the various `*_IMAGE_*`), video (`VIDEO_BACKEND`, `NEWAPI_VIDEO_MODELS`…), audio (`INDEXTTS2_NEWAPI_MODEL`).

> When using a DC official key (A), skip this section — RelayClaw already has everything configured.

### Reference media (optional)

If you use "upload reference image", you need to configure an OSS relay (`OSS_RELAY_ENDPOINT/BUCKET/AK/SK`); plain-text workflows can leave it unconfigured for now.
