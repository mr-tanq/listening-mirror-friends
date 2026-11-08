import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichPodiuminfoImages} from '../scripts/podiuminfo-images.mjs';

const event=(n,name='Artist')=>({
 id:'podiuminfo-'+n,url:'https://www.podiuminfo.nl/concert/'+n+'/'+name+'/Paard/',
 date:'2026-11-12',country:'NL',venue:'Paard',artist:name,image:'',
 source:'podiuminfo-agenda'
});
const image='https://www.podiuminfo.nl/img/artist/100/100_Artist_1.jpg';
const good={
 ok:true,status:200,text:async()=>'<html>Canonical event</html>'
};
const parse=()=>({date:'2026-11-12',venue:'Paard',image});

test('one HTTP 403 stops requests to other Podiuminfo concert pages immediately',async()=>{
 const ids=[1,2,3,4].map(x=>event(x));
 const calls=[];
 const cache={entries:{}};
 const opts={today:'2026-11-08',parseConcertPageTitle:parse,maxRequests:45,
  delay:async()=>{},fetcher:async url=>{calls.push(url);return {ok:false,status:403};}};
 const first=await enrichPodiuminfoImages(ids,cache,opts);
 assert.equal(calls.length,1);
 assert.equal(first.stats.requests,1);
 assert.equal(first.stats.hostDeniedRequests,1);
 assert.equal(first.stats.hostAccess,'HTTP 403');
 assert.equal(first.stats.hostRetryAfter,'2026-11-15');
 assert.equal(first.cache.hostAccess.retryAfter,'2026-11-15');
 assert.equal(first.stats.found,0);
 const next=await enrichPodiuminfoImages(ids,cache,opts);
 assert.equal(next.stats.requests,0);
 assert.equal(next.stats.skippedBlocked,ids.length);
 assert.equal(calls.length,1);
});

test('host denial inherited from historical failures suppresses a whole blocked site without new requests',async()=>{
 const ids=[11,12,13,14].map(x=>event(x));
 const cache={entries:Object.fromEntries(ids.slice(0,3).map(e=>[e.id,{
  reason:'HTTP 403',retryAfter:'2026-11-12',checkedAt:'2026-11-05T12:00:00Z'}]))};
 let calls=0;
 const r=await enrichPodiuminfoImages(ids,cache,{today:'2026-11-08',
  fetcher:async()=>{calls++;throw Error('should not request blocked host')},
  parseConcertPageTitle:parse,maxRequests:45
 });
 assert.equal(calls,0);
 assert.equal(r.stats.requests,0);
 assert.equal(r.stats.skippedBlocked,4);
 assert.equal(r.cache.hostAccess.reason,'HTTP 403');
 assert.equal(r.cache.hostAccess.retryAfter,'2026-11-12');
 assert.equal(r.cache.hostAccess.seededFromEntries,3);
});

test('old cached artist photos remain available when the host is blocked',async()=>{
 const ids=[event(21,'Known Band'),event(22,'Known Band')];
 const cache={
  entries:{'podiuminfo-21':{image,kind:'artist-photo'}},
  hostAccess:{reason:'HTTP 403',retryAfter:'2026-11-15'}
 };
 let calls=0;
 const r=await enrichPodiuminfoImages(ids,cache,{today:'2026-11-08',
  fetcher:async()=>{calls++;throw Error('blocked')},maxRequests:5
 });
 assert.equal(calls,0);
 assert.equal(r.stats.cacheHits,2);
 assert.deepEqual(r.events.map(e=>e.image),[image,image]);
});

test('one scheduled successful probe clears historical 403 suppression and allows normal recovery',async()=>{
 const ids=[31,32,33].map(x=>event(x));
 const cache={entries:Object.fromEntries(ids.map(e=>[e.id,{
  reason:'HTTP 403',retryAfter:'2026-11-12',checkedAt:'2026-11-05T12:00:00Z'}]))};
 let calls=0;
 const fetcher=async()=>{calls++;return good;};
 const opts={today:'2026-11-12',maxRequests:5,delay:async()=>{},
  parseConcertPageTitle:parse,fetcher};
 const r=await enrichPodiuminfoImages(ids,cache,opts);
 // One recovered artist image is reusable for all matching future
 // concerts, so we should not make three redundant provider requests.
 assert.equal(calls,1);
 assert.equal(r.stats.found,1);
 assert.equal(r.stats.cacheHits,2);
 assert.ok(r.events.every(e=>e.image===image));
 assert.equal(r.cache.hostAccess,undefined); // no active historic cooldown at expiry
 // If a previous denied hostAccess exists, it gets replaced with 'available'.
 const cache2={entries:{},hostAccess:{reason:'HTTP 403',retryAfter:'2026-11-08'}};
 const out=await enrichPodiuminfoImages([event(41)],cache2,opts);
 assert.equal(out.cache.hostAccess.reason,'available');
 assert.equal(out.stats.found,1);
});

test('when a scheduled probe is also denied, stop again and renew one-week backoff',async()=>{
 const cache={entries:{},hostAccess:{reason:'HTTP 403',retryAfter:'2026-11-08'}};
 let calls=0;
 const r=await enrichPodiuminfoImages([event(51),event(52),event(53)],cache,{
  today:'2026-11-08',maxRequests:45,delay:async()=>{},
  parseConcertPageTitle:parse,fetcher:async()=>{calls++;return {ok:false,status:403};}
 });
 assert.equal(calls,1);
 assert.equal(r.cache.hostAccess.retryAfter,'2026-11-15');
 assert.equal(r.stats.requests,1);
});
