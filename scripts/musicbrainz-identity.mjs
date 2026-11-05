/**
 * Multi-source artist identity resolution and licensed photo discovery.
 *
 *   headliner name ──► MusicBrainz artist (MBID, scored with event context)
 *                       │  url-rels
 *                       ├─► Wikidata QID ──► P18 image ──► Wikimedia Commons
 *                       │                                  (licence-checked)
 *                       └─► Deezer artist id ──► unambiguous Deezer portrait
 *
 * MusicBrainz is the identity hub: it disambiguates same-named bands with
 * country, type, tags and editor-written disambiguation, and links to other
 * services. Commons photos are only accepted under a free licence and are
 * stored with the credit line the licence requires.
 *
 * Rate limits: MusicBrainz ≤ 1 request/second with an identifying
 * User-Agent; Wikimedia: serial requests, identifying User-Agent, a standard
 * thumbnail width.
 */
import {artistKey,verifiedArtistPhoto} from '../js/artist-images.js';
import {selectArtistCandidates,deezerEntry,isAlbumCoverPortrait} from './deezer-artist-images.mjs';
import {createRateLimiter,isoDays} from './rate-limit.mjs';

export const USER_AGENT='ListeningMirrorFriends/1.1 (https://github.com/mr-tanq/listening-mirror-friends)';
export const THUMB_WIDTH=960; // A standard Wikimedia thumbnail step
const MIN_WIDTH=400;

// Event genre words → MusicBrainz tag fragments used as weak context evidence.
const GENRE_HINTS={
 metal:['metal','doom','sludge','grind','death','black','thrash','core'],rock:['rock','punk','grunge','garage','stoner','hardcore'],
 'post-rock':['post-rock','post rock','shoegaze','ambient','instrumental'],electronic:['electronic','techno','house','ambient','idm','synth','dance','drum and bass','dubstep','trance'],
 indie:['indie','alternative','dream pop','lo-fi','folk'],pop:['pop','dance','r&b','soul'],'hip-hop':['hip hop','hip-hop','rap','trap','grime'],
 jazz:['jazz','fusion','bebop','swing'],folk:['folk','singer-songwriter','americana','country'],classical:['classical','orchestral','opera','chamber','contemporary classical'],
 blues:['blues','soul','funk'],world:['world','latin','afrobeat','greek','rebetiko','laiko','entechno','fado','flamenco'],
 greek:['greek','rebetiko','laiko','entechno','έντεχνο','λαϊκό']
};
const LICENCE_OK=/^(?:cc0|public domain|pd|cc[ -]by(?:[ -]sa)?(?:[ -]\d\.\d)?(?:[ -][a-z]{2,3})?)$/i;

