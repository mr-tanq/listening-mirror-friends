import test from 'node:test';
import assert from 'node:assert/strict';
import {artistFromDeezerSearch,selectArtistCandidates,enrichDeezerArtistImages} from '../scripts/deezer-artist-images.mjs';
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

test('one imminent not-found gets an early retry, then obeys new cooldown',async()=>{
 const events=[event('Rymden','2026-11-10')];
 const cache={artists:{},attempted:{rymden:{reason:'not-found',retryAfter:'2026-12-05'}}};
 const calls=[];
 const mock=async url=>{calls.push(url);return {ok:true,json:async()=>({data:[]})};};
 const first=await enrichDeezerArtistImages(events,cache,{today:'2026-11-07',maxUrgentRetries:1,fetcher:mock,delay:async()=>{}});
 assert.equal(first.stats.urgentRetriesUsed,1);
 assert.equal(calls.length,1);
 assert.equal(first.cache.attempted.rymden.urgentRetried,true);
 const second=await enrichDeezerArtistImages(events,first.cache,{today:'2026-11-08',fetcher:mock,delay:async()=>{}});
 assert.equal(second.stats.requests,0);
});
test('urgent retries do not bypass ambiguous identity, album-cover or provider failure cooldowns',async()=>{
 const names=['Ambiguous Name','Cover Name','Provider Failure'];
 const cache={artists:{},attempted:{
  'ambiguous name':{reason:'ambiguous-same-name',retryAfter:'2027-01-04'},
  'cover name':{reason:'album-cover-as-portrait',retryAfter:'2026-12-05'},
  'provider failure':{reason:'Deezer quota exceeded',retryAfter:'2026-11-09'}
 }};
 const fail=async()=>{throw Error('Provider must not be contacted');};
 const result=await enrichDeezerArtistImages(names.map(x=>event(x,'2026-11-08')),cache,{
  today:'2026-11-07',maxUrgentRetries:12,fetcher:fail,delay:async()=>{}
 });
 assert.equal(result.stats.requests,0);
 assert.equal(result.stats.urgentRetriesUsed,0);
});
test('urgent rescue is limited per run, even across many near-term artists',async()=>{
 const names=['A Artist','B Artist','C Artist'];
 const attempted=Object.fromEntries(names.map(n=>[n.toLowerCase(),{reason:'not-found',retryAfter:'2026-12-05'}]));
 const result=await enrichDeezerArtistImages(names.map(n=>event(n,'2026-11-09')),
  {artists:{},attempted},{today:'2026-11-07',maxUrgentRetries:1,
   fetcher:async()=>({ok:true,json:async()=>({data:[]})}),delay:async()=>{}});
 assert.equal(result.stats.urgentRetriesUsed,1);
 assert.equal(result.stats.requests,1);
});
