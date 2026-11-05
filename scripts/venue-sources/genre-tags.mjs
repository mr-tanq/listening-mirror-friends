/**
 * Venue records are added after the normal catalogue genre pass.
 * Use the same evidence-backed artist-tags cache, never infer genre
 * from a venue name or from unsupported guesses about a concert title.
 */
import {GENRES} from '../../js/model.js';
import {artistKey,headlinerNames} from '../../js/artist-images.js';

export function applyCachedVenueGenres(events,tags={artists:{}}){
 let tagged=0;
 for(const event of events){
  if(event.source!=='venue-official')continue;
  const names=headlinerNames(event);
  const found=names.map(n=>tags?.artists?.[artistKey(n)]).find(row=>
   Array.isArray(row?.genres)&&row.genres.some(g=>GENRES.includes(g)));
  const genres=[...new Set((found?.genres||[]).filter(g=>GENRES.includes(g)))];
  if(!genres.length)continue;
  if(!event.genre){event.genre=genres.slice(0,8).join(' / ');tagged++;}
  event.genreEvidence='metadata';
 }
 return tagged;
}
