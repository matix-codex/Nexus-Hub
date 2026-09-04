import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const env = { ...process.env, NEXUS_TEST_DATA: await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-native-apps-')) };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ ...(process.env.NEXUS_TEST_EXE ? { executablePath: process.env.NEXUS_TEST_EXE } : { args: ['.'] }), env, timeout: 45000 });
try {
  const page = await desktop.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: 'Alles onder controle.' }).waitFor();
  const initial = await page.evaluate(() => window.nexus.bootstrap());
  await page.evaluate(id => window.nexus.settings({ displayId: id, fullscreen: true, alwaysOnTop: true }), initial.state.displays.find(d => d.primary).id);
  await page.waitForFunction(async () => { const s=(await window.nexus.bootstrap()).state; return s.desktopReady && s.nativeApps?.xbox?.installed; }, null, { timeout: 45000 });
  await page.evaluate(() => { window.__nativeStatus = {}; window.nexus.onService(s => { window.__nativeStatus[s.id] = s; }); });
  const managed = () => desktop.evaluate(({ app }) => app.nexusTestDesktop.request('state'));
  async function usable(id, topmost) {
    await page.waitForFunction(id => window.__nativeStatus[id]?.loading === false, id, { timeout: 30000 });
    assert.equal((await page.evaluate(id => window.__nativeStatus[id], id)).error, null);
    try { await assertEventually(async () => (await managed()).some(w => w.id === id && w.visible && w.interactive && w.topmost === topmost && w.toolWindow)); }
    catch (error) { console.log('Window diagnostic', { id, topmost, windows: await managed(), host: await desktop.evaluate(({ BrowserWindow }) => {const w=BrowserWindow.getAllWindows()[0];return {topmost:w.isAlwaysOnTop(),visible:w.isVisible(),focused:w.isFocused(),bounds:w.getBounds()};}) }); throw error; }
  }
  for (const [id, label] of [['spotify', 'Spotify'], ['discord', 'Discord'], ['whatsapp', 'WhatsApp'], ['xbox', 'Xbox']]) {
    await page.locator('.sidebar').getByRole('button', { name: label, exact: true }).click();
    await usable(id, true);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
    await usable(id, true);
    await page.evaluate(() => window.nexus.settings({ alwaysOnTop: false }));
    await usable(id, false);
    await page.evaluate(() => window.nexus.settings({ alwaysOnTop: true }));
    await usable(id, true);
    await page.getByRole('button', { name: 'Zoeken' }).click();
    await assertEventually(async () => (await managed()).every(w => !w.visible));
    await page.getByRole('button', { name: 'Venster sluiten', exact: true }).click();
    await usable(id, true);
    await page.locator('.sidebar').getByRole('button', { name: 'Dashboard', exact: true }).click();
    await assertEventually(async () => (await managed()).every(w => !w.visible));
    console.log(`PASS: ${label} is visible and receives hit tests above Nexus, follows the topmost toggle, and hides for dialogs/navigation.`);
  }
  await page.locator('.widget-app-spotify').getByRole('button', { name: 'Open op dashboard', exact: true }).click();
  await usable('spotify', true);
  await page.locator('.dashboard-app-tabs').getByRole('button', { name: 'Xbox', exact: true }).click();
  await usable('xbox', true);
  await page.evaluate(() => window.nexus.service('hide', 'spotify'));
  await usable('xbox', true);
  await page.getByRole('button', { name: 'Appwerkruimte sluiten' }).click();
  await assertEventually(async () => (await managed()).every(w => !w.visible));
  await desktop.evaluate(({ app }) => app.nexusTestDesktop.request('release-all'));
  assert.deepEqual(await managed(), []); assert.deepEqual(errors, []);
  console.log('PASS: Spotify and Xbox dashboard workspace, stale app cleanup, and native-window release.');
} finally {
  await desktop.evaluate(async ({ app }) => { if (app.nexusTestDesktop?.ready) await app.nexusTestDesktop.request('release-all'); }).catch(() => {});
  await desktop.close();
}
async function assertEventually(check) {
  for (let attempt = 0; attempt < 30; attempt++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.fail('Native window did not reach the expected visibility, hit test or topmost state.');
}
