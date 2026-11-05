/**
 * Listening Mirror Friends public catalogue.
 *
 * Uses the same Podiuminfo and Festivalinfo adapters as mr-tanq/concerts.
 * The GitHub Action checks out that repository READ-ONLY into .source/
 * and runs its tested scrapers. No Last.fm, Ticketmaster, or user credentials.
 *
 * This is a bounded rolling catalogue, not exhaustive real-time searching.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {enrichVenuePosters} from './venue-posters.mjs';
import {discoverFloydCalendar} from './floyd-calendar.mjs';
import {discoverFuzzCalendar} from './fuzzclub-calendar.mjs';
import {discoverAnClub} from './anclub-index.mjs';
import {importedPartnerEvents,mergePartnerEvents} from './partner-feeds.mjs';
import {buildSourceAudit} from './catalog-audit.mjs';
import {dedupeGreekVenueConcerts} from './venue-dedupe.mjs';
import {watchTechnopolisMusic} from './technopolis-watch.mjs';
import {recoverCatalogImages} from './event-image-recovery.mjs';
import {applyVerifiedPosters} from './verified-posters.mjs';
import {enrichPodiuminfoImages} from './podiuminfo-images.mjs';
import {addPodiuminfoArtists,verifiedArtistPhoto} from '../js/artist-images.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = async (file, fallback) => {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
const write = async (file, data) => {
  const destination = path.join(ROOT, file), tmp = destination + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await fs.rename(tmp, destination);
};
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + 'T12:00:00Z'));
const norm = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const safeUrl = raw => {
  try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
};
const plusDays = (day, days) => {const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);};
const dayNow = () => new Date().toISOString().slice(0, 10);

export function fromPodiuminfo(id, detail, detectCountry) {
  if (!detail || !validDate(detail.date) || !Array.isArray(detail.lineup) || !detail.lineup.length || !detail.venue || !detail.city) return null;
  const country = detectCountry(detail.city);
  if (!['NL','BE'].includes(country)) return null;
  const artists = [...new Set(detail.lineup.map(s => String(s).trim()).filter(Boolean))];
  if (!artists.length) return null;
  return {
    id: `podiuminfo-${id}`, artist: artists[0], artists,
    date: detail.date, venue: detail.venue, city: detail.city, country,
    genre: '', subgenre: '', url: safeUrl(detail.url),
    image: safeUrl(detail.image), source: 'podiuminfo'
  };
}
export function fromFestivalinfo(event) {
  if (!event || !validDate(event.date) || !event.festivalName || !['NL','BE'].includes(event.country) || !event.city) return null;
  const artists = [...new Set((event.lineup || []).map(s => String(s).trim()).filter(Boolean))];
  return {
    id: `festivalinfo-${event.concertId || encodeURIComponent(event.url || event.festivalName)}`,
    artist: event.festivalName, artists, date: event.date,
    endDate: validDate(event.endDate) ? event.endDate : event.date,
    venue: event.venue || event.festivalName, city: event.city, country: event.country,
    genre: '', subgenre: '', url: safeUrl(event.url), image: safeUrl(event.image),
    source: 'festivalinfo', isFestival: true
  };
}

export function fromOfficialVenue(event) {
  if (!event || !validDate(event.date) || !event.artist || !event.venue || !event.city || !['NL','BE'].includes(event.country)) return null;
  const artists=[...new Set((event.lineup || [event.artist]).map(x=>String(x).trim()).filter(Boolean))];
  if (!artists.length) artists.push(String(event.artist));
  const url=safeUrl(event.officialUrl || event.sourceUrl);
  if (!url) return null;
  return {
    id: String(event.id || `official-${event.date}-${event.artist}`),
    artist:String(event.artist),artists,date:event.date,venue:event.venue,city:event.city,country:event.country,
    genre:'',subgenre:'',url,image:safeUrl(event.image),source:'official'
  };
}

/**
 * Gagarin 205 publishes an official iCalendar feed via The Events Calendar.
 * Keep only dated, canonical venue event links; filter known comedy categories.
 * A valid venue calendar entry confirms the listing, not its musical genre.
 * This is deliberately independent of per-user music preferences.
 */
export function parseGagarinCalendar(ics,{today=dayNow(),endDate=plusDays(today,170)}={}){
  if(typeof ics!=='string'||!ics.includes('BEGIN:VCALENDAR'))return [];
  const entries=[],lines=ics.replace(/\r?\n[ \t]/g,'').split(/\r?\n/);
  let event=null;
  for(const line of lines){
    if(line==='BEGIN:VEVENT'){event=new Map();continue;}
    if(line==='END:VEVENT'){if(event)entries.push(event);event=null;continue;}
    if(!event)continue;
    const colon=line.indexOf(':');
    if(colon<1)continue;
    const key=line.slice(0,colon).split(';',1)[0].toUpperCase();
    const value=line.slice(colon+1).replace(/\\[nN]/g,' ').replace(/\\([,;\\])/g,'$1').trim();
    if(!event.has(key))event.set(key,value);
  }
  const results=new Map();
  for(const fields of entries){
    const rawDate=fields.get('DTSTART')||'';
    const m=/^(\d{4})(\d{2})(\d{2})/.exec(rawDate);
    if(!m)continue;
    const date=m[1]+'-'+m[2]+'-'+m[3];
    if(!validDate(date)||date<today||date>endDate)continue;
    const artist=String(fields.get('SUMMARY')||'').replace(/<[^>]*>/g,'').trim().slice(0,140);
    const category=norm(fields.get('CATEGORIES')||'');
    if(!artist||artist.length<2||/(^| )(comedy|stand up|standup|theater|theatre|κωμωδια|θεατρο)( |$)/.test(category))continue;
    // Exclude overt non-concert items even if the venue has not categorized them.
    if(/stand[\s-]?up|comedy|κωμωδ|σεβαστερ|θεατρικ|παραστασ/i.test(artist))continue;
    const url=safeUrl(fields.get('URL'));
    if(!url)continue;
    let canonical;
    try{canonical=new URL(url);}catch{continue;}
    if(canonical.hostname!=='gagarin205.gr'&&canonical.hostname!=='www.gagarin205.gr')continue;
    if(!canonical.pathname.startsWith('/event/'))continue;
    const id='gagarin-'+date+'-'+encodeURIComponent(norm(artist)).slice(0,100);
    results.set(date+'|'+norm(artist),{
      id,artist,artists:[artist],date,venue:'Gagarin 205',city:'Athens',country:'GR',
      genre:'',subgenre:'',url,image:'',source:'gagarin-calendar',verification:'venue-calendar'
    });
  }
  return [...results.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.artist.localeCompare(b.artist));
}

