import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvent} from '../js/model.js';
import {
 verifiedFestivalLineup,headlinerSearchNames,artistImageOptionsFor,
 resolveConcertImage,resolveConcertImageBackups,resolveConcertImageBackup
} from '../js/artist-images.js';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';

const imageA='https://cdn-images.dzcdn.net/images/artist/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1000x1000-000000-80-0-0.jpg';
const imageB='https://cdn-images.dzcdn.net/images/artist/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/1000x1000-000000-80-0-0.jpg';
const festival={
 id:'festivalinfo-real-edition',artist:'Northern Echo Festival',
 artists:['TBA','Night Moves','MONO','Mogwai','Night Moves','Special Guests'],
 isFestival:true,source:'festivalinfo',date:'2026-12-07',
 country:'NL',venue:'Festival site',image:''
};
const cache={artists:{
 mono:{image:imageA,kind:'artist-photo',source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/100'}},
 mogwai:{image:imageB,kind:'artist-photo',source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/200'}}
}};

test('only genuine lineup acts from verified Festivalinfo editions enter the bounded photo queue',()=>{
 assert.deepEqual(verifiedFestivalLineup(festival),['Night Moves','MONO','Mogwai']);
 assert.deepEqual(headlinerSearchNames(festival),['Night Moves','MONO','Mogwai']);
 assert.deepEqual(selectArtistCandidates([festival],{artists:{}},{today:'2026-11-10'}).map(x=>x.name),
  ['Night Moves','MONO','Mogwai']);
 const long={...festival,artists:Array.from({length:30},(_,i)=>'Music Group '+i)};
 assert.equal(verifiedFestivalLineup(long).length,12);
});

test('existing verified lineup photos recover a festival without a poster and credit the pictured act',()=>{
 const picked=resolveConcertImage(festival,cache);
 assert.equal(picked.url,imageA);
 assert.equal(picked.kind,'artist-photo');
 assert.match(picked.credit.text,/Photo of MONO \(festival lineup\)/);
 assert.equal(artistImageOptionsFor(festival,cache)[1].name,'Mogwai');
 const alts=resolveConcertImageBackups(festival,cache);
 assert.deepEqual(alts.map(x=>x.url),[imageA,imageB]);
 assert.match(alts[1].credit.text,/Photo of Mogwai \(festival lineup\)/);
});

test('official festival poster always takes priority and actual credited artists are its backups',()=>{
 const event={...festival,image:'https://example.org/festival-poster.jpg'};
 assert.equal(resolveConcertImage(event,cache).url,event.image);
 assert.equal(resolveConcertImageBackup(event,cache).url,imageA);
 assert.deepEqual(resolveConcertImageBackups(event,cache).map(x=>x.url),[imageA,imageB]);
});

test('normalization preserves confirmed festival evidence for the browser and backup archive',()=>{
 const normalized=normalizeEvent(festival);
 assert.equal(normalized.isFestival,true);
 assert.equal(resolveConcertImage(normalized,cache).url,imageA);
 assert.equal(normalizeEvent({...festival,source:'manual'}).isFestival,undefined);
 assert.equal(normalizeEvent({...festival,isFestival:false}).isFestival,undefined);
});

test('unverified lineups and non-festival support acts never become photo sources',()=>{
 const suspects=[
  {...festival,isFestival:false},
  {...festival,source:'rocking'},
  {...festival,source:'manual'},
  {...festival,artists:[]},
  {...festival,artists:['TBA','To Be Announced','Live Music']}
 ];
 for(const event of suspects){
  assert.deepEqual(verifiedFestivalLineup(event),[]);
  assert.notEqual(resolveConcertImage(event,cache).url,imageA);
 }
 const gig={id:'concert',artist:'Headliner',artists:['Headliner','MONO'],date:'2026-12-07',
  country:'NL',source:'podiuminfo',image:''};
 assert.equal(resolveConcertImage(gig,cache).kind,'fallback');
 assert.deepEqual(headlinerSearchNames(gig),['Headliner']);
});

test('festival lineup never promotes unsafe images or another event scoped overrides',()=>{
 const suspicious={artists:{
  'night moves':{image:'https://untrusted.example.com/fake.jpg'},
  mono:{...cache.artists.mono,scopes:[{id:'different-edition',date:festival.date,country:'NL',venue:'Festival site'}]}
 }};
 assert.equal(resolveConcertImage(festival,suspicious).kind,'fallback');
 assert.deepEqual(resolveConcertImageBackups(festival,suspicious),[]);
});
