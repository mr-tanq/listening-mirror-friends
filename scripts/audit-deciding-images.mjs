/**
 * Read-only image coverage audit for the Friends catalogue.
 * No network calls; URL availability does not prove the image can be loaded.
 *
 * node scripts/audit-deciding-images.mjs
 */
import {readFile} from 'node:fs/promises';
import {resolveConcertImage,headlinerNames,artistKey} from '../js/artist-images.js';

export function summarizeImageCoverage(events,images,{sampleSize=15}={}){
 const result={total:0,eventArtwork:0,artistPhoto:0,missing:0,byCountry:{},bySource:{},missingReasons:{},missingSamples:[]};
 const counts=new Map();
 const attempted=images?.attempted||{};
 for(const event of events||[]){
  const kind=resolveConcertImage(event,images).kind;
  const bucket=kind==='fallback'?'missing':kind==='artist-photo'?'artistPhoto':'eventArtwork';
  result.total++;result[bucket]++;
  const country=String(event.country||'??'),source=String(event.source||'unknown');
  for(const [obj,key] of [[result.byCountry,country],[result.bySource,source]]){
   obj[key]||={total:0,eventArtwork:0,artistPhoto:0,missing:0};
   obj[key].total++;obj[key][bucket]++;
  }
  if(bucket!=='missing')continue;
  const heads=headlinerNames(event);
  const reason=heads.map(x=>attempted[artistKey(x)]?.reason).find(Boolean)||'not-attempted-or-no-match';
  result.missingReasons[reason]=(result.missingReasons[reason]||0)+1;
  const key=artistKey(event.artist);
  if(key){
   const old=counts.get(key)||{artist:event.artist,count:0,reason};
   old.count++;counts.set(key,old);
  }
 }
 result.missingSamples=[...counts.values()].sort((a,b)=>b.count-a.count||a.artist.localeCompare(b.artist)).slice(0,sampleSize);
 return result;
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const root=new URL('../',import.meta.url);
 const feed=JSON.parse(await readFile(new URL('data/events.json',root),'utf8'));
 const images=JSON.parse(await readFile(new URL('data/artist-images.json',root),'utf8'));
 const report=summarizeImageCoverage(feed.events,images);
 console.log('IMAGE_COVERAGE '+JSON.stringify(report));
}
