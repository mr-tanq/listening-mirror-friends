/**
 * Fill the public artist-image cache with high-resolution Deezer artist
 * portraits. Runs only in the scheduled Node job, never in visitors' browsers.
 *
 * Identity rules (precision over recall):
 *  - the artist name must match EXACTLY after normalisation;
 *  - exactly one Deezer artist id may carry that name, otherwise the name is
 *    recorded as ambiguous (with the candidate ids) for the MusicBrainz stage;
 *  - a portrait that is byte-identical to one of the artist's album covers
 *    (same Deezer md5) is rejected: we want band photos, not cover art.
 *
 * Only URLs are stored: images are hot-linked from Deezer's CDN, never copied.
 */
import {artistKey,verifiedArtistPhoto,headlinerNames,artistImageFor} from '../js/artist-images.js';
import {createRateLimiter,isoDays} from './rate-limit.mjs';

const GENERIC=/^(?:unknown|festival|various artists|special guests?|live music|concert|sold out|uitverkocht|tba|tbc|tbd|dj|djs|line ?up|open mic|jam session|karaoke|silent disco|quiz)$/i;
export const goodName=name=>{
 const key=artistKey(name);
 return key.length>=2&&key.length<=75&&key.split(' ').length<=9&&!GENERIC.test(key)&&
  !/(?:festival|\bfest\b|w\/|\swith\s|\sversus\s|\svs\s|\slive\sat\s|\bnight\b|\bnacht\b)/i.test(key);
};
const md5Of=url=>(String(url||'').match(/\/images\/(?:artist|cover)\/([a-f0-9]{16,64})\//i)||[])[1]?.toLowerCase()||'';

/**
 * Upcoming NL/BE/GR events without a poster or cached photo, expanded into
 * headliner names. Sorted so names with the most concerts go first.
 */
export function selectArtistCandidates(events,artistCache,{today=new Date().toISOString().slice(0,10)}={}){
 const all=new Map();
 for(const event of events||[]){
  if(!['NL','BE','GR'].includes(event?.country)||!event.date||event.date<today||event.image)continue;
  if(artistImageFor(event,artistCache))continue;
  const variants=headlinerNames(event).filter(goodName);
  // Prefer an already-derived, clean headliner over a composite event title
  // ("Artist - tour", "Artist: album"). Keep full names as fallbacks.
  // A short generic fragment such as "Fun" is not trustworthy enough.
  const hasSubtitle=/(?:\s[-–—|]\s|:\s)/.test(String(event.artist||''));
  const originalKey=artistKey((event.artists||[])[0]||event.artist);
  const derived=hasSubtitle?variants.find(name=>{
   const key=artistKey(name);
   return key!==originalKey&&key.length>=4&&!/^(?:live|band|fun|music|night|show|concert|tour)$/.test(key);
  }):null;
  variants.forEach((name,rank)=>{
   const key=artistKey(name);
   const priority=derived?(name===derived?0:rank+1):rank;
   const row=all.get(key)||{name,key,count:0,rank:priority,nextDate:event.date,country:event.country,genre:event.genre||''};
   row.count++;row.rank=Math.min(row.rank,priority);
   if(event.date<row.nextDate)row.nextDate=event.date;
   all.set(key,row);
  });
 }
 // Fill the shows people can attend soon before spending the daily API budget
 // on shows months away. Do not loosen exact-name/album-art verification.
 const urgentUntil=new Date(today+'T12:00:00Z');
 urgentUntil.setUTCDate(urgentUntil.getUTCDate()+14);
 const cutoff=urgentUntil.toISOString().slice(0,10);
 return [...all.values()].sort((a,b)=>
  Number(b.nextDate<=cutoff)-Number(a.nextDate<=cutoff) ||
  a.rank-b.rank || b.count-a.count ||
  a.nextDate.localeCompare(b.nextDate) || a.key.localeCompare(b.key));
}

/** Pick one unambiguous exact-name artist from a Deezer /search/artist payload. */
export function artistFromDeezerSearch(payload,name){
 return deezerSearchVerdict(payload,name).artist;
}
export function deezerSearchVerdict(payload,name){
 if(!payload||payload.error||!Array.isArray(payload.data))return {artist:null,reason:'invalid'};
 const key=artistKey(name);
 const exact=payload.data.filter(item=>artistKey(item?.name)===key&&Number.isSafeInteger(item?.id)&&item.id>0);
 const withPhoto=exact.filter(item=>verifiedArtistPhoto(item.picture_xl||item.picture_big||''));
 const ids=[...new Set(exact.map(x=>x.id))];
 if(!withPhoto.length)return {artist:null,reason:exact.length?'no-photo':'not-found',candidates:ids};
 if(ids.length!==1)return {artist:null,reason:'ambiguous-same-name',candidates:ids};
 const found=withPhoto[0];
 return {artist:deezerEntry(found,name,'exact-unique-name')};
}
export function deezerEntry(found,name,matchedBy){
 const image=verifiedArtistPhoto(found.picture_xl||found.picture_big||'');
 if(!image)return null;
 return {name,source:'deezer',kind:'artist-photo',image,deezerId:found.id,matchedBy,
  sourceUrl:'https://www.deezer.com/artist/'+found.id,
  credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/'+found.id}};
}
/** True when the "portrait" is literally one of the artist's album covers. */
export function isAlbumCoverPortrait(image,albumsPayload){
 const md5=md5Of(image);
 if(!md5||!Array.isArray(albumsPayload?.data))return false;
 return albumsPayload.data.some(album=>String(album?.md5_image||md5Of(album?.cover_xl)||'').toLowerCase()===md5);
}

export function createDeezerClient({fetcher=fetch,clock=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms)),
 limiter=createRateLimiter({max:40,perMs:5000,clock,delay})}={}){
 let requests=0;
 async function get(path){
  for(let attempt=0;attempt<2;attempt++){
   await limiter.wait();requests++;
   const response=await fetcher('https://api.deezer.com'+path,{headers:{Accept:'application/json','User-Agent':'ListeningMirrorFriends/1.1 (+https://github.com/mr-tanq/listening-mirror-friends)'},
    signal:AbortSignal.timeout(6500)});
   if(response.status===429){await delay(5500);continue;}
   if(!response.ok)throw new Error('HTTP '+response.status);
   const data=await response.json();
   // Deezer reports quota (4) and busy (700) inside a 200 response.
   if([4,700].includes(data?.error?.code)){await delay(5500);continue;}
   if(data?.error?.code===800)return {data:[],notFound:true};
   if(data?.error)throw new Error('Provider error '+(data.error.code||''));
   return data;
  }
  const quota=new Error('Deezer quota exceeded');quota.code='RATE_LIMIT';throw quota;
 }
 return {get,get requests(){return requests;}};
}

export async function enrichDeezerArtistImages(events,cache,{
 today=new Date().toISOString().slice(0,10),fetcher=fetch,maxRequests=450,maxDurationMs=240000,
 clock=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms)),checkAlbumCovers=true,client
}={}){
 const result={version:1,...cache,artists:{...(cache?.artists||{})},attempted:{...(cache?.attempted||{})}};
 const candidates=selectArtistCandidates(events,result,{today});
 const deezer=client||createDeezerClient({fetcher,clock,delay});
 const start=clock();let found=0,notFound=0,ambiguous=0,coverRejected=0,errors=0,skipped=0,consecutiveFailures=0;
 const resolvedKeys=new Set();
 for(const item of candidates){
  if(deezer.requests>=maxRequests||clock()-start>=maxDurationMs||consecutiveFailures>=3)break;
  if(result.artists[item.key]?.image||result.attempted[item.key]?.retryAfter>today){skipped++;continue;}
  try{
   const data=await deezer.get('/search/artist?q='+encodeURIComponent(item.name)+'&limit=25');
   const verdict=deezerSearchVerdict(data,item.name);
   let picked=verdict.artist;
   if(picked&&checkAlbumCovers&&deezer.requests<maxRequests){
    const albums=await deezer.get('/artist/'+picked.deezerId+'/albums?limit=100').catch(()=>null);
    if(isAlbumCoverPortrait(picked.image,albums)){picked=null;verdict.reason='album-cover-as-portrait';coverRejected++;}
   }
   if(picked){
    result.artists[item.key]={...picked,checkedAt:new Date(clock()).toISOString()};
    delete result.attempted[item.key];found++;resolvedKeys.add(item.key);
   }else{
    if(verdict.reason==='ambiguous-same-name')ambiguous++;else notFound++;
    result.attempted[item.key]={retryAfter:isoDays(today,verdict.reason==='ambiguous-same-name'?60:30),
     reason:verdict.reason,...(verdict.candidates?.length?{deezerCandidates:verdict.candidates.slice(0,10)}:{})};
   }
   consecutiveFailures=0;
  }catch(error){
   errors++;consecutiveFailures++;
   result.attempted[item.key]={retryAfter:isoDays(today,2),reason:String(error?.message||error).slice(0,75)};
   if(error?.code==='RATE_LIMIT')break;
  }
 }
 // Drop attempts for artists no longer in the rolling catalogue.
 const active=new Set(candidates.map(c=>c.key));
 for(const key of Object.keys(result.attempted))if(!active.has(key))delete result.attempted[key];
 return {cache:result,stats:{candidates:candidates.length,requests:deezer.requests,found,notFound,ambiguous,coverRejected,
  errors,skipped,photos:Object.keys(result.artists).length}};
}
