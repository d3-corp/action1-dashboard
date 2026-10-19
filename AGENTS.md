# AGENTS.md

## Project

Action1 MCP gateway and local Action1 Insights dashboard for read-only report retrieval, asset status, and deployment monitoring. Preserve read-only Action1 operations, organization scope, credential isolation, and explicit partial-result signals.

Read `README.md` and `VALIDATION.md` fully before changing behavior. Read `dashboard/README.md` for dashboard work and `CLOUDFLARE.md` for HTTP or remote-access work.

## Commands

Use Node.js 22 or newer; Windows automation requires PowerShell 7. Run commands from the repository root.

- Install: `pnpm install --frozen-lockfile` (tested dependency versions); `npm install` is the documented alternative.
- Build: none; Node runs the ESM sources directly.
- Test, all: `npm test` (equivalent to `node --test`).
- Test, one file: `node --test test/gateway.test.mjs`, `node --test test/dashboard.test.mjs`, or `node --test test/http.test.mjs`.
- Dashboard checks: `node dashboard/verify.mjs`.
- Lint and format: no configured commands; match existing file style and run `git diff --check`.
- Run stdio: `npm start` after 1Password credential injection and explicit region configuration.
- Run dashboard: `npm run dashboard` (serves on `http://127.0.0.1:8765`; requires the saved Codex `action1` registration).
- Run private HTTP: `npm run start:http` (defaults to `127.0.0.1:8787`, endpoint `/mcp`; requires injected bearer token, NA-2 base, and explicit organization allowlist).
- Bounded live acceptance: `op run --environment <environment-id> -- node scripts/validate-live.mjs NA-2` after confirming organization scope.

Run the relevant one-file test while working and the full suite before completing code changes. Documentation-only changes need a diff/content review and `git diff --check`. Live checks require credentials and tenant scope; never treat skipped checks as successful validation.

## Layout

- `src/server.mjs`: ten read-only MCP tool registrations, input validation, and stdio startup.
- `src/client.mjs`: Action1 OAuth, organization scope, regional hosts, pacing, retries, and pagination.
- `src/reports.mjs`: spreadsheet-safe CSV generation.
- `src/http.mjs`: authenticated stateless Streamable HTTP transport sharing one Action1 client.
- `dashboard/server.mjs` and `dashboard/mcp.mjs`: loopback browser bridge and saved MCP launch integration.
- `dashboard/dist/`: tracked browser HTML, CSS, JavaScript, and data mapping; these files are maintained directly, with no build generator.
- `test/`: `gateway.test.mjs`, `dashboard.test.mjs`, and `http.test.mjs`; uses simulated responses plus real transport checks.
- `scripts/`: bounded gateway, saved-registration, and HTTP acceptance helpers.
- Root `*.ps1`: reusable launch and Codex registration scripts.

## Conventions

- JavaScript ESM with explicit `.mjs` imports in Node code; two-space indentation, single quotes, and semicolons.
- Use camelCase for JavaScript functions/variables and snake_case for MCP tool names.
- Keep transport, Action1 API behavior, and CSV responsibilities separate.
- Match the style of the file being edited over general preferences.
- Use reusable PowerShell functions with parameter validation and error handling.
- Reserve stdio gateway stdout for MCP protocol messages; redact errors and never expose upstream error bodies or credentials.
- Use `node:test` and `node:assert/strict`; name test files `*.test.mjs` and describe behavior in test names.
- Add regression coverage for routing, validation, authentication, pagination, scope, redaction, and CSV behavior changes. Preserve in-memory and real stdio/HTTP transport checks; no coverage threshold is configured.
- Use concise imperative commit subjects. PRs explain behavior changes, link relevant issues, list validation results, and disclose remaining limitations.
- Update the relevant documentation when configuration or tool behavior changes; record live-check evidence in `VALIDATION.md` without tenant records.

## Boundaries

Always:
- Read a file before editing it and keep changes within the requested task.
- Inject credentials through the 1Password `action1` Developer Environment. Accept `ACTION1_CLIENT_ID`/`ACTION1_CLIENT_SECRET` or the existing `CLIENT_ID`/`CLIENT_SECRET` aliases; prefixed names take precedence.
- Explicitly configure the confirmed NA-2 base: `https://app.na-2.action1.com/api/3.0`. Generic stdio/launcher defaults remain US; historical EU results do not validate NA-2.
- Confirm organization scope before live checks. HTTP additionally requires an explicit `ACTION1_ORGANIZATION_IDS` allowlist and separate `ACTION1_HTTP_TOKEN`.
- Preserve regional host restrictions, redirect rejection, shared pacing/token caching, bounded retries, and redacted errors.
- Preserve CSV formula protection and `truncated`/`nextFrom` continuation signals. Dashboard metrics and exports describe loaded records; unknown values stay unknown.
- Keep tenant records in memory; exclude them from commits, PRs, logs, and validation notes.
- Preserve dashboard loopback binding, Host/Origin/session checks, and static-file allowlisting; preserve HTTP private binding, bearer authentication, Host/Origin checks, and request limits.

Ask first unless already authorized by the task:
- Adding dependencies or changing public tool contracts or CI configuration.
- Deleting files or publishing/provisioning remote access, tunnels, portals, or access policies.

Never:
- Initiate, modify, or stop Action1 deployments, or add Action1 write operations. Data tools use GET; OAuth token acquisition uses POST.
- Read plaintext `.env` files or expose secret values in source, configuration, logs, chat, or memory; never commit credentials.
- Serve, restore, or commit the excluded tenant snapshot `dashboard/dist/data.js`.
- Push directly to `main`, force-push, or rewrite history.
- Hand-edit dependency lockfiles; update them through the package manager when a dependency change is authorized.
- Claim complete audits from bounded pages, endpoint freshness from retrieval time, or Cloudflare/ChatGPT acceptance from local tests.

## More detail, loaded only when needed

- Architecture, configuration, tools, and pagination: `README.md`.
- Live-check history and limitations: `VALIDATION.md`. Fresh NA-2 organization and bounded asset reads succeeded after the credential update; report rows/errors and deployment routes remain unvalidated for NA-2.
- Dashboard launch, mapping, privacy, and acceptance: `dashboard/README.md`.
- Private HTTP, shared portal scope, Cloudflare setup, and end-to-end acceptance: `CLOUDFLARE.md`. Remote portal and ChatGPT acceptance remain incomplete.
- Previous session context: `CODEX-HANDOFF.md`; check newer validation notes before relying on historical state.
