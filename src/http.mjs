import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.mjs';
import { Action1Client } from './client.mjs';

const tokenPattern = /^[A-Za-z0-9._~+\/-]{32,512}={0,2}$/;
const digest = value => createHash('sha256').update(value).digest();
const privateAddress = host => {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return host === '127.0.0.1' || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

export function readHttpConfiguration(env = process.env) {
  const host = env.ACTION1_HTTP_HOST || '127.0.0.1';
  const port = Number(env.ACTION1_HTTP_PORT || 8787);
  const token = env.ACTION1_HTTP_TOKEN;
  const organizations = (env.ACTION1_ORGANIZATION_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
  const allowedHosts = (env.ACTION1_HTTP_ALLOWED_HOSTS || host).split(',').map(value => value.trim().toLowerCase());
  if (!privateAddress(host)) throw new Error('HTTP bind address must be loopback or an explicit private IPv4 address');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid HTTP port');
  if (!tokenPattern.test(token || '')) throw new Error('Inject a random ACTION1_HTTP_TOKEN of at least 32 URL-safe characters through 1Password');
  if (!organizations.length || organizations.some(value => value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value))) throw new Error('Set an explicit ACTION1_ORGANIZATION_IDS allowlist before starting HTTP');
  if (env.ACTION1_BASE_URL !== 'https://app.na-2.action1.com/api/3.0') throw new Error('HTTP requires the confirmed NA-2 API base');
  if (allowedHosts.some(value => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) || value.includes('..'))) throw new Error('Set exact HTTP hostnames without ports, URLs or wildcards');
  return { host, port, token, organizations, allowedHosts };
}

// One shared Action1Client preserves token caching and pacing across stateless
// MCP requests. All portal users are authorized to the same configured scope.
export function createHttpGateway({ client, token, allowedHosts = ['127.0.0.1'], maxConcurrent = 4 }) {
  if (!tokenPattern.test(token || '')) throw new Error('A strong origin bearer token is required');
  if (!client.organizations?.length) throw new Error('An explicit organization scope is required');
  if (!allowedHosts.length || allowedHosts.some(host => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || host.includes('..'))) throw new Error('An exact hostname allowlist is required');
  const expectedToken = digest(token);
  let active = 0;
  const connections = new Set();
  const listener = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const error = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
    };
    // Host/Origin checks use direct headers, never untrusted forwarded identity.
    const host = req.headers.host;
    if (typeof host !== 'string' || !/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host) || !allowedHosts.includes(host.split(':')[0].toLowerCase()) || req.headers.origin) return error(403, 'Forbidden');
    if (req.url !== '/mcp' && req.url !== '/healthz') return error(404, 'Not found');
    const authorization = req.headers.authorization;
    const supplied = typeof authorization === 'string' && /^Bearer [A-Za-z0-9._~+\/-]+={0,2}$/i.test(authorization) ? authorization.slice(7) : '';
    if (!supplied || !timingSafeEqual(digest(supplied), expectedToken)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="action1-origin"');
      return error(401, 'Authentication required');
    }
    if (req.url === '/healthz') {
      if (req.method !== 'GET') return error(405, 'Method not allowed');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', transport: 'streamable-http', readOnly: true }));
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return error(405, 'Use stateless MCP POST requests');
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return error(415, 'JSON content type required');
    if (active >= maxConcurrent) { res.setHeader('Retry-After', '3'); return error(429, 'Gateway busy; retry later'); }
    active++;
    const mcp = createServer(client);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536 });
    connections.add(mcp);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true; active--; connections.delete(mcp);
      void mcp.close().catch(() => {});
    };
    res.once('close', cleanup);
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) error(500, 'MCP request failed');
      else res.end();
    } finally {
      if (res.writableEnded || res.destroyed) cleanup();
    }
  });
  listener.requestTimeout = 30000;
  listener.headersTimeout = 15000;
  listener.timeout = 180000;
  return {
    server: listener,
    async close() {
      const closing = new Promise(resolve => listener.close(resolve));
      await Promise.allSettled([...connections].map(mcp => mcp.close()));
      listener.closeAllConnections();
      await closing;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = readHttpConfiguration();
    const client = new Action1Client({ baseUrl: process.env.ACTION1_BASE_URL,
      clientId: process.env.ACTION1_CLIENT_ID || process.env.CLIENT_ID,
      clientSecret: process.env.ACTION1_CLIENT_SECRET || process.env.CLIENT_SECRET,
      organizations: config.organizations });
    if (!client.clientId || !client.clientSecret) throw new Error('Inject Action1 credentials through 1Password');
    const gateway = createHttpGateway({ client, token: config.token, allowedHosts: config.allowedHosts });
    gateway.server.on('error', () => { console.error('HTTP gateway could not bind its configured private address and port'); process.exitCode = 1; });
    gateway.server.listen(config.port, config.host, () => console.error(`Action1 private HTTP MCP listening on port ${config.port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await gateway.close(); process.exit(); });
  } catch {
    console.error('HTTP gateway startup refused. Check NA-2, organization scope, private bind address, and 1Password credential/token injection.');
    process.exitCode = 1;
  }
}
