/**
 * Strict, event-specific fixes for official image URLs known to be broken or
 * omitted by the automated venue crawler.
 *
 * Browser + Node share this implementation. Source image bytes are never
 * downloaded or copied by the app. A reviewed URL is NOT a copyright licence.
 */
import {artistKey} from './artist-images.js';

const VENUES={
 paradiso:{
  page:new Set(['www.paradiso.nl','paradiso.nl']),
  image:new Set(['assets.paradiso.nl']),
  pagePath:/^\/(?:(?:nl|en)\/)?programma\/[^/]+\/\d+\/?$/
 },
 patronaat:{
  page:new Set(['patronaat.nl','www.patronaat.nl']),
  image:new Set(['patronaat.nl','www.patronaat.nl']),
  pagePath:/^\/event\/[^/]+\/?$/
 }
};
const safeUrl=(value,hosts,pattern)=>{
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&hosts.has(u.hostname)&&pattern.test(u.pathname)?u.href:'';
 }catch{return '';}
};
const imagePath=/\.(?:jpg|jpeg|png|webp|avif)$/i;

export function verifiedOfficialArtworkRecord(rule){
 if(!rule||typeof rule!=='object'||!/^20\d{2}-\d{2}-\d{2}$/.test(rule.date||'')||
  !rule.id||typeof rule.id!=='string'||rule.id.length>220||
  !rule.artist||!rule.venue||rule.country!=='NL')return null;
 const venue=VENUES[artistKey(rule.venue)];
 if(!venue)return null;
 const image=safeUrl(rule.image,venue.image,imagePath);
 const sourceUrl=safeUrl(rule.sourceUrl,venue.page,venue.pagePath);
 if(!image||!sourceUrl)return null;
 return {...rule,image,sourceUrl};
}

/** Only alter this *exact* ID + act + date + venue. Never overwrite a third-
 * party poster or photo; correcting an older official direct link is OK.
 */
export function applyVerifiedOfficialArtwork(events,config={}){
 if(!Array.isArray(events))return {events:[],applied:0,invalid:0};
 const rows=new Map();let invalid=0,applied=0;
 for(const record of config.records||[]){
  const rule=verifiedOfficialArtworkRecord(record);
  if(!rule||rows.has(rule.id)){invalid++;continue;}
  rows.set(rule.id,rule);
 }
 const corrected=events.map(event=>{
  const rule=rows.get(event?.id);
  if(!rule||event.country!==rule.country||event.date!==rule.date||
   artistKey(event.venue)!==artistKey(rule.venue)||
   artistKey(event.artist)!==artistKey(rule.artist)||
   // Another already-confirmed event image retains priority.
   (event.image&&!String(event.imageSource||'').startsWith('venue-official-direct-link')))return event;
  if(event.image===rule.image&&event.officialUrl===rule.sourceUrl)return event;
  applied++;
  return {...event,image:rule.image,imageKind:'event-poster',
   imageSource:'venue-official-direct-link',officialUrl:rule.sourceUrl,
   imageCredit:{text:'Image: '+rule.venue,url:rule.sourceUrl}};
 });
 return {events:corrected,applied,invalid};
}
