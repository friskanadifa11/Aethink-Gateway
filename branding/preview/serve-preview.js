'use strict';
/**
 * Dev-only preview server.
 *
 * Serves branding/preview/panel-preview.html through the REAL branding proxy
 * (branding/gateway.js) so the injected assets, headers and rewrite path are
 * exercised exactly as a deployment would exercise them.
 *
 * Usage:  node branding/preview/serve-preview.js [--port 8788]
 * Not part of the production asset map; gateway.js never serves this file.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createGateway } = require('../gateway');

const PREVIEW = path.join(__dirname, 'panel-preview.html');
const argPort = process.argv.indexOf('--port');
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8788;

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

(async () => {
  const upstream = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(PREVIEW));
  });
  const upstreamPort = await listen(upstream);

  const gateway = createGateway(`http://127.0.0.1:${upstreamPort}`);
  await new Promise((resolve) => gateway.listen(PORT, '127.0.0.1', resolve));

  console.log(`preview upstream : http://127.0.0.1:${upstreamPort}`);
  console.log(`preview via proxy: http://127.0.0.1:${PORT}/manage`);
  console.log('Ctrl+C to stop.');

  const shutdown = () => {
    gateway.close();
    upstream.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
