/** Fetch poster metadata only from trusted official venue event pages. */
const OFFICIAL_DOMAINS={
  'gagarin-calendar':['gagarin205.gr','www.gagarin205.gr'],
  'floyd-calendar':['floyd.gr','www.floyd.gr'],
  'fuzzclub-calendar':['fuzzclub.gr','www.fuzzclub.gr']
};
const safeImage=(value,base)=>{
 try{
   const u=new URL(value,base);
   if(u.protocol!=='https:'||u.username||u.password)return '';
   const page=new URL(base);
   if(u.hostname!==page.hostname)return '';
   if(!/\.(?:jpg|jpeg|png|webp)(?:$|\?)/i.test(u.pathname+u.search))return '';
   return u.href;
 }catch{return '';}
};
export function imageFromVenueHtml(html,baseUrl){
 if(typeof html!=='string'||html.length>2_000_000)return '';
 const metas=[...html.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]);
 for(const meta of metas){
   const attrs=Object.fromEntries([...meta.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(x=>[x[1].toLowerCase(),x[2]??x[3]]));
   if(!['og:image','og:image:url','twitter:image'].includes((attrs.property||attrs.name||'').toLowerCase()))continue;
   const value=(attrs.content||'').replaceAll('&amp;','&').trim();
   const url=safeImage(value,baseUrl);
   if(url&&!/logo|default|placeholder|favicon/i.test(url))return url;
 }
 return '';
}
export async function enrichVenuePosters(events,{fetcher=fetch,max=12,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const result=events.map(x=>({...x}));let attempts=0,found=0;
 for(const row of result){
   if(row.image||!OFFICIAL_DOMAINS[row.source]||attempts>=max)continue;
   let u;try{u=new URL(row.url);}catch{continue;}
   if(u.protocol!=='https:'||!OFFICIAL_DOMAINS[row.source].includes(u.hostname)||!u.pathname.startsWith('/event/'))continue;
   attempts++;
   try{
     const res=await fetcher(u.href,{headers:{Accept:'text/html','User-Agent':'ListeningMirrorFriends/1.0 (https://github.com/mr-tanq/listening-mirror-friends)'},signal:AbortSignal.timeout(10000)});
     if(!res.ok||!String(res.headers?.get?.('content-type')||'text/html').includes('html'))continue;
     const html=await res.text();const image=imageFromVenueHtml(html,u.href);
     if(image){row.image=image;found++;}
   }catch{/* Missing poster is not a fatal catalog error. */}
   await delay(250);
 }
 return {events:result,attempts,found};
}
