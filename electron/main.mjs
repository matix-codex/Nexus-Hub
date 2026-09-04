import { app, BrowserWindow, WebContentsView, ipcMain, screen, Menu, Tray, nativeImage, shell, dialog, globalShortcut, session, Notification, protocol, net } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { Store } from './store.mjs';
import { DEFAULTS, SERVICES, LAUNCHERS, WIDGETS, safeWebUrl, validateSettings } from './config.mjs';
import { NativeBridge, basicStats } from './native.mjs';
import { scanGames, idFor } from './games.mjs';
import { resolveDisplay, rememberDisplay, boundsForDisplay } from './displays.mjs';
import { Artwork } from './artwork.mjs';
import { Hardware } from './hardware.mjs';
import { RadioDirectory, station } from './radio.mjs';
import { RGB } from './rgb.mjs';
import electronUpdater from 'electron-updater';
import { Updates } from './updates.mjs';
protocol.registerSchemesAsPrivileged([{ scheme: 'nexus-cover', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const directory = path.dirname(fileURLToPath(import.meta.url));
const testing = Boolean(process.env.NEXUS_TEST_DATA);
if (testing) app.setPath('userData', process.env.NEXUS_TEST_DATA);
app.setAppUserModelId('nl.nexushub.desktop');
const devURL = !app.isPackaged && process.env.NEXUS_DEV_URL === 'http://127.0.0.1:5173' ? process.env.NEXUS_DEV_URL : null;
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
let win, tray, store, native, quit = false, scanning = false, library = { games: [], startApps: [], warnings: [], scannedAt: null };
let activeService = null, overlay = false, metrics = {}, networkSample = null;
let dashboardWanted = true, positioning = false, repositionTimer;
let desktop, artwork, hardware, rgb, updates; let nativeApps = {}; let nativeOpening = null; let serviceGeneration = 0; let stopping = false;
const radio = new RadioDirectory();
const appPopups = new Map();
const views = new Map();
const timers = [];
let scanPromise;
const nativeDirectory = app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(directory, '..', 'native');
const displays = () => screen.getAllDisplays().map((d, index) => ({ id: d.id, label: d.label || `Scherm ${index + 1}`, width: d.size.width, height: d.size.height, primary: d.id === screen.getPrimaryDisplay().id }));
const allGames = () => [...library.games, ...store.data.customGames].map(game => artwork ? artwork.forGame(game) : game);
const selectedDisplay = () => resolveDisplay(screen.getAllDisplays(), store.data.settings);
const state = () => ({ ...store.data, updates: updates?.snapshot(), library: { ...library, games: allGames(), scanning }, displays: displays(), displayTarget: { available: Boolean(selectedDisplay()), activeId: selectedDisplay()?.id ?? null, label: store.data.settings.displayIdentity?.label || 'Gekozen scherm' }, fullscreen: win?.isFullScreen() || false, overlay, services: SERVICES, launchers: LAUNCHERS, nativeApps, version: app.getVersion(), nativeReady: native?.ready || false });
const broadcast = () => { if (win && !win.isDestroyed()) win.webContents.send('state', state()); updateTray(); };
const save = () => { store.save(); broadcast(); return state(); };
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Deze actie is alleen beschikbaar vanuit Nexus Hub.');
    return fn(...args);
  });
}
async function scan() {
  if (scanPromise) return scanPromise;
  scanning = true; broadcast();
  scanPromise = (async () => {
    try { library = await scanGames(nativeDirectory); artwork.refresh(allGames(), broadcast).catch(() => {}); await fs.writeFile(path.join(app.getPath('userData'), 'library.json'), JSON.stringify(library), 'utf8'); }
    catch (error) { library.warnings = [error.message]; }
    finally { scanning = false; scanPromise = null; broadcast(); }
    return state();
  })();
  return scanPromise;
}
async function launch(game) {
  if (!game) throw new Error('Deze game is niet meer aanwezig. Scan je bibliotheek opnieuw.');
  if (game.type === 'uri') {
    if (!/^(steam|com\.epicgames\.launcher|goggalaxy|uplay|rockstargames|origin2|battlenet):/i.test(game.target)) throw new Error('Onbekend gameprotocol.');
    await shell.openExternal(game.target);
  } else if (game.type === 'app') {
    if (!/^[\w.!-]+$/.test(game.target)) throw new Error('Ongeldige Windows-app.');
    await new Promise((resolve, reject) => {
      const child = spawn(path.join(process.env.SystemRoot, 'explorer.exe'), [`shell:AppsFolder\\${game.target}`], { detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
  } else if (game.type === 'file') {
    if (!/\.(exe|lnk|url)$/i.test(game.target)) throw new Error('Kies een game of snelkoppeling.');
    const error = await shell.openPath(game.target);
    if (error) throw new Error(error);
  } else throw new Error('Onbekend gametype.');
  store.data.recent = [{ id: game.id, at: Date.now() }, ...store.data.recent.filter(g => g.id !== game.id)].slice(0, 20);
  save();
}
function hideMain() { desktop?.request('hide').catch(() => {}); dashboardWanted = false; win?.hide(); for (const popup of appPopups.values()) if (!popup.isDestroyed()) popup.hide(); }
function showMain() {
  dashboardWanted = true;
  if (!win || !selectedDisplay()) return;
  if (win.isMinimized()) win.restore();
  const current = screen.getDisplayMatching(win.getBounds());
  if (current.id !== selectedDisplay().id) positionOnSelectedDisplay();
  win.setSkipTaskbar(true); win.show(); win.focus();
  if (SERVICES[activeService]?.native) desktop?.request('show').catch(() => {});
  for (const [id, popup] of appPopups) if (id.startsWith(`${activeService}:`) && !popup.isDestroyed()) popup.show();
}
function positionOnSelectedDisplay() {
  const display = selectedDisplay();
  if (!display) { win.hide(); broadcast(); return; }
  positioning = true;
  win.setFullScreen(false);
  win.setBounds(boundsForDisplay(display, overlay));
  if (!overlay && store.data.settings.fullscreen) win.setFullScreen(true);
  if (dashboardWanted) win.show();
  positioning = false;
  broadcast();
}
function displayChanged() {
  // Hide immediately on removal; debounce reconnect/resolution event bursts.
  if (!selectedDisplay()) win.hide();
  clearTimeout(repositionTimer);
  repositionTimer = setTimeout(positionOnSelectedDisplay, 400);
  broadcast();
}
function toggleOverlay() {
  const display = selectedDisplay();
  if (!display) return;
  hideService();
  overlay = !overlay;
  positionOnSelectedDisplay();
  showMain();
  win.setAlwaysOnTop(overlay || store.data.settings.alwaysOnTop, 'floating');
  broadcast();
}
function hideService() {
  if (activeService && views.has(activeService)) views.get(activeService).setVisible(false);
  if (SERVICES[activeService]?.native) desktop?.request('hide').catch(() => {});
  serviceGeneration++;
  for (const popup of appPopups.values()) if (!popup.isDestroyed()) popup.hide();
  activeService = null;
}
const serviceDefinition = id => SERVICES[id] || store.data.webWidgets.find(w => w.id === id);
function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Nexus Hub', enabled: Boolean(selectedDisplay()), click: showMain },
    { label: 'Verberg dashboard', click: hideMain },
    { label: 'Wissel overlay', enabled: Boolean(selectedDisplay()), click: toggleOverlay },
    { label: 'Vast scherm', submenu: screen.getAllDisplays().map((display, index) => ({
      label: display.label || `Scherm ${index + 1}`, type: 'radio', checked: selectedDisplay()?.id === display.id,
      click: () => {
        store.data.settings.displayId = display.id; store.data.settings.displayIdentity = rememberDisplay(display);
        store.save(); dashboardWanted = true; positionOnSelectedDisplay();
      },
    })) },
    ...(!selectedDisplay() ? [{ label: `${store.data.settings.displayIdentity?.label || 'Gekozen scherm'} niet aangesloten`, enabled: false }] : []),
    { type: 'separator' },
    { label: updates?.state.version ? `Update ${updates.state.version} bekijken…` : 'Controleren op updates…', click: () => { showMain(); updates?.prompt(); void updates?.check(); } },
    { type: 'separator' }, { label: 'Afsluiten', click: () => { quit = true; app.quit(); } },
  ]));
}
function serviceEvent(id, data) { if (win && !win.isDestroyed() && !win.webContents.isDestroyed() && !quit) win.webContents.send('service:status', { id, ...data }); }
async function launchNative(target) {
  await new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot, 'explorer.exe'), ['shell:AppsFolder\\' + target], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
}
async function openService(id) {
  if (activeService === id && SERVICES[id]?.native) return nativeOpening;
  const task = openServiceInternal(id); nativeOpening = task;
  try { return await task; } finally { if (nativeOpening === task) nativeOpening = null; }
}
async function openServiceInternal(id) {
  const definition = serviceDefinition(id);
  if (!definition) throw new Error('Onbekende app.');
  hideService();
  activeService = id;
  if (definition.native) {
    const generation = serviceGeneration;
    serviceEvent(id, { loading: true, error: null, native: true });
    try {
      if (!desktop?.ready) throw new Error('Windows-appverbinding start nog. Probeer het zo opnieuw.');
      if (!nativeApps[id]?.installed) nativeApps = await desktop.request('inventory');
      const target = nativeApps[id]?.appId;
      if (!target || !/^[\w.!-]+$/.test(target)) throw new Error(definition.name + ' is niet geïnstalleerd. Installeer de Windows-app en probeer opnieuw.');
      await launchNative(target);
      const hwnd = win.getNativeWindowHandle();
      const parent = hwnd.length === 8 ? hwnd.readBigUInt64LE().toString() : String(hwnd.readUInt32LE());
      let lastError;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (activeService !== id || serviceGeneration !== generation) return;
        try {
          await desktop.request('attach', { id, parent });
          if (activeService !== id || serviceGeneration !== generation) { await desktop.request('hide'); return; }
          serviceEvent(id, { loading: false, error: null, native: true }); broadcast(); return { id, engine: 'Windows' };
        } catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 500)); }
      }
      throw lastError;
    } catch (error) { serviceEvent(id, { loading: false, error: error.message, native: true }); throw error; }
  }
  let view = views.get(id);
  if (!view) {
    const partition = `persist:nexus-${id}`;
    const ses = session.fromPartition(partition);
    ses.setPermissionCheckHandler((_contents, permission, origin) => {
      const url = safeWebUrl(origin);
      return Boolean(url) && ['media', 'notifications', 'fullscreen'].includes(permission);
    });
    ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      const requestUrl = safeWebUrl(details.requestingUrl || contents.getURL());
      if (!requestUrl || !['media', 'notifications', 'fullscreen'].includes(permission)) return callback(false);
      if (permission === 'fullscreen') return callback(true);
      const labels = { media: 'je microfoon of camera gebruiken', notifications: 'meldingen weergeven' };
      const answer = await dialog.showMessageBox(win, { type: 'question', title: definition.name, message: `${new URL(requestUrl).hostname} wil ${labels[permission]}.`, buttons: ['Weigeren', 'Toestaan'], defaultId: 0, cancelId: 0 });
      callback(answer.response === 1);
    });
    view = new WebContentsView({ webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: true } });
    view.setBackgroundColor('#11151b');
    view.setBounds({ x: 84, y: 156, width: Math.max(100, win.getContentBounds().width - 108), height: Math.max(100, win.getContentBounds().height - 188) });
    win.contentView.addChildView(view);
    views.set(id, view);
    const contents = view.webContents;
    // Remote pages never receive the native preload or any Node capabilities.
    contents.on('will-navigate', (event, url) => { if (!safeWebUrl(url)) event.preventDefault(); });
    contents.on('will-redirect', (event, url) => { if (!safeWebUrl(url)) event.preventDefault(); });
    contents.setWindowOpenHandler(({ url }) => {
      if (!safeWebUrl(url) && url !== 'about:blank') return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: { parent: win, width: 560, height: 740, skipTaskbar: true, autoHideMenuBar: true, title: `${definition.name} · Nexus Hub`, webPreferences: { partition, sandbox: true, nodeIntegration: false, contextIsolation: true, webSecurity: true, preload: undefined } } };
    });
    contents.on('did-create-window', popup => {
      const key = `${id}:${popup.id}`; appPopups.set(key, popup);
      const area = selectedDisplay()?.workArea;
      if (area) popup.setBounds({ x: area.x + Math.max(0, Math.round((area.width - 560) / 2)), y: area.y, width: Math.min(560, area.width), height: Math.min(740, area.height) });
      popup.webContents.on('will-navigate', (event, url) => { if (!safeWebUrl(url)) event.preventDefault(); });
      popup.webContents.on('will-redirect', (event, url) => { if (!safeWebUrl(url)) event.preventDefault(); });
      popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      popup.on('closed', () => appPopups.delete(key));
    });
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F11') { event.preventDefault(); win.setFullScreen(!win.isFullScreen()); store.data.settings.fullscreen = win.isFullScreen(); store.save(); }
      if (input.key === 'Escape' && win.isFullScreen()) { event.preventDefault(); win.setFullScreen(false); store.data.settings.fullscreen = false; store.save(); }
      if (input.control && input.key.toLowerCase() === 'k') { event.preventDefault(); hideService(); win.webContents.focus(); win.webContents.send('shortcut', 'search'); }
    });
    contents.on('did-start-loading', () => serviceEvent(id, { loading: true, error: null }));
    contents.on('did-stop-loading', () => serviceEvent(id, { loading: false }));
    contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) { view.setVisible(false); serviceEvent(id, { loading: false, error: description }); } });
    contents.on('render-process-gone', () => { views.delete(id); serviceEvent(id, { error: 'De app is gestopt. Open de app opnieuw.' }); });
    contents.loadURL(definition.url).catch(error => serviceEvent(id, { error: error.message, loading: false }));
  }
  view.setVisible(true);
  for (const [key, popup] of appPopups) if (key.startsWith(`${id}:`) && !popup.isDestroyed()) popup.show();
  return { id };
}

