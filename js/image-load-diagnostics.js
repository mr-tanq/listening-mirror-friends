/**
 * Browser-only image-load diagnostics. Records observed loads/errors in memory
 * for this tab only. Never sends telemetry and never touches user preferences.
 * Only public event identity and image hostname are retained; no full URLs.
 */
const MAX_SAMPLES=40;
const state={loaded:0,failed:0,primaryFailed:0,backupLoaded:0,backupFailed:0,byHost:{},samples:[]};
const MAX_RENDERED=2000;
// A unique catalogue concert may be shown repeatedly in cards, detail and
// Deciding. Deduplicate those views rather than inflating the missing count.
const rendered=new Map();
export function recordRenderedConcert(event,primaryUrl){
 if(!event||event.source==='manual')return;
 const id=String(event.id||'').slice(0,120);
 const date=String(event.date||'').slice(0,10);
 if(!id||!date)return;
 const key=id+'|'+date;
 const withUrl=hostname(primaryUrl)!=='invalid';
 const previous=rendered.get(key);
 if(previous){
  // A live photo can arrive after a card first rendered without one.
  if(withUrl&&!previous.withUrl)previous.withUrl=true;
  return;
 }
 if(rendered.size>=MAX_RENDERED)return;
 rendered.set(key,{withUrl,id,date,
  artist:String(event.artist||'').slice(0,120),
  venue:String(event.venue||'').slice(0,90),
  country:String(event.country||'').slice(0,2)});
}

function hostname(value){
 try{const u=new URL(value);return u.protocol==='https:'?u.hostname:'invalid';}
 catch{return 'invalid';}
}
function record(event,url,stage,outcome){
 const host=hostname(url);
 const key=host.slice(0,90);
 const entry=state.byHost[key]||={loaded:0,failed:0};
 entry[outcome]++;
 if(outcome==='loaded')state.loaded++;else state.failed++;
 if(stage==='primary'&&outcome==='failed')state.primaryFailed++;
 if(stage==='backup'&&outcome==='loaded')state.backupLoaded++;
 if(stage==='backup'&&outcome==='failed')state.backupFailed++;
 if(outcome==='failed'&&state.samples.length<MAX_SAMPLES){
  state.samples.push({id:String(event?.id||'').slice(0,120),
   artist:String(event?.artist||'').slice(0,120),
   venue:String(event?.venue||'').slice(0,90),
   date:String(event?.date||'').slice(0,10),
   host:key,stage});
 }
}
/** Attaches listeners before src assignment; does not alter fallback behavior. */
export function watchConcertImage(img,event,primary,backup){
 const main=String(primary||'');
 const alternate=String(backup||'');
 const report=outcome=>{
  // src is the active requested candidate even if currentSrc remains on a failed prior image.
  const current=img.src||img.currentSrc||'';
  const stage=alternate&&current===alternate&&alternate!==main?'backup':'primary';
  record(event,current,stage,outcome);
 };
 img.addEventListener('load',()=>report('loaded'));
 img.addEventListener('error',()=>report('failed'));
}
export function imageLoadReport(){
 const shows=[...rendered.values()];
 const without=shows.filter(show=>!show.withUrl);
 return {scope:'This tab only; catalogue cards created in this browser tab',
  note:'Loads/errors count image events, not unique concerts. Rendered counts distinct catalogue shows, including cards below the fold. A URL is not proof the image loaded.',
  renderedShows:{total:shows.length,withImageUrl:shows.length-without.length,
   withoutImageUrl:without.length,limit:MAX_RENDERED},
  withoutImageUrlSamples:without.slice(0,40).map(({withUrl,...details})=>details),
  ...structuredClone(state)};
}
export function resetImageLoadReport(){
 state.loaded=0;state.failed=0;state.primaryFailed=0;state.backupLoaded=0;state.backupFailed=0;
 state.byHost={};state.samples=[];rendered.clear();
}
