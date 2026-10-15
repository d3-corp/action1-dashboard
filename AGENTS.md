# Repository Guidelines

## Project Structure & Module Organization

This Node.js ESM gateway exposes ten read-only Action1 tools over MCP stdio. `src/server.mjs` registers tools and validates inputs; `src/client.mjs` handles authentication, scope, pacing, retries, and pagination; `src/reports.mjs` produces spreadsheet-safe CSV. Tests live in `test/gateway.test.mjs`. Acceptance helpers live in `scripts/`; root PowerShell scripts launch and register the gateway. Read `README.md` and `VALIDATION.md` fully before changing behavior.

## Build, Test, and Development Commands

Use Node.js 22 or newer and PowerShell 7 for Windows automation.

- `pnpm install --frozen-lockfile`: install the tested dependency versions. `npm install` is an alternative.
- `npm test` or `node --test`: run the automated suite, including real stdio startup.
- `npm start`: launch `src/server.mjs` after credential injection and region configuration.
- `op run --environment <environment-id> -- node scripts/validate-live.mjs NA-2`: perform bounded, read-only tenant acceptance checks.

There is no build step or configured formatter/linter.

## Coding Style & Naming Conventions

Follow existing JavaScript: two-space indentation, single quotes, semicolons, explicit `.mjs` imports, and camelCase functions and variables. MCP tool names use snake_case. Keep transport, API, and CSV responsibilities separate. Prefer reusable PowerShell functions with parameter validation and error handling. Reserve stdout for MCP protocol messages.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; name files `*.test.mjs` and describe behavior in test names. Add regression coverage for changed routing, validation, authentication, pagination, redaction, or CSV behavior. Preserve in-memory and stdio transport checks. No numeric coverage threshold is configured. Record live-check limitations in `VALIDATION.md`; skipped checks are not successes. NA-2 tenant checks remain unvalidated because OAuth authentication returned HTTP 400.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects. PRs should explain the behavior change, link relevant issues, list validation commands and results, and disclose remaining limitations. Update documentation when configuration or tool behavior changes.

## Security & Configuration

Inject credentials through the 1Password `action1` Environment; never store secrets in source, configuration, logs, or memory. The confirmed tenant region is NA-2 (`https://app.na-2.action1.com/api/3.0`), superseding EU; confirm organization scope before live checks. Keep operations read-only and never initiate, modify, or stop deployments. Preserve host restrictions, redacted errors, CSV protection, and explicit truncation/continuation signals. Exclude tenant records from commits and PRs.
