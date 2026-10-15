import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Action1Client, segment } from './client.mjs';
import { csv } from './reports.mjs';
import { pathToFileURL } from 'node:url';

export function createServer(client) {
  const server = new McpServer({ name: 'action1-gateway', version: '1.0.0' });
  const id = z.string().trim().min(1).max(200).refine(v => v !== '.' && v !== '..');
  const org = { organizationId: id };
  const paging = { maxPages: z.number().int().min(1).max(50).default(10), limit: z.number().int().min(1).max(100).default(100), from: z.number().int().min(0).default(0) };
  function tool(name, description, inputSchema, handler) {
    server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true } }, async args => {
      try { const result = await handler(args); return { content: [{ type: 'text', text: JSON.stringify(result) }] }; }
      catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
    });
  }
  tool('list_organizations', 'List organizations accessible to credentials and restricted to configured scope.', paging, async args => {
    const data = await client.pages('organizations', args);
    if (client.organizations.length) data.items = data.items.filter(o => client.organizations.includes(o.id));
    return data;
  });
  tool('list_assets', 'Read asset inventory with extended patch and status fields. Truncation is explicit.', { ...org, ...paging }, ({ organizationId, ...args }) => client.pages(`endpoints/managed/${client.org(organizationId)}`, { ...args, fields: '*' }));
  tool('get_asset_status', 'Read one asset including status, last seen, and patch fields supplied by Action1.', { ...org, endpointId: id }, a => client.get(`endpoints/managed/${client.org(a.organizationId)}/${segment(a.endpointId)}`, { fields: '*' }));
  tool('list_reports', 'Discover report categories and IDs. Start without categoryId, then traverse each ReportCategory using its id as categoryId. Only report leaf IDs can retrieve report rows.', { ...paging, categoryId: id.optional() }, ({ categoryId, ...args }) => client.pages(categoryId ? `reports/${segment(categoryId)}/children` : 'reports/all', args));
  tool('generate_report', 'Retrieve cached Action1 report rows as JSON or spreadsheet-safe CSV. Does not trigger endpoint re-query. Inspect report errors separately.', { ...org, ...paging, reportId: id, format: z.enum(['json', 'csv']).default('json') }, async ({ organizationId, reportId, format, ...args }) => {
    const result = await client.pages(`reportdata/${client.org(organizationId)}/${segment(reportId)}/data`, args);
    return { ...result, generatedAt: new Date().toISOString(), ...(format === 'csv' ? { csv: csv(result.items) } : {}) };
  });
  tool('get_report_errors', 'Read endpoint collection errors for a report.', { ...org, ...paging, reportId: id }, ({ organizationId, reportId, ...args }) => client.pages(`reportdata/${client.org(organizationId)}/${segment(reportId)}/errors`, args));
  tool('list_deployments', 'List scheduled automations or historical automation instances.', { ...org, ...paging, kind: z.enum(['schedules', 'instances']).default('instances') }, ({ organizationId, kind, ...args }) => client.pages(`automations/${kind}/${client.org(organizationId)}`, args));
  tool('get_deployment_status', 'Read deployment statuses for a scheduled automation.', { ...org, ...paging, automationId: id }, ({ organizationId, automationId, ...args }) => client.pages(`automations/schedules/${client.org(organizationId)}/${segment(automationId)}/deployment-statuses`, args));
  tool('get_deployment_results', 'Read per-asset results for a deployment instance.', { ...org, ...paging, instanceId: id }, ({ organizationId, instanceId, ...args }) => client.pages(`automations/instances/${client.org(organizationId)}/${segment(instanceId)}/endpoint-results`, args));
  tool('get_deployment_details', 'Read detailed deployment results for one asset in an instance.', { ...org, instanceId: id, endpointId: id }, a => client.get(`automations/instances/${client.org(a.organizationId)}/${segment(a.instanceId)}/endpoint-results/${segment(a.endpointId)}/details`));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new Action1Client({ baseUrl: process.env.ACTION1_BASE_URL, clientId: process.env.ACTION1_CLIENT_ID || process.env.CLIENT_ID, clientSecret: process.env.ACTION1_CLIENT_SECRET || process.env.CLIENT_SECRET, organizations: (process.env.ACTION1_ORGANIZATION_IDS || '').split(',').map(s => s.trim()).filter(Boolean) });
  await createServer(client).connect(new StdioServerTransport());
}
