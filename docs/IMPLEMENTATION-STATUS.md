# Implementation status

Scope of this branch: **`rebuild/signal-mvp` — operator-presentation (UI/UX) work
only.** No gateway, protocol, database or authentication behaviour is changed by
this branch.

## What changed

| File | Change |
|---|---|
| `branding/theme.css` | Rewritten as a layered design system: PRD §2.2 tokens, `:where()` zero-specificity element base, branded chrome, dark `color-scheme`, reduced-motion + explicit override, responsive rules. |
| `branding/client.js` | Rewritten: brand/logo/nav behaviour kept; added accessible names for icon-only links, current-destination marking, skip link, persisted motion preference, SPA navigation hooks, debounced idempotent passes, `window.AethinkBrand` API. |
| `branding/preview/panel-preview.html` | New dev-only harness: a mock panel with the DOM shape the overlay targets. |
| `branding/preview/serve-preview.js` | New dev-only runner: mock upstream behind the real gateway. |
| `tests/branding.test.js` | New: 9 contract tests for the assets and the overlay. |
| `docs/DECISIONS.md`, `docs/IMPLEMENTATION-STATUS.md` | New. |
| `README.md` | Design-layer section updated. |

## Commands actually run and their results

```
node -v                         -> v18.19.1   (package.json asks for >=22; see blocker B-1)
node --check branding/client.js -> OK
node --check branding/gateway.js-> OK
node --check branding/preview/serve-preview.js -> OK

npm test (before this branch)   -> 3 pass, 0 fail
npm test (this branch)          -> 12 pass, 0 fail   (9 new)
```
## Browser verification (manual, real proxy, not simulated)

Method — the harness is loaded **through the real branding proxy**, so the
injection path under test is the production path:

```
node branding/preview/serve-preview.js --port 8788
# then browse http://127.0.0.1:8788/manage
```

Observed on `/dashboard`:

| Check | Result |
|---|---|
| Branding assets injected before `</head>` | `theme.css`, `client.js`, `logo.svg` all inside `<head>` |
| Asset content types | `text/css`, `application/javascript`, `image/svg+xml`, all with `nosniff` |
| Document title | set to `AethinkAI Gateway AI` |
| Upstream product label rewritten | `CliRelay` -> `AethinkAI Gateway AI` (leaf-text match, `aethink-brand` applied) |
| Logo injected into the sidebar slot | loaded, intrinsic size 150 px |
| Rail filtering | 9 core routes visible; `Billing`, `Resellers`, `Organizations`, `Playground`, `Account Market`, external link hidden |
| Current destination marked | `/dashboard` -> `aria-current="page"` + `data-aethink-current="true"` (1 match) |
| Skip link | present, targets `#aethink-main`, `main` given that id |
| `color-scheme` | `dark` (native controls/scrollbars render dark) |
| Body font | Inter -> Plus Jakarta Sans -> system stack |
| Dotted routing canvas | `radial-gradient(#193348 1px, …)` applied on the opted-in node only |
| Health dot / meter tokens | `rgb(67,197,163)` success, meter fill cyan |
| Motion API | `setMotion('reduced')` -> `reduced`, `'full'` -> `full`, `'system'` -> `full` (OS: no-reduce) |
| Upstream utility preserved | fixture element keeps its own colour under the overlay — proves the `:where()` layer does not win |
| `window.AethinkBrand` | exposed (`object`) |

Horizontal-overflow sweep (PRD §2.3 / §1.4 acceptance widths), measured as
`documentElement.scrollWidth > clientWidth` **and** no element crossing the
viewport edge:

| Viewport | clientW | scrollW | Overflow | Elements past the edge |
|---|---|---|---|---|
| 1440x900 | 1430 | 1430 | no | none |
| 1280x800 | 1270 | 1270 | no | none |
| 768x1024 | 758 | 758 | no | none |
| 390x844 | 390 | 390 | no | none |

> Note on the 🐴 emoji: the browser automation harness prefixes every page title
> on navigation. Confirmed against a foreign `data:` URL page, so it is a
> harness artefact, not the brand layer. The served HTML title is clean.

## Not verified here (must not be claimed as passing)

- **Against a live CliRelay/codeProxy container.** No Docker image was pulled.
  All runtime verification used the mock panel via the real proxy.
- **The upstream panel's own class names and DOM.** The overlay is deliberately
  class-agnostic (D-006); a visual diff against a running panel is still owed.
- **Keyboard-only traversal of a real workflow, screen-reader output, and a
  computed contrast audit.** The a11y affordances exist and are unit-checked at
  the contract level, but no assistive-technology pass has been run.
- **Provider connectivity, routing correctness, streaming, Postgres/Redis.**
  Out of scope for this branch.

## Blockers

- **B-1 — local runtime is older than the declared engine.** `package.json`
  requires `engines.node >= 22` and CI pins `node-version: '22'`, but the machine
  used for this verification has `v18.19.1`. All results above were produced on
  18.19.1. `npm test` passes there using only stable APIs
  (`node:test`, `node:vm`, global `fetch`), so 22 is expected to pass — but that
  has **not been observed**. Confirm on Node 22 (CI, or `nvm use 22`) before
  treating the suite as proven.

## Suggested next steps

1. Confirm `npm test` on Node 22 (CI will do it on the PR; see B-1).
2. Run the harness against a real CliRelay/codeProxy image and do a visual diff
   of the six pages.
3. Capture acceptance screenshots per page once (2) is possible — screenshots of
   the mock panel would not satisfy PRD §2.4, so none are committed here.
4. Decide whether motion preference belongs in Settings (FR-UI-07) or stays a
   local-only preference; the storage key and API are ready either way.
