export const GENRES=['Rock','Metal','Post-Rock','Indie','Alternative','Punk','Electronic','Jazz','Classical','Hip-Hop','Pop','Reggae','Stoner / Doom','Psychedelic','Folk','Experimental','Ambient'];
export const COUNTRIES=[{code:'NL',name:'Netherlands'},{code:'BE',name:'Belgium'},{code:'DE',name:'Germany'},{code:'GR',name:'Greece'},{code:'GB',name:'United Kingdom'},{code:'FR',name:'France'},{code:'ES',name:'Spain'},{code:'IT',name:'Italy'},{code:'US',name:'United States'},{code:'AU',name:'Australia'}];
export const norm = value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const dateToday=()=>{const d=new Date();const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;};
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
const genreTerms={
  'Rock':['rock'], 'Metal':['metal','hard rock','heavy metal'], 'Post-Rock':['post rock','postrock'], 'Indie':['indie'],
  'Alternative':['alternative','alt rock'], 'Punk':['punk'], 'Electronic':['electronic','dance','edm','techno','house','trance','electro'],
  'Jazz':['jazz','blues'], 'Classical':['classical','orchestra','symphonic'], 'Hip-Hop':['hip hop','rap'],
  'Pop':['pop'], 'Reggae':['reggae','ska','dub'], 'Stoner / Doom':['stoner','doom','desert rock','sludge'],
  'Psychedelic':['psychedelic','psych rock'], 'Folk':['folk','acoustic','americana'],
  'Experimental':['experimental','avant garde'], 'Ambient':['ambient','drone']
};
// Only explicit words in a public concert/festival title can be used when
// reliable artist-level genre metadata is not yet available. This is a hint,
// not a verified genre classification of the performer's music.
export function titleGenreHints(value){
  const title=' '+norm(value)+' ';
  if(!title.trim())return [];
  const words=[
    ['Post-Rock',['post rock','postrock']],
    ['Stoner / Doom',['stoner','doom','sludge','desert rock']],
    ['Jazz',['jazz','bebop','jazzfusion']],
    ['Metal',['metal','deathfest','death metal','black metal']],
    ['Reggae',['reggae','dub','ska']],
    ['Punk',['punk']],
    ['Electronic',['techno','electronic','rave','trance','house music']],
    ['Classical',['classical','symphony','symphonic']],
    ['Psychedelic',['psychedelic','psych rock']],
    ['Ambient',['ambient','drone music']],
    ['Experimental',['experimental','avant garde']],
    ['Hip-Hop',['hip hop','hiphop','rap']],
    ['Folk',['folk']],
    ['Indie',['indie']],
    ['Alternative',['alternative']],
    ['Rock',['rock']],
    ['Pop',['pop']]
  ];
  return words.filter(([,terms])=>terms.some(term=>title.includes(' '+term+' ')))
    .map(([genre])=>genre);
}

export function normalizeEvent(input){
  if(!input||typeof input!=='object')return null;
  const artist=String(input.artist||input.name||'').trim().slice(0,200);
  const date=String(input.date||'').slice(0,10);
  if(!artist||!date)return null;
  const id=String(input.id||`${artist}-${date}-${input.venue||''}`).slice(0,250);
  const artists=Array.isArray(input.artists)?input.artists.filter(x=>typeof x==='string').slice(0,250):[];
  const genreFromFeed=String(input.genre||'').trim().slice(0,100);
  const titleHints=genreFromFeed?[]:titleGenreHints(artist);
  const genre=genreFromFeed||titleHints.join(' / ');
  const genreEvidence=genreFromFeed?'metadata':titleHints.length?'title-cue':'';
  return {id,artist,artists,date,venue:String(input.venue||'').slice(0,150),city:String(input.city||'').slice(0,120),country:String(input.country||'').toUpperCase().slice(0,2),genre,genreEvidence:input.genreEvidence||genreEvidence,subgenre:String(input.subgenre||'').slice(0,100),url:safeUrl(input.url)||'',image:safeUrl(input.image)||'',source:String(input.source||'manual').slice(0,60)};
}
function artistMatch(event,wanted) {
  const names=[event.artist,...(event.artists||[])].map(norm).filter(Boolean);
  const title=norm(event.artist);
  return wanted.some(a=>{
    const key=norm(a);
    return key.length>=2&&(names.includes(key) ||
      title.split(' with ').includes(key) ||
      title.split(' and ').includes(key) ||
      (title.startsWith(key+' ') && event.source==='podiuminfo-agenda'));
  });
}
function metadataGenres(artist,tags) {
  const entry=tags?.artists?.[norm(artist)]||tags?.[norm(artist)];
  return Array.isArray(entry?.genres)?entry.genres.filter(g=>GENRES.includes(g)):[];
}
function matchingGenres(available,wanted) {
  const text=' '+norm(available.join(' '))+' ';
  return wanted.filter(g=>{
    if(!GENRES.includes(g))return false;
    const exact=available.some(a=>norm(a)===norm(g));
    if(exact)return true;
    return (genreTerms[g]||[]).some(term=>text.includes(' '+norm(term)+' '));
  });
}
const NICHE_SIMILAR=new Set(['Post-Rock','Stoner / Doom','Psychedelic','Experimental','Ambient','Jazz','Reggae','Classical','Folk','Punk']);
const COMMON_SIMILAR=new Set(['Rock','Pop','Metal','Indie','Alternative','Electronic','Hip-Hop']);

