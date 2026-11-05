/**
 * Venue-first catalogue stage. Runs AFTER scripts/fetch-events.mjs and also
 * when that step failed (e.g. Podiuminfo answered HTTP 403): it starts from
 * the last published data/events.json, so venue discovery and official
 * artwork keep working without Podiuminfo.
 *
 *   node scripts/update-venue-catalog.mjs            # update data files
 *   node scripts/update-venue-catalog.mjs --audit    # read-only report
 *   VENUES=paradiso,013 node scripts/update-venue-catalog.mjs --audit
 */
import {readFile,writeFile} from 'node:fs/promises';
import {NL_VENUE_ADAPTERS} from './venue-sources/adapters.mjs';
import {refreshVenue,enrichCatalogue,discoverFromVenues,officialEventsOf} from './venue-sources/pipeline.mjs';
import {bestOfficialMatch,venueMatches,scoreMatch} from './venue-sources/match.mjs';

const root=new URL('../',import.meta.url);
const read=async(file,fallback)=>{try{return JSON.parse(await readFile(new URL(file,root),'utf8'));}catch{return fallback;}};
const write=(file,data)=>writeFile(new URL(file,root),JSON.stringify(data,null,2)+'\n');
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

export async function runVenueStage({today=new Date().toISOString().slice(0,10),audit=false,only=null,fetcher=fetch,
 feed,cache,policy,maxDurationMs=Number(process.env.VENUE_TIME_MS||200000)}={}){
 const adapters=NL_VENUE_ADAPTERS.filter(a=>!only||only.includes(a.id));
 cache={version:1,venues:{},...cache};cache.venues={...cache.venues};
 // Drop concerts that have passed, so the feed stays correct even when the
 // main catalogue job could not run.
 const catalogue=(feed.events||[]).filter(e=>e.date>=today);
 const refresh=await Promise.all(adapters.map(async a=>{
  const r=await refreshVenue(a,cache.venues[a.id],{catalogue,today,fetcher,maxDurationMs});
  cache.venues[a.id]=r.entry;
  return [a.id,r.stats];
 }));
 const enriched=enrichCatalogue(catalogue,adapters,cache,policy,{today});
 const discovered=discoverFromVenues(enriched.events,adapters,cache,policy,{today,endDate:addDays(today,150)});
 const events=discovered.events.sort((a,b)=>a.date.localeCompare(b.date)||String(a.artist).localeCompare(String(b.artist)));
 const report={generatedAt:new Date().toISOString(),today,mode:audit?'audit':'update',venues:{}};
 for(const [id,stats] of refresh){
  const adapter=adapters.find(a=>a.id===id);
  const unmatched=catalogue.filter(e=>e.country==='NL'&&venueMatches(adapter,e.venue)&&!enriched.events.find(x=>x.id===e.id)?.officialUrl);
  const officials=officialEventsOf(cache.venues[id],today);
  report.venues[id]={...stats,officialUpcoming:officials.length,policy:policy?.venues?.[id]||null,
   enrichment:enriched.stats[id]||{catalogue:0},discovery:discovered.stats[id]||null,
   unmatchedReasons:unmatched.reduce((acc,e)=>{
    const sameDay=officials.filter(o=>o.date===e.date);
    const reasons=sameDay.map(o=>scoreMatch(e,o,adapter).reasons.at(-1));
    const pick=['cancelled','catalogue-headliner-is-support'].find(r=>reasons.includes(r))||reasons.find(r=>/^off-site/.test(r));
    const why=!officials.length?'no-official-data':!sameDay.length?'no-official-event-that-day':
     bestOfficialMatch(e,officials,adapter).reason==='ambiguous'?'ambiguous':pick?pick.replace(/:.*/,''):'headliner-differs';
    acc[why]=(acc[why]||0)+1;return acc;},{}),
   sampleMatches:enriched.candidates.filter(c=>c.venue===id).slice(0,3),
   sampleOfficial:officials.slice(0,4).map(o=>({title:o.title,performers:o.performers.slice(0,3),venueName:o.venueName,date:o.date,via:o.via,cancelled:o.cancelled||undefined})),
   sampleUnmatched:unmatched.slice(0,5).map(e=>({artist:e.artist,date:e.date,
    sameDayOfficial:officials.filter(o=>o.date===e.date).slice(0,3).map(o=>o.title+(o.venueName?' @ '+o.venueName:''))}))};
 }
 report.totals={catalogueEvents:catalogue.length,officialMatches:enriched.candidates.length,
  imagesPublished:enriched.candidates.filter(c=>c.published).length,imageCandidatesPending:enriched.candidates.filter(c=>!c.published).length,
  discoveredEvents:discovered.added.length};
 return {events,cache,report,candidates:enriched.candidates};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const audit=process.argv.includes('--audit');
 const only=process.env.VENUES?process.env.VENUES.split(',').map(s=>s.trim()).filter(Boolean):null;
 const feed=await read('data/events.json',{events:[]});
 const cache=await read('data/venue-events.json',{version:1,venues:{}});
 const policy=await read('data/nl-venue-sources.json',{venues:{}});
 const result=await runVenueStage({audit,only,feed,cache,policy});
 // One line per venue keeps CI logs readable and machine-parsable.
 for(const [id,v] of Object.entries(result.report.venues))console.log('VENUE '+id+' '+JSON.stringify(v));
 console.log('TOTALS '+JSON.stringify(result.report.totals));
 if(!audit){
  const before=(feed.events||[]).length;
  await write('data/venue-events.json',result.cache);
  await write('data/venue-image-candidates.json',{generatedAt:result.report.generatedAt,
   note:'Official artwork matched to catalogue concerts. Only venues with imageUse "permitted" are published.',candidates:result.candidates});
  await write('data/events.json',{...feed,events:result.events,venueSources:{updatedAt:result.report.generatedAt,...result.report.totals}});
  console.log(`Venue stage: ${before} -> ${result.events.length} events; ${result.report.totals.officialMatches} official matches; ${result.report.totals.discoveredEvents} discovered.`);
 }
}
