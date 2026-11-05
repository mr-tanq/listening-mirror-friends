/**
 * Compatibility layer for the first NL venue-artwork pilot.
 *
 * The pilot scraped one agenda HTML page per venue and matched link texts.
 * Its audit (run 42038133272) fetched zero event pages: Paradiso's landing
 * page lists ~25 of ~140 shows, Melkweg serves a bot challenge, Tivoli
 * answers 403, and titles had to be ≥5 characters. The replacement lives in
 * scripts/venue-sources/ (official sitemaps/agendas, JSON-LD, confidence
 * matching). These exports keep the pilot's API on top of it.
 */
import {NL_VENUE_ADAPTERS,adapterById} from './venue-sources/adapters.mjs';
import {eventLinksFromHtml,parseEventPage} from './venue-sources/parse.mjs';
import {venueMatches,officialHeadliners,scoreMatch} from './venue-sources/match.mjs';
import {headlinerNames,artistKey} from '../js/artist-images.js';
import {runVenueStage} from './update-venue-catalog.mjs';

export const VENUES=Object.fromEntries(NL_VENUE_ADAPTERS.map(a=>[a.id,{host:new URL(a.origin).hostname,aliases:a.aliases,agenda:a.listings?.[0]?.url||''}]));
export function venueKey(event){
 if(event?.country!=='NL')return '';
 return NL_VENUE_ADAPTERS.find(a=>venueMatches(a,event.venue))?.id||'';
}
export function agendaLinks(html,id){
 const adapter=adapterById(id);
 if(!adapter?.eventUrl||typeof html!=='string')return [];
 return eventLinksFromHtml(html,adapter.origin+'/',adapter).map(url=>({url,title:''}));
}
export function titleMatch(event,title){
 const ours=headlinerNames(event).map(artistKey).filter(k=>k.length>=2);
 return officialHeadliners({title,performers:[]}).some(k=>ours.includes(k));
}
export function verifyVenueArtwork(html,url,event,id){
 const adapter=adapterById(id);
 if(!adapter?.eventUrl||!adapter.eventUrl.test(url))return null;
 const official=parseEventPage(html,url,adapter);
 const verdict=scoreMatch(event,official,adapter);
 if(verdict.verdict!=='match'||!official.image)return null;
 return {image:official.image,eventUrl:official.url,eventId:event.id,venue:id,confidence:verdict.score,permission:'review-required'};
}
/** Read-only audit across all adapters (no files written). */
export async function inspectNlVenueImages(events,{fetcher=fetch,policy={venues:{}},only=null}={}){
 const r=await runVenueStage({audit:true,feed:{events},cache:{venues:{}},policy,fetcher,only});
 return r.report;
}
