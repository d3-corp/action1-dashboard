import test from 'node:test';
import assert from 'node:assert/strict';
import { Action1Client, segment } from '../src/client.mjs';
import { csv } from '../src/reports.mjs';
import { createServer } from '../src/server.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
function fixture(handler, options = {}) {
  const calls = [];
  const client = new Action1Client({ clientId: 'test-client', clientSecret: 'test-secret', interval: 0, sleep: async () => {}, fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith('/oauth2/token') ? response({ access_token: 'fake-token', expires_in: 3600 }) : handler(url, init);
  }, ...options });
  return { client, calls };
}
test('token is cached, credentials are form encoded, and pagination stays local', async () => {
  const { client, calls } = fixture(url => new URL(url).searchParams.get('from') === '0' ? response({ items: [{ id: 'a' }], next_page: 'https://evil.example/steal', total_items: '2' }) : response({ items: [{ id: 'b' }], total_items: '2' }));
  assert.deepEqual(await client.pages('organizations'), { items: [{ id: 'a' }, { id: 'b' }], truncated: false });
  assert.equal(calls.filter(c => c.url.endsWith('/oauth2/token')).length, 1);
  assert.equal(calls[0].init.body.get('client_secret'), 'test-secret');
  assert.ok(calls.every(c => c.url.startsWith(client.base)));
  assert.ok(calls.every(c => c.init.redirect === 'error'));
});
test('partial data explicitly indicates truncation', async () => {
  const { client } = fixture(() => response({ items: [{ id: 'a' }], next_page: 'next' }));
  assert.deepEqual(await client.pages('organizations', { maxPages: 1 }), { items: [{ id: 'a' }], truncated: true, nextFrom: 1 });
  assert.deepEqual(await client.pages('organizations', { maxPages: 1, from: 5 }), { items: [{ id: 'a' }], truncated: true, nextFrom: 6 });
});
test('401 refresh and 429 retry are bounded', async () => {
  let count = 0; const delays = [];
  const { client, calls } = fixture(() => ++count === 1 ? response({}, 401) : count === 2 ? response({}, 429, { 'Retry-After': '3' }) : response({ items: [] }), { sleep: async ms => delays.push(ms) });
  await client.get('organizations');
  assert.equal(count, 3); assert.equal(calls.filter(c => c.url.endsWith('/oauth2/token')).length, 2); assert.ok(delays.includes(3000));
});
test('scope, resource paths, and error redaction', async () => {
  const { client } = fixture(() => response({ secret: 'private-response' }, 403), { organizations: ['allowed'] });
  assert.throws(() => client.org('other'), /scope/);
  assert.throws(() => segment('..'));
  assert.equal(segment('a/b'), 'a%2Fb');
  assert.throws(() => new Action1Client({ baseUrl: 'https://evil.example/api/3.0' }));
  await assert.rejects(client.get('https://evil.example'), /outside/);
  await assert.rejects(client.get('organizations'), error => error.message.includes('403') && !error.message.includes('private-response'));
});
test('CSV quotes values, nested data, and neutralizes formula cells', () => {
  const text = csv([{ name: '=1+1', notes: 'a,"b"', extra: { id: 1 } }, { name: 'safe', other: '@SUM(1)' }]);
  assert.ok(text.includes('"\'=1+1"')); assert.ok(text.includes('"a,""b"""')); assert.ok(text.includes('"\'@SUM(1)"'));
});
test('NA-2 requests and pagination stay on the explicitly allowed regional host', async () => {
  const { client, calls } = fixture(() => response({ items: [{ id: 'org' }] }), { baseUrl: 'https://app.na-2.action1.com/api/3.0' });
  assert.deepEqual(await client.pages('organizations'), { items: [{ id: 'org' }], truncated: false });
  assert.ok(calls.every(call => new URL(call.url).hostname === 'app.na-2.action1.com'));
  assert.throws(() => new Action1Client({ baseUrl: 'https://app.na-2.action1.com.evil.example/api/3.0' }));
  await assert.rejects(client.get('https://app.eu.action1.com/api/3.0/organizations'), /outside/);
});
test('MCP tools route deployment and report calls and reject invalid inputs', async () => {
  const paths = [];
  const { client: api } = fixture(url => { paths.push(String(url)); return response({ items: [{ id: 'asset', status: 'online' }] }); }, { organizations: ['org'] });
  const server = createServer(api);
  const client = new Client({ name: 'test-client', version: '1.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const tools = await client.listTools(); assert.equal(tools.tools.length, 10);
    const category = await client.callTool({ name: 'list_reports', arguments: { categoryId: 'category/a' } });
    assert.ok(!category.isError); assert.ok(paths.some(p => p.includes('/reports/category%2Fa/children')));
    const report = await client.callTool({ name: 'generate_report', arguments: { organizationId: 'org', reportId: 'report', format: 'csv' } });
    assert.ok(JSON.parse(report.content[0].text).csv.includes('online'));
    const result = await client.callTool({ name: 'get_deployment_results', arguments: { organizationId: 'org', instanceId: 'run' } });
    assert.ok(!result.isError); assert.ok(paths.some(p => p.includes('/automations/instances/org/run/endpoint-results')));
    const denied = await client.callTool({ name: 'list_assets', arguments: { organizationId: 'other' } }); assert.equal(denied.isError, true);
    const invalid = await client.callTool({ name: 'list_assets', arguments: { organizationId: 'org', maxPages: 0 } }); assert.equal(invalid.isError, true);
  } finally { await client.close(); await server.close(); }
});
test('stdio entry point starts and advertises tools without credentials', async () => {
  const client = new Client({ name: 'stdio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))] });
  try { await client.connect(transport); assert.equal((await client.listTools()).tools.length, 10); }
  finally { await client.close(); }
});
