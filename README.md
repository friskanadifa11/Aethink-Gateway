# AethinkAI Gateway AI

A focused, branded deployment of **[CliRelay](https://github.com/kittors/CliRelay)** (the actual Go AI gateway) and its official **[codeProxy](https://github.com/kittors/codeProxy)** management panel.

This project **replaces** the previous custom RIFT/Node gateway implementation. It is not a fake-dashboard demo and does not contain a separate competing proxy engine.

## What you get

- **Overview:** traffic, success rate and live system health from CliRelay.
- **Providers:** connect official API upstream providers and manage AI accounts.
- **Routing:** channel groups, models, scheduling and failover.
- **API Keys:** create and revoke credentials, quotas and limits.
- **Request Logs:** searchable requests, errors, token usage and latency.
- **Settings:** minimal essential gateway configuration.

The interface has AethinkAI's original SVG logo, AethinkAI Gateway AI branding, a restrained blue/cyan theme, responsive motion, and a focused sidebar. Extra upstream pages are only hidden in the branded operator presentation: permissions must still be enforced by CliRelay itself.

## Run on Ubuntu / Docker

Requirements: Docker Engine and Docker Compose v2, internet access to download official upstream images.

```bash
git clone https://github.com/vitacimin00/Aethink-Gateway.git
cd Aethink-Gateway
bash scripts/setup.sh
```

Open **http://localhost:8787/manage**, sign in with username **admin** and the generated password from `.env`:

```bash
grep '^CLIRELAY_ADMIN_PASSWORD=' .env
```

The public app-facing endpoint is `http://localhost:8787/v1` and management UI is `http://localhost:8787/manage`.

After signing in, add a provider through the existing management API, then create a portal/client API key. A new installation has **no permissive default API key**.

```bash
curl http://localhost:8787/v1/models -H 'Authorization: Bearer YOUR_CLIENT_KEY'
```

### Commands

```bash
docker compose ps
docker compose logs -f cli-proxy-api
docker compose restart cli-proxy-api
docker compose down
npm test            # proxy + branding contract tests (12)
npm run preview     # dev-only: overlay over a mock panel, no Docker needed
```

### Security notes

- The backend API's port 8317 is bound to **127.0.0.1** on the host; external traffic goes through the branded proxy on port 8787.
- Place HTTPS (Cloudflare Tunnel, Caddy, nginx) before exposing the proxy publicly. Don't publish a plaintext management login over the internet.
- The branding-sidecar is a streaming pass-through, not an authorization layer. Authentication and permissions belong to CliRelay.
- `remote-management.allow-remote` must be enabled for the internal container-to-container proxy, protected by CliRelay authentication and the non-public backend binding.
- Keep `.env`, `config.yaml`, `auths/`, `logs/`, `data/` and database files out of Git.
- Pin an immutable upstream image digest and do a security review before opening a paid public service.
- Selling upstream access requires approval under each AI provider's own terms.

## Design approach

The backend and the official codeProxy panel are sourced from upstream rather than copying hundreds of files into this repository. The branding service injects a small, readable AethinkAI layer into the original panel shell, while all actions remain backed by CliRelay. This preserves upstream protocol support and the built-in management workflows.

The brand layer follows the **"03 Signal / Routing-First"** direction from the
specification pack: dark navy/cyan operator console, mono type for identifiers
and endpoints, tabular figures for metrics, a dotted routing-canvas treatment,
and restrained motion.

It is written in three layers so it can restyle the shell without being able to
break it (see `docs/DECISIONS.md`, D-006):

| Layer | File | Specificity | Purpose |
|---|---|---|---|
| Design tokens | `branding/theme.css` (`:root`) | — | colours, radii, type, motion, layout constants |
| Element/role base | `branding/theme.css` (`:where(...)`) | **0** | typography, surfaces, controls, tables, focus rings, scrollbars |
| Owned chrome | `branding/theme.css` (`[data-aethink-*]`), `branding/client.js` | — | logo, product name, signature, rail marking, skip link |

Because the base layer is zero-specificity, every upstream utility class still
wins wherever the panel states its own intent — the overlay decorates the panel
instead of fighting it. Nothing in the layer renders a metric, health value or
status of its own; every number on screen must come from a real backend
response.

Motion follows the OS by default and can be pinned by the operator
(`full` / `reduced` / `off`); the resolved value is exposed on
`<html data-aethink-motion>` and driven through `window.AethinkBrand`.

**Limitation:** codeProxy explicitly says it has *not published a license file*. The codeProxy frontend is used as an upstream-hosted panel here, **not relicensed or redistributed as AethinkAI source**. Obtain the author's permission/license before commercially redistributing or modifying that frontend.

## Attribution

- CliRelay: `kittors/CliRelay`, MIT licensed. See [upstream LICENSE](https://github.com/kittors/CliRelay/blob/main/LICENSE).
- codeProxy management UI: `kittors/codeProxy`, license currently unspecified; see [upstream README](https://github.com/kittors/codeProxy#license).
- Brand assets: provided by the AethinkAI project owner.

## Compatibility and quality

`npm test` tests the branding proxy with a real local mock upstream for HTML injection, API passthrough and SSE. It does **not** prove the Docker image can start or that AI upstream credentials work. The upstream gateway requires Docker and PostgreSQL/Redis; validate those on the deployment host.

Version: **1.0.0-bootstrap**.
