/**
 * Fuzz Live Music Venue: official The Events Calendar iCalendar feed.
 * The ICS provides dates and canonical event pages; image metadata can be
 * retrieved separately from each official event page.
 */
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const isoDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
function eventURL(input){
 try{const u=new URL(input);return u.protocol==='https:'&&['fuzzclub.gr','www.fuzzclub.gr'].includes(u.hostname)&&u.pathname.startsWith('/event/')?u.href:'';}catch{return '';}
}
export function parseFuzzCalendar(calendar,{today='2026-11-04',endDate='2027-05-31'}={}){
 if(typeof calendar!=='string'||!calendar.includes('BEGIN:VCALENDAR'))return [];
 const records=[],unfolded=calendar.replace(/\r?\n[ \t]/g,'').split(/\r?\n/);let entry=null;
 for(const line of unfolded){
   if(line.trim()==='BEGIN:VEVENT'){entry={};continue;}
   if(line.trim()==='END:VEVENT'){if(entry)records.push(entry);entry=null;continue;}
   if(!entry)continue;
   const colon=line.indexOf(':');if(colon<1)continue;
   const key=line.slice(0,colon).split(';',1)[0].toUpperCase();
   if(entry[key]===undefined)entry[key]=line.slice(colon+1).replace(/\\[nN]/g,' ').replace(/\\([,;\\])/g,'$1').trim();
 }
 const map=new Map();
 for(const e of records){
   const m=/^(\d{4})(\d{2})(\d{2})/.exec(e.DTSTART||'');
   if(!m)continue;
   const date=m[1]+'-'+m[2]+'-'+m[3];if(!isoDate(date)||date<today||date>endDate)continue;
   const artist=String(e.SUMMARY||'').replace(/<[^>]+>/g,'').trim().slice(0,150);
   const category=norm(e.CATEGORIES||'');
   if(!artist||artist.length<2||/(^| )(stand up|standup|comedy|theatre|theater|θεατρο|κωμωδια)( |$)/.test(category))continue;
   if(/\bstand[ -]?up\b|\bcomedy\b|κωμωδ|θεατρικ|παραστασ/i.test(artist))continue;
   const url=eventURL(e.URL);if(!url)continue;
   const id='fuzzclub-'+date+'-'+encodeURIComponent(norm(artist)).slice(0,110);
   const location=norm(e.LOCATION||'');
   // A stray listing for another venue must never be attributed to Fuzz.
   if(location&&!/(fuzz|πειραιως 209|patriarchou ioakim|πατριαρχου ιωακειμ)/.test(location))continue;
   map.set(date+'|'+norm(artist),{id,artist,artists:[artist],date,
     venue:'Fuzz Club',city:'Athens',country:'GR',
     genre:'',subgenre:'',url,image:'',source:'fuzzclub-calendar',verification:'venue-calendar'});
 }
 return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.artist.localeCompare(b.artist));
}
export async function discoverFuzzCalendar({today,endDate,fetcher=fetch}={}){
 const url='https://www.fuzzclub.gr/events/?ical=1';
 const response=await fetcher(url,{headers:{Accept:'text/calendar, text/plain;q=0.9','User-Agent':'ListeningMirrorFriends/1.0 (https://github.com/mr-tanq/listening-mirror-friends)'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Fuzz iCalendar HTTP '+response.status);
 const body=await response.text();
 if(body.length>5_000_000||!body.includes('BEGIN:VCALENDAR'))throw new Error('Invalid Fuzz iCalendar feed');
 return parseFuzzCalendar(body,{today,endDate});
}
