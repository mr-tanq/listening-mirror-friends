/**
 * Shared band photo resolution for Listening Mirror Friends.
 *
 * Used by BOTH the browser and the scheduled Node enrichment job, so the
 * names the job looks up are exactly the names the cards resolve.
 *
 * Precedence: an event's own poster (event.image) always wins. Otherwise
 * a verified ARTIST photo for the headliner is used. Album covers, event
 * posters and loosely matched festival lineups are never stored here.
 */
export const artistKey=name=>String(name||'').normalize('NFKD')
 .replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

// Words that mark the part BEFORE a colon as a series/presenter rather than
// the act: "Tales From The Punx: Wolfbrigade", "Baroeg Tribute Night: X".
const SERIES_PREFIX=/(?:\b(?:presents?|presenteert|nights?|nacht|tribute|sessions?|series|showcase|club|fest|festival|from|stand ?up|records|label|release|central|oogst|lounge|stage|podium|weekender|edition|special|βραδιά|παρουσιάζει)\b|caf[eé]$)/i;
const TRAILING_QUALIFIER=/\s*[([](?:[A-Z]{2,3}|live|uitverkocht|sold out|nieuwe datum|extra show|verplaatst|afgelast|[^)\]]*\btour\b[^)\]]*)[)\]]\s*$/i;
const TRAILING_WORDS=/\s+(?:\+\s*supports?|\+\s*special guests?|\+\s*guests?|support\s*:.*|live|in concert|uitverkocht|sold out|extra show)$/i;
// Only explicit "with/featuring" separators split a bill by default. "&" and
// a single comma are NOT split: "Earth, Wind & Fire" must stay one act.
const GUEST_SPLIT=/\s+(?:met|with|feat\.?|ft\.?|featuring|w\/|\+)\s+/i;

// These are grammatical event-title boundaries, NOT a list of selected artists
// or venues. In particular, we never assume a famous name mentioned in a
// tribute, tour title or mixed lineup is the performing headliner.
const PERFORMER_CUE=/(?:\boptreden\s+van|\bperformance\s+by)\s+(.+)$/iu;
const PRESENTER_CUE=/^(.{3,100}?)\s+(?:presents?|presenteert|presenteren)\s*:?\s+(.{2,100})$/iu;
const SERIES_DASH=/^(?:band\s+night|open[\s-]+mic(?:\s+night)?|club\s+night|artist\s+showcase|music\s+showcase|tribute\s+night)\s+[-–—|]\s+(.+)$/iu;
const EVENT_SUFFIX=/\b(?:album|tour|anniversary|special guests?|line[\s-]?up|tickets?|afterparty|new\s+record|presents?)\b/iu;
// Explicit show descriptors sometimes follow the act without punctuation.
// Do not strip arbitrary two-word endings or numerals in actual band names.
const SHOW_TRAILER=/\s+(?:\d{1,3}\s+(?:jaar|years?)\s+(?:live|tour|jubileum|anniversary)|extended\s+set)$/iu;
function cleanExplicitAct(raw){
 const name=String(raw||'').replace(/\s+/g,' ').trim();
 if(!name||name.length>180)return '';
 const performer=name.match(PERFORMER_CUE);
 const presenter=name.match(PRESENTER_CUE);
 const night=name.match(SERIES_DASH);
 const candidate=(performer?.[1]||presenter?.[2]||night?.[1]||'').trim()
  .replace(/^[-–—:\s]+|[-–—:\s]+$/g,'');
 if(candidate.length<2||candidate.length>90||candidate.split(/\s+/).length>9||
  EVENT_SUFFIX.test(candidate)||/\s+\/\s+/.test(candidate))return '';
 return candidate;
}

/** Names eligible for NEW external artist photo searches.
 * The browser's existing headlinerNames remains the photo resolver; this
 * shortlist suppresses speculative lookups for composite event titles.
 */
