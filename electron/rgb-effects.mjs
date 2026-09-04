export const EFFECTS = ['solid','rainbow','wave','breathing','color-cycle'];
export function effectOptions(value) {
  if (!value || !EFFECTS.includes(value.effect || 'solid') || !/^#[a-f0-9]{6}$/i.test(value.color) || !Number.isFinite(value.brightness) || value.brightness<0 || value.brightness>100 || !Number.isFinite(value.speed ?? 50) || (value.speed ?? 50)<1 || (value.speed ?? 50)>100 || !Array.isArray(value.ids) || !value.ids.length || value.ids.length>256 || value.ids.some(id=>typeof id!=='string')) throw new Error('Kies apparaten, een lichtschema, kleur, helderheid en snelheid.');
  return {...value, ids:[...new Set(value.ids)], effect:value.effect || 'solid',speed:value.speed ?? 50};
}
function hsv(h, brightness) {const x=(h%1+1)%1*6, c=255*brightness, a=c*(1-Math.abs(x%2-1));const rgb=x<1?[c,a,0]:x<2?[a,c,0]:x<3?[0,c,a]:x<4?[0,a,c]:x<5?[a,0,c]:[c,0,a];return rgb.map(Math.round);}
export function effectFrame(options, count, elapsed, deviceIndex=0) {
  const n=Math.max(1,Math.min(4096,count)), phase=elapsed/1000*(.03+options.speed/250), level=options.brightness/100;
  const base=[1,3,5].map(i=>parseInt(options.color.slice(i,i+2),16));
  return Array.from({length:n},(_,i)=>{
    if(options.effect==='rainbow')return hsv(phase+i/n,level);
    if(options.effect==='color-cycle')return hsv(phase,level);
    if(options.effect==='wave')return hsv(phase-i/n*.45-deviceIndex*.09,level);
    const pulse=options.effect==='breathing'?.12+.88*(1-Math.cos(phase*Math.PI*2))/2:1;
    return base.map(v=>Math.round(v*level*pulse));
  });
}
