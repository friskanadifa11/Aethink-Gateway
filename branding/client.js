'use strict';
/**
 * AethinkAI Gateway AI — brand + operator-UX layer.
 *
 * Injected into every HTML response by branding/gateway.js, on top of the
 * upstream management panel. It only ever:
 *   1. re-labels the shell (logo, product name, navigation presentation),
 *   2. adds accessibility the upstream shell does not ship (accessible names,
 *      skip link, current-destination marking), and
 *   3. applies the operator's motion preference.
 *
 * It never renders a metric, health figure or status of its own. Anything a
 * number on screen claims must come from a real backend response, so this
 * layer fabricates nothing (PRD §0.4, FR-UI-02 AC).
 *
 * Public API: window.AethinkBrand = { refresh, setMotion, getMotion }.
 */
(() => {
  const PRODUCT = 'AethinkAI Gateway AI';
  const LOGO = '/brand/logo.svg';

  /* Destinations kept in the operator presentation. Everything else stays in
     the DOM (and therefore keeps working) but is hidden from the rail.
     This is presentation only — CliRelay still enforces permissions. */
  const CORE_ROUTES = [
    '/dashboard',
    '/runtime/monitor',
    '/runtime/request-logs',
    '/access/ai-providers',
    '/access/ai-accounts',
    '/access/api-keys',
    '/models/channel-groups',
    '/models/catalog',
    '/system/config',
  ];

  const UPSTREAM_NAMES = ['CliRelay', 'codeProxy', 'CLI Proxy API'];

  /* Elements safe to re-label: a leaf node (no element children) whose entire
     text is an upstream product name. Restricting to leaf nodes keeps this
     from clobbering a container that merely mentions the name. */
  const LABEL_TAGS = new Set([
    'SPAN', 'DIV', 'B', 'STRONG', 'P', 'LABEL', 'SMALL', 'I', 'EM',
    'H1', 'H2', 'H3', 'H4', 'A',
  ]);
  const LABEL_SCOPE = 'aside, header, [role="dialog"], nav';

  const MOTION_KEY = 'aethink.motion';       // 'system' | 'full' | 'reduced' | 'off'
  const MOTION_VALUES = ['system', 'full', 'reduced', 'off'];

  /* ── motion preference ──────────────────────────────────────────────── */

  function readStoredMotion() {
    try {
      const value = window.localStorage.getItem(MOTION_KEY);
      return MOTION_VALUES.includes(value) ? value : 'system';
    } catch {
      return 'system'; // private mode / storage disabled
    }
  }

  function prefersReduced() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  /** Resolve the operator's choice to the value written on <html>. */
  function effectiveMotion(choice) {
    if (choice === 'system') return prefersReduced() ? 'reduced' : 'full';
    return choice;
  }

  function applyMotion(choice) {
    const resolved = effectiveMotion(choice);
    const root = document.documentElement;
    if (root.getAttribute('data-aethink-motion') !== resolved) {
      root.setAttribute('data-aethink-motion', resolved);
    }
    root.setAttribute('data-aethink-motion-pref', choice);
    return resolved;
  }

  function setMotion(choice) {
    const value = MOTION_VALUES.includes(choice) ? choice : 'system';
    try { window.localStorage.setItem(MOTION_KEY, value); } catch { /* ignore */ }
    return applyMotion(value);
  }

  const getMotion = readStoredMotion;

  /* ── navigation helpers ─────────────────────────────────────────────── */

  function isCoreRoute(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return false;
      return CORE_ROUTES.some(
        (path) => url.pathname === path || url.pathname.startsWith(path + '/'),
      );
    } catch {
      return true; // unparseable href: leave it visible rather than hide it
    }
  }

  function routeKey(pathname) {
    // Longest core route that prefixes the current path, so nested pages
    // still light up their parent rail entry.
    let best = null;
    for (const path of CORE_ROUTES) {
      if (pathname === path || pathname.startsWith(path + '/')) {
        if (!best || path.length > best.length) best = path;
      }
    }
    return best;
  }

  /** Give icon-only rail links a real accessible name and a tooltip. */
  function nameIconLinks(link) {
    if (link.getAttribute('data-aethink-icon-link') === 'true') return;
    const text = (link.querySelector('span')?.textContent || '').trim();
    const label = text || link.getAttribute('title') || link.getAttribute('aria-label');
    if (!label) return; // nothing trustworthy to name it with — leave untouched
    if (!link.getAttribute('aria-label')) link.setAttribute('aria-label', label);
    if (!link.getAttribute('title')) link.setAttribute('title', label);
    link.setAttribute('data-aethink-icon-link', 'true');
  }

  function markCurrentRoute() {
    const key = routeKey(location.pathname);
    document.querySelectorAll('nav a[href]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      let target = null;
      try { target = new URL(href, location.origin).pathname; } catch { /* ignore */ }
      const isCurrent = Boolean(key && target && routeKey(target) === key);
      if (isCurrent) {
        if (link.getAttribute('aria-current') !== 'page') link.setAttribute('aria-current', 'page');
        if (link.getAttribute('data-aethink-current') !== 'true') link.setAttribute('data-aethink-current', 'true');
      } else if (link.hasAttribute('data-aethink-current')) {
        link.removeAttribute('data-aethink-current');
        link.removeAttribute('aria-current');
      }
    });
  }

  function ensureSkipLink() {
    if (document.querySelector('.aethink-skip-link')) return;
    const main = document.querySelector('main, [role="main"]');
    if (!main) return;
    if (!main.id) main.id = 'aethink-main';
    const link = document.createElement('a');
    link.className = 'aethink-skip-link';
    link.href = '#' + main.id;
    link.textContent = 'Skip to content';
    document.body.insertBefore(link, document.body.firstChild);
  }

  /* ── branding passes ────────────────────────────────────────────────── */

  function applyLogo() {
    document.querySelectorAll('span[data-sidebar-logo]').forEach((slot) => {
      if (slot.querySelector('img[data-aethink-logo]')) return;
      const icon = document.createElement('img');
      icon.src = LOGO;
      icon.alt = 'AethinkAI';
      icon.width = 30;
      icon.height = 30;
      icon.setAttribute('data-aethink-logo', 'true');
      slot.replaceChildren(icon);
    });
  }

  function applyProductName() {
    if (document.title !== PRODUCT) document.title = PRODUCT;
    document.querySelectorAll(LABEL_SCOPE).forEach((scope) => {
      scope.querySelectorAll('span, div, b, strong, p, label, small, i, em, h1, h2, h3, h4, a')
        .forEach((el) => {
          if (el.children.length) return;                 // container, not a label
          if (el.querySelector('img, svg, picture')) return;
          if (!LABEL_TAGS.has(el.tagName)) return;
          if (!UPSTREAM_NAMES.includes((el.textContent || '').trim())) return;
          el.textContent = PRODUCT;
          el.classList.add('aethink-brand');
        });
    });
  }

  function ensureSignature() {
    const sidebar = document.querySelector('aside');
    if (!sidebar || sidebar.querySelector('[data-aethink-signature]')) return;
    const signature = document.createElement('div');
    signature.setAttribute('data-aethink-signature', 'true');
    signature.textContent = PRODUCT;
    signature.title = PRODUCT;
    const anchor = sidebar.querySelector('nav');
    if (anchor) anchor.before(signature);
    else sidebar.appendChild(signature);
  }

  function applyNavigation() {
    document.querySelectorAll('nav[aria-label], nav').forEach((nav) => {
      nav.querySelectorAll('a[href]').forEach((link) => {
        const wanted = isCoreRoute(link.getAttribute('href') || '') ? '' : 'none';
        if (link.style.display !== wanted) link.style.display = wanted;
        if (wanted === '') nameIconLinks(link);
      });
    });
  }

  /* ── orchestration ──────────────────────────────────────────────────── */

  let scheduled = false;
  let lastPath = location.pathname;

  function applyBranding() {
    try {
      document.documentElement.setAttribute('data-aethink', 'ready');
      applyLogo();
      applyProductName();
      ensureSignature();
      applyNavigation();
      markCurrentRoute();
      ensureSkipLink();
    } catch (error) {
      // A branding failure must never break the panel. Report and continue.
      console.warn('[aethink] branding pass failed', error);
    }
  }

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyBranding();
    });
  };

  /** Trigger the page-change motion, then clear the marker. */
  function enterPage() {
    const root = document.documentElement;
    root.removeAttribute('data-aethink-page');
    // Force a reflow so the animation restarts on a path change.
    void root.offsetWidth;
    root.setAttribute('data-aethink-page', 'enter');
    window.setTimeout(() => root.removeAttribute('data-aethink-page'), 400);
  }

  function onNavigate() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    enterPage();
    schedule();
  }

  /** Wrap history so in-app navigation is noticed without polling. */
  function watchHistory() {
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      if (typeof original !== 'function' || original.__aethinkWrapped) continue;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        onNavigate();
        return result;
      };
      wrapped.__aethinkWrapped = true;
      history[method] = wrapped;
    }
    window.addEventListener('popstate', onNavigate);
  }

  function init() {
    applyMotion(readStoredMotion());
    applyBranding();
    watchHistory();
    enterPage();

    // Re-apply after the panel hydrates. Debounced, and the passes are
    // idempotent, so this stays cheap even on a busy DOM.
    if (document.body) {
      new MutationObserver(schedule).observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    try {
      window.matchMedia('(prefers-reduced-motion: reduce)')
        .addEventListener('change', () => {
          if (readStoredMotion() === 'system') applyMotion('system');
        });
    } catch { /* older engines: OS preference is read at load time only */ }

    window.AethinkBrand = { refresh: applyBranding, setMotion, getMotion };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
