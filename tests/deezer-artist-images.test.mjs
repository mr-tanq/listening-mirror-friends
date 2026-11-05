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
