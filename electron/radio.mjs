import dns from 'node:dns/promises';
export function streamUrl(value) {
  try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || value.length > 4096) return null; return url.href; } catch { return null; }
}
export function station(value) {
  const url = streamUrl(value?.url_resolved || value?.url);
  if (!url || typeof value.name !== 'string' || !value.name.trim()) throw new Error('Geef een zendernaam en een geldig http(s)-streamadres op.');
  return { id: String(value.stationuuid || value.id || url).slice(0, 4096), name: value.name.trim().slice(0, 120), url, country: String(value.country || '').slice(0, 80), tags: String(value.tags || '').slice(0, 140), codec: String(value.codec || '').slice(0, 30), bitrate: Number(value.bitrate) || null };
}
export class RadioDirectory {
  constructor() { this.hosts = []; this.cachedAt = 0; }
  async search(query = {}) {
    if (!this.hosts.length || Date.now() - this.cachedAt > 3600000) {
      const ips = await dns.resolve4('all.api.radio-browser.info');
      const names = await Promise.allSettled(ips.slice(0, 8).map(ip => dns.reverse(ip)));
      this.hosts = [...new Set(names.flatMap(result => result.status === 'fulfilled' ? result.value : []).filter(name => /^[a-z0-9-]+\.api\.radio-browser\.info$/.test(name)))];
      this.cachedAt = Date.now();
    }
    const params = new URLSearchParams({ name: String(query.name || '').slice(0, 100), hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '60' });
    if (/^[A-Z]{2}$/.test(query.country || '')) params.set('countrycode', query.country);
    if (query.tag) params.set('tag', String(query.tag).slice(0, 60));
    for (const host of this.hosts) {
      try {
        const response = await fetch(`https://${host}/json/stations/search?${params}`, { headers: { 'User-Agent': 'NexusHub/1.1.0' }, signal: AbortSignal.timeout(8000) });
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data)) continue;
        return data.filter(item => !item.hls && item.lastcheckok && /^(MP3|AAC|AAC\+|OGG|OPUS|VORBIS|FLAC)$/i.test(item.codec)).flatMap(item => { try { return [station(item)]; } catch { return []; } });
      } catch {}
    }
    throw new Error('De zendercatalogus is nu niet bereikbaar. Je favorieten en eigen streamadressen blijven beschikbaar.');
  }
}
