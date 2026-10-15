import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { normalize, count, parseCSV, exportCSV, fields } from '../dashboard/dist/model.js';
import { createDashboardServer } from '../dashboard/server.mjs';
import { publicError } from '../dashboard/mcp.mjs';

test('dashboard preserves unknown counts, explicit zero, boolean reboot, and duplicate names by ID', () => {
  const rows = normalize([{ id: 'one', name: 'same', reboot_required: true, critical_missing_updates: '0' }, { id: 'two', name: 'same', other_vulnerabilities: '12' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].critical_missing_updates, 0);
  assert.equal(rows[0].critical_vulnerabilities, null);
  assert.equal(rows[0].total_updates, null);
  assert.equal(rows[0].reboot_required, 'true');
  assert.equal(rows[1].other_vulnerabilities, 12);
  for (const value of [null, undefined, '', ' ', false, {}, [], -1, 'oops', 1.2]) assert.equal(count(value), null);
  assert.throws(() => normalize([{}]), /ID/);
});

test('dashboard maps live MCP nested vulnerability and patch summaries', () => {
  const [row] = normalize([{ id: 'one', missing_updates: { critical: 2, other: 7 }, vulnerabilities: { critical: 3, other: 12 } }]);
  assert.equal(row.critical_missing_updates, 2);
  assert.equal(row.other_missing_updates, 7);
  assert.equal(row.total_updates, 9);
  assert.equal(row.critical_vulnerabilities, 3);
  assert.equal(row.other_vulnerabilities, 12);
  const [unknown] = normalize([{ id: 'two', missing_updates: { critical: 0 }, vulnerabilities: {} }]);
  assert.equal(unknown.total_updates, null);
  assert.equal(unknown.critical_vulnerabilities, null);
});

test('dashboard CSV protects formulas, quotes multiline values, and preserves unavailable counts on round trip', () => {
  const rows = normalize([{ id: 'one', name: '=formula', OS: 'line one\nline "two"', critical_vulnerabilities: 0 }]);
  const csv = exportCSV(rows);
  assert.match(csv, /"'=formula"/);
  const imported = parseCSV(csv);
  assert.equal(imported[0].OS, rows[0].OS);
  assert.equal(imported[0].critical_vulnerabilities, 0);
  assert.equal(imported[0].other_vulnerabilities, null);
  assert.throws(() => parseCSV('name,status\na,Connected'), /18 Action1/);
  assert.throws(() => parseCSV(fields.join(',') + ',id\n' + Array(19).fill('x').join(',')), /unique headers/);
});

test('dashboard exposes only local read-only routes with session and organization checks', async t => {
  const calls = [];
  const app = createDashboardServer({ token: 'test-session', getGateway: async () => ({
    async call(name, args) {
      calls.push({ name, args });
      return name === 'list_organizations' ? { items: [{ id: 'allowed', name: '<Organization>' }], truncated: false }
        : { items: [{ id: 'one' }], truncated: true, nextFrom: 500 };
    }, async close() {},
  }) });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const headers = { 'X-Dashboard-Token': 'test-session' };
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /name="dashboard-token" content="test-session"/);
  assert.doesNotMatch(html, /src="data.js"|window.snapshot/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/data.js')).status, 404);
  assert.equal((await fetch(base + '/api/organizations')).status, 403);
  assert.equal((await fetch(base + '/api/organizations', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const req = http.get(base + '/api/organizations', { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch(base + '/api/organizations', { method: 'POST', headers })).status, 405);
  assert.equal((await fetch(base + '/api/assets?organizationId=allowed', { headers })).status, 403);
  assert.equal((await fetch(base + '/api/organizations', { headers })).status, 200);
  assert.equal((await fetch(base + '/api/assets?organizationId=other', { headers })).status, 403);
  assert.equal((await fetch(base + '/api/assets?organizationId=allowed&from=-1', { headers })).status, 400);
  assert.equal((await fetch(base + '/api/deploy', { headers })).status, 404);
  const assets = await (await fetch(base + '/api/assets?organizationId=allowed&from=500', { headers })).json();
  assert.equal(assets.truncated, true);
  assert.equal(assets.nextFrom, 500);
  assert.deepEqual(calls[1], { name: 'list_assets', args: { organizationId: 'allowed', from: 500, limit: 100, maxPages: 5 } });
});

test('dashboard errors never return upstream bodies or credentials', async t => {
  const app = createDashboardServer({ token: 'test-session', getGateway: async () => { throw new Error('secret-value and tenant-body'); } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => app.close());
  const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/organizations`, { headers: { 'X-Dashboard-Token': 'test-session' } });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret-value|tenant-body/);
  assert.equal(publicError(new Error('Action1 authentication failed (HTTP 400) sensitive')), 'Action1 request failed (HTTP 400).');
});
