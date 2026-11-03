import {norm,cityKey,recommendEvent,normalizeEvent,dateToday,GENRES} from './model.js?v=swipe-friends-v3';

/**
 * Curated starting palette for the onboarding experience.
 * Taste suggestions are editorial examples, never inferred listening data.
 * Nothing here is a concert booking or event announcement.
 */
export const NICHE_BY_GENRE={
  'Rock':['Hard Rock','Progressive Rock','Psychedelic Rock','Garage Rock','Blues Rock','Art Rock','Post-Rock','Desert Rock','Shoegaze'],
  'Metal':['Doom Metal','Stoner Metal','Sludge Metal','Post-Metal','Progressive Metal','Thrash Metal','Death Metal','Black Metal','Atmospheric Black Metal','Blackgaze','Grindcore','Metalcore','Industrial Metal'],
  'Post-Rock':['Cinematic Post-Rock','Instrumental Post-Rock','Post-Metal','Math Rock','Ambient Rock','Shoegaze','Neo-Classical','Blackgaze'],
  'Indie':['Indie Rock','Dream Pop','Shoegaze','Post-Punk','Art Rock','Indie Folk','Lo-Fi','Indie Pop'],
  'Alternative':['Alternative Rock','Post-Punk','Shoegaze','Grunge','Darkwave','Trip-Hop','Art Rock','Noise Rock','Dream Pop'],
  'Punk':['Post-Punk','Hardcore Punk','Crust Punk','D-Beat','Garage Punk','Noise Rock','Post-Hardcore','Anarcho-Punk'],
  'Electronic':['Synthwave','Dark Synth','Techno','House','IDM','Downtempo','Trip-Hop','Ambient Electronic','Industrial','Drum and Bass','Breakbeat'],
  'Jazz':['Spiritual Jazz','Jazz Fusion','Nu Jazz','Jazz Funk','Free Jazz','Bebop','Contemporary Jazz','Afro-Jazz','Acid Jazz'],
  'Classical':['Neo-Classical','Modern Classical','Minimalism','Contemporary Classical','Film Score','Chamber Music','Piano'],
  'Hip-Hop':['Alternative Hip-Hop','Conscious Hip-Hop','Experimental Hip-Hop','Boom Bap','Jazz Rap','Trip-Hop','UK Hip-Hop'],
  'Pop':['Art Pop','Dream Pop','Synthpop','Indie Pop','Electropop','Chamber Pop','Dark Pop'],
  'Reggae':['Roots Reggae','Dub','Ska','Dancehall','Rocksteady','Reggae Fusion'],
  'Stoner / Doom':['Stoner Rock','Desert Rock','Doom Metal','Stoner Metal','Sludge Metal','Psychedelic Rock','Heavy Psych','Drone Metal'],
  'Psychedelic':['Psychedelic Rock','Heavy Psych','Neo-Psychedelia','Krautrock','Space Rock','Psychedelic Folk','Desert Rock'],
  'Folk':['Indie Folk','Dark Folk','Neo-Folk','Psych Folk','Singer-Songwriter','Americana','Traditional Folk'],
  'Experimental':['Noise Rock','Drone','Art Rock','Avant-Garde','Post-Metal','IDM','Industrial','Minimalism'],
  'Ambient':['Dark Ambient','Ambient Electronic','Drone','Ambient Rock','Neo-Classical','Soundscape','Downtempo'],
  'Metalcore':['Melodic Metalcore','Progressive Metalcore','Djent','Post-Hardcore','Electronicore','Nu Metalcore','Alternative Metal'],
  'Deathcore':['Symphonic Deathcore','Technical Deathcore','Blackened Deathcore','Death Metal','Djent'],
  'Hardcore':['Hardcore Punk','Beatdown Hardcore','Melodic Hardcore','Post-Hardcore','Metalcore','Screamo'],
  'Pop-Punk':['Pop Punk','Emo','Easycore','Alternative Rock','Post-Hardcore','Emo Pop','Power Pop'],
  'R&B / Soul':['Neo-Soul','Contemporary R&B','Alternative R&B','Soul','Funk','Quiet Storm'],
  'Blues':['Blues Rock','Electric Blues','Delta Blues','Chicago Blues','Soul Blues','Psychedelic Blues'],
  'Funk / Disco':['Disco','Nu-Disco','Funk Rock','Jazz Funk','P-Funk','Electro Funk'],
  'Country':['Modern Country','Outlaw Country','Americana','Alt-Country','Bluegrass','Country Pop'],
  'Latin':['Reggaeton','Latin Trap','Latin Pop','Salsa','Bachata','Latin Rock','Regional Mexican'],
  'K-Pop':['K-Pop','K-R&B','K-Hip-Hop','Dance Pop','Synthpop','K-Rock'],
  'Afrobeats':['Afrobeats','Afropop','Amapiano','Afroswing','Afro-Fusion','Highlife']
};
// Each tuple: artist, broad musical genres, stylistic subgenres. These are
// approximate editorial associations, not streaming-service similarity scores.
const SEED_ROWS=[
 ['MONO','Post-Rock','Cinematic Post-Rock|Instrumental Post-Rock'],
 ['Godspeed You! Black Emperor','Post-Rock|Experimental','Cinematic Post-Rock|Drone'],
 ['Explosions in the Sky','Post-Rock','Instrumental Post-Rock|Cinematic Post-Rock'],
 ['Mogwai','Post-Rock|Alternative','Post-Rock|Noise Rock'],
 ['Caspian','Post-Rock','Instrumental Post-Rock|Cinematic Post-Rock'],
 ['We Lost the Sea','Post-Rock','Cinematic Post-Rock|Instrumental Post-Rock'],
 ['This Will Destroy You','Post-Rock|Ambient','Ambient Rock|Instrumental Post-Rock'],
 ['Sigur Rós','Post-Rock|Ambient','Ambient Rock|Cinematic Post-Rock'],
 ['Russian Circles','Post-Rock|Metal','Post-Metal|Instrumental Post-Rock'],
 ['Amenra','Metal|Post-Rock','Post-Metal|Sludge Metal'],
 ['Cult of Luna','Metal|Post-Rock','Post-Metal|Sludge Metal'],
 ['The Ocean','Metal|Post-Rock','Post-Metal|Progressive Metal'],
 ['Psychonaut','Metal|Post-Rock','Post-Metal|Progressive Metal'],
 ['Isis','Metal|Post-Rock','Post-Metal|Sludge Metal'],
 ['Neurosis','Metal|Experimental','Post-Metal|Sludge Metal'],
 ['Alcest','Metal|Post-Rock','Blackgaze|Shoegaze'],
 ['Sólstafir','Metal|Post-Rock|Psychedelic','Atmospheric Black Metal|Post-Metal'],
 ['Deafheaven','Metal|Post-Rock','Blackgaze|Shoegaze'],
 ['Paradise Lost','Metal|Stoner / Doom','Doom Metal|Gothic Metal'],
 ['My Dying Bride','Metal|Stoner / Doom','Doom Metal'],
 ['Candlemass','Metal|Stoner / Doom','Doom Metal'],
 ['Pallbearer','Metal|Stoner / Doom','Doom Metal'],
 ['YOB','Metal|Stoner / Doom','Doom Metal|Stoner Metal'],
 ['Warning','Metal|Stoner / Doom','Doom Metal'],
 ['Electric Wizard','Metal|Stoner / Doom','Doom Metal|Stoner Metal'],
 ['Sleep','Metal|Stoner / Doom','Stoner Metal|Drone Metal'],
 ['Kyuss','Rock|Stoner / Doom','Desert Rock|Stoner Rock'],
 ['Queens of the Stone Age','Rock|Alternative|Stoner / Doom','Desert Rock|Alternative Rock'],
 ['Elder','Rock|Stoner / Doom|Psychedelic','Stoner Rock|Heavy Psych|Progressive Rock'],
 ['All Them Witches','Rock|Psychedelic|Stoner / Doom','Blues Rock|Heavy Psych|Stoner Rock'],
 ['Colour Haze','Rock|Psychedelic|Stoner / Doom','Heavy Psych|Stoner Rock'],
 ['King Buffalo','Rock|Psychedelic|Stoner / Doom','Heavy Psych|Stoner Rock'],
 ['Witchcraft','Rock|Stoner / Doom','Stoner Rock|Heavy Psych'],
 ['Kreator','Metal','Thrash Metal'],
 ['Overkill','Metal','Thrash Metal'],
 ['Testament','Metal','Thrash Metal'],
 ['Slayer','Metal','Thrash Metal'],
 ['Nile','Metal','Death Metal'],
 ['Blood Incantation','Metal','Death Metal|Progressive Metal'],
 ['Gojira','Metal','Death Metal|Progressive Metal'],
 ['Cannibal Corpse','Metal','Death Metal'],
 ['Napalm Death','Metal|Punk','Grindcore'],
 ['Mgła','Metal','Black Metal'],
 ['Wolves in the Throne Room','Metal','Atmospheric Black Metal'],
 ['Emperor','Metal','Black Metal'],
 ['Darkthrone','Metal','Black Metal'],
 ['Tool','Metal|Rock','Progressive Metal|Progressive Rock'],
 ['Opeth','Metal|Rock','Progressive Metal|Progressive Rock'],
 ['Leprous','Metal|Rock','Progressive Metal|Progressive Rock'],
 ['SOEN','Metal|Rock','Progressive Metal|Progressive Rock'],
 ['Haken','Metal|Rock','Progressive Metal|Progressive Rock'],
 ['Riverside','Rock','Progressive Rock'],
 ['Converge','Metal|Punk','Metalcore|Hardcore Punk'],
 ['Architects','Metal','Metalcore'],
 ['Spiritbox','Metal','Metalcore'],
 ['Discharge','Punk|Metal','D-Beat|Crust Punk'],
 ['IDLES','Punk|Alternative','Post-Punk|Noise Rock'],
 ['Fontaines D.C.','Punk|Indie|Alternative','Post-Punk|Indie Rock'],
 ['Amyl and the Sniffers','Punk|Rock','Garage Punk'],
 ['Viagra Boys','Punk|Alternative','Post-Punk|Art Rock'],
 ['Sleaford Mods','Punk|Electronic','Post-Punk|Experimental Hip-Hop'],
 ['Bad Brains','Punk|Reggae','Hardcore Punk|Roots Reggae'],
 ['Dead Kennedys','Punk','Hardcore Punk'],
 ['Fugazi','Punk|Alternative','Post-Hardcore|Art Rock'],
 ['The Cure','Alternative|Indie','Post-Punk|Darkwave'],
 ['Joy Division','Alternative|Punk','Post-Punk|Darkwave'],
 ['New Order','Alternative|Electronic','Post-Punk|Synthpop'],
 ['Slowdive','Indie|Alternative','Shoegaze|Dream Pop'],
 ['My Bloody Valentine','Indie|Alternative','Shoegaze|Noise Rock'],
 ['Beach House','Indie|Pop','Dream Pop|Indie Pop'],
 ['Radiohead','Alternative|Rock|Experimental','Art Rock|Alternative Rock'],
 ['The National','Indie|Alternative','Indie Rock|Art Rock'],
 ['Chelsea Wolfe','Alternative|Experimental|Folk','Dark Folk|Darkwave'],
 ['PJ Harvey','Alternative|Rock','Alternative Rock|Art Rock'],
 ['Carpenter Brut','Electronic','Dark Synth|Synthwave'],
 ['Perturbator','Electronic','Dark Synth|Synthwave'],
 ['Justice','Electronic','House|Electro'],
 ['Moderat','Electronic','Downtempo|Techno'],
 ['Jon Hopkins','Electronic|Ambient','Ambient Electronic|Techno'],
 ['Bonobo','Electronic','Downtempo|Trip-Hop'],
 ['Boards of Canada','Electronic|Ambient','IDM|Ambient Electronic'],
 ['Aphex Twin','Electronic|Experimental','IDM|Ambient Electronic'],
 ['Bicep','Electronic','House|Breakbeat'],
 ['Floating Points','Electronic|Jazz','House|Nu Jazz'],
 ['Massive Attack','Electronic|Alternative','Trip-Hop|Downtempo'],
 ['Portishead','Electronic|Alternative','Trip-Hop|Dark Pop'],
 ['Kraftwerk','Electronic','Synthpop|Krautrock'],
 ['HEALTH','Electronic|Alternative','Industrial|Noise Rock'],
 ['Yussef Dayes','Jazz','Contemporary Jazz|Jazz Fusion'],
 ['Kamasi Washington','Jazz','Spiritual Jazz|Contemporary Jazz'],
 ['Ezra Collective','Jazz','Afro-Jazz|Nu Jazz'],
 ['Nubya Garcia','Jazz','Spiritual Jazz|Contemporary Jazz'],
 ['BADBADNOTGOOD','Jazz','Nu Jazz|Jazz Fusion'],
 ['GoGo Penguin','Jazz|Electronic','Contemporary Jazz|Nu Jazz'],
 ['Snarky Puppy','Jazz','Jazz Fusion|Jazz Funk'],
 ['New Cool Collective','Jazz','Jazz Funk|Acid Jazz'],
 ['John Coltrane','Jazz','Spiritual Jazz|Bebop'],
 ['Miles Davis','Jazz','Jazz Fusion|Bebop'],
 ['Ólafur Arnalds','Classical|Ambient','Neo-Classical|Soundscape'],
 ['Max Richter','Classical|Ambient','Modern Classical|Film Score'],
 ['Nils Frahm','Classical|Electronic|Ambient','Neo-Classical|Ambient Electronic'],
 ['Hania Rani','Classical|Ambient','Neo-Classical|Piano'],
 ['Philip Glass','Classical','Minimalism|Contemporary Classical'],
 ['Arvo Pärt','Classical','Minimalism|Chamber Music'],
 ['Björk','Pop|Experimental|Electronic','Art Pop|Avant-Garde'],
 ['FKA twigs','Pop|Electronic|Experimental','Art Pop|Electropop'],
 ['Caroline Polachek','Pop|Alternative','Art Pop|Synthpop'],
 ['Florence + the Machine','Pop|Indie','Art Pop|Indie Pop'],
 ['Charli xcx','Pop|Electronic','Electropop|Synthpop'],
 ['King Gizzard & the Lizard Wizard','Psychedelic|Rock','Psychedelic Rock|Krautrock'],
 ['Tame Impala','Psychedelic|Pop|Rock','Neo-Psychedelia|Psychedelic Rock'],
 ['Kikagaku Moyo','Psychedelic|Rock','Psychedelic Rock|Psych Folk'],
 ['The Black Angels','Psychedelic|Rock','Neo-Psychedelia|Psychedelic Rock'],
 ['Wooden Shjips','Psychedelic|Rock','Psychedelic Rock|Krautrock'],
 ['Swans','Experimental|Rock','Noise Rock|Drone'],
 ['Sunn O)))','Experimental|Metal','Drone Metal|Drone'],
 ['Oneohtrix Point Never','Experimental|Electronic','Avant-Garde|IDM'],
 ['Arca','Experimental|Electronic','Avant-Garde|Art Pop'],
 ['Brian Eno','Ambient|Electronic','Ambient Electronic|Soundscape'],
 ['Tim Hecker','Ambient|Experimental','Dark Ambient|Drone'],
 ['Stars of the Lid','Ambient','Drone|Soundscape'],
 ['William Basinski','Ambient|Experimental','Dark Ambient|Minimalism'],
 ['Biosphere','Ambient|Electronic','Ambient Electronic|Soundscape'],
 ['Groundation','Reggae','Roots Reggae|Dub'],
 ['Protoje','Reggae','Roots Reggae|Dancehall'],
 ['Kabaka Pyramid','Reggae','Roots Reggae|Reggae Fusion'],
 ['Chronixx','Reggae','Roots Reggae'],
 ['The Skatalites','Reggae','Ska|Rocksteady'],
 ['Kendrick Lamar','Hip-Hop','Conscious Hip-Hop|Alternative Hip-Hop'],
 ['Little Simz','Hip-Hop','UK Hip-Hop|Alternative Hip-Hop'],
 ['A Tribe Called Quest','Hip-Hop|Jazz','Jazz Rap|Boom Bap'],
 ['Run the Jewels','Hip-Hop','Alternative Hip-Hop|Boom Bap'],
 ['MF DOOM','Hip-Hop','Boom Bap|Alternative Hip-Hop'],
 ['Fleet Foxes','Folk|Indie','Indie Folk|Chamber Pop'],
 ['Nick Drake','Folk','Singer-Songwriter|Dark Folk'],
 ['Agnes Obel','Folk|Classical','Dark Folk|Neo-Classical'],
 ['José González','Folk|Indie','Singer-Songwriter|Indie Folk'],
 ['Arooj Aftab','Folk|Jazz','Dark Folk|Contemporary Jazz']
,
 ["Bring Me the Horizon","Metalcore|Alternative|Rock","Metalcore|Alternative Metal|Post-Hardcore"],
 ["Parkway Drive","Metalcore|Metal","Melodic Metalcore"],
 ["Killswitch Engage","Metalcore|Metal","Melodic Metalcore"],
 ["Bullet for My Valentine","Metalcore|Metal","Melodic Metalcore"],
 ["Trivium","Metalcore|Metal","Melodic Metalcore|Thrash Metal"],
 ["Bad Omens","Metalcore|Alternative","Metalcore|Alternative Metal"],
 ["Sleep Token","Metalcore|Alternative|Pop","Alternative Metal|Progressive Metalcore"],
 ["Beartooth","Metalcore|Rock","Metalcore|Post-Hardcore"],
 ["Electric Callboy","Metalcore|Electronic","Electronicore|Metalcore"],
 ["I Prevail","Metalcore|Alternative","Metalcore|Alternative Metal"],
 ["Wage War","Metalcore","Melodic Metalcore"],
 ["Polaris","Metalcore","Progressive Metalcore"],
 ["ERRA","Metalcore|Metal","Progressive Metalcore|Djent"],
 ["Invent Animate","Metalcore","Progressive Metalcore|Djent"],
 ["Northlane","Metalcore|Electronic","Progressive Metalcore|Djent"],
 ["Jinjer","Metalcore|Metal","Progressive Metalcore|Djent"],
 ["Loathe","Metalcore|Alternative","Nu Metalcore|Shoegaze"],
 ["As I Lay Dying","Metalcore|Metal","Melodic Metalcore"],
 ["August Burns Red","Metalcore","Melodic Metalcore"],
 ["While She Sleeps","Metalcore","Melodic Metalcore"],
 ["Motionless in White","Metalcore|Metal","Metalcore|Industrial Metal"],
 ["Knocked Loose","Metalcore|Hardcore","Metalcore|Beatdown Hardcore"],
 ["Turnstile","Hardcore|Alternative","Hardcore Punk|Alternative Rock"],
 ["Hatebreed","Hardcore|Metalcore","Beatdown Hardcore|Metalcore"],
 ["Terror","Hardcore","Hardcore Punk|Beatdown Hardcore"],
 ["Comeback Kid","Hardcore","Melodic Hardcore"],
 ["Lorna Shore","Deathcore|Metal","Symphonic Deathcore|Blackened Deathcore"],
 ["Whitechapel","Deathcore|Metal","Deathcore|Technical Deathcore"],
 ["Thy Art Is Murder","Deathcore|Metal","Deathcore"],
 ["Shadow of Intent","Deathcore|Metal","Symphonic Deathcore|Technical Deathcore"],
 ["Slaughter to Prevail","Deathcore|Metal","Deathcore"],
 ["Chelsea Grin","Deathcore|Metal","Deathcore"],
 ["Suicide Silence","Deathcore|Metal","Deathcore"],
 ["Green Day","Pop-Punk|Rock|Punk","Pop Punk|Alternative Rock"],
 ["blink-182","Pop-Punk|Punk","Pop Punk"],
 ["Sum 41","Pop-Punk|Rock","Pop Punk|Alternative Rock"],
 ["Paramore","Pop-Punk|Alternative|Pop","Pop Punk|Alternative Rock"],
 ["Fall Out Boy","Pop-Punk|Pop","Pop Punk|Emo Pop"],
 ["My Chemical Romance","Pop-Punk|Alternative|Rock","Emo|Alternative Rock"],
 ["All Time Low","Pop-Punk|Pop","Pop Punk|Emo Pop"],
 ["Neck Deep","Pop-Punk","Pop Punk"],
 ["The Story So Far","Pop-Punk","Pop Punk"],
 ["New Found Glory","Pop-Punk","Pop Punk"],
 ["A Day to Remember","Pop-Punk|Metalcore","Easycore|Melodic Metalcore"],
 ["Linkin Park","Alternative|Rock|Metal","Alternative Metal|Alternative Rock"],
 ["Muse","Rock|Alternative|Electronic","Progressive Rock|Alternative Rock"]
,
 ["Coldplay","Pop|Rock","Pop Rock|Alternative Rock"],
 ["Imagine Dragons","Pop|Rock|Alternative","Pop Rock|Alternative Rock"],
 ["Twenty One Pilots","Alternative|Pop|Hip-Hop","Alternative Rock|Electropop"],
 ["Taylor Swift","Pop|Country","Country Pop|Art Pop"],
 ["Dua Lipa","Pop|Funk / Disco","Dance Pop|Nu-Disco"],
 ["Billie Eilish","Pop|Alternative","Dark Pop|Electropop"],
 ["Ariana Grande","Pop|R&B / Soul","Dance Pop|Contemporary R&B"],
 ["The Weeknd","Pop|R&B / Soul","Alternative R&B|Synthpop"],
 ["Harry Styles","Pop|Rock","Pop Rock|Art Pop"],
 ["Olivia Rodrigo","Pop|Rock|Alternative","Pop Rock|Alternative Rock"],
 ["Ed Sheeran","Pop|Folk","Singer-Songwriter|Pop Rock"],
 ["Lady Gaga","Pop|Electronic","Dance Pop|Electropop"],
 ["Sabrina Carpenter","Pop","Dance Pop|Pop"],
 ["Chappell Roan","Pop|Alternative","Synthpop|Art Pop"],
 ["Miley Cyrus","Pop|Rock","Pop Rock|Alternative Rock"],
 ["Rihanna","Pop|R&B / Soul","Contemporary R&B|Dance Pop"],
 ["Beyoncé","Pop|R&B / Soul|Country","Contemporary R&B|Country Pop"],
 ["Bruno Mars","Pop|Funk / Disco|R&B / Soul","Soul|Funk"],
 ["Drake","Hip-Hop|R&B / Soul","Contemporary R&B|Alternative Hip-Hop"],
 ["Travis Scott","Hip-Hop","Trap|Alternative Hip-Hop"],
 ["J. Cole","Hip-Hop","Conscious Hip-Hop"],
 ["Tyler, the Creator","Hip-Hop|Alternative","Alternative Hip-Hop|Art Pop"],
 ["Doja Cat","Hip-Hop|Pop|R&B / Soul","Alternative Hip-Hop|Contemporary R&B"],
 ["Eminem","Hip-Hop","Boom Bap|Conscious Hip-Hop"],
 ["Nas","Hip-Hop","Boom Bap|Conscious Hip-Hop"],
 ["SZA","R&B / Soul|Pop","Alternative R&B|Neo-Soul"],
 ["Frank Ocean","R&B / Soul|Pop","Alternative R&B|Neo-Soul"],
 ["The Internet","R&B / Soul","Neo-Soul|Alternative R&B"],
 ["H.E.R.","R&B / Soul","Contemporary R&B|Neo-Soul"],
 ["Alicia Keys","R&B / Soul|Pop","Soul|Contemporary R&B"],
 ["Anderson .Paak","R&B / Soul|Hip-Hop|Funk / Disco","Neo-Soul|Funk"],
 ["Erykah Badu","R&B / Soul","Neo-Soul|Soul"],
 ["D'Angelo","R&B / Soul|Funk / Disco","Neo-Soul|Funk"],
 ["Lauryn Hill","R&B / Soul|Hip-Hop","Neo-Soul|Conscious Hip-Hop"],
 ["Jamiroquai","Funk / Disco|Pop","Funk|Acid Jazz"],
 ["Vulfpeck","Funk / Disco","Funk|Jazz Funk"],
 ["Parcels","Funk / Disco|Indie","Nu-Disco|Indie Pop"],
 ["Jungle","Funk / Disco|Electronic","Nu-Disco|Soul"],
 ["Daft Punk","Funk / Disco|Electronic","House|Nu-Disco"],
 ["CHIC","Funk / Disco","Disco|Funk"],
 ["Gary Clark Jr.","Blues|Rock","Blues Rock|Electric Blues"],
 ["Joe Bonamassa","Blues|Rock","Blues Rock|Electric Blues"],
 ["John Mayer","Blues|Pop|Rock","Blues Rock|Singer-Songwriter"],
 ["B.B. King","Blues","Electric Blues|Chicago Blues"],
 ["Tedeschi Trucks Band","Blues|Rock|Funk / Disco","Blues Rock|Soul Blues"],
 ["The Black Keys","Blues|Rock","Blues Rock|Garage Rock"]
,
 ["Chris Stapleton","Country|Blues","Modern Country|Country Rock"],
 ["Kacey Musgraves","Country|Pop","Country Pop|Americana"],
 ["Zach Bryan","Country|Folk","Americana|Alt-Country"],
 ["Morgan Wallen","Country|Pop","Modern Country|Country Pop"],
 ["Dolly Parton","Country","Modern Country|Bluegrass"],
 ["Tyler Childers","Country|Folk","Americana|Alt-Country"],
 ["Bad Bunny","Latin|Pop|Hip-Hop","Reggaeton|Latin Trap"],
 ["Rosalía","Latin|Pop|Experimental","Latin Pop|Avant-Garde"],
 ["J Balvin","Latin|Pop","Reggaeton|Latin Pop"],
 ["Karol G","Latin|Pop","Reggaeton|Latin Pop"],
 ["Rauw Alejandro","Latin|Pop","Reggaeton|Latin Pop"],
 ["Shakira","Latin|Pop","Latin Pop|Latin Rock"],
 ["Feid","Latin|Pop","Reggaeton"],
 ["Peso Pluma","Latin","Regional Mexican"],
 ["Anitta","Latin|Pop","Reggaeton|Latin Pop"],
 ["BTS","K-Pop|Pop","K-Pop|Dance Pop"],
 ["BLACKPINK","K-Pop|Pop","K-Pop|Dance Pop"],
 ["Stray Kids","K-Pop|Hip-Hop","K-Pop|K-Hip-Hop"],
 ["TWICE","K-Pop|Pop","K-Pop|Dance Pop"],
 ["SEVENTEEN","K-Pop|Pop","K-Pop|Dance Pop"],
 ["aespa","K-Pop|Pop","K-Pop|Synthpop"],
 ["EXO","K-Pop|Pop","K-Pop|Dance Pop"],
 ["LE SSERAFIM","K-Pop|Pop","K-Pop|Dance Pop"],
 ["IVE","K-Pop|Pop","K-Pop|Dance Pop"],
 ["Burna Boy","Afrobeats|Pop","Afrobeats|Afro-Fusion"],
 ["Wizkid","Afrobeats|Pop","Afrobeats|Afropop"],
 ["Tems","Afrobeats|R&B / Soul","Afro-R&B|Afrobeats"],
 ["Rema","Afrobeats|Pop","Afrobeats|Afropop"],
 ["Ayra Starr","Afrobeats|Pop","Afrobeats|Afropop"],
 ["Asake","Afrobeats|Hip-Hop","Afrobeats|Amapiano"],
 ["Davido","Afrobeats|Pop","Afrobeats|Afropop"],
 ["Tyla","Afrobeats|R&B / Soul","Afrobeats|Amapiano"]
];
export const TASTE_BANDS=SEED_ROWS.map(([name,genres,styles])=>({
  name,genres:genres.split('|'),styles:styles.split('|')
}));
export const ALL_SUBGENRES=[...new Set([...Object.values(NICHE_BY_GENRE).flat(),...TASTE_BANDS.flatMap(b=>b.styles)])].sort();
export function suggestedNiches(genres=[]){
  const selected=genres.filter(g=>GENRES.includes(g));
  const scores=new Map();
  for(const genre of selected)for(const [i,style] of (NICHE_BY_GENRE[genre]||[]).entries()){
    const current=scores.get(style)||0;
    scores.set(style,current+Math.max(3,10-Math.floor(i/2)));
  }
  // Include a small adjacent-style set, where associations are supported
  // by artists with overlapping broad genres (e.g. metal + post-rock).
  for(const band of TASTE_BANDS){
    const shared=band.genres.filter(g=>selected.includes(g)).length;
    if(!shared)continue;
    for(const style of band.styles){
      if(!scores.has(style))scores.set(style,Math.min(3,shared+1));
    }
  }
  return [...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
    .slice(0,44).map(([name,score])=>({name,score,artists:TASTE_BANDS.filter(b=>b.styles.includes(name)).slice(0,3).map(b=>b.name)}));
}
export function suggestTasteBands(profile={},events=[],max=36,metadata={artists:{}}) {
  const wantedGenres=new Set((profile.genres||[]).filter(g=>GENRES.includes(g)));
  const wantedStyles=new Set(profile.subgenres||[]);
  const selected=new Set((profile.artists||[]).map(norm));
  const current=dateToday();
  const future=(events||[]).filter(e=>e?.country===profile.country&&e.date>=current);
  const upcoming=new Map();
  const candidates=new Map(TASTE_BANDS.map(b=>[norm(b.name),{...b}]));
  const favoriteStyles=new Set();
  for(const a of (profile.artists||[])){
    const detail=candidates.get(norm(a));
    for(const style of detail?.styles||[])favoriteStyles.add(norm(style));
    const extra=metadata?.artists?.[norm(a)];
    for(const style of extra?.subgenres||[])favoriteStyles.add(norm(style));
  }
  // Discover extra acts through the user's actual concert region, not only
  // the editorial starter library. Only include genre-tagged artists.
  for(const event of future){
    const names=[event.artist,...(event.artists||[])].filter(x=>typeof x==='string').slice(0,50);
    for(const name of names){
      const key=norm(name);
      if(key.length<2||key.length>85||/\d{4}|tickets|festivals? [0-9]|&more|\bwith guest\b/i.test(name))continue;
      const entry=metadata?.artists?.[key]||{};
      const fromEntry=(entry.genres||[]).filter(g=>GENRES.includes(g));
      const eventHeadliner=key===norm(event.artist);
      const feed=eventHeadliner&&event.genreEvidence!=='title-cue'
        ?String(event.genre||'').split(/\s+\/\s+/).filter(g=>GENRES.includes(g)):[];
      const genres=[...new Set([...fromEntry,...feed])];
      const styles=Array.isArray(entry.subgenres)?entry.subgenres.filter(x=>typeof x==='string'):[];
      if(!genres.length&&!styles.length)continue;
      const old=candidates.get(key);
      if(old){
        old.genres=[...new Set([...old.genres,...genres])];
        old.styles=[...new Set([...old.styles,...styles])];
      }else{
        candidates.set(key,{name,genres,styles});
      }
      const earlier=upcoming.get(key);
      if(!earlier || event.date<earlier.date || 
         (cityKey(event.city)===cityKey(profile.city)&&cityKey(earlier.city)!==cityKey(profile.city))){
        upcoming.set(key,{city:event.city,date:event.date});
      }
    }
  }
  const picks=[];
  for(const band of candidates.values()){
    const broad=band.genres.filter(g=>wantedGenres.has(g));
    const special=band.styles.filter(s=>wantedStyles.has(s));
    const related=band.styles.filter(s=>favoriteStyles.has(norm(s)));
    if(!broad.length&&!special.length&&!related.length&&!selected.has(norm(band.name)))continue;
    const show=upcoming.get(norm(band.name));
    const nearby=show && !!cityKey(profile.city)&&cityKey(show.city)===cityKey(profile.city);
    picks.push({...band,
      score:broad.length*12+special.length*38+related.length*21+
       (nearby?32:show?12:0)+(selected.has(norm(band.name))?50:0),
      upcoming:show||null,selected:selected.has(norm(band.name))
    });
  }
  return picks.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))
    .slice(0,Math.max(1,Math.min(500,max)));
}
export function mergeTasteTags(base={},bands=TASTE_BANDS) {
  const map={artists:{...(base.artists||{})}};
  for(const band of bands){
    const key=norm(band.name);
    const old=map.artists[key]||{};
    const genres=[...new Set([...band.genres,...(old.genres||[])])];
    const subgenres=[...new Set([...band.styles,...(old.subgenres||[])])];
    map.artists[key]={...old,genres,subgenres,source:old.source?old.source+'+curated':'editorial'};
  }
  return map;
}
export function seedDeciding(events,profile,tags,previous={},limit=12,today=dateToday()){
  if(!profile||!Array.isArray(events))return [];
  const byId=new Set(Object.keys(previous||{}));
  const ranked=[];
  for(const raw of events){
    const event=normalizeEvent(raw);
    if(!event||event.date<today||byId.has(event.id))continue;
    const match=recommendEvent(event,profile,tags);
    if(!match)continue;
    const local=!!cityKey(profile.city)&&cityKey(event.city)===cityKey(profile.city);
    ranked.push({event,match,local});
  }
  const byRank=(a,b)=>b.match.score-a.match.score||a.event.date.localeCompare(b.event.date);
  const local=ranked.filter(x=>x.local).sort(byRank);
  const away=ranked.filter(x=>!x.local).sort(byRank);
  const size=Math.min(Math.max(0,limit),20);
  // Keep local shows first. If there are none, show only a small number
  // of other-city alternatives rather than filling the queue with distant trips.
  const picks=local.length
    ?[...local.slice(0,size),...away.slice(0,Math.max(0,Math.min(2,size-local.length)))].slice(0,size)
    :away.slice(0,profile.city?Math.min(4,size):size);
  const seen=new Set();
  return picks.filter(x=>{
    const duplicate=norm(x.event.artist)+'|'+x.event.date;
    if(seen.has(duplicate))return false;
    seen.add(duplicate);return true;
  }).sort((a,b)=>a.event.date.localeCompare(b.event.date))
    .map(x=>({id:x.event.id,event:x.event,status:'deciding',suggested:true,
      suggestionReason:x.match.reason}));
}
