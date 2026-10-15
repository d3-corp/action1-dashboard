import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

// Run only through secret-manager injection. Output contains counts and field
// names, never credentials, tenant identifiers, report rows, or endpoint data.
const region = process.argv[2];
const hosts = { US: 'app.action1.com', EU: 'app.eu.action1.com', AU: 'app.au.action1.com', 'NA-2': 'app.na-2.action1.com' };
if (!hosts[region]) throw new Error('Specify US, EU, AU, or NA-2');
const client = new Client({ name: 'action1-readonly-acceptance', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))],
  env: { ...process.env, ACTION1_BASE_URL: `https://${hosts[region]}/api/3.0` },
  stderr: 'pipe',
});
const checks = [];
const paging = { limit: 10, maxPages: 1 };
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
  if (result.isError) {
    const message = result.content?.[0]?.text || '';
    const status = message.match(/HTTP \d{3}/)?.[0];
    checks.push({ tool: name, passed: false, error: status || 'Request failed; details suppressed' });
    return null;
  }
  const data = JSON.parse(result.content[0].text);
  checks.push({ tool: name, passed: true, ...(Array.isArray(data.items) ? { sampleCount: data.items.length, truncated: data.truncated } : {}), fields: Object.keys(data.items?.[0] || data) });
  return data;
}
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  checks.push({ tool: 'tools/list', passed: tools.length === 10 && tools.every(t => t.annotations?.readOnlyHint), count: tools.length });
  const organizations = await call('list_organizations', paging);
  const reports = await call('list_reports', paging);
  const organizationId = organizations?.items?.[0]?.id;
  if (organizationId) {
    const scope = { organizationId };
    const assets = await call('list_assets', { ...scope, ...paging });
    const endpointId = assets?.items?.[0]?.id;
    if (endpointId) {
      const asset = await call('get_asset_status', { ...scope, endpointId });
      if (asset) checks.push({ tool: 'asset-freshness', lastSeenPresent: Boolean(asset.last_seen), lastSeenParseable: Number.isFinite(Date.parse(asset.last_seen)) });
    }
    else checks.push({ tool: 'get_asset_status', skipped: 'No asset discovered' });
    const pending = [...(reports?.items || [])];
    const visited = new Set();
    let reportId;
    for (let requests = 0; pending.length && requests < 20;) {
      const node = pending.shift();
      if (!node.id || visited.has(node.id)) continue;
      visited.add(node.id);
      if (node.type === 'ReportCategory') {
        requests++;
        const children = await call('list_reports', { ...paging, categoryId: node.id });
        pending.push(...(children?.items || []));
      } else if (/report/i.test(node.type || '')) { reportId = node.id; break; }
    }
    if (reportId) {
      const report = await call('generate_report', { ...scope, ...paging, reportId, format: 'csv' });
      if (report) checks.push({ tool: 'csv-export', passed: typeof report.csv === 'string', retrievalTimePresent: Boolean(report.generatedAt) });
      await call('get_report_errors', { ...scope, ...paging, reportId });
    } else checks.push({ tool: 'generate_report', skipped: 'No report discovered' });
    const schedules = await call('list_deployments', { ...scope, ...paging, kind: 'schedules' });
    const automationId = schedules?.items?.[0]?.id;
    if (automationId) await call('get_deployment_status', { ...scope, ...paging, automationId });
    else checks.push({ tool: 'get_deployment_status', skipped: 'No scheduled automation discovered' });
    const instances = await call('list_deployments', { ...scope, ...paging, kind: 'instances' });
    const instanceId = instances?.items?.[0]?.id;
    if (instanceId) {
      const results = await call('get_deployment_results', { ...scope, ...paging, instanceId });
      const resultEndpointId = results?.items?.[0]?.endpoint_id || results?.items?.[0]?.id;
      if (resultEndpointId) await call('get_deployment_details', { ...scope, instanceId, endpointId: resultEndpointId });
      else checks.push({ tool: 'get_deployment_details', skipped: 'No endpoint result discovered' });
    } else checks.push({ tool: 'get_deployment_results', skipped: 'No deployment instance discovered' });
  } else checks.push({ tool: 'tenant-checks', skipped: 'No organization discovered' });
} catch {
  checks.push({ tool: 'acceptance', passed: false, error: 'Acceptance failed; details suppressed' });
} finally {
  await client.close();
}
console.log(JSON.stringify({ region, sampled: true, checks }, null, 2));
if (checks.some(c => c.passed === false)) process.exitCode = 1;
