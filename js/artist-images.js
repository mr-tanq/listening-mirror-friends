/**
 * Shared band photo fallback for Listening Mirror Friends.
 *
 * Event posters remain on event.image. This catalogue ONLY contains verified
 * artist photos recovered from the Podiuminfo artist-photo path, never event
 * posters or guesses from loosely matched festival lineups.
 */
export const artistKey=name=>String(name||'').normalize('NFKD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function verifiedArtistPhoto(raw){
 try{
  const u=new URL(raw);
  return u.protocol==='https:'&&!u.username&&!u.password&&
   ['www.podiuminfo.nl','podiuminfo.nl'].includes(u.hostname)&&
   u.pathname.startsWith('/img/artist/')&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)?u.href:'';
 }catch{return '';}
}
export function addPodiuminfoArtists(existing,records,{checkedAt=new Date().toISOString()}={}){
 const artists={...(existing?.artists||{})};let added=0;
 for(const record of records||[]){
  const key=artistKey(record?.artist);
  const image=verifiedArtistPhoto(record?.image);
  if(!key||key.length<3||!image)continue;
  if(artists[key]?.image===image)continue;
  artists[key]={image,kind:'artist-photo',source:'podiuminfo',sourceUrl:record.sourceUrl||'',checkedAt};
  added++;
 }
 return {cache:{version:1,artists},added};
}
export function resolveConcertImage(event,artistImages){
 if(event?.image)return {url:event.image,kind:event.imageKind==='artist-photo'?'artist-photo':'event-poster'};
 const key=artistKey(event?.artist);
 const photo=verifiedArtistPhoto(artistImages?.artists?.[key]?.image);
 return photo?{url:photo,kind:'artist-photo'}:{url:'',kind:'fallback'};
}
