import { AppHost } from '../electron/app-host.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-spotify-test-'));
const host = new AppHost(path.resolve('native'), '0', profile, true);
host.on('status', s => console.log('status', s));
try {
  await host.started;
  await host.request('show');
  for (let i = 0; i < 45; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const data = JSON.parse(await host.request('diagnostics'));
    if (data.body?.length > 500 && data.drm !== 'pending') { console.log(JSON.stringify(data, null, 2)); break; }
  }
} finally { host.stop(); }
