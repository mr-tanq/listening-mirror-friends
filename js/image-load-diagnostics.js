/**
 * Browser-only image-load diagnostics. Records observed loads/errors in memory
 * for this tab only. Never sends telemetry and never touches user preferences.
 * Only public event identity and image hostname are retained; no full URLs.
 */
const MAX_SAMPLES=40;
const state={loaded:0,failed:0,primaryFailed:0,backupLoaded:0,backupFailed:0,byHost:{},samples:[]};
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
 return {scope:'This tab only; images actually attempted in rendered cards',
  note:'HTTP URLs existing in the feed are not necessarily loadable; counts are load/error events (not unique concerts).',
  ...structuredClone(state)};
}
export function resetImageLoadReport(){
 state.loaded=0;state.failed=0;state.primaryFailed=0;state.backupLoaded=0;state.backupFailed=0;
 state.byHost={};state.samples=[];
}
