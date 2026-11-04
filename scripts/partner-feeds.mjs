/** Validated permission-based imports. Never fetches or crawls a website. */
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const DOMAINS={cometogether:['cometogether.live'],ticketservices:['ticketservices.gr','www.ticketservices.gr']};
function permittedURL(value,source){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&DOMAINS[source]?.includes(u.hostname)?u.href:null;}catch{return null;}
}
function dateValid(s){
 return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().startsWith(s);
}
function cityName(s){
 const n=norm(s);
 const aliases={athina:'Athens',athens:'Athens','αθηνα':'Athens',thessaloniki:'Thessaloniki',salonika:'Thessaloniki','θεσσαλονικη':'Thessaloniki',patras:'Patras','πατρα':'Patras',ioannina:'Ioannina','ιωαννινα':'Ioannina'};
 return aliases[n]||String(s||'').trim().slice(0,90);
}
export function validatePartnerEvent(raw,source,{today='2026-11-04',endDate='2027-12-31'}={}){
 if(!DOMAINS[source]||!raw||typeof raw!=='object')return null;
 const artist=String(raw.artist||'').trim().slice(0,160),date=String(raw.date||'').trim(),venue=String(raw.venue||'').trim().slice(0,130);
 const city=cityName(raw.city),country=String(raw.country||'GR').toUpperCase(),url=permittedURL(raw.url,source);
 if(!artist||artist.length<2||!venue||!city||country!=='GR'||!url||!dateValid(date)||date<today||date>endDate)return null;
 if(raw.type&&!['MusicEvent','Concert','Music'].includes(raw.type))return null;
 const artists=Array.isArray(raw.artists)?raw.artists.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().slice(0,160)).slice(0,20):[];
 const id='partner-'+source+'-'+date+'-'+norm(artist).replaceAll(' ','-').slice(0,60)+'-'+norm(venue).replaceAll(' ','-').slice(0,35);
 return {id,artist,artists:[...new Set([artist,...artists])],date,venue,city,country,genre:'',subgenre:'',url,image:'',source:'partner-'+source,verification:'licensed-partner-feed'};
}
export function importedPartnerEvents(data,opts={}){
 const events=[],diagnostics={sources:{},accepted:0,rejected:0};
 for(const [source,entry] of Object.entries(data?.providers||{})){
   const row={accepted:0,rejected:0,enabled:false};diagnostics.sources[source]=row;
   if(!DOMAINS[source]||entry?.permissionConfirmed!==true||!Array.isArray(entry.events))continue;
   row.enabled=true;
   for(const raw of entry.events){
     const event=validatePartnerEvent(raw,source,opts);
     if(!event){row.rejected++;diagnostics.rejected++;continue;}
     events.push(event);row.accepted++;diagnostics.accepted++;
   }
 }
 return {events,diagnostics};
}
export function mergePartnerEvents(existing,additions){
 const events=[...existing];let added=0,duplicates=0;
 for(const event of additions){
   const duplicate=events.some(e=>e.id===event.id||(e.country===event.country&&e.date===event.date&&norm(e.artist)===norm(event.artist)&&(norm(e.venue)===norm(event.venue)||!e.venue)));
   if(duplicate){duplicates++;continue;}
   events.push(event);added++;
 }
 return {events,added,duplicates};
}
