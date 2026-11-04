/** AN Club homepage: music-event tiles only. No unrelated site links. */
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const cleanHTML=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().startsWith(s);}
function anURL(v){
 try{const u=new URL(v,'https://www.anclub.gr');return u.protocol==='https:'&&['anclub.gr','www.anclub.gr'].includes(u.hostname)&&u.pathname.startsWith('/events/')?u.href:'';}catch{return '';}
}
function imageURL(v){
 try{const u=new URL(v,'https://www.anclub.gr');return u.protocol==='https:'&&(['cdn.prod.website-files.com','uploads-ssl.webflow.com','www.anclub.gr','anclub.gr'].includes(u.hostname))&&/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(u.href)?u.href:'';}catch{return '';}
}
export function parseAnClubIndex(html,{today='2026-11-04',endDate='2027-06-01'}={}){
 if(typeof html!=='string'||html.length>5_000_000)return [];
 const matches=[...html.matchAll(/<a\b([^>]*\bhref\s*=\s*(?:"[^"]*"|'[^']*')[^>]*)>([\s\S]*?)<\/a>/gi)];
 const rows=new Map();
 for(const a of matches){
   const href=a[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
   const url=anURL(href?.[1]||href?.[2]);if(!url)continue;
   const content=cleanHTML(a[2]);
   const match=content.match(/(?:^|\s)(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:\s*-\s*\d{4}|\s+\d{4})/i);
   if(!match)continue;
   const year=content.slice(match.index,match.index+match[0].length).match(/20\d{2}/)?.[0];
   const month=MONTHS[match[2].toLowerCase()];if(!month||!year)continue;
   const date=year+'-'+String(month).padStart(2,'0')+'-'+match[1].padStart(2,'0');
   if(!validDate(date)||date<today||date>endDate)continue;
   const remainder=content.slice(match.index+match[0].length).replace(/^\s*[-–]\s*\d{1,2}\s+\w+\s+20\d{2}\s*/,'');
   const name=remainder.split(/\bOpen Doors\s*:/i)[0].replace(/^\s*[–-]\s*/,'').trim().slice(0,160);
   if(!name||name.length<2||/παζαρι δισκων|παζάρι δίσκων|record fair|stand[ -]?up|comedy|θεατρικ/i.test(name))continue;
   const imageTag=a[2].match(/<img\b[^>]*(?:src|data-src)\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/i);
   const image=imageURL(imageTag?.[1]||imageTag?.[2]||'');
   const id='anclub-'+date+'-'+encodeURIComponent(norm(name)).slice(0,100);
   rows.set(date+'|'+norm(name),{id,artist:name,artists:[name],date,venue:'AN Club',city:'Athens',country:'GR',genre:'',subgenre:'',url,image,source:'anclub-index',verification:'venue-index'});
 }
 return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.artist.localeCompare(b.artist));
}
export async function discoverAnClub({today,endDate,fetcher=fetch}={}){
 const response=await fetcher('https://www.anclub.gr/',{headers:{Accept:'text/html','User-Agent':'ListeningMirrorFriends/1.0 (https://github.com/mr-tanq/listening-mirror-friends)'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('AN Club HTML HTTP '+response.status);
 const html=await response.text();const rows=parseAnClubIndex(html,{today,endDate});
 if(!rows.length)throw Error('No recognizable AN Club event tiles (source structure may have changed)');
 return rows;
}
