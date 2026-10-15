// Preserve the preview command while serving the authenticated local bridge.
import { createDashboardServer } from './server.mjs';
const dashboard = createDashboardServer();
dashboard.server.on('error', () => { console.error('Cannot start preview. Check whether port 8765 is in use.'); process.exitCode = 1; });
dashboard.server.listen(8765, '127.0.0.1', () => console.log('Local: http://127.0.0.1:8765'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await dashboard.close(); process.exit(); });
