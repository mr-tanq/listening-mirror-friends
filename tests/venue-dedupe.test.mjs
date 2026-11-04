import test from 'node:test';
import assert from 'node:assert/strict';
import {sameVenueGig,dedupeGreekVenueConcerts,canonicalVenue} from '../scripts/venue-dedupe.mjs';
const gig=(artist,venue='AN Club',date='2026-11-11',source='more')=>({
 id:source+'-'+artist,artist,artists:[artist],venue,date,country:'GR',source,image:'',genre:'',url:'https://example.com'});
test('merge fuller billing at same venue and date without changing first event id',()=>{
 const short=gig('KWOON');
 const detailed={...gig("KWOON ''For the first time in 14 years''",'AN Club','2026-11-11','anclub-index'),image:'https://example.com/poster.jpg'};
 const merged=dedupeGreekVenueConcerts([short,detailed]);
 assert.equal(merged.events.length,1);assert.equal(merged.duplicates,1);
 assert.equal(merged.events[0].id,short.id);
 assert.equal(merged.events[0].image,detailed.image);
});
test('normalize venue aliases, but never merge other venue same day',()=>{
 assert.equal(canonicalVenue('Gagarin 205 Live Music Space'),'gagarin-205');
 assert.equal(canonicalVenue('Κύτταρο'),'kyttaro');
 assert.equal(sameVenueGig(gig('Igorrr','Gagarin 205'),gig('Igorrr','Floyd')),false);
 assert.equal(dedupeGreekVenueConcerts([gig('Igorrr','Gagarin 205'),gig('Igorrr','Floyd')]).events.length,2);
});
test('do not merge unrelated artists even when playing same venue/date',()=>{
 const rows=[gig('Black Curse'),gig('Cursed Blood')];
 assert.equal(dedupeGreekVenueConcerts(rows).events.length,2);
});
test('merge official longer lineups and preserved original source artwork',()=>{
 const shorter={...gig('Warning'),image:'https://example.com/more.jpg'};
 const longer=gig('Warning (UK) + The Temple (GR)','AN Club','2026-11-11','anclub-index');
 const x=dedupeGreekVenueConcerts([shorter,longer]);
 assert.equal(x.events.length,1);
 assert.equal(x.events[0].image,shorter.image);
});
