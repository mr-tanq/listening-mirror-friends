import test from 'node:test';
import assert from 'node:assert/strict';
import {validPodiumConcertUrl,allowedPodiumArtistPhoto,enrichPodiuminfoImages} from '../scripts/podiuminfo-images.mjs';
const gig=(n)=>({id:'podiuminfo-'+n,url:'https://www.podiuminfo.nl/concert/'+n+'/Artist/Paard/',date:'2026-11-12',country:'NL',venue:'Paard',artist:'Artist',image:'',source:'podiuminfo-agenda'});
const photo='https://www.podiuminfo.nl/img/artist/100/100_Artist_1.jpg';
test('allow only canonical Podiuminfo concert pages and artist photos',()=>{
 assert.ok(validPodiumConcertUrl(gig(123).url,'podiuminfo-123'));
 assert.equal(validPodiumConcertUrl('https://evil.test/concert/123/foo/bar/baz','podiuminfo-123'),'');
 assert.equal(validPodiumConcertUrl(gig(123).url,'podiuminfo-124'),'');
 assert.equal(allowedPodiumArtistPhoto(photo),photo);
 assert.equal(allowedPodiumArtistPhoto('https://evil.test/img/artist/a.jpg'),'');
});
test('one matching official detail restores a photo and caches it',async()=>{
 let calls=0;const cache={entries:{}};
 const parse=()=>({date:'2026-11-12',venue:'Paard',image:photo});
 const run=()=>enrichPodiuminfoImages([gig(123)],cache,{fetcher:async()=>{calls++;return {ok:true,text:async()=>'<html>Valid page</html>'};},parseConcertPageTitle:parse,today:'2026-11-04',maxRequests:3,delay:async()=>{}});
 const first=await run(),second=await run();
 assert.equal(first.events[0].image,photo);assert.equal(first.stats.found,1);
 assert.equal(second.stats.cacheHits,1);assert.equal(calls,1);
});
test('bad event date is rejected and errors back off',async()=>{
 let calls=0;const cache={entries:{}};
 const fetcher=async()=>{calls++;return {ok:true,text:async()=>'<html/>'};};
 const options={fetcher,parseConcertPageTitle:()=>({date:'2026-11-13',venue:'Paard',image:photo}),today:'2026-11-04',delay:async()=>{}};
 const first=await enrichPodiuminfoImages([gig(222)],cache,options);
 const second=await enrichPodiuminfoImages([gig(222)],cache,options);
 assert.equal(first.events[0].image,'');assert.equal(second.stats.skippedBlocked,1);assert.equal(calls,1);
});
