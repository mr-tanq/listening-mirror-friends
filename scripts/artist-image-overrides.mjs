/**
 * Human corrections for the artist photo cache (data/artist-image-overrides.json).
 *
 *  block: artist names whose automatic photo was wrong. The photo is removed
 *         and the name is never looked up again by any provider.
 *  pin:   a reviewed photo for an artist (any URL verifiedArtistPhoto accepts),
 *         with an optional credit. Pins always win over automatic matches.
 */
import {artistKey,verifiedArtistPhoto} from '../js/artist-images.js';
export function applyArtistImageOverrides(cache,overrides,{checkedAt=new Date().toISOString()}={}){
 const artists={...(cache?.artists||{})},attempted={...(cache?.attempted||{})};
 let blocked=0,pinned=0;
 for(const name of overrides?.block||[]){
  const key=artistKey(name);if(!key)continue;
  if(artists[key]&&artists[key].source!=='manual-pin'){delete artists[key];blocked++;}
  attempted[key]={retryAfter:'9999-12-31',reason:'blocked-by-review'};
 }
 for(const pin of overrides?.pin||[]){
  const key=artistKey(pin?.artist),image=verifiedArtistPhoto(pin?.image);
  if(!key||!image)continue;
  artists[key]={name:pin.artist,image,kind:'artist-photo',source:'manual-pin',sourceUrl:pin.sourceUrl||'',
   ...(pin.credit?.text?{credit:{text:String(pin.credit.text),url:String(pin.credit.url||'')}}:{}),checkedAt};
  delete attempted[key];pinned++;
 }
 return {cache:{...(cache||{}),version:1,artists,attempted},blocked,pinned};
}
