import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseVdf, scanSteam, scanEpic, classifyProgram, executableFromIcon, deduplicateGames } from '../electron/games.mjs';

test('Valve KeyValues parses nested libraries, escaped Windows paths and comments', () => {
  const parsed = parseVdf('"libraryfolders" { // comment\n "0" { "path" "D:\\\\Steam" "apps" { "570" "42" } } "1" "E:\\\\Games" }');
  assert.equal(parsed.libraryfolders['0'].path, 'D:\\Steam');
  assert.equal(parsed.libraryfolders['0'].apps['570'], '42');
  assert.equal(parsed.libraryfolders['1'], 'E:\\Games');
});
test('Steam discovers additional libraries and ignores broken, incomplete and runtime manifests', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-steam-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const extra = path.join(root, 'Extra');
  await fs.mkdir(path.join(root, 'steamapps'), { recursive: true });
  await fs.mkdir(path.join(extra, 'steamapps', 'common', 'RealGame'), { recursive: true });
  await fs.writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "1" { "path" "${extra.replaceAll('\\', '\\\\')}" } }`);
  await fs.writeFile(path.join(extra, 'steamapps', 'appmanifest_42.acf'), '"AppState" { "appid" "42" "name" "A Real Game" "StateFlags" "4" "installdir" "RealGame" }');
  await fs.writeFile(path.join(extra, 'steamapps', 'appmanifest_43.acf'), '"AppState" { "appid" "43" "name" "Incomplete" "StateFlags" "2" "installdir" "RealGame" }');
  await fs.writeFile(path.join(extra, 'steamapps', 'appmanifest_44.acf'), 'broken');
  const games = await scanSteam(root);
  assert.equal(games.length, 1); assert.equal(games[0].target, 'steam://rungameid/42');
});
test('Epic builds launch URI from manifest and skips incomplete installations', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-epic-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const item = { DisplayName: 'Real Game', AppName: 'app', CatalogNamespace: 'space', CatalogItemId: 'item', InstallLocation: root, AppCategories: ['games'] };
  await fs.writeFile(path.join(root, 'real.item'), JSON.stringify(item));
  await fs.writeFile(path.join(root, 'bad.item'), JSON.stringify({ ...item, bIsIncompleteInstall: true }));
  const games = await scanEpic(root);
  assert.equal(games.length, 1); assert.match(games[0].target, /space%3Aitem%3Aapp\?action=launch/);
});
test('Detection never chooses uninstallers and does not treat launchers as games', () => {
  assert.equal(classifyProgram({ name: 'Rockstar Games Launcher', publisher: 'Rockstar' }), null);
  assert.equal(classifyProgram({ name: 'Red Dead Redemption 2', publisher: 'Rockstar Games' }), 'Rockstar');
  assert.equal(executableFromIcon('"C:\\Games\\Red Dead\\RDR2.exe",0'), 'C:\\Games\\Red Dead\\RDR2.exe');
  assert.equal(executableFromIcon('C:\\Games\\uninstall.exe'), null);
  assert.equal(executableFromIcon('C:\\Games\\game.exe -run'), null);
});
test('Duplicate records merge only within the same store', () => {
  const games = deduplicateGames([{ name: 'Game', source: 'Steam' }, { name: 'Game™', source: 'Steam' }, { name: 'Game', source: 'Xbox' }]);
  assert.equal(games.length, 2);
});