/**
 * Discover ONLY evidence-backed music matches.
 * Similar = shared distinctive artist metadata, never merely the same venue,
 * town or an unverified word in an event title.
 */
export function recommendEvent(event,profile,artistTags={}) {
  if(!event||!profile||!profile.country||event.country!==profile.country)return null;
  const favorites=Array.isArray(profile.artists)?profile.artists:[];
  const genresWanted=Array.isArray(profile.genres)?profile.genres.filter(g=>GENRES.includes(g)):[];
  const names=[event.artist,...(event.artists||[])].filter(x=>typeof x==='string').slice(0,250);
  const exact=artistMatch(event,favorites);
  const exactName=names.find(a=>favorites.some(f=>norm(f)===norm(a))) ||
    (exact?event.artist:null);
  // Tag each performer independently; festival bills often contain many genres.
  const observed=[];
  for(const name of names) {
    const genres=metadataGenres(name,artistTags);
    if(genres.length)observed.push({name,genres});
  }
  const feedGenres=event.genreEvidence==='title-cue'?[]:String(event.genre||'').split(/\s+\/\s+/).filter(x=>GENRES.includes(x));
  const titleHints=event.genreEvidence==='title-cue'?titleGenreHints(event.artist):[];
  const sources=observed.length?observed: [{name:event.artist,genres:feedGenres}];
  const matches=[];
  for(const item of sources) {
    const overlap=matchingGenres(item.genres,genresWanted);
    if(overlap.length)matches.push({name:item.name,genres:overlap});
  }
  if(!matches.length&&titleHints.length) {
    const overlap=matchingGenres(titleHints,genresWanted);
    if(overlap.length)matches.push({name:event.artist,genres:overlap,title:true});
  }

  const sameCity=norm(event.city)===norm(profile.city)&&!!norm(profile.city);
  const cityBonus=sameCity?12:0;
  if(exact) {
    return {kind:'favorite',score:150+cityBonus,
      reason:'Favorite artist'+(exactName?': '+exactName:''),
      matchedArtist:exactName||event.artist,genres:[]};
  }

  // The user may select only favorite artists. Find comparable artists in
  // the confirmed shared music-tag space, without calling them similar if
  // all we know is the generic category Rock/Pop/Metal.
  const seedTags=new Map();
  for(const artist of favorites)for(const genre of metadataGenres(artist,artistTags)) {
    if(!seedTags.has(genre))seedTags.set(genre,artist);
  }
  let closest=null;
  for(const item of observed) {
    const shared=item.genres.filter(g=>seedTags.has(g));
    const niche=shared.filter(g=>NICHE_SIMILAR.has(g));
    const broad=shared.filter(g=>COMMON_SIMILAR.has(g));
    if(!niche.length && broad.length<2)continue;
    const score=niche.length*22+broad.length*5;
    if(!closest || score>closest.score)closest={score,artist:item.name,shared,seed:seedTags.get(niche[0]||broad[0])};
  }
  if(closest) {
    return {kind:'similar',score:95+closest.score+cityBonus,
      reason:'Related to '+closest.seed+' · shared '+closest.shared.slice(0,2).join(' / '),
      matchedArtist:closest.artist,genres:closest.shared};
  }
  if(matches.length) {
    const best=matches.sort((a,b)=>b.genres.length-a.genres.length)[0];
    return {kind:'genre',score:65+best.genres.length*8+cityBonus,
      reason:(best.title?'Event title suggests ':'Matches your ')+best.genres.join(' / ')+
        (best.title?' · check source':best.name!==event.artist?' · '+best.name:''),
      matchedArtist:best.name,genres:best.genres};
  }
  return null;
}

export function rankEvent(event,profile,artistTags={}) {
  return recommendEvent(event,profile,artistTags)?.score||0;
}
export function matchReason(event,profile,artistTags={}) {
  return recommendEvent(event,profile,artistTags)?.reason||'';
}
