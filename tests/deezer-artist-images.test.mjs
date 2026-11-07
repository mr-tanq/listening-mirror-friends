import test from 'node:test';
import assert from 'node:assert/strict';
import {artistFromDeezerSearch,selectArtistCandidates,enrichDeezerArtistImages,isUrgentRetryEligible} from '../scripts/deezer-artist-images.mjs';
const picture='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const event=(artist,date='2026-12-01')=>({artist,country:'NL',date,image:'',source:'podiuminfo-agenda'});
test('only exact artist names are accepted, never fuzzy matches',()=>{
 assert.equal(artistFromDeezerSearch({data:[{id:1,name:'Mono Inc.',picture_xl:picture}]},'MONO'),null);
 assert.equal(artistFromDeezerSearch({data:[{id:1,name:'MONO',picture_xl:picture}]},'MONO').image,picture);
 assert.equal(artistFromDeezerSearch({data:[{id:1,name:'MONO',picture_xl:picture},{id:2,name:'MONO',picture_xl:picture}]},'MONO'),null);
});
test('skip festivals and existing band images',()=>{
 const candidates=selectArtistCandidates([event('MONO'),event('MONO'),event('Into Battle Festival'),event('Mogwai')],{artists:{mogwai:{image:picture}}},{today:'2026-11-05'});
 assert.deepEqual(candidates.map(x=>x.key),['mono']);
});
test('includes Greek concerts in artist-image discovery',()=>{
 const greek={...event('Moonspell'),country:'GR'};
 const candidates=selectArtistCandidates([greek,event('MONO')],{artists:{}},{today:'2026-11-05'});
 assert.deepEqual(candidates.map(x=>x.key).sort(),['mono','moonspell']);
});
test('bounded Deezer lookup writes photo into shared cache',async()=>{
 const response={ok:true,json:async()=>({data:[{id:7,name:'MONO',picture_xl:picture}]})};
 const r=await enrichDeezerArtistImages([event('MONO')],{artists:{}},{today:'2026-11-05',maxRequests:1,fetcher:async()=>response,delay:async()=>{}});
 assert.equal(r.stats.found,1);assert.equal(r.cache.artists.mono.image,picture);
});
test('provider failure backs off without breaking the catalog',async()=>{
 const cache={artists:{},attempted:{}};
 const fail=async()=>{throw new Error('blocked');};
 const first=await enrichDeezerArtistImages([event('MONO')],cache,{today:'2026-11-05',fetcher:fail,delay:async()=>{}});
 assert.equal(first.stats.errors,1);
 const again=await enrichDeezerArtistImages([event('MONO')],first.cache,{today:'2026-11-05',fetcher:fail,delay:async()=>{}});
 assert.equal(again.stats.requests,0);
});

test('prioritizes imminent missing photos over distant shows without relaxing exact matching',()=>{
 const events=[
  event('Far Away Artist','2027-02-01'),
  event('Next Week Artist','2026-11-12'),
  event('After Two Weeks','2026-11-24'),
  event('Tomorrow Artist','2026-11-07')
 ];
 const candidates=selectArtistCandidates(events,{artists:{}},{today:'2026-11-06'});
 assert.deepEqual(candidates.map(x=>x.key),[
  'tomorrow artist','next week artist','after two weeks','far away artist'
 ]);
});
test('existing verified artist image is never queued again, including urgent shows',()=>{
 const cache={artists:{'tomorrow artist':{image:picture}}};
 const candidates=selectArtistCandidates([
  event('Tomorrow Artist','2026-11-07'),event('Other Artist','2026-11-08')
 ],cache,{today:'2026-11-06'});
 assert.deepEqual(candidates.map(x=>x.key),['other artist']);
});

test('urgent retry is narrowly limited to old exact not-found results',()=>{
 const item={nextDate:'2026-11-12'};
 assert.equal(isUrgentRetryEligible(item,{reason:'not-found',retryAfter:'2026-11-29'},'2026-11-07'),true);
 assert.equal(isUrgentRetryEligible(item,{reason:'not-found',retryAfter:'2026-12-05'},'2026-11-07'),false);
 assert.equal(isUrgentRetryEligible(item,{reason:'ambiguous-same-name',retryAfter:'2026-12-30'},'2026-11-07'),false);
 assert.equal(isUrgentRetryEligible(item,{reason:'album-cover-as-portrait',retryAfter:'2026-11-29'},'2026-11-07'),false);
 assert.equal(isUrgentRetryEligible({nextDate:'2027-01-02'},{reason:'not-found',retryAfter:'2026-11-29'},'2026-11-07'),false);
 assert.equal(isUrgentRetryEligible(item,{reason:'not-found',retryAfter:'2026-11-29',attemptedAt:'2026-11-06'},'2026-11-07'),false);
});
test('daily urgent retries are capped, still exact and preserve protected backoffs',async()=>{
 const names=Array.from({length:16},(_,i)=>'Unique Act '+String(i).padStart(2,'0'));
 const attempts=Object.fromEntries(names.map(name=>[name.toLowerCase(),{reason:'not-found',retryAfter:'2026-11-29'}]));
 attempts['unique act 00']={reason:'ambiguous-same-name',retryAfter:'2027-01-01'};
 const requested=[];
 const fetcher=async url=>{
  requested.push(url);
  return {ok:true,status:200,json:async()=>({data:[]})};
 };
 const out=await enrichDeezerArtistImages(names.map(name=>event(name,'2026-11-12')),
  {artists:{},attempted:attempts},
  {today:'2026-11-07',fetcher,maxRequests:30,checkAlbumCovers:false,delay:async()=>{}});
 assert.equal(out.stats.urgentRetries,12);
 assert.equal(out.stats.requests,12);
 assert.equal(out.cache.attempted['unique act 00'].reason,'ambiguous-same-name');
 assert.equal(out.cache.attempted['unique act 01'].attemptedAt,'2026-11-07');
 assert.ok(requested.every(url=>url.includes('/search/artist?q=')));
});
