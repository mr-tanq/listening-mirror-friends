/**
 * Regression tests for PR #2 review:
 *  1. a shared word between two artists is not a duplicate (Black Midi /
 *     Black Country, New Road), in discovery AND in later reconciliation;
 *  2. absence from a (partial) listing never deletes a concert; only the
 *     event's own page (cancelled / other date / 404-410 twice) does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runVenueStage} from '../scripts/update-venue-catalog.mjs';
import {showIdentity,reconcileVenueEvents} from '../scripts/venue-sources/pipeline.mjs';
import {adapterById} from '../scripts/venue-sources/adapters.mjs';

const paradiso=adapterById('paradiso');
const ld=o=>'<script type="application/ld+json">'+JSON.stringify(o)+'</script>';
const url=(slug,id)=>`https://www.paradiso.nl/programma/${slug}/${id}`;
const page=(slug,id,name,date,extra={})=>ld({'@type':'Event',name,startDate:date+'T20:00:00+01:00',url:url(slug,id),
 location:{name:'Paradiso'},performer:[{name}],...extra});
// A venue site whose sitemap lists only `listed` pages (a partial listing),
// while `pages` holds every event page that still exists.
function site(pages,listed=Object.keys(pages)){
 return async u=>{
  const r=(status,text)=>({ok:status===200,status,url:u,text:async()=>text});
  if(u.endsWith('robots.txt'))return r(200,'User-agent: *\nDisallow:');
  if(u==='https://www.paradiso.nl/')return r(200,'');
  if(u==='https://www.paradiso.nl/sitemap.xml')return r(200,'<sitemapindex><sitemap><loc>https://www.paradiso.nl/sitemap/event_1.xml</loc></sitemap></sitemapindex>');
  if(u==='https://www.paradiso.nl/sitemap/event_1.xml')return r(200,'<urlset>'+listed.map(x=>`<url><loc>${x}</loc></url>`).join('')+'</urlset>');
  return pages[u]?r(200,pages[u]):r(404,'');
 };
}
const podium=(artist,date,id)=>({id,artist,artists:[artist],date,venue:'Paradiso',city:'Amsterdam',country:'NL',image:'',source:'podiuminfo-agenda'});
const policy={venues:{paradiso:{discovery:true,imageUse:'pending'}}};
const run=(feed,cache,fetcher,today='2026-11-05')=>runVenueStage({today,feed,cache,policy,fetcher,only:['paradiso'],delay:async()=>{}});
const venueEvents=r=>r.events.filter(e=>e.source==='venue-official');

const BCNR=url('black-country-new-road','3000001');
const twoShows={[BCNR]:page('black-country-new-road','3000001','Black Country, New Road','2026-12-03'),
 [url('black-midi','3000002')]:page('black-midi','3000002','Black Midi','2026-12-03')};

test('shared words are not identity: Black Midi vs Black Country, New Road',()=>{
 const o={url:BCNR,title:'Black Country, New Road',performers:['Black Country, New Road'],date:'2026-12-03',venueName:'Paradiso'};
 assert.equal(showIdentity(podium('Black Midi','2026-12-03','p1'),o,paradiso),'different');
 assert.equal(showIdentity(podium('Black Country, New Road','2026-12-03','p2'),o,paradiso),'same');
 assert.equal(showIdentity(podium('Black Country New Road','2026-12-03','p3'),o,paradiso),'same');
 // the same official URL is identity even when names differ
 assert.equal(showIdentity({...podium('BC,NR','2026-12-03','p4'),officialUrl:BCNR+'/'},o,paradiso),'same');
 // whole-name extension is only 'possible'
 assert.equal(showIdentity(podium('De Jukebox','2026-12-03','p5'),{...o,url:url('de-jukebox-17','1'),title:'De Jukebox #17',performers:[]},paradiso),'possible');
 // other night or venue: never the same show
 assert.equal(showIdentity(podium('Black Country, New Road','2026-12-04','p6'),o,paradiso),'different');
});

test('both same-night shows survive discovery and every later daily reconciliation',async()=>{
 const feed={events:[podium('Black Midi','2026-12-03','podiuminfo-bm')]};
 const d1=await run(feed,{},site(twoShows));
 assert.deepEqual(venueEvents(d1).map(e=>e.artist),['Black Country, New Road']);
 assert.ok(d1.events.some(e=>e.id==='podiuminfo-bm'));
 let f={events:d1.events},c=d1.cache;
 for(let day=0;day<3;day++){const r=await run(f,c,site(twoShows));f={events:r.events};c=r.cache;
  assert.equal(r.report.totals.venueEventsRemoved.duplicate,0);}
 const night=f.events.filter(e=>e.date==='2026-12-03').map(e=>e.artist).sort();
 assert.deepEqual(night,['Black Country, New Road','Black Midi']);
 // ...and the reverse: Podiuminfo later lists BCNR -> only the venue copy of BCNR goes, Black Midi stays
 const r=await run({events:[...f.events,podium('Black Country, New Road','2026-12-03','podiuminfo-bcnr')]},c,site(twoShows));
 assert.deepEqual(r.events.filter(e=>e.date==='2026-12-03').map(e=>e.id).sort(),['podiuminfo-bcnr','podiuminfo-bm']);
 assert.equal(r.report.totals.venueEventsRemoved.duplicate,1);
});

test('reconciliation never deletes on a single shared word or a possible match',()=>{
 const cache={venues:{paradiso:{pages:{}}}};
 const venue={id:'venue-paradiso-2026-12-03-black-country-new-road',artist:'Black Country, New Road',artists:['Black Country, New Road'],date:'2026-12-03',
  venue:'Paradiso',city:'Amsterdam',country:'NL',url:BCNR,source:'venue-official'};
 const jukebox={...venue,id:'venue-paradiso-2026-12-03-de-jukebox-17',artist:'De Jukebox #17',artists:['De Jukebox #17'],url:url('de-jukebox-17','9')};
 const r=reconcileVenueEvents([podium('Black Midi','2026-12-03','p'),podium('De Jukebox','2026-12-03','q'),venue,jukebox],[paradiso],cache,policy,{today:'2026-11-05'});
 assert.equal(r.events.length,4);
 assert.equal(r.removed.duplicate,0);
});

test('a partial listing never deletes a concert; confirmed cancellation does',async()=>{
 const NEW=url('new-band','2900002');
 const pages={[NEW]:page('new-band','2900002','New Band','2026-12-03')};
 const d1=await run({events:[]},{},site(pages));
 assert.equal(venueEvents(d1).length,1);
 // The listing now omits the page (pagination / partial agenda), page still exists.
 let f={events:d1.events},c=d1.cache;
 for(const today of ['2026-11-06','2026-11-14','2026-11-22']){
  const r=await run(f,c,site(pages,[]),today);f={events:r.events};c=r.cache;
  assert.equal(venueEvents(r).length,1,'kept on '+today);
 }
 // Listing empty AND page cancelled on the venue's own page -> removed.
 const cancelled={[NEW]:page('new-band','2900002','New Band','2026-12-03',{eventStatus:'https://schema.org/EventCancelled'})};
 const r=await run(f,c,site(cancelled,[]),'2026-11-30');
 assert.equal(venueEvents(r).length,0);
 assert.equal(r.report.totals.venueEventsRemoved.cancelled,1);
});

test('an event page answering 404 is removed only after a second check on another day',async()=>{
 const NEW=url('new-band','2900002');
 const d1=await run({events:[]},{},site({[NEW]:page('new-band','2900002','New Band','2026-12-03')}));
 const gone=site({},[]);
 const first=await run({events:d1.events},d1.cache,gone,'2026-11-13');
 assert.equal(venueEvents(first).length,1);                       // one 404: kept
 const sameDay=await run({events:first.events},{...first.cache,venues:{paradiso:{...first.cache.venues.paradiso,
  pages:Object.fromEntries(Object.entries(first.cache.venues.paradiso.pages).map(([k,v])=>[k,{...v,checkedAt:'2026-11-01'}]))}}},gone,'2026-11-13');
 assert.equal(venueEvents(sameDay).length,1);                     // a second 404 the same day does not count
 const second=await run({events:first.events},first.cache,gone,'2026-11-21');
 assert.equal(venueEvents(second).length,0);                      // 404 on two different days: removed
 assert.equal(second.report.totals.venueEventsRemoved.gone,1);
});

test('a show moved to another date on its own page replaces the old date',async()=>{
 const NEW=url('new-band','2900002');
 const d1=await run({events:[]},{},site({[NEW]:page('new-band','2900002','New Band','2026-12-03')}));
 const moved=site({[NEW]:page('new-band','2900002','New Band','2026-12-10')});
 const r=await run({events:d1.events},{...d1.cache,venues:{paradiso:{...d1.cache.venues.paradiso,pages:{}}}},moved,'2026-11-20');
 assert.deepEqual(venueEvents(r).map(e=>e.date),['2026-12-10']);
});

test('denied access or network failure keeps everything',async()=>{
 const NEW=url('new-band','2900002');
 const d1=await run({events:[]},{},site({[NEW]:page('new-band','2900002','New Band','2026-12-03')}));
 const blocked=await run({events:d1.events},d1.cache,async u=>({ok:false,status:403,url:u,text:async()=>''}),'2026-11-20');
 assert.equal(venueEvents(blocked).length,1);
 const down=await run({events:d1.events},d1.cache,async()=>{throw new Error('ECONNRESET');},'2026-11-21');
 assert.equal(venueEvents(down).length,1);
});
