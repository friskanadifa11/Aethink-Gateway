'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGateway } = require('../branding/gateway');

async function listen(s) {
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  return s.address().port;
}
async function fixture(fn) {
  const upstream = http.createServer((req, res) => {
    if (req.url === '/manage') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><html><head><title>CliRelay</title></head><body><main>Original panel</main></body></html>');
    } else if (req.url === '/v1/chat/completions') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write('data: {"choices":[]}\n\n');
      res.end('data: [DONE]\n\n');
    } else if (req.url === '/v0/management/status') {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
    } else {
      res.writeHead(404); res.end('missing');
    }
  });
  const upstreamPort = await listen(upstream);
  const gateway = createGateway('http://127.0.0.1:' + upstreamPort);
  const gatewayPort = await listen(gateway);
  try { await fn('http://127.0.0.1:' + gatewayPort); }
  finally {
    await new Promise(r => gateway.close(r));
    await new Promise(r => upstream.close(r));
  }
}

test('injects uploaded logo and theme into actual upstream panel HTML', async () => {
  await fixture(async base => {
    const res = await fetch(base + '/manage');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /Original panel/);
    assert.match(text, /brand\/logo\.svg/);
    assert.match(text, /brand\/client\.js/);
    assert.match(text, /brand\/theme\.css/);
    const svg = await fetch(base + '/brand/logo.svg');
    assert.match(await svg.text(), /AethinkAI/);
  });
});

test('preserves management JSON response and API SSE stream', async () => {
  await fixture(async base => {
    const json = await fetch(base + '/v0/management/status');
    assert.deepEqual(await json.json(), {ok:true});
    const sse = await fetch(base + '/v1/chat/completions', {method:'POST',body:'{}'});
    assert.equal(sse.headers.get('content-type'), 'text/event-stream');
    assert.match(await sse.text(), /data: \[DONE\]/);
  });
});

test('root redirects to management; does not expose file paths', async () => {
  await fixture(async base => {
    const redirect = await fetch(base + '/', {redirect:'manual'});
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/manage');
    const bad = await fetch(base + '/brand/nope');
    assert.equal(bad.status, 404);
  });
});
