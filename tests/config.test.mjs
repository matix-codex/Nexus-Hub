import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { safeWebUrl, validateSettings } from '../electron/config.mjs';
import { Store } from '../electron/store.mjs';
test('Web widgets accept only HTTPS URLs without embedded credentials', () => {
  assert.equal(safeWebUrl('javascript:alert(1)'), null);
  assert.equal(safeWebUrl('file:///C:/Windows'), null);
  assert.equal(safeWebUrl('http://example.com'), null);
  assert.equal(safeWebUrl('https://user:password@example.com'), null);
  assert.equal(safeWebUrl('https://example.com/dashboard'), 'https://example.com/dashboard');
});
test('Settings validation discards unrecognized keys and invalid values', () => {
  assert.deepEqual(validateSettings({ theme: 'mint', fullscreen: 'true', autostart: true, command: 'malicious', username: '  Player  ' }), { autostart: true, theme: 'mint', username: 'Player' });
});
test('Atomic persistence preserves layouts, notes and defaults across restart', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-store-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root); store.data.notes = 'Remember this'; store.data.layouts.focus = ['notes']; store.save();
  const reopened = new Store(root);
  assert.equal(reopened.data.notes, 'Remember this'); assert.deepEqual(reopened.data.layouts.focus, ['notes']); assert.ok(reopened.data.layouts.command.length);
});
