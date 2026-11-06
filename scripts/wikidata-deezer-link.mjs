/**
 * Resolve a Deezer ARTIST portrait using an exact, uniquely verified
 * musical Wikidata entity and its direct Deezer artist identifier P2722.
 * No name search or fuzzy identity selection. A P2722 statement is an
 * identifier, not permission to redistribute an image.
 */
import {artistKey} from '../js/artist-images.js';
import {deezerEntry,isAlbumCoverPortrait} from './deezer-artist-images.mjs';

export function wikidataDeezerId(entity){
 const ids=[...new Set((entity?.claims?.P2722||[])
  .filter(c=>c?.rank!=='deprecated')
  .map(c=>c?.mainsnak?.datavalue?.value)
  .filter(x=>typeof x==='string'&&/^[1-9]\d{0,9}$/.test(x)))];
 if(ids.length!==1)return null; // More than one active ID is ambiguous.
 const id=Number(ids[0]);
 return Number.isSafeInteger(id)&&id>0?id:null;
}

export function sameVerifiedArtist(entity,deezerName,requestedName){
 const expected=artistKey(requestedName);
 if(!expected||!deezerName)return false;
 const recognized=[
  ...Object.values(entity?.labels||{}).map(v=>v?.value),
  ...Object.values(entity?.aliases||{}).flatMap(a=>(a||[]).map(x=>x?.value))
 ].map(artistKey).filter(Boolean);
 // Wikidata must contain the exact headliner, not just a distant similar.
 return recognized.includes(expected)&&recognized.includes(artistKey(deezerName));
}

export async function verifiedWikidataDeezerPhoto(entity,requestedName,deezerClient){
 const id=wikidataDeezerId(entity);
 if(!id||!deezerClient)return {photo:null,reason:id?'no-client':'no-unique-linked-id'};
 const artist=await deezerClient.get('/artist/'+id);
 if(!artist||artist.notFound||Number(artist.id)!==id||
   !sameVerifiedArtist(entity,artist.name,requestedName))
  return {photo:null,reason:'linked-id-name-mismatch'};
 const entry=deezerEntry(artist,requestedName,'wikidata-p2722');
 if(!entry)return {photo:null,reason:'linked-id-no-artist-picture'};
 // Unlike the original best-effort stage, refuse to assume a picture is
 // safe when the album lookup is unavailable.
 const albums=await deezerClient.get('/artist/'+id+'/albums?limit=100');
 if(!Array.isArray(albums?.data))return {photo:null,reason:'unverified-album-portrait'};
 if(isAlbumCoverPortrait(entry.image,albums))
  return {photo:null,reason:'album-cover-as-portrait'};
 return {photo:{...entry,wikidata:entity.id},reason:'verified'};
}
