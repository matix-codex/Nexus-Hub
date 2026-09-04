import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { STORE_BASE, STORE_REPOSITORY, packageId, validateCatalog, validatePackage, compareVersions } from './package-schema.mjs';

async function atomic(file, value) { const temporary = file + '.tmp'; await fs.writeFile(temporary, value); await fs.rename(temporary, file); }
export class Marketplace extends EventEmitter {
  constructor(directory, version, { fetcher = fetch, base = STORE_BASE } = {}) { super(); this.directory = path.join(directory, 'extensions'); this.version = version; this.fetcher = fetcher; this.base = base; this.installed = Object.create(null); this.catalog = { schema:1, packages:[] }; this.status='idle'; this.error=null; this.checkedAt=null; this.operations=new Set(); this.dataQueue=Promise.resolve(); }
  async init() {
    await fs.mkdir(this.directory, { recursive:true });
    try { this.catalog=validateCatalog(JSON.parse(await fs.readFile(path.join(this.directory,'catalog.json'),'utf8'))); } catch {}
    for (const name of await fs.readdir(this.directory)) if (/^[a-z][a-z0-9-]+\.json$/.test(name) && name!=='catalog.json') {
      try { const p=validatePackage(JSON.parse(await fs.readFile(path.join(this.directory,name),'utf8'))); if (name===`${p.id}.json` && compareVersions(p.minNexus,this.version)<=0) this.installed[p.id]=p; } catch {}
    }
    return this.snapshot();
  }
  snapshot() { return { repository:STORE_REPOSITORY, status:this.status, error:this.error, checkedAt:this.checkedAt, busy:[...this.operations], packages:this.catalog.packages.map(p=>({...p,installedVersion:this.installed[p.id]?.version || null,updateAvailable:!!this.installed[p.id] && compareVersions(p.version,this.installed[p.id].version)>0,compatible:compareVersions(p.minNexus,this.version)<=0})), installed:Object.values(this.installed).map(({content,...p})=>({...p,content:{type:content.type,height:content.height,palette:content.palette,url:content.url}})) }; }
  emitState() { this.emit('state',this.snapshot()); }
  async get(relative, limit) {
    const response=await this.fetcher(new URL(relative,this.base),{signal:AbortSignal.timeout(20000),redirect:'error',cache:'no-store'});
    if (!response.ok) throw new Error(`GitHub is niet bereikbaar (${response.status}). Probeer het later opnieuw.`);
    if (Number(response.headers.get('content-length'))>limit) throw new Error('Het pakket is te groot.');
    let size=0; const chunks=[];
    for await (const chunk of response.body) { size+=chunk.length; if (size>limit) throw new Error('Het pakket is te groot.'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  refresh() {
    if (this.refreshing) return this.refreshing;
    this.status='loading'; this.error=null; this.emitState();
    this.refreshing=(async()=>{try { const bytes=await this.get('catalog.json',1024*1024); const catalog=validateCatalog(JSON.parse(bytes.toString('utf8'))); await atomic(path.join(this.directory,'catalog.json'),JSON.stringify(catalog)); this.catalog=catalog; this.checkedAt=Date.now(); this.status='ready'; } catch(e) {this.status='error';this.error=e.message;} finally {this.refreshing=null;this.emitState();} return this.snapshot();})(); return this.refreshing;
  }
  async install(id) {
    if (!packageId(id) || this.operations.has(id)) throw new Error('Dit pakket wordt al verwerkt of bestaat niet.');
    const entry=this.catalog.packages.find(p=>p.id===id); if (!entry) throw new Error('Vernieuw eerst de storecatalogus.');
    if (compareVersions(entry.minNexus,this.version)>0) throw new Error(`Dit pakket vereist Nexus ${entry.minNexus}. Werk Nexus eerst bij.`);
    if (this.installed[id] && compareVersions(entry.version,this.installed[id].version)<=0) return this.snapshot();
    this.operations.add(id); this.emitState();
    try {
      const bytes=await this.get(entry.path,1024*1024);
      if (bytes.length!==entry.size || crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256) throw new Error('Checksumcontrole mislukt. Je huidige versie blijft behouden.');
      const pkg=validatePackage(JSON.parse(bytes.toString('utf8')));
      for (const k of ['id','version','kind','minNexus','name','description','author','accent']) if(pkg[k]!==entry[k]) throw new Error('Pakket komt niet overeen met de catalogus.');
      if (JSON.stringify(pkg.permissions)!==JSON.stringify(entry.permissions)) throw new Error('Pakketmachtigingen komen niet overeen met de catalogus.');
      await atomic(path.join(this.directory,`${id}.json`),bytes);
      this.installed[id]=pkg;
    } finally {this.operations.delete(id);this.emitState();}
    return this.snapshot();
  }
  async remove(id) { if (!packageId(id) || this.operations.has(id)) throw new Error('Pakket wordt verwerkt.'); this.operations.add(id); try { await fs.rm(path.join(this.directory,`${id}.json`),{force:true}); delete this.installed[id]; } finally {this.operations.delete(id);this.emitState();} return this.snapshot(); }
  content(id) { const pkg=this.installed[id]; if (!pkg) throw new Error('Installeer deze uitbreiding eerst.'); return pkg; }
  data(id, value) {
    if (!this.installed[id]?.permissions.includes('storage')) return Promise.reject(new Error('Deze uitbreiding heeft geen opslagmachtiging.'));
    const file=path.join(this.directory,`${id}.data`);
    const job=this.dataQueue.catch(()=>{}).then(async()=>{ if(value===undefined){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}} const json=JSON.stringify(value); if(!json || json.length>65536)throw new Error('Maximaal 64 KB opslag per uitbreiding.');await atomic(file,json);return value; }); this.dataQueue=job;return job;
  }
  service(id) { const p=this.installed[id]; return p?.content.type==='web' ? {id:`store:${id}`,name:p.name,url:p.content.url,color:p.accent} : null; }
  services() {return Object.keys(this.installed).map(id=>this.service(id)).filter(Boolean);}
}
