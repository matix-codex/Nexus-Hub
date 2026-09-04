import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-update-test-'));
const env = { ...process.env, NEXUS_TEST_DATA: data }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.NEXUS_TEST_EXE;
const options = executablePath ? { executablePath } : { args: ['.'] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let desktop = await electron.launch({ ...options, env, timeout: 30000 });
const result = {};
try {
  let page = await desktop.firstWindow();
  await page.getByRole('heading', { name: 'Alles onder controle.' }).waitFor();
  assert.equal(await page.locator('.topbar-right .icon-button').count(), 0);
  result.noWindowControls = true;
  let bootstrap = await page.evaluate(() => window.nexus.bootstrap());
  const target = bootstrap.state.displays.find(d => d.width === 1920) || bootstrap.state.displays[0];
  await page.getByRole('button', { name: 'Instellingen', exact: true }).click();
  await page.locator('.display-cards button').filter({ hasText: target.label }).click();
  await page.evaluate(() => window.nexus.settings({ fullscreen: true }));
  assert.equal((await page.evaluate(() => window.nexus.bootstrap())).state.settings.displayId, target.id);
  assert.equal(await desktop.evaluate(({ BrowserWindow, screen }) => screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).id), target.id);
  await page.screenshot({ path: 'artifacts/settings-1.0.2.png' });
  await page.evaluate(() => window.nexus.window('overlay'));
  assert.equal(await desktop.evaluate(({ BrowserWindow, screen }) => screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).id), target.id);
  await page.evaluate(() => window.nexus.window('overlay'));
  // Simulate monitor removal inside Electron, without changing Windows settings.
  await desktop.evaluate(({ screen }, id) => {
    globalThis.originalDisplays = screen.getAllDisplays;
    screen.getAllDisplays = () => globalThis.originalDisplays().filter(d => d.id !== id);
    screen.emit('display-removed', {}, { id });
  }, target.id);
  await delay(650);
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  const missing = await page.evaluate(() => window.nexus.bootstrap());
  assert.equal(missing.state.settings.displayId, target.id); assert.equal(missing.state.displayTarget.available, false);
  await desktop.evaluate(({ screen }) => { screen.getAllDisplays = globalThis.originalDisplays; screen.emit('display-added', {}, screen.getAllDisplays()[0]); });
  await delay(750);
  console.log('Reconnect', await desktop.evaluate(({ BrowserWindow, screen }) => ({ visible: BrowserWindow.getAllWindows()[0].isVisible(), minimized: BrowserWindow.getAllWindows()[0].isMinimized(), displays: screen.getAllDisplays().map(d => d.id) })), (await page.evaluate(() => window.nexus.bootstrap())).state.displayTarget);
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  result.monitorPersistenceAndReconnect = true;
  await page.locator('.sidebar').getByRole('button', { name: 'Spotify', exact: true }).click();
  let spotify;
  for (let i = 0; i < 45; i++) {
    spotify = await desktop.evaluate(async ({ app }) => app.nexusTestHost?.ready ? JSON.parse(await app.nexusTestHost.request('diagnostics')) : null);
    if (spotify?.drm === true && spotify.body?.includes('Inloggen')) break;
    await delay(1000);
  }
  assert.ok(spotify?.body?.includes('Inloggen'), 'Spotify sign-in UI loads');
  assert.equal(spotify.drm, true, 'Widevine audio API is supported');
  const host = await desktop.evaluate(async ({ app, BrowserWindow }) => ({ ...(await app.nexusTestHost.request('window-state')), expectedParent: BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString() }));
  assert.equal(host.parent, host.expectedParent); assert.equal(host.visible, true);
  assert.ok(host.width > 500 && host.height > 300);
  await page.getByRole('button', { name: 'Zoeken' }).click();
  await page.getByRole('dialog').waitFor();
  await delay(250);
  assert.equal(await desktop.evaluate(async ({ app }) => (await app.nexusTestHost.request('window-state')).visible), false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await delay(200);
  assert.equal(await desktop.evaluate(async ({ app }) => (await app.nexusTestHost.request('window-state')).visible), false);
  result.spotify = { embeddedChild: true, drmSupported: true, signedOutPageLoaded: true, playbackNotTested: true, sessionPath: host.profile };
  for (const id of ['WhatsApp', 'Discord']) {
    await page.getByRole('button', { name: id, exact: true }).click();
    const appState = await desktop.evaluate(async ({ webContents }, name) => {
      for (let i = 0; i < 150; i++) {
        const web = webContents.getAllWebContents().find(w => w.getURL().includes(name.toLowerCase()+'.com'));
        if (web && !web.isLoading()) {
          const body = await web.executeJavaScript('document.body.innerText.slice(0,2000)');
          if (body.toLowerCase().includes(name.toLowerCase())) return { body, session: web.session.getStoragePath(), sandbox: web.getLastWebPreferences().sandbox };
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }, id);
    assert.ok(appState); assert.equal(appState.sandbox, true);
    assert.match(appState.body, new RegExp(id, 'i')); result[id] = { signedOutPageLoaded: true, isolatedSession: appState.session };
  }
  await desktop.evaluate(({ app }) => app.quit()); await desktop.close();
  desktop = await electron.launch({ ...options, env, timeout: 30000 });
  page = await desktop.firstWindow();
  await page.getByRole('heading', { name: 'Alles onder controle.' }).waitFor();
  bootstrap = await page.evaluate(() => window.nexus.bootstrap());
  assert.equal(bootstrap.state.settings.displayId, target.id);
  result.restartPreservesDisplay = true;
  result.version = bootstrap.state.version;
  await fs.writeFile('artifacts/update-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (process.env.NEXUS_VISUAL === '1') {
    await page.locator('.sidebar').getByRole('button', { name: 'Spotify', exact: true }).click();
    console.log('Ready for native visual inspection (2 minutes).');
    await delay(120000);
  }
} finally { await desktop.evaluate(({ app }) => app.quit()).catch(() => {}); await desktop.close().catch(() => {}); }
