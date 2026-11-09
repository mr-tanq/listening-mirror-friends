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

/**
 * Explicit multi-act billings only: "Act A / Act B / Act C".
 * Whitespace on both sides is required so AC/DC, artist aliases, titles
 * containing ordinary slashes, and event descriptions are not split.
 * This is a *performer roster*, not a claim about who is headlining.
 */
/**
 * A conservatively recognized bill: slash-separated acts as before, plus
 * named pairings with "&" and comma+ampersand multi-act lineups.
 * "Simon & Garfunkel", "Jack & Jack", "Earth, Wind & Fire" and
 * similarly established compound names deliberately stay a SINGLE act.
 * This parser never establishes artist identity: image providers still use
 * exact matching and source/rights checks for every individual.
 */
export function explicitlyBilledArtists(event){
 const title=String(event?.artist||'').replace(/\s+/g,' ').trim();
 if(!title||/\b(?:tribute|cover\s*band|covers\s+of|homage|ode\s+aan|many more|special guests?)\b/iu.test(title))return [];
 const valid=part=>{
  const key=artistKey(part);
  return key.length>=4&&part.length<=75&&part.split(/\s+/).length<=8&&
   !/^(?:live|tour|concert|festival|night|doors|tickets?|afterparty|support|tba|tbc|unknown|various artists)$/iu.test(part)&&
   !/[|:]/.test(part)&&
   !/\b(?:tickets?|tour|album|festival|present(?:s|ing)?|feat(?:uring)?|support|covers?)\b/iu.test(part);
 };
 const distinct=parts=>parts.length>=2&&parts.length<=5&&parts.every(valid)&&
  new Set(parts.map(artistKey)).size===parts.length;
 // A distinctly labelled concert series may bill performers after pipes:
 // "METAL/CORE SUNDAY MATINEE | Mosaic | XII Thorns | Serve".
 // Do not confuse arbitrary pipes (marketing text, venue, times) with a lineup.
 // The leading programme name is NOT a performer and never gets an artist photo.
 if(/\\s+\\|\\s+/.test(title)){
  const segments=title.split(/\\s+\\|\\s+/).map(x=>x.trim());
  const series=segments[0];
  const names=segments.slice(1);
  const isSeries=/\\b(?:matinee|showcase|band night|club night|music night|concert night|gig night|line[ -]?up|festival|fest|sessions?)\\b/iu.test(series);
  return segments.length>=3&&segments.length<=6&&isSeries&&distinct(names)?names:[];
 }
 // Slash billings require whitespace around the divider: AC/DC stays intact.
 if(/\s+\/\s+/.test(title)){
  const parts=title.split(/\s+\/\s+/).map(x=>x.trim());
  return distinct(parts)?parts:[];
 }
 if(!/\s+&\s+/.test(title))return [];
 const amp=title.split(/\s+&\s+/);
 if(amp.length!==2)return [];
 const parts=amp[0].includes(',')?
  [...amp[0].split(/,\s*/).map(x=>x.trim()),amp[1].trim()]:
  amp.map(x=>x.trim());
 if(!distinct(parts))return [];
 const multi=parts.filter(x=>x.split(/\s+/).length>=2).length;
 if(parts.length>=3){
  // A three-plus-act festival bill needs multiple distinctive full names.
  // Do not split established comma-band names such as Earth, Wind & Fire.
  return multi>=2?parts:[];
 }
 // Two named artists require two nontrivial performer names, or one
 // compound act and a separately styled, unmistakable uppercase act.
 const uppercaseAct=x=>/^[A-Z][A-Z0-9!'’.-]{3,}$/.test(x)&&/[A-Z]{4}/.test(x);
 return multi===2||(multi===1&&parts.some(uppercaseAct))?parts:[];
}


/**
 * Only the actual event's curated artist array may confirm which name
 * precedes a tour/album suffix. Never infer an unrelated name from a
 * substring of the marketing title.
 */
function explicitSourceHeadliner(event){
 const title=String(event?.artist||'').replace(/\s+/g,' ').trim();
 const source=event?.artists;
 if(!Array.isArray(source)||source.length<2||
  artistKey(source[0])!==artistKey(title))return '';
 for(const value of source.slice(1,6)){
  const name=String(value||'').replace(/\s+/g,' ').trim();
  if(name.length<4||name.length>75||name.split(/\s+/).length>9||
   /\b(?:tribute|cover|festival|support|special guests?|tour)\b/iu.test(name))continue;
  if([' - ',' – ',' — ',': '].some(separator=>title.startsWith(name+separator)))
   return name;
 }
 return '';
}

/** A person '(of Band)' is the performer, not the cited parent band. */
function affiliatedSoloist(raw){
 const name=String(raw||'').trim();
 const match=name.match(/^(.{4,75}?)\s+\((?:of|from|formerly\s+(?:of|in)|ex[-\s]+)\s+[^()]{3,75}\)$/iu);
 const solo=match?.[1]?.trim()||'';
 return solo.length>=4&&solo.split(/\s+/).length<=8?solo:'';
}

/** "Headliner ft. Guest - Show Title": two expressly credited performers. */
function explicitFeaturedPair(event){
 const title=String(event?.artist||'').trim().replace(/\s+/g,' ');
 const found=title.match(/^(.{4,85}?)\s+(?:ft\.?|feat\.?|featuring)\s+(.{4,75}?)(?:\s+[-–—]\s+.+)?$/iu);
 if(!found)return [];
 const head=found[1].trim(),guest=found[2].trim();
 const qualified=x=>x.length>=4&&x.length<=75&&
  x.split(/\s+/).length<=8&&!/[/:|,]/.test(x)&&
  !/\b(?:tribute|cover|tour|festival|support|tickets?|album)\b/iu.test(x);
 if(!qualified(head)||!qualified(guest)||artistKey(head)===artistKey(guest))return [];
 return [head,guest];
}

/**
 * A precisely named soloist leading a conventional small jazz ensemble.
 * The photo must still be independently verified for the SOLOIST: these
 * suffixes alone never establish artist identity. Never guess the leader of
 * a band from arbitrary title words or photos of a tribute subject.
 */
export function explicitlyNamedEnsembleLeader(event){
 const title=String(event?.artist||'').replace(/\s+/g,' ').trim();
 const m=title.match(/^(.+?)\s+(?:trio|quartet|quintet|sextet|septet|octet)$/iu);
 if(!m||/\b(?:tribute|cover|festival|presents?|support|featuring|feat|tour|night)\b/iu.test(title))return '';
 const leader=m[1].trim();
 const parts=leader.split(' ');
 if(parts.length<2||parts.length>4||leader.length>75||
  /^(?:the|de|het|a|an|les|los|die|new|young|big|jazz|world|free|modern|classic|blue|royal|electric)$/iu.test(parts[0]))return '';
 if(parts.some((word,i)=>!(i>0&&/^(?:van|von|de|der|den|da|di|del|du)$/iu.test(word))&&
  !/^\p{Lu}[\p{L}’'.-]*$/u.test(word)))return '';
 const first=String(event?.artists?.[0]||'').trim();
 if(first&&artistKey(first)!==artistKey(title)&&artistKey(first)!==artistKey(leader))return '';
 return leader;
}

/** Names eligible for NEW external artist photo searches.
 * The browser photo resolver and all Node enrichers share this shortlist.
 * Venue duplicate matching deliberately retains the older headlinerNames.
 * Suppresses speculative lookups for composite event titles.
 */
export function headlinerSearchNames(event){
 const title=String(event?.artist||'').trim();
 const first=String(event?.artists?.[0]||'').trim();
 const sourced=explicitSourceHeadliner(event);
 if(sourced)return [sourced];
 const affiliated=affiliatedSoloist(first||title);
 if(affiliated)return [affiliated];
 const featured=explicitFeaturedPair(event);
 if(featured.length)return featured;
 const leader=explicitlyNamedEnsembleLeader(event);
 if(leader)return first&&artistKey(first)===artistKey(leader)?[leader]:[title,leader];
 const explicit=cleanExplicitAct(title)||cleanExplicitAct(first);
 const billed=explicitlyBilledArtists(event);
 if(explicit)return [explicit];
 // A formatted slash bill is an explicit roster of performers. Keep all
 // names available to the photo resolver, clearly identifying the pictured act.
 if(billed.length&&(!first||artistKey(first)===artistKey(title)||
  billed.some(name=>artistKey(name)===artistKey(first))))return billed;
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
  const trimmed=name.replace(TRAILING_QUALIFIER,'').replace(TRAILING_WORDS,'').trim();
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
  // TheAudioDB only accepts *artist thumbnails* from their official CDN.
  // The collector separately validates an identical MusicBrainz artist ID,
  // an explicit compatible Creative Commons grant and source attribution.
  if(['www.theaudiodb.com','theaudiodb.com','r2.theaudiodb.com'].includes(u.hostname))
   return /^\/images\/media\/artist\/thumb\/[a-z0-9_-]{8,80}\.jpe?g$/i.test(u.pathname)&&!u.search?u.href:'';
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
/**
 * Ordered verified photos for this event, using exactly the same artist-name
 * eligibility and human-scoped overrides as the normal photo resolver.
 * Full group portraits precede its individually billed performers. Dedupe
 * identical CDN URLs so browser fallback cannot loop on the same photo.
 */
export function artistImageOptionsFor(event,artistImages){
 const billed=explicitlyBilledArtists(event);
 const featured=explicitFeaturedPair(event);
 const ensembleLeader=explicitlyNamedEnsembleLeader(event);
 const full=String(event?.artist||'').trim();
 const candidates=billed.length>1?[full,...headlinerSearchNames(event)]:headlinerSearchNames(event);
 const out=[],seen=new Set();
 for(const name of candidates){
  const entry=artistImages?.artists?.[artistKey(name)];
  if(Array.isArray(entry?.scopes)&&!entry.scopes.some(scope=>scope?.id===event?.id&&
   scope.date===event?.date&&scope.country===event?.country&&
   artistKey(scope.venue)===artistKey(event?.venue)))continue;
  const url=verifiedArtistPhoto(entry?.image);
  if(!url||seen.has(url))continue;
  const leaderPhoto=Boolean(ensembleLeader&&artistKey(name)===artistKey(ensembleLeader));
  const lineup=billed.length>1&&artistKey(name)!==artistKey(full)||
   featured.length>1&&artistKey(name)===artistKey(featured[1])||leaderPhoto;
  out.push({url,entry,name,lineup,...(leaderPhoto?{creditRole:'ensemble leader'}:{})});
  seen.add(url);
  if(out.length>=5)break;
 }
 return out;
}
/** The first, best verified artist photo (compatibility with existing jobs). */
export function artistImageFor(event,artistImages){
 return artistImageOptionsFor(event,artistImages)[0]||null;
}
function photoCreditFor(found){
 const existing=safeCredit(found.entry.credit);
 if(!found.lineup)return existing;
 // Never present one performer as the full show's headliner. Preserve the
 // original photographer's attribution and link, including Commons CC terms.
 return safeCredit({text:'Photo of '+found.name+' ('+(found.creditRole||'billed act')+') · '+
  (existing?.text||'Artist photo'),url:existing?.url||found.entry.sourceUrl||''});
}
export function resolveConcertImage(event,artistImages){
 if(event?.image)return {url:event.image,kind:event.imageKind==='artist-photo'?'artist-photo':'event-poster'};
 const found=artistImageFor(event,artistImages);
 if(!found)return {url:'',kind:'fallback'};
 const credit=photoCreditFor(found);
 return credit?{url:found.url,kind:'artist-photo',credit}:{url:found.url,kind:'artist-photo'};
}

/**
 * If an event poster cannot be loaded in the browser, the only automatic
 * backup is a verified photograph of THIS event's headliner. Never use
 * official venue candidates whose image-use permission is still pending.
 */
/**
 * Additional already-verified pictures if a poster or another cached
 * portrait is blocked, expired or fails to load in the browser. Images come
 * only from the event's independently verified billed performers: never
 * generic event searches or photo URLs supplied by arbitrary third parties.
 * The first item is also exposed through the legacy single-image fallback.
 */
export function resolveConcertImageBackups(event,artistImages){
 const primary=String(event?.image||'');
 return artistImageOptionsFor(event,artistImages)
  .filter(x=>x.url!==primary)
  .slice(0,4).map(found=>{
   const credit=photoCreditFor(found);
   return {url:found.url,kind:'artist-photo',...(credit?{credit}:{})};
  });
}

export function resolveConcertImageBackup(event,artistImages){
 if(!event?.image||event?.imageKind==='artist-photo')return null;
 const found=artistImageFor(event,artistImages);
 if(!found||found.url===event.image)return null;
 const credit=photoCreditFor(found);
 return credit?{url:found.url,kind:'artist-photo',credit}:{url:found.url,kind:'artist-photo'};
}
