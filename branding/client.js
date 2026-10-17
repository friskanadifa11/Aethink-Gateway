(() => {
  'use strict';
  const PRODUCT = 'AethinkAI Gateway AI';
  const LOGO = '/brand/logo.svg';
  const routes = [
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

  function isCoreRoute(href) {
    try {
      const u = new URL(href, location.origin);
      if (u.origin !== location.origin) return false;
      return routes.some(p => u.pathname === p || u.pathname.startsWith(p + '/'));
    } catch {
      return true;
    }
  }

  function applyBranding() {
    if (document.title !== PRODUCT) document.title = PRODUCT;
    document.querySelectorAll('span[data-sidebar-logo]').forEach(el => {
      if (el.querySelector('img[data-aethink-logo]')) return;
      const icon = document.createElement('img');
      icon.src = LOGO;
      icon.alt = 'AethinkAI';
      icon.width = 30;
      icon.height = 30;
      icon.setAttribute('data-aethink-logo', 'true');
      el.replaceChildren(icon);
    });

    document.querySelectorAll('aside, [role="dialog"]').forEach(scope => {
      scope.querySelectorAll('span').forEach(el => {
        if (el.children.length) return;
        const label = (el.textContent || '').trim();
        if (label === 'CliRelay' || label === 'codeProxy' || label === 'CLI Proxy API') {
          el.textContent = PRODUCT;
          el.classList.add('aethink-brand');
        }
      });
    });

    // Presentation-only simplification. Backend privileges are still enforced by CliRelay.
    document.querySelectorAll('nav[aria-label]').forEach(nav => {
      nav.querySelectorAll('a[href]').forEach(link => {
        const display = isCoreRoute(link.getAttribute('href') || '') ? '' : 'none';
        if (link.style.display !== display) link.style.display = display;
      });
    });

    // Name is placed prominently without touching upstream actions or auth forms.
    const sidebar = document.querySelector('aside');
    if (sidebar && !sidebar.querySelector('[data-aethink-signature]')) {
      const signature = document.createElement('div');
      signature.setAttribute('data-aethink-signature', 'true');
      signature.textContent = 'AethinkAI Gateway AI';
      signature.title = PRODUCT;
      const anchor = sidebar.querySelector('nav');
      if (anchor) anchor.before(signature);
    }
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; applyBranding(); });
  };
  document.addEventListener('DOMContentLoaded', () => {
    applyBranding();
    new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true});
  });
})();
