import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Action1Client } from '../src/client.mjs';
import { createHttpGateway, readHttpConfiguration } from '../src/http.mjs';

const token = 'synthetic-origin-token-for-regression-tests-only';
const authorization = { Authorization: `Bearer ${token}` };
const configuration = { ACTION1_HTTP_TOKEN: token, ACTION1_ORGANIZATION_IDS: 'allowed', ACTION1_BASE_URL: 'https://app.na-2.action1.com/api/3.0' };

function apiFixture() {
  const calls = [];
  const client = new Action1Client({ baseUrl: configuration.ACTION1_BASE_URL, clientId: 'synthetic-id', clientSecret: 'synthetic-secret',
    organizations: ['allowed'], interval: 0, sleep: async () => {},
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      const body = String(url).endsWith('oauth2/token') ? { access_token: 'synthetic-api-token', expires_in: 3600 }
        : new URL(url).pathname.endsWith('/organizations') ? { items: [{ id: 'allowed' }, { id: 'outside' }] }
          : { items: [{ id: 'asset' }], next_page: 'next' };
      return new Response(JSON.stringify(body), { status: 200 });
    } });
  return { client, calls };
}

async function start(t, options = {}) {
  const fixture = apiFixture();
  const gateway = createHttpGateway({ client: fixture.client, token, ...options });
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  t.after(() => gateway.close());
  return { ...fixture, gateway, url: `http://127.0.0.1:${gateway.server.address().port}` };
}

test('HTTP configuration fails closed without token, organization scope, NA-2, or exact private network settings', () => {
  assert.equal(readHttpConfiguration(configuration).host, '127.0.0.1');
  assert.equal(readHttpConfiguration({ ...configuration, ACTION1_HTTP_HOST: '192.168.10.2' }).host, '192.168.10.2');
  for (const env of [
    { ...configuration, ACTION1_HTTP_TOKEN: '' }, { ...configuration, ACTION1_HTTP_TOKEN: 'weak' },
    { ...configuration, ACTION1_ORGANIZATION_IDS: '' }, { ...configuration, ACTION1_ORGANIZATION_IDS: '../wrong' },
    { ...configuration, ACTION1_BASE_URL: 'https://app.eu.action1.com/api/3.0' },
    { ...configuration, ACTION1_HTTP_HOST: '0.0.0.0' }, { ...configuration, ACTION1_HTTP_HOST: '8.8.8.8' },
    { ...configuration, ACTION1_HTTP_PORT: '0' }, { ...configuration, ACTION1_HTTP_ALLOWED_HOSTS: '*.example.com' },
  ]) assert.throws(() => readHttpConfiguration(env));
  assert.throws(() => createHttpGateway({ client: {}, token }));
});

test('HTTP requires origin authentication and rejects cross-origin requests, forged Host, and non-MCP paths', async t => {
  const { url, calls } = await start(t);
  for (const headers of [{}, { Authorization: 'Bearer wrong' }, { 'Cf-Access-Jwt-Assertion': 'unverified' }]) {
    const result = await fetch(url + '/mcp', { method: 'POST', headers });
    assert.equal(result.status, 401);
    assert.match(result.headers.get('www-authenticate'), /^Bearer/);
  }
  assert.equal((await fetch(url + '/mcp', { headers: { ...authorization, Origin: 'https://evil.example' } })).status, 403);
  const status = await new Promise((resolve, reject) => {
    const req = http.get(url + '/mcp', { headers: { ...authorization, Host: 'evil.example', 'X-Forwarded-Host': '127.0.0.1' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(status, 403);
  assert.equal((await fetch(url + '/mcp?token=' + token, { headers: authorization })).status, 404);
  assert.equal((await fetch(url + '/api/assets', { headers: authorization })).status, 404);
  assert.equal((await fetch(url + '/mcp', { headers: authorization })).status, 405);
  assert.equal((await fetch(url + '/mcp', { method: 'DELETE', headers: authorization })).status, 405);
  const health = await fetch(url + '/healthz', { headers: authorization });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 0);
});

test('real Streamable HTTP client discovers ten read-only tools, shares token cache, and enforces organization scope', async t => {
  const { url, calls } = await start(t);
  const mcp = new Client({ name: 'http-regression', version: '1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url + '/mcp'), { requestInit: { headers: authorization } });
  try {
    await mcp.connect(transport);
    const tools = (await mcp.listTools()).tools;
    assert.equal(tools.length, 10);
    assert.ok(tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
    const orgs = await mcp.callTool({ name: 'list_organizations', arguments: { limit: 10, maxPages: 1 } });
    assert.deepEqual(JSON.parse(orgs.content[0].text).items, [{ id: 'allowed' }]);
    const assets = await mcp.callTool({ name: 'list_assets', arguments: { organizationId: 'allowed', limit: 10, maxPages: 1 } });
    assert.deepEqual(JSON.parse(assets.content[0].text), { items: [{ id: 'asset' }], truncated: true, nextFrom: 1 });
    const denied = await mcp.callTool({ name: 'list_assets', arguments: { organizationId: 'outside' } });
    assert.equal(denied.isError, true);
    assert.equal(calls.filter(call => call.url.endsWith('oauth2/token')).length, 1);
    assert.ok(calls.every(call => new URL(call.url).hostname === 'app.na-2.action1.com'));
    assert.ok(!calls.some(call => call.init.headers?.Authorization === authorization.Authorization));
    assert.equal(transport.sessionId, undefined);
  } finally { await mcp.close(); }
});

test('HTTP rejects malformed, non-JSON, oversized, and excess concurrent requests before tool execution', async t => {
  const { url, calls } = await start(t, { maxConcurrent: 0 });
  assert.equal((await fetch(url + '/mcp', { method: 'POST', headers: { ...authorization, 'Content-Type': 'text/plain' }, body: 'x' })).status, 415);
  const busy = await fetch(url + '/mcp', { method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(busy.status, 429);
  assert.equal(busy.headers.get('retry-after'), '3');
  assert.equal(calls.length, 0);
  const other = await start(t);
  const headers = { ...authorization, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const invalid = await fetch(other.url + '/mcp', { method: 'POST', headers, body: '{' });
  assert.equal(invalid.status, 400);
  const oversized = await fetch(other.url + '/mcp', { method: 'POST', headers, body: JSON.stringify({ padding: 'x'.repeat(70000) }) });
  assert.equal(oversized.status, 413);
  assert.equal(other.calls.length, 0);
});
