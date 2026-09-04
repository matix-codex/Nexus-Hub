import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const titleKey = value => String(value).replace(/[™®]/g, '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
export function matchCover(name, items = []) { return items.find(item => item.type === 'app' && titleKey(item.name) === titleKey(name) && /^\d+$/.test(String(item.id))); }
export class Artwork {
  constructor(directory) { this.directory = path.join(directory, 'covers'); this.index = {}; this.busy = false; }
  async init() { await fs.mkdir(this.directory, { recursive: true }); try { this.index = JSON.parse(await fs.readFile(path.join(this.directory, 'index.json'), 'utf8')); } catch {} }
  forGame(game) { const item = this.index[game.id]; return { ...game, artwork: item?.file ? `nexus-cover://local/${item.file}?v=${item.at}` : game.artwork, artworkSource: item?.source || (game.artwork ? 'Steam' : null) }; }
  async save() { const file = path.join(this.directory, 'index.json'); await fs.writeFile(file + '.tmp', JSON.stringify(this.index)); await fs.rename(file + '.tmp', file); }
  async put(game, bytes, source) {
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Kies een afbeelding kleiner dan 8 MB.');
    const file = crypto.createHash('sha256').update(game.id).digest('hex') + '.jpg';
    await fs.writeFile(path.join(this.directory, file), bytes);
    this.index[game.id] = { file, at: Date.now(), source }; await this.save();
  }
  async refresh(games, changed) {
    if (this.busy) return; this.busy = true;
    try {
      for (const game of games) {
        const saved = this.index[game.id];
        if (saved?.file || saved?.attempt > Date.now() - 86400000) continue;
        try {
          if (game.localArtwork) {
            try { const bytes = await fs.readFile(game.localArtwork); if (bytes.length > 4000) { await this.put(game, bytes, 'Steam · lokale hoes'); changed(); continue; } } catch {}
          }
          let appId = game.source === 'Steam' ? game.appId : null;
          if (!appId) {
            const response = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(game.name.replace(/[™®]/g, ''))}&l=english&cc=NL`, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error('Covercatalogus niet beschikbaar');
            appId = matchCover(game.name, (await response.json()).items)?.id;
          }
          if (!appId || !/^\d+$/.test(String(appId))) throw new Error('Geen exacte titel gevonden');
          let image;
          for (const suffix of ['library_600x900.jpg', 'header.jpg']) {
            const response = await fetch(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${suffix}`, { signal: AbortSignal.timeout(6000) });
            if (response.ok && response.headers.get('content-type')?.startsWith('image/') && Number(response.headers.get('content-length') || 0) < 8388608) { const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > 4000) { image = bytes; break; } }
          }
          if (!image) {
            const details = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`, { signal: AbortSignal.timeout(15000) }).then(r => r.json());
            const url = details[appId]?.data?.header_image;
            if (url && /^https:\/\/[^/]+\.steamstatic\.com\//.test(url)) {
              const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
              if (response.ok && response.headers.get('content-type')?.startsWith('image/')) image = Buffer.from(await response.arrayBuffer());
            }
          }
          if (!image) throw new Error('Hoes niet beschikbaar');
          await this.put(game, image, 'Steam'); changed();
        } catch { this.index[game.id] = { attempt: Date.now() }; }
      }
      await this.save();
    } finally { this.busy = false; }
  }
}
