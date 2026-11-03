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
const norm = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
  'Jazz': ['jazz','blues','jazz fusion','free jazz'],
  'Classical': ['classical','contemporary classical','orchestral','neoclassical'],
  'Hip-Hop': ['hip-hop','hip hop','rap','trip hop'],
  'Pop': ['pop','synthpop','dream pop','chamber pop'],
  'Folk': ['folk','folk rock','neofolk','acoustic','americana'],
  'Experimental': ['experimental','avant-garde','noise','experimental rock']
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
export async function applyGenreMetadata(events, cached, {limit=16, lookup=musicBrainzTags,clock=Date.now}={}) {
  cached.artists ||= {};
  let attempts=0;
  for(const event of events) {
    // Festivals have several artists and no defensible single genre.
    const names=event.source==='festivalinfo' ? event.artists.slice(0,3) : event.artists.slice(0,2);
    for(const name of names) {
      const key=norm(name);
      if(!key || key.length>100)continue;
      const old=cached.artists[key];
      if(old && clock()-Date.parse(old.checkedAt || '')<90*86400000)continue;
      if(attempts>=limit)continue;
      attempts++;
      try { cached.artists[key]={genres:await lookup(name),checkedAt:new Date(clock()).toISOString()}; }
      catch(error) { console.warn(`Genre metadata unavailable for ${name}: ${error.message}`); }
    }
  }
  for(const event of events) {
    const names=event.source==='festivalinfo'?event.artists.slice(0,6):event.artists;
    const genres=[...new Set(names.flatMap(name=>cached.artists[norm(name)]?.genres || []))];
    if(genres.length)event.genre=genres.slice(0,5).join(' / ');
  }
  return {events,attempts,withGenres:events.filter(x=>!!x.genre).length};
}

export async function buildCatalog({today=dayNow(), sourceDir=process.env.SOURCE_DIR || '.source'}={}) {
  const base = path.resolve(ROOT, sourceDir);
  const source = await import(pathToFileURL(path.join(base,'scripts/sources/podiuminfo.mjs')).href);
  const festivals = await import(pathToFileURL(path.join(base,'scripts/sources/festivalinfo.mjs')).href);
  const windowDays = Math.min(150, Math.max(14, Number(process.env.CATALOG_DAYS || 100)));
  const endDate = plusDays(today, windowDays);
  const festivalEnd = plusDays(today, Math.min(210,windowDays + 70));
  const limit = Math.min(100, Math.max(5, Number(process.env.NEW_ARTISTS_PER_RUN || 35)));

  const cache = await read('data/discovery-cache.json', {day:{entries:{}},concert:{entries:{}},festival:{months:{},editions:{}}});
  cache.day ||= {entries:{}}; cache.day.entries ||= {};
  cache.concert ||= {entries:{}}; cache.concert.entries ||= {};
  cache.festival ||= {months:{},editions:{}};
  const existing = await read('data/events.json', {events:[]});
  const watchlist = await read('data/artist-watchlist.json',{artists:[]});
  const editorial = [...new Set((watchlist.artists || []).filter(x=>typeof x==='string').map(x=>x.trim()).filter(x=>x.length>=2 && x.length<=110))].slice(0, 100);

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

  let festivalEvents=[]; let festivalIncomplete=false;
  try {
    const result = await festivals.discoverFestivals({
      trackedArtistNames:[],festivalQuery:'festival',startDate:today,endDate:festivalEnd,
      countries:['NL','BE'],cache:cache.festival,
      deadline:Date.now()+Math.min(8*60000,Number(process.env.FESTIVAL_TIME_BUDGET_MS || 480000))
    });
    festivalEvents = result.events;
    festivalIncomplete=!!(result.stats.monthsMissing || result.stats.monthsStale || result.stats.editionsFailed);
    console.log('Festivalinfo status:',JSON.stringify(result.stats));
  } catch (error) { festivalIncomplete=true; console.warn(`Festivalinfo unavailable: ${error.message}`); }

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

  // Never mark an unseen day as empty: retain last-good events until expiry.
  const map = new Map();
  for (const event of existing.events || []) {
    if (event && validDate(event.date) && event.date>=today && event.date<=festivalEnd && ['podiuminfo','festivalinfo','official'].includes(event.source)) map.set(event.id,event);
  }
  const maxAge=35*86400000;
  for (const [id, detail] of Object.entries(cache.concert.entries)) {
    if (Date.now()-Date.parse(detail?.cachedAt || '') > maxAge) continue;
    const event = fromPodiuminfo(id,detail,source.detectCountry);
    if(event && event.date>=today && event.date<=endDate)map.set(event.id,event);
  }
  for(const item of festivalEvents){const event=fromFestivalinfo(item);if(event)map.set(event.id,event);}
  for(const item of officialEvents)map.set(item.id,item);
  const missing=first.stats.daysMissing || 0;
  if (missing > Math.ceil(first.stats.daysTotal * 0.2)) throw Error(`Too many Podiuminfo dates unavailable: ${missing}/${first.stats.daysTotal}; previous published feed preserved.`);
  if (!map.size) throw Error('No verified events available yet; previous published feed preserved.');

  // Prune expired cache entries to avoid an ever-growing repository.
  for (const date of Object.keys(cache.day.entries)) if (date<today || date>endDate) delete cache.day.entries[date];
  for (const [id,detail] of Object.entries(cache.concert.entries)) if (detail?.date<today || detail?.date>festivalEnd || !detail?.date) delete cache.concert.entries[id];
  const events=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.artist.localeCompare(b.artist));
  const tags=await read('data/artist-tags.json',{artists:{}});
  const genreStatus=await applyGenreMetadata(events,tags,{limit:Number(process.env.NEW_GENRE_LOOKUPS_PER_RUN || 16)});
  const result={updatedAt:new Date().toISOString(),source:'podiuminfo+festivalinfo',events,
    coverage:{countries:['NL','BE'],daysAhead:windowDays,festivalDaysAhead:Math.min(210,windowDays+70),
      verifiedPodiuminfoEvents:events.filter(x=>x.source==='podiuminfo').length,
      festivalEvents:events.filter(x=>x.source==='festivalinfo').length,officialVenueEvents:events.filter(x=>x.source==='official').length,
      datesUnavailable:missing,festivalIncomplete,genreTaggedEvents:genreStatus.withGenres,
      notes:'Rolling, rate-limited coverage of public Podiuminfo, Festivalinfo, and selected official venue listings. Not complete or instant. Favorite artists are matched privately in your browser; no listening history is needed.'}};
  await write('data/discovery-cache.json',cache);
  await write('data/artist-tags.json',tags);
  await write('data/events.json',result);
  console.log(`Published ${events.length} verified concerts/festivals. Concert sources: Podiuminfo, Festivalinfo and official venues; no Ticketmaster or Last.fm.`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  buildCatalog().catch(error=>{console.error(error);process.exitCode=1;});
}
