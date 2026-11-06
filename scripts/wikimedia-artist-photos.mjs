/**
 * Additional artist portrait discovery using Wikidata identities and
 * properly licensed Wikimedia Commons photographs (no venue images).
 *
 * Precision over recall:
 * - exact normalized artist label (not vague text search / similarity);
 * - exactly one credible musical entity for that label;
 * - an image explicitly attached to that entity (Wikidata P18);
 * - licence, image size, format and attribution verified via Commons API.
 * We never publish search-result thumbnails or unrelated venue artwork.
 *
 * This is rate-limited and all misses/backoffs are persisted in the artist
 * photo cache as wikimediaAttempted. No credentials or paid API needed.
 */
import {artistKey,verifiedArtistPhoto} from '../js/artist-images.js';
import {selectArtistCandidates} from './deezer-artist-images.mjs';
import {imageFileFromWikidata,commonsPhotoFromImageInfo,THUMB_WIDTH,USER_AGENT} from './musicbrainz-identity.mjs';
import {isoDays} from './rate-limit.mjs';
import {commonsDepictsUrl,selectLicensedDepictsPhoto} from './commons-depicts-photos.mjs';
import {linkedArtistCategory,commonsArtistCategoryUrl,selectLicensedCategoryPhoto} from './commons-category-photos.mjs';

const MUSIC_CLASSES=new Set(['Q215380','Q2088357','Q5741069']);
const MUSIC_JOBS=new Set(['Q177220','Q639669','Q36834','Q488205','Q753110']);
const MUSIC_DESC=/\b(?:singer|songwriter|musician|rapper|disc jockey|dj|composer|vocalist|guitarist|bassist|pianist|drummer|violinist|saxophonist|band|orchestra|music group|musical group|musical ensemble|recording artist|singer songwriter|music producer|music duo|choir)\b/i;
const claimStrings=(entity,property)=>[...(entity?.claims?.[property]||[])]
 .filter(claim=>claim?.rank!=='deprecated')
 .map(claim=>claim?.mainsnak?.datavalue?.value)
 .filter(value=>typeof value==='string');
const claimIds=(entity,property)=>[...(entity?.claims?.[property]||[])]
 .filter(claim=>claim?.rank!=='deprecated')
 .map(claim=>claim?.mainsnak?.datavalue?.value?.id)
 .filter(value=>typeof value==='string');
const names=(entity)=>[
 ...Object.values(entity?.labels||{}).map(x=>x?.value),
 ...Object.values(entity?.aliases||{}).flatMap(rows=>(rows||[]).map(x=>x?.value))
].filter(Boolean);
const musical=entity=>{
 const classes=claimIds(entity,'P31'),jobs=claimIds(entity,'P106');
 const desc=Object.values(entity?.descriptions||{}).map(x=>x?.value||'').join(' ');
 if(classes.some(x=>MUSIC_CLASSES.has(x))||jobs.some(x=>MUSIC_JOBS.has(x)))return true;
 // A listed artist identifier plus an explicitly musical description is
 // strong evidence even if Wikidata uses a specialized subclass for the band.
 return MUSIC_DESC.test(desc)&&
  (classes.includes('Q5')||claimStrings(entity,'P434').length>0||
   claimStrings(entity,'P2722').length>0);
};

/** Only accept a single, exact, positively identified musical entity. */
export function chooseWikidataArtist(searchPayload,entitiesPayload,name){
 const key=artistKey(name);
 if(!key)return {entity:null,reason:'invalid-name'};
 const searchIds=[...new Set((searchPayload?.search||[])
  .filter(x=>artistKey(x.label)===key&&/^Q\d+$/.test(x.id||''))
  .map(x=>x.id))];
 const identities=searchIds.map(id=>entitiesPayload?.entities?.[id])
  .filter(e=>e&&!e.missing&&names(e).some(n=>artistKey(n)===key)&&musical(e));
 if(identities.length!==1)return {entity:null,reason:identities.length?'ambiguous-musical-identity':'no-confirmed-musician'};
 const entity=identities[0],file=imageFileFromWikidata({entities:{[entity.id]:entity}},entity.id);
 if(!file)return {entity:null,verifiedEntity:entity,reason:'no-commons-image'};
 return {entity,file};
}

async function getJson(fetcher,url){
 const r=await fetcher(url,{headers:{Accept:'application/json','User-Agent':USER_AGENT},
  signal:AbortSignal.timeout(10000)});
 if(r.status===429||r.status===503){
  const error=new Error('HTTP '+r.status);error.code='RATE_LIMIT';throw error;
 }
 if(!r.ok)throw new Error('HTTP '+r.status);
 return r.json();
}

const WIKIDATA='https://www.wikidata.org/w/api.php';
const COMMONS='https://commons.wikimedia.org/w/api.php';
const searchUrl=name=>WIKIDATA+'?action=wbsearchentities&format=json&type=item&language=en&limit=15&search='+encodeURIComponent(name);
const entityUrl=ids=>WIKIDATA+'?action=wbgetentities&format=json&props=claims|labels|aliases|descriptions|sitelinks&sitefilter=commonswiki&languages=en&ids='+encodeURIComponent(ids.join('|'));
const commonsUrl=file=>COMMONS+'?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata'+
 '&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|AttributionRequired&iiurlwidth='+THUMB_WIDTH+
 '&titles='+encodeURIComponent('File:'+file);