async function discoverGagarinCalendar({today,endDate,fetcher=fetch}={}){
  const url='https://gagarin205.gr/events/?ical=1';
  const response=await fetcher(url,{
    headers:{Accept:'text/calendar, text/plain;q=0.9','User-Agent':'ListeningMirrorFriends/1.0 (https://github.com/mr-tanq/listening-mirror-friends)'},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('Official venue calendar HTTP '+response.status);
  const content=await response.text();
  if(content.length>5_000_000)throw new Error('Official venue calendar is unexpectedly large');
  if(!content.includes('BEGIN:VCALENDAR'))throw new Error('Official venue calendar is not iCalendar');
  return parseGagarinCalendar(content,{today,endDate});
}

/**
 * Incrementally verify artists whose shows have not yet been opened.
 * Prefer unverified events in different calendar weeks, then fill remaining slots.
 * A second run processes the next batch rather than re-reading the same pages.
 */
export function chooseArtistBatch(dayEntries, concertEntries, {today, endDate, max=35, splitLineup}={}) {
  const pending = [];
  for (const [date, entry] of Object.entries(dayEntries || {}).sort(([a], [b])=>a.localeCompare(b))) {
    if (date < today || date > endDate || !Array.isArray(entry.candidates)) continue;
    for (const c of entry.candidates) {
      const previous = concertEntries?.[c.concertId];
      const stamp = Date.parse(previous?.cachedAt || '');
      const recent = Number.isFinite(stamp) && Date.now() - stamp < 14 * 86400000;
      if (recent || typeof c.rawTitle !== 'string') continue;
      const names = splitLineup(c.rawTitle).filter(name => name && name.length >= 2 && name.length <= 110);
      pending.push({date, names});
    }
  }
  const unique = new Map(), seenWeeks = new Set();
  // Prevent the first few very busy concert days from filling the whole batch.
  for (const c of pending) {
    const week = c.date.slice(0, 7) + '-' + Math.ceil(Number(c.date.slice(8)) / 7);
    if (seenWeeks.has(week)) continue;
    seenWeeks.add(week);
    for (const name of c.names) if (!unique.has(norm(name))) unique.set(norm(name), name);
    if (unique.size >= Math.ceil(max / 3)) break;
  }
  for (const c of pending) {
    for (const name of c.names) if (!unique.has(norm(name))) unique.set(norm(name), name);
    if (unique.size >= max) break;
  }
  return [...unique.values()].slice(0, max);
}

/** Genre metadata only: MusicBrainz does NOT supply concert listings. */
const genreAliases = {
  'Post-Rock': ['post-rock','post rock','postrock'],
  'Stoner / Doom': ['stoner rock','doom metal','doom','stoner metal','desert rock','sludge metal','sludge'],
  'Psychedelic': ['psychedelic rock','psychedelic','neo-psychedelia','psych rock'],
  'Ambient': ['ambient','dark ambient','drone'],
  'Reggae': ['reggae','dub','ska','roots reggae'],
  'Metal': ['metal','heavy metal','death metal','black metal','progressive metal','thrash metal','metalcore','grindcore'],
  'Rock': ['rock','hard rock','progressive rock','classic rock','garage rock'],
  'Alternative': ['alternative','alternative rock','art rock','grunge'],
  'Indie': ['indie','indie rock','indie pop','indie folk'],
  'Punk': ['punk','punk rock','hardcore punk','post-punk'],
  'Electronic': ['electronic','electronic music','techno','house','electronica','trance','idm','downtempo'],
  'Jazz': ['jazz','jazz fusion','free jazz'],
  'Classical': ['classical','contemporary classical','orchestral','neoclassical'],
  'Hip-Hop': ['hip-hop','hip hop','rap','trip hop'],
  'Pop': ['pop','synthpop','dream pop','chamber pop'],
  'Folk': ['folk','folk rock','neofolk','acoustic','americana'],
  'Experimental': ['experimental','avant-garde','noise','experimental rock'],
  'Metalcore':['metalcore','melodic metalcore','progressive metalcore','djent'],
  'Deathcore':['deathcore','symphonic deathcore','blackened deathcore'],
  'Hardcore':['hardcore','hardcore punk','post-hardcore','melodic hardcore'],
  'Pop-Punk':['pop punk','pop-punk','emo pop'],
  'R&B / Soul':['r&b','rnb','rhythm and blues','soul','neo-soul','contemporary r&b','alternative r&b'],
  'Blues':['blues','electric blues','blues rock'],
  'Funk / Disco':['funk','disco','nu-disco','funk rock'],
  'Country':['country','country pop','americana','alt-country'],
  'Latin':['latin pop','latin','reggaeton','bachata','salsa','latin trap'],
  'K-Pop':['k-pop','kpop','korean pop'],
  'Afrobeats':['afrobeats','afropop','afro-pop','amapiano']
};
export function classifyMusicBrainzTags(tags) {
  const ranked = (tags || []).filter(x=>x && typeof x.name==='string' && (x.count===undefined || Number(x.count)>=0))
    .sort((a,b)=>(Number(b.count)||0)-(Number(a.count)||0));
  const genres=[];
  for(const item of ranked) {
    const value=norm(item.name).replace(/[-_]/g,' ');
    for(const [genre,names] of Object.entries(genreAliases)) {
      if(names.some(name=>value===norm(name).replace(/[-_]/g,' ')) && !genres.includes(genre)) genres.push(genre);
    }
  }
  return genres.slice(0,5);
}
async function musicBrainzTags(artist, {fetcher=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  const header={'User-Agent':'ListeningMirrorFriends/1.0 (https://github.com/mr-tanq/listening-mirror-friends)','Accept':'application/json'};
  const ask=async url=>{await delay(1300);const response=await fetcher(url,{headers:header,signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('MusicBrainz metadata HTTP '+response.status);return response.json();};
  const endpoint=new URL('https://musicbrainz.org/ws/2/artist/');
  endpoint.search=new URLSearchParams({query:`artist:"${artist.replace(/["\\]/g,'')}"`,fmt:'json',limit:'5'});
  const found=await ask(endpoint);
  const exact=(found.artists || []).filter(x=>norm(x.name)===norm(artist)&&x.id)
    .sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0))[0];
  if(!exact)return [];
  const detail=await ask(`https://musicbrainz.org/ws/2/artist/${encodeURIComponent(exact.id)}?inc=genres+tags&fmt=json`);
  return classifyMusicBrainzTags([...(detail.genres || []),...(detail.tags || [])]);
}

/**
 * Apple's public iTunes catalog provides broad artist genres without accounts
 * or API keys. Require an exact artist name: a search hit alone is not evidence.
 * MusicBrainz remains available as a conservative fallback for niche genres.
 */
export function classifyItunesArtist(results, artist) {
  const exact=(results || []).filter(x=>x && x.wrapperType==='artist'
    && norm(x.artistName)===norm(artist) && typeof x.primaryGenreName==='string');
  const styles=[...new Set(exact.map(x=>x.primaryGenreName))];
  // Disambiguation: ambiguous identical artist names with incompatible genres.
  if(styles.length!==1)return [];
  const name=styles[0];
  const tokens=name.split(/\s*[\/,;&]\s*/).filter(Boolean);
  const mapped=classifyMusicBrainzTags(tokens.map(t=>({name:t,count:1})));
  if(mapped.length)return mapped;
  // Apple's broad labels have slightly different names than MusicBrainz tags.
  const special={
    'dance':['Electronic'],
    'dance & electronic':['Electronic'],
    'alternative & indie':['Alternative','Indie'],
    'alternative':['Alternative'],
    'hard rock':['Rock'],
    'r b soul':['R&B / Soul'],
    'r b':['R&B / Soul'],
    'soul':['R&B / Soul'],
    'country':['Country'],
    'latin':['Latin'],
    'k pop':['K-Pop'],
    'afrobeats':['Afrobeats'],
    'singer/songwriter':['Folk'],
    'hip-hop/rap':['Hip-Hop'],
    'world':[]
  };
  return special[norm(name)]||[];
}
async function itunesArtistGenres(artist,{fetcher=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  // Slow down requests to the public catalog and stop on its HTTP 429 limit.
  await delay(1400);
  const url=new URL('https://itunes.apple.com/search');
  url.search=new URLSearchParams({term:artist,media:'music',entity:'musicArtist',limit:'15'});
  const r=await fetcher(url,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(12000)});
  if(r.status===429)throw Object.assign(new Error('iTunes rate limit HTTP 429'),{code:'RATE_LIMIT'});
  if(!r.ok)throw Error('iTunes artist metadata HTTP '+r.status);
  const data=await r.json();
  return classifyItunesArtist(data.results,artist);
}
let musicBrainzFallbacks=0;
async function genreLookup(artist){
  let apple=[];
  let appleResponded=false;
  try{apple=await itunesArtistGenres(artist);appleResponded=true;}
  catch(error){
    if(error.code==='RATE_LIMIT')throw error;
    console.warn('iTunes metadata temporarily unavailable for '+artist+': '+error.message);
  }
  if(apple.length)return {genres:apple,source:'itunes'};
  if(musicBrainzFallbacks<8){
    musicBrainzFallbacks++;
    try{
      const genres=await musicBrainzTags(artist);
      return {genres,source:'musicbrainz'};
    }catch(error){
      console.warn('MusicBrainz metadata unavailable for '+artist+': '+error.message);
    }
  }
  if(appleResponded)return {genres:[],source:'itunes'};
  throw Object.assign(new Error('Artist genre sources temporarily unavailable'),{code:'PROVIDER_UNAVAILABLE'});
}
export async function applyGenreMetadata(events,cached,{limit=140,lookup=genreLookup,clock=Date.now}={}) {
  cached.artists ||= {};
  const candidates=new Map();
  // Frequency-weighted unique artists. Include festival performers for
  // genre discovery, not just the festival name.
  for(const event of events) {
    const names=event.source==='festivalinfo' ? (event.artists||[]).slice(0,90)
      : (event.artists||[event.artist]).slice(0,3);
    for(const name of names) {
      const key=norm(name);
      if(!key||key.length>100||key.length<2)continue;
      if(!candidates.has(key))candidates.set(key,{name,count:0,greekCount:0,firstDate:event.date});
      const row=candidates.get(key);
      row.count++;
      if(event.country==='GR')row.greekCount++;
      if(event.date<row.firstDate)row.firstDate=event.date;
    }
  }
  const queue=[...candidates.entries()]
    .filter(([key])=>{
      const old=cached.artists[key];
      if(!old)return true;
      const age=clock()-Date.parse(old.checkedAt||'');
      return !Number.isFinite(age)||age>(old.genres?.length?80:7)*86400000;
    })
    .sort((a,b)=>b[1].greekCount-a[1].greekCount || b[1].count-a[1].count || a[1].firstDate.localeCompare(b[1].firstDate))
    .slice(0,Math.max(0,Math.min(450,limit)));
  let attempts=0,identified=0;
  for(const [key,row] of queue) {
    attempts++;
    try {
      const result=await lookup(row.name);
      const genres=Array.isArray(result)?result:Array.isArray(result?.genres)?result.genres:[];
      cached.artists[key]={genres:genres.filter(g=>Object.keys(genreAliases).includes(g)).slice(0,6),
        source:typeof result?.source==='string'?result.source:'musicbrainz',
        checkedAt:new Date(clock()).toISOString()};
      if(genres.length)identified++;
    } catch(error){
      console.warn('Artist metadata temporarily unavailable: '+row.name+' - '+error.message);
      if(error.code==='RATE_LIMIT'){
        console.log('Provider rate limited: stopping enrichment until next scheduled update, leaving unprocessed artists uncached.');
        break;
      }
    }
  }
  for(const event of events) {
    const genres=[...new Set((event.artists||[event.artist])
      .flatMap(name=>cached.artists[norm(name)]?.genres||[]))];
    if(genres.length)event.genre=genres.slice(0,8).join(' / ');
  }
  return {events,attempts,identified,withGenres:events.filter(x=>!!x.genre).length,
    taggedArtists:Object.values(cached.artists).filter(x=>x.genres?.length).length};
}

/**
 * Read More.com's public, structured music catalogue using the existing
 * source adapter. Each card must independently validate an exact date, venue,
 * city, Greek location and HTTPS event link; ambiguous/multi-date cards are
 * discarded. No Ticketmaster, no invented event details.
 */
/** Safely identify the headlining name from common More.com billing suffixes. */
export function cleanGreekBilling(title) {
  const raw=String(title||'').trim();
  let head=raw.split(/\s+(?:with\s+special\s+guests?\b|special\s+guests?\b|support\s*:\s*|\+)\s*/i)[0];
  head=head.replace(/\s*\|\s*.+$/,'')
    .replace(/\s+[-–—]\s+[^:]{0,95}\b(?:anniversary|tour)\b.*$/i,'')
    .replace(/\s*:\s*[^:]{0,95}\b(?:world\s+)?tour\b.*$/i,'')
    .replace(/\s*\/\s*[A-Z][A-Z '-]{3,}.*$/,'')
    .replace(/\s+[-–—]\s+(?:(?:[A-Z][A-Za-z -]+\s)?(?:world\s+|europe\s+)?tour\b|underworld\s+.*\btour\b).*/i,'')
    .replace(/\s+live\s+in\s+(?:athens|thessaloniki|αθηνα|αθηνα|θεσσαλονικη)\s*!?$/i,'')
    .replace(/\s+["“][^"”]+["”]\s*$/u,'')
    .replace(/\s*\((?:UK|USA|US|NL|FR|DE|GR)\)\s*$/i,'')
    .trim();
  return head.length>=2&&head.length<=150?head:raw.slice(0,150);
}
export function parseGreekMusicCatalog(html,{cheerio,moreEvents,today=dayNow(),endDate=plusDays(today,180)}={}){
  const $=cheerio.load(html);
  const cards=$('article.play-template[itemtype$="/Event"]');
  const events=new Map();
  cards.each((_,node)=>{
    const title=$(node).find('h3[itemprop="name"]').first().text().trim();
    if(!title || title.length>250 || /cancelled|postponed|ακυρ[ωώ]|αναβ[οά]λ/i.test(title))return;
    // The original source adapter expects an artist, not a catalogue browse.
    // Extract the named billing; pass only this single verified card to it.
    const artist=title.split(/\s+(?:with special guests?:|with guests?:|special guests?:|support:|\+)\s*/i)[0]
      .replace(/\s*\|\s*.+$|\s+live(?:\s|$).*$/i,'').trim();
    if(artist.length<2||artist.length>150)return;
    let parsed=[];
    // The source adapter validates every event card. Some billing titles
    // include a tour subtitle and are only accepted with the full title.
    try {
      parsed=moreEvents($.html(node),artist);
      if(!parsed.length&&artist!==title)parsed=moreEvents($.html(node),title);
    }catch{return;}
    for(const event of parsed){
      if(event.country!=='GR'||!validDate(event.date)||event.date<today||event.date>endDate)continue;
      if(!event.sourceUrl||!safeUrl(event.sourceUrl)||!event.city||!event.venue)continue;
      const id='more-'+event.sourceId;
      const headliner=cleanGreekBilling(event.artist);
      const billed=[headliner];
      const guest=event.artist.match(/\bwith\s+special\s+guests?\s*:?\s*(.+)$/i)?.[1]?.trim();
      if(guest && guest.length>=2 && guest.length<100)billed.push(guest);
      events.set(id,{id,artist:headliner,artists:billed,date:event.date,
        venue:event.venue,city:event.city,country:'GR',
        genre:'',subgenre:'',url:event.sourceUrl,
        image:safeUrl(event.image),source:'more',verification:'source-catalog'});
    }
  });
  return {events:[...events.values()],cards:cards.length};
}
async function discoverGreekEvents(base,{today,endDate}){
  const {createRequire}=await import('node:module');
  const requireFromSource=createRequire(path.join(base,'package.json'));
  const cheerio=requireFromSource('cheerio');
  const original=await import(pathToFileURL(path.join(base,'scripts/sources/international-concert-search.mjs')).href);
  const manual=await import(pathToFileURL(path.join(base,'scripts/sources/manual-concert-search.mjs')).href);
  const url='https://www.more.com/gr-en/tickets/music/';
  const html=await manual.fetchHTML(url,'more.com');
  const result=parseGreekMusicCatalog(html,{cheerio,moreEvents:original.moreEvents,today,endDate});
  if(result.cards===0)throw new Error('More.com returned no recognizable structured music event cards');
  console.log('More.com Greek music feed: '+result.events.length+' valid single-date Greek shows from '+result.cards+' listing cards.');
  return result.events;
}

/**
 * Supplemental event index for the Greek heavy music scene. Entries must
 * contain a link to Rocking.gr's own date-specific event record.
 * These are third-party listings, NOT confirmations by the venue itself.
 */
export function parseRockingAgenda(html,{cheerio,today=dayNow(),endDate=plusDays(today,170),city='Athens'}={}){
  const $=cheerio.load(html),map=new Map();
  $('a[href]').each((_,node)=>{
    const raw=$(node).attr('href');
    if(typeof raw!=='string')return;
    let u;try{u=new URL(raw,'https://www.rocking.gr');}catch{return;}
    if(u.protocol!=='https:'||!['rocking.gr','www.rocking.gr'].includes(u.hostname))return;
    const m=u.pathname.match(/^\/agenda\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\/(\d{3,9})\/?$/);
    if(!m)return;
    const date=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    if(!validDate(date)||date<today||date>endDate)return;
    const text=$(node).text().replace(/\s+/g,' ').trim();
    const found=text.match(/^(.{2,190}?)\s+(Αθήνα|Θεσσαλονίκη|Athens|Thessaloniki)\s+@\s+(.+)$/i);
    if(!found)return;
    const [,billing,place,venueWithPrice]=found;
    const cityFromText=/^(?:αθήνα|athens)$/i.test(place)?'Athens':'Thessaloniki';
    if(norm(cityFromText)!==norm(city))return;
    const venue=venueWithPrice.replace(/\s+(?:Από\s+)?\d+(?:[,.]\d+)?\s*(?:€|e)(?:\s*\/\s*\d+\s*(?:€|e))?\s*$/i,'').trim();
    if(venue.length<2||venue.length>160)return;
    const groups=billing.split(/\s*,\s*|\s+\+\s+/).map(x=>x.trim()).filter(Boolean);
    // A festival title can contain the first artist after a colon.
    const first=groups[0]?.match(/^([^:]+\bfestival)\s*:\s*(.+)$/i);
    const performers=(first?[first[1],first[2],...groups.slice(1)]:groups)
      .filter(x=>x.length>=2&&x.length<=150);
    if(!performers.length)return;
    const id='rocking-'+m[1]+m[2].padStart(2,'0')+m[3].padStart(2,'0')+'-'+m[4];
    map.set(id,{id,artist:performers[0],artists:performers,date,venue,city:cityFromText,country:'GR',
      genre:'',subgenre:'',url:u.href,image:'',source:'rocking',verification:'third-party-agenda'});
  });
  return [...map.values()];
}
async function discoverRockingGreekEvents(base,{today,endDate}){
  const {createRequire}=await import('node:module');
  const cheerio=createRequire(path.join(base,'package.json'))('cheerio');
  const manual=await import(pathToFileURL(path.join(base,'scripts/sources/manual-concert-search.mjs')).href);
  const listings=new Map(),warnings=[];
  const first=new Date(today+'T12:00:00Z'),last=new Date(endDate+'T12:00:00Z');
  for(const citySlug of ['athens','thessaloniki']){
    for(let month=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),1));
      month<=last;month.setUTCMonth(month.getUTCMonth()+1)){
      const year=month.getUTCFullYear(),m=String(month.getUTCMonth()+1).padStart(2,'0');
      const url='https://www.rocking.gr/agenda/'+year+'/'+m+'/'+citySlug;
      try{
        const html=await manual.fetchHTML(url,'rocking.gr');
        const rows=parseRockingAgenda(html,{cheerio,today,endDate,city:citySlug==='athens'?'Athens':'Thessaloniki'});
        if(!rows.length && !/Πρόγραμμα συναυλιών/i.test(html))throw Error('Unrecognized page');
        for(const row of rows)listings.set(row.id,row);
      }catch(error){
        warnings.push(citySlug+' '+year+'-'+m+': '+error.message);
        // Runner IPs may be blocked. Stop retrying a blocked city this run.
        break;
      }
      await new Promise(resolve=>setTimeout(resolve,320));
    }
  }
  console.log('Rocking.gr Greek concert index: '+listings.size+' listings. '+warnings.slice(0,3).join('; '));
  return {events:[...listings.values()],warnings};
}

export async function buildCatalog({today=dayNow(), sourceDir=process.env.SOURCE_DIR || '.source'}={}) {
  const base = path.resolve(ROOT, sourceDir);
  const source = await import(pathToFileURL(path.join(base,'scripts/sources/podiuminfo.mjs')).href);
  const festivals = await import(pathToFileURL(path.join(base,'scripts/sources/festivalinfo.mjs')).href);
  const windowDays = Math.min(150, Math.max(14, Number(process.env.CATALOG_DAYS || 100)));
  const endDate = plusDays(today, windowDays);
  const festivalEnd = plusDays(today, Math.min(210,windowDays + 70));
  const limit = Math.min(100, Math.max(0, Number(process.env.NEW_ARTISTS_PER_RUN ?? 0)));

  const cache = await read('data/discovery-cache.json', {day:{entries:{}},concert:{entries:{}},festival:{months:{},editions:{}}});
  cache.day ||= {entries:{}}; cache.day.entries ||= {};
  cache.concert ||= {entries:{}}; cache.concert.entries ||= {};
  cache.festival ||= {months:{},editions:{}};
  const existing = await read('data/events.json', {events:[]});
  const watchlist = await read('data/artist-watchlist.json',{artists:[]});
  const editorial = [...new Set((watchlist.artists || []).filter(x=>typeof x==='string').map(x=>x.trim()).filter(x=>x.length>=2 && x.length<=110))].slice(0, 100);

  // Reuse only PUBLIC event-index caches built by the original project's working crawl.
  // GitHub Actions runner IPs can be denied by source websites (HTTP 403).
  // Import no personal archives, plans, music profiles, or recommendation scoring.
  const upstreamDay = await fs.readFile(path.join(base,'data/podiuminfo-day-cache.json'),'utf8')
    .then(JSON.parse).catch(() => ({entries:{}}));
  let mirroredDays=0;
  for (const [date, entry] of Object.entries(upstreamDay.entries || {})) {
    if (date<today || date>endDate || !Array.isArray(entry?.candidates)) continue;
    const old=cache.day.entries[date];
    if (!old || Date.parse(entry.checkedAt || '') > Date.parse(old.checkedAt || '')) {
      cache.day.entries[date]=entry;
      mirroredDays++;
    }
  }
  const upstreamFestivals = await fs.readFile(path.join(base,'data/festivalinfo-cache.json'),'utf8')
    .then(JSON.parse).catch(() => null);
  if (upstreamFestivals?.editions && upstreamFestivals?.months) {
    cache.festival=upstreamFestivals;
  }
  console.log('Mirrored public caches: '+mirroredDays+' Podiuminfo dates; '+
    Object.keys(cache.festival.editions || {}).length+' previously verified festival editions.');

  // First pass: populate/refresh Podiuminfo daily listings using unchanged current adapter.
  // An intentionally unlikely seed also works when the shared watchlist is empty.
  const first = await source.discoverEvents({
    trackedArtistNames: editorial.length ? editorial : ['zzzz-listening-mirror-index-seed'],
    startDate:today,endDate,dayCacheEntries:cache.day.entries,
    concertCacheEntries:cache.concert.entries,
    onProgress: async () => write('data/discovery-cache.json', cache)
  });
  const batch = chooseArtistBatch(cache.day.entries,cache.concert.entries,{today,endDate,max:limit,splitLineup:source.splitLineup});
  console.log(`Podiuminfo: refreshed ${first.stats.daysTotal} dates; checking ${batch.length} additional artist names.`);
  if (batch.length) await source.discoverEvents({
    trackedArtistNames:[...new Set([...editorial,...batch])],
    startDate:today,endDate,dayCacheEntries:cache.day.entries,
    concertCacheEntries:cache.concert.entries,
  });

  // Festival editions were individually validated by the original scraper.
  // Prefer its published verification cache rather than retry blocked remote fetches.
  const festivalEvents=Object.values(cache.festival.editions || {})
    .filter(entry=>entry && entry.version===1 && entry.event)
    .map(entry=>entry.event)
    .filter(e=>!e.cancelled && validDate(e.date) && (e.endDate||e.date)>=today
      && e.date<=festivalEnd && ['NL','BE'].includes(e.country));
  const festivalIncomplete=!festivalEvents.length;
  console.log('Reusable verified Festivalinfo editions: '+festivalEvents.length);

  // Optional editor watchlist: use the existing official-venue + Podiuminfo
  // per-artist search. One watched artist per run prevents hammering venues.
  const officialEvents=[];
  if (editorial.length) {
    try {
      const manual = await import(pathToFileURL(path.join(base,'scripts/sources/manual-concert-search.mjs')).href);
      const cycle=Math.floor(Date.parse(today+'T00:00:00Z')/86400000) % editorial.length;
      const artist=editorial[cycle];
      const request={id:crypto.randomUUID(),artist,place:'Netherlands'};
      const results=await manual.searchConcerts(request,{
        dayCacheEntries:cache.day.entries,startDate:today,endDate,
        deadline:Date.now()+120000
      });
      for(const raw of results.concerts || []) {
        if(raw.source!=='official')continue;
        const parsed=fromOfficialVenue(raw);
        if(parsed)officialEvents.push(parsed);
      }
      console.log(`Official venues: ${officialEvents.length} shows for ${artist}; rotating public watchlist daily.`);
    } catch(error) { console.warn(`Official-venue check unavailable: ${error.message}`); }
  }

  let greekEvents=[];
  let greeceFeedError='';
  try{
    greekEvents=await discoverGreekEvents(base,{today,endDate:festivalEnd});
  }catch(error){
    greeceFeedError=error.message||'Greek music source unavailable';
    console.warn('Greek feed temporarily unavailable; retaining prior source-verified events: '+greeceFeedError);
  }

  let rockingEvents=[],rockingWarning='';
  try{
    const rocking=await discoverRockingGreekEvents(base,{today,endDate:festivalEnd});
    rockingEvents=rocking.events;
    rockingWarning=rocking.warnings.slice(0,2).join('; ');
  }catch(error){
    rockingWarning=String(error.message||error);
    console.warn('Rocking.gr agenda unavailable: '+rockingWarning);
  }
  // Also check a venue-owned calendar directly; failures preserve the last-good catalogue.
  let gagarinEvents=[],gagarinWarning='';
  try{
    gagarinEvents=await discoverGagarinCalendar({today,endDate:festivalEnd});
    console.log('Gagarin 205 official calendar: '+gagarinEvents.length+' dated listings.');
  }catch(error){
    gagarinWarning=String(error.message||error);
    console.warn('Gagarin 205 calendar unavailable: '+gagarinWarning);
  }
  // The venue's official event calendar also includes occasional comedy dates;
  // the adapter accepts music events and retains existing records on failure.
  let floydEvents=[],floydWarning='';
  try{
    floydEvents=await discoverFloydCalendar({today,endDate:festivalEnd});
    console.log('Floyd official calendar: '+floydEvents.length+' music listings.');
  }catch(error){
    floydWarning=String(error.message||error);
    console.warn('Floyd calendar unavailable: '+floydWarning);
  }
  let fuzzEvents=[],fuzzWarning='';
  try{
    fuzzEvents=await discoverFuzzCalendar({today,endDate:festivalEnd});
    console.log('Fuzz Club official calendar: '+fuzzEvents.length+' listings.');
  }catch(error){
    fuzzWarning=String(error.message||error);
    console.warn('Fuzz Club calendar unavailable: '+fuzzWarning);
  }
  let anClubEvents=[],anClubWarning='';
  try{
    anClubEvents=await discoverAnClub({today,endDate:festivalEnd});
    console.log('AN Club official index: '+anClubEvents.length+' dated music listings.');
  }catch(error){
    anClubWarning=String(error.message||error);
    console.warn('AN Club event index unavailable: '+anClubWarning);
  }
  // Technopolis is strongly seasonal. Do not treat an empty official music
  // category as an absent show or scrape unrelated exhibitions.
  let technopolisMusic={status:'unavailable',message:'Check has not succeeded'};
  try{
    technopolisMusic=await watchTechnopolisMusic();
    console.log('Technopolis official music calendar: '+technopolisMusic.status);
  }catch(error){
    technopolisMusic={status:'unavailable',message:String(error.message||error)};
    console.warn('Technopolis music calendar unavailable: '+technopolisMusic.message);
  }
  // Never mark an unseen day as empty: retain last-good events until expiry.
  const map = new Map();
  for (const event of existing.events || []) {
    if (event && validDate(event.date) && event.date>=today && event.date<=festivalEnd && ['podiuminfo','podiuminfo-agenda','festivalinfo','official','more','rocking','gagarin-calendar','floyd-calendar','fuzzclub-calendar','anclub-index','partner-cometogether','partner-ticketservices'].includes(event.source)) map.set(event.id,event);
  }
  const maxAge=35*86400000;
  for (const [id, detail] of Object.entries(cache.concert.entries)) {
    if (Date.now()-Date.parse(detail?.cachedAt || '') > maxAge) continue;
    const event = fromPodiuminfo(id,detail,source.detectCountry);
    if(event && event.date>=today && event.date<=endDate)map.set(event.id,event);
  }
  // The original Podiuminfo day agenda is a verified INDEX, not an individually
  // verified concert detail page. Publish only listed venues with known cities,
  // and keep an explicit agenda-only provenance warning for visitors.
  const knownVenues=[
    ['Hall Of Fame','Tilburg','NL'],['Paard','Den Haag','NL'],
    ['TivoliVredenburg','Utrecht','NL'],['013','Tilburg','NL'],
    ['Paradiso','Amsterdam','NL'],['Melkweg','Amsterdam','NL'],
    ['Ziggo Dome','Amsterdam','NL'],['Patronaat','Haarlem','NL'],
    ['Doornroosje','Nijmegen','NL'],['AFAS Live','Amsterdam','NL'],
    ["dB's",'Utrecht','NL'],['Vera','Groningen','NL'],
    ['Effenaar','Eindhoven','NL'],['Muziekgieterij','Maastricht','NL'],
    ['Baroeg','Rotterdam','NL'],['Annabel','Rotterdam','NL'],
    ['Botanique','Brussels','BE'],['Bibelot','Dordrecht','NL'],
    ['Grenswerk','Venlo','NL'],['Willemeen','Arnhem','NL']
  ];
  const venueKey=s=>norm(s).replace(/[^a-z0-9]/g,'');
  const venueIndex=new Map(knownVenues.map(([name,city,country])=>[venueKey(name),{name,city,country}]));
  let agendaOnly=0;
  for(const [date,listing] of Object.entries(cache.day.entries)) {
    if(date<today || date>endDate || !Array.isArray(listing.candidates))continue;
    for(const item of listing.candidates) {
      try {
        const link=new URL(item.href);
        if(link.protocol!=='https:' || link.hostname!=='www.podiuminfo.nl')continue;
        const segments=link.pathname.split('/').filter(Boolean);
        if(segments.length!==4 || segments[0]!=='concert' ||
           !segments[1].split('').every(ch=>ch>='0' && ch<='9'))continue;
        if(String(item.concertId)!==segments[1])continue;
        const venue=venueIndex.get(venueKey(decodeURIComponent(segments[3])));
        if(!venue || typeof item.rawTitle!=='string')continue;
        const names=source.splitLineup(item.rawTitle).filter(x=>x.length>=2 && x.length<=150);
        if(!names.length)continue;
        const id='podiuminfo-'+segments[1];
        if(map.has(id))continue; // Individually verified cached details win.
        map.set(id,{id,artist:names[0],artists:names.slice(0,20),date,
          venue:venue.name,city:venue.city,country:venue.country,
          genre:'',subgenre:'',url:link.href,image:'',source:'podiuminfo-agenda',
          verification:'agenda-only'});
        agendaOnly++;
      } catch { /* Invalid public index entry; don't publish. */ }
    }
  }
  for(const item of festivalEvents){const event=fromFestivalinfo(item);if(event)map.set(event.id,event);}
  for(const item of greekEvents)map.set(item.id,item);
  // Reuse previously discovered posters when possible, then look up a small
  // bounded batch of new Gagarin event posters on official event pages.
  const oldGagarin=[...map.values()].filter(e=>e.country==='GR'&&e.image);
  for(const event of gagarinEvents){
    const prior=oldGagarin.find(e=>e.date===event.date&&norm(e.artist)===norm(event.artist));
    if(prior?.image)event.image=prior.image;
  }
  const posterResult=await enrichVenuePosters(gagarinEvents,{max:12});
  gagarinEvents=posterResult.events;
  console.log('Gagarin posters: '+posterResult.found+' fetched from '+posterResult.attempts+' official event pages.');
  for(const item of gagarinEvents){
    const duplicate=[...map.values()].find(e=>e.country===item.country&&e.date===item.date&&norm(e.artist)===norm(item.artist)&&norm(e.venue)===norm(item.venue));
    if(duplicate&&duplicate.id!==item.id)map.delete(duplicate.id);
    map.set(item.id,{...item,image:item.image||duplicate?.image||'',
      artists:[...new Set([...(duplicate?.artists||[]),...item.artists])]});
  }
  // Preserve existing artwork from earlier catalogues and trusted aggregators,
  // then retrieve a limited number of new Floyd posters from official pages.
  const priorFloyd=[...map.values()].filter(e=>e.country==='GR'&&e.image);
  for(const event of floydEvents){
    const older=priorFloyd.find(e=>e.date===event.date&&norm(e.artist)===norm(event.artist));
    if(older?.image)event.image=older.image;
  }
  const floydPoster=await enrichVenuePosters(floydEvents,{max:12});
  floydEvents=floydPoster.events;
  console.log('Floyd posters: '+floydPoster.found+' from '+floydPoster.attempts+' official pages.');
  for(const item of floydEvents){
    const duplicate=[...map.values()].find(e=>e.country===item.country&&e.date===item.date&&norm(e.artist)===norm(item.artist)&&norm(e.venue)===norm(item.venue));
    if(duplicate&&duplicate.id!==item.id)map.delete(duplicate.id);
    map.set(item.id,{...item,image:item.image||duplicate?.image||'',
      artists:[...new Set([...(duplicate?.artists||[]),...item.artists])]});
  }
  // Prefer official venue pages, keep earlier images when the index has none.
  // Fuzz poster requests are bounded and non-fatal when a page is inaccessible.
  const oldVenueImages=[...map.values()].filter(e=>e.country==='GR'&&e.image);
  for(const item of fuzzEvents){
    const found=oldVenueImages.find(e=>e.date===item.date&&norm(e.artist)===norm(item.artist));
    if(found?.image)item.image=found.image;
  }
  const fuzzPoster=await enrichVenuePosters(fuzzEvents,{max:12});
  fuzzEvents=fuzzPoster.events;
  for(const item of anClubEvents){
    const found=oldVenueImages.find(e=>e.date===item.date&&norm(e.artist)===norm(item.artist));
    if(found?.image&&!item.image)item.image=found.image;
  }
  // The AN homepage includes most posters but individual event pages can
  // supply OpenGraph artwork for missing cards.
  const anPoster=await enrichVenuePosters(anClubEvents,{max:8});
  anClubEvents=anPoster.events;
  console.log('AN Club posters: '+anPoster.found+' of '+anPoster.attempts+' official event pages.');
  const directVenueEvents=[...fuzzEvents,...anClubEvents];
  for(const item of directVenueEvents){
    const duplicate=[...map.values()].find(e=>e.country===item.country&&e.date===item.date&&norm(e.artist)===norm(item.artist)&&norm(e.venue)===norm(item.venue));
    if(duplicate&&duplicate.id!==item.id)map.delete(duplicate.id);
    const image=item.image||duplicate?.image||'';
    map.set(item.id,{...item,image,artists:[...new Set([...(duplicate?.artists||[]),...(item.artists||[])])]});
  }
  console.log('Fuzz posters: '+fuzzPoster.found+' of '+fuzzPoster.attempts+' official event pages.');
  // Reviewed venue and artist tour URLs supplement missing indexed shows.
  // These are dated fallbacks, not a complete automated tour search.
  const verified=await read('data/verified-events.json',{events:[]});
  let officialVerified=0;
  for(const e of verified.events||[]){
    if(!e||e.source!=='official'||!['NL','BE','GR'].includes(e.country)||!validDate(e.date)||
       e.date<today||e.date>festivalEnd||!e.venue||!e.city||
       !e.artist||!safeUrl(e.url))continue;
    // Prefer directly confirmed listings to duplicates on the same date.
    // Retain artwork from an earlier aggregator record if present.
    const existingMatch=[...map.values()].find(x=>x.country===e.country&&x.date===e.date&&norm(x.artist)===norm(e.artist));
    if(existingMatch&&existingMatch.id!==e.id)map.delete(existingMatch.id);
    map.set(e.id,{...e,image:e.image||existingMatch?.image||''});
    officialVerified++;
  }
  console.log('Official artist-tour and venue fallback records: '+officialVerified);
  // Prefer existing More.com listings with full artwork when both sources
  // have independently indexed the same headliner on the same date.
  const already=list=>list.some(e=>e.country==='GR');
  let extraRocking=0;
  for(const item of rockingEvents){
    const first=norm(cleanGreekBilling(item.artist)),venue=norm(item.venue);
    const duplicate=[...map.values()].some(e=>e.country==='GR'&&e.date===item.date&&
      (norm(cleanGreekBilling(e.artist))===first ||
       (venue===norm(e.venue)&&norm(e.artist).startsWith(first+' '))));
    if(duplicate)continue;
    map.set(item.id,item);
    extraRocking++;
  }
  console.log('Extra Greek concerts from Rocking.gr after dedupe: '+extraRocking);
  console.log('Added '+agendaOnly+' agenda-only previews. Their event details must be confirmed on Podiuminfo.');
  for(const item of officialEvents)map.set(item.id,item);
  // Import only permission-confirmed partner records, never crawl providers.
  const partnerInput=await read('data/partner-feeds.json',{providers:{}});
  const partner=importedPartnerEvents(partnerInput,{today,endDate:festivalEnd});
  const partnerMerged=mergePartnerEvents([...map.values()],partner.events);
  map.clear();for(const event of partnerMerged.events)map.set(event.id,event);
  console.log('Approved partner feed: '+partnerMerged.added+' added, '+partnerMerged.duplicates+' duplicates, '+partner.diagnostics.rejected+' rejected.');
  const missing=first.stats.daysMissing || 0;
  if (missing > Math.ceil(first.stats.daysTotal * 0.2)) throw Error(`Too many Podiuminfo dates unavailable: ${missing}/${first.stats.daysTotal}; previous published feed preserved.`);
  if (!map.size) throw Error('No verified events available yet; previous published feed preserved.');

  // Prune expired cache entries to avoid an ever-growing repository.
  for (const date of Object.keys(cache.day.entries)) if (date<today || date>endDate) delete cache.day.entries[date];
  for (const [id,detail] of Object.entries(cache.concert.entries)) if (detail?.date<today || detail?.date>festivalEnd || !detail?.date) delete cache.concert.entries[id];
  // Dated, reviewed music events missing from the general agenda index.
  // Supplements carry their actual original source; do not claim venue verification.
  const manualIndex=await read('data/editorial-supplements.json',{events:[]});
  let editorialSupplemented=0;
  for(const item of manualIndex.events||[]){
    if(!item||item.source!=='rocking'||item.country!=='GR'||
       !validDate(item.date)||item.date<today||item.date>festivalEnd||
       !item.artist||!item.venue||!item.city||!safeUrl(item.url))continue;
    let host;try{host=new URL(item.url).hostname;}catch{continue;}
    if(!['rocking.gr','www.rocking.gr'].includes(host))continue;
    const duplicate=[...map.values()].some(e=>e.country===item.country&&e.date===item.date&&
      norm(e.artist)===norm(item.artist)&&norm(e.venue)===norm(item.venue));
    if(!duplicate){map.set(item.id,item);editorialSupplemented++;}
  }
  console.log('Reviewed missing Greek agenda events supplemented: '+editorialSupplemented);
  const deduped=dedupeGreekVenueConcerts([...map.values()]);
  console.log('Greek same-venue cross-source duplicates merged: '+deduped.duplicates);
  // Reuse legitimate event artwork already present elsewhere in the catalog.
  const recovered=recoverCatalogImages(deduped.events);
  // Rocking is already part of the music index; a bounded poster lookup
  // checks only its dated individual event pages, not search/home pages.
  const pagePosters=await enrichVenuePosters(recovered.events.filter(e=>e.source==='rocking'&&!e.image),{max:24});
  const matchedImages=new Map(pagePosters.events.filter(e=>e.image).map(e=>[e.id,e.image]));
  let events=recovered.events.map(e=>matchedImages.has(e.id)?{...e,image:matchedImages.get(e.id)}:e)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.artist.localeCompare(b.artist));
  // Enrich Podiuminfo's index-only events with ACTUAL artist photos from
  // individual concert pages. Existing images are never overwritten.
  const podiumImageCache=await read('data/podiuminfo-image-cache.json',{entries:{}});
  const podiumPhotoResult=await enrichPodiuminfoImages(events,podiumImageCache,{
    today,parseConcertPageTitle:source.parseConcertPageTitle,
    maxRequests:Number(process.env.PODIUMINFO_IMAGE_REQUESTS||45),
    maxDurationMs:Number(process.env.PODIUMINFO_IMAGE_TIME_MS||150000)
  });
  events=podiumPhotoResult.events;
  await write('data/podiuminfo-image-cache.json',podiumPhotoResult.cache);
  console.log('Podiuminfo images: '+JSON.stringify(podiumPhotoResult.stats));
  // Separate artist photo cache: a verified photograph can serve multiple
  // concerts by the same band without ever replacing actual event posters.
  const previousArtistImages=await read('data/artist-images.json',{version:1,artists:{}});
  const sourcePhotos=[
    ...Object.entries(podiumPhotoResult.cache.entries||{}).map(([id,entry])=>{
      const event=events.find(e=>e.id===id);
      return event&&verifiedArtistPhoto(entry?.image)?{
        artist:event.artist,image:entry.image,sourceUrl:event.url
      }:null;
    }).filter(Boolean),
    ...events.filter(e=>e.imageKind==='artist-photo'&&verifiedArtistPhoto(e.image))
      .map(e=>({artist:e.artist,image:e.image,sourceUrl:e.url}))
  ];
  const artistImageUpdate=addPodiuminfoArtists(previousArtistImages,sourcePhotos);
  await write('data/artist-images.json',artistImageUpdate.cache);
  console.log('Artist image cache: '+Object.keys(artistImageUpdate.cache.artists).length+
    ' bands, '+artistImageUpdate.added+' new/updated photos.');
  console.log('Art recovery: '+recovered.reused+' reused; Rocking event pages '+pagePosters.found+' images from '+pagePosters.attempts+' pages.');
  const reviewedImages=await read('data/verified-event-images.json',{records:[]});
  const reviewed=applyVerifiedPosters(events,reviewedImages);
  events.splice(0,events.length,...reviewed.events);
  console.log('Reviewed concert posters: '+reviewed.applied+' applied, '+reviewed.invalid+' invalid rules.');
  const tags=await read('data/artist-tags.json',{artists:{}});
  tags.artists ||= {};
  // Historical provider failures were not valid classifications.
  // Retry them in a later run rather than treating them as artist metadata.
  for(const [key,entry] of Object.entries(tags.artists)){
    if(entry?.source==='unclassified')delete tags.artists[key];
  }
  // Keep small, reviewed genre seeds in sync with the public feed.
  // They provide coverage for well-known touring artists when public
  // provider lookups fail or return ambiguous names.
  const seeds=await read('data/curated-genres.json',{artists:{}});
  for(const [key,row] of Object.entries(seeds.artists||{})){
    if(!Array.isArray(row?.genres)||!row.genres.length)continue;
    const old=tags.artists[key]||{};
    tags.artists[key]={...old,
      genres:[...new Set([...row.genres,...(old.genres||[])])],
      source:'curated+metadata',checkedAt:new Date().toISOString()};
  }
  const genreStatus=await applyGenreMetadata(events,tags,{limit:Number(process.env.NEW_GENRE_LOOKUPS_PER_RUN || 140)});
  const result={updatedAt:new Date().toISOString(),source:'podiuminfo+festivalinfo',events,
    coverage:{countries:[...new Set(events.map(e=>e.country))].sort(),daysAhead:windowDays,festivalDaysAhead:Math.min(210,windowDays+70),greeceEvents:events.filter(e=>e.country==='GR').length,greeceFeedError,rockingEvents:events.filter(e=>e.source==='rocking').length,rockingWarning,
      verifiedPodiuminfoEvents:events.filter(x=>x.source==='podiuminfo').length,
      agendaOnlyPodiuminfoEvents:events.filter(x=>x.source==='podiuminfo-agenda').length,
      festivalEvents:events.filter(x=>x.source==='festivalinfo').length,officialVenueEvents:events.filter(x=>x.source==='official').length,partnerImportedEvents:partnerMerged.added,partnerDuplicates:partnerMerged.duplicates,sameVenueDuplicatesMerged:deduped.duplicates,artworkReused:recovered.reused,rockingPagePosters:pagePosters.found,reviewedPostersApplied:reviewed.applied,editorialSupplemented,podiuminfoImages:podiumPhotoResult.stats,artistPhotoCache:{artists:Object.keys(artistImageUpdate.cache.artists).length,updated:artistImageUpdate.added},gagarinCalendarEvents:events.filter(x=>x.source==='gagarin-calendar').length,gagarinPosterEnriched:posterResult.found,gagarinWarning,floydCalendarEvents:events.filter(x=>x.source==='floyd-calendar').length,floydPosterEnriched:floydPoster.found,floydWarning,fuzzCalendarEvents:events.filter(x=>x.source==='fuzzclub-calendar').length,fuzzPosterEnriched:fuzzPoster.found,fuzzWarning,anClubIndexEvents:events.filter(x=>x.source==='anclub-index').length,anClubPosterEnriched:anPoster.found,anClubWarning,
      datesUnavailable:missing,festivalIncomplete,genreTaggedEvents:genreStatus.withGenres,taggedArtists:genreStatus.taggedArtists,
      notes:'NL/BE: Podiuminfo agenda previews (verify original event page) and Festivalinfo. Greece: More.com and Rocking.gr public agenda plus official Gagarin 205 and Floyd iCalendar listings when accessible. Coverage is not exhaustive. All venues/dates must be verified at their source. Favorite genres are incomplete where artist metadata is missing.'}};
  await write('data/discovery-cache.json',cache);
  await write('data/artist-tags.json',tags);
  await write('data/events.json',result);
  const audit=buildSourceAudit(result,{today});
  audit.venueWarnings={gagarin:gagarinWarning,floyd:floydWarning,fuzz:fuzzWarning,anclub:anClubWarning};
  audit.technopolisMusic=technopolisMusic;
  await write('data/source-audit.json',audit);
  console.log('Coverage audit: '+audit.greekPublished+' Greek entries, '+audit.imageCoverage.withImage+' with images across all countries.');
  console.log(`Published ${events.length} concert/festival listings (${genreStatus.withGenres} tagged with artist genres; ${events.filter(x=>x.source==='podiuminfo-agenda').length} agenda-only). Sources: Podiuminfo/Festivalinfo/official venues; no Ticketmaster or Last.fm.`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  buildCatalog().catch(error=>{console.error(error);process.exitCode=1;});
}
