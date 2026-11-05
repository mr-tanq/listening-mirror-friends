/**
 * Read-only research probe: which OFFICIAL, legitimately accessible event
 * sources does each Dutch venue expose? Prints a compact JSON report.
 *
 *   node scripts/probe-venue-sources.mjs [venueId ...]
 *
 * Etiquette: identifies itself, reads robots.txt first and skips anything
 * disallowed for our agent, at most one request per second per host, a
 * bounded number of requests per venue, and no retries against 401/403/429
 * (those are access decisions, not errors to work around).
 */
const UA='ListeningMirrorFriends/1.2 (+https://github.com/mr-tanq/listening-mirror-friends)';
export const PROBE_VENUES={
 paradiso:['https://www.paradiso.nl/'],
 melkweg:['https://www.melkweg.nl/nl/agenda/'],
 tivoli:['https://www.tivolivredenburg.nl/agenda/'],
 '013':['https://www.013.nl/programma'],
 effenaar:['https://www.effenaar.nl/agenda'],
 doornroosje:['https://www.doornroosje.nl/'],
 patronaat:['https://www.patronaat.nl/programma'],
 paard:['https://www.paard.nl/agenda/'],
 vera:['https://www.vera-groningen.nl/programma/'],
 baroeg:['https://baroeg.nl/agenda/'],
 dbs:['https://www.dbstudio.nl/','https://www.dbs.nl/'],
 bibelot:['https://www.bibelot.net/agenda/'],
 grenswerk:['https://www.grenswerk.nl/agenda/']
};
const EVENTISH=/\/(?:agenda|programma|program|programme|event|events|evenement|evenementen|concert|concerten|shows?)\/[^?#]{3,}/i;

export function robotsRules(text,agent='ListeningMirrorFriends'){
 const groups=[];let current=null,lastWasAgent=false;
 for(const raw of String(text||'').split(/\r?\n/)){
  const line=raw.replace(/#.*/,'').trim();if(!line)continue;
  const [k,...rest]=line.split(':');const key=k.trim().toLowerCase(),value=rest.join(':').trim();
  if(key==='user-agent'){if(!lastWasAgent){current={agents:[],rules:[]};groups.push(current);}current.agents.push(value.toLowerCase());lastWasAgent=true;continue;}
  lastWasAgent=false;
  if(current&&(key==='allow'||key==='disallow'))current.rules.push({allow:key==='allow',path:value});
  if(key==='crawl-delay'&&current)current.crawlDelay=Number(value)||undefined;
  if(key==='sitemap')(groups.sitemaps||=[]).push(value);
 }
 const mine=groups.filter(g=>g.agents.some(a=>a!=='*'&&agent.toLowerCase().includes(a)));
 const chosen=mine.length?mine:groups.filter(g=>g.agents.includes('*'));
 return {rules:chosen.flatMap(g=>g.rules),crawlDelay:Math.max(0,...chosen.map(g=>g.crawlDelay||0)),sitemaps:groups.sitemaps||[]};
}
export function robotsAllows(robots,url){
 const path=new URL(url).pathname+new URL(url).search;
 let best=null;
 for(const r of robots?.rules||[]){
  if(r.path==='')continue;
  const re=new RegExp('^'+r.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$'));
  if(re.test(path)&&(!best||r.path.length>best.path.length||(r.path.length===best.path.length&&r.allow)))best=r;
 }
 return !best||best.allow;
}
const pick=(s,re)=>[...String(s).matchAll(re)].map(m=>m[1]);
export function inspectHtml(html,base){
 const ldTypes=new Set(),ldEvents=[];
 for(const block of pick(html,/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)){
  try{
   const walk=x=>{if(Array.isArray(x))return x.forEach(walk);if(!x||typeof x!=='object')return;
    const types=[].concat(x['@type']||[]);types.forEach(t=>ldTypes.add(t));
    if(types.some(t=>/Event$/.test(t)))ldEvents.push({type:types.join(','),name:x.name,startDate:x.startDate,location:typeof x.location==='object'?x.location?.name:x.location,image:Array.isArray(x.image)?x.image[0]:(x.image?.url||x.image),url:x.url,performer:[].concat(x.performer||[]).map(p=>p?.name||p).slice(0,4)});
    if(x['@graph'])walk(x['@graph']);Object.values(x).forEach(v=>{if(v&&typeof v==='object')walk(v);});};
   walk(JSON.parse(block));
  }catch{}
 }
 const metas=Object.fromEntries(pick(html,/<meta\b([^>]*)>/gi).map(a=>{const p=(a.match(/(?:property|name)=["']([^"']+)/i)||[])[1];const c=(a.match(/content=["']([^"']*)/i)||[])[1];return [p,c];}).filter(([p])=>p&&/^(?:og:|twitter:image|generator)/i.test(p)));
 const links=[...new Set(pick(html,/href=["']([^"'#]+)["']/gi).map(h=>{try{return new URL(h.replace(/&amp;/g,'&'),base).href;}catch{return '';}}).filter(Boolean))];
 const host=new URL(base).hostname;
 const eventLinks=links.filter(u=>{try{const x=new URL(u);return x.hostname===host&&EVENTISH.test(x.pathname);}catch{return false;}});
 const feeds=pick(html,/<link\b([^>]*rel=["']alternate["'][^>]*)>/gi).map(a=>({type:(a.match(/type=["']([^"']+)/i)||[])[1],href:(a.match(/href=["']([^"']+)/i)||[])[1]}));
 return {
  bytes:html.length,
  framework:[/__NEXT_DATA__/.test(html)&&'next',/window\.__NUXT__|__NUXT_DATA__/.test(html)&&'nuxt',/wp-content|wp-json/.test(html)&&'wordpress',/data-reactroot|id="root"|id="app"/.test(html)&&'spa-root',/Drupal/.test(html)&&'drupal',/craftcms|cpresources/i.test(html)&&'craft'].filter(Boolean),
  generator:metas.generator,ldTypes:[...ldTypes].slice(0,15),ldEvents:ldEvents.slice(0,3),ldEventCount:ldEvents.length,
  ogImage:metas['og:image']||metas['twitter:image']||'',ogTitle:metas['og:title']||'',
  eventLinkCount:eventLinks.length,eventLinkSample:eventLinks.slice(0,6),feeds:feeds.slice(0,5),
  apiHints:[...new Set(pick(html,/["'](https?:\/\/[^"']*(?:\/api\/|graphql|wp-json|\.json|\.ics|\/feed)[^"']*)["']/gi))].slice(0,8)
 };
}
function sitemapLocs(xml){return pick(xml,/<loc>\s*([^<\s]+)\s*<\/loc>/gi).map(s=>s.replace(/&amp;/g,'&'));}

export async function probeVenue(id,starts,{fetcher=fetch,maxRequests=14,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const origin=new URL(starts[0]).origin;const out={id,origin,requests:[],notes:[]};let used=0,last=0;
 const get=async(url,{allowAny=false}={})=>{
  if(used>=maxRequests)return null;
  if(!allowAny&&out.robots&&!robotsAllows(out.robots,url)){out.requests.push({url,skipped:'robots.txt'});return null;}
  const wait=Math.max(1000,(out.robots?.crawlDelay||0)*1000)-(Date.now()-last);if(wait>0)await delay(wait);
  used++;last=Date.now();
  try{
   const r=await fetcher(url,{headers:{'User-Agent':UA,Accept:'text/html,application/xhtml+xml,application/xml,application/json,text/calendar;q=0.9,*/*;q=0.5'},redirect:'follow',signal:AbortSignal.timeout(12000)});
   const type=r.headers.get('content-type')||'';const server=[r.headers.get('server'),r.headers.get('cf-ray')&&'cloudflare',r.headers.get('x-vercel-id')&&'vercel'].filter(Boolean).join('/');
   const body=r.ok?await r.text():'';
   out.requests.push({url,status:r.status,final:r.url!==url?r.url:undefined,type:type.split(';')[0],server:server||undefined,bytes:body.length});
   return {status:r.status,type,body,url:r.url};
  }catch(e){out.requests.push({url,error:String(e.message||e).slice(0,80)});return null;}
 };
 const robots=await get(origin+'/robots.txt',{allowAny:true});
 out.robots=robots?.status===200?robotsRules(robots.body):{rules:[],sitemaps:[]};
 out.robotsSummary={disallow:out.robots.rules.filter(r=>!r.allow).map(r=>r.path).slice(0,12),crawlDelay:out.robots.crawlDelay||undefined,sitemaps:out.robots.sitemaps};
 let page=null;
 for(const start of starts){page=await get(start);if(page?.status===200)break;}
 if(page?.status===200)out.agenda=inspectHtml(page.body,page.url);
 // Sitemaps: event URLs from the venue's own published index.
 const maps=[...new Set([...(out.robots.sitemaps||[]),origin+'/sitemap.xml',origin+'/sitemap_index.xml'])].slice(0,3);
 const eventUrls=new Set();
 for(const map of maps){
  if(used>=maxRequests-4)break;
  const m=await get(map);if(m?.status!==200)continue;
  const locs=sitemapLocs(m.body);
  const children=locs.filter(u=>/\.xml(?:\.gz)?$/i.test(u));
  (out.sitemaps||=[]).push({url:map,locs:locs.length,children:children.slice(0,12)});
  locs.filter(u=>EVENTISH.test(u)).forEach(u=>eventUrls.add(u));
  const child=children.find(u=>/event|agenda|programm|concert|show|voorstelling/i.test(u));
  if(child&&used<maxRequests-3){const c=await get(child);if(c?.status===200){const cl=sitemapLocs(c.body);out.sitemaps.push({url:child,locs:cl.length,sample:cl.slice(-3)});cl.filter(u=>EVENTISH.test(u)).forEach(u=>eventUrls.add(u));}}
 }
 out.sitemapEventUrls=eventUrls.size;
 // WordPress REST discovery (only if the site advertises WordPress).
 if(out.agenda?.framework?.includes('wordpress')&&used<maxRequests-2){
  const wp=await get(origin+'/wp-json/wp/v2/types');
  if(wp?.status===200){try{out.wordpressTypes=Object.keys(JSON.parse(wp.body));}catch{}}
  const tribe=await get(origin+'/wp-json/tribe/events/v1/events?per_page=1');
  if(tribe?.status===200)out.notes.push('The Events Calendar REST API available');
 }
 // One sample event page: does it carry JSON-LD Event + og:image?
 const sample=[...(out.agenda?.eventLinkSample||[]),...[...eventUrls].slice(-5)].find(u=>!/\/(?:agenda|programma)\/?$/.test(new URL(u).pathname));
 if(sample){const ev=await get(sample);if(ev?.status===200)out.sampleEvent={url:sample,...inspectHtml(ev.body,ev.url)};}
 delete out.robots;
 return out;
}
if(import.meta.url===`file://${process.argv[1]}`){
 const ids=process.argv.slice(2).length?process.argv.slice(2):Object.keys(PROBE_VENUES);
 const results=await Promise.all(ids.map(id=>probeVenue(id,PROBE_VENUES[id])));
 for(const r of results)console.log('VENUE '+JSON.stringify(r));
}
