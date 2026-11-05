/**
 * Fill the public artist-image cache with high-resolution artist portraits.
 * Runs exclusively in the scheduled Node job (never in visitors' browsers).
 * Uses Deezer's public artist search, as in the original Listening Mirror.
 * Matches the FULL artist name exactly; skips ambiguous results.
 */
import {artistKey,verifiedArtistPhoto} from '../js/artist-images.js';

const isoDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const goodName=name=>{
 const key=artistKey(name);
 return key.length>=4&&key.length<=75&&key.split(' ').length<=9&&
 !/^(?:unknown|festival|various artists|special guests?|live music|concert|sold out|tba)$/i.test(key)&&
 !/(?:festival|fest|w\/|\swith\s|\sversus\s|\svs\s|\slive\sat\s)/i.test(key);
};
export function selectArtistCandidates(events,artistCache,{today=new Date().toISOString().slice(0,10)}={}){
 const all=new Map();
 for(const event of events||[]){
  if(!['NL','BE'].includes(event.country)||event.date<today)continue;
  const name=String(event.artist||'').trim(),key=artistKey(name);
  if(!goodName(name)||artistCache?.artists?.[key]?.image)continue;
  const row=all.get(key)||{name,key,count:0,nextDate:event.date};
  row.count++;
  if(event.date<row.nextDate)row.nextDate=event.date;
  all.set(key,row);
 }
 return [...all.values()].sort((a,b)=>b.count-a.count||a.nextDate.localeCompare(b.nextDate)||a.key.localeCompare(b.key));
}
export function artistFromDeezerSearch(payload,name){
 if(!payload||payload.error||!Array.isArray(payload.data))return null;
 const key=artistKey(name);
 const matches=payload.data.filter(item=>artistKey(item?.name)===key&&
   Number.isSafeInteger(item?.id)&&item.id>0&&verifiedArtistPhoto(item.picture_xl||item.picture_big||''));
 const ids=new Set(matches.map(x=>x.id));
 if(ids.size!==1)return null; // Avoid choosing the wrong same-named band
 const found=matches[0];
 return {name,source:'deezer',kind:'artist-photo',image:verifiedArtistPhoto(found.picture_xl||found.picture_big),
  deezerId:found.id,sourceUrl:'https://www.deezer.com/artist/'+found.id};
}
export async function enrichDeezerArtistImages(events,cache,{
 today=new Date().toISOString().slice(0,10),fetcher=fetch,maxRequests=80,maxDurationMs=110000,
 clock=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms))
}={}){
 const result={version:1,...cache,artists:{...(cache?.artists||{})},attempted:{...(cache?.attempted||{})}};
 const candidates=selectArtistCandidates(events,result,{today});
 const start=clock();let requests=0,found=0,notFound=0,errors=0,skipped=0,consecutiveFailures=0;
 for(const item of candidates){
  if(requests>=maxRequests||clock()-start>=maxDurationMs||consecutiveFailures>=3)break;
  if(result.attempted[item.key]?.retryAfter>today){skipped++;continue;}
  requests++;
  try{
   const url='https://api.deezer.com/search/artist?q='+encodeURIComponent(item.name)+'&limit=15';
   const response=await fetcher(url,{headers:{Accept:'application/json', 'User-Agent':'ListeningMirrorFriends/1.0'},
     signal:AbortSignal.timeout(6500)});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const data=await response.json();
   if(data?.error)throw new Error('Provider error');
   const picked=artistFromDeezerSearch(data,item.name);
   if(picked){
    result.artists[item.key]={...picked,checkedAt:new Date().toISOString()};
    delete result.attempted[item.key];found++;
   }else{
    result.attempted[item.key]={retryAfter:isoDays(today,30),reason:'No unambiguous exact artist'};
    notFound++;
   }
   consecutiveFailures=0;
  }catch(error){
   errors++;consecutiveFailures++;
   result.attempted[item.key]={retryAfter:isoDays(today,2),reason:String(error?.message||error).slice(0,75)};
  }
  if(requests<maxRequests)await delay(180);
 }
 // Drop attempts for artists no longer in the rolling catalog.
 const active=new Set(candidates.map(c=>c.key));
 for(const key of Object.keys(result.attempted))if(!active.has(key))delete result.attempted[key];
 return {cache:result,stats:{candidates:candidates.length,requests,found,notFound,errors,skipped,photos:Object.keys(result.artists).length}};
}
