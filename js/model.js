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
export function normalizeEvent(input){
  if(!input||typeof input!=='object')return null;
  const artist=String(input.artist||input.name||'').trim().slice(0,200);
  const date=String(input.date||'').slice(0,10);
  if(!artist||!date)return null;
  const id=String(input.id||`${artist}-${date}-${input.venue||''}`).slice(0,250);
  const artists=Array.isArray(input.artists)?input.artists.filter(x=>typeof x==='string').slice(0,250):[];
  return {id,artist,artists,date,venue:String(input.venue||'').slice(0,150),city:String(input.city||'').slice(0,120),country:String(input.country||'').toUpperCase().slice(0,2),genre:String(input.genre||'').slice(0,100),subgenre:String(input.subgenre||'').slice(0,100),url:safeUrl(input.url)||'',image:safeUrl(input.image)||'',source:String(input.source||'manual').slice(0,60)};
}
function artistMatch(event,wanted){
  const names=[event.artist,...(event.artists||[])].map(norm);
  const title=norm(event.artist);
  return wanted.some(a=>{const key=norm(a);return key.length>=2&&(names.some(n=>n===key)||title.split(' with ').includes(key)||title.split(' and ').includes(key)||new RegExp(`(^| )${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}( |$)`).test(title));});
}
function genreMatch(event,wanted){
  const genre=norm([event.genre,event.subgenre].join(' '));
  if(!genre)return [];
  return wanted.filter(g=>{
    const target=norm(g);if(genre===target||genre.includes(target))return true;
    // Avoid treating any generic 'Rock' event as verified 'Post-Rock', 'Stoner / Doom' or 'Psychedelic'
    return (genreTerms[g]||[]).some(s=>genre.split(' ').includes(norm(s))||genre.includes(norm(s)));
  });
}
export function rankEvent(event,profile){
  if(!event||!profile)return 0;
  const sameArtist=artistMatch(event,Array.isArray(profile.artists)?profile.artists:[]);
  const genres=genreMatch(event,Array.isArray(profile.genres)?profile.genres:[]);
  const countryMatch=event.country&&event.country===profile.country;
  if(!countryMatch)return 0; // First release: exact country only, no invented distance/radius
  if(!sameArtist&&!genres.length)return 0;
  const sameCity=event.city&&profile.city&&norm(event.city)===norm(profile.city);
  return (sameArtist?100:0)+(genres.length?35+Math.min(genres.length,3)*6:0)+(sameCity?14:0)+5;
}
export function matchReason(event,profile){
  if(!event||!profile)return '';
  const sameArtist=artistMatch(event,Array.isArray(profile.artists)?profile.artists:[]);
  const genres=genreMatch(event,Array.isArray(profile.genres)?profile.genres:[]);
  if(sameArtist)return '★ Your favorite artist'+(genres.length?` · ${genres[0]}`:'');
  if(genres.length)return `Matches your ${genres.join(' / ')} taste`;
  return '';
}
