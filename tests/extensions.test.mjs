import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Artwork, matchCover } from '../electron/artwork.mjs';
import { parseNvidia, windowsAdapters } from '../electron/hardware.mjs';
import { station, streamUrl } from '../electron/radio.mjs';
test('Cover search accepts exact titles, including trademarks, without mixing editions', () => {
  const items = [{ type: 'app', id: 1, name: 'MySims Kingdom' }, { type: 'app', id: 2, name: 'MySims' }];
  assert.equal(matchCover('MySims™ Kingdom', items)?.id, 1);
  assert.equal(matchCover('MySims Kingdom Deluxe', items), undefined);
  assert.equal(matchCover('MySims', [{ type: 'dlc', id: 2, name: 'MySims' }]), undefined);
});
test('Cover cache survives restart with stable safe asset URLs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-cover-'));
  try {
    const cache = new Artwork(directory); await cache.init(); const game = { id: '../../escape', name: 'Test' };
    await cache.put(game, Buffer.from('fixture'), 'Eigen afbeelding');
    const restored = new Artwork(directory); await restored.init();
    assert.match(restored.forGame(game).artwork, /^nexus-cover:\/\/local\/[a-f0-9]{64}\.jpg\?v=\d+$/);
    assert.equal(restored.forGame(game).artworkSource, 'Eigen afbeelding');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('Multiple NVIDIA cards and unsupported sensors preserve null instead of false zero', () => {
  const gpus = parseNvidia('NVIDIA A, GPU-a, 32, 50, 2048, 8192, 65.2, 175, 1410, 7000, 30\nNVIDIA B, GPU-b, 0, [N/A], 0, 4096, [Not Supported], 120, 300, 405, [N/A]');
  assert.equal(gpus.length, 2); assert.equal(gpus[0].memoryUsed, 2048); assert.equal(gpus[1].usage, 0); assert.equal(gpus[1].temperature, null); assert.equal(gpus[1].power, null);
});
test('Windows engine usage sums processes per engine and keeps physical adapters separate', () => {
  const adapters = windowsAdapters({ engines: [{ Name: 'pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D', UtilizationPercentage: 30 }, { Name: 'pid_2_luid_0x0_0x1_phys_0_eng_0_engtype_3D', UtilizationPercentage: 40 }, { Name: 'pid_2_luid_0x0_0x1_phys_0_eng_1_engtype_Copy', UtilizationPercentage: 20 }, { Name: 'pid_3_luid_0x0_0x2_phys_0_eng_0_engtype_3D', UtilizationPercentage: 5 }] });
  assert.equal(adapters.length, 2); assert.equal(adapters[0].usage, 70); assert.equal(adapters[1].usage, 5);
});
test('Radio station validation rejects executable URLs and credentials and roundtrips favorites', () => {
  for (const url of ['file:///C:/private', 'javascript:alert(1)', 'https://user:password@example.com/stream']) assert.equal(streamUrl(url), null);
  assert.throws(() => station({ name: 'Bad', url: 'spotify:track:1' }));
  const value = station({ stationuuid: 'id-1', name: 'NPO Radio 2', url_resolved: 'https://icecast.omroep.nl/radio2-bb-mp3', codec: 'MP3' });
  assert.deepEqual(station(value), value);
});
