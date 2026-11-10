import test from 'node:test';
import assert from 'node:assert/strict';
import {
 explicitlyBilledArtists,headlinerSearchNames,artistImageFor,
 resolveConcertImage,resolveConcertImageBackups
} from '../js/artist-images.js';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';

const portrait='https://cdn-images.dzcdn.net/images/artist/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1000x1000-000000-80-0-0.jpg';
const second='https://cdn-images.dzcdn.net/images/artist/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/1000x1000-000000-80-0-0.jpg';
const title='Talent Meets Talent: MAROU & MASSIN';
const event={id:'podiuminfo-series',artist:title,artists:[title],date:'2026-11-20',
 country:'NL',venue:'Hall of Fame',image:''};
const cache={artists:{
 marou:{image:portrait,kind:'artist-photo',source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/101'}},
 massin:{image:second,kind:'artist-photo',source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/102'}}
}};

test('extract exactly named performers from event series with upper-case duo billing',()=>{
 assert.deepEqual(explicitlyBilledArtists(event),['MAROU','MASSIN']);
 assert.deepEqual(headlinerSearchNames(event),['MAROU','MASSIN']);
 assert.deepEqual(selectArtistCandidates([event],{artists:{}},{today:'2026-11-10'}).map(x=>x.name),['MAROU','MASSIN']);
});
test('real credited performer photos can backfill a no-image concert and its poster backup',()=>{
 assert.equal(artistImageFor(event,cache).name,'MAROU');
 const chosen=resolveConcertImage(event,cache);
 assert.equal(chosen.url,portrait);
 assert.match(chosen.credit.text,/Photo of MAROU \(billed act\)/);
 const official={...event,image:'https://example.org/official-poster.jpg'};
 assert.equal(resolveConcertImage(official,cache).url,official.image);
 assert.deepEqual(resolveConcertImageBackups(official,cache).map(x=>x.url),[portrait,second]);
 assert.match(resolveConcertImageBackups(official,cache)[1].credit.text,/Photo of MASSIN \(billed act\)/);
});
test('two multi-word artist names after an event series also use conservative existing bill grammar',()=>{
 const bill={...event,artist:'Music Showcase: The Bright Lights & Dark Moon Society',artists:[]};
 assert.deepEqual(headlinerSearchNames(bill),['The Bright Lights','Dark Moon Society']);
});
test('colon alone, tribute subject, random suffix and established band names are NOT split',()=>{
 for(const name of [
  'Album: MAROU & MASSIN',
  'Concert: MONO & TOOL',
  'Tribute Night: MONO & TOOL',
  'Cover Festival: MAROU & MASSIN',
  'Band: New Album Tour',
  'Earth, Wind & Fire',
  'Simon & Garfunkel',
  'MARIO & LUIGI'
 ])assert.deepEqual(explicitlyBilledArtists({artist:name}),[],name);
 const tribute={...event,artist:'Tribute Night: MONO & TOOL',artists:[]};
 assert.deepEqual(headlinerSearchNames(tribute).filter(x=>['MONO','TOOL'].includes(x)),[]);
});
test('all-night-long performance descriptor does not hide the actual DJ identity',()=>{
 const act={...event,artist:'Exproz All Night Long',artists:['Exproz All Night Long']};
 assert.deepEqual(headlinerSearchNames(act),['Exproz']);
 assert.deepEqual(selectArtistCandidates([act],{artists:{}},{today:'2026-11-10'}).map(x=>x.name),['Exproz']);
 for(const title of ['All Night Long','Night Moves','Night Ranger']){
  assert.deepEqual(headlinerSearchNames({...act,artist:title,artists:[title]}),[title]);
 }
});
test('never show an unverified provider portrait just because it matches a bill name',()=>{
 const bad={artists:{marou:{image:'https://bad.invalid/marou.jpg'}}};
 assert.equal(resolveConcertImage(event,bad).kind,'fallback');
});
