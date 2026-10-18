# Action1 through Cloudflare MCP Portal

## Current status

The authenticated private HTTP transport and PowerShell launcher are implemented. Cloudflare account login, an approved user/group policy, an origin token in 1Password, tunnel provisioning, portal registration, and the final ChatGPT connection must still be completed. Passing local tests does not validate Cloudflare or ChatGPT connectivity.

## Connection and trust boundaries

```text
ChatGPT -- OAuth --> Cloudflare MCP Portal + Access allow policies
                             |
                 private Gateway route + Cloudflare Tunnel
                             |
                 private HTTP /mcp + origin bearer token
                             |
                  Action1 API at the fixed NA-2 host
```

The portal authenticates end users with Cloudflare Access. The upstream gateway uses a separate static bearer token; it does not implement end-user OAuth. Configure the upstream MCP server as **Bearer**, not OAuth or unauthenticated. Cloudflare supports upstream bearer credentials and supplies the Authorization header itself. The Action1 client ID and secret stay in 1Password and the gateway process. Do not use either as the origin bearer token or send them to Cloudflare.

All authorized users of this portal share the instance's explicit Action1 organization allowlist. There is no per-user mapping to different Action1 tenants or roles. Use separate gateway instances, origin tokens and portals/policies for different access scopes. Report-category discovery remains global to the configured Action1 API credential, as in the existing stdio gateway; use a suitably scoped read-only Action1 API client. Portal policy must authorize that credential's report metadata as well as the selected organizations.

## Start the private origin

1. In the existing 1Password `action1` Developer Environment, add a concealed `ACTION1_HTTP_TOKEN`. Generate at least 32 random letters/numbers or URL-safe characters. Keep the existing `CLIENT_ID` and `CLIENT_SECRET` variables. Do not paste secret values in chat, arguments, configuration files or logs.
2. Discover and confirm the Action1 organization IDs using the existing gateway. The HTTP launcher requires `-OrganizationId`; it never silently publishes all organizations accessible to a credential.
3. Launch locally first:

   ```powershell
   ./Start-Action1HttpGateway.ps1 -OrganizationId <confirmed-organization-id>
   ```

   This reuses the Environment and account IDs in the saved Codex `action1` registration and runs `op run` directly. If there is no usable registration, provide `-EnvironmentId <id> -AccountId <id>` explicitly. The launcher clears inherited credential/token overrides and restores its parent-process environment on exit. Unlock or authorize 1Password when prompted.

4. For private CIDR routing, bind the specific private IPv4 interface that `cloudflared` can reach on this host:

   ```powershell
   ./Start-Action1HttpGateway.ps1 -OrganizationId <confirmed-organization-id> -ListenAddress <private-origin-ip> -Port 8787
   ```

   The allowed Host defaults to the bind address. If the route uses private DNS, add `-AllowedHost <private-origin-hostname>,<private-origin-ip>`. Never use `0.0.0.0`, a wildcard hostname, or a public bind address. Do not open a public firewall port.

Equivalent Node launch, after 1Password injection: `npm run start:http`.

| Setting | Meaning |
| --- | --- |
| `ACTION1_BASE_URL` | Required exact value `https://app.na-2.action1.com/api/3.0` for HTTP |
| `ACTION1_ORGANIZATION_IDS` | Required comma-separated confirmed organization IDs |
| `ACTION1_HTTP_TOKEN` | Required separate random bearer token from 1Password |
| `ACTION1_HTTP_HOST` | Default `127.0.0.1`; alternatively a specific RFC1918 IPv4 address |
| `ACTION1_HTTP_PORT` | Default `8787` |
| `ACTION1_HTTP_ALLOWED_HOSTS` | Exact comma-separated Host names, without scheme/port/wildcards; defaults to bind IP |

HTTP is stateless Streamable HTTP at `/mcp`. Every request, including `/healthz`, requires `Authorization: Bearer <origin-token>`. GET `/mcp` and DELETE are unsupported and return 405. Clients with browser Origin headers are rejected; portal and ChatGPT requests are server-to-server. Bodies are capped at 64 KiB; at most four HTTP MCP requests execute at once. All requests share one Action1 client and its pacing/token cache. Requests to the local dashboard are separate and are not an MCP endpoint.

