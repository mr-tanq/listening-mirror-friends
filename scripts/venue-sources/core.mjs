/**
 * Shared, venue-independent building blocks for official venue sources:
 * polite fetching (robots.txt, identification, per-host spacing, access
 * denial memory) and extraction of OFFICIAL structured event data
 * (Schema.org JSON-LD, Open Graph, sitemaps, iCalendar).
 *
 * Access rule: HTTP 401/403/429 and bot challenges are treated as the
 * venue's decision. We record them and back off; we never change identity,
 * rotate IPs, solve challenges or retry around them.
 */
export const USER_AGENT='ListeningMirrorFriends/1.2 (+https://github.com/mr-tanq/listening-mirror-friends)';

export function robotsRules(text,agent='ListeningMirrorFriends'){
 const groups=[];let current=null,lastWasAgent=false;const sitemaps=[];
 for(const raw of String(text||'').split(/\r?\n/)){
  const line=raw.replace(/#.*/,'').trim();if(!line)continue;
  const i=line.indexOf(':');if(i<1)continue;
  const key=line.slice(0,i).trim().toLowerCase(),value=line.slice(i+1).trim();
  if(key==='user-agent'){if(!lastWasAgent){current={agents:[],rules:[]};groups.push(current);}current.agents.push(value.toLowerCase());lastWasAgent=true;continue;}
  lastWasAgent=false;
  if(key==='sitemap'){sitemaps.push(value);continue;}
  if(!current)continue;
  if(key==='allow'||key==='disallow')current.rules.push({allow:key==='allow',path:value});
  if(key==='crawl-delay')current.crawlDelay=Number(value)||undefined;
 }
 const mine=groups.filter(g=>g.agents.some(a=>a!=='*'&&agent.toLowerCase().includes(a)));
 const chosen=mine.length?mine:groups.filter(g=>g.agents.includes('*'));
 return {rules:chosen.flatMap(g=>g.rules),crawlDelay:Math.max(0,...chosen.map(g=>g.crawlDelay||0)),sitemaps};
}
export function robotsAllows(robots,url){
 const u=new URL(url);const path=u.pathname+u.search;
 let best=null;
 for(const r of robots?.rules||[]){
  if(!r.path)continue;
  const re=new RegExp('^'+r.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$'));
  if(re.test(path)&&(!best||r.path.length>best.path.length||(r.path.length===best.path.length&&r.allow)))best=r;
 }
 return !best||best.allow;
}

/**
 * One polite client per venue host. `state` is the persisted per-venue
 * access record ({deniedUntil, lastStatus}); it is mutated and returned.
 */
export function createVenueClient(origin,{fetcher=fetch,state={},today=new Date().toISOString().slice(0,10),
 minSpacingMs=1500,maxRequests=40,clock=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let robots=null,used=0,last=0;
 const stats={requests:0,denied:0,skippedByRobots:0,errors:0};
 const deniedUntil=d=>{const x=new Date(today+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10);};
 async function raw(url,accept){
  const spacing=Math.max(minSpacingMs,(robots?.crawlDelay||0)*1000);
  const wait=spacing-(clock()-last);if(wait>0)await delay(wait);
  used++;stats.requests++;last=clock();
  return fetcher(url,{headers:{'User-Agent':USER_AGENT,Accept:accept},redirect:'follow',signal:AbortSignal.timeout(12000)});
 }
 async function ensureRobots(){
  if(robots)return robots;
  try{const r=await raw(origin+'/robots.txt','text/plain');robots=r.ok?robotsRules(await r.text()):{rules:[],sitemaps:[]};
   if([401,403].includes(r.status)){state.deniedUntil=deniedUntil(7);state.lastStatus=r.status;}}
  catch{robots={rules:[],sitemaps:[]};}
  return robots;
 }
 return {
  stats,state,
  get blocked(){return Boolean(state.deniedUntil&&state.deniedUntil>today);},
  async robots(){return ensureRobots();},
  /** Returns {status,url,text} or null when not allowed / budget spent / denied. */
  async get(url,{accept='text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5'}={}){
   if(new URL(url).origin!==origin)throw new Error('Cross-origin request refused: '+url);
   if(state.deniedUntil&&state.deniedUntil>today)return null;
   await ensureRobots();
   if(state.deniedUntil&&state.deniedUntil>today)return null;
   if(!robotsAllows(robots,url)){stats.skippedByRobots++;return null;}
   if(used>=maxRequests)return null;
   try{
    const r=await raw(url,accept);
    state.lastStatus=r.status;
    if([401,403,429].includes(r.status)){stats.denied++;state.deniedUntil=deniedUntil(r.status===429?1:7);return {status:r.status,url:r.url,text:''};}
    const text=r.ok?await r.text():'';
    if(r.ok&&/cf-chl|challenge-platform|captcha|Just a moment\.\.\./i.test(text.slice(0,4000))&&!/<script[^>]+ld\+json/i.test(text)){
     stats.denied++;state.deniedUntil=deniedUntil(7);return {status:403,url:r.url,text:''};
    }
    return {status:r.status,url:r.url||url,text};
   }catch(e){stats.errors++;return null;}
  }
 };
}

const NAMED={eacute:'é',egrave:'è',ecirc:'ê',euml:'ë',aacute:'á',agrave:'à',auml:'ä',iacute:'í',iuml:'ï',oacute:'ó',ouml:'ö',uacute:'ú',uuml:'ü',ccedil:'ç',ntilde:'ñ',oslash:'ø',aring:'å',szlig:'ß',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…'};
const decode=s=>String(s??'').replace(/&([a-z]+);/gi,(m,n)=>NAMED[n.toLowerCase()]??m).replace(/&#x([\da-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
 .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d))).replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'")
 .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
export const cleanText=s=>decode(String(s??'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const absolute=(value,base)=>{try{const u=new URL(decode(String(value||'').trim()),base);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const imageOf=v=>Array.isArray(v)?imageOf(v[0]):v&&typeof v==='object'?(v.url||v.contentUrl||v['@id']||''):String(v||'');
const nameOf=v=>v&&typeof v==='object'?String(v.name||''):String(v||'');

/** Calendar date (YYYY-MM-DD) of an ISO-like start in Europe/Amsterdam. */
export function localDate(value,timeZone='Europe/Amsterdam'){
 const s=String(value||'').trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 const m=s.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
 if(!m)return '';
 if(!m[2])return m[1]; // floating local time: the date is already local
 const d=new Date(s);if(Number.isNaN(d.getTime()))return '';
 return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}

/** All Schema.org *Event objects in a page, normalised. */
export function jsonLdEvents(html,base){
 const out=[];
 for(const m of String(html||'').matchAll(/<script\b[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)){
  let root;try{root=JSON.parse(m[1].trim().replace(/^<!--|-->$/g,''));}catch{continue;}
  const seen=new Set();
  const walk=x=>{
   if(Array.isArray(x)){x.forEach(walk);return;}
   if(!x||typeof x!=='object'||seen.has(x))return;seen.add(x);
   const types=[].concat(x['@type']||[]).map(String);
   if(types.some(t=>/(?:^|:)(?:Music)?Event$|Concert$|Festival$/.test(t))){
    const location=[].concat(x.location||[])[0];
    const performers=[].concat(x.performer||x.performers||[]).map(nameOf).map(cleanText).filter(Boolean);
    out.push({
     type:types.join(','),title:cleanText(x.name),performers,
     startDate:String(x.startDate||''),date:localDate(x.startDate),
     url:absolute(x.url||x['@id'],base),image:absolute(imageOf(x.image),base),
     venueName:cleanText(nameOf(location)),
     city:cleanText(location?.address?.addressLocality||''),
     status:String(x.eventStatus||'').split('/').pop()
    });
   }
   for(const v of Object.values(x))if(v&&typeof v==='object')walk(v);
  };
  walk(root);
 }
 return out;
}
export function metaContent(html,names){
 for(const tag of String(html||'').matchAll(/<meta\b[^>]*>/gi)){
  const a=Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(x=>[x[1].toLowerCase(),x[2]??x[3]]));
  if(names.includes(String(a.property||a.name||'').toLowerCase())&&a.content)return decode(a.content);
 }
 return '';
}
export const canonicalUrl=(html,base)=>absolute((String(html||'').match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||String(html||'').match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)||[])[1]||metaContent(html,['og:url']),base);
export function openGraphImage(html,base){
 const url=absolute(metaContent(html,['og:image:secure_url','og:image','og:image:url','twitter:image','twitter:image:src']),base);
 return url&&!/(?:logo|favicon|default|placeholder|fallback|share-?image|og-?default)[^/]*$/i.test(new URL(url).pathname)?url:'';
}
export function sitemapEntries(xml){
 return [...String(xml||'').matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/gi)].map(m=>({
  loc:decode((m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)||[])[1]||''),
  lastmod:((m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)||[])[1]||'')
 })).filter(x=>x.loc);
}
/** Minimal RFC 5545 VEVENT reader (unfolded lines; SUMMARY/DTSTART/URL). */
export function icalEvents(ics){
 const text=String(ics||'').replace(/\r?\n[ \t]/g,'');
 return [...text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(m=>{
  const get=k=>{const x=m[1].match(new RegExp('^'+k+'(?:;[^:]*)?:(.*)$','m'));return x?x[1].trim():'';};
  const start=get('DTSTART');const d=start.match(/^(\d{4})(\d{2})(\d{2})/);
  return {title:get('SUMMARY').replace(/\\([,;\\])/g,'$1').replace(/\\n/gi,' '),date:d?`${d[1]}-${d[2]}-${d[3]}`:'',url:get('URL'),uid:get('UID')};
 }).filter(e=>e.title&&e.date);
}
