/**
 * Turn an official venue event page into a normalised official event:
 *   {url,title,performers,date,startDate,venueName,image,cancelled,via}
 * Structured data (Schema.org JSON-LD) is preferred. Without it, a page is
 * accepted only when its date is unambiguous (date in the official URL, or
 * exactly one machine-readable <time datetime> date) and it has a title.
 */
import {jsonLdEvents,openGraphImage,metaContent,canonicalUrl,cleanText,localDate,sitemapEntries} from './core.mjs';

const sameUrl=(a,b)=>{try{const x=new URL(a),y=new URL(b);return x.host===y.host&&x.pathname.replace(/\/$/,'')===y.pathname.replace(/\/$/,'');}catch{return false;}};

export function timeTagDate(html){
 const dates=new Set([...String(html||'').matchAll(/<time\b[^>]*datetime=["'](\d{4}-\d{2}-\d{2})/gi)].map(m=>m[1]));
 return dates.size===1?[...dates][0]:'';
}
const NL_MONTHS={jan:1,januari:1,january:1,feb:2,februari:2,february:2,mrt:3,maart:3,mar:3,march:3,apr:4,april:4,mei:5,may:5,jun:6,juni:6,june:6,jul:7,juli:7,july:7,aug:8,augustus:8,august:8,sep:9,sept:9,september:9,okt:10,oktober:10,oct:10,october:10,nov:11,november:11,dec:12,december:12};
/** First written date that includes a year, e.g. "do 5 nov 2026". */
export function firstDatedText(html){
 const text=String(html||'').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ');
 for(const m of text.matchAll(/\b(\d{1,2})\s+([a-z]{3,9})\.?\s+(20\d{2})\b/gi)){
  const month=NL_MONTHS[m[2].toLowerCase()];const day=Number(m[1]);
  if(!month||day<1||day>31)continue;
  const iso=`${m[3]}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if(new Date(iso+'T12:00:00Z').toISOString().startsWith(iso))return iso;
 }
 return '';
}
export function parseEventPage(html,pageUrl,adapter){
 const page=canonicalUrl(html,pageUrl)||pageUrl;
 const ogTitle=cleanText(metaContent(html,['og:title'])).replace(adapter.titleSuffix||/$^/,'').trim();
 const ogImage=openGraphImage(html,pageUrl);
 const ld=jsonLdEvents(html,pageUrl).filter(e=>e.startDate);
 // Several JSON-LD blocks can describe the same page (013 publishes an Event
 // and a MusicEvent). Prefer the record for this URL with performers.
 const ranked=ld.map(e=>({e,score:(sameUrl(e.url,page)||sameUrl(e.url,pageUrl)?4:0)+(e.performers.length?2:0)+(/MusicEvent/.test(e.type)?1:0)}))
  .sort((a,b)=>b.score-a.score);
 const dates=new Set(ld.map(e=>adapter.floatingTime?e.startDate.slice(0,10):e.date).filter(Boolean));
 if(ranked.length&&dates.size===1){
  const e=ranked[0].e;
  const date=adapter.floatingTime?e.startDate.slice(0,10):e.date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  return {url:page,title:e.title||ogTitle,performers:e.performers,date,startDate:e.startDate,venueName:e.venueName,
   image:ogImage||e.image,cancelled:/Cancelled|Postponed|Rescheduled/i.test(e.status),via:'json-ld'};
 }
 if(ranked.length&&dates.size>1)return null; // a multi-date page cannot prove one concert
 const date=(adapter.slugDate&&adapter.slugDate(pageUrl))||(adapter.timeTagDate&&timeTagDate(html))||
  (adapter.textDate==='first-with-year'&&firstDatedText(html))||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!ogTitle)return null;
 const performers=ogTitle.split(/\s+\+\s+/).map(s=>s.trim()).filter(Boolean);
 return {url:page,title:ogTitle,performers:performers.length>1?performers:[],date,startDate:date,venueName:'',
  image:ogImage,cancelled:/\b(?:geannuleerd|afgelast|cancelled|canceled|verplaatst|postponed)\b/i.test(ogTitle),via:adapter.slugDate?'url-date+opengraph':adapter.textDate?'text-date+opengraph':'time-tag+opengraph'};
}
export function eventLinksFromHtml(html,base,adapter){
 const out=new Set();
 for(const m of String(html||'').matchAll(/href=["']([^"'#]+)["']/gi)){
  try{const u=new URL(m[1].replace(/&amp;/g,'&'),base);u.search='';u.hash='';
   if(adapter.eventUrl.test(u.href))out.add(u.href);}catch{}
 }
 return [...out];
}
export {sitemapEntries};
