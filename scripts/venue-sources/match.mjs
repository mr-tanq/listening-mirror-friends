/**
 * Confidence matching between a catalogue concert and an official venue event.
 *
 * Hard requirements (otherwise: no match):
 *  - same calendar date;
 *  - the catalogue venue is this adapter's venue, and the official location
 *    (when published) is on-site, not a show the venue promotes elsewhere;
 *  - the event is not cancelled;
 *  - the catalogue HEADLINER equals the official headliner (first performer,
 *    or the headliner derived from the official title) after normalisation.
 *    A catalogue headliner that is only a support act on the official page
 *    is rejected outright.
 * Supporting evidence (raises confidence, never sufficient alone): matching
 * support acts.
 */
import {artistKey,headlinerNames} from '../../js/artist-images.js';

export const MATCH_THRESHOLD=0.85;
const keys=names=>[...new Set(names.map(artistKey).filter(k=>k.length>=2))];
export const venueMatches=(adapter,venue)=>adapter.aliases.some(a=>artistKey(a)===artistKey(venue));
export function officialHeadliners(official){
 const fromPerformer=official.performers?.[0]?headlinerNames({artist:official.performers[0]}):[];
 const fromTitle=headlinerNames({artist:official.title});
 return keys([...fromPerformer,...fromTitle]);
}
export function scoreMatch(event,official,adapter){
 const reasons=[];
 if(!event||!official)return {score:0,verdict:'reject',reasons:['missing']};
 if(official.date!==event.date)return {score:0,verdict:'reject',reasons:['date']};
 if(!venueMatches(adapter,event.venue))return {score:0,verdict:'reject',reasons:['venue']};
 if(official.venueName&&!adapter.onSite.test(official.venueName))return {score:0,verdict:'reject',reasons:['off-site:'+official.venueName]};
 if(official.cancelled)return {score:0,verdict:'reject',reasons:['cancelled']};
 let score=0.3;reasons.push('date','venue');
 const ours=keys(headlinerNames(event));
 const theirs=officialHeadliners(official);
 const supports=keys((official.performers||[]).slice(1));
 const headliner=ours.some(k=>theirs.includes(k));
 if(!headliner&&ours.some(k=>supports.includes(k)))return {score:0,verdict:'reject',reasons:[...reasons,'catalogue-headliner-is-support']};
 if(!headliner)return {score,verdict:'reject',reasons:[...reasons,'headliner-differs']};
 score+=0.6;reasons.push('headliner');
 const ourSupport=keys((event.artists||[]).slice(1));
 if(ourSupport.length&&ourSupport.some(k=>supports.includes(k))){score+=0.1;reasons.push('support-acts');}
 return {score:Math.min(1,Number(score.toFixed(2))),verdict:score>=MATCH_THRESHOLD?'match':'reject',reasons};
}
/**
 * The single official event for a catalogue concert, or null. Two different
 * official pages that both match (e.g. two rooms, same headliner) are
 * ambiguous and rejected.
 */
export function bestOfficialMatch(event,officials,adapter){
 const hits=officials.map(o=>({o,m:scoreMatch(event,o,adapter)})).filter(x=>x.m.verdict==='match');
 const urls=new Set(hits.map(x=>x.o.url));
 if(urls.size!==1)return {match:null,reason:hits.length?'ambiguous':'no-match',candidates:hits.length};
 const best=hits.sort((a,b)=>b.m.score-a.m.score)[0];
 return {match:best.o,confidence:best.m.score,reasons:best.m.reasons};
}
/** Slug of a name as venues write it in URLs ("O.R.k." -> "o-r-k"). */
export const slugOf=name=>artistKey(name).replace(/\s+/g,'-');
