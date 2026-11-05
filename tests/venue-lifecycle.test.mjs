/**
 * Multi-day lifecycle of venue-discovered concerts, as the daily workflow
 * runs it: [fetch-events (may fail)] -> [update-venue-catalog] -> commit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RETAINED_SOURCES} from '../scripts/fetch-events.mjs';
import {runVenueStage} from '../scripts/update-venue-catalog.mjs';
import {resolveConcertImage} from '../js/artist-images.js';

const today='2026-11-05';
const ld=o=>'<script type="application/ld+json">'+JSON.stringify(o)+'</script>';
const page=(slug,id,name,date,extra={})=>ld({'@type':'Event',name,startDate:date+'T20:00:00+01:00',url:`https://www.paradiso.nl/programma/${slug}/${id}`,
 location:{name:'Paradiso'},performer:[{name}],...extra})+`<meta property="og:image" content="https://assets.paradiso.nl/images/${slug}.jpg">`;
function site(pages){
 return async url=>{
  const r=(status,text)=>({ok:status===200,status,url,text:async()=>text});
  if(url.endsWith('robots.txt'))return r(200,'User-agent: *\nDisallow:');
  if(url==='https://www.paradiso.nl/')return r(200,'');
  if(url==='https://www.paradiso.nl/sitemap.xml')return r(200,'<sitemapindex><sitemap><loc>https://www.paradiso.nl/sitemap/event_1.xml</loc></sitemap></sitemapindex>');
  if(url==='https://www.paradiso.nl/sitemap/event_1.xml')return r(200,'<urlset>'+Object.keys(pages).map(u=>`<url><loc>${u}</loc></url>`).join('')+'</urlset>');
  return pages[url]?r(200,pages[url]):r(404,'');
 };
}
const NEW='https://www.paradiso.nl/programma/new-band/2900002';
const pages={[NEW]:page('new-band','2900002','New Band','2026-12-03'),
 'https://www.paradiso.nl/programma/mono/2900001':page('mono','2900001','MONO','2026-12-01')};
const podium=(artist,date,id)=>({id,artist,artists:[artist],date,venue:'Paradiso',city:'Amsterdam',country:'NL',image:'',source:'podiuminfo-agenda',url:'https://www.podiuminfo.nl/concert/1/x/Paradiso/'});
const policy={venues:{paradiso:{discovery:true,imageUse:'pending'}}};
const run=(feed,cache,fetcher,p=policy)=>runVenueStage({today,feed,cache,policy:p,fetcher,only:['paradiso'],delay:async()=>{}});
const venueEvents=r=>r.events.filter(e=>e.source==='venue-official');
// What fetch-events keeps from the previous feed when it succeeds.
const carryForward=feed=>({...feed,events:feed.events.filter(e=>RETAINED_SOURCES.includes(e.source))});

test('discovered concerts survive a failed Podiuminfo day, a crashed venue day and a blocked venue',async()=>{
 const day1=await run({events:[podium('MONO','2026-12-01','podiuminfo-1')]},{},site(pages));
 assert.deepEqual(venueEvents(day1).map(e=>e.artist),['New Band']);
 const id=venueEvents(day1)[0].id;

 // Day 2: Podiuminfo returned 403 -> fetch-events wrote nothing; venue stage re-runs on yesterday's feed.
 const day2=await run({events:day1.events},day1.cache,site(pages));
 assert.equal(venueEvents(day2).length,1);
 assert.equal(venueEvents(day2)[0].id,id);                // stable id keeps users' Going/Pass decisions

 // Day 3: Podiuminfo succeeded but the venue stage crashed -> fetch-events still carried it forward.
 assert.ok(RETAINED_SOURCES.includes('venue-official'));
 assert.equal(carryForward({events:day2.events}).events.filter(e=>e.id===id).length,1);

 // Day 4: the venue blocks us (403) -> cached official data is kept, the concert stays.
 const blocked=async url=>({ok:false,status:403,url,text:async()=>''});
 const day4=await run({events:day2.events},day2.cache,blocked);
 assert.equal(venueEvents(day4).length,1);
});

test('when Podiuminfo later lists the same show, exactly one card remains',async()=>{
 const day1=await run({events:[]},{},site(pages));
 const both={events:[...carryForward({events:day1.events}).events,podium('New Band','2026-12-03','podiuminfo-9')]};
 const day2=await run(both,day1.cache,site(pages));
 const cards=day2.events.filter(e=>e.date==='2026-12-03');
 assert.equal(cards.length,1);
 assert.equal(cards[0].id,'podiuminfo-9');
 assert.equal(cards[0].officialUrl,NEW);                  // keeps the confirmed official link
 assert.equal(day2.report.totals.venueEventsRemoved.duplicate,1);
});

test('cancelled or delisted shows and switched-off venues are removed; repeated runs never duplicate',async()=>{
 const day1=await run({events:[]},{},site(pages));
 let feed={events:day1.events},cache=day1.cache;
 for(let i=0;i<3;i++){const r=await run(feed,cache,site(pages));feed={events:r.events};cache=r.cache;}
 assert.equal(venueEvents({events:feed.events}).length,2);   // New Band + MONO, once each
 const cancelled={...pages,[NEW]:page('new-band','2900002','New Band','2026-12-03',{eventStatus:'https://schema.org/EventCancelled'})};
 const stale={...cache,venues:{paradiso:{...cache.venues.paradiso,pages:{}}}}; // force a re-fetch
 const c=await run(feed,stale,site(cancelled));
 assert.ok(!venueEvents(c).some(e=>e.url===NEW));
 const {[NEW]:_,...delisted}=pages;
 const d=await run(feed,stale,site(delisted));
 assert.ok(!venueEvents(d).some(e=>e.url===NEW));
 const off=await run(feed,cache,site(pages),{venues:{paradiso:{discovery:false,imageUse:'pending'}}});
 assert.equal(venueEvents(off).length,0);
});

test('pending images are never published, and Deezer/Commons fallbacks still apply',async()=>{
 const r=await run({events:[podium('MONO','2026-12-01','podiuminfo-1')]},{},site(pages));
 assert.ok(r.candidates.length>=1);
 assert.ok(r.candidates.every(c=>c.published===false));
 assert.ok(r.events.every(e=>!e.image));
 const deezer='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
 const mono=r.events.find(e=>e.id==='podiuminfo-1');
 assert.equal(resolveConcertImage(mono,{artists:{mono:{image:deezer,source:'deezer'}}}).url,deezer);
 const commons='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/New_Band.jpg/960px-New_Band.jpg';
 const nb=venueEvents(r)[0];
 assert.equal(resolveConcertImage(nb,{artists:{'new band':{image:commons,source:'wikimedia-commons',credit:{text:'Photo: X · CC BY 2.0',url:'https://commons.wikimedia.org/wiki/File:New_Band.jpg'}}}}).credit.text,'Photo: X · CC BY 2.0');
});

test('repository policy: every venue image permission is still pending (or denied)',()=>{
 const p=JSON.parse(readFileSync(new URL('../data/nl-venue-sources.json',import.meta.url),'utf8'));
 for(const [id,v] of Object.entries(p.venues))assert.ok(['pending','denied'].includes(v.imageUse),id);
});

test('daily workflow runs the venue stage and commits even when the Podiuminfo step fails',()=>{
 const yml=readFileSync(new URL('../.github/workflows/update-events.yml',import.meta.url),'utf8');
 const catalog=yml.indexOf('id: catalog'),venue=yml.indexOf('node scripts/update-venue-catalog.mjs'),commit=yml.indexOf('Commit public catalog');
 assert.ok(catalog>0&&venue>catalog&&commit>venue);
 const cond="if: ${{ !cancelled() && steps.catalog.conclusion != 'skipped' }}";
 assert.equal(yml.split(cond).length-1,2);
 for(const f of ['data/venue-events.json','data/venue-image-candidates.json'])assert.ok(yml.includes(f),f);
 assert.match(yml,/timeout-minutes: 35/);
});
