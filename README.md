# Action1 MCP gateway

Local MCP server for report retrieval/export, asset status, and deployment monitoring. Uses the official MCP SDK over stdio. Requires Node.js 22 or newer and an Action1 API client ID/secret. No Action1 credentials are included.

## Install and start

The confirmed tenant region is **NA-2**, using `https://app.na-2.action1.com/api/3.0`. This supersedes the earlier EU selection. Set the region explicitly; the generic server and launcher defaults remain US.

Run `npm install` (or `pnpm install --frozen-lockfile`) in this directory, then `npm test`. The included pnpm lockfile records the tested dependencies.

Inject `ACTION1_CLIENT_ID` and `ACTION1_CLIENT_SECRET` into the server process through 1Password. The gateway also accepts `CLIENT_ID` and `CLIENT_SECRET`, matching the verified `action1` Developer Environment; the prefixed names take precedence. The 1Password MCP exposes variable names only, and its local environment-file mounting feature supports macOS/Linux, so connecting it on Windows does not inject credentials into the gateway process. Do not paste credentials into MCP configuration or commit an environment file. Supported `ACTION1_BASE_URL` values are `https://app.action1.com/api/3.0` (US), `https://app.eu.action1.com/api/3.0` (EU), `https://app.au.action1.com/api/3.0` (AU), and `https://app.na-2.action1.com/api/3.0` (NA-2). Optional `ACTION1_ORGANIZATION_IDS` is a comma-separated allowlist; omitted means all organizations accessible to the credential. API credential permissions remain authoritative.

Launch with `node src/server.mjs`, or use PowerShell 7: `./Start-Action1Gateway.ps1 -Region NA-2 -OrganizationId org-id` after secret injection. stdout is reserved for MCP messages.

On Windows, the installed 1Password CLI supports direct Developer Environment injection:

```powershell
$env:ACTION1_BASE_URL = 'https://app.na-2.action1.com/api/3.0'
op run --environment <environment-id> -- node src/server.mjs
```

Set `ACTION1_BASE_URL` to the confirmed region before this command. Environment IDs are discovered using the 1Password MCP; they are not item UUIDs. No plaintext `.env` is needed. See [1Password runtime injection](https://www.1password.dev/cli/secrets-environment-variables).

For Codex desktop, run the reusable PowerShell 7 registration script:

```powershell
./Register-Action1Gateway.ps1 -EnvironmentId <environment-id> -AccountId <account-id> -Region NA-2
```

The script resolves executable and workspace paths, registers `action1`, and sets 60-second startup and 180-second tool timeouts. Codex launches `op run` directly to preserve stdio. It stores only paths, non-secret configuration, and 1Password IDs; empty prefixed credential overrides prevent inherited values from shadowing this Environment. 1Password may prompt for unlock or authorization at startup. The script replaces an existing server registration of the same name. See [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Configure other MCP clients to launch `op run --environment <environment-id> -- node <absolute-path-to-src/server.mjs>`, with the confirmed API base in their non-secret environment configuration. This server uses local stdio.

## Local dashboard

Run `npm run dashboard` and open `http://127.0.0.1:8765` for the existing Action1 Insights dashboard populated through the registered MCP gateway. It uses 1Password injection from the saved launch, supports organization selection, refresh and bounded continuation, and keeps tenant records in memory. See [dashboard setup and limitations](dashboard/README.md).

## Tools

| Tool | Purpose |
| --- | --- |
| list_organizations | Discover allowed organizations |
| list_assets | Inventory, status and extended patch fields |
| get_asset_status | One asset's status, last seen and patch data |
| list_reports | Discover categories, then pass categoryId to discover report IDs |
| generate_report | Retrieve report rows as JSON, or JSON plus CSV text |
| get_report_errors | Check report collection errors |
| list_deployments | Scheduled automations or historical instances |
| get_deployment_status | Per-asset scheduled automation statuses |
| get_deployment_results | Per-asset results for one executed instance |
| get_deployment_details | Detailed instance results for one asset |

Example requests: “List assets in organization X”, “Generate report Y in organization X as CSV”, “Show endpoint results for deployment instance Z in organization X.” Discover IDs before requesting a report or instance.

`list_reports` initially returns report categories. Traverse each `ReportCategory` by passing its `id` as `categoryId` to another `list_reports` call until report leaves are found. Category IDs cannot be used as report IDs. Child routes are constructed at the configured region; API-provided URLs are not followed.

All tools perform GET operations. OAuth token acquisition performs POST. The gateway does not initiate deployments, stop automations, create report definitions, or trigger endpoint re-query. Generating a report reads Action1's existing data; generation time is retrieval time, not endpoint observation time. Inspect `last_seen` and report errors to assess freshness. Status fields are returned as supplied by Action1, without assuming undocumented enum meanings.

Collections are bounded by `limit` (1–100, default 100) and `maxPages` (1–50, default 10). `truncated: true` and `nextFrom` signal incomplete results; pass `nextFrom` as `from` on the next call to continue, or increase `maxPages` within bounds. Pagination uses live data rather than a fixed snapshot. Do not interpret partial exports as complete audits. CSV is returned in tool content, not saved on disk, and formula-like cells are escaped for spreadsheet safety. Large exports may exceed the MCP client's context limit.

## Reliability and security

Tokens are cached in memory and refreshed after expiry or one unauthorized response. Requests have a 30-second timeout, redirects are rejected, and API hosts are restricted to known Action1 regions. API-provided pagination URLs are not followed; page offsets are requested at the configured base. Requests are serialized with 2.1-second minimum spacing per gateway process. HTTP 429 retries honor Retry-After with bounded retries; waits over 60 seconds return a retry-later error. Multiple processes share Action1's enterprise quota, so coordinate them externally. API error bodies and credentials are not included in tool errors.

This is a local server. Any remote hosting would additionally require authenticated transport, caller-specific authorization, and tenant isolation.

## Sources and verification

- [Action1 REST API reference](https://app.na-2.action1.com/apidocs/): reports and automation routes for the selected region.
- [Action1 authentication](https://www.action1.com/api-documentation/authentication/): form-encoded client credentials and token expiry.
- [Action1 example calls](https://www.action1.com/api-documentation/making-example-calls/): managed endpoints, extended fields, pagination and request-rate guidance.
- [MCP TypeScript SDK v1.32.1](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.32.1): tool registration and stdio. Updated from v1.29.0 to address [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h). Earlier SDK guidance came from Context7, which did not resolve an Action1 library.

Tests use simulated responses and exercise MCP in-memory and real stdio transports. Current NA-2 validation and historical EU acceptance results are recorded in `VALIDATION.md`.

Repeat a bounded live check through 1Password with `op run --environment <environment-id> -- node scripts/validate-live.mjs NA-2`. It tests the gateway over stdio and prints only counts, field names, and success/error summaries. It samples the first accessible organization and up to ten rows per collection; it does not perform a complete tenant audit. Report discovery is bounded to twenty category requests. Skipped checks remain unvalidated even when the script exits successfully.
