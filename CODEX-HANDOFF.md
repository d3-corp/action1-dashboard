# Action1 MCP gateway



- Read [README.md](http://README.md)  and [VALIDATION.md](http://VALIDATION.md) and fully to the end of the document and sync with them.
- Setting up this Action1 MCP gateway., install dependencies, and run the tests.
- Use the 1Password action1 Developer Environment for credentials without exposing their values.
- Complete secure credential injection, confirm the Action1 region, then validate report retrieval, asset status, and deployment monitoring against the tenant.
- Keep operations read-only; do not initiate deployments. Register the gateway with the intended MCP client once its launch configuration is ready.

## Check Progress

- Node.js ESM gateway using official MCP SDK v1.32.1 and stdio transport.
- Ten tools for organization discovery, asset inventory/status, report discovery/export/errors, scheduled automations, deployment history/status/results/details.
- OAuth token cache/refresh, request pacing, bounded throttling retries, organization allowlist, safe CSV export, explicit pagination truncation and continuation.
- PowerShell 7 launcher, dependency lockfiles and eight passing tests, including real stdio startup and NA-2 host isolation.

## Verified credential context

The 1Password Environment named `action1` exists and contains `CLIENT_ID` and `CLIENT_SECRET`. Both names are accepted by the gateway. `ACTION1_CLIENT_ID` and `ACTION1_CLIENT_SECRET` are also accepted and take precedence.

No secret values were retrieved or included in this export. Environment IDs and local account IDs are intentionally omitted; authenticate and discover the Environment again in the destination session. The previously supplied item UUID was not an Environment ID.

## Remaining work

## Current session update

Latest recheck (2026-10-15): user confirmed **NA-2**, superseding EU. The gateway, PowerShell scripts, live validator, and README now support `https://app.na-2.action1.com/api/3.0`. Dependencies are installed; SDK is 1.32.1 with both lockfiles synchronized; eight tests pass and npm audit reports zero vulnerabilities. 1Password Environment discovery and credential-presence injection checks passed. The existing Codex `action1` registration already targets NA-2 and launches all ten tools successfully, so no replacement was needed. However, NA-2 OAuth token requests return HTTP 400. Report retrieval, asset status, and deployment monitoring remain unvalidated for NA-2 until API client validity and tenant association are checked. Credentials and error bodies were not printed. See `VALIDATION.md` for details and the retry command.

### Historical EU setup

The following bullets describe earlier EU checks, not current NA-2 acceptance:

- Dependencies installed with the frozen pnpm lockfile; all seven tests pass.
- User confirmed EU and Codex desktop.
- Secure Windows injection is supported by the installed 1Password CLI: `op run --environment <id> -- node <server-path>`. Both required variable presence checks passed.
- Added `Register-Action1Gateway.ps1` for path-resolved Codex registration and `scripts/validate-live.mjs` for read-only MCP acceptance with redacted summaries.
- Added optional `categoryId` to `list_reports` because report discovery begins with category links rather than report leaves.
- Registered global Codex server `action1`; the exact saved launch passed stdio discovery of all ten tools and an authenticated organization read. Reload MCP connections or start a new Codex chat to load it.
- Assets and all deployment monitoring routes passed against EU. Report-category children returned HTTP 403; report retrieval remains unvalidated pending Action1 report access. See `VALIDATION.md` for limitations.
- The workspace is an exported folder without Git metadata. No commit was created.

The numbered list below describes the original export state; use this update and `VALIDATION.md` for the current state.

1. Install dependencies with `pnpm install --frozen-lockfile`, or `npm install` if pnpm is unavailable. Requires Node.js 22 or newer.
2. Run `node --test`. At export, all seven tests passed.
3. Establish supported secret injection from 1Password into the gateway process. The connected Environments MCP returns variable names only, and local environment-file mounts are supported on macOS/Linux rather than Windows. Do not assume that MCP connection supplies credentials to the gateway.
4. Confirm the tenant region before live calls. The current default is US; supported bases are listed in README.md.
5. Confirm the organization scope, discover actual report and automation IDs, and run read-only acceptance checks. Live tenant access has not been tested.
6. Configure the chosen MCP client to launch `node` with the destination machine's absolute path to `src/server.mjs`. The server is local stdio, not a hosted HTTPS service.

## Boundaries

Do not persist secrets in source, MCP configuration, logs, chat, or memory. Use 1Password. Do not initiate, modify, or stop deployments without a new user request. Report generation retrieves cached Action1 rows; it does not refresh endpoint collection or create report definitions. Inspect freshness and report errors, and disclose truncated results.

All source files, tests, launch scripts and documentation are included. Installed dependencies are excluded; reinstall at the destination. Official references are linked in README.md. Context7 supplied MCP SDK guidance but did not resolve an Action1 library.
