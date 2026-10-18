# Action1 gateway acceptance

## Private HTTP / Cloudflare preparation: 2026-10-19

### Account follow-up

- User selected the `d3hl` Cloudflare team. The browser is signed in, but its account selector lists one account and that account shows Zero Trust onboarding. Selecting the displayed Free plan led to an activation checkout requiring billing details and consent to usage charges. Checkout was not submitted; no subscription, team, tunnel, portal or policy was created.
- The 1Password MCP connection now succeeds. Variable-name inspection found `CLIENT_ID`, `CLIENT_SECRET`, and `ACTION1_HTTP_TOKE` (missing the final N), rather than the required `ACTION1_HTTP_TOKEN`. No secret value was retrieved or modified. A name correction is pending, along with the approved portal email/group and access to the intended existing team or completion of account activation by the user.

- Added a separate stateless Streamable HTTP entry point using the installed MCP SDK. The existing stdio launch and dashboard are unchanged. The HTTP origin requires a separate strong bearer token and explicit organization scope, binds only to loopback or a specific RFC1918 IPv4 address, validates Host, rejects browser Origin requests, and limits request size/concurrency. One shared Action1 client retains pacing and token caching across requests.
- All seventeen tests pass, including the original stdio/in-memory suite and real HTTP client discovery, origin authentication, configured organization restrictions, continuation, body limits and redacted errors. The new PowerShell 7 launcher parses successfully and reuses the saved 1Password Environment/account IDs without embedding machine paths or credentials.
- A fresh registered 1Password launch passed temporary loopback HTTP acceptance: ten tools discovered, authenticated organization discovery succeeded with one organization and no truncation, and an unauthenticated request returned HTTP 401. The acceptance token existed only in process memory; no persistent origin token or tenant records were written.
- Installed the official `Cloudflare.cloudflared` WinGet package (2026.10.1); WinGet verified the installer hash. No tunnel, route, Access policy, portal, service or ChatGPT connection has been created. Cloudflare browser access is at the sign-in page and the intended account/team and allowed identities are not yet supplied.
- The 1Password MCP connection request was blocked with `MCP tool call requires approval, but approval policy is never`. Existing `op run` runtime injection still worked for bounded acceptance; no Environment variable was changed. A separate concealed `ACTION1_HTTP_TOKEN` must be supplied in the existing Environment through approved access.
- Cloudflare private routing, portal OAuth/user policy, denied-user checks and a real ChatGPT tool call remain unvalidated. Follow `CLOUDFLARE.md`; local success is not end-to-end portal acceptance. No Action1 deployments were initiated, modified or stopped.

## Live dashboard recheck: 2026-10-16

- After the user updated the Action1 client secret in 1Password, a fresh launch of the saved NA-2 registration discovered all ten tools and passed the authenticated read-only organization check. The pre-existing chat MCP process still returned OAuth HTTP 400; the new dashboard launches its own fresh registered process to load current credentials.
- Complete organization discovery returned one accessible organization. A bounded ten-asset read passed. The live API supplies nested numeric `missing_updates.critical/other` and `vulnerabilities.critical/other` summaries; the dashboard mapping supports these plus the original flat CSV columns.
- The local dashboard successfully loaded the returned inventory through MCP and rendered vulnerability, patch, connection and operating-system summaries. Browser review confirmed the existing layout renders with live data. No credentials or tenant records are persisted by the live bridge.
- All thirteen automated tests pass, including the eight original gateway tests and dashboard coverage for nested summary mapping, unavailable values, CSV safety, Host/Origin/session checks, read-only routes, selected organization scope, continuation and sanitized errors.
- The local bridge is served on loopback. The previous static Site has not been republished: static hosting cannot launch the local stdio/1Password process. Report rows, report errors and deployment routes were not exercised in this dashboard check and remain unvalidated for NA-2.

## Setup recheck: 2026-10-15

Current region: **NA-2**, explicitly confirmed by the user. API base: `https://app.na-2.action1.com/api/3.0`. This supersedes the earlier EU selection; previous EU results below do not validate NA-2.

