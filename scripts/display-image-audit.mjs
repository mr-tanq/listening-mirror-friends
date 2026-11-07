/**
 * Offline audit of what the Friends browser's image resolver can display.
 * An HTTPS URL is NOT evidence that the remote image loads in a browser.
 * No HTTP requests, visitor data, or new image rights are involved.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {headlinerNames,artistKey,resolveConcertImage,resolveConcertImageBackup} from '../js/artist-images.js';
import {applyVerifiedOfficialArtwork} from '../js/verified-official-artwork.js';

const validImage=url=>{
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password;}
 catch{return false;}
};
const increment=(row,key)=>{row[key]=(row[key]||0)+1;};
const blankCounters=()=>({total:0,eventPoster:0,artistPhoto:0,noImage:0,posterWithPhotoBackup:0});

export function buildDisplayImageAudit(feed,cache,reviewed,{today=new Date().toISOString().slice(0,10),sampleLimit=40}={}){
 const input=Array.isArray(feed?.events)?feed.events:[];
 const exact=applyVerifiedOfficialArtwork(input,reviewed||{records:[]});
 const eligible=exact.events.filter(e=>e&&typeof e.date==='string'&&e.date>=today);
 const totals=blankCounters(),byCountry={},missing=[],missingReasons={},backoffReasons={};
 for(const event of eligible){
  const country=String(event.country||'UNKNOWN').toUpperCase();
  const row=byCountry[country]||=blankCounters();
  row.total++;totals.total++;
  // Mirror normalizeEvent(): unsafe source URLs cannot be displayed.
  const displayEvent=validImage(event.image)?event:{...event,image:''};
  const chosen=resolveConcertImage(displayEvent,cache);
  const url=validImage(chosen.url)?chosen.url:'';
  if(url){
   const type=chosen.kind==='artist-photo'?'artistPhoto':'eventPoster';
   increment(row,type);increment(totals,type);
   if(type==='eventPoster'){
    const backup=resolveConcertImageBackup(displayEvent,cache);
    if(validImage(backup?.url)){increment(row,'posterWithPhotoBackup');increment(totals,'posterWithPhotoBackup');}
   }
   continue;
  }
  increment(row,'noImage');increment(totals,'noImage');
  const names=headlinerNames(event);
  let reason='not-in-artist-cache';
  if(!names.length)reason='no-headliner';
  else if(names.some(name=>cache?.attempted?.[artistKey(name)]?.retryAfter>today)){
   reason='provider-backoff';
   // Keep the high-level reason for compatibility while reporting WHY the
   // search was rejected, e.g. ambiguous identity vs. exact not-found.
   const attempt=names.map(name=>cache?.attempted?.[artistKey(name)])
    .find(a=>a?.retryAfter>today);
   increment(backoffReasons,String(attempt?.reason||'unknown').slice(0,70));
  }
  else if(names.some(name=>cache?.attempted?.[artistKey(name)]))reason='lookup-no-result-or-expired';
  else if(names.some(name=>cache?.artists?.[artistKey(name)]))reason='invalid-cached-photo';
  increment(missingReasons,reason);
  missing.push({id:String(event.id||'').slice(0,180),artist:String(event.artist||'').slice(0,150),
   date:event.date,country,venue:String(event.venue||'').slice(0,100),reason});
 }
 const nearEnd=new Date(today+'T12:00:00Z');nearEnd.setUTCDate(nearEnd.getUTCDate()+14);
 const nearCutoff=nearEnd.toISOString().slice(0,10);
 const soon=missing.filter(e=>e.date<=nearCutoff);
 return {version:1,generatedAt:new Date().toISOString(),catalogUpdatedAt:feed?.updatedAt||null,auditedFor:today,
  definition:'Counts resolved HTTPS image URLs used by cards, not successful browser image loads or image licences.',
  caveat:'Browser network errors, blocked hotlinks and expired source images may still fall back to typography.',
  reviewedOfficialArtworkApplied:exact.applied,totals,byCountry,missingReasons,backoffReasons,
  missingNext14Days:soon.length,
  missingNext14DaysSamples:soon.slice(0,sampleLimit),
  missingOtherSamples:missing.filter(e=>e.date>nearCutoff).slice(0,sampleLimit)};
}

async function main(){
 const root=new URL('../',import.meta.url);
 const read=async(path,fallback)=>{try{return JSON.parse(await readFile(new URL(path,root),'utf8'));}catch{return fallback;}};
 const feed=await read('data/events.json',{events:[]});
 if(!Array.isArray(feed.events)||feed.events.length<100)throw Error('Refusing misleading audit: missing/short event feed');
 const cache=await read('data/artist-images.json',{artists:{}});
 const reviewed=await read('data/verified-official-artwork.json',{records:[]});
 const report=buildDisplayImageAudit(feed,cache,reviewed);
 console.log('DISPLAY_IMAGE_COVERAGE '+JSON.stringify({totals:report.totals,byCountry:report.byCountry,missingNext14Days:report.missingNext14Days,reasons:report.missingReasons,backoffReasons:report.backoffReasons}));
 if(!process.argv.includes('--audit'))await writeFile(new URL('data/display-image-audit.json',root),JSON.stringify(report,null,2)+'\n');
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