function installHandlers() {
  handle('updates:check', () => updates.check());
  handle('updates:download', () => updates.download());
  handle('updates:install', () => updates.install());
  handle('updates:release', () => shell.openExternal(updates.releaseUrl()));
  handle('bootstrap', () => ({ state: state(), metrics }));
  handle('games:scan', scan);
  handle('games:cover', async id => {
    const game = allGames().find(g => g.id === id); if (!game) throw new Error('Onbekende game.');
    const answer = await dialog.showOpenDialog(win, { title: 'Gamehoes kiezen', properties: ['openFile'], filters: [{ name: 'Afbeeldingen', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
    if (answer.canceled) return;
    if ((await fs.stat(answer.filePaths[0])).size > 8388608) throw new Error('Kies een afbeelding kleiner dan 8 MB.');
    const picture = nativeImage.createFromPath(answer.filePaths[0]); if (picture.isEmpty()) throw new Error('Deze afbeelding kan niet worden gelezen.');
    await artwork.put(game, picture.resize({ width: 600 }).toJPEG(90), 'Eigen afbeelding'); broadcast();
  });
  handle('radio:search', query => radio.search(query));
  handle('radio:favorite', value => {
    const item = station(value); const list = store.data.radioFavorites;
    store.data.radioFavorites = list.some(s => s.id === item.id) ? list.filter(s => s.id !== item.id) : [...list, item].slice(-200);
    return save();
  });
  handle('rgb:status', () => rgb.status());
  handle('rgb:apply', value => rgb.apply(value));
  handle('rgb:open', id => rgb.open(id));
  handle('rgb:install-msi', () => rgb.installMsi());
  handle('games:launch', id => launch(allGames().find(game => game.id === id)));
  handle('games:favorite', id => {
    if (!allGames().some(g => g.id === id)) throw new Error('Onbekende game.');
    store.data.favorites = store.data.favorites.includes(id) ? store.data.favorites.filter(g => g !== id) : [...store.data.favorites, id]; return save();
  });
  handle('games:add', async () => {
    const answer = await dialog.showOpenDialog(win, { title: 'Game of snelkoppeling toevoegen', properties: ['openFile'], filters: [{ name: 'Games en snelkoppelingen', extensions: ['exe', 'lnk', 'url'] }] });
    if (answer.canceled) return null;
    const target = answer.filePaths[0];
    if (!/\.(exe|lnk|url)$/i.test(target)) throw new Error('Kies een .exe, .lnk of .url-bestand.');
    const id = idFor('custom', target);
    if (!store.data.customGames.some(g => g.id === id)) store.data.customGames.push({ id, name: path.basename(target, path.extname(target)), source: 'Eigen', target, type: 'file', custom: true });
    return save();
  });
  handle('games:add-start', appId => {
    const found = library.startApps.find(a => a.appId === appId);
    if (!found || !/^[\w.!-]+$/.test(found.appId)) throw new Error('Deze app heeft geen ondersteunde Windows-app-ID. Voeg de snelkoppeling toe via Bestand kiezen.');
    const id = idFor('custom', found.appId);
    if (!allGames().some(g => g.target === found.appId)) store.data.customGames.push({ id, name: found.name, source: 'Windows', target: found.appId, type: 'app', custom: true });
    return save();
  });
  handle('games:remove', id => { store.data.customGames = store.data.customGames.filter(g => g.id !== id); store.data.favorites = store.data.favorites.filter(g => g !== id); return save(); });
  handle('settings:save', data => {
    const settings = validateSettings(data);
    if ('displayId' in settings) {
      const chosen = screen.getAllDisplays().find(d => d.id === settings.displayId);
      if (!chosen) throw new Error('Dit scherm is niet aangesloten. Kies een beschikbaar scherm.');
      store.data.settings.displayIdentity = rememberDisplay(chosen);
    }
    Object.assign(store.data.settings, settings);
    if ('displayId' in settings || 'fullscreen' in settings) { overlay = false; positionOnSelectedDisplay(); }
    if ('alwaysOnTop' in settings) win.setAlwaysOnTop(settings.alwaysOnTop);
    if ('autostart' in settings && app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.autostart, path: app.getPath('exe') });
    return save();
  });
  handle('layout:save', (profile, widgets, sizes) => {
    if (!['command', 'gaming', 'focus'].includes(profile) || !Array.isArray(widgets)) throw new Error('Ongeldige indeling.');
    const allowed = [...WIDGETS, ...store.data.webWidgets.map(w => w.id)];
    store.data.layouts[profile] = [...new Set(widgets.filter(id => allowed.includes(id)))];
    if (sizes && typeof sizes === 'object') for (const [id, value] of Object.entries(sizes)) if (allowed.includes(id) && ['normal', 'wide'].includes(value)) store.data.sizes[id] = value;
    return save();
  });
  handle('notes:save', value => { if (typeof value !== 'string') throw new Error('Ongeldige notitie.'); store.data.notes = value.slice(0, 20000); return save(); });
  handle('timer:save', value => {
    const duration = Math.min(86400, Math.max(60, Number(value.duration) || 1500));
    const remaining = Math.min(86400, Math.max(0, Number(value.remaining) || 0));
    store.data.timer = { duration, remaining, endsAt: value.running ? Date.now() + remaining * 1000 : null }; return save();
  });
  handle('widgets:web', data => {
    if (!safeWebUrl(data?.url) || typeof data.name !== 'string' || !data.name.trim()) throw new Error('Geef een naam en een geldig https-adres op.');
    const widget = { id: `web-${crypto.randomUUID()}`, name: data.name.trim().slice(0, 50), url: safeWebUrl(data.url) };
    store.data.webWidgets.push(widget); store.data.layouts[store.data.settings.profile].push(widget.id); return save();
  });
  handle('widgets:remove', id => {
    store.data.webWidgets = store.data.webWidgets.filter(w => w.id !== id);
    for (const profile of Object.keys(store.data.layouts)) store.data.layouts[profile] = store.data.layouts[profile].filter(w => w !== id);
    if (views.has(id)) { const view = views.get(id); win.contentView.removeChildView(view); view.webContents.close(); views.delete(id); }
    return save();
  });
  handle('window:action', action => {
    if (action === 'minimize' || action === 'close') hideMain();
    if (action === 'quit') { quit = true; app.quit(); }
    if (action === 'fullscreen') { win.setFullScreen(!win.isFullScreen()); store.data.settings.fullscreen = win.isFullScreen(); store.save(); }
    if (action === 'exit-fullscreen') { win.setFullScreen(false); store.data.settings.fullscreen = false; store.save(); }
    if (action === 'overlay') toggleOverlay();
    if (action === 'sound-settings') return shell.openExternal('ms-settings:sound');
    if (action === 'display-settings') return shell.openExternal('ms-settings:display');
    broadcast(); return state();
  });
  handle('audio:action', async (action, value) => {
    if (!['volume', 'mute', 'mic'].includes(action)) throw new Error('Onbekende audioactie.');
    if (action === 'volume' && (!Number.isFinite(value) || value < 0 || value > 100)) throw new Error('Ongeldig volume.');
    if (action !== 'volume' && typeof value !== 'boolean') throw new Error('Ongeldige mute-waarde.');
    await native.request(action, value); await nativeSnapshot(); return true;
  });
  handle('media:action', async action => { if (!['toggle', 'next', 'previous'].includes(action)) throw new Error('Onbekende mediaactie.'); await native.request('media', action); await nativeSnapshot(); });
  handle('launcher:open', name => {
    if (!LAUNCHERS[name]) throw new Error('Onbekende launcher.');
    if (library.protocols?.[LAUNCHERS[name].split(':')[0]] === false) throw new Error(`${name} is niet geïnstalleerd of heeft geen geregistreerde snelkoppeling. Installeer de launcher of voeg een game handmatig toe.`);
    return shell.openExternal(LAUNCHERS[name]);
  });
  handle('service:action', async (action, id) => {
    const definition = serviceDefinition(id);
    if (action === 'hide') { hideService(); return; }
    if (!definition) throw new Error('Onbekende app.');
    if (action === 'open') return openService(id);
    if (definition.native) {
      if (action === 'reload') { hideService(); return openService(id); }
      if (action === 'external') {
        await desktop.request('release', id); hideService();
        if (!nativeApps[id]?.installed) nativeApps = await desktop.request('inventory');
        const target = nativeApps[id]?.appId;
        if (!target || !/^[\w.!-]+$/.test(target)) throw new Error(definition.name + ' is niet geïnstalleerd.');
        return launchNative(target);
      }
      throw new Error('Beheer deze functie in de Windows-app zelf.');
    }
    if (action === 'external') {
      if (definition.protocol && library.protocols?.[definition.protocol.split(':')[0]] === false) return shell.openExternal(definition.url);
      return shell.openExternal(definition.protocol || definition.url);
    }
    if (action === 'browser') return shell.openExternal(definition.url);
    if (action === 'reload') { const view = views.get(id); if (view) { view.setVisible(true); view.webContents.reload(); } else await openService(id); }
    if (action === 'back' && views.get(id)?.webContents.navigationHistory.canGoBack()) views.get(id).webContents.navigationHistory.goBack();
    if (action === 'logout' && views.has(id)) {
      const view = views.get(id);
      await view.webContents.session.clearStorageData(); await view.webContents.session.clearCache(); view.webContents.loadURL(definition.url).catch(() => {});
    }
  });
  handle('service:bounds', bounds => {
    if (!activeService || !bounds) return;
    const view = views.get(activeService); const size = win.getContentBounds();
    if ((view || SERVICES[activeService]?.native) && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(bounds[k]))) {
      const x = Math.max(0, Math.min(size.width - 1, Math.round(bounds.x))); const y = Math.max(60, Math.min(size.height - 1, Math.round(bounds.y)));
      const rect = { x, y, width: Math.max(1, Math.min(size.width - x, Math.round(bounds.width))), height: Math.max(1, Math.min(size.height - y, Math.round(bounds.height))) };
      if (SERVICES[activeService]?.native) return desktop?.request('bounds', { ...rect, parentWidth: size.width });
      view.setBounds(rect);
    }
  });
  handle('config:export', async () => {
    const answer = await dialog.showSaveDialog(win, { defaultPath: 'nexus-indeling.json', filters: [{ name: 'Nexus-indeling', extensions: ['json'] }] });
    if (!answer.canceled) await fs.writeFile(answer.filePath, JSON.stringify({ version: 1, settings: store.data.settings, layouts: store.data.layouts, sizes: store.data.sizes, webWidgets: store.data.webWidgets }, null, 2));
    return !answer.canceled;
  });
  handle('config:import', async () => {
    const answer = await dialog.showOpenDialog(win, { filters: [{ name: 'Nexus-indeling', extensions: ['json'] }], properties: ['openFile'] });
    if (answer.canceled) return null;
    const stat = await fs.stat(answer.filePaths[0]); if (stat.size > 1024 * 1024) throw new Error('Dit bestand is te groot.');
    const data = JSON.parse(await fs.readFile(answer.filePaths[0], 'utf8'));
    if (data.version !== 1) throw new Error('Dit is geen ondersteunde Nexus-indeling.');
    const settings = validateSettings(data.settings);
    for (const key of ['theme', 'density', 'profile', 'reduceMotion']) if (key in settings) store.data.settings[key] = settings[key];
    store.data.webWidgets = (Array.isArray(data.webWidgets) ? data.webWidgets : []).filter(w => typeof w.id === 'string' && /^web-[a-zA-Z0-9-]+$/.test(w.id) && typeof w.name === 'string' && safeWebUrl(w.url)).slice(0, 30).map(w => ({ id: w.id, name: w.name.slice(0, 50), url: safeWebUrl(w.url) }));
    const allowed = [...WIDGETS, ...store.data.webWidgets.map(w => w.id)];
    for (const profile of ['command', 'gaming', 'focus']) if (Array.isArray(data.layouts?.[profile])) store.data.layouts[profile] = [...new Set(data.layouts[profile].filter(w => allowed.includes(w)))];
    store.data.sizes = Object.fromEntries(Object.entries(data.sizes || {}).filter(([k, v]) => allowed.includes(k) && ['normal', 'wide'].includes(v)));
    return save();
  });
}
let nativeBusy = false;
async function nativeSnapshot() {
  if (nativeBusy || !native.ready) return;
  nativeBusy = true;
  try {
    const data = await native.request('snapshot');
    const now = Date.now();
    if (data.network) {
      const elapsed = networkSample ? (now - networkSample.at) / 1000 : 0;
      data.network.download = elapsed ? Math.max(0, (data.network.received - networkSample.received) / elapsed) : 0;
      data.network.upload = elapsed ? Math.max(0, (data.network.sent - networkSample.sent) / elapsed) : 0;
      networkSample = { ...data.network, at: now };
    }
    metrics = { ...metrics, ...data, nativeReady: true }; emitMetrics();
  } catch { metrics.nativeReady = false; } finally { nativeBusy = false; }
}
function emitMetrics() { if (win && !win.isDestroyed()) win.webContents.send('metrics', metrics); }

if (hasLock) app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  updates = new Updates({
    engine: electronUpdater.autoUpdater, version: app.getVersion(), enabled: app.isPackaged && process.platform === 'win32',
    automatic: () => !testing && store.data.settings.checkUpdates,
    prepareInstall: async () => {
      hideService();
      if (desktop?.ready) await desktop.request('release-all');
      store.save();
      // The updater must be allowed to quit a tray-only app after restoring native windows.
      stopping = true; quit = true;
    },
    installFailed: () => { stopping = false; quit = false; },
  });
  if (testing) app.nexusTestUpdates = updates;
  updates.on('state', data => { if (win && !win.isDestroyed()) win.webContents.send('updates:state', data); updateTray(); });
  updates.on('available', data => {
    if (win?.isVisible() || !Notification.isSupported() || testing) return;
    const notification = new Notification({ title: `Nexus Hub ${data.version} beschikbaar`, body: 'Open Nexus om de update te bekijken en te installeren.' });
    notification.on('click', () => { showMain(); updates.prompt(); }); notification.show();
  });
  if (!store.data.feature110) { store.data.settings.artwork = true; store.data.feature110 = true; store.save(); }
  artwork = new Artwork(app.getPath('userData')); await artwork.init();
  protocol.handle('nexus-cover', request => {
    const url = new URL(request.url); const file = url.pathname.slice(1);
    if (url.hostname !== 'local' || !/^[a-f0-9]{64}\.jpg$/.test(file)) return new Response('Not found', { status: 404 });
    return net.fetch(new URL('file:///' + path.join(artwork.directory, file).replaceAll('\\', '/')).href);
  });
  desktop = new NativeBridge(nativeDirectory, 'desktop.ps1'); desktop.on('ready', async () => { try { nativeApps = await desktop.request('inventory'); broadcast(); } catch {} }); desktop.start();
  if (testing) app.nexusTestDesktop = desktop;
  rgb = new RGB(nativeDirectory, app.getPath('userData'));
  hardware = new Hardware(nativeDirectory);
  try { library = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'library.json'), 'utf8')); } catch {}
  native = new NativeBridge(nativeDirectory); native.on('ready', () => { nativeSnapshot(); broadcast(); }); native.start();
  const attached = screen.getAllDisplays();
  if (store.data.settings.displayId == null) {
    const first = attached.find(d => d.id !== screen.getPrimaryDisplay().id) || screen.getPrimaryDisplay();
    store.data.settings.displayId = first.id;
    store.data.settings.displayIdentity = rememberDisplay(first);
    store.save();
  }
  const selected = selectedDisplay();
  if (selected && !store.data.settings.displayIdentity) { store.data.settings.displayIdentity = rememberDisplay(selected); store.save(); }
  // An offscreen hidden window can be constructed while the selected monitor is absent.
  const preferred = selected || screen.getPrimaryDisplay();
  if (app.isPackaged && store.data.settings.autostart) app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });
  win = new BrowserWindow({ width: Math.min(1600, preferred.workArea.width), height: Math.min(960, preferred.workArea.height), x: preferred.workArea.x, y: preferred.workArea.y, minWidth: 480, minHeight: 560, frame: false, skipTaskbar: true, backgroundColor: '#0c0f14', show: false, title: 'Nexus Hub', icon: path.join(directory, '..', 'assets', 'icon.png'), webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  Menu.setApplicationMenu(null);
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  win.on('close', event => { if (!quit) { event.preventDefault(); hideMain(); } });
  win.on('minimize', () => { if (!positioning && selectedDisplay()) hideMain(); });
  win.on('will-move', event => event.preventDefault());
  win.on('moved', () => {
    if (!positioning && selectedDisplay() && screen.getDisplayMatching(win.getBounds()).id !== selectedDisplay().id) displayChanged();
  });
  win.on('enter-full-screen', broadcast); win.on('leave-full-screen', broadcast);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { event.preventDefault(); win.setFullScreen(!win.isFullScreen()); store.data.settings.fullscreen = win.isFullScreen(); store.save(); }
    if (input.key === 'Escape' && win.isFullScreen()) { win.setFullScreen(false); store.data.settings.fullscreen = false; store.save(); }
  });
  installHandlers();
  if (devURL) await win.loadURL(devURL); else await win.loadFile(path.join(directory, '..', 'dist', 'index.html'));
  if (selected && store.data.settings.fullscreen) win.setFullScreen(true);
  win.setAlwaysOnTop(store.data.settings.alwaysOnTop); if (selected) win.show();
  const trayImage = nativeImage.createFromPath(path.join(directory, '..', 'assets', 'icon.png')).resize({ width: 32, height: 32 });
  tray = new Tray(trayImage); tray.setToolTip('Nexus Hub · Ctrl+Shift+Space');
  updateTray();
  updates.start();
  tray.on('double-click', showMain);
  globalShortcut.register('CommandOrControl+Shift+Space', () => win.isVisible() ? hideMain() : showMain());
  globalShortcut.register('CommandOrControl+Shift+O', toggleOverlay);
  screen.on('display-removed', displayChanged);
  screen.on('display-added', displayChanged); screen.on('display-metrics-changed', displayChanged);
  metrics = { ...metrics, ...basicStats() };
  timers.push(setInterval(() => { metrics = { ...metrics, ...basicStats() }; emitMetrics();
    if (store.data.timer.endsAt && Date.now() >= store.data.timer.endsAt) { store.data.timer = { ...store.data.timer, endsAt: null, remaining: 0 }; if (Notification.isSupported()) new Notification({ title: 'Tijd voor een pauze', body: 'Je Nexus-focussessie is afgerond.' }).show(); save(); }
  }, 2000));
  timers.push(setInterval(nativeSnapshot, 2500));
  let hardwareBusy = false;
  const updateHardware = async () => {
    if (hardwareBusy) return; hardwareBusy = true;
    try { const data = await hardware.snapshot(); metrics.hardware = data; metrics.gpu = data.gpus.find(g => g.usage != null) || data.gpus[0]; metrics.disks = data.disks; emitMetrics(); }
    catch {} finally { hardwareBusy = false; }
  };
  hardware.init().then(updateHardware).catch(() => {}); timers.push(setInterval(updateHardware, 12000));
  artwork.refresh(allGames(), broadcast).catch(() => {});
  if (!testing || process.env.NEXUS_TEST_SCAN === '1') scan();
});
app.on('second-instance', showMain);
app.on('activate', showMain);
app.on('before-quit', event => {
  if (!stopping && desktop?.ready) { event.preventDefault(); stopping = true; desktop.request('release-all').catch(() => {}).finally(() => app.quit()); return; }
  quit = true; updates?.stop(); clearTimeout(repositionTimer); timers.forEach(clearInterval); native?.stop(); desktop?.stop(); rgb?.stop(); for (const view of views.values()) view.webContents.close(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
