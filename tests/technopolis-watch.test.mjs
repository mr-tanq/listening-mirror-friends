import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTechnopolisMusicPage,watchTechnopolisMusic} from '../scripts/technopolis-watch.mjs';
test('empty official music calendar does not create unverified concerts',()=>{
 const r=inspectTechnopolisMusicPage('<html><h2>Events List</h2><p>Δεν βρέθηκαν σχετικές εκδηλώσεις. No events found.</p></html>');
 assert.equal(r.status,'empty');
});
test('a changed official music category is flagged for review rather than guessed',()=>{
 const r=inspectTechnopolisMusicPage('<html><h2>Events from category</h2><a href="/concert/one">Concert</a></html>');
 assert.equal(r.status,'review-required');
});
test('official category check can run without actual network in tests',async()=>{
 const r=await watchTechnopolisMusic({fetcher:async()=>({ok:true,text:async()=>'<h2>Events List</h2>No events found'})});
 assert.equal(r.status,'empty');
});
