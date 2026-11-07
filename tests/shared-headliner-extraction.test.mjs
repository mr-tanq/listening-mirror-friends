import test from 'node:test';
import assert from 'node:assert/strict';
import {artistKey,headlinerNames,headlinerSearchNames,resolveConcertImage} from '../js/artist-images.js';
import {selectArtistCandidates,enrichDeezerArtistImages} from '../scripts/deezer-artist-images.mjs';

const photo='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const event=(artist,extra={})=>({artist,artists:[artist],country:'NL',date:'2026-11-12',
 image:'',source:'podiuminfo-agenda',...extra});

test('recognizes acts behind common presenter, show, and tour grammar, not specific show IDs',()=>{
 const cases=[
  ['Le Guess Who? presents BLEAK SQUAD','BLEAK SQUAD'],
  ['Band Night - BeylerBand','BeylerBand'],
  ['AZC De Vlampijp x Musicaz x dB’s Viering met optreden van KASBA','KASBA'],
  ['Caro - Returning to Innocence','Caro'],
  ['LP - All Is Not Lost Tour','LP'],
  ['Ludovico Einaudi: The Summer Portraits','Ludovico Einaudi'],
  ['Slixx Extended Set','Slixx'],
  ['Loïs Lane 40 jaar Live','Loïs Lane'],
  ['Tales From The Punx: Wolfbrigade','Wolfbrigade'],
  ['Baroeg Tribute Night: BEATALLICA','BEATALLICA']
 ];
 for(const [title,act] of cases){
  const names=headlinerSearchNames(event(title));
  assert.deepEqual(names,[act],title);
  // The identity-dedup parser remains unchanged; the photo resolver uses
  // the new strict shortlist.
  const result=resolveConcertImage(event(title),{artists:{[artistKey(act)]:{image:photo}}});
  assert.equal(result.url,photo,title);
 }
});
test('venue duplicate parser remains conservative for presenting artists',()=>{
 const e=event('Candy Dulfer presents Funk Legacy Allstars');
 assert.deepEqual(headlinerNames(e),['Candy Dulfer presents Funk Legacy Allstars']);
 assert.deepEqual(headlinerSearchNames(e),['Funk Legacy Allstars']);
});
test('keeps distinctive band names intact and does not choose a random act from mixed bills',()=>{
 for(const name of ['Earth, Wind & Fire','Red Hot Chili Peppers','Thirty Seconds to Mars',
  'Godspeed You! Black Emperor','A Place to Bury Strangers','Night Beats','LP']){
  assert.deepEqual(headlinerSearchNames(event(name)),[name],name);
 }
 assert.deepEqual(headlinerSearchNames(event('Any Kind / LOMA / Shearwater')),[]);
 assert.deepEqual(headlinerSearchNames(event('Deer Park / Touching Ice / Healing Power of Horses')),[]);
 // Tribute subjects are not automatically performers.
 assert.ok(!headlinerSearchNames(event('Boze Wolven Ode aan Gorky')).includes('Gorky'));
 assert.deepEqual(headlinerSearchNames(event('New Group presents The New Album')),['New Group presents The New Album']);
});
test('structured headliner source outranks descriptive marketing title for external lookup',()=>{
 const e=event('Ablaye Cissoko and friends - An Evening of Kora',
  {artists:['Ablaye Cissoko']});
 assert.deepEqual(headlinerSearchNames(e),['Ablaye Cissoko']);
});
test('one source title produces one qualified Deezer candidate rather than a false-title query',()=>{
 const titles=['Le Guess Who? presents BLEAK SQUAD','Band Night - BeylerBand',
 'Caro - Returning to Innocence','Loïs Lane 40 jaar Live','Any Kind / LOMA / Shearwater'];
 const list=selectArtistCandidates(titles.map(t=>event(t)),{artists:{}},{today:'2026-11-07'});
 assert.deepEqual(list.map(x=>x.key).sort(),['bleak squad','beylerband','caro','lois lane'].sort());
 assert.ok(!list.some(x=>x.key.includes('presents')||x.key.includes('returning to')));
});
test('new shared headliner key is also the browser photo resolution key',()=>{
 const e=event('Le Guess Who? presents BLEAK SQUAD');
 const cache={artists:{'bleak squad':{image:photo,source:'deezer'}}};
 const found=resolveConcertImage(e,cache);
 assert.equal(found.kind,'artist-photo');
 assert.equal(found.url,photo);
 assert.equal(selectArtistCandidates([e],cache,{today:'2026-11-07'}).length,0);
});
test('end-to-end new event title discovery makes exactly one qualified Deezer search',async()=>{
 const e=event('Band Night - BeylerBand');
 const queries=[];
 const result=await enrichDeezerArtistImages([e],{artists:{}},{
  today:'2026-11-07',maxRequests:1,checkAlbumCovers:false,delay:async()=>{},
  fetcher:async url=>{
   queries.push(url);
   return {ok:true,status:200,json:async()=>({data:[{name:'BeylerBand',id:123456,picture_xl:photo}]})};
  }
 });
 assert.equal(result.stats.found,1);
 assert.equal(result.cache.artists.beylerband.image,photo);
 assert.equal(queries.length,1);
 assert.match(queries[0],/q=BeylerBand/);
});
