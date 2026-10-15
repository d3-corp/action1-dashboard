import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('../test/dashboard.test.mjs', import.meta.url))], { stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
