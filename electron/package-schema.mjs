export const STORE_REPOSITORY = 'matix-codex/Nexus-Store';
export const STORE_BRANCH = 'main';
export const STORE_BASE = `https://raw.githubusercontent.com/${STORE_REPOSITORY}/${STORE_BRANCH}/`;
export const packageId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{2,59}$/.test(value);
export const versionValid = value => typeof value === 'string' && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value);
export function compareVersions(a, b) { if (!versionValid(a) || !versionValid(b)) throw new Error('Ongeldige pakketversie.'); const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i=0;i<3;i++) if (x[i] !== y[i]) return Math.sign(x[i]-y[i]); return 0; }
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function validatePackage(p) {
  if (!p || p.schema !== 1 || !packageId(p.id) || !versionValid(p.version) || !versionValid(p.minNexus) || !text(p.name, 60) || !text(p.description, 500) || !text(p.author, 80) || !['app','widget','tool','theme'].includes(p.kind) || !/^#[a-f0-9]{6}$/i.test(p.accent)) throw new Error('Dit is geen geldig Nexus-pakket.');
  if (!Array.isArray(p.permissions) || p.permissions.some(x => !['storage','web'].includes(x)) || new Set(p.permissions).size !== p.permissions.length) throw new Error('Niet-ondersteunde pakketmachtiging.');
  if (p.kind === 'theme') {
    if (p.content?.type !== 'theme' || p.permissions.length) throw new Error('Ongeldig thema.');
    const palette = p.content.palette;
    for (const key of ['accent','background','panel','text','muted']) if (!/^#[a-f0-9]{6}$/i.test(palette?.[key])) throw new Error('Ongeldig themapalet.');
  } else if (p.content?.type === 'web') {
    let url; try { url = new URL(p.content.url); } catch { throw new Error('Ongeldig appadres.'); }
    if (p.kind !== 'app' || !p.permissions.includes('web') || url.protocol !== 'https:' || url.username || url.password) throw new Error('Webapps vereisen een https-adres en webmachtiging.');
  } else if (p.content?.type === 'sandbox') {
    if (p.permissions.includes('web') || !text(p.content.html, 500000)) throw new Error('Ongeldige lokale uitbreiding.');
    if (!Number.isInteger(p.content.height) || p.content.height < 200 || p.content.height > 1200) throw new Error('Ongeldige widgethoogte.');
  } else throw new Error('Dit pakket vereist een nieuwere Nexus-runtime.');
  return p;
}
export function validateCatalog(value) {
  if (value?.schema !== 1 || !Array.isArray(value.packages) || value.packages.length > 500) throw new Error('De storecatalogus is ongeldig.');
  const ids = new Set();
  for (const p of value.packages) {
    if (!packageId(p.id) || ids.has(p.id) || !versionValid(p.version) || !versionValid(p.minNexus) || !text(p.name,60) || !text(p.description,500) || !text(p.author,80) || !['app','widget','tool','theme'].includes(p.kind) || !/^#[a-f0-9]{6}$/i.test(p.accent)) throw new Error('Ongeldige storevermelding.');
    if (p.path !== `packages/${p.id}/${p.version}.nexus.json` || !/^[a-f0-9]{64}$/.test(p.sha256) || !Number.isInteger(p.size) || p.size < 1 || p.size > 1024*1024) throw new Error('Ongeldige pakketdownload.');
    if (!Array.isArray(p.permissions) || p.permissions.some(x=> !['storage','web'].includes(x))) throw new Error('Onbekende pakketmachtiging.');
    ids.add(p.id);
  }
  return value;
}
