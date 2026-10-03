# Laya backend

This service runs the supplied Laya SDK with actual English and multilingual checkpoints from `convaiinnovations/laya`, pinned to `55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`. Model loading must finish before `/healthz` returns ready. Failed loading does not activate a synthetic inference fallback.

## Deploy on an existing server

Use a Linux server with Docker Compose, at least 8 GB RAM and approximately 6 GB free disk for the image and cached weights. Point a domain's DNS at that server and allow ports 80 and 443. Model files download on the server's first startup and persist in the models volume; customers only install the APK.

```sh
cd backend
export LAYA_DOMAIN=laya.your-domain.example
docker compose up -d --build
curl --fail "https://$LAYA_DOMAIN/healthz"
```

Caddy obtains HTTPS certificates and forwards only to the private inference container. Configure this HTTPS address in Android Settings → Laya Feed Control, then allow metadata processing. The service processes video titles, creator names, comments and filtering preferences, not account credentials, frames or audio. Request access logging is disabled and inference results stay in a bounded, temporary memory cache.

The provided Compose deployment has no user account system. Its request size and IP rate limits suit a preview; capacity, authentication and operational monitoring need to be configured for a public production service. Domain and server access were not provided in this session, so this repository does not claim an existing deployed URL.

## API and verification

- `GET /healthz`: readiness after both checkpoints load.
- `POST /v1/evaluate`: one policy and 1–16 metadata items; returns decisions with reasons and engines.
- `POST /v1/policy/compile`: prompt plus current policy; returns updated, reviewable controls. Explicit English control syntax takes precedence over uncertain model interpretation.

```sh
python -m pip install -r requirements.txt pytest
python -m pytest tests -q
```

These tests validate policy and HTTP contracts using a named test double. They are separate from the real model startup and inference smoke checks under `../verification/`. CPU latency depends on metadata length and selected topics. More users require a service capacity plan.

Optional settings: `LAYA_CPU_THREADS` (default 4), `LAYA_DEVICE` (default CPU), `LAYA_MODEL_REVISION`, and `LAYA_EVIDENCE_FILE`. Evidence is a JSON mapping from exact content IDs to `source` HTTPS URL, `reason`, and Unix `expires` time. Only curated records can enable evidence-based false-claim decisions; default behavior leaves unsupported truth claims visible.
