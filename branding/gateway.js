'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 8787);
const BASE = path.resolve(__dirname);
const ASSETS = {
  '/brand/logo.svg': ['logo.svg', 'image/svg+xml; charset=utf-8'],
  '/brand/theme.css': ['theme.css', 'text/css; charset=utf-8'],
  '/brand/client.js': ['client.js', 'application/javascript; charset=utf-8'],
};
const INJECTION = '<link rel="icon" type="image/svg+xml" href="/brand/logo.svg">' +
  '<link rel="stylesheet" href="/brand/theme.css">' +
  '<script defer src="/brand/client.js"></script>';

function createGateway(rawUpstream = process.env.UPSTREAM_URL || 'http://127.0.0.1:8317') {
  const upstream = new URL(rawUpstream);
  if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error('Invalid upstream protocol');
  const transport = upstream.protocol === 'http:' ? http : require('node:https');
  const server = http.createServer((req, res) => {
    const requestPath = new URL(req.url || '/', 'http://local.invalid').pathname;
    if (ASSETS[requestPath]) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        return res.end();
      }
      const [file, type] = ASSETS[requestPath];
      const content = fs.readFileSync(path.join(BASE, file));
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': content.length,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(req.method === 'HEAD' ? undefined : content);
    }
    if (requestPath === '/' && req.method === 'GET') {
      res.writeHead(302, { Location: '/manage', 'Cache-Control': 'no-store' });
      return res.end();
    }
    const headers = { ...req.headers, host: upstream.host };
    // Only HTML must be decoded to inject local branding assets.
    headers['accept-encoding'] = 'identity';
    const remote = transport.request({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      path: req.url,
      method: req.method,
      headers,
    }, (r) => {
      const responseHeaders = { ...r.headers };
      const isHtml = req.method === 'GET' && /text\/html/i.test(String(r.headers['content-type'] || ''));
      if (!isHtml) {
        res.writeHead(r.statusCode || 502, responseHeaders);
        r.pipe(res);
        return;
      }
      const chunks = [];
      let n = 0;
      r.on('data', (part) => {
        n += part.length;
        if (n > 8 * 1024 * 1024) {
          r.destroy(new Error('HTML response too large'));
          return;
        }
        chunks.push(part);
      });
      r.on('end', () => {
        if (res.headersSent || res.destroyed) return;
        let html = Buffer.concat(chunks).toString('utf8');
        if (html.includes('</head>')) html = html.replace('</head>', INJECTION + '</head>');
        else html = INJECTION + html;
        const data = Buffer.from(html);
        delete responseHeaders['content-length'];
        delete responseHeaders['content-encoding'];
        delete responseHeaders.etag;
        responseHeaders['cache-control'] = 'no-store';
        responseHeaders['content-length'] = data.length;
        res.writeHead(r.statusCode || 200, responseHeaders);
        res.end(data);
      });
    });
    remote.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      if (!res.destroyed) res.end(JSON.stringify({ error: 'Gateway upstream unavailable' }));
    });
    req.on('aborted', () => remote.destroy());
    res.on('close', () => { if (!res.writableEnded) remote.destroy(); });
    req.pipe(remote);
  });

  // Proxy WebSocket upgrades used by the upstream live system monitor.
  server.on('upgrade', (req, client, head) => {
    const headers = { ...req.headers, host: upstream.host, connection: 'Upgrade', upgrade: 'websocket' };
    const remote = transport.request({
      protocol: upstream.protocol, hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      path: req.url, method: req.method, headers,
    });
    remote.on('upgrade', (reply, socket, upstreamHead) => {
      let handshake = 'HTTP/1.1 101 Switching Protocols\r\n';
      for (const [k,v] of Object.entries(reply.headers)) {
        if (Array.isArray(v)) for (const item of v) handshake += k + ': ' + item + '\r\n';
        else if (v !== undefined) handshake += k + ': ' + v + '\r\n';
      }
      client.write(handshake + '\r\n');
      if (upstreamHead.length) client.write(upstreamHead);
      if (head.length) socket.write(head);
      socket.pipe(client);
      client.pipe(socket);
      socket.on('error', () => client.destroy());
      client.on('error', () => socket.destroy());
    });
    remote.on('response', (reply) => {
      client.write('HTTP/1.1 ' + (reply.statusCode || 502) + ' Rejected\r\nConnection: close\r\n\r\n');
      client.end();
    });
    remote.on('error', () => client.destroy());
    remote.end();
  });
  return server;
}

if (require.main === module) {
  createGateway().listen(PORT, '0.0.0.0', () => {
    console.log('AethinkAI Gateway AI branding proxy listening on :' + PORT);
  });
}
module.exports = { createGateway };
