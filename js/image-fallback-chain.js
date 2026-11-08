/**
 * Browser-side ordering for verified artist-photo backups. The enrichment job
 * already verified identity, artwork type and rights; this module only
 * validates HTTPS URLs, deduplicates and preserves attribution per photo.
 * No HTTP calls, fuzzy lookup, random photography or generated images.
 */
import {safeUrl} from './model.js?v=photo-recovery-v1';

export function concertImageFallbacks(event,primary){
 const seen=new Set([safeUrl(primary)].filter(Boolean));
 const legacy=event?.imageFallback?{
  url:event.imageFallback,kind:event.imageFallbackKind,
  credit:event.imageFallbackCredit
 }:null;
 const entries=[legacy,...(Array.isArray(event?.imageAlternates)?event.imageAlternates:[])];
 const backups=[];
 for(const candidate of entries){
  const url=safeUrl(candidate?.url);
  if(!url||seen.has(url)||candidate?.kind&&candidate.kind!=='artist-photo')continue;
  seen.add(url);
  const credit=candidate?.credit&&typeof candidate.credit.text==='string'?
   {text:candidate.credit.text.slice(0,160),url:safeUrl(candidate.credit.url)||''}:undefined;
  backups.push({url,kind:'artist-photo',...(credit?{credit}:{})});
  if(backups.length>=4)break;
 }
 return backups;
}
