import { connectGateway, publicError } from './mcp.mjs';
import { normalize, numeric } from './dist/model.js';

let gateway;
try {
  gateway = await connectGateway();
  const organizations = await gateway.call('list_organizations', { limit: 100, maxPages: 10 });
  console.log(JSON.stringify({ check: 'organizations', count: organizations.items.length, truncated: organizations.truncated }));
  // Discovery only by default. Supply an explicitly selected scope for an asset check.
  const organizationId = process.env.ACTION1_DASHBOARD_CHECK_ORGANIZATION || (!organizations.truncated && organizations.items.length === 1 ? organizations.items[0].id : undefined);
  if (organizationId) {
    if (!organizations.items.some(organization => organization.id === organizationId)) throw new Error('Organization outside discovered scope');
    const result = await gateway.call('list_assets', { organizationId, limit: 10, maxPages: 1 });
    const rows = normalize(result.items);
    console.log(JSON.stringify({ check: 'assets', count: rows.length, truncated: result.truncated,
      fields: Object.keys(result.items[0] || {}), knownCounts: Object.fromEntries(numeric.map(field => [field, rows.filter(row => row[field] !== null).length])) }));
    const shape = (value, depth = 0) => value === null ? 'null' : typeof value !== 'object' ? typeof value : depth > 2 ? 'object' : Array.isArray(value) ? { array: value.length, item: shape(value[0], depth + 1) } : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child, depth + 1)]));
    console.log(JSON.stringify({ check: 'field-shapes', shapes: Object.fromEntries(['missing_updates', 'vulnerabilities', 'update_status', 'vulnerability_status', 'status', 'online_status'].map(field => [field, shape(result.items[0]?.[field])])) }));
  }
} catch (error) { console.error(publicError(error)); process.exitCode = 1; }
finally { if (gateway) await gateway.close(); }
