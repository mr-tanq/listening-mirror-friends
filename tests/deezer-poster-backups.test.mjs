import test from 'node:test';
import assert from 'node:assert/strict';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';

const show=(id,artist,date,image='')=>({id,artist,artists:[artist],date,image,country:'NL'});
const TODAY='2026-11-09';

test('no-image concerts outrank poster-only backup discovery regardless of date',()=>{
 const events=[
  show('p','Poster Act','2026-11-10','https://example.com/poster.jpg'),
  show('m','Missing Act','2026-12-01'),
  show('q','Other Poster Act','2026-11-11','https://example.com/other.jpg')
 ];
 const result=selectArtistCandidates(events,{artists:{}},{today:TODAY});
 assert.deepEqual(result.map(x=>x.name),['Missing Act','Poster Act','Other Poster Act']);
 assert.equal(result[0].unpicturedCount,1);
 assert.equal(result[1].unpicturedCount,0);
});

test('artists with both poster and no-image gigs stay in the primary queue',()=>{
 const events=[
  show('p','Shared Artist','2026-11-10','https://example.com/poster.jpg'),
  show('m','Shared Artist','2026-11-20'),
  show('q','Poster Only','2026-11-09','https://example.com/other.jpg')
 ];
 const result=selectArtistCandidates(events,{artists:{}},{today:TODAY});
 assert.deepEqual(result.map(x=>x.name),['Shared Artist','Poster Only']);
 assert.equal(result[0].count,2);
 assert.equal(result[0].unpicturedCount,1);
 assert.equal(result[0].firstUnpicturedDate,'2026-11-20');
});

test('verified cached artist photo prevents needless lookups for either poster state',()=>{
 const events=[
  show('p','Known Artist','2026-11-15','https://example.com/poster.jpg'),
  show('m','Known Artist','2026-11-16'),
  show('z','Unknown Artist','2026-11-17')
 ];
 const cache={artists:{'known artist':{
  kind:'artist-photo',source:'deezer',image:'https://cdn-images.dzcdn.net/images/artist/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1000x1000-000000-80-0-0.jpg'
 }}};
 const result=selectArtistCandidates(events,cache,{today:TODAY});
 assert.deepEqual(result.map(x=>x.name),['Unknown Artist']);
});

test('expired, unrelated country and fake poster names are not queued',()=>{
 const events=[
  show('old','Old Artist','2026-11-08'),
  {...show('outside','Not Covered','2026-11-15'),country:'US'},
  show('generic','Jazz Night','2026-11-15','https://example.com/poster.jpg')
 ];
 assert.deepEqual(selectArtistCandidates(events,{artists:{}},{today:TODAY}),[]);
});
