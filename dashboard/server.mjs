import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { connectGateway, publicError } from './mcp.mjs';

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
]);

export function createDashboardServer({ getGateway = connectGateway, token = randomBytes(32).toString('hex') } = {}) {
  let gatewayPromise;
  let organizations = new Set();
  let busy = false;
  const gateway = () => gatewayPromise ||= getGateway().catch(error => { gatewayPromise = null; throw error; });
  const server = http.createServer(async (req, res) => {
    const host = `127.0.0.1:${server.address().port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) return json(403, { error: 'Local dashboard requests only.' });
    if (req.method !== 'GET') return json(405, { error: 'Read-only dashboard.' });
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname.startsWith('/api/')) {
      const supplied = Buffer.from(String(req.headers['x-dashboard-token'] || ''));
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(403, { error: 'Open the dashboard page to start a local session.' });
      if (!['/api/organizations', '/api/assets'].includes(url.pathname)) return json(404, { error: 'Unknown dashboard operation.' });
      if (busy) return json(429, { error: 'Another refresh is running. Please wait.' });
      busy = true;
      try {
        if (url.pathname === '/api/organizations') {
          const data = await (await gateway()).call('list_organizations', { limit: 100, maxPages: 10 });
          organizations = new Set(data.items.map(o => o.id));
          return json(200, { ...data, items: data.items.map(o => ({ id: o.id, name: o.name || o.id })) });
        }
        const organizationId = url.searchParams.get('organizationId');
        if (!organizations.has(organizationId)) return json(403, { error: 'Select an organization discovered by this gateway first.' });
        const from = Number(url.searchParams.get('from') || 0);
        if (!Number.isSafeInteger(from) || from < 0) return json(400, { error: 'Invalid continuation offset.' });
        const data = await (await gateway()).call('list_assets', { organizationId, from, limit: 100, maxPages: 5 });
        return json(200, { ...data, organizationId });
      } catch (error) {
        return json(502, { error: publicError(error) });
      } finally { busy = false; }
    }
    const file = staticFiles.get(url.pathname);
    if (!file) return json(404, { error: 'Not found.' });
    try {
      let body = await readFile(new URL(`./dist/${file[0]}`, import.meta.url));
      if (file[0] === 'index.html') body = body.toString().replace('<!--dashboard-session-->', `<meta name="dashboard-token" content="${token}">`);
      res.writeHead(200, { 'Content-Type': file[1] }); res.end(body);
    } catch { json(500, { error: 'Dashboard file unavailable.' }); }
  });
  return { server, async close() { await new Promise(resolve => server.close(resolve)); if (gatewayPromise) await (await gatewayPromise).close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.ACTION1_DASHBOARD_PORT || 8765);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid dashboard port');
  const dashboard = createDashboardServer();
  dashboard.server.on('error', () => { console.error('Cannot start local dashboard. Check whether its port is already in use.'); process.exitCode = 1; });
  dashboard.server.listen(port, '127.0.0.1', () => console.log(`Action1 Insights: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await dashboard.close(); process.exit(); });
}
