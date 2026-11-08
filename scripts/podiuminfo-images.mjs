/**
 * Incremental image enrichment for existing Podiuminfo NL/BE agenda entries.
 * This only checks canonical concert detail URLs and reuses the original
 * Podiuminfo parser (including its artist-image extraction and date check).
 * A concert detail often has an ARTIST PHOTO, not the event's actual poster.
 * Failures are cached so blocked runner IPs are not hammered on every run.
 */
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function validPodiumConcertUrl(input,id){
 try{
  const u=new URL(input);
  const parts=u.pathname.split('/').filter(Boolean);
  return u.protocol==='https:'&&u.hostname==='www.podiuminfo.nl'&&
    parts.length===4&&parts[0]==='concert'&&/^\d+$/.test(parts[1])&&
    (!id||String(id)==='podiuminfo-'+parts[1])?u.href:'';
 }catch{return '';}
}
export function allowedPodiumArtistPhoto(input){
 try{
  const u=new URL(input,'https://www.podiuminfo.nl');
  return u.protocol==='https:'&&['www.podiuminfo.nl','podiuminfo.nl'].includes(u.hostname)&&
    /\/img\/artist\//.test(u.pathname)&&/\.(?:jpg|jpeg|png|webp)$/i.test(u.pathname)?u.href:'';
 }catch{return '';}
}
const freshISO=()=>new Date().toISOString();
const plusDays=(today,n)=>{
 const day=new Date(today+'T12:00:00Z');
 day.setUTCDate(day.getUTCDate()+n);
 return day.toISOString().slice(0,10);
};
const HOST_DENIED='HTTP 403';

/**
 * Seed a host-level 403 circuit breaker from previously stored individual
 * denials. This prevents another 45 guaranteed-denied requests on each run.
 * A successful future probe records 'available' so stale failures cannot
 * repeatedly re-arm the breaker.
 */
function hydrateHostAccess(store,images,activeEvents,today){
 if(store.hostAccess)return;
 const recent=Object.entries(images)
  .filter(([id,x])=>activeEvents.has(id)&&x?.reason===HOST_DENIED&&x?.retryAfter>today);
 if(recent.length<3)return;
 const retryAfter=recent.map(([,v])=>v.retryAfter).sort().at(-1);
 store.hostAccess={reason:HOST_DENIED,retryAfter,seededFromEntries:recent.length};
}
export async function enrichPodiuminfoImages(events,cache,{fetcher=fetch,parseConcertPageTitle,
 today=new Date().toISOString().slice(0,10),maxRequests=45,maxDurationMs=150000,
 now=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const store=cache&&typeof cache==='object'?cache:{};
 const images=store.entries||={};
 let requests=0,found=0,cacheHits=0,skippedBlocked=0,hostDeniedRequests=0;
 const start=now();
 const additions=new Map();
 const photosByArtist=new Map();
 const activeEventById=new Map(events.map(e=>[e.id,e]));
 hydrateHostAccess(store,images,activeEventById,today);
 for(const [id,entry] of Object.entries(images)){
   const event=activeEventById.get(id);
   const photo=allowedPodiumArtistPhoto(entry?.image);
   if(event&&photo&&normalize(event.artist).length>=4)
     photosByArtist.set(normalize(event.artist),photo);
 }
 const eligible=events.filter(e=>e.source==='podiuminfo-agenda'&&
    ['NL','BE'].includes(e.country)&&e.date>=today&&!e.image&&validPodiumConcertUrl(e.url,e.id))
   .sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
 for(const item of eligible){
  const entry=images[item.id];
  const name=normalize(item.artist);
  const cached=allowedPodiumArtistPhoto(entry?.image);
  const artistPhoto=name.length>=4?photosByArtist.get(name):'';
  if(cached||artistPhoto){
   additions.set(item.id,cached||artistPhoto);cacheHits++;continue;
  }
  // Respect the entire host's confirmed HTTP 403 rather than probing up
  // to 45 different blocked pages. Existing cached photos remain usable.
  if(store.hostAccess?.reason===HOST_DENIED&&store.hostAccess.retryAfter>today){
   skippedBlocked++;continue;
  }
  // Individual page errors still have their independent week-long backoff.
  if(entry?.retryAfter&&entry.retryAfter>today){skippedBlocked++;continue;}
  if(requests>=maxRequests||now()-start>=maxDurationMs)break;
  requests++;
  try{
   const url=validPodiumConcertUrl(item.url,item.id);
   const res=await fetcher(url,{headers:{Accept:'text/html','User-Agent':'ListeningMirrorFriends/1.0 (https://github.com/mr-tanq/listening-mirror-friends)'},signal:AbortSignal.timeout(8000)});
   if(!res.ok)throw Error('HTTP '+res.status);
   // HTTP 2xx means the previously blocked host is reachable again,
   // even if this particular concert fails its separate identity checks.
   if(store.hostAccess?.reason===HOST_DENIED)
    store.hostAccess={reason:'available',checkedAt:freshISO()};
   const html=await res.text();
   if(html.length>2_000_000)throw Error('HTML too large');
   const parsed=parseConcertPageTitle?.(html,new Set([normalize(item.artist)]));
   // Do not attach photos from wrongly redirected / unrelated event pages.
   if(!parsed||parsed.date!==item.date||
      normalize(parsed.venue)!==normalize(item.venue))throw Error('Mismatch or unrecognized detail');
   const img=allowedPodiumArtistPhoto(parsed.image);
   if(!img)throw Error('No suitable artist photo');
   additions.set(item.id,img);found++;
   if(name.length>=4)photosByArtist.set(name,img);
   images[item.id]={image:img,artist:name,checkedAt:freshISO(),kind:'artist-photo'};
  }catch(error){
   const reason=String(error.message||error).slice(0,85);
   const retryAfter=plusDays(today,7);
   images[item.id]={checkedAt:freshISO(),retryAfter,reason};
   if(reason===HOST_DENIED){
    hostDeniedRequests++;
    store.hostAccess={reason:HOST_DENIED,retryAfter,checkedAt:freshISO()};
    break; // No further concert-page requests after host access denial.
   }
  }
  if(requests<maxRequests)await delay(250);
 }
 const out=events.map(e=>!e.image&&additions.has(e.id)?{...e,image:additions.get(e.id),imageKind:'artist-photo'}:e);
 // Prune stale dates/IDs and avoid an indefinitely growing repository.
 const keepIds=new Set(events.filter(e=>e.date>=today).map(e=>e.id));
 for(const id of Object.keys(images))if(!keepIds.has(id))delete images[id];
 return {events:out,cache:store,stats:{requests,found,cacheHits,skippedBlocked,
  hostDeniedRequests,hostAccess:store.hostAccess?.reason||'unknown',
  hostRetryAfter:store.hostAccess?.retryAfter||null,eligible:eligible.length,
  remainingWithoutImage:out.filter(e=>e.source==='podiuminfo-agenda'&&!e.image).length}};
}
