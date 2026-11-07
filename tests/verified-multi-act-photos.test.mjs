import test from 'node:test';
import assert from 'node:assert/strict';
import {explicitlyBilledArtists,headlinerSearchNames,headlinerNames,
 resolveConcertImage,resolveConcertImageBackup} from '../js/artist-images.js';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';
import {buildDisplayImageAudit} from '../scripts/display-image-audit.mjs';

const photo='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const poster='https://example.org/approved-event-poster.jpg';
const event=(artist,extra={})=>({id:'podiuminfo-bill',artist,artists:[artist],
 date:'2026-11-11',country:'NL',venue:'Vera',image:'',source:'podiuminfo-agenda',...extra});
const cache={artists:{
 shearwater:{image:photo,source:'deezer',sourceUrl:'https://www.deezer.com/artist/123',
  credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/123'}}
}};

test('multi-act bill uses an existing verified photo of one expressly billed artist with an honest label',()=>{
 const e=event('Any Kind / LOMA / Shearwater');
 assert.deepEqual(explicitlyBilledArtists(e),['Any Kind','LOMA','Shearwater']);
 assert.deepEqual(headlinerSearchNames(e),['Any Kind','LOMA','Shearwater']);
 assert.equal(headlinerNames(e)[0],e.artist); // No change to venue dedup identity
 const answer=resolveConcertImage(e,cache);
 assert.equal(answer.url,photo);
 assert.equal(answer.kind,'artist-photo');
 assert.match(answer.credit.text,/Photo of Shearwater \(billed act\)/);
 assert.match(answer.credit.text,/Photo via Deezer/);
 assert.equal(answer.credit.url,'https://www.deezer.com/artist/123');
 assert.doesNotMatch(answer.credit.text,/headliner/i);
 assert.equal(selectArtistCandidates([e],cache,{today:'2026-11-07'}).length,0);
});

test('without an existing photo the common pipeline searches each explicitly billed artist by exact name',()=>{
 const e=event('Any Kind / LOMA / Shearwater');
 const names=selectArtistCandidates([e],{artists:{}},{today:'2026-11-07'}).map(x=>x.key);
 assert.deepEqual(names,['any kind','loma','shearwater']);
 assert.equal(resolveConcertImage(e,{artists:{'the who':cache.artists.shearwater}}).url,'');
});

test('real event poster still wins, with labelled band photo as fallback if poster fails',()=>{
 const e=event('Any Kind / LOMA / Shearwater',{image:poster});
 const actual=resolveConcertImage(e,cache);
 assert.equal(actual.kind,'event-poster');assert.equal(actual.url,poster);
 const backup=resolveConcertImageBackup(e,cache);
 assert.equal(backup.kind,'artist-photo');assert.equal(backup.url,photo);
 assert.match(backup.credit.text,/Photo of Shearwater \(billed act\)/);
});

test('reject ambiguous slash notation and any temptation to use tribute subject photos',()=>{
 for(const title of ['AC/DC','Tool/Lateralus','Jazz / Live','The Who Tribute / Cover Night',
  'A / B','A / B / C / D / E / F','MONO / MONO']){
  assert.deepEqual(explicitlyBilledArtists(event(title)),[],title);
 }
 assert.deepEqual(headlinerSearchNames(event('AC/DC')),['AC/DC']);
 assert.deepEqual(headlinerSearchNames(event('Earth, Wind & Fire')),['Earth, Wind & Fire']);
 // The actual tribute cover act and cited subject must never be mixed up.
 const wrong=event('The Who Tribute / Cover Night');
 assert.equal(resolveConcertImage(wrong,{artists:{'the who':cache.artists.shearwater}}).url,'');
});

test('offline audit and browser resolver agree on multi-act photo and correctly count missing bills',()=>{
 const withPhoto=event('Any Kind / LOMA / Shearwater');
 const missing=event('Other Act / More Performers',{id:'other-bill'});
 const feed={events:[withPhoto,missing],updatedAt:'2026-11-07T22:00:00Z'};
 const r=buildDisplayImageAudit(feed,cache,{records:[]},{today:'2026-11-07'});
 assert.deepEqual(r.totals,{total:2,eventPoster:0,artistPhoto:1,noImage:1,posterWithPhotoBackup:0});
 assert.equal(r.missingReasons['not-in-artist-cache'],1);
});
