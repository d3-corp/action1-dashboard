{
  "project": "Action1 MCP gateway and Insights dashboard",
  "reviewDate": "2026-10-19",
  "format": "JSON; intentionally stored in features.md without Markdown fences",
  "scope": {
    "branch": "main",
    "head": "00900afa6103a450be3015a55076b1395526953c",
    "packageVersion": "1.0.0",
    "reviewed": "Committed gateway/dashboard plus existing uncommitted HTTP/Cloudflare changes",
    "baseline": "Latest commit for working-tree changes; both repository commits for feature history",
    "limitations": [
      "Live Action1, 1Password configuration, Cloudflare and ChatGPT acceptance were not rerun during this review.",
      "Historical live results and external setup blockers below are reported from VALIDATION.md, not independently confirmed current service state.",
      "External documentation links and vendor setup instructions were not independently revalidated."
    ]
  },
  "features": [
    {
      "name": "Read-only MCP gateway",
      "state": "committed",
      "summary": "Node.js ESM server using the MCP SDK over stdio with input validation and read-only tool annotations.",
      "tools": {
        "list_organizations": "Discover organizations accessible to the credential and configured scope.",
        "list_assets": "Retrieve inventory with extended status and patch fields.",
        "get_asset_status": "Retrieve one endpoint's status, last-seen and patch fields.",
        "list_reports": "Traverse report categories to discover report leaf IDs.",
        "generate_report": "Retrieve cached report rows as JSON with optional spreadsheet-safe CSV.",
        "get_report_errors": "Retrieve report collection errors.",
        "list_deployments": "List scheduled automations or historical instances.",
        "get_deployment_status": "Retrieve a scheduled automation's per-endpoint statuses.",
        "get_deployment_results": "Retrieve an executed instance's per-endpoint results.",
        "get_deployment_details": "Retrieve one endpoint's detailed instance results."
      },
      "boundary": "Action1 data operations use GET; OAuth token acquisition uses POST. No deployment writes or endpoint re-query.",
      "evidence": ["src/server.mjs", "test/gateway.test.mjs"]
    },
    {
      "name": "API reliability and scope controls",
      "state": "committed",
      "summary": "Exact regional HTTPS allowlist including NA-2, organization allowlist, in-memory token caching/refresh, serialized requests spaced by 2.1 seconds, 30-second request timeout, rejected redirects and bounded 401/429 handling.",
      "pagination": "limit 1-100; maxPages 1-50; explicit truncated and nextFrom signals. API-provided next-page URLs are not followed.",
      "reporting": "CSV quotes and formula protection; generatedAt denotes retrieval time, not endpoint observation time.",
      "evidence": ["src/client.mjs", "src/reports.mjs", "README.md"]
    },
    {
      "name": "1Password-backed Windows launch and registration",
      "state": "committed",
      "summary": "PowerShell 7 launch and Codex registration helpers resolve executable/workspace paths and use direct op run injection without storing credentials.",
      "configuration": "Confirmed tenant is NA-2; generic stdio/launcher defaults remain US, so select NA-2 explicitly. Organization scope must be confirmed before live checks.",
      "evidence": ["Start-Action1Gateway.ps1", "Register-Action1Gateway.ps1", "README.md"]
    },
    {
      "name": "Local Action1 Insights dashboard",
      "state": "committed",
      "summary": "Loopback dashboard backed by a fresh registered stdio process: organization selection, refresh, search, charts, risk filters, asset details, CSV import/export and bounded continuation.",
      "dataHandling": "Five 100-record pages per request; partial/stale labels; nested and flat summary mapping; unknown counts preserved; tenant records remain in memory. The bridge exposes organization and inventory reads only.",
      "protection": "Host/Origin checks, per-launch session header, no-cache responses and explicit static-file allowlist.",
      "evidence": ["dashboard/README.md", "dashboard/server.mjs", "dashboard/mcp.mjs", "test/dashboard.test.mjs"]
    },
    {
      "name": "Private Streamable HTTP MCP origin",
      "state": "uncommitted implementation; locally tested; remote acceptance pending",
      "summary": "Optional npm run start:http exposes the same ten tools at /mcp, with authenticated /healthz and a reusable PowerShell launcher.",
      "protection": "Separate bearer token, mandatory organization scope and exact NA-2 base; loopback or specific RFC1918 IPv4 bind; Host allowlist; browser Origin rejection; 64 KiB request limit; four concurrent MCP requests; shared Action1 pacing/token cache.",
      "boundary": "Stateless POST transport with shared configured scope. The origin does not provide end-user OAuth or per-user Action1 roles.",
      "evidence": ["src/http.mjs", "Start-Action1HttpGateway.ps1", "scripts/check-http-live.mjs", "test/http.test.mjs"]
    },
    {
      "name": "Cloudflare portal integration runbook",
      "state": "uncommitted documentation; infrastructure not accepted",
      "summary": "Documents private tunnel routing, upstream bearer authentication, Access policies, portal OAuth, ChatGPT connection and acceptance criteria.",
      "evidence": ["CLOUDFLARE.md", "VALIDATION.md:3"]
    }
  ],
  "newChanges": {
    "committedHistory": [
      { "commit": "0b2d3b5", "date": "2026-10-15", "summary": "Initialize read-only gateway with NA-2 support." },
      { "commit": "00900af", "date": "2026-10-16", "summary": "Add local read-only dashboard backed by the gateway." }
    ],
    "modifiedTrackedFiles": ["README.md", "VALIDATION.md", "package.json"],
    "untrackedImplementationFiles": ["CLOUDFLARE.md", "Start-Action1HttpGateway.ps1", "scripts/check-http-live.mjs", "src/http.mjs", "test/http.test.mjs"],
    "summary": "Current working-tree changes add the HTTP entry point, launcher, bounded acceptance helper, four HTTP tests and Cloudflare setup notes. No dependency change appears in the tracked diff."
  },
  "unmergedRiskyChanges": {
    "remoteInspection": {
      "commands": ["git ls-remote --heads origin", "gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,mergeable,statusCheckRollup,url"],
      "result": "Only main is advertised, at the reviewed HEAD; no open PRs returned. Local branch inventory also contains only main.",
      "interpretation": "No separate unmerged branch or open PR found. The pending HTTP feature exists only in this working tree."
    },
    "risks": [
      {
        "severity": "high",
        "change": "Uncommitted HTTP feature spans tracked and untracked files",
        "impact": "A release from HEAD omits the entire HTTP implementation. Committing only the tracked diff would advertise a script and documentation target whose files are missing.",
        "requiredAction": "Review and include the implementation, tests, launcher, helper and documentation together in a coherent commit/PR before release."
      },
      {
        "severity": "high",
        "change": "Remote callers share one Action1 credential and organization scope",
        "impact": "Any portal-authorized caller receives that scope; report-category metadata remains credential-wide. The origin does not enforce per-user tenant/role mappings.",
        "requiredAction": "Approve identities against the entire exposed scope; use separate instances/tokens/policies for distinct scopes and verify denied identities.",
        "evidence": ["src/http.mjs:31", "src/server.mjs:26", "CLOUDFLARE.md"]
      },
      {
        "severity": "medium",
        "change": "HTTP joins other processes using the Action1 quota",
        "impact": "Pacing is shared within this HTTP process, while stdio/dashboard processes have separate queues. Parallel use can still exhaust the enterprise quota.",
        "requiredAction": "Validate expected combined load and coordinate gateway processes as documented in README.md."
      }
    ]
  },
  "blockers": [
    {
      "id": "B1",
      "scope": "Persistent HTTP launch",
      "status": "recorded unresolved; not rechecked live",
      "detail": "Latest acceptance notes found ACTION1_HTTP_TOKE instead of required ACTION1_HTTP_TOKEN in the 1Password Environment. The temporary acceptance token does not establish persistent launch readiness.",
      "exitCriterion": "Correct the concealed variable name through approved 1Password access and verify the real launcher without printing secrets.",
      "evidence": ["VALIDATION.md:8", "src/http.mjs:25"]
    },
    {
      "id": "B2",
      "scope": "Cloudflare and ChatGPT release",
      "status": "recorded unresolved; not rechecked live",
      "detail": "Access to the intended existing Zero Trust team or account activation remains pending. No tunnel, private route, portal or policy is recorded as created; approved emails/group remain unspecified.",
      "exitCriterion": "Resolve account access/activation and approved identities, configure private routing and portal policies, then pass allowed-user, denied-user, unauthenticated-origin and real ChatGPT read checks.",
      "evidence": ["VALIDATION.md:7", "VALIDATION.md:15", "CLOUDFLARE.md"]
    },
    {
      "id": "B3",
      "scope": "Full ten-tool NA-2 production acceptance",
      "status": "missing validation",
      "detail": "Fresh organization/inventory success supersedes the older blanket OAuth blocker, but does not validate individual asset status, report traversal/rows/CSV/errors or deployment monitoring against NA-2. Historical EU successes and report HTTP 403 do not establish current NA-2 behavior or permissions.",
      "exitCriterion": "Run bounded read-only NA-2 acceptance in confirmed scope using real discovered IDs; record each route as passed, failed or skipped and resolve release-critical gaps.",
      "evidence": ["VALIDATION.md:19", "VALIDATION.md:23", "scripts/validate-live.mjs"]
    }
  ],
  "validation": {
    "performedThisReview": [
      { "command": "node --version", "result": "v26.12.0; satisfies Node >=22" },
      { "command": "npm test", "result": "17 passed; 0 failed; 0 skipped", "breakdown": { "gateway": 8, "dashboard": 5, "http": 4 } },
      { "command": "PowerShell AST ParseFile for all three root .ps1 scripts", "result": "0 parse errors; runtime injection and environment restoration not exercised" },
      { "command": "npm audit --omit=dev --json", "result": "0 known vulnerabilities reported for the installed production dependency tree; not a comprehensive security assessment" },
      { "command": "gh release list --limit 5; gh run list --limit 5 --json status,conclusion,headSha,name", "result": "No releases or workflow runs returned. No .github workflow files found in the checkout." }
    ],
    "recordedLiveEvidenceNotRerun": [
      "2026-10-16: fresh NA-2 stdio launch discovered ten tools; organization discovery and bounded inventory read succeeded; dashboard rendered live summaries.",
      "2026-10-19: temporary loopback HTTP discovered ten tools, authenticated organization read succeeded and unauthenticated request returned 401.",
      "Earlier EU acceptance exercised asset/deployment reads, but report-category children returned 403 and report retrieval was not validated. These results do not validate NA-2."
    ],
    "missing": [
      "NA-2 individual asset status, freshness interpretation, report category traversal, actual report rows/CSV/errors and all deployment monitoring routes.",
      "Persistent HTTP token injection through Start-Action1HttpGateway.ps1; launcher failure and environment-restoration behavior beyond syntax parsing.",
      "Cloudflare private route, upstream Ready state, portal OAuth, identity allow/deny checks, scope denial and an actual bounded ChatGPT tool call.",
      "HTTP default four-request saturation and slot recovery after completion/disconnect: the existing concurrency test uses maxConcurrent=0 and verifies immediate rejection only.",
      "HTTP upstream-failure redaction and long-running request/disconnect behavior are not directly exercised by the four HTTP tests; lower-layer/dashboard redaction tests provide partial coverage.",
      "Combined-process quota behavior and sustained remote load; automated regression tests use synthetic API responses."
    ],
    "acceptanceHelperCaveat": {
      "evidence": "scripts/check-http-live.mjs:33",
      "detail": "The passed flag checks tool count/read-only annotations and unauthenticated 401, after a non-error organization call. It reports organizationCount and truncated without requiring a nonempty complete authorized scope, and does not read assets or exercise Cloudflare.",
      "impact": "Do not interpret passed=true as complete tenant, persistent-token or portal acceptance; review the accompanying fields and run explicit scope/tool checks."
    }
  },
  "documentationGaps": [
    {
      "files": ["AGENTS.md:24", "CODEX-HANDOFF.md:28"],
      "gap": "Still present the October 15 OAuth HTTP 400 as the current blanket NA-2 blocker and retain older test counts; later acceptance records fresh credential success and the suite now has 17 tests.",
      "action": "Update current-status guidance while preserving dated history and the remaining report/deployment validation gaps."
    },
    {
      "files": ["VALIDATION.md:7", "VALIDATION.md:13", "VALIDATION.md:14"],
      "gap": "The same current section mixes the newer signed-in browser/successful 1Password MCP follow-up with earlier sign-in/approval-blocked statements without clearly labeling the latter as superseded.",
      "action": "Separate current blockers from chronological earlier attempts so readers can identify the next required action."
    },
    {
      "files": ["CLOUDFLARE.md", "VALIDATION.md"],
      "gap": "Remote operating ownership, token rotation/revocation, unattended 1Password identity/recovery and completed end-to-end evidence are not established. The runbook already warns against unattended service registration before these choices.",
      "action": "Record the approved runtime/recovery procedure and sanitized final acceptance evidence before operating the portal as a production service."
    },
    {
      "files": ["README.md", "CODEX-HANDOFF.md"],
      "gap": "README retains local-only wording alongside the new optional HTTP section; the handoff still describes an exported folder without Git metadata and omits newer dashboard/HTTP status.",
      "action": "Align the project overview and handoff with committed versus pending transports and current repository state."
    }
  ],
  "releaseRecommendation": {
    "decision": "NO RELEASE",
    "scope": "Pending HTTP/Cloudflare feature and any claim of complete ten-tool NA-2 production readiness",
    "reason": "Local checks pass, but the HTTP feature is uncommitted, persistent origin authentication and Cloudflare access/setup remain unresolved in the notes, and important NA-2 routes plus end-to-end authorization are unvalidated.",
    "existingLocalUse": "Current evidence supports continued bounded local stdio/dashboard evaluation within documented limitations.",
    "releaseWhen": "Commit and review the complete feature, resolve B1-B3, complete the relevant authorization/runtime checks and reconcile current-status documentation."
  }
}
