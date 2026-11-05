/**
 * Venue-first pipeline.
 *
 *  A. Image enrichment: find the official page of a catalogue concert and
 *     its official artwork.
 *  B. Independent discovery: add concerts from venue calendars, so the
 *     catalogue does not depend on Podiuminfo alone.
 *
 * Per venue: list event URLs from the venue's own agenda/sitemap, fetch
 * event pages politely (pages likely to match catalogue concerts first),
 * cache parsed pages, then match with scoreMatch().
 *
 * Publication rules (data/nl-venue-sources.json):
 *  - imageUse:'permitted' is required before an official image is shown.
 *    Otherwise it is stored as a candidate only.
 *  - discovery:true is required before a venue's events are added.
 *  - an existing event image is never replaced.
 */
import {createVenueClient,sitemapEntries} from './core.mjs';
import {parseEventPage,eventLinksFromHtml} from './parse.mjs';
import {bestOfficialMatch,scoreMatch,venueMatches,slugOf,officialHeadliners} from './match.mjs';
import {headlinerNames,artistKey} from '../../js/artist-images.js';

const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const NON_MUSIC=/\b(?:rondleiding|lezing|workshop|markt|pubquiz|quiz|comedy|cabaret|stand-?up|theater|film(?:avond)?|talk|expositie|tentoonstelling|yoga|kindermiddag|vergadering|bedrijfsfeest|besloten|private event|cursus|open dag)\b/i;
const PAGE_TTL_DAYS=7,MISS_TTL_DAYS=14;

