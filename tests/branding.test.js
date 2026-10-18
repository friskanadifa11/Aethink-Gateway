'use strict';
/**
 * Branding-layer contract tests.
 *
 * The existing proxy.test.js proves the reverse proxy forwards correctly.
 * These tests prove the layer that decorates the panel is still the layer we
 * intend to ship: the right assets are served, they stay inside the design
 * contract, and the dev preview harness cannot leak into a deployment.
 *
 * No new dependencies: the project is intentionally zero-dependency, so the
 * CSS/JS checks are static contract checks rather than a DOM harness.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGateway } = require('../branding/gateway');

const BRANDING = path.join(__dirname, '..', 'branding');
const themeCss = fs.readFileSync(path.join(BRANDING, 'theme.css'), 'utf8');
const clientJs = fs.readFileSync(path.join(BRANDING, 'client.js'), 'utf8');

/* Structural checks must ignore commentary, which may legitimately quote the
   very pattern being forbidden. */
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const themeRules = stripCssComments(themeCss);

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

async function withProxy(fn) {
  const upstream = http.createServer((req, res) => {
    if (req.url && req.url.startsWith('/manage')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html><head><title>codeProxy</title></head><body><aside></aside></body></html>');
    } else {
      res.writeHead(404);
      res.end('missing');
    }
  });
  const upstreamPort = await listen(upstream);
  const gateway = createGateway(`http://127.0.0.1:${upstreamPort}`);
  const gatewayPort = await listen(gateway);
  try {
    await fn(`http://127.0.0.1:${gatewayPort}`);
  } finally {
    await new Promise((r) => gateway.close(r));
    await new Promise((r) => upstream.close(r));
  }
}

test('branding assets are served with correct types and cache headers', async () => {
  await withProxy(async (base) => {
    const expected = {
      '/brand/logo.svg': 'image/svg+xml',
      '/brand/theme.css': 'text/css',
      '/brand/client.js': 'application/javascript',
    };
    for (const [asset, type] of Object.entries(expected)) {
      const res = await fetch(base + asset);
      assert.equal(res.status, 200, `${asset} should be 200`);
      assert.ok(
        String(res.headers.get('content-type')).includes(type),
        `${asset} content-type includes ${type}`,
      );
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.match(res.headers.get('cache-control'), /max-age=/);
      assert.ok(Number(res.headers.get('content-length')) > 0, `${asset} has a length`);
    }
  });
});

test('assets answer HEAD with headers but no body', async () => {
  await withProxy(async (base) => {
    const res = await fetch(base + '/brand/theme.css', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.ok(Number(res.headers.get('content-length')) > 0);
    assert.equal((await res.text()).length, 0);
  });
});

test('the dev preview harness is never served by the gateway', async () => {
  await withProxy(async (base) => {
    for (const p of ['/brand/preview/panel-preview.html', '/brand/preview/serve-preview.js']) {
      const res = await fetch(base + p);
      assert.equal(res.status, 404, `${p} must not be reachable through the gateway`);
    }
  });
});

test('theme carries the Signal design tokens and dark native scheme', () => {
  for (const token of [
    '--bg-app', '--bg-rail', '--bg-topbar', '--surface-1', '--surface-2',
    '--border-default', '--text-primary', '--text-muted',
    '--accent-blue', '--accent-cyan', '--success', '--warning', '--danger',
    '--radius-sm', '--radius-md', '--radius-lg', '--rail-width',
  ]) {
    assert.ok(themeCss.includes(token + ':'), `token ${token} is defined`);
  }
  assert.match(themeCss, /color-scheme:\s*dark/);
  assert.ok(themeCss.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(themeCss.includes('[data-aethink-motion="reduced"]'));
  assert.ok(themeCss.includes('[data-aethink-motion="off"]'));
  // The overlay must stay low-specificity so upstream utilities keep winning.
  assert.ok(themeCss.includes(':where('));
});

test('theme never forces a desktop body width onto small screens', () => {
  // The static reference used `body { min-width: 1060px }`; PRD §2.3 forbids
  // carrying that into the product.
  assert.doesNotMatch(themeRules, /body\s*\{[^}]*min-width\s*:/s);
  assert.doesNotMatch(themeRules, /min-width:\s*1[0-9]{3}px/);
});

test('theme has balanced rule blocks', () => {
  const opens = (themeRules.match(/\{/g) || []).length;
  const closes = (themeRules.match(/\}/g) || []).length;
  assert.equal(opens, closes, 'every { has a matching }');
});

test('client.js compiles and keeps its documented contract', () => {
  assert.doesNotThrow(() => new vm.Script(clientJs, { filename: 'client.js' }));
  assert.ok(clientJs.includes("const PRODUCT = 'AethinkAI Gateway AI'"));
  assert.ok(clientJs.includes("const LOGO = '/brand/logo.svg'"));
  assert.ok(clientJs.includes('window.AethinkBrand'));
  // Branding must never invent data: no sample metrics or fake health values.
  assert.doesNotMatch(clientJs, /99\.8|99\.98|sample|fake/i);
});

test('client.js keeps the operator presentation route allowlist', () => {
  for (const route of [
    '/dashboard', '/runtime/monitor', '/runtime/request-logs',
    '/access/ai-providers', '/access/ai-accounts', '/access/api-keys',
    '/models/channel-groups', '/models/catalog', '/system/config',
  ]) {
    assert.ok(clientJs.includes(`'${route}'`), `route ${route} is kept`);
  }
});

test('branding is injected into <head>, before its closing tag', async () => {
  await withProxy(async (base) => {
    const html = await (await fetch(base + '/manage')).text();
    const headEnd = html.indexOf('</head>');
    for (const needle of ['brand/theme.css', 'brand/client.js', 'brand/logo.svg']) {
      const at = html.indexOf(needle);
      assert.ok(at > -1 && at < headEnd, `${needle} injected inside <head>`);
    }
    assert.match(html, /Original|codeProxy|aside/);
  });
});
