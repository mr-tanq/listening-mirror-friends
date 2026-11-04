import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVerifiedPosters} from '../scripts/verified-posters.mjs';
const rule={ids:['rocking-20261127-27384'],image:'https://images.rocking.gr/posters/2026/500/PrayingMantis26.jpg',sourceUrl:'https://www.rocking.gr/agenda/2026/11/27/27384'};
test('uses reviewed poster only for its exact event id',()=>{
 const events=[{id:'rocking-20261127-27384',image:''},{id:'rocking-20261128-27384',image:''}];
 const result=applyVerifiedPosters(events,{records:[rule]});
 assert.equal(result.applied,1);
 assert.equal(result.events[0].image,rule.image);
 assert.equal(result.events[1].image,'');
});
test('rejects external images and source URLs',()=>{
 const a=applyVerifiedPosters([{id:rule.ids[0],image:''}],{records:[{...rule,image:'https://evil.example/hijack.jpg'},{...rule,sourceUrl:'https://fake.test'}]});
 assert.equal(a.applied,0);assert.equal(a.invalid,2);
});