const lucene=s=>String(s).replace(/[\\"]/g,'\\$&');
const stripHtml=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/\s+/g,' ').trim();
const namesOf=artist=>[artist?.name,artist?.['sort-name'],...(artist?.aliases||[]).map(a=>a?.name)].filter(Boolean).map(artistKey);

/** Score MusicBrainz search hits for one name; only exact name/alias matches count. */
export function scoreMusicBrainzCandidates(payload,name,context={}){
 const key=artistKey(name);
 const country=String(context.country||'').toUpperCase();
 const genreWords=String([context.genre,context.subgenre].filter(Boolean).join(' ')).toLowerCase();
 const hints=new Set(Object.entries(GENRE_HINTS).filter(([g])=>genreWords.includes(g)).flatMap(([,v])=>v));
 if(country==='GR')GENRE_HINTS.greek.forEach(h=>hints.add(h));
 return (payload?.artists||[])
  .filter(a=>/^[0-9a-f-]{36}$/.test(a?.id||'')&&Number(a.score??100)>=90&&namesOf(a).includes(key))
  .map(a=>{
   const tags=(a.tags||[]).map(t=>String(t?.name||'').toLowerCase());
   let score=0;const why=[];
   if(artistKey(a.name)===key){score+=2;why.push('exact-name');}else why.push('alias');
   if(country&&(a.country===country||a.area?.['iso-3166-1-codes']?.includes(country))){score+=2;why.push('country');}
   if(hints.size&&tags.some(t=>[...hints].some(h=>t.includes(h)))){score+=2;why.push('genre');}
   if(['Group','Person'].includes(a.type)){score+=1;why.push('performer-type');}
   if((a.tags||[]).length||a['life-span']?.begin)score+=0.5; // a documented, established entry
   return {id:a.id,name:a.name,country:a.country||'',type:a.type||'',disambiguation:a.disambiguation||'',score,why};
  })
  .sort((x,y)=>y.score-x.score);
}
/** Accept a unique match, or a context winner with a clear margin. */
export function pickMusicBrainzArtist(payload,name,context={}){
 const ranked=scoreMusicBrainzCandidates(payload,name,context);
 if(!ranked.length)return {artist:null,reason:'not-found'};
 if(ranked.length===1)return {artist:{...ranked[0],matchedBy:'unique-name'}};
 if(ranked[0].score-ranked[1].score>=2&&ranked[0].why.some(w=>w==='country'||w==='genre'))
  return {artist:{...ranked[0],matchedBy:'context:'+ranked[0].why.join('+')}};
 return {artist:null,reason:'ambiguous',candidates:ranked.slice(0,5).map(x=>x.id)};
}
export function linksFromRelations(artist){
 const links={};
 for(const rel of artist?.relations||[]){
  const url=String(rel?.url?.resource||'');
  if(rel?.ended)continue;
  let m;
  if((m=url.match(/^https?:\/\/(?:www\.)?wikidata\.org\/wiki\/(Q\d+)$/)))links.wikidata=m[1];
  else if((m=url.match(/^https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/)))links.deezerId=Number(m[1]);
  else if((m=url.match(/^https?:\/\/open\.spotify\.com\/artist\/([A-Za-z0-9]{22})/)))links.spotifyId=m[1];
  else if((m=url.match(/^https?:\/\/([a-z0-9-]+)\.bandcamp\.com\/?$/i)))links.bandcamp='https://'+m[1].toLowerCase()+'.bandcamp.com/';
  else if(rel.type==='official homepage'&&/^https:\/\//.test(url))links.homepage=url;
 }
 return links;
}
/** The main image (P18) file name of a Wikidata entity, preferring rank "preferred". */
export function imageFileFromWikidata(payload,qid){
 const claims=payload?.entities?.[qid]?.claims?.P18||[];
 const usable=claims.filter(c=>c?.rank!=='deprecated'&&typeof c?.mainsnak?.datavalue?.value==='string');
 const best=usable.find(c=>c.rank==='preferred')||usable[0];
 return best?best.mainsnak.datavalue.value:'';
}
/** Licence-checked Commons photo with the credit line its licence requires. */
export function commonsPhotoFromImageInfo(payload){
 const page=Object.values(payload?.query?.pages||{})[0];
 const info=page?.imageinfo?.[0];
 if(!info)return null;
 const meta=info.extmetadata||{};
 const licence=stripHtml(meta.LicenseShortName?.value);
 if(!LICENCE_OK.test(licence))return null;
 if(/^image\/(?:jpeg|png|webp)$/.test(info.mime||'image/jpeg')===false)return null;
 if(Number(info.width||0)<MIN_WIDTH||Number(info.height||0)<MIN_WIDTH)return null;
 const image=verifiedArtistPhoto(info.thumburl||info.url);
 if(!image)return null;
 const author=stripHtml(meta.Artist?.value).slice(0,90)||'Unknown author';
 const licenceUrl=String(meta.LicenseUrl?.value||'');
 const descriptionUrl=String(info.descriptionurl||'');
 return {image,licence,licenceUrl,author,descriptionUrl,
  attributionRequired:String(meta.AttributionRequired?.value||'true')!=='false',
  credit:{text:'Photo: '+author+' · '+licence+' · Wikimedia Commons',url:descriptionUrl}};
}

async function getJson(fetcher,url){
 const response=await fetcher(url,{headers:{Accept:'application/json','User-Agent':USER_AGENT},signal:AbortSignal.timeout(9000)});
 if(response.status===503||response.status===429){const e=new Error('HTTP '+response.status);e.code='RATE_LIMIT';throw e;}
 if(response.status===404)return null;
 if(!response.ok)throw new Error('HTTP '+response.status);
 return response.json();
}

/**
 * Resolve identities for headliners still lacking a photo, then fill photos
 * from Commons (licensed) or from the Deezer id MusicBrainz links to.
 */
export async function enrichMusicBrainzIdentities(events,imageCache,identityCache,{
 today=new Date().toISOString().slice(0,10),fetcher=fetch,maxArtists=120,maxDurationMs=240000,
 clock=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms)),deezerClient=null
}={}){
 const images={version:1,...imageCache,artists:{...(imageCache?.artists||{})},attempted:{...(imageCache?.attempted||{})}};
 const ids={version:1,...identityCache,artists:{...(identityCache?.artists||{})},attempted:{...(identityCache?.attempted||{})}};
 const mb=createRateLimiter({max:1,perMs:1100,clock,delay});
 const wm=createRateLimiter({max:4,perMs:1000,clock,delay});
 const stats={candidates:0,processed:0,identified:0,ambiguous:0,notFound:0,commons:0,deezerLinked:0,errors:0};
 const start=clock();
 const candidates=selectArtistCandidates(events,images,{today});
 stats.candidates=candidates.length;
 for(const item of candidates){
  if(stats.processed>=maxArtists||clock()-start>=maxDurationMs)break;
  if(images.artists[item.key]?.image)continue;
  if(ids.attempted[item.key]?.retryAfter>today)continue;
  stats.processed++;
  try{
   let identity=ids.artists[item.key];
   if(!identity){
    await mb.wait();
    const search=await getJson(fetcher,'https://musicbrainz.org/ws/2/artist/?fmt=json&limit=10&query='+
     encodeURIComponent('artist:"'+lucene(item.name)+'" OR alias:"'+lucene(item.name)+'"'));
    const verdict=pickMusicBrainzArtist(search,item.name,item);
    if(!verdict.artist){
     verdict.reason==='ambiguous'?stats.ambiguous++:stats.notFound++;
     ids.attempted[item.key]={retryAfter:isoDays(today,verdict.reason==='ambiguous'?45:30),reason:verdict.reason,
      ...(verdict.candidates?{mbCandidates:verdict.candidates}:{})};
     continue;
    }
    await mb.wait();
    const full=await getJson(fetcher,'https://musicbrainz.org/ws/2/artist/'+verdict.artist.id+'?fmt=json&inc=url-rels');
    identity={name:item.name,mbid:verdict.artist.id,mbName:verdict.artist.name,country:verdict.artist.country,
     disambiguation:verdict.artist.disambiguation||undefined,matchedBy:verdict.artist.matchedBy,
     ...linksFromRelations(full),checkedAt:new Date(clock()).toISOString()};
    ids.artists[item.key]=identity;stats.identified++;
   }
   let photo=null;
   if(identity.wikidata){
    await wm.wait();
    const entity=await getJson(fetcher,'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids='+identity.wikidata);
    const file=imageFileFromWikidata(entity,identity.wikidata);
    if(file){
     await wm.wait();
     const info=await getJson(fetcher,'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'+
      '&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|AttributionRequired'+
      '&iiurlwidth='+THUMB_WIDTH+'&titles='+encodeURIComponent('File:'+file));
     const commons=commonsPhotoFromImageInfo(info);
     if(commons)photo={name:item.name,source:'wikimedia-commons',kind:'artist-photo',image:commons.image,
      mbid:identity.mbid,wikidata:identity.wikidata,sourceUrl:commons.descriptionUrl,licence:commons.licence,
      licenceUrl:commons.licenceUrl,author:commons.author,credit:commons.credit};
    }
   }
   // A Deezer id linked by MusicBrainz editors settles same-name ambiguity.
   if(!photo&&identity.deezerId&&deezerClient){
    const artist=await deezerClient.get('/artist/'+identity.deezerId);
    const entry=artist&&!artist.notFound?deezerEntry(artist,item.name,'musicbrainz-link'):null;
    const albums=entry?await deezerClient.get('/artist/'+identity.deezerId+'/albums?limit=100').catch(()=>null):null;
    if(entry&&!isAlbumCoverPortrait(entry.image,albums)){photo={...entry,mbid:identity.mbid};stats.deezerLinked++;}
   }
   if(photo){
    images.artists[item.key]={...photo,checkedAt:new Date(clock()).toISOString()};
    delete images.attempted[item.key];
    if(photo.source==='wikimedia-commons')stats.commons++;
   }else ids.attempted[item.key]={retryAfter:isoDays(today,45),reason:'identified-without-free-photo'};
  }catch(error){
   stats.errors++;
   ids.attempted[item.key]={retryAfter:isoDays(today,2),reason:String(error?.message||error).slice(0,75)};
   if(error?.code==='RATE_LIMIT')break;
  }
 }
 const active=new Set(candidates.map(c=>c.key));
 for(const key of Object.keys(ids.attempted))if(!active.has(key))delete ids.attempted[key];
 return {images,identities:ids,stats};
}
