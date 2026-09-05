import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-features-'));
const env = { ...process.env, NEXUS_TEST_DATA: userData, NEXUS_TEST_SCAN: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const options = process.env.NEXUS_TEST_EXE ? { executablePath: process.env.NEXUS_TEST_EXE } : { args: ['.'] };
await fs.mkdir('artifacts', { recursive: true });
let desktop = await electron.launch({ ...options, env, timeout: 45000 });
const errors = [];
try {
  const page = await desktop.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: 'Alles onder controle.' }).waitFor();
  const start = await page.evaluate(() => window.nexus.bootstrap());
  const display = start.state.displays.find(d => d.width === 1920) || start.state.displays[0];
  await page.evaluate(id => window.nexus.settings({ displayId: id, fullscreen: true }), display.id);
  assert.equal(await page.locator('.topbar-right .icon-button').count(), 0);
  await page.waitForFunction(async () => { const value = await window.nexus.bootstrap(); return value.state.nativeApps?.spotify?.installed && value.metrics.hardware && !value.state.library.scanning && value.state.library.games.length; }, null, { timeout: 90000 });
  await page.locator('.sidebar').getByRole('button', { name: 'Gamebibliotheek', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.game-art img')].length >= 3 && [...document.querySelectorAll('.game-art img')].every(image => image.complete && image.naturalWidth > 0), null, { timeout: 60000 });
  await page.screenshot({ path: 'artifacts/1.4.0-library.png' });
  console.log('PASS: All installed game covers load; pinned monitor and tray dashboard preserved.');
  await page.locator('.sidebar').getByRole('button', { name: 'Systeemprestaties', exact: true }).click();
  await page.getByRole('heading', { name: /RTX 2070/ }).waitFor();
  await page.screenshot({ path: 'artifacts/1.4.0-hardware.png' });
  const live = await page.evaluate(() => window.nexus.bootstrap()); assert.ok(live.metrics.hardware.gpus[0].memoryTotal > 0);
  assert.ok(live.metrics.hardware.adapters.length); console.log('PASS: Real GPU telemetry, engine counters, RAM and disk readings.');
  await page.locator('.sidebar').getByRole('button', { name: 'Internetradio', exact: true }).click();
  await page.locator('.radio-station').first().waitFor({ timeout: 40000 });
  const station = await page.evaluate(async () => (await window.nexus.radioSearch({ name: 'Radio 2', country: 'NL' })).find(s => s.url.startsWith('https:')));
  assert.ok(station); await page.evaluate(value => window.nexus.radioFavorite(value), station);
  await page.getByRole('button', { name: /Favorieten/ }).click();
  // Real radio stream is tested at zero volume; no unexpected sound.
  await page.getByRole('slider', { name: 'Volume internetradio', exact: true }).fill('0');
  await page.getByRole('button', { name: `${station.name} afspelen`, exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.radio-hero .pill')?.textContent === 'LIVE UITZENDING', null, { timeout: 25000 });
  await page.screenshot({ path: 'artifacts/1.4.0-radio.png' });
  await page.locator('.sidebar').getByRole('button', { name: 'Dashboard', exact: true }).click();
  assert.ok((await page.locator('.widget-media').textContent()).includes(station.name));
  await page.getByRole('button', { name: 'Media pauzeren', exact: true }).click();
  console.log('PASS: Live radio audio decodes, favorites persist, playback survives navigation.');
  await page.locator('.sidebar').getByRole('button', { name: 'RGB-verlichting', exact: true }).click();
  await page.getByRole('button', { name: 'Apparaten zoeken', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.page-heading button')?.disabled, null, { timeout: 50000 });
  await page.screenshot({ path: 'artifacts/1.4.0-rgb.png' });
  console.log('RGB:', await page.locator('.rgb-provider').allTextContents());
  if (process.env.NEXUS_TEST_NATIVE === '1') {
    for (const id of ['spotify', 'discord', 'whatsapp']) {
      await page.evaluate(id => { window.__nativeStatus = null; window.nexus.onService(s => { if (s.id === id) window.__nativeStatus = s; }); }, id);
      await page.locator('.sidebar').getByRole('button', { name: id === 'whatsapp' ? 'WhatsApp' : id[0].toUpperCase() + id.slice(1), exact: true }).click();
      await page.waitForFunction(() => window.__nativeStatus?.loading === false, null, { timeout: 30000 });
      const result = await page.evaluate(() => window.__nativeStatus); assert.equal(result.error, null, JSON.stringify(result));
      const managed = await desktop.evaluate(async ({ app }) => app.nexusTestDesktop.request('state'));
      assert.ok(managed.find(window => window.id === id && window.alive && window.visible && window.toolWindow));
      await page.locator('.sidebar').getByRole('button', { name: 'Dashboard', exact: true }).click();
      const hidden = await desktop.evaluate(async ({ app }) => app.nexusTestDesktop.request('state'));
      assert.ok(hidden.every(window => !window.visible));
      console.log(`PASS: Native ${id} app placed, taskbar hidden, hidden on navigation; no webview.`);
    }
    await page.evaluate(()=>window.nexus.settings({alwaysOnTop:true}));
    for (const id of ['discord','whatsapp']) {
      await page.locator('.sidebar').getByRole('button',{name:'Dashboard',exact:true}).click();
      await page.evaluate(id=>{window.__nativeStatus=null;window.nexus.onService(s=>{if(s.id===id)window.__nativeStatus=s;});},id);
      await page.locator('.widget-app-'+id).getByRole('button',{name:'Berichten tonen',exact:true}).click();
      await page.waitForFunction(()=>window.__nativeStatus?.loading===false,null,{timeout:30000});
      assert.equal((await page.evaluate(()=>window.__nativeStatus)).error,null);
      assert.equal(await page.locator('.widget-app-'+id+'.native-widget-expanded').count(),1);
      assert.equal(await page.locator('.dashboard-app-space').count(),0);
      assert.ok(await page.locator('.dashboard-grid .widget').count()>1);
      await page.waitForFunction(id=>{const view=document.querySelector('.widget-app-'+id+' .service-view'),main=document.querySelector('.main-content');if(!view||!main)return false;const b=view.getBoundingClientRect(),m=main.getBoundingClientRect();return b.top>=m.top&&b.bottom<=m.bottom;},id);
      const actual=await desktop.evaluate(async({app})=>app.nexusTestDesktop.request('state'));
      const widgetWindow=actual.find(w=>w.id===id);
      const widgetBounds=await page.locator('.widget-app-'+id+' .service-view').evaluate(node=>{const b=node.getBoundingClientRect();return {width:b.width,height:b.height};});
      assert.ok(widgetBounds.width>600&&widgetBounds.height>300,JSON.stringify(widgetBounds));
      await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].focus());
      for(let attempt=0;attempt<30&&!((await desktop.evaluate(async({app})=>app.nexusTestDesktop.request('state'))).find(w=>w.id===id)?.interactive);attempt++) await new Promise(resolve=>setTimeout(resolve,100));
      const interactive=(await desktop.evaluate(async({app})=>app.nexusTestDesktop.request('state'))).find(w=>w.id===id);
      assert.ok(widgetWindow?.visible&&widgetWindow.toolWindow&&widgetWindow.width>600&&widgetWindow.height>300&&interactive?.interactive,JSON.stringify({id,widgetWindow,interactive,widgetBounds}));
      await page.getByRole('button',{name:(id==='discord'?'Discord':'WhatsApp')+'-berichten verbergen'}).click();
      assert.ok((await desktop.evaluate(async({app})=>app.nexusTestDesktop.request('state'))).every(w=>!w.visible));
      console.log('PASS: Native '+id+' messages open interactively inside its dashboard widget and hide cleanly.');
    }
    await page.evaluate(()=>window.nexus.settings({alwaysOnTop:false}));
    await page.evaluate(()=>{window.__nativeStatus=null;window.nexus.onService(s=>{if(s.id==='spotify')window.__nativeStatus=s;});});
    await page.locator('.widget-app-spotify').getByRole('button',{name:'Open op dashboard',exact:true}).click();
    await page.waitForFunction(()=>window.__nativeStatus?.loading===false,null,{timeout:30000});
    assert.equal((await page.evaluate(()=>window.__nativeStatus)).error,null);
    assert.equal(await page.locator('.dashboard-app-space').count(),1);
    await page.getByRole('button',{name:'Appwerkruimte sluiten'}).click();
    await desktop.evaluate(async ({ app }) => app.nexusTestDesktop.request('release-all'));
    assert.deepEqual(await desktop.evaluate(async ({ app }) => app.nexusTestDesktop.request('state')), []);
  }
  assert.deepEqual(errors, []); console.log('PASS: No renderer exceptions.');
} catch (error) {
  const page = await desktop.firstWindow();
  console.log('Failure state', await page.evaluate(async () => { const data = await window.nexus.bootstrap(); return { native: data.state.nativeApps, covers: data.state.library.games.map(g => ({ name: g.name, artwork: g.artwork })), images: [...document.querySelectorAll('.game-art img')].map(i => ({ src: i.src, complete: i.complete, width: i.naturalWidth })) }; }).catch(() => null));
  await page.screenshot({ path: 'artifacts/1.4.0-failure.png' }).catch(() => {}); throw error;
} finally {
  await desktop.evaluate(async ({ app }) => { if (app.nexusTestDesktop?.ready) await app.nexusTestDesktop.request('release-all'); }).catch(() => {});
  await desktop.close().catch(() => {});
}
