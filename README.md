# aethinkAi Gateway

A **working self-hosted AI gateway** with a custom, animated operator dashboard. Designed as an independent implementation (not a 9Router fork), with OpenAI-compatible upstreams, stable model aliases, ordered fallback, SSE passthrough, key management, SQLite-backed telemetry, and an installable Docker image.

*Visual style: editorial dark console, animated UI. Live installations show actual database metrics.*

> **Status: functional single-operator MVP, not a production commercial SaaS.** Does not include multi-tenant isolation, billing, paid top-ups, durable multi-instance rate limiting, org RBAC, centralized metrics, or provider-specific format translation. Do not sell API access on the assumption that these features exist.

## Quick start (Node.js 22.16+)

**Windows:** double-click `RUN-WINDOWS.cmd` after installing Node.js 22.16+, or use the commands below.

```bash
npm run setup      # generates random secrets + prints a one-time admin password
npm start
```

Open **http://127.0.0.1:8787**, sign in with the password printed by `npm run setup`.

**No `npm install` required** for the Node.js version: all server dependencies are built into Node.

1. Go to **Providers → Add provider**: enter a name, OpenAI-compatible base URL (e.g. `https://api.openai.com/v1`) and valid API key. Use **Test** to verify `/models`.
2. **Routing studio → New route**: create an alias such as `smart-chat`, set provider and upstream model id, and add optional fallback candidates.
3. **API keys → Create key**: copy the key once (it cannot be recovered).
4. In your client use base URL `http://127.0.0.1:8787/v1`, bearer key `aet_...`, and model `smart-chat`.

### Example curl

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer YOUR_AETHINKAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"smart-chat","messages":[{"role":"user","content":"Hello"}]}'
```

### OpenAI SDK

```js
import OpenAI from 'openai';
const client = new OpenAI({
  apiKey: process.env.AETHINKAI_API_KEY,
  baseURL: 'http://127.0.0.1:8787/v1'
});
const response = await client.chat.completions.create({
  model: 'smart-chat',
  messages: [{role: 'user', content: 'Hello!'}]
});
console.log(response.choices[0].message.content);
```

### Available endpoints

| Path | Behavior |
| --- | --- |
| `GET /healthz`, `GET /readyz` | Liveness and readiness |
| `GET /v1/models` | Returns aliases accessible to the API key |
| `POST /v1/chat/completions` | JSON and true SSE streaming proxy |
| `POST /v1/embeddings` | Compatible pass-through to capable upstream |
| `POST /v1/responses` | Raw pass-through to an upstream supporting Responses API |
| `/admin/*` | Admin-only authenticated console APIs |

**Compatibility limitations:** Upstreams must support the *same* OpenAI-compatible endpoint and payload shape as the client. aethinkAi replaces `model` with the configured upstream model id and forwards the rest of the request. It does not translate Anthropic Messages ↔ OpenAI Chat, handle provider-specific OAuth subscriptions, transcode streaming formats, or normalize proprietary parameters. For chat fallback, only retryable status codes `408/409/429/5xx` and network failures trigger another candidate. Requests never retry after streaming output starts.

### Streaming and usage accounting

SSE response bytes are relayed with backpressure and cancellation; token counts for streaming requests are currently **not parsed** and show `0` in the dashboard. Non-streaming requests use upstream `usage` fields when present. These are operational estimates, **not a commercial billing ledger**.

## Deploy with Docker

```bash
npm run setup          # creates .env first
# Edit .env: change HOST=127.0.0.1 to HOST=0.0.0.0 for the container
# (the compose mapping binds port 8787 only on the host loopback)
docker compose up -d --build
```

Dashboard: `http://127.0.0.1:8787`. Put a trusted HTTPS reverse proxy or Cloudflare Tunnel in front before external access. If proxied over HTTPS, set `TRUST_PROXY_HTTPS=true` so the admin cookie includes `Secure`. Never expose an unencrypted public admin console. Pin the encryption key; losing it makes stored upstream credentials unrecoverable.

## Security defaults

- Random 256-bit API keys stored as SHA-256 hashes; upstream credentials encrypted with AES-256-GCM.
- Admin password and encryption/session secrets loaded via `.env`; `npm run setup` generates strong random values and refuses overwrite.
- Admin session is HttpOnly, SameSite=Strict, signed, with an 8-hour expiry; origin check on cross-origin mutating requests.
- `GET /v1/models` and inference endpoints require bearer authorization; per-key RPM is enforced in-memory (single-instance only).
- HTTPS-only upstream URLs by default; `ALLOW_HTTP_UPSTREAM=true` is meant **only** for a locally trusted development environment.
- No stored raw request bodies, prompts, upstream response text, provider keys, or plaintext client tokens in request logs.
- CSP and `nosniff` headers; upstream redirects disabled.

**Remaining risks before exposing publicly:** upstream URL DNS validation / SSRF hardening, persistent/distributed rate limiting, stronger interactive administrator authentication (e.g. 2FA), external audit, robust attack/load testing, object-level authorization for multi-tenant usage, observability export, safe migrations/backups, application-layer cost controls, provider contractual review. No customer billing is implemented.

## Tests

```bash
npm run check
npm test
```

The suite uses **local mock upstream HTTP servers**, not real provider credentials. Tests cover model listing, API key creation/revocation, routing fallback on 503, JSON completions, embedding passthrough, SSE passthrough, encrypted secrets, and database request logs.

## Project repository

Source of truth: **https://github.com/vitacimin00/Aethink-Gateway**.

Clone with `git clone https://github.com/vitacimin00/Aethink-Gateway.git` and configure `.env` through `npm run setup` before starting.

Never commit real credentials, `.env`, database files, or local session cookies.

## Project layout

```text
public/      custom animated dashboard, CSS + browser JS
src/         HTTP gateway, SQLite tables, crypto and request proxy
scripts/     secure first-time environment setup
tests/       integration tests using mock providers
.github/     CI
Dockerfile   container image
compose.yaml Docker deployment
```

## Commercial next steps (not implemented yet)

Multi-tenant PostgreSQL/RBAC → durable quota and rate limiting → immutable usage ledger → pricing versions → sandbox payments and idempotent webhooks → isolation tests → security review → infrastructure and availability SLAs. **Do not re-use consumer subscriptions as resale capacity unless explicitly permitted by each upstream provider's agreement.**

## License

MIT. This is original gateway code, built separately from 9Router. Dashboard is intentionally custom and not an image-based mockup.
