/**
 * Third independent source for verified ARTIST photography, never event art.
 *
 * TheAudioDB v1's official free artist-mb endpoint accepts a MusicBrainz
 * artist MBID. No fuzzy name queries, no API key or browser-side requests.
 * Only publish when the response repeats the same MBID AND exact artist name,
 * uses an approved artist-thumb CDN URL, AND explicitly declares an
 * independently usable Creative Commons licence. Never assume that an image
 * is free merely because TheAudioDB publishes it.
 *
 * Official terms: https://www.theaudiodb.com/docs_terms_of_use.php
 * Docs: https://www.theaudiodb.com/free_music_api
 */
import {artistKey,verifiedArtistPhoto} from '../js/artist-images.js';
import {selectArtistCandidates} from './deezer-artist-images.mjs';
import {isoDays} from './rate-limit.mjs';

const MBID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const API='https://www.theaudiodb.com/api/v1/json/123/artist-mb.php?i=';
const CREDIT_BASE='https://www.theaudiodb.com/artist/';

export function audioDbLicense(raw){
 const text=String(raw||'').trim()
  .replace(/^https?:\/\/creativecommons\.org\/licenses\//i,'CC ')
  .replace(/\/$/,'').replace(/\//g,' ').replace(/[_-]/g,' ').replace(/\s+/g,' ').toUpperCase();
 // Explicit, compatible licence: no NC, ND, custom or vague "yes" tags.
 if(/^(?:CC0|CC 0)(?: 1(?:\.0)?)?$/.test(text)||/^PUBLIC DOMAIN$/.test(text))return 'CC0';
 const m=text.match(/^CC BY(?: SA)? (?:2\.0|2\.5|3\.0|4\.0)$/);
 return m?text:'';
}
export function verifiedAudioDbArtist(payload,name,mbid){
 if(!MBID.test(mbid||''))return {photo:null,reason:'invalid-musicbrainz-id'};
 // V1 returns {artists:null} if this artist is not in TheAudioDB. That's
 // fundamentally different from a name/MBID collision and must not be
 // described as one. No fuzzy name-search fallback is permissible here.
 if(payload?.artists==null||Array.isArray(payload.artists)&&payload.artists.length===0)
  return {photo:null,reason:'artist-not-in-provider'};
 if(!Array.isArray(payload.artists))
  return {photo:null,reason:'invalid-provider-payload'};
 if(payload.artists.length!==1)
  return {photo:null,reason:'ambiguous-provider-artist'};
 const artist=payload.artists[0];
 if(artistKey(artist.strArtist)!==artistKey(name)||
  String(artist.strMusicBrainzID||'').toLowerCase()!==mbid.toLowerCase())
  return {photo:null,reason:'artist-mbid-or-name-mismatch'};
 // The provider's stated artwork rights require checking this tag.
 const licence=audioDbLicense(artist.strCreativeCommons);
 if(!licence)return {photo:null,reason:'photo-license-not-confirmed'};
 const image=verifiedArtistPhoto(artist.strArtistThumb||'');
 if(!image||!/^https:\/\/(?:www\.|r2\.)?theaudiodb\.com\/images\/media\/artist\/thumb\//.test(image))
  return {photo:null,reason:'no-approved-artist-photo'};
 const id=String(artist.idArtist||'');
 if(!/^\d{3,12}$/.test(id))return {photo:null,reason:'invalid-provider-artist-id'};
 const page=CREDIT_BASE+id;
 const creator=String(artist.strArtistThumbCredit||artist.strArtistThumbAuthor||'')
  .replace(/<[^>]*>/g,'').slice(0,75).trim();
 // If an attribution licence requires the author, do not invent one.
 if(licence!=='CC0'&&!creator)return {photo:null,reason:'missing-required-creator-credit'};
 return {photo:{name,image,source:'theaudiodb',kind:'artist-photo',
  mbid:mbid.toLowerCase(),audioDbId:id,licence,
  sourceUrl:page,credit:{text:(creator?'Photo: '+creator+' · ':'Image via TheAudioDB · ')+
   licence+' · TheAudioDB',url:page}},reason:'accepted'};
}

/**
 * Called after MusicBrainz, Deezer and Commons. Reuses only independently
 * verified MBIDs, chooses unresolved upcoming artists, respects the free
 * provider's 30/min ceiling and persistent per-artist cooldowns.
 */
export async function enrichAudioDbArtistPhotos(events,imageCache,identities,{
 today=new Date().toISOString().slice(0,10),fetcher=fetch,
 maxArtists=20,maxDurationMs=100000,clock=()=>Date.now(),
 delay=ms=>new Promise(r=>setTimeout(r,ms))
}={}){
 const result={version:1,...imageCache,artists:{...(imageCache?.artists||{})},
  audioDbAttempted:{...(imageCache?.audioDbAttempted||{})}};
 const candidates=selectArtistCandidates(events,result,{today})
  .filter(x=>MBID.test(identities?.artists?.[x.key]?.mbid||''));
 const stats={eligible:candidates.length,attempted:0,found:0,licenseMissing:0,
  identityRejected:0,notInProvider:0,ambiguousProvider:0,invalidPayload:0,
  missingPhoto:0,errors:0,rateLimited:0,diagnosticRetried:0};
 const start=clock();let lastRequest=null;
 let legacyChecks=0;
 const urgentCutoff=isoDays(today,14);
 for(const item of candidates){
  if(stats.attempted>=maxArtists||clock()-start>=maxDurationMs)break;
  if(result.artists[item.key]?.image)continue;
  const previous=result.audioDbAttempted[item.key];
  const diagnosticRetry=previous?.reason==='missing-or-ambiguous-artist'&&
   previous?.retryAfter>today&&!previous?.diagnosticRetried&&
   item.nextDate<=urgentCutoff&&legacyChecks<4;
  // One bounded diagnostic-only revisit of the old combined failure state
  // for imminent shows. Never override licence, identity, API or quota backoff.
  if(previous?.retryAfter>today&&!diagnosticRetry)continue;
  if(diagnosticRetry){legacyChecks++;stats.diagnosticRetried++;}
  const mbid=identities.artists[item.key].mbid.toLowerCase();
  // Never exceed 30 requests/minute, even with a fast mocked/system clock.
  if(lastRequest!==null){
   const wait=Math.max(0,2100-(clock()-lastRequest));
   if(wait>0)await delay(wait);
  }
  if(clock()-start>=maxDurationMs)break;
  lastRequest=clock();stats.attempted++;
  try{
   const response=await fetcher(API+encodeURIComponent(mbid),{
    headers:{Accept:'application/json',
     'User-Agent':'ListeningMirrorFriends/1.1 (+https://github.com/mr-tanq/listening-mirror-friends)'},
    signal:AbortSignal.timeout(9000)
   });
   if([429,503].includes(response.status)){
    stats.rateLimited++;
    result.audioDbAttempted[item.key]={retryAfter:isoDays(today,2),reason:'provider-rate-limited'};
    break;
   }
   if(!response.ok)throw Error('HTTP '+response.status);
   const verdict=verifiedAudioDbArtist(await response.json(),item.name,mbid);
   if(verdict.photo){
    result.artists[item.key]={...verdict.photo,checkedAt:new Date(clock()).toISOString()};
    delete result.audioDbAttempted[item.key];
    // Existing Deezer attempts may be left for audit but the photo takes precedence.
    stats.found++;
   }else{
    if(verdict.reason==='photo-license-not-confirmed'||verdict.reason==='missing-required-creator-credit')stats.licenseMissing++;
    else if(verdict.reason==='artist-mbid-or-name-mismatch')stats.identityRejected++;
    else if(verdict.reason==='artist-not-in-provider')stats.notInProvider++;
    else if(verdict.reason==='ambiguous-provider-artist')stats.ambiguousProvider++;
    else if(verdict.reason==='invalid-provider-payload')stats.invalidPayload++;
    else stats.missingPhoto++;
    result.audioDbAttempted[item.key]={
     retryAfter:isoDays(today,verdict.reason==='artist-not-in-provider'?90:45),
     reason:verdict.reason,...(diagnosticRetry?{diagnosticRetried:true}:{})
    };
   }
  }catch(err){
   stats.errors++;
   result.audioDbAttempted[item.key]={retryAfter:isoDays(today,2),
    reason:String(err?.message||err).slice(0,80),
    ...(diagnosticRetry?{diagnosticRetried:true}:{})};
   if(stats.errors>=3)break;
  }
 }
 // Persist bounded attempts only for catalogue names; never store responses.
 const active=new Set(candidates.map(x=>x.key));
 for(const key of Object.keys(result.audioDbAttempted))
  if(!active.has(key))delete result.audioDbAttempted[key];
 return {cache:result,stats};
}
