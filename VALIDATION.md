# Action1 gateway acceptance

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
