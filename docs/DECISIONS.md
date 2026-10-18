# Decisions

Operating record for the branded operator presentation. One entry per decision
that a future maintainer would otherwise have to re-derive. Newest first.

## D-006 — The brand layer styles by element and role, never by guessed class name

**Context.** `branding/theme.css` is injected into a panel whose React source and
class names belong to an upstream project we do not control, and cannot inspect
from this repository.

**Decision.** The overlay is written in three deliberately separated layers:

1. `:root` custom properties — the design tokens (PRD §2.2). Nothing depends on
   a class name.
2. `:where(...)` element/role base — zero specificity, so any upstream utility
   class (0,1,0) wins wherever upstream expresses an intent.
3. `[data-aethink-*]` rules — only nodes this layer creates or explicitly opts in
   (`data-aethink-grid`, `data-aethink-signature`, `data-aethink-logo`).

**Consequence.** The overlay can restyle the shell without being able to break
it, and no upstream class name is ever asserted. Verified: a fixture element
carrying an upstream utility style keeps its own colour under the overlay
(`tests/branding.test.js`, browser check in `docs/IMPLEMENTATION-STATUS.md`).

## D-005 — No metric, health value or status is rendered by the branding layer

**Context.** The static reference (`design-reference/03-routing-signal.html`)
shows `99.98%`, `08 routes`, `412 ms`, and a green "SYSTEM ONLINE" pill. It is
sample data.

**Decision.** `branding/client.js` renders no number, no health state and no
connection indicator of its own. The preview harness uses `—` and "not
configured" placeholders so a reviewer can never mistake it for live data.

**Consequence.** Anything numeric on screen must come from a real backend
response. A status pill can be added later, but only reading a real health
endpoint — never a hardcoded string.

## D-004 — Motion preference is a first-class, persisted setting

**Decision.** The resolved motion mode is written to
`<html data-aethink-motion>` as `full | reduced | off`, stored in
`localStorage['aethink.motion']`, and defaults to following the OS. An explicit
operator choice wins over the OS in both directions. Page transitions animate
content opacity + 8 px rise only (PRD §2.4).

**Consequence.** Both the CSS override and the OS media query are honoured, and
`window.AethinkBrand.setMotion()` gives the future React console one place to
drive it.

## D-003 — The dev preview harness never reaches a deployment

**Decision.** `branding/preview/` is served only by
`node branding/preview/serve-preview.js`, which fronts a mock upstream with the
**real** `branding/gateway.js`. The gateway asset allowlist is fixed, so
`/brand/preview/*` is proxied to the panel and 404s.

**Consequence.** The overlay can be reviewed and regression-checked without a
live CliRelay/codeProxy container, and the mock panel cannot ship by accident.
Covered by a test.

## D-002 — Zero runtime and dev dependencies are preserved

**Decision.** The brand layer stays plain CSS + a dependency-free IIFE. The new
tests use `node:test`, `node:vm` and the global `fetch` only.

**Consequence.** `npm test` still runs on a bare checkout. The cost is that
runtime DOM behaviour is verified manually in a browser (recorded in
`docs/IMPLEMENTATION-STATUS.md`) rather than in CI; adding a DOM harness
(jsdom/Playwright) is a deliberate future trade, not an oversight.

## D-001 — Presentation-only navigation filtering is unchanged

**Decision.** `client.js` keeps hiding non-core rail entries with
`display: none`. This stays presentation only — CliRelay still enforces
authorization and permissions.

**Consequence.** Hiding a link is never treated as a security control, and the
README/UPSTREAM.md warning about that is retained.
