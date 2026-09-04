import React from 'react';
import { Check, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from './api.js';
import './updates.css';

const labels = {
  disabled: 'Updates zijn beschikbaar in de geïnstalleerde Windows-app.',
  idle: 'Nexus controleert GitHub op nieuwe versies.',
  checking: 'Nieuwe versies zoeken op GitHub…',
  current: 'Je gebruikt de nieuwste versie.',
  available: 'Een nieuwe versie van Nexus staat klaar.',
  downloading: 'De update wordt gedownload en gecontroleerd.',
  downloaded: 'De update is klaar om te installeren.',
  installing: 'Nexus sluit af en opent de installer…',
};
export function UpdateDetails({ update, run, onLater }) {
  const u = update || { status: 'disabled' };
  const busy = ['checking', 'downloading', 'installing'].includes(u.status);
  const retry = u.status === 'error' ? u.retry : null;
  const canDownload = u.status === 'available' || retry === 'download';
  const canInstall = u.status === 'downloaded' || retry === 'install';
  return <div className="update-details" data-update-status={u.status}>
    <div className="update-summary"><span className="update-symbol">{busy ? <RefreshCw size={25} className="spin" /> : u.status === 'current' ? <Check size={25} /> : <Download size={25} />}</span><div><strong>{u.version ? `Nexus Hub ${u.version}` : u.status === 'current' ? 'Nexus up-to-date' : 'Updates voor Nexus'}</strong><p role="status">{u.error || labels[u.status]}</p></div></div>
    {u.status === 'downloading' && <div className="update-progress"><progress aria-label="Update downloaden" max="100" value={u.progress} /><span>{u.progress}%</span></div>}
    {(canDownload || canInstall) && <p className="update-explanation">{canInstall ? 'Nexus wordt afgesloten voor de installatie en daarna opnieuw gestart. Je instellingen en vaste schermkeuze blijven bewaard.' : 'Download de update hier. Zodra deze klaar is, kies je zelf wanneer Nexus mag afsluiten en installeren.'}</p>}
    <div className="update-actions">
      {onLater && <button className="button secondary" onClick={onLater}>{busy ? 'Op de achtergrond' : 'Later'}</button>}
      {canDownload && <button className="button primary" onClick={() => run(() => api.updateDownload())}><Download size={16} />Update downloaden</button>}
      {canInstall && <button className="button primary" onClick={() => run(() => api.updateInstall())}><RefreshCw size={16} />Installeren en herstarten</button>}
      {!canDownload && !canInstall && <button className="button secondary" disabled={busy || u.status === 'disabled'} onClick={() => run(() => api.updateCheck())}><RefreshCw size={15} />{u.status === 'checking' ? 'Controleren…' : 'Controleren op updates'}</button>}
    </div>
    <div className="update-meta"><span>{u.checkedAt ? `Laatst gecontroleerd: ${new Date(u.checkedAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}` : 'Bron: matix-codex / Nexus-Hub'}</span>{u.status !== 'disabled' && <button className="text-link" onClick={() => run(() => api.updateRelease())}>Release op GitHub<ExternalLink size={12} /></button>}</div>
  </div>;
}
export function UpdateSettings({ state, update, changeSettings, run }) {
  return <section className="settings-section update-settings"><div className="section-title"><Download size={20} /><div><h2>Nexus-updates</h2><p>Geïnstalleerd: {state.version} · Stabiele GitHub-releases</p></div></div>
    <div className="setting-row"><div><strong>Automatisch controleren</strong><p>Bij het starten en elke zes uur. Installeren gebeurt na jouw keuze.</p></div><button className={`toggle ${state.settings.checkUpdates ? 'on' : ''}`} role="switch" aria-label="Automatisch controleren op updates" aria-checked={Boolean(state.settings.checkUpdates)} onClick={() => changeSettings({ checkUpdates: !state.settings.checkUpdates })} /></div>
    <UpdateDetails update={update} run={run} />
  </section>;
}
