import test from 'node:test';
import assert from 'node:assert/strict';
import {goodName,selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';

test('real artist names containing night remain eligible for photo lookup',()=>{
 for(const artist of ['Night Moves','The Night Flight Orchestra','Night Ranger','A Night in Texas']){
  assert.equal(goodName(artist),true,artist);
 }
});

test('generic concert night descriptions remain excluded',()=>{
 for(const event of ['Band Night','Jazz Night','Club Night','Open Mic Night','Tribute Night','Night of Metal','Nacht van de Popmuziek','Live Music','Jam Session']){
  assert.equal(goodName(event),false,event);
 }
});

test('night-named artist is queued for all events lacking a poster while generic event nights are not',()=>{
 const events=[
  {id:'one',artist:'Night Moves',artists:['Night Moves'],date:'2026-11-15',country:'NL',image:''},
  {id:'two',artist:'Night Moves',artists:['Night Moves'],date:'2026-11-16',country:'BE',image:''},
  {id:'three',artist:'Jazz Night',artists:['Jazz Night'],date:'2026-11-15',country:'NL',image:''},
  {id:'four',artist:'Night Ranger',artists:['Night Ranger'],date:'2026-11-15',country:'GR',image:'https://example.com/poster.jpg'}
 ];
 const candidates=selectArtistCandidates(events,{artists:{}},{today:'2026-11-09'});
 assert.deepEqual(candidates.map(x=>x.name),['Night Moves']);
 assert.equal(candidates[0].count,2);
});
