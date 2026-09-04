// Exercise the real electron-updater download pipeline with an inert local fixture.
// Installer execution is intercepted in the test process; no Windows installation occurs.
import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-updater-'));
const bytes = Buffer.alloc(4 * 1024 * 1024, 78); // Deliberately not an executable.
const sha512 = createHash('sha512').update(bytes).digest('base64');
const version = '99.0.0', filename = `Nexus-Hub-Setup-${version}.exe`;
let downloads = 0, offline = false;
const server = http.createServer((req, res) => {
  if (offline) { res.writeHead(503); return res.end('Test offline'); }
  if (req.url.startsWith('/latest.yml')) { res.setHeader('Content-Type', 'text/yaml'); return res.end(`version: ${version}\nfiles:\n  - url: ${filename}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${filename}\nsha512: ${sha512}\nreleaseDate: 2026-09-04T12:00:00.000Z\n`); }
  if (req.url === '/' + filename) {
    downloads++; res.setHeader('Content-Length', bytes.length); let offset = 0;
    const timer = setInterval(() => { if (offset >= bytes.length) { clearInterval(timer); res.end(); } else { res.write(bytes.subarray(offset, offset + 262144)); offset += 262144; } }, 100);
    res.on('close', () => clearInterval(timer)); return;
  }
  res.writeHead(404); res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const config = path.join(userData, 'app-update.yml');
// A unique cache name keeps test fixtures away from the user's real update cache.
await fs.writeFile(config, `provider: generic\nurl: ${url}\nupdaterCacheDirName: ${path.basename(userData)}\n`);
const env = { ...process.env, NEXUS_TEST_DATA: userData }; delete env.ELECTRON_RUN_AS_NODE;
const options = process.env.NEXUS_TEST_EXE ? { executablePath: process.env.NEXUS_TEST_EXE } : { args: ['.'] };
let desktop;
try {
  desktop = await electron.launch({ ...options, env, timeout: 45000 });
  const page = await desktop.firstWindow(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: 'Alles onder controle.' }).waitFor();
  await desktop.evaluate(({ app }, config) => {
    const u = app.nexusTestUpdates; u.enabled = true; u.stop();
    u.engine.updateConfigPath = config; u.engine.forceDevUpdateConfig = true; u.engine.disableDifferentialDownload = true;
    app.nexusInstallCalls = []; u.engine.quitAndInstall = (...args) => app.nexusInstallCalls.push(args);
    u.set({ status: 'idle' });
  }, config);
  await page.getByRole('button', { name: 'Instellingen', exact: true }).click();
  await page.getByRole('switch', { name: 'Automatisch controleren op updates' }).click();
  assert.equal((await page.evaluate(() => window.nexus.bootstrap())).state.settings.checkUpdates, false);
  await page.evaluate(() => window.nexus.notes('Preserve updater test notes'));
  offline = true;
  await page.getByRole('button', { name: 'Controleren op updates', exact: true }).click();
  await page.locator('.update-settings [data-update-status="error"]').waitFor();
  offline = false;
  await page.getByRole('button', { name: 'Controleren op updates', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(`Nexus Hub ${version}`, { exact: true }).waitFor();
  assert.equal(downloads, 0); assert.equal((await desktop.evaluate(({ app }) => app.nexusInstallCalls)).length, 0);
  await fs.mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/1.2.0-update-available.png' });
  await dialog.getByRole('button', { name: 'Later', exact: true }).click();
  await page.getByRole('button', { name: 'Nexus-update bekijken' }).click();
  await dialog.getByRole('button', { name: 'Update downloaden', exact: true }).click();
  await dialog.getByRole('progressbar', { name: 'Update downloaden' }).waitFor();
  await dialog.getByRole('button', { name: 'Op de achtergrond', exact: true }).click();
  await dialog.getByRole('button', { name: 'Installeren en herstarten', exact: true }).waitFor({ timeout: 30000 });
  assert.equal(downloads, 1); assert.equal((await desktop.evaluate(({ app }) => app.nexusInstallCalls)).length, 0);
  await page.screenshot({ path: 'artifacts/1.2.0-update-ready.png' });
  console.log('PASS: Error recovery, new-version prompt, Later, real download and SHA-512 verification; no automatic install.');
  // The real bridge must finish restoring before the updater is invoked.
  await page.waitForFunction(async () => (await window.nexus.bootstrap()).state.nativeReady, null, { timeout: 30000 });
  await desktop.evaluate(({ app }) => {
    const bridge = app.nexusTestDesktop, request = bridge.request.bind(bridge);
    app.nexusRestored = false;
    bridge.request = async (command, ...args) => { const result = await request(command, ...args); if (command === 'release-all') app.nexusRestored = true; return result; };
    const invoke = app.nexusTestUpdates.engine.quitAndInstall;
    app.nexusTestUpdates.engine.quitAndInstall = (...args) => { if (!app.nexusRestored) throw new Error('Native windows not restored'); invoke(...args); };
  });
  await dialog.getByRole('button', { name: 'Installeren en herstarten', exact: true }).click();
  await page.waitForFunction(async () => (await window.nexus.bootstrap()).state.updates.status === 'installing');
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.deepEqual(await desktop.evaluate(({ app }) => app.nexusInstallCalls), [[false, true]]);
  const state = (await page.evaluate(() => window.nexus.bootstrap())).state;
  assert.equal(state.notes, 'Preserve updater test notes'); assert.equal(state.settings.checkUpdates, false);
  assert.ok(state.displayTarget.available); assert.equal(await page.locator('.topbar-right .icon-button').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Only the install button invokes the installer, after window restoration; settings, tray UI and pinned display preserved.');
} finally { if (desktop) await desktop.close(); await new Promise(resolve => server.close(resolve)); }
