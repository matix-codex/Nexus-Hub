import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-desktop-test-'));
await fs.mkdir('artifacts', { recursive: true });
const env = { ...process.env, NEXUS_TEST_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 30000 });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => { errors.push(error.message); console.error('Renderer error:', error.message); });
  await page.getByRole('heading', { name: 'Alles onder controle.' }).waitFor();
  const initial = await page.evaluate(() => window.nexus.bootstrap());
  assert.ok(initial.state.displays.length > 0);
  console.log('PASS: Native desktop launches, preload loads and displays are detected.');
  await page.waitForFunction(() => document.querySelector('.statusbar')?.textContent.includes('Windows bridge online'), null, { timeout: 30000 });
  const live = await page.evaluate(() => window.nexus.bootstrap());
  assert.ok(live.metrics.ramTotal > 0);
  assert.ok(live.metrics.audio && live.metrics.mic && live.metrics.network);
  console.log('PASS: Live CPU/RAM, audio, microphone, network and media bridge.');
  await page.getByRole('button', { name: 'Instellingen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Je naam', exact: true }).fill('Test Player');
  await page.getByRole('textbox', { name: 'Je naam', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'After hours' }).click();
  const saved = await page.evaluate(() => window.nexus.bootstrap());
  assert.equal(saved.state.settings.username, 'Test Player'); assert.equal(saved.state.settings.theme, 'violet');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('combobox', { name: 'Dashboardprofiel' }).selectOption('focus');
  await page.getByRole('textbox', { name: 'Notities', exact: true }).fill('Native persistence test');
  await page.getByRole('textbox', { name: 'Notities', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Start focus', exact: true }).click();
  const running = await page.evaluate(() => window.nexus.bootstrap());
  assert.ok(running.state.timer.endsAt > Date.now());
  await page.getByRole('button', { name: 'Pauze', exact: true }).click();
  assert.equal((await page.evaluate(() => window.nexus.bootstrap())).state.timer.endsAt, null);
  console.log('PASS: Settings, themes, profile switching, notes and persistent focus timer.');
  await page.getByRole('button', { name: 'Widget', exact: true }).click();
  await page.getByRole('button', { name: /Systeemprestaties Live CPU/ }).click();
  await page.getByRole('button', { name: 'Venster sluiten', exact: true }).click();
  assert.ok((await page.evaluate(() => window.nexus.bootstrap())).state.layouts.focus.includes('system'));
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Zoek in Nexus', exact: true }).fill('bibliotheek');
  await page.getByRole('textbox', { name: 'Zoek in Nexus', exact: true }).press('Enter');
  await page.getByRole('heading', { name: 'Je volgende avontuur.' }).waitFor();
  console.log('PASS: Widget catalogue and keyboard command search.');
  const scan = await page.evaluate(() => window.nexus.scanGames());
  console.log(`PASS: Actual local game scan: ${scan.library.games.length} games, ${scan.library.startApps.length} Windows apps, ${scan.library.warnings.length} warnings.`);
  if (scan.library.games.length) {
    const game = scan.library.games[0];
    await page.evaluate(id => window.nexus.favorite(id), game.id);
    assert.ok((await page.evaluate(() => window.nexus.bootstrap())).state.favorites.includes(game.id));
    await page.getByRole('textbox', { name: 'Games zoeken', exact: true }).fill(game.name);
    assert.ok(await page.getByRole('button', { name: `${game.name} starten`, exact: true }).count());
  }
  await page.evaluate(() => window.nexus.settings({ profile: 'command', theme: 'mint', username: '', density: 'comfortable' }));
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const bw = await app.browserWindow(page);
  for (const [name, width, height] of [['desktop', 1600, 960], ['ultrawide', 2560, 720], ['overlay', 536, 830]]) {
    await bw.evaluate((window, bounds) => window.setBounds({ x: 0, y: 0, ...bounds }), { width, height });
    await page.waitForFunction(width => window.innerWidth === width, width);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('.main-content').scrollWidth > document.querySelector('.main-content').clientWidth);
    assert.equal(overflow, false, `${name} horizontal overflow`);
    if (name === 'ultrawide') assert.equal(await page.evaluate(() => document.querySelector('.main-content').scrollHeight > document.querySelector('.main-content').clientHeight), false, 'The default ultrawide dashboard must fit without scrolling');
    await page.screenshot({ path: `artifacts/${name}.png` });
  }
  console.log('PASS: Responsive desktop, 2560×720 ultrawide and compact overlay layouts.');
  await bw.evaluate(window => window.setBounds({ x: 0, y: 0, width: 1280, height: 900 }));
  await page.evaluate(() => window.nexus.window('fullscreen'));
  assert.equal((await page.evaluate(() => window.nexus.bootstrap())).state.fullscreen, true);
  await page.keyboard.press('Escape');
  for (let i = 0; i < 30 && (await page.evaluate(() => window.nexus.bootstrap())).state.fullscreen; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await page.evaluate(() => window.nexus.bootstrap())).state.fullscreen, false);
  console.log('PASS: Fullscreen entry and Escape recovery.');
  await page.evaluate(() => window.nexus.window('overlay'));
  assert.equal((await page.evaluate(() => window.nexus.bootstrap())).state.overlay, true);
  for (let i = 0; i < 20 && !await bw.evaluate(window => window.isAlwaysOnTop()); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await bw.evaluate(window => window.isAlwaysOnTop()), true);
  await page.evaluate(() => window.nexus.window('overlay'));
  assert.equal((await page.evaluate(() => window.nexus.bootstrap())).state.overlay, false);
  console.log('PASS: Native overlay sizing, always-on-top and restoration.');
  const widgetState = await page.evaluate(() => window.nexus.webWidget({ name: 'Security test', url: 'https://example.com/' }));
  await page.evaluate(id => window.nexus.service('open', id), widgetState.webWidgets.at(-1).id);
  const remote = await app.evaluate(async ({ webContents }) => {
    for (let i = 0; i < 100; i++) {
      const contents = webContents.getAllWebContents().find(w => w.getURL().startsWith('https://example.com/'));
      if (contents) return { id: contents.id, preferences: contents.getLastWebPreferences(), hasBridge: await contents.executeJavaScript('typeof window.nexus !== "undefined" || typeof require !== "undefined"') };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  });
  assert.ok(remote, 'Custom web widget must exist');
  assert.equal(remote.preferences.sandbox, true); assert.equal(remote.preferences.nodeIntegration, false); assert.equal(remote.hasBridge, false);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  console.log('PASS: Custom web widget loads in a sandbox without access to the Windows bridge.');
  await assert.rejects(() => page.evaluate(() => window.nexus.webWidget({ name: 'Unsafe', url: 'file:///C:/Windows' })));
  await assert.rejects(() => page.evaluate(() => window.nexus.launchGame('untrusted-id')));
  await assert.rejects(() => page.evaluate(() => window.nexus.audio('volume', 500)));
  console.log('PASS: Unsafe web URLs, unknown launch targets and invalid native actions are rejected.');
  const onDisk = JSON.parse(await fs.readFile(path.join(userData, 'nexus.json'), 'utf8'));
  assert.equal(onDisk.notes, 'Native persistence test');
  assert.equal(onDisk.settings.theme, 'mint');
  assert.deepEqual(errors, []);
  await fs.writeFile('artifacts/smoke-results.json', JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), gamesDetected: scan.library.games.length, gameSources: [...new Set(scan.library.games.map(g => g.source))], displays: initial.state.displays.map(d => ({ label: d.label, width: d.width, height: d.height })), runtimeErrors: errors }, null, 2));
  console.log('PASS: No renderer runtime errors. All desktop checks passed.');
} catch (error) {
  const page = app.windows()[0];
  await page?.screenshot({ path: 'artifacts/failure.png' }).catch(() => {});
  console.log('Failure URL and visible page:', await page?.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 3000) })).catch(() => null));
  throw error;
} finally {
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
  // Preserve this isolated profile for diagnostics; never touch the user's real profile.
  console.log(`Isolated test profile: ${userData}`);
}