- Read the handoff, README, contributor guide, and previous acceptance notes.
- Installed dependencies using the documented npm fallback because standalone pnpm was unavailable. Recovered npm's initial lockfile warning with a second install.
- Updated the pinned MCP SDK from 1.29.0 to 1.32.1 for GHSA-6qxp-vccf-f47h; synchronized npm and pnpm lockfiles. All seven automated tests pass on Node.js 26.12.0, including real stdio startup. `npm audit` reports zero vulnerabilities.
- Rediscovered the 1Password `action1` Developer Environment. It contains `CLIENT_ID` and `CLIENT_SECRET`; runtime injection verified both presence flags without exposing values or writing an environment file.
- Added NA-2 to the gateway's exact host allowlist, both PowerShell scripts, and the live validator. All eight tests pass, including regional host isolation and real stdio startup; both PowerShell scripts parse and accept NA-2.
- The enabled Codex `action1` registration already uses NA-2, direct `op run` injection from this Environment, the current server path, and 60/180-second startup/tool timeouts. Its exact saved launch discovers all ten tools, but its authenticated organization read fails with HTTP 400. No registration replacement was necessary.
- NA-2 live acceptance discovers all ten tools with read-only annotations. Organization and report discovery fail with HTTP 400. A separate token-only check confirms the failure occurs at OAuth authentication, before tenant reads. The request uses the form-encoded client ID and secret specified in Action1's authentication documentation; error bodies and credentials were not printed.
- Asset status, report rows/CSV/errors, and deployment monitoring remain unvalidated for NA-2 because no organization or report could be discovered. The precise reason for the authentication rejection is unknown. Verify the API client's NA-2 tenant association and validity in Action1; if credentials need updating, update the existing `action1` Developer Environment in 1Password, then rerun `op run --environment <environment-id> -- node scripts/validate-live.mjs NA-2`.
- No deployments were initiated, modified, or stopped. No credentials or tenant records were written to these notes. Reload MCP connections or start a new Codex chat to load the updated gateway code.

## Previous EU acceptance

Region: EU, explicitly confirmed by the user and verified by successful authentication at `https://app.eu.action1.com/api/3.0`.

Dependencies installed from the frozen pnpm lockfile. Node.js 24 satisfies the required version. All seven automated tests pass, including stdio startup, pagination, scope enforcement, credential/error handling, CSV safety, and report category routing.

1Password `action1` Environment contains `CLIENT_ID` and `CLIENT_SECRET`. Direct `op run --environment` injection was verified using presence flags only. No secret values or tenant records were persisted in this document.

Registered global MCP server `action1` for Codex desktop. The exact saved command was tested over stdio: ten tools discovered and an authenticated organization read passed. Launch invokes 1Password CLI directly, with EU API configuration and no stored credentials. A PowerShell wrapper was rejected during verification because its nested native commands closed stdin. Start a new Codex chat or reload MCP connections to use the new registration.

Read-only live acceptance through MCP:

| Check | Result |
| --- | --- |
| Tool discovery | Ten tools, all marked read-only |
| Organization discovery | Successful |
| Asset inventory and one asset status | Successful; status, last_seen and patch fields returned |
| Asset freshness | last_seen present, but not parseable by JavaScript Date.parse; freshness not established |
| Root report categories | Successful |
| Report category children | HTTP 403; check API client report permissions |
| Report rows, CSV and report collection errors | Unvalidated because a report leaf could not be discovered |
| Scheduled automations and deployment statuses | Successful |
| Historical deployment instances and endpoint results | Successful |
| One endpoint's deployment details | Successful |

Collections were sampled at ten rows and one page. Assets, deployment statuses, historical instances and endpoint results reported truncation. These checks establish retrieval functionality, not complete inventory, endpoint freshness or deployment success. No deployments were initiated, modified or stopped. OAuth token requests were the only POST operations.

Report discovery now supports category traversal using `categoryId`. The initial attempt incorrectly used a category ID as a report ID and returned HTTP 400 (rows) and HTTP 500 (errors); these responses do not validate actual report retrieval. The corrected category-child request returned HTTP 403. Update report access in Action1, then rerun the acceptance script to validate report rows, CSV and error retrieval.

The report check was repeated after the user's acknowledgement and still returned HTTP 403. Permissions have not been independently confirmed. The saved-launch check used the validated ten-row page size: a one-row organization request returned an empty page with a continuation signal, correctly producing a pagination-no-progress error rather than claiming a complete empty result.
