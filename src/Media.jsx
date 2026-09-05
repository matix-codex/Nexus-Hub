import React from 'react';
import { ArrowUpRight, Headphones, MessageCircle, Monitor, Music2, Pause, Play, Radio, SkipBack, SkipForward, Volume2, Waves } from 'lucide-react';
import { api } from './api.js';
import './workspace.css';
const time=n=>`${Math.floor(Math.max(0,n||0)/60)}:${Math.floor(Math.max(0,n||0)%60).toString().padStart(2,'0')}`;
export function MediaWidget({ state, metrics, player, run, goService, navigate, changeSettings }) {
  const selected=state.settings.mediaSource || 'auto';
  const source=selected==='auto' ? player.playing || player.loading ? 'radio' : metrics.spotify?.playing ? 'spotify' : 'windows' : selected;
  const media=source==='spotify'?metrics.spotify:metrics.media;
  const radio=source==='radio', playing=radio?player.playing:media?.playing;
  const title=radio?player.current?.name:media?.title;
  const switchSource=value=>{if(value==='spotify'||value==='windows')player.stop();changeSettings({mediaSource:value});};
  const toggle=()=>radio ? player.current ? player.toggle():navigate('radio') : run(()=>api.media('toggle',source));
  return <><div className="widget-header"><h2><Music2 size={16}/>Media</h2><span className="caption">ÉÉN SPELER</span></div>
    <div className="media-source-tabs" role="group" aria-label="Mediabron">{[['auto','Automatisch'],['spotify','Spotify'],['radio','Radio'],['windows','Windows']].map(([id,label])=><button key={id} className={selected===id?'active':''} aria-pressed={selected===id} onClick={()=>switchSource(id)}>{label}</button>)}</div>
    <div className={`unified-media-art ${playing?'playing':''}`}><div className="media-disc"><Waves size={34}/></div><span>{radio?'LIVE RADIO':source==='spotify'?'SPOTIFY':'NOW PLAYING'}</span><div className="media-bars">{Array.from({length:12},(_,i)=><i key={i} style={{'--bar':i}}/>)}</div></div>
    <div className="unified-track"><h3 title={title}>{title || (radio?'Kies jouw zender':'Jouw muziek, hier')}</h3><p>{radio?player.error || (player.loading?'Verbinden…':'Internetradio · Nexus'):media?.artist || (source==='spotify'?'Open Spotify en speel iets af':'Kies Spotify, radio of je Windows-mediaspeler')}</p></div>
    {!radio && <><div className="track-progress"><div style={{width:`${media?.duration?Math.min(100,media.position/media.duration*100):0}%`}}/></div><div className="track-times"><span>{time(media?.position)}</span><span>{time(media?.duration)}</span></div></>}
    <div className="media-controls"><button className="icon-button" aria-label="Vorige track" disabled={radio || !media?.canPrevious} onClick={()=>run(()=>api.media('previous',source))}><SkipBack size={18}/></button><button className="icon-button play-button" aria-label={playing?'Media pauzeren':'Media afspelen'} disabled={!radio && !media?.canPlay} onClick={toggle}>{playing || (radio&&player.loading)?<Pause size={20}/>:<Play size={20}/>}</button><button className="icon-button" aria-label="Volgende track" disabled={radio || !media?.canNext} onClick={()=>run(()=>api.media('next',source))}><SkipForward size={18}/></button></div>
    {radio && <div className="unified-volume"><Volume2 size={14}/><input aria-label="Mediavolume radio" type="range" min="0" max="100" value={player.volume} onChange={e=>player.setVolume(+e.target.value)}/><span>{player.volume}%</span></div>}
    <div className="media-shortcuts"><button onClick={()=>goService('spotify')}><Music2 size={14}/>Spotify in Nexus<ArrowUpRight size={12}/></button><button onClick={()=>navigate('radio')}><Radio size={14}/>Zenders</button></div>
    {!!state.radioFavorites?.length && <div className="media-favorites">{state.radioFavorites.slice(0,3).map(station=><button key={station.id} onClick={()=>player.play(station)}><Play size={11}/>{station.name}</button>)}</div>}
  </>;
}
export function AppWidget({ id, state, metrics, goService, openAppWidget, expanded=false, children }) {
  const definition=state.services[id], installed=state.nativeApps?.[id]?.installed;
  const Icon=id==='discord'?Headphones:id==='whatsapp'?MessageCircle:Music2;
  if(expanded) return children;
  const messages=id==='discord'||id==='whatsapp';
  return <><div className="widget-header"><h2><Icon size={16}/>{definition.name}</h2><span className="caption">{messages?'BERICHTEN':'NEXUS APPS'}</span></div><div className="native-widget-body" style={{'--app-color':definition.color}}><span className="native-widget-mark"><Icon size={29}/></span><div><h3>{id==='discord'?'Samen online':id==='whatsapp'?'Je gesprekken, dichtbij':'Jouw Spotify-bibliotheek'}</h3><p>{id==='spotify'&&metrics.spotify?.title?metrics.spotify.title: id==='discord'?'Bekijk je servers en berichten en reageer direct vanuit deze widget.':id==='whatsapp'?'Lees je gesprekken en reageer direct vanuit deze widget.':'Playlists, podcasts en je opgeslagen muziek.'}</p></div><span className="native-widget-status"><i className={`status-dot ${installed?'':'neutral'}`}/>{installed?'Windows-app verbonden':'Windows-app vereist'}</span><div className="native-widget-actions"><button className="button primary" onClick={()=>openAppWidget(id)}><Monitor size={14}/>{messages?'Berichten tonen':'Open op dashboard'}</button><button className="button secondary" onClick={()=>goService(id)} aria-label={`${definition.name} volledig openen`}><ArrowUpRight size={15}/></button></div></div></>;
}
