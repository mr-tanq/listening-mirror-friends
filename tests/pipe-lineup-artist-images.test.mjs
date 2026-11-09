import test from 'node:test';
import assert from 'node:assert/strict';
import {
 explicitlyBilledArtists,headlinerSearchNames,artistImageFor,resolveConcertImage,
 resolveConcertImageBackups
} from '../js/artist-images.js';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';

const title='METAL/CORE SUNDAY MATINEE | Mosaic | XII Thorns | Serve';
const event={id:'podiuminfo-1',artist:title,artists:[title],date:'2026-12-04',venue:'Test Venue',country:'NL',image:''};
const portrait='https://cdn-images.dzcdn.net/images/artist/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1000x1000-000000-80-0-0.jpg';
const portrait2='https://cdn-images.dzcdn.net/images/artist/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/1000x1000-000000-80-0-0.jpg';

test('recognize only actual participants of a pipe-delimited named concert series',()=>{
 assert.deepEqual(explicitlyBilledArtists(event),['Mosaic','XII Thorns','Serve']);
 assert.deepEqual(headlinerSearchNames(event),['Mosaic','XII Thorns','Serve']);
});

test('all source-verifiable billed acts are individually eligible for discovery',()=>{
 const found=selectArtistCandidates([event],{artists:{}},{today:'2026-11-09'});
 assert.deepEqual(found.map(row=>row.name),['Mosaic','XII Thorns','Serve']);
});

test('verified participant photo is correctly credited, and poster still takes priority',()=>{
 const cache={artists:{
  mosaic:{image:portrait,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/123'}},
  'xii thorns':{image:portrait2,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/456'}}
 }};
 const chosen=artistImageFor(event,cache);
 assert.equal(chosen.name,'Mosaic');
 const result=resolveConcertImage(event,cache);
 assert.equal(result.url,portrait);
 assert.match(result.credit.text,/Photo of Mosaic \\(billed act\\)/);
 const poster={...event,image:'https://example.org/official-poster.jpg'};
 assert.equal(resolveConcertImage(poster,cache).url,poster.image);
 assert.deepEqual(resolveConcertImageBackups(poster,cache).map(x=>x.url),[portrait,portrait2]);
});

test('never invent a lineup from ambiguous marketing pipes or misidentify a tribute subject',()=>{
 for(const title of [
  'Band | Venue | 20:00',
  'Mosaic | XII Thorns | Serve',
  'Festival | Main Stage | 21:00',
  'Festival | TBA | Special Guests',
  'Tribute Night | Pink Floyd | The Beatles',
  'Concert | Doors | Tickets',
  'SUNDAY MATINEE | Single Name'
 ])assert.deepEqual(explicitlyBilledArtists({artist:title}),[],title);
});