export function headlinerSearchNames(event){
 const title=String(event?.artist||'').trim();
 const first=String(event?.artists?.[0]||'').trim();
 const explicit=cleanExplicitAct(title)||cleanExplicitAct(first);
 if(explicit)return [explicit];
 // A separately structured first artist is stronger than a display title.
 if(first&&artistKey(first)!==artistKey(title)&&
  !/[\s][-–—|][\s]|:\s|\s+\/\s+/.test(first))return [first];
 const raw=first||title;
 if(/\s+\/\s+/.test(raw))return []; // Multi-act bill, not one band's photo.
 const all=headlinerNames(event);
 const trailer=raw.replace(SHOW_TRAILER,'').trim();
 if(trailer!==raw&&trailer.length>=2)return [trailer];
 if(/(?:\s+[-–—|]\s+|:\s)/.test(raw)){
  const derived=all.find(n=>artistKey(n)!==artistKey(raw));
  if(derived)return [derived]; // "Artist - Tour" => search Artist only.
 }
 return all;
}


/**
 * Ordered, de-duplicated names under which the HEADLINER may be known.
 * The full source name always comes first; derived names follow from the
 * most to the least conservative transformation. Support acts are never
 * returned, so a card never shows a support act's face.
 */
export function headlinerNames(event){
 const explicit=cleanExplicitAct(event?.artist)||cleanExplicitAct(event?.artists?.[0]);
 if(explicit)return [explicit];
 const out=[];
 const add=value=>{
  const name=String(value||'').replace(/\s+/g,' ').trim().replace(/^[-–—:|\s]+|[-–—:|\s]+$/g,'');
  const key=artistKey(name);
  if(key.length>=2&&!out.some(x=>artistKey(x)===key))out.push(name);
 };
 const sources=[];
 if(Array.isArray(event?.artists)&&typeof event.artists[0]==='string')sources.push(event.artists[0]);
 sources.push(event?.artist);
 for(const source of sources){
  let name=String(source||'').replace(/\s+/g,' ').trim();
  if(!name)continue;
  add(name);
  // "Series: Act" -> the act; otherwise "Act: Album or tour" -> the act.
  const colon=name.match(/^([^:]{3,60}?)\s*:\s*(.{2,})$/);
  if(colon){
   if(SERIES_PREFIX.test(colon[1]))name=colon[2];
   else name=colon[1]; // the part after the colon may be an album or tour name
   add(name);
  }
  // Quoted album/show titles: 'KROTALIAS "Enos Leptou Sigi" - Release'
  const quoted=name.split(/\s+["“«‘'][^]*$/)[0];
  if(quoted!==name&&quoted.length>=2){name=quoted;add(name);}
  const dash=name.split(/\s+[-–—|]\s+/)[0];
  if(dash!==name){name=dash;add(name);}
  const trimmed=name.replace(TRAILING_QUALIFIER,'').replace(TRAILING_WORDS,'').replace(SHOW_TRAILER,'').trim();
  if(trimmed!==name){name=trimmed;add(name);}
  const lead=name.split(GUEST_SPLIT)[0];
  if(lead!==name){name=lead;add(name);}
  // Lists of three or more acts ("A, B, C") start with the headliner.
  if((name.match(/,\s/g)||[]).length>=2)add(name.split(/,\s/)[0]);
 }
 // Explicit presenter/series prefixes should not outrank the actual act.
 // Preserve original titles as low-priority fallbacks for uncertain cases.
 const series=String(event?.artists?.[0]||event?.artist||'').match(/^([^:]{3,60}?)\s*:\s*(.{2,})$/);
 if(series&&SERIES_PREFIX.test(series[1])){
  const key=artistKey(series[2]);
  const pos=out.findIndex(x=>artistKey(x)===key);
  if(pos>0)out.unshift(...out.splice(pos,1));
 }
 return out.slice(0,6);
}

const WIKIMEDIA_PATH=/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/[^/]+\.(?:jpe?g|png|webp)(?:\/\d+px-[^/]+\.(?:jpe?g|png|webp))?$/i;
export function verifiedArtistPhoto(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password)return '';
  if(['www.podiuminfo.nl','podiuminfo.nl'].includes(u.hostname))
   return u.pathname.startsWith('/img/artist/')&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)?u.href:'';
  // Public high-resolution Deezer ARTIST images (never track/album covers).
  if(['cdn-images.dzcdn.net','e-cdns-images.dzcdn.net'].includes(u.hostname))
   return /^\/images\/artist\/[a-f0-9]{16,64}\/\d+x\d+-[\w.-]+\.jpg$/i.test(u.pathname)?u.href:'';
  // Freely licensed Wikimedia Commons photographs (licence checked at ingest).
  // Commons distributes resized files via thumb.wikimedia.org; only the same
  // strict /wikipedia/commons/thumb/... photo path is accepted.
  if(u.hostname==='upload.wikimedia.org'||u.hostname==='thumb.wikimedia.org')
   return WIKIMEDIA_PATH.test(u.pathname)&&!u.search?u.href:'';
  return '';
 }catch{return '';}
}
const safeCredit=credit=>{
 if(!credit||typeof credit!=='object')return undefined;
 const text=String(credit.text||'').slice(0,160).trim();
 let url='';
 try{const u=new URL(credit.url);if(u.protocol==='https:')url=u.href;}catch{}
 return text?{text,url}:undefined;
};
export function addPodiuminfoArtists(existing,records,{checkedAt=new Date().toISOString()}={}){
 const artists={...(existing?.artists||{})};let added=0;
 for(const record of records||[]){
  const key=artistKey(record?.artist);
  const image=verifiedArtistPhoto(record?.image);
  if(!key||key.length<3||!image)continue;
  if(artists[key]?.image===image)continue;
  // A 1000px curated portrait or licensed photo should never be replaced by
  // Podiuminfo's roughly 100px thumbnail.
  if(artists[key]?.image&&artists[key]?.source!=='podiuminfo'&&record.source!==artists[key]?.source)continue;
  artists[key]={image,kind:'artist-photo',source:record.source||'podiuminfo',
    sourceUrl:record.sourceUrl||'',deezerId:record.deezerId||undefined,checkedAt};
  added++;
 }
 return {cache:{...(existing||{}),version:1,artists},added};
}
/** The cached artist entry for an event's headliner, if any. */
export function artistImageFor(event,artistImages){
 for(const name of headlinerNames(event)){
  const entry=artistImages?.artists?.[artistKey(name)];
  // Human-reviewed same-name artist photographs can be bound to one exact
  // concert. Never leak a scoped Whitechapel photo to an unrelated act.
  if(Array.isArray(entry?.scopes)&&!entry.scopes.some(scope=>scope?.id===event?.id&&
   scope.date===event?.date&&scope.country===event?.country&&artistKey(scope.venue)===artistKey(event?.venue)))continue;
  const url=verifiedArtistPhoto(entry?.image);
  if(url)return {url,entry,name};
 }
 return null;
}
export function resolveConcertImage(event,artistImages){
 if(event?.image)return {url:event.image,kind:event.imageKind==='artist-photo'?'artist-photo':'event-poster'};
 const found=artistImageFor(event,artistImages);
 if(!found)return {url:'',kind:'fallback'};
 const credit=safeCredit(found.entry.credit);
 return credit?{url:found.url,kind:'artist-photo',credit}:{url:found.url,kind:'artist-photo'};
}

/**
 * If an event poster cannot be loaded in the browser, the only automatic
 * backup is a verified photograph of THIS event's headliner. Never use
 * official venue candidates whose image-use permission is still pending.
 */
export function resolveConcertImageBackup(event,artistImages){
 if(!event?.image||event?.imageKind==='artist-photo')return null;
 const found=artistImageFor(event,artistImages);
 if(!found||found.url===event.image)return null;
 const credit=safeCredit(found.entry.credit);
 return credit?{url:found.url,kind:'artist-photo',credit}:{url:found.url,kind:'artist-photo'};
}
