/**
 * NL venue-event artwork research pilot (read-only).
 * Only report potential images after matching exact date + verified artist + venue.
 * Returned image URLs are NOT cleared for publication: rights review is required.
 */
import {headlinerNames,artistKey} from '../js/artist-images.js';

export const VENUES = {
  paradiso:{host:'www.paradiso.nl',aliases:['Paradiso'],agenda:'https://www.paradiso.nl/landing/concertagenda-paradiso/2069817'},
  melkweg:{host:'www.melkweg.nl',aliases:['Melkweg'],agenda:'https://www.melkweg.nl/nl/agenda/'},
  tivoli:{host:'www.tivolivredenburg.nl',aliases:['TivoliVredenburg','Tivoli Vredenburg'],agenda:'https://www.tivolivredenburg.nl/agenda'}
};
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(x=>[x[1].toLowerCase(),x[2]??x[3]]));
const official=(raw,base,host)=>{try{const u=new URL(raw,base);return u.protocol==='https:'&&u.hostname===host&&!u.username&&!u.password?u.href:'';}catch{return '';}};
export function venueKey(event){
  if(event?.country!=='NL')return '';
  return Object.entries(VENUES).find(([,v])=>v.aliases.some(a=>artistKey(a)===artistKey(event.venue)))?.[0]||'';
}
export function agendaLinks(html,id){
  const venue=VENUES[id];if(!venue||typeof html!=='string'||html.length>4000000)return [];
  const links=new Map();
  for(const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const url=official(attrs(match[1]).href,venue.agenda,venue.host);
    if(!url||url===venue.agenda||!/\/(?:agenda|programma|program|event|events)\//i.test(new URL(url).pathname))continue;
    const title=clean(match[2]);
    if(title&&title.length<190)links.set(url,{url,title});
  }
  return [...links.values()];
}
export function titleMatch(event,title){
  const t=artistKey(title);
  return t.length>0&&headlinerNames(event).some(n=>{
    const name=artistKey(n);
    return name.length>=5&&(t===name||t.startsWith(name+' ')||t.startsWith(name+' support '));
  });
}
function eventRecords(html){
  const results=[];
  for(const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/application\/ld\+json/i.test(tag[1]))continue;
    try{
      const root=JSON.parse(tag[2]);
      const walk=x=>{
        if(Array.isArray(x)){x.forEach(walk);return;}
        if(!x||typeof x!=='object')return;
        if(['Event','MusicEvent'].includes(x['@type']))results.push(x);
        if(x['@graph'])walk(x['@graph']);
      };
      walk(root);
    }catch{}
  }
  return results;
}
export function verifyVenueArtwork(html,url,event,id){
  const venue=VENUES[id];
  if(!venue||!official(url,venue.agenda,venue.host)||typeof html!=='string')return null;
  const matched=eventRecords(html).find(x=>{
    if(String(x.startDate||'').slice(0,10)!==event.date||!titleMatch(event,x.name))return false;
    const locations=Array.isArray(x.location)?x.location:[x.location];
    const names=locations.filter(Boolean).map(y=>typeof y==='string'?y:String(y.name||''));
    return names.length>0&&names.some(n=>venue.aliases.some(a=>artistKey(n).includes(artistKey(a))));
  });
  if(!matched)return null;
  for(const meta of html.matchAll(/<meta\b[^>]*>/gi)){
    const a=attrs(meta[0]);
    if(!['og:image','og:image:url','twitter:image'].includes((a.property||a.name||'').toLowerCase()))continue;
    try{
      const u=new URL(String(a.content||'').replace(/&amp;/g,'&'),url);
      if(u.protocol==='https:'&&!u.username&&!u.password&&!/logo|default|placeholder|favicon/i.test(u.pathname))
        return {image:u.href,eventUrl:url,eventId:event.id,venue:id,permission:'review-required'};
    }catch{}
  }
  return null;
}
/** Does not change the concert catalogue. Max requests per execution are bounded. */
export async function inspectNlVenueImages(events,{fetcher=fetch,maxEventPages=12}={}){
  const report={attempted:0,matches:[],unmatched:[],errors:[]};
  const current=new Date().toISOString().slice(0,10);
  for(const [id,venue] of Object.entries(VENUES)){
    let venueAttempts=0;
    let links;
    try{
      const response=await fetcher(venue.agenda,{signal:AbortSignal.timeout(9000)});
      if(!response.ok)throw Error('HTTP '+response.status);
      links=agendaLinks(await response.text(),id);
    }catch(error){report.errors.push({venue:id,error:String(error)});continue;}
    for(const e of events.filter(e=>!e.image&&e.date>=current&&venueKey(e)===id)){
      if(venueAttempts>=maxEventPages)break;
      const choices=links.filter(link=>titleMatch(e,link.title));
      if(choices.length!==1){report.unmatched.push(e.id);continue;}
      report.attempted++;venueAttempts++;
      try{
        const res=await fetcher(choices[0].url,{signal:AbortSignal.timeout(9000)});
        if(!res.ok)throw Error('HTTP '+res.status);
        const image=verifyVenueArtwork(await res.text(),choices[0].url,e,id);
        if(image)report.matches.push(image);else report.unmatched.push(e.id);
      }catch(error){report.errors.push({eventId:e.id,error:String(error)});}
    }
  }
  return report;
}
