/**
 * Conservative cross-source dedupe for Greek venue gigs.
 * Only merge when country, day and known SAME venue match, and one
 * headline is a direct billed extension of the other.
 * Preserve an existing ID so that saved Going/Passed decisions survive.
 */
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/&#x([\da-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
 .replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(Number(v)))
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function canonicalVenue(value){
 const name=norm(value);
 if(/^(?:gagarin 205|gagarin 205 live music space|gagarin)$/i.test(name))return 'gagarin-205';
 if(/^(?:an club|an|αν club)$/i.test(name))return 'an-club';
 if(/^(?:floyd|floyd live music venue)$/i.test(name))return 'floyd';
 if(/^(?:fuzz club|fuzz live music club|fuzz)$/i.test(name))return 'fuzz';
 if(/^(?:kyttaro|kyttaro live|κυτταρο|κυτταρο live|κυτταρο live stage)$/i.test(name))return 'kyttaro';
 if(/^(?:arch|arch club|arch club live)$/i.test(name))return 'arch';
 return name.length>=3?name:'';
}
const title=s=>norm(s).replace(/^(?:sold out|live show|live)\s+/,'').trim();
export function sameVenueGig(a,b){
 if(!a||!b||a.country!=='GR'||b.country!=='GR'||a.date!==b.date)return false;
 const venueA=canonicalVenue(a.venue),venueB=canonicalVenue(b.venue);
 if(!venueA||venueA!==venueB)return false;
 const x=title(a.artist),y=title(b.artist);
 if(!x||!y)return false;
 if(x===y)return true;
 // Only direct prefix agreement; no fuzzy similarity that might merge two
 // support acts or festival performances booked for the same venue/day.
 const shorter=x.length<y.length?x:y,longer=x.length<y.length?y:x;
 return shorter.length>=4 && longer.startsWith(shorter+' ');
}
const isOfficial=x=>['anclub-index','floyd-calendar','fuzzclub-calendar','gagarin-calendar','official'].includes(x.source);
export function dedupeGreekVenueConcerts(events){
 const sorted=[...events].sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
 const result=[];let duplicates=0;
 for(const item of sorted){
  const matchIndex=result.findIndex(e=>sameVenueGig(e,item));
  if(matchIndex<0){result.push(item);continue;}
  const old=result[matchIndex];
  // Keep the ID that was published first: stable IDs are more important than
  // a changing crawler source name. Prefer authoritative event details.
  const best=isOfficial(item)&&!isOfficial(old)?item:isOfficial(old)&&!isOfficial(item)?old:
    String(item.artist||'').length>String(old.artist||'').length?item:old;
  result[matchIndex]={...old,...best,id:old.id,
   image:best.image||old.image||item.image||'',
   genre:best.genre||old.genre||item.genre||'',
   artists:[...new Set([...(old.artists||[]),...(item.artists||[])])].slice(0,50)};
  duplicates++;
 }
 return {events:result,duplicates};
}
