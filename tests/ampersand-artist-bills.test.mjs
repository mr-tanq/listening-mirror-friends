import test from 'node:test';
import assert from 'node:assert/strict';
import {
 artistKey,explicitlyBilledArtists,headlinerNames,headlinerSearchNames,
 resolveConcertImage,resolveConcertImageBackup
} from '../js/artist-images.js';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';
import {buildDisplayImageAudit} from '../scripts/display-image-audit.mjs';

const photoA='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const photoB='https://cdn-images.dzcdn.net/images/artist/6e512c28252fbb8d2b8e7aabe06fa7e9/1000x1000-000000-80-0-0.jpg';
const cache={artists:{
 'employed to serve':{image:photoA,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/123'}},
 'maite hontele':{image:photoA,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/456'}},
 'deftones':{image:photoB,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/789'}}
}};
const ev=(artist,extra={})=>({id:artist,date:'2026-11-15',country:'NL',source:'podiuminfo-agenda',
 artist,artists:[artist],venue:'Test Venue',image:'',...extra});

test('recognize general ampersand and comma-based concert billing grammar',()=>{
 const cases=[
  ['Employed To Serve & CABAL',['Employed To Serve','CABAL']],
  ['Maite Hontelé & La Novia',['Maite Hontelé','La Novia']],
  ['Sam Gendel & Sam Wilkes',['Sam Gendel','Sam Wilkes']],
  ['Deer Park, Touching Ice & The Healing Power Of Horses',
    ['Deer Park','Touching Ice','The Healing Power Of Horses']],
  ['Deftones, Nine Inch Nails, Korn & Marilyn Manson',
    ['Deftones','Nine Inch Nails','Korn','Marilyn Manson']],
  ['Any Kind / LOMA / Shearwater',['Any Kind','LOMA','Shearwater']]
 ];
 for(const [name,parts] of cases){
  assert.deepEqual(explicitlyBilledArtists(ev(name)),parts,name);
  assert.deepEqual(headlinerSearchNames(ev(name)),parts,name);
  assert.equal(headlinerNames(ev(name))[0],name); // Event dedupe stays unchanged.
 }
});
test('do not split established compound-band names or imprecise/potential tribute phrases',()=>{
 for(const name of [
  'Earth, Wind & Fire','Crosby, Stills & Nash','Simon & Garfunkel',
  'Kraak & Smaak','Suzan & Freek','Jack & Jack','AC/DC',
  'Peter & The Test Tube Babies','Kölsch & the Machine',
  'The Who Tribute & Many More','Tough Enough : David Eugene Edwards & many more',
  'The Beatles Cover Band & Rolling Stones Tribute'
 ]){
  assert.deepEqual(explicitlyBilledArtists(ev(name)),[],name);
 }
 for(const name of ['Earth, Wind & Fire','Simon & Garfunkel','AC/DC']){
  assert.deepEqual(headlinerSearchNames(ev(name)),[name],name);
 }
});
test('an explicitly billed, verified artist photo is labelled rather than falsely called the headliner',()=>{
 for(const [title,artist] of [
  ['Employed To Serve & CABAL','Employed To Serve'],
  ['Maite Hontelé & La Novia','Maite Hontelé'],
  ['Deftones, Nine Inch Nails, Korn & Marilyn Manson','Deftones']
 ]){
  const chosen=resolveConcertImage(ev(title),cache);
  assert.equal(chosen.kind,'artist-photo');
  assert.ok(chosen.url,title);
  assert.match(chosen.credit.text,new RegExp('Photo of '+artist+' \\(billed act\\)'));
  assert.match(chosen.credit.text,/Photo via Deezer/);
 }
});
test('prefer an exact verified full-group photo over an isolated member of the billing',()=>{
 const name='Brian Fallon & The Painkillers';
 const all={artists:{
  [artistKey(name)]:{image:photoB,credit:{text:'Photo of group',url:'https://www.deezer.com/artist/999'}},
  'brian fallon':{image:photoA,credit:{text:'Solo artist',url:'https://www.deezer.com/artist/123'}}
 }};
 const found=resolveConcertImage(ev(name),all);
 assert.equal(found.url,photoB);
 assert.equal(found.credit.text,'Photo of group');
});
test('all image providers lookup only individual exact performers, never a speculative combined act name',()=>{
 const list=selectArtistCandidates([
  ev('Employed To Serve & CABAL'),
  ev('Maite Hontelé & La Novia'),
  ev('Deer Park, Touching Ice & The Healing Power Of Horses')
 ],{artists:{}},{today:'2026-11-08'});
 assert.deepEqual(list.map(x=>x.key).sort(),[
  'employed to serve','cabal','maite hontele','la novia',
  'deer park','touching ice','the healing power of horses'
 ].sort());
 assert.ok(list.every(x=>!x.name.includes(' & ')&&!x.name.includes(', ')));
});
test('event posters still win, and correctly labelled artist image is a safe fallback',()=>{
 const poster='https://example.org/official-verified-poster.jpg';
 const title='Employed To Serve & CABAL';
 const given=ev(title,{image:poster});
 assert.equal(resolveConcertImage(given,cache).url,poster);
 const backup=resolveConcertImageBackup(given,cache);
 assert.equal(backup.url,photoA);
 assert.match(backup.credit.text,/Employed To Serve \(billed act\)/);
});
test('offline coverage audit reflects real newly recoverable cards',()=>{
 const titles=['Employed To Serve & CABAL','Maite Hontelé & La Novia',
  'Deftones, Nine Inch Nails, Korn & Marilyn Manson'];
 const feed={updatedAt:'2026-11-08T18:00:00Z',events:titles.map(x=>ev(x))};
 const a=buildDisplayImageAudit(feed,cache,{records:[]},{today:'2026-11-08'});
 assert.equal(a.totals.total,3);
 assert.equal(a.totals.artistPhoto,3);
 assert.equal(a.totals.noImage,0);
});