## Connect Cloudflare

1. Sign in to the intended Cloudflare account and Zero Trust team. Reuse an existing suitable connector, upstream entry and portal when present. Do not replace unrelated resources or broaden existing access policies.
2. Install `cloudflared` from the official Cloudflare release, or use the official Cloudflare package in WinGet. Create a named, remotely managed Cloudflare Tunnel for this host. Store its credential in 1Password; avoid the dashboard command that puts the tunnel token literally on the command line. Use the supported `TUNNEL_TOKEN` environment variable with 1Password injection instead.
3. Add a private CIDR route for the origin IP `/32`, or a private hostname route resolving to that IP. Keep the origin private; do not create a public hostname route or quick tunnel. Do not advertise the whole corporate subnet.
4. In **Zero Trust > Access controls > MCP Portals > MCP servers**, add **Action1** with HTTP URL `http://<private-origin-ip>:8787/mcp` (or the corresponding private hostname). Turn on **Route traffic through Cloudflare Gateway** for the server; private registration and capability synchronization require it.
5. Configure **Bearer** upstream authentication with the existing `ACTION1_HTTP_TOKEN` value, entered locally from 1Password. This shares only the separate origin credential with Cloudflare. Do not enter Action1's API secret or set up an upstream OAuth flow for this gateway.
6. Give the upstream server an **Allow** policy restricted to the explicitly approved emails or identity group. Apply the same approved-user policy to the portal's Access application. Do not use an Everyone/Bypass policy. Retain the existing identity provider and its MFA policy.
7. Confirm the upstream status becomes **Ready** and review the ten tools and their read-only annotations. Create or reuse an **Action1** portal on the chosen hostname and link the server. Use the shared upstream credential for the mapping (per-user upstream OAuth / **Require user auth** is off); Access still authenticates and authorizes each user at the portal and linked server. Enable only the approved Action1 tools, and do not automatically expose future additions.
8. Confirm the portal URL returns an OAuth challenge for an unauthenticated MCP client. Validate that an allowed identity sees the tools and a disallowed identity cannot use them. The origin must reject a direct request without the separate bearer token.

Keep both the HTTP origin process and `cloudflared` running. A Windows service is suitable for `cloudflared`, but a service running as another Windows account cannot automatically use your interactive 1Password session. Do not register an unattended gateway service until a suitable 1Password runtime identity and recovery policy are chosen. Stop the foreground processes to roll back connectivity; the existing stdio registration remains usable.

## Connect and accept in ChatGPT

In ChatGPT Plugins, add a custom MCP server using the **portal's HTTPS `/mcp` URL**, with OAuth. Complete the Cloudflare Access login, review the discovered tools, and install/select the plugin. The private origin URL and dashboard URL must not be used here. Test organization discovery first, then one bounded asset read in the approved scope. Test a request outside the configured scope and verify denial. Do not initiate deployments or any other Action1 writes.

Acceptance is complete only after a read-only tool call succeeds from ChatGPT through the portal and both denied-user and unauthenticated-origin checks pass. Record counts and success/error summaries only; exclude tenant records and credentials from commits and PRs.

## Verification

- `npm test`: original stdio/in-memory tests plus real HTTP transport, scope, authentication, Host/Origin rejection, body limits, continuation, concurrency limits and dashboard checks.
- `op run --environment <id> -- node scripts/check-http-live.mjs`: bounded, temporary loopback acceptance after setting the confirmed `ACTION1_BASE_URL`. Uses an ephemeral in-memory origin token. Honors an injected organization allowlist; without one, it only selects scope when complete discovery returns exactly one organization. Prints only counts and sanitized status. Does not configure Cloudflare or persist an origin token.
- The portal and ChatGPT require separate end-to-end checks; a temporary loopback success does not validate them.

## References

- [Cloudflare MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)
- [Cloudflare upstream bearer authentication](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/ai_controls/subresources/mcp/subresources/servers/methods/create/)
- [Create a remotely managed Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)
- [Cloudflare Tunnel run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)
- [Connect a custom MCP server in ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
