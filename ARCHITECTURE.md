# aethinkAi Gateway architecture

Single-operator Node.js 22 HTTP server, a local SQLite store, static browser UI, AES-256-GCM upstream secrets, hashed client API keys, and ordered fallback across OpenAI-compatible upstream endpoints.

### MVP boundary

This is **not** a multi-tenant reseller platform. Streaming usage metering, billing, ledger, payments, workspaces, full SSRF defenses, production security audit and upstream format translation are not implemented.

### Routes

`/healthz`, `/readyz` are public health endpoints; `/admin/*` requires an authenticated administrator session except `/admin/login`; `/v1/*` requires an issued bearer API key.

## Release checklist

1. Run `npm run check && npm test`.
2. Generate `.env` via `npm run setup`, never commit it.
3. Configure a compatible upstream and route alias; create a client API key.
4. Test inference and SSE against a real authorized provider.
5. Run behind HTTPS reverse proxy with restricted admin access.
6. Do not sell access without multi-tenant isolation, durable quotas, accounting, and upstream contractual approval.
