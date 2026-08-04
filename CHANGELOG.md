# Changelog

## 1.1.2 - 2026-08-04

### Added

- Added Docker Desktop on Windows deployment support for the hybrid local/remote setup.
- Added `docker-compose.windows.yml` with fixed image tags and host ComfyUI routing.
- Added persistent Docker output routing to `/data/output`.
- Added configurable Debian and Python package mirrors for reliable builds in restricted networks.

### Deployment

- API image: `dramaclaw-api:33cb312`
- Web image: `dramaclaw-web:33cb312`
- ComfyUI remains on the Windows host at `host.docker.internal:8188`.
- DashScope/Bailian, HuiMeng, and Cloudinary runtime configuration remains supplied through `.env`.
- The Windows deployment does not start NewAPI.

### Verification

- API health endpoint returned HTTP 200.
- Web reverse proxy returned HTTP 200.
- Container-to-host ComfyUI connectivity returned HTTP 200.
- No paid third-party generation calls were made during deployment verification.