export async function enrichWikimediaArtistPhotos(events,imageCache,{
 today=new Date().toISOString().slice(0,10),fetcher=fetch,
 maxArtists=25,maxDurationMs=150000,clock=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms)),
 artistTags={artists:{}}
}={}){
 const result={version:1,...imageCache,artists:{...(imageCache?.artists||{})},
  wikimediaAttempted:{...(imageCache?.wikimediaAttempted||{})}};
 const stats={candidates:0,attempted:0,found:0,noMatch:0,ambiguous:0,licenceRejected:0,errors:0,depictsQueries:0,depictsFound:0,categoryQueries:0,categoryFound:0};
 const start=clock();let lastRequest=0;
 const fetchSlow=async(url,interval=850)=>{
  const wait=interval-(clock()-lastRequest);
  if(wait>0)await delay(wait);
  lastRequest=clock();
  return getJson(fetcher,url);
 };
 const candidates=selectArtistCandidates(events,result,{today})
  // Older attempts used only Wikidata P18. Retry them once with the
  // new verified P180 route, then respect the normal persistent backoff.
  .filter(item=>!(result.wikimediaAttempted[item.key]?.strategyVersion===3&&result.wikimediaAttempted[item.key]?.retryAfter>today))
  .sort((a,b)=>{
   const evidence=item=>Array.isArray(artistTags?.artists?.[item.key]?.genres)&&artistTags.artists[item.key].genres.length?1:0;
   const byEvidence=evidence(b)-evidence(a);
   return byEvidence||b.count-a.count||a.rank-b.rank||a.nextDate.localeCompare(b.nextDate);
  });
 stats.candidates=candidates.length;
 for(const item of candidates){
  if(stats.attempted>=maxArtists||clock()-start>=maxDurationMs)break;
  if(result.artists[item.key]?.image)continue;
  stats.attempted++;
  try{
   const found=await fetchSlow(searchUrl(item.name));
   const exact=[...new Set((found?.search||[]).filter(x=>artistKey(x.label)===item.key&&/^Q\d+$/.test(x.id||'')).map(x=>x.id))];
   let verdict={entity:null,reason:'no-confirmed-musician'};
   if(exact.length){
    const payload=await fetchSlow(entityUrl(exact));
    verdict=chooseWikidataArtist(found,payload,item.name);
   }
   const confirmed=verdict.entity||verdict.verifiedEntity;
   let photo=null,method='';
   if(verdict.entity&&verdict.file){
    const info=await fetchSlow(commonsUrl(verdict.file),950);
    photo=commonsPhotoFromImageInfo(info);
    if(photo&&(!verifiedArtistPhoto(photo.image)||
      !photo.descriptionUrl.startsWith('https://commons.wikimedia.org/wiki/File:')))photo=null;
    if(photo)method='unique-exact-wikidata-musical-identity';
   }
   if(!photo&&confirmed){
    // Explicit P180=QID is a subject-identity assertion, not a
    // best-guess filename or image search. Every image still needs
    // a valid individual Commons licence and creator credit.
    stats.depictsQueries++;
    const matches=await fetchSlow(commonsDepictsUrl(confirmed.id),950);
    photo=selectLicensedDepictsPhoto(matches,confirmed.id);
    if(photo){method='wikidata-exact-commons-depicts';stats.depictsFound++;}
   }
   if(!photo&&confirmed){
    const category=linkedArtistCategory(confirmed);
    if(category){
     stats.categoryQueries++;
     const matches=await fetchSlow(commonsArtistCategoryUrl(category),950);
     photo=selectLicensedCategoryPhoto(matches,item.name,confirmed.id);
     if(photo){method='wikidata-linked-artist-category';stats.categoryFound++;}
    }
   }
   if(photo&&confirmed){
    result.artists[item.key]={
     name:item.name,image:photo.image,source:'wikimedia-commons',kind:'artist-photo',
     sourceUrl:photo.descriptionUrl,wikidata:confirmed.id,
     licence:photo.licence,licenceUrl:photo.licenceUrl,author:photo.author,
     credit:photo.credit,checkedAt:new Date(clock()).toISOString(),
     matchedBy:method
    };
    delete result.wikimediaAttempted[item.key];stats.found++;
    continue;
   }
   if(confirmed)verdict={reason:verdict.file?'photo-license-or-size-rejected':'no-licensed-commons-photo'};

   if(verdict.reason==='ambiguous-musical-identity')stats.ambiguous++;
   else if(verdict.reason==='photo-license-or-size-rejected')stats.licenceRejected++;
   else stats.noMatch++;
   result.wikimediaAttempted[item.key]={strategyVersion:3,retryAfter:isoDays(today,verdict.reason==='ambiguous-musical-identity'?90:45),reason:verdict.reason};
  }catch(error){
   stats.errors++;
   result.wikimediaAttempted[item.key]={strategyVersion:2,retryAfter:isoDays(today,error.code==='RATE_LIMIT'?2:5),
    reason:String(error.message||error).slice(0,90)};
   if(error.code==='RATE_LIMIT')break;
  }
 }
 // Cache remains bounded to current unresolved names, not historic events.
 const active=new Set(selectArtistCandidates(events,result,{today}).map(c=>c.key));
 for(const key of Object.keys(result.wikimediaAttempted))if(!active.has(key))delete result.wikimediaAttempted[key];
 return {cache:result,stats};
}
