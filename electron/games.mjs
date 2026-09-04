import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { runPowerShell } from './native.mjs';

const exists = async p => Boolean(p) && fs.access(p).then(() => true, () => false);
const readJson = async p => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; } };
const files = async p => { try { return await fs.readdir(p, { withFileTypes: true }); } catch { return []; } };
export const idFor = (source, value) => `${source.toLowerCase().replace(/[^a-z]/g, '')}-${crypto.createHash('sha256').update(String(value).toLowerCase()).digest('hex').slice(0, 14)}`;

// Valve KeyValues parser: preserves Windows backslashes and nested library objects.
export function parseVdf(text) {
  const tokens = [];
  const pattern = /\/\/[^\n]*|"((?:\\.|[^"\\])*)"|([{}])|([^\s{}"]+)/g;
  for (const match of text.matchAll(pattern)) {
    if (match[0].startsWith('//')) continue;
    tokens.push(match[1] !== undefined ? match[1].replace(/\\([\\"])/g, '$1') : match[2] || match[3]);
  }
  let pos = 0;
  function object() {
    const result = {};
    while (pos < tokens.length) {
      const key = tokens[pos++];
      if (key === '}') break;
      const value = tokens[pos++];
      if (value === undefined) break;
      result[key] = value === '{' ? object() : value;
    }
    return result;
  }
  return object();
}
export async function scanSteam(root) {
  if (!root) return [];
  const roots = new Set([root]);
  try {
    const vdf = parseVdf(await fs.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    for (const [key, library] of Object.entries(vdf.libraryfolders || vdf.LibraryFolders || {})) {
      if (/^\d+$/.test(key)) { const p = typeof library === 'string' ? library : library.path; if (p) roots.add(p); }
    }
  } catch { /* A single-library install may not have this file. */ }
  const found = [];
  for (const library of roots) {
    for (const file of await files(path.join(library, 'steamapps'))) {
      if (!/^appmanifest_\d+\.acf$/i.test(file.name)) continue;
      try {
        const data = parseVdf(await fs.readFile(path.join(library, 'steamapps', file.name), 'utf8')).AppState;
        if (!data?.appid || !data.name || /redistributable|steamworks|proton|soldier|sniper|steam linux runtime/i.test(data.name)) continue;
        const installPath = path.join(library, 'steamapps', 'common', data.installdir || '');
        if (!await exists(installPath) || !(Number(data.StateFlags) & 4)) continue;
        let localArtwork;
        const cache = path.join(root, 'appcache', 'librarycache');
        for (const folder of await files(path.join(cache, data.appid))) {
          if (!folder.isDirectory()) continue;
          const candidate = path.join(cache, data.appid, folder.name, 'library_capsule.jpg');
          if (await exists(candidate)) { localArtwork = candidate; break; }
        }
        if (!localArtwork && await exists(path.join(cache, `${data.appid}_library_600x900.jpg`))) localArtwork = path.join(cache, `${data.appid}_library_600x900.jpg`);
        found.push({ id: `steam-${data.appid}`, name: data.name, source: 'Steam', target: `steam://rungameid/${data.appid}`, type: 'uri', installPath, appId: data.appid, localArtwork, artwork: `https://cdn.cloudflare.steamstatic.com/steam/apps/${data.appid}/library_600x900.jpg` });
      } catch { /* Skip one damaged manifest without discarding the library. */ }
    }
  }
  return found;
}
export async function scanEpic(directory) {
  const found = [];
  for (const file of await files(directory)) {
    if (!file.name.endsWith('.item')) continue;
    const item = await readJson(path.join(directory, file.name));
    if (!item?.DisplayName || !item.AppName || !item.InstallLocation || item.bIsIncompleteInstall || !await exists(item.InstallLocation)) continue;
    if (item.AppCategories && !item.AppCategories.includes('games')) continue;
    const launchId = [item.CatalogNamespace, item.CatalogItemId, item.AppName].filter(Boolean).join(':');
    found.push({ id: idFor('Epic', item.AppName), name: item.DisplayName, source: 'Epic', installPath: item.InstallLocation, type: 'uri', target: `com.epicgames.launcher://apps/${encodeURIComponent(launchId)}?action=launch&silent=true` });
  }
  return found;
}
export function classifyProgram(p) {
  const name = p.name || '';
  if (/launcher|redistributable|sdk|anti.?cheat|runtime|webview|directx|dedicated server|soundtrack|crash reporter/i.test(name) || /^(steam|epic games|ubisoft connect|ea app|origin|gog galaxy|battle\.net|rockstar games)$/i.test(name)) return null;
  if (/^Steam App \d+$/.test(p.key)) return 'Steam';
  const value = `${p.publisher || ''} ${p.location || ''} ${p.key || ''}`;
  if (/rockstar/i.test(value)) return 'Rockstar';
  if (/ubisoft|uplay/i.test(value)) return 'Ubisoft';
  if (/electronic arts|ea games|ea sports|origin games/i.test(value)) return 'EA';
  if (/gog\.com|gog games/i.test(value)) return 'GOG';
  if (/blizzard|battle\.net/i.test(value)) return 'Battle.net';
  if (/epic games/i.test(value)) return 'Epic';
  return null;
}
export function executableFromIcon(icon) {
  if (typeof icon !== 'string') return null;
  const match = icon.match(/^\s*"?(.+?\.exe)"?(?:,\s*-?\d+)?\s*$/i);
  const executable = match?.[1];
  return executable && !/unins|uninstall|setup|crash|repair/i.test(path.win32.basename(executable)) ? executable : null;
}
async function findExecutable(program) {
  const icon = executableFromIcon(program.icon);
  if (icon && await exists(icon)) return icon;
  if (!program.location) return null;
  const candidates = (await files(program.location)).filter(f => f.isFile() && /\.exe$/i.test(f.name) && !/unins|setup|repair|crash|redist|support/i.test(f.name));
  const slug = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const exact = candidates.find(f => slug(f.name.replace(/\.exe$/i, '')) === slug(program.name));
  // Ambiguous folders require the user to choose; never guess an installer or utility.
  return exact ? path.join(program.location, exact.name) : candidates.length === 1 ? path.join(program.location, candidates[0].name) : null;
}
export function deduplicateGames(games) {
  const seen = new Set();
  return games.filter(game => {
    const key = `${game.source}:${game.name.toLowerCase().replace(/[™®]/g, '').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}
export async function scanGames(nativeDirectory) {
  const warnings = [];
  let inventory = { programs: [], startApps: [], gog: [], xbox: [] };
  try { inventory = JSON.parse(await runPowerShell(path.join(nativeDirectory, 'inventory.ps1'))); } catch { warnings.push('Windows-register kon niet volledig worden gelezen. Handmatig toevoegen blijft beschikbaar.'); }
  const defaultSteam = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam');
  const [steam, epic] = await Promise.all([
    scanSteam(inventory.steam || defaultSteam),
    scanEpic(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')),
  ]);
  const games = [...steam, ...epic];
  for (const p of inventory.programs || []) {
    const source = classifyProgram(p);
    if (!source || source === 'Epic') continue;
    if (source === 'Steam') {
      const appId = p.key.replace('Steam App ', '');
      if (!games.some(g => g.id === `steam-${appId}`)) games.push({ id: `steam-${appId}`, name: p.name, source, type: 'uri', target: `steam://rungameid/${appId}`, appId, installPath: p.location, artwork: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg` });
      continue;
    }
    const target = await findExecutable(p);
    if (target) games.push({ id: idFor(source, target), name: p.name, source, target, type: 'file', installPath: p.location });
  }
  for (const p of inventory.gog || []) {
    if (!p.name || !p.id) continue;
    const candidate = p.exe && /\.exe$/i.test(p.exe) ? (path.isAbsolute(p.exe) ? p.exe : path.join(p.path || '', p.exe)) : null;
    if (candidate && await exists(candidate)) games.push({ id: idFor('GOG', p.id), name: p.name, source: 'GOG', type: 'file', target: candidate, installPath: p.path });
  }
  for (const p of inventory.xbox || []) {
    const start = (inventory.startApps || []).find(s => s.appId === p.appId);
    games.push({ id: idFor('Xbox', p.appId), name: start?.name || p.name, source: 'Xbox', type: 'app', target: p.appId, installPath: p.location });
  }
  return { games: deduplicateGames(games), startApps: inventory.startApps || [], protocols: inventory.protocols || {}, warnings, scannedAt: Date.now() };
}
