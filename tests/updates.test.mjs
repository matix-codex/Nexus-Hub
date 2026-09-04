import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Updates, newerStable, updateFile, verifyInstaller, CHECK_INTERVAL } from '../electron/updates.mjs';
import { Store } from '../electron/store.mjs';
import { validateSettings } from '../electron/config.mjs';

const bytes = Buffer.from('Nexus installer fixture');
const info = { version: '1.3.0', files: [{ url: 'Nexus-Hub-Setup-1.3.0.exe', size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') }] };
function fixture(options = {}) {
  const engine = new EventEmitter(); const calls = [];
  engine.checkForUpdates = async () => { calls.push('check'); return { updateInfo: info }; };
  engine.downloadUpdate = async () => { calls.push('download'); return ['fixture.exe']; };
  engine.quitAndInstall = (silent, restart) => { calls.push(['install', silent, restart]); };
  const updates = new Updates({ engine, version: '1.2.0', enabled: true, verify: async () => { calls.push('verify'); }, prepareInstall: async () => { calls.push('restore windows'); }, ...options });
  return { engine, updates, calls };
}
test('Only newer stable versions and the exact Nexus installer with integrity metadata are accepted', () => {
  for (const v of ['1.2.0', '1.1.9', '1.3.0-beta.1', 'v1.3.0', '01.3.0', 'garbage']) assert.equal(newerStable(v, '1.2.0'), false, v);
  assert.equal(newerStable('1.10.0', '1.9.0'), true);
  assert.equal(newerStable('2.0.0', '1.999.0'), true);
  assert.deepEqual(updateFile(info, '1.2.0'), info.files[0]);
  for (const patch of [{ url: 'https://example.com/payload.exe' }, { url: '../Nexus-Hub-Setup-1.3.0.exe' }, { sha512: '' }, { size: 0 }]) assert.throws(() => updateFile({ ...info, files: [{ ...info.files[0], ...patch }] }, '1.2.0'));
});
test('Checking and deferring never downloads or installs; repeated checks do not repeat the prompt', async () => {
  const { engine, updates, calls } = fixture();
  assert.equal(engine.autoDownload, false); assert.equal(engine.autoInstallOnAppQuit, false);
  assert.equal(engine.allowPrerelease, false); assert.equal(engine.allowDowngrade, false);
  const a = updates.check(), b = updates.check(); assert.equal(a, b); await a;
  assert.equal(updates.state.status, 'available'); assert.equal(updates.state.prompt, 1);
  await updates.check(); await updates.install();
  assert.equal(updates.state.prompt, 1); assert.deepEqual(calls, ['check', 'check']);
});
test('Consent gates download and install; windows restore before installer; downloaded update survives periodic checks', async () => {
  const { updates, calls } = fixture();
  await updates.check(); await updates.download();
  assert.equal(updates.state.status, 'downloaded'); assert.deepEqual(calls, ['check', 'download', 'verify']);
  await updates.check(); assert.equal(calls.length, 3);
  const a = updates.install(), b = updates.install(); assert.equal(a, b); await a;
  assert.deepEqual(calls, ['check', 'download', 'verify', 'verify', 'restore windows', ['install', false, true]]);
});
test('Network failures recover; old versions are not offered; broken metadata cannot install', async () => {
  const { updates, engine, calls } = fixture();
  engine.checkForUpdates = async () => { throw new Error('ENOTFOUND github.com'); };
  await updates.check(); assert.equal(updates.state.status, 'error'); assert.match(updates.state.error, /internetverbinding/);
  engine.checkForUpdates = async () => ({ updateInfo: { version: '1.1.0' } });
  await updates.check(); assert.equal(updates.state.status, 'current');
  engine.checkForUpdates = async () => ({ updateInfo: { version: '1.3.0', files: [] } });
  await updates.check(); await updates.download(); await updates.install();
  assert.equal(updates.state.status, 'error'); assert.deepEqual(calls, []);
});
test('Failed native-window restoration blocks installation and permits retry', async () => {
  let fail = true, recovered = 0;
  const { updates, calls } = fixture({ prepareInstall: async () => { if (fail) throw new Error('Native window timeout'); }, installFailed: () => recovered++ });
  await updates.check(); await updates.download(); await updates.install();
  assert.equal(updates.state.status, 'error'); assert.equal(updates.state.retry, 'install');
  assert.equal(recovered, 1); assert.ok(!calls.some(Array.isArray));
  fail = false; await updates.install(); assert.deepEqual(calls.at(-1), ['install', false, true]);
});
test('Downloaded bytes are checked again at installation; tampering requires a fresh download', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-update-hash-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'installer.exe'); await fs.writeFile(file, bytes);
  const { updates, engine, calls } = fixture({ verify: verifyInstaller });
  engine.downloadUpdate = async () => [file];
  await updates.check(); await updates.download(); assert.equal(updates.state.status, 'downloaded');
  await fs.writeFile(file, Buffer.alloc(bytes.length, 5)); await updates.install();
  assert.equal(updates.state.status, 'error'); assert.equal(updates.state.retry, 'download');
  assert.equal(updates.installer, null); assert.ok(!calls.some(Array.isArray)); assert.ok(!calls.includes('restore windows'));
  await assert.rejects(verifyInstaller(file, info.files[0]));
});
test('Automatic checks use persisted preference and stop cleanly', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let automatic = false;
  const { updates, calls } = fixture({ automatic: () => automatic });
  updates.start(); t.after(() => updates.stop());
  t.mock.timers.tick(15000); await Promise.resolve(); assert.equal(calls.length, 0);
  automatic = true; t.mock.timers.tick(CHECK_INTERVAL); await updates.busy; assert.equal(calls.length, 1);
  updates.stop(); t.mock.timers.tick(CHECK_INTERVAL); assert.equal(calls.length, 1);
});
test('Upgrading old settings enables checking without changing the saved monitor or notes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-update-store-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'nexus.json'), JSON.stringify({ settings: { displayId: 17 }, notes: 'Keep me' }));
  const store = new Store(root); assert.equal(store.data.settings.checkUpdates, true);
  Object.assign(store.data.settings, validateSettings({ checkUpdates: false })); store.save();
  const next = new Store(root); assert.equal(next.data.settings.checkUpdates, false); assert.equal(next.data.settings.displayId, 17); assert.equal(next.data.notes, 'Keep me');
  assert.deepEqual(validateSettings({ checkUpdates: 'true', updateUrl: 'https://example.com' }), {});
});
