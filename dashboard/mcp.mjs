import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execute = promisify(execFile);
const allowedTools = new Set(['list_organizations', 'list_assets']);

export function publicError(error) {
  const message = String(error?.message || '');
  const status = message.match(/HTTP (\d{3})/);
  if (status) return `Action1 request failed (HTTP ${status[1]}).`;
  if (/pagination made no progress/.test(message)) return 'Action1 pagination made no progress. Retry the read.';
  if (/NA-2/.test(message)) return 'The Action1 registration must use the confirmed NA-2 region.';
  return 'Cannot read Action1 data. Check the gateway registration and unlock or authorize 1Password, then retry.';
}

export async function connectGateway({ codex = process.env.ACTION1_CODEX_COMMAND || 'codex' } = {}) {
  const { stdout } = await execute(codex, ['mcp', 'get', 'action1', '--json'], {
    encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
  });
  const config = JSON.parse(stdout);
  if (!config.enabled || config.transport?.type !== 'stdio') throw new Error('Gateway is not enabled');
  if (config.transport.env?.ACTION1_BASE_URL !== 'https://app.na-2.action1.com/api/3.0') throw new Error('Expected NA-2');
  const client = new Client({ name: 'action1-insights', version: '2.0.0' });
  const transport = new StdioClientTransport({
    command: config.transport.command, args: config.transport.args,
    env: config.transport.env || {}, stderr: 'pipe',
  });
  // Consume launcher diagnostics without printing credentials or tenant data.
  transport.stderr?.on('data', () => {});
  try {
    await client.connect(transport, { timeout: 60000 });
    return {
      async call(name, args) {
        if (!allowedTools.has(name)) throw new Error('Unsupported dashboard operation');
        const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
        if (result.isError) throw new Error(result.content?.find(c => c.type === 'text')?.text || 'Gateway read failed');
        const data = JSON.parse(result.content.find(c => c.type === 'text').text);
        if (!Array.isArray(data.items)) throw new Error('Invalid gateway collection');
        return { ...data, retrievedAt: new Date().toISOString(), region: 'NA-2' };
      },
      close: () => client.close(),
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
