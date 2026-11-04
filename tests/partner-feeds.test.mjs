import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePartnerEvent,importedPartnerEvents,mergePartnerEvents} from '../scripts/partner-feeds.mjs';
const entry={artist:'New Indie Band',date:'2027-03-21',venue:'Temple',city:'Αθήνα',country:'GR',url:'https://cometogether.live/event/123',type:'MusicEvent'};
test('permission must be explicitly confirmed',()=>{
 assert.equal(importedPartnerEvents({providers:{cometogether:{events:[entry]}}}).events.length,0);
 assert.equal(importedPartnerEvents({providers:{cometogether:{permissionConfirmed:true,events:[entry]}}}).events.length,1);
});
test('reject third party URLs, nonmusic and impossible dates',()=>{
 assert.equal(validatePartnerEvent(entry,'cometogether')?.city,'Athens');
 for(const x of [{...entry,url:'https://invalid.example/show'}, {...entry,type:'Film'}, {...entry,date:'2027-02-31'},{...entry,date:''},{...entry,venue:''}])assert.equal(validatePartnerEvent(x,'cometogether'),null);
});
test('do not overwrite existing concert with a partner duplicate',()=>{
 const event=validatePartnerEvent(entry,'cometogether');
 const other={...event,id:'more-123',source:'more'};
 const merged=mergePartnerEvents([other],[event]);
 assert.equal(merged.added,0);assert.equal(merged.duplicates,1);assert.equal(merged.events[0].id,'more-123');
});
test('distinct venues for an artist on the same date stay distinct',()=>{
 const a=validatePartnerEvent(entry,'cometogether');
 const b=validatePartnerEvent({...entry,venue:'Different Club'},'cometogether');
 assert.equal(mergePartnerEvents([a],[b]).events.length,2);
});