export async function listEventUrls(adapter,client,{today}){
 const found=new Map();
 for(const listing of adapter.listings||[]){
  if(listing.type==='html-links'){
   const page=await client.get(listing.url);
   if(page?.status===200)for(const url of eventLinksFromHtml(page.text,page.url,adapter))found.set(url,{url,via:'agenda'});
  }else if(listing.type==='sitemap'){
   const index=await client.get(listing.url,{accept:'application/xml,text/xml;q=0.9,*/*;q=0.5'});
   if(index?.status!==200)continue;
   let children=sitemapEntries(index.text).map(x=>x.loc).filter(u=>listing.children.test(u));
   children=listing.pick==='last'?children.slice(-listing.max):children.slice(0,listing.max);
   for(const child of children){
    const map=await client.get(child,{accept:'application/xml,text/xml;q=0.9,*/*;q=0.5'});
    if(map?.status!==200)continue;
    const cutoff=listing.recentDays?addDays(today,-listing.recentDays):'';
    for(const {loc,lastmod} of sitemapEntries(map.text)){
     const url=loc.replace(/\/en\/event\//,'/event/');
     if(!adapter.eventUrl.test(url))continue;
     if(cutoff&&lastmod&&lastmod.slice(0,10)<cutoff)continue;
     if(!found.has(url))found.set(url,{url,lastmod,via:'sitemap'});
    }
   }
  }
 }
 const rows=[...found.values()];
 for(const row of rows)if(adapter.slugDate)row.slugDate=adapter.slugDate(row.url);
 return rows.filter(r=>!r.slugDate||r.slugDate>=today);
}

/** Order page fetches: likely catalogue matches, then stale, then new. */
export function prioritise(rows,pages,{adapter,catalogue,today}){
 const wanted=catalogue.filter(e=>venueMatches(adapter,e.venue)&&e.date>=today);
 const slugs=new Map();
 for(const e of wanted)for(const n of headlinerNames(e)){const s=slugOf(n);if(s.length>=2)slugs.set(s,e);}
 const lastSegment=url=>{const parts=new URL(url).pathname.split('/').filter(Boolean);return parts.find(p=>!/^\d+$/.test(p)&&!['programma','event','events','agenda'].includes(p))||'';};
 const score=row=>{
  const cached=pages[row.url];
  if(cached&&cached.checkedAt>addDays(today,-(cached.event?PAGE_TTL_DAYS:MISS_TTL_DAYS)))return -1; // fresh: skip
  const seg=lastSegment(row.url);
  const likely=[...slugs.keys()].some(s=>seg===s||seg.startsWith(s+'-'));
  const dateOk=!row.slugDate||wanted.some(e=>e.date===row.slugDate);
  return (likely&&dateOk?100:0)+(cached?0:20)+(row.via==='agenda'?5:0);
 };
 return rows.map(r=>({...r,priority:score(r)})).filter(r=>r.priority>=0).sort((a,b)=>b.priority-a.priority||String(b.lastmod||'').localeCompare(String(a.lastmod||'')));
}

/** Refresh one venue's cache. Never throws; returns stats. */
export async function refreshVenue(adapter,cacheEntry,{catalogue,today,fetcher=fetch,maxDurationMs=180000,clock=()=>Date.now(),delay}={}){
 const entry={access:{},pages:{},...cacheEntry};entry.access={...entry.access};entry.pages={...entry.pages};
 const stats={listed:0,fetched:0,parsed:0,unparsed:0,access:'ok'};
 if(adapter.blockedBySite||adapter.research){stats.access=adapter.blockedBySite?'blocked-by-site':'research';return {entry,stats};}
 const client=createVenueClient(adapter.origin,{fetcher,state:entry.access,today,clock,delay,
  minSpacingMs:adapter.minSpacingMs||2500,maxRequests:(adapter.maxPages||40)+6});
 const start=clock();
 if(client.blocked){stats.access='denied-until-'+entry.access.deniedUntil;return {entry,stats};}
 const rows=await listEventUrls(adapter,client,{today});
 stats.listed=rows.length;
 if(client.blocked){stats.access='denied:'+entry.access.lastStatus;return {entry,stats,client:client.stats};}
 if(rows.length)entry.listedAt=today;
 // Pages that left the listing are re-checked (when stale), never assumed
 // gone: listings are partial.
 const listedUrls=new Set(rows.map(r=>r.url));
 const recheck=Object.entries(entry.pages).filter(([url,p])=>p.event&&p.event.date>=today&&!listedUrls.has(url)).map(([url])=>({url,via:'recheck'}));
 for(const row of prioritise([...rows,...recheck],entry.pages,{adapter,catalogue,today})){
  if(stats.fetched>=(adapter.maxPages||40)||clock()-start>=maxDurationMs||client.blocked)break;
  const page=await client.get(row.url);
  if(!page)break; // budget, robots or denial: stop for this venue
  if(page.status===0){ // transient network error: skip this page, stop after 3 in a row
   stats.errors=(stats.errors||0)+1;
   if((stats.consecutiveErrors=(stats.consecutiveErrors||0)+1)>=3)break;
   continue;
  }
  stats.consecutiveErrors=0;
  stats.fetched++;
  if(page.status===404||page.status===410){
   const prev=entry.pages[row.url];
   if(prev?.event){ // keep the event; removal needs a second check on another day
    entry.pages[row.url]={...prev,checkedAt:today,goneChecks:(prev.goneCheckedOn===today?prev.goneChecks:(prev.goneChecks||0)+1)||1,goneCheckedOn:today};
   }else delete entry.pages[row.url];
   continue;
  }
  if(page.status!==200)continue;
  const event=parseEventPage(page.text,page.url,adapter);
  if(event){stats.parsed++;entry.pages[row.url]={checkedAt:today,event};}
  else{stats.unparsed++;entry.pages[row.url]={checkedAt:today,event:null};
   if((stats.unparsedHints||=[]).length<3)stats.unparsedHints.push(pageHint(page.text,row.url));}
 }
 // Forget past events, and unparseable pages that left the listing. Pages
 // with upcoming events are kept until confirmed gone or past.
 for(const [url,p] of Object.entries(entry.pages)){
  if(p.event?.date&&p.event.date<today)delete entry.pages[url];
  else if(!p.event&&!listedUrls.has(url))delete entry.pages[url];
 }
 if(client.blocked)stats.access='denied:'+entry.access.lastStatus;
 return {entry,stats,client:client.stats};
}

/** Diagnostics for pages we could not date: what does the page offer? */
export function pageHint(html,url){
 const text=String(html||'');
 const title=(text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)||[])[1]||'';
 const nlDates=[...new Set([...text.replace(/<[^>]+>/g,' ').matchAll(/\b(?:(?:ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\.?\s+)?\d{1,2}\s+(?:jan|feb|mrt|maart|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\.?(?:\s+\d{4})?/gi)].map(m=>m[0].trim()))].slice(0,6);
 const isoDates=[...new Set([...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2})?/g)].map(m=>m[0]))].slice(0,6);
 const attrs=[...new Set([...text.matchAll(/(?:data-[\w-]*date[\w-]*|itemprop=["']startDate["'][^>]*content)=["']([^"']{6,30})["']/gi)].map(m=>m[0].slice(0,60)))].slice(0,4);
 return {url,title,nlDates,isoDates,attrs,ldTypes:[...new Set([...text.matchAll(/"@type"\s*:\s*"(\w+)"/g)].map(m=>m[1]))].slice(0,8)};
}
export const officialEventsOf=(entry,today)=>Object.values(entry?.pages||{}).filter(p=>(p.goneChecks||0)<2).map(p=>p.event).filter(e=>e&&e.date>=today);

/** A. Attach official pages and (when permitted) official images. */
export function enrichCatalogue(events,adapters,cache,policy,{today}){
 const stats={};const candidates=[];
 const out=events.map(event=>{
  if(event.country!=='NL'||event.date<today)return event;
  const adapter=adapters.find(a=>venueMatches(a,event.venue));
  if(!adapter)return event;
  const s=stats[adapter.id]||={catalogue:0,matched:0,imagesPublished:0,imagesPending:0,ambiguous:0};
  s.catalogue++;
  const {match,confidence,reason}=bestOfficialMatch(event,officialEventsOf(cache.venues?.[adapter.id],today),adapter);
  if(!match){if(reason==='ambiguous')s.ambiguous++;return event;}
  s.matched++;
  const next={...event,officialUrl:match.url,officialMatch:{venue:adapter.id,confidence,via:match.via}};
  if(match.image&&policy?.venues?.[adapter.id]?.imageUse!=='denied'){
   const permitted=policy?.venues?.[adapter.id]?.imageUse==='permitted';
   candidates.push({eventId:event.id,venue:adapter.id,eventUrl:match.url,image:match.image,confidence,published:permitted&&!event.image});
   if(permitted&&!event.image){
    next.image=match.image;next.imageKind='event-poster';next.imageSource='venue-official';
    next.imageCredit={text:'Image: '+adapter.name,url:match.url};s.imagesPublished++;
   }else if(!event.image)s.imagesPending++;
  }
  return next;
 });
 return {events:out,stats,candidates};
}

const canonicalUrlKey=u=>{try{const x=new URL(u);return x.host+x.pathname.replace(/\/en\//,'/').replace(/\/$/,'');}catch{return '';}};
/**
 * Is a catalogue concert the same show as an official venue event?
 *  'same'      verified: identical official URL, or strict identity
 *              (same date, on-site venue, exact headliner; see scoreMatch)
 *  'possible'  same night and venue, and one full headliner name extends the
 *              other at a word boundary ("De Jukebox" / "De Jukebox #17")
 *  'different' anything else. Sharing a single word ("Black Midi" /
 *              "Black Country, New Road") is NOT evidence of the same show.
 */
export function showIdentity(event,official,adapter){
 if(!event||!official||event.date!==official.date||!venueMatches(adapter,event.venue))return 'different';
 const key=canonicalUrlKey(official.url);
 if(key&&[event.officialUrl,event.source==='venue-official'?event.url:''].some(u=>u&&canonicalUrlKey(u)===key))return 'same';
 if(scoreMatch(event,official,adapter).verdict==='match')return 'same';
 const ours=[...new Set(headlinerNames(event).map(artistKey))].filter(k=>k.length>=4);
 const theirs=officialHeadliners(official).filter(k=>k.length>=4);
 const extends_=(a,b)=>a.startsWith(b+' ');
 return ours.some(a=>theirs.some(b=>extends_(a,b)||extends_(b,a)))?'possible':'different';
}

/**
 * Keep previously discovered venue concerts correct over time. A venue
 * concert is removed ONLY on positive evidence:
 *  - another catalogue record is verifiably the same show ('same');
 *  - discovery is switched off for that venue (policy);
 *  - its own official page now says cancelled, or shows another date;
 *  - its own official page answered 404/410 on two checks on different days.
 * Absence from an agenda or sitemap is never evidence: listings are often
 * partial (homepages, paginated agendas, newest sitemap pages only).
 * 'possible' duplicates are kept, never deleted.
 */
export function reconcileVenueEvents(events,adapters,cache,policy,{today}={}){
 const removed={duplicate:0,policy:0,cancelled:0,rescheduled:0,gone:0};
 const others=events.filter(e=>e.source!=='venue-official');
 const kept=events.filter(e=>{
  if(e.source!=='venue-official')return true;
  const adapter=adapters.find(a=>e.id.startsWith('venue-'+a.id+'-'));
  if(!adapter)return true;
  if(policy?.venues?.[adapter.id]?.discovery!==true){removed.policy++;return false;}
  const asOfficial={url:e.url,title:e.artist,performers:e.artists||[],date:e.date,venueName:''};
  if(others.some(o=>showIdentity(o,asOfficial,adapter)==='same')){removed.duplicate++;return false;}
  const key=canonicalUrlKey(e.url);
  const page=Object.entries(cache.venues?.[adapter.id]?.pages||{}).find(([url,p])=>canonicalUrlKey(p.event?.url||url)===key)?.[1];
  if(page?.event?.cancelled){removed.cancelled++;return false;}
  if(page?.event?.date&&page.event.date!==e.date){removed.rescheduled++;return false;}
  if((page?.goneChecks||0)>=2){removed.gone++;return false;}
  return true;
 });
 return {events:kept,removed};
}

/** B. Add official concerts that the catalogue does not have yet. */
export function discoverFromVenues(events,adapters,cache,policy,{today,endDate}){
 const added=[];const stats={};
 const all=[...events];
 for(const adapter of adapters){
  if(policy?.venues?.[adapter.id]?.discovery!==true)continue;
  const s=stats[adapter.id]={official:0,added:0,known:0,skipped:0};
  for(const o of officialEventsOf(cache.venues?.[adapter.id],today)){
   if(o.date>endDate)continue;
   s.official++;
   const offSite=o.venueName&&!adapter.onSite.test(o.venueName);
   const skip=o.cancelled?'cancelled':offSite?'off-site:'+o.venueName:NON_MUSIC.test(o.title)?'non-music':'';
   if(skip){s.skipped++;(s.skipReasons||={})[skip]=(s.skipReasons[skip]||0)+1;continue;}
   const names=officialHeadliners(o);
   const derived=headlinerNames({artist:o.title});
   const headliner=o.performers?.[0]||derived[derived.length-1]||o.title;
   if(!names.length||!headliner){s.skipped++;continue;}
   // Strict identity only. A 'possible' duplicate is not added (and listed
   // for review); a shared word between two artists proves nothing.
   const verdicts=all.map(e=>showIdentity(e,o,adapter));
   if(verdicts.includes('same')){s.known++;continue;}
   if(verdicts.includes('possible')){s.possibleDuplicates=(s.possibleDuplicates||[]);
    if(s.possibleDuplicates.length<10)s.possibleDuplicates.push(o.title+' ('+o.date+')');s.skipped++;continue;}
   const permitted=policy?.venues?.[adapter.id]?.imageUse==='permitted';
   const event={id:'venue-'+adapter.id+'-'+o.date+'-'+slugOf(headliner).slice(0,60),artist:headliner,
    artists:[...new Set([headliner,...(o.performers||[]).slice(1)])].slice(0,15),date:o.date,venue:adapter.name,city:adapter.city,
    country:'NL',genre:'',subgenre:'',url:o.url,image:permitted&&o.image?o.image:'',
    ...(permitted&&o.image?{imageKind:'event-poster',imageSource:'venue-official',imageCredit:{text:'Image: '+adapter.name,url:o.url}}:{}),
    source:'venue-official',verification:'official-venue-page',officialUrl:o.url};
   if(all.some(e=>e.id===event.id)){s.known++;continue;}
   all.push(event);added.push(event);s.added++;
  }
 }
 return {events:all,added,stats};
}
