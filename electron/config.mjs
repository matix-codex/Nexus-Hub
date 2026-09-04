export const SERVICES = {
  discord: { native: true, name: 'Discord', url: 'https://discord.com/app', protocol: 'discord://', color: '#8d8aff' },
  whatsapp: { native: true, name: 'WhatsApp', url: 'https://web.whatsapp.com/', protocol: 'whatsapp://', color: '#59d49b' },
  spotify: { native: true, name: 'Spotify', url: 'https://open.spotify.com/', protocol: 'spotify:', color: '#76de9b' },
  xbox: { name: 'Xbox', url: 'https://www.xbox.com/play', protocol: 'xbox:', color: '#87c978' },
};
export const LAUNCHERS = {
  Steam: 'steam://open/main', Epic: 'com.epicgames.launcher://ue/library', Xbox: 'xbox:',
  Rockstar: 'rockstargames://', Ubisoft: 'uplay://', EA: 'origin2://', GOG: 'goggalaxy://', 'Battle.net': 'battlenet://',
};
export const WIDGETS = ['welcome', 'system', 'media', 'social', 'library', 'audio', 'network', 'clock', 'notes', 'timer', 'launchers', 'radio'];
export const DEFAULTS = {
  settings: { displayId: null, displayIdentity: null, fullscreen: false, alwaysOnTop: false, autostart: false, theme: 'mint', density: 'comfortable', profile: 'command', username: '', artwork: true, reduceMotion: false },
  layouts: {
    command: ['welcome', 'system', 'media', 'social', 'library', 'audio', 'network', 'clock', 'launchers'],
    gaming: ['welcome', 'system', 'media', 'audio', 'library', 'launchers', 'social', 'network'],
    focus: ['welcome', 'clock', 'media', 'timer', 'notes', 'audio', 'network'],
  },
  sizes: {}, favorites: [], radioFavorites: [], customGames: [], webWidgets: [], notes: '',
  timer: { duration: 1500, remaining: 1500, endsAt: null }, recent: [],
};
export function safeWebUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function validateSettings(input) {
  const result = {};
  if (!input || typeof input !== 'object') return result;
  for (const k of ['fullscreen', 'alwaysOnTop', 'autostart', 'artwork', 'reduceMotion']) if (typeof input[k] === 'boolean') result[k] = input[k];
  if (['mint', 'violet', 'amber'].includes(input.theme)) result.theme = input.theme;
  if (['comfortable', 'compact'].includes(input.density)) result.density = input.density;
  if (['command', 'gaming', 'focus'].includes(input.profile)) result.profile = input.profile;
  if (typeof input.username === 'string') result.username = input.username.trim().slice(0, 36);
  if (Number.isInteger(input.displayId) || input.displayId === null) result.displayId = input.displayId;
  return result;
}
