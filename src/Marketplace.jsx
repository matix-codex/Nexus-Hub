import React,{useEffect,useRef,useState} from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, Download, ExternalLink, Grid2X2, Package, Palette, Plus, RefreshCw, Search, ShieldCheck, Store, Trash2, Wrench } from 'lucide-react';
import { api } from './api.js';
import './marketplace.css';
const labels={app:'Apps',widget:'Widgets',tool:'Toepassingen',theme:'Thema’s'};
const icons={app:Grid2X2,widget:Package,tool:Wrench,theme:Palette};
export function themeStyle(marketplace, id) {
  const theme=marketplace?.installed.find(p=>p.id===id && p.kind==='theme');if(!theme)return {};
  const c=theme.content.palette, rgb=[1,3,5].map(i=>parseInt(c.accent.slice(i,i+2),16)).join(',');
  return {'--accent':c.accent,'--accent-rgb':rgb,'--accent-dark':c.panel,'--panel':c.panel,'--muted':c.muted,'--store-background':c.background,'--store-text':c.text};
}
export function StorePage({ marketplace, run, navigate, state, updateLayout }) {
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[detail,setDetail]=useState(null);
  const m=marketplace || {packages:[],installed:[],busy:[],status:'idle'};
  useEffect(()=>{run(()=>api.storeRefresh());},[]);
  const installed=new Map(m.installed.map(p=>[p.id,p]));
  const all=[...m.packages,...m.installed.filter(p=>!m.packages.some(item=>item.id===p.id)).map(p=>({...p,installedVersion:p.version,compatible:true}))];
  const updates=all.filter(p=>p.updateAvailable).length;
  const entries=all.filter(p=>(filter==='all'||filter===p.kind||(filter==='installed'&&installed.has(p.id))||(filter==='updates'&&p.updateAvailable))&&`${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()));
  const open=p=>p.kind==='theme'?run(()=>api.storeTheme(p.id),'Thema toegepast'):navigate(`store:${p.id}`);
  const add=p=>{const layout=state.layouts[state.settings.profile];if(!layout.includes(`store:${p.id}`))updateLayout([...layout,`store:${p.id}`]);};
  return <><div className="page-heading"><div><div className="eyebrow">MADE FOR YOUR WORKSPACE</div><h1>Nexus Store<span className="accent">.</span></h1><p>Nieuwe mogelijkheden voor jouw scherm. Installeer alleen wat jij gebruikt.</p></div><button className="button secondary" disabled={m.status==='loading'} onClick={()=>run(()=>api.storeRefresh())}><RefreshCw size={16} className={m.status==='loading'?'spin':''}/>Updates controleren</button></div>
    <section className="store-hero"><div><span className="pill">DE EERSTE COLLECTIE</span><h2>Geef je setup<br/>meer karakter.</h2><p>Zelfstandige apps, slimme widgets en thema’s.<br/>Elk pakket krijgt zijn eigen updates.</p><button className="button primary" onClick={()=>setFilter('widget')}>Ontdek widgets<ArrowUpRight size={16}/></button></div><div className="store-hero-art" aria-hidden="true"><span><Package/></span><span><Palette/></span><span><Wrench/></span><span><Grid2X2/></span><i/></div><div className="store-hero-footer"><span><ShieldCheck size={14}/>Nexus-collectie via GitHub</span><span>{m.installed.length} geïnstalleerd · {updates} updates</span></div></section>
    <div className="store-toolbar"><div className="store-tabs">{[['all','Ontdekken'],['installed','Geïnstalleerd'],['updates',`Updates${updates?` (${updates})`:''}`],...Object.entries(labels)].map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div><label className="input-search"><Search size={16}/><input aria-label="Zoeken in Nexus Store" placeholder="Zoek iets voor jouw setup…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    {m.error&&<div className="info-banner">{m.error} Geïnstalleerde uitbreidingen blijven beschikbaar.</div>}
    <div className="store-grid">{entries.map(p=>{const Icon=icons[p.kind],has=installed.has(p.id),busy=m.busy.includes(p.id);return <article className="store-card" key={p.id} style={{'--package-color':p.accent}}><button className={`store-cover kind-${p.kind}`} aria-label={`${p.name} bekijken`} onClick={()=>setDetail(detail===p.id?null:p.id)}><div className="store-cover-lines"/><span><Icon size={36} strokeWidth={1.3}/></span><small>{labels[p.kind]}</small>{p.updateAvailable&&<b>UPDATE</b>}</button><div className="store-card-body"><div><h3>{p.name}</h3><span className="store-version">v{p.version}</span></div><p>{p.description}</p><small>{p.author}</small>{detail===p.id&&<div className="store-detail"><span>Vereist Nexus {p.minNexus}</span><span>{p.permissions.includes('web')?'Opent de online dienst in een eigen appvenster.':p.permissions.includes('storage')?'Bewaart eigen gegevens lokaal.':'Werkt lokaal zonder account.'}</span>{has&&<span>Geïnstalleerd: {installed.get(p.id).version}</span>}</div>}<div className="store-card-actions">{!has||p.updateAvailable?<button className="button primary" disabled={busy||p.compatible===false} onClick={()=>run(()=>api.storeInstall(p.id),`${p.name} ${has?'bijgewerkt':'geïnstalleerd'}`)}>{busy?<RefreshCw size={14} className="spin"/>:<Download size={14}/>} {busy?'Downloaden…':p.compatible===false?'Nexus bijwerken':has?'Bijwerken':'Installeren'}</button>:<button className="button secondary" onClick={()=>open(p)}>{p.kind==='theme'?'Toepassen':'Openen'}<ArrowUpRight size={14}/></button>}{has&&p.kind!=='theme'&&<button className="icon-button" aria-label={`${p.name} op dashboard`} onClick={()=>add(p)}><Plus size={16}/></button>}{has&&<button className="icon-button store-remove" aria-label={`${p.name} verwijderen`} disabled={busy} onClick={()=>run(()=>api.storeRemove(p.id),`${p.name} verwijderd`)}><Trash2 size={15}/></button>}</div></div></article>;})}</div>
    {!entries.length&&<div className="extension-empty"><Store size={34}/><h3>{m.status==='loading'?'De collectie wordt opgehaald…':filter==='updates'?'Je uitbreidingen zijn bijgewerkt':'Nog geen resultaten'}</h3><p>{filter==='installed'?'Installeer je eerste uitbreiding vanuit Ontdekken.':'Probeer een andere categorie of zoekterm.'}</p></div>}
    <div className="store-footer"><span>Updates per uitbreiding · Je Nexus-installatie blijft staan</span><button className="text-link" onClick={()=>run(()=>api.storeRepository())}>GitHub-appstore<ExternalLink size={13}/></button></div>
  </>;
}
export function ExtensionFrame({ extension }) {
  const ref=useRef(),[error,setError]=useState('');
  useEffect(()=>{
    let disposed=false;
    const listener=async event=>{
      if(event.source!==ref.current?.contentWindow || event.data?.channel!=='nexus-extension-v1')return;
      const message=event.data;if(!['load','save'].includes(message.action)||typeof message.requestId!=='string'||message.requestId.length>80)return;
      try {const value=await api.storeData(extension.id,message.action==='save'?message.value:undefined);if(!disposed)ref.current?.contentWindow.postMessage({channel:'nexus-extension-response',requestId:message.requestId,value},'*');}
      catch(e){if(!disposed)ref.current?.contentWindow.postMessage({channel:'nexus-extension-response',requestId:message.requestId,error:e.message},'*');}
    };window.addEventListener('message',listener);return()=>{disposed=true;window.removeEventListener('message',listener);};
  },[extension.id,extension.version]);
  return <div className="extension-frame-wrap">{error&&<p role="alert">{error}</p>}<iframe ref={ref} key={`${extension.id}@${extension.version}`} title={extension.name} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" src={`nexus-extension://package/${extension.id}?v=${extension.version}`} style={{height:extension.content.height}} onError={()=>setError('De uitbreiding kon niet worden geopend.')}/></div>;
}
export function StoreWidget({ extension, navigate }) { const Icon=icons[extension.kind];return <><div className="widget-header"><h2><Icon size={15}/>{extension.name}</h2><button className="text-link" onClick={()=>navigate(`store:${extension.id}`)}><ArrowUpRight size={15}/></button></div>{extension.content.type==='sandbox'?<ExtensionFrame extension={extension}/>:<div className="native-widget-body"><Icon size={30}/><p>{extension.description}</p><button className="button secondary" onClick={()=>navigate(`store:${extension.id}`)}>Open in Nexus<ArrowUpRight size={15}/></button></div>}</>; }
export function ExtensionPage({ extension }) {return <><div className="page-heading"><div><div className="eyebrow">JOUW NEXUS-UITBREIDING</div><h1>{extension.name}<span className="accent">.</span></h1><p>{extension.description}</p></div><span className="pill">v{extension.version}</span></div><section className="extension-page"><ExtensionFrame extension={extension}/></section></>;}
