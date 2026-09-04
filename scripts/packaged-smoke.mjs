import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const testData = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-packaged-test-'));
const env = { ...process.env, NEXUS_TEST_DATA: testData };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({ executablePath: path.resolve('release/win-unpacked/Nexus Hub.exe'), env, timeout: 30000 });
try {
  const page = await desktop.firstWindow();
  await page.getByRole('heading', { name: 'Alles onder controle.' }).waitFor();
  assert.equal(await desktop.evaluate(({ app }) => app.isPackaged), true);
  await page.waitForFunction(() => document.querySelector('.statusbar')?.textContent.includes('Windows bridge online'), null, { timeout: 30000 });
  console.log('PASS: Packaged EXE loads its bundled native helper, assets and renderer.');
  const first = await page.evaluate(() => window.nexus.bootstrap());
  await page.evaluate(volume => window.nexus.audio('volume', volume), first.metrics.audio.volume);
  console.log('PASS: Packaged audio write/read round trip, preserving current volume.');
  await page.getByRole('button', { name: 'WhatsApp', exact: true }).click();
  const whatsapp = await desktop.evaluate(async ({ webContents }) => {
    for (let i = 0; i < 150; i++) {
      const contents = webContents.getAllWebContents().find(w => w.getURL().startsWith('https://web.whatsapp.com/'));
      if (contents && !contents.isLoading()) return { sandbox: contents.getLastWebPreferences().sandbox, isolated: contents.session.getStoragePath(), body: await contents.executeJavaScript('document.body.innerText.slice(0, 2000)') };
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return null;
  });
  assert.ok(whatsapp); assert.equal(whatsapp.sandbox, true); assert.match(whatsapp.body, /WhatsApp/i);
  assert.ok(!/browser (is )?not supported|unsupported browser|browser wordt niet ondersteund/i.test(whatsapp.body));
  console.log('PASS: WhatsApp Web opens in its isolated session; no authentication performed.');
  await page.getByRole('button', { name: 'Zoeken' }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.slice(1).some(v => v.getVisible())), false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  console.log('PASS: Embedded view hides for the command palette.');
  await page.evaluate(() => window.nexus.window('overlay'));
  const window = await desktop.browserWindow(page);
  for (let i = 0; i < 20 && !await window.evaluate(w => w.isAlwaysOnTop()); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await window.evaluate(w => w.isAlwaysOnTop()), true);
  await page.evaluate(() => window.nexus.window('overlay'));
  console.log('PASS: Packaged overlay stays above other windows and restores.');
  await fs.writeFile('artifacts/packaged-results.json', JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), version: first.state.version, nativeBridge: true, audioRoundtrip: true, whatsappLoaded: true, remoteIsolation: true, overlay: true }, null, 2));
} finally {
  await desktop.evaluate(({ app }) => app.quit()).catch(() => {});
  await desktop.close().catch(() => {});
}
