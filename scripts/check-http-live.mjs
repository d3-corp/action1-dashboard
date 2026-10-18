import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Action1Client } from '../src/client.mjs';
import { createHttpGateway } from '../src/http.mjs';

// Run through the saved 1Password environment. The random origin token exists
// only for this loopback acceptance check and is never printed or persisted.
let gateway, mcp;
try {
  if (process.env.ACTION1_BASE_URL !== 'https://app.na-2.action1.com/api/3.0') throw new Error('Expected NA-2');
  const api = new Action1Client({ baseUrl: process.env.ACTION1_BASE_URL,
    clientId: process.env.ACTION1_CLIENT_ID || process.env.CLIENT_ID,
    clientSecret: process.env.ACTION1_CLIENT_SECRET || process.env.CLIENT_SECRET,
    organizations: (process.env.ACTION1_ORGANIZATION_IDS || '').split(',').map(value => value.trim()).filter(Boolean) });
  const organizations = await api.pages('organizations', { limit: 100, maxPages: 10 });
  if (!api.organizations.length) {
    if (organizations.truncated || organizations.items.length !== 1) throw new Error('Explicit organization scope required');
    api.organizations = [organizations.items[0].id];
  }
  const token = randomBytes(32).toString('base64url');
  gateway = createHttpGateway({ client: api, token });
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  const url = new URL(`http://127.0.0.1:${gateway.server.address().port}/mcp`);
  mcp = new Client({ name: 'action1-http-acceptance', version: '1.0' });
  await mcp.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const tools = (await mcp.listTools()).tools;
  const result = await mcp.callTool({ name: 'list_organizations', arguments: { limit: 100, maxPages: 10 } }, undefined, { timeout: 180000 });
  if (result.isError) throw new Error(result.content?.[0]?.text);
  const data = JSON.parse(result.content[0].text);
  const protectedResponse = await fetch(url, { method: 'POST' });
  const passed = tools.length === 10 && tools.every(tool => tool.annotations?.readOnlyHint) && protectedResponse.status === 401;
  console.log(JSON.stringify({ passed, transport: 'streamable-http', tools: tools.length, authenticatedOrganizationRead: true,
    organizationCount: data.items.length, truncated: data.truncated, unauthenticatedStatus: protectedResponse.status,
    temporaryLoopbackOnly: true, cloudflareValidated: false, chatgptValidated: false }));
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ passed: false, error: String(error.message).match(/HTTP \d{3}/)?.[0] || 'Live HTTP validation failed; check injected credentials, NA-2, and organization scope' }));
  process.exitCode = 1;
} finally {
  if (mcp) await mcp.close();
  if (gateway) await gateway.close();
}
