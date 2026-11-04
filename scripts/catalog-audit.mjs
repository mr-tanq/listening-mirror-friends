/**
 * Catalog coverage audit. Works entirely offline against published data,
 * so an unavailable external site can never break the refresh job.
 */
export function buildSourceAudit(data,{today=new Date().toISOString().slice(0,10)}={}){
 const events=Array.isArray(data?.events)?data.events:[];
 const sources={};const venues={};
 const isHttpImage=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
 for(const e of events){
  if(!e||typeof e!=='object'||e.date<today)continue;
  const source=String(e.source||'unknown').slice(0,60);
  const row=sources[source]||={events:0,withImage:0,withoutImage:0,greekEvents:0};
  row.events++;
  if(isHttpImage(e.image))row.withImage++;else row.withoutImage++;
  if(e.country==='GR'){
   row.greekEvents++;
   const key=String(e.venue||'Unknown').trim();
   if(key){
    const venue=venues[key]||={events:0,withImage:0,sources:[]};
    venue.events++;if(isHttpImage(e.image))venue.withImage++;
    if(!venue.sources.includes(source))venue.sources.push(source);
   }
  }
 }
 const expected=['gagarin-calendar','floyd-calendar','fuzzclub-calendar','anclub-index'];
 const status={};
 for(const s of expected){
  const count=sources[s]?.events||0;
  // A zero count is a coverage signal, not proof that a scraper failed:
  // the venue may genuinely have no upcoming concerts.
  status[s]={published:count,withImage:sources[s]?.withImage||0,warning:!count?'No published events; inspect runner logs / seasonality.':null};
 }
 const sourceKeys=Object.keys(sources).sort();
 const images=Object.values(sources).reduce((n,x)=>n+x.withImage,0);
 return {catalogUpdatedAt:data?.updatedAt||null,auditedFor:today,totalPublished:events.filter(e=>e?.date>=today).length,greekPublished:events.filter(e=>e?.date>=today&&e.country==='GR').length,imageCoverage:{withImage:images,withoutImage:Object.values(sources).reduce((n,x)=>n+x.withoutImage,0)},sources:Object.fromEntries(sourceKeys.map(k=>[k,sources[k]])),venueAdapters:status,topGreekVenues:Object.entries(venues).sort((a,b)=>b[1].events-a[1].events).slice(0,40).map(([name,row])=>({name,...row}))};
}
