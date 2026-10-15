import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const codex = process.argv[2];
const config = JSON.parse(execFileSync(codex, ['mcp', 'get', 'action1', '--json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
const client = new Client({ name: 'action1-registration-check', version: '1.0' });
const transport = new StdioClientTransport({ command: config.transport.command, args: config.transport.args, env: config.transport.env || {}, stderr: 'pipe' });
let stderr = '';
transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
try {
  await client.connect(transport, { timeout: 60000 });
  const tools = (await client.listTools()).tools;
  const result = await client.callTool({ name: 'list_organizations', arguments: { limit: 10, maxPages: 1 } }, undefined, { timeout: 180000 });
  const message = result.content?.[0]?.text || '';
  console.log(JSON.stringify({ registered: config.enabled, toolCount: tools.length, authenticatedRead: !result.isError,
    ...(result.isError ? { error: message.match(/HTTP \d{3}/)?.[0] || (/Configure Action1 credentials/.test(message) ? 'Missing credentials' : /scope/.test(message) ? 'Scope denied' : /request failed or timed out/.test(message) ? 'Network or timeout' : /Invalid Action1/.test(message) ? 'Invalid API response' : 'Request failed') } : {}) }));
  if (result.isError || tools.length !== 10) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ failed: true, errorClass: error.constructor.name, errorCode: error.code,
    connectionClosed: /closed/i.test(error.message), timeout: /timeout|timed out/i.test(error.message),
    launcherFailed: /Unable to launch Action1 gateway/.test(stderr),
    noAccount: /No accounts configured/.test(stderr),
    authenticationFailed: /failed to initialize session|not authorized|authentication/i.test(stderr),
    parameterFailure: /parameter|argument/i.test(stderr), stderrPresent: Boolean(stderr) })); process.exitCode = 1;
} finally { await client.close(); }
