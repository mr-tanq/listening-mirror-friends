import test from 'node:test';
import assert from 'node:assert/strict';
import {robotsRules,robotsAllows,jsonLdEvents,localDate,openGraphImage,sitemapEntries,createVenueClient,icalEvents} from '../scripts/venue-sources/core.mjs';
import {parseEventPage,timeTagDate} from '../scripts/venue-sources/parse.mjs';
import {scoreMatch,bestOfficialMatch} from '../scripts/venue-sources/match.mjs';
import {adapterById} from '../scripts/venue-sources/adapters.mjs';
import {refreshVenue,enrichCatalogue,discoverFromVenues,prioritise,listEventUrls} from '../scripts/venue-sources/pipeline.mjs';
import {runVenueStage} from '../scripts/update-venue-catalog.mjs';

const paradiso=adapterById('paradiso'),patronaat=adapterById('patronaat'),doornroosje=adapterById('doornroosje'),o13=adapterById('013');
const ld=obj=>'<script type="application/ld+json">'+JSON.stringify(obj)+'</script>';
const og=(title,image)=>`<meta property="og:title" content="${title}"><meta property="og:image" content="${image}">`;
const cat=(artist,date,venue,extra={})=>({id:'podiuminfo-'+artist.length+date,artist,artists:[artist],date,venue,city:'X',country:'NL',image:'',...extra});
const res=(status,text,url)=>({ok:status>=200&&status<300,status,url,text:async()=>text});

test('robots.txt rules, wildcards and crawl-delay are honoured',()=>{
 const r=robotsRules('User-agent: *\nDisallow: /wp-admin/\nDisallow: /*?add-to-cart=\nCrawl-delay: 10\nSitemap: https://x.nl/s.xml');
 assert.equal(r.crawlDelay,10);assert.deepEqual(r.sitemaps,['https://x.nl/s.xml']);
 assert.equal(robotsAllows(r,'https://x.nl/event/a/'),true);
 assert.equal(robotsAllows(r,'https://x.nl/shop?add-to-cart=1'),false);
 assert.equal(robotsAllows(robotsRules('User-agent: *\nDisallow: /'),'https://x.nl/agenda'),false);
 assert.equal(robotsAllows(robotsRules('User-agent: *\nDisallow:'),'https://x.nl/agenda'),true);
});

test('dates: timezone-aware, floating and URL-encoded dates',()=>{
 assert.equal(localDate('2026-11-05T23:30:00+00:00'),'2026-11-06'); // 00:30 in Amsterdam
 assert.equal(localDate('2026-11-05T20:00:00+01:00'),'2026-11-05');
 assert.equal(localDate('2021-04-19T20:00'),'2021-04-19');
 assert.equal(patronaat.slugDate('https://patronaat.nl/event/o-r-k-05-11-26/'),'2026-11-05');
 assert.equal(timeTagDate('<time datetime="2026-12-01T20:00">x</time><time datetime="2026-12-01">'),'2026-12-01');
 assert.equal(timeTagDate('<time datetime="2026-12-01"><time datetime="2026-12-02">'),'');
});

test('Paradiso JSON-LD: performers, support and off-site shows',()=>{
 const html=ld({'@context':'https://schema.org','@type':'Event',name:'The Clockworks + Danny Blue',startDate:'2026-11-05T18:30:00+01:00',
  url:'https://www.paradiso.nl/programma/the-clockworks/2836738',location:{'@type':'Place',name:'Tolhuistuin'},
  performer:[{'@type':'PerformingGroup',name:'The Clockworks'},{'@type':'PerformingGroup',name:'Danny Blue'}],
  image:'https://assets.paradiso.nl/images/transforms/event/_1280x640_crop_center-center_none/1-5.jpg'})+
  og('The Clockworks | Paradiso','https://assets.paradiso.nl/images/transforms/event/_1200x630_crop_center-center_none/1-5.jpg');
 const o=parseEventPage(html,'https://www.paradiso.nl/programma/the-clockworks/2836738',paradiso);
 assert.deepEqual([o.date,o.performers,o.venueName,o.via],['2026-11-05',['The Clockworks','Danny Blue'],'Tolhuistuin','json-ld']);
 assert.match(o.image,/_1200x630/);
 // Off-site promoted show never matches a "Paradiso" catalogue entry
 assert.deepEqual(scoreMatch(cat('The Clockworks','2026-11-05','Paradiso'),o,paradiso).reasons.at(-1),'off-site:Tolhuistuin');
 const onSite={...o,venueName:'Paradiso - Grote Zaal'};
 assert.equal(scoreMatch(cat('The Clockworks','2026-11-05','Paradiso'),onSite,paradiso).verdict,'match');
 assert.equal(scoreMatch(cat('Danny Blue','2026-11-05','Paradiso'),onSite,paradiso).reasons.at(-1),'catalogue-headliner-is-support');
 const withSupport=cat('The Clockworks','2026-11-05','Paradiso',{artists:['The Clockworks','Danny Blue']});
 assert.equal(scoreMatch(withSupport,onSite,paradiso).score,1);
});

test('013 publishes an Event and a MusicEvent: the MusicEvent with performers wins',()=>{
 const url='https://www.013.nl/programma/128090/rolf-sanchez';
 const html=ld({'@type':'Event',name:'Rolf Sanchez Club Tour - 05 november',url,image:'https://013.ams3.cdn.digitaloceanspaces.com/a.jpg'})+
  ld({'@type':'MusicEvent',name:'Rolf Sanchez',startDate:'2026-11-05T20:00:00+01:00',location:{name:'Poppodium 013 - Main'},url,performer:[{'@type':'MusicGroup',name:'Rolf Sanchez'}]});
 const o=parseEventPage(html,url,o13);
 assert.equal(o.performers[0],'Rolf Sanchez');assert.equal(o.date,'2026-11-05');
 assert.equal(scoreMatch(cat('Rolf Sanchez','2026-11-05','013'),o,o13).verdict,'match');
 // A differently named catalogue entry is not forced into a match
 assert.equal(scoreMatch(cat('De Rolf Sanchez Club','2026-11-05','013'),o,o13).verdict,'reject');
});

test('Doornroosje labels local time as UTC: the written date is used',()=>{
 const url='https://www.doornroosje.nl/event/late-show/';
 const o=parseEventPage(ld({'@type':'Event',name:'Late Show',startDate:'2027-03-12T23:45:00+00:00',performer:[{name:'Late Show'}],location:{name:'Doornroosje - Rode zaal'}}),url,doornroosje);
 assert.equal(o.date,'2027-03-12');
});

test('Patronaat: date from the official URL, title and image from Open Graph',()=>{
 const url='https://patronaat.nl/event/o-r-k-05-11-26/';
 const o=parseEventPage(og('O.R.k. + Hackberry - Patronaat','https://patronaat.nl/app/uploads/2025/11/ORKband2024_2-1024x744.png'),url,patronaat);
 assert.deepEqual([o.title,o.date,o.performers,o.via],['O.R.k. + Hackberry','2026-11-05',['O.R.k.','Hackberry'],'url-date+opengraph']);
 assert.equal(scoreMatch(cat('O.R.k.','2026-11-05','Patronaat'),o,patronaat).verdict,'match');
 assert.equal(scoreMatch(cat('Hackberry','2026-11-05','Patronaat'),o,patronaat).verdict,'reject');
 // no date anywhere: no event
 assert.equal(parseEventPage(og('X','https://patronaat.nl/a.jpg'),'https://patronaat.nl/event/x/',patronaat),null);
});

test('pages with conflicting dates, logos and cancelled shows are refused',()=>{
 const url='https://www.paradiso.nl/programma/x/1';
 const two=ld([{'@type':'Event',name:'X',startDate:'2026-12-01T20:00+01:00'},{'@type':'Event',name:'X',startDate:'2026-12-02T20:00+01:00'}]);
 assert.equal(parseEventPage(two,url,paradiso),null);
 assert.equal(openGraphImage('<meta property="og:image" content="https://www.paradiso.nl/img/logo.png">',url),'');
 const cancelled=parseEventPage(ld({'@type':'Event',name:'X',startDate:'2026-12-01T20:00:00+01:00',eventStatus:'https://schema.org/EventCancelled'}),url,paradiso);
 assert.equal(scoreMatch(cat('X','2026-12-01','Paradiso'),cancelled,paradiso).reasons.at(-1),'cancelled');
});

test('two different official pages that both match are ambiguous',()=>{
 const a={url:'https://www.paradiso.nl/programma/xyz/1',title:'XYZ',performers:['XYZ'],date:'2026-12-01',venueName:''};
 // two different shows that day (e.g. matinee with another bill) stay ambiguous
 const b={...a,url:'https://www.paradiso.nl/programma/xyz-matinee/2',title:'XYZ + Other Band',performers:['XYZ','Other Band']};
 assert.equal(bestOfficialMatch(cat('XYZ','2026-12-01','Paradiso'),[a,b],paradiso).reason,'ambiguous');
 assert.equal(bestOfficialMatch(cat('XYZ','2026-12-01','Paradiso'),[a],paradiso).match.url,a.url);
});

test('sitemaps, iCalendar and JSON-LD graphs are read',()=>{
 assert.deepEqual(sitemapEntries('<urlset><url><loc>https://x.nl/event/a/</loc><lastmod>2026-11-01</lastmod></url></urlset>'),[{loc:'https://x.nl/event/a/',lastmod:'2026-11-01'}]);
 assert.equal(icalEvents('BEGIN:VEVENT\r\nSUMMARY:MONO\r\nDTSTART;TZID=Europe/Amsterdam:20261201T200000\r\nURL:https://x.nl/e\r\nEND:VEVENT')[0].date,'2026-12-01');
 assert.equal(jsonLdEvents(ld({'@graph':[{'@type':'WebPage'},{'@type':'MusicEvent',name:'A',startDate:'2026-12-01'}]}),'https://x.nl/').length,1);
});

test('access denial is respected and remembered; robots-disallowed pages are not fetched',async()=>{
 const calls=[];
 const fetcher=async url=>{calls.push(url);return url.endsWith('robots.txt')?res(200,'User-agent: *\nDisallow: /private',url):res(403,'',url);};
 const state={};
 const client=createVenueClient('https://x.nl',{fetcher,state,today:'2026-11-05',delay:async()=>{}});
 assert.equal(await client.get('https://x.nl/private/a'),null);
 assert.equal((await client.get('https://x.nl/agenda')).status,403);
 assert.equal(state.deniedUntil,'2026-11-12');
 assert.equal(await client.get('https://x.nl/agenda2'),null);
 assert.deepEqual(calls,['https://x.nl/robots.txt','https://x.nl/agenda']);
 await assert.rejects(client.get('https://evil.test/x'));
 // bot challenge pages count as denial
 const c2=createVenueClient('https://y.nl',{fetcher:async u=>res(200,u.endsWith('robots.txt')?'':'<title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script>',u),state:{},today:'2026-11-05',delay:async()=>{}});
 assert.equal((await c2.get('https://y.nl/agenda')).status,403);
 assert.equal(c2.blocked,true);
});

test('blocked and robots-excluded venues make no requests at all',async()=>{
 let calls=0;
 for(const id of ['tivoli','melkweg','dbs']){
  const r=await refreshVenue(adapterById(id),{},{catalogue:[],today:'2026-11-05',fetcher:async()=>{calls++;}});
  assert.match(r.stats.access,/blocked-by-site/);
 }
 assert.equal(calls,0);
});

const paradisoPage=(slug,id,name,date,performers=[name])=>ld({'@type':'Event',name,startDate:date+'T20:00:00+01:00',url:`https://www.paradiso.nl/programma/${slug}/${id}`,
 location:{name:'Paradiso'},performer:performers.map(n=>({name:n}))})+og(name+' | Paradiso',`https://assets.paradiso.nl/images/transforms/event/${slug}.jpg`);
function paradisoSite(){
 const pages={
  'https://www.paradiso.nl/programma/mono/2900001':paradisoPage('mono','2900001','MONO','2026-12-01',['MONO','Jo Quail']),
  'https://www.paradiso.nl/programma/new-band/2900002':paradisoPage('new-band','2900002','New Band','2026-12-03'),
  'https://www.paradiso.nl/programma/lecture-night/2900003':paradisoPage('lecture-night','2900003','Lezing: muziekgeschiedenis','2026-12-04')
 };
 const fetcher=async url=>{
  if(url.endsWith('robots.txt'))return res(200,'User-agent: *\nDisallow:\nSitemap: https://www.paradiso.nl/sitemap.xml',url);
  if(url==='https://www.paradiso.nl/')return res(200,'<a href="/programma/mono/2900001">MONO</a>',url);
  if(url==='https://www.paradiso.nl/sitemap.xml')return res(200,'<sitemapindex><sitemap><loc>https://www.paradiso.nl/sitemap/event_1.xml</loc></sitemap></sitemapindex>',url);
  if(url==='https://www.paradiso.nl/sitemap/event_1.xml')return res(200,'<urlset>'+Object.keys(pages).map(u=>`<url><loc>${u}</loc></url>`).join('')+'</urlset>',url);
  if(pages[url])return res(200,pages[url],url);
  return res(404,'',url);
 };
 return fetcher;
}

test('end to end: images stay candidates until permitted; discovery adds new official concerts only',async()=>{
 const feed={events:[cat('MONO','2026-12-01','Paradiso',{id:'podiuminfo-1',artists:['MONO','Jo Quail']}),cat('Old','2026-10-01','Paradiso',{id:'old'})]};
 const pending={venues:{paradiso:{discovery:true,imageUse:'pending'}}};
 const r=await runVenueStage({today:'2026-11-05',feed,cache:{},policy:pending,fetcher:paradisoSite(),only:['paradiso'],delay:async()=>{}});
 const mono=r.events.find(e=>e.id==='podiuminfo-1');
 assert.equal(mono.officialUrl,'https://www.paradiso.nl/programma/mono/2900001');
 assert.equal(mono.officialMatch.confidence,1);
 assert.equal(mono.image,'');                          // not permitted yet
 assert.equal(r.candidates[0].published,false);
 assert.ok(!r.events.some(e=>e.id==='old'));          // past concerts are dropped
 const added=r.events.filter(e=>e.source==='venue-official');
 assert.deepEqual(added.map(e=>e.artist),['New Band']); // lecture skipped, MONO already known
 assert.equal(added[0].url,'https://www.paradiso.nl/programma/new-band/2900002');
 assert.equal(r.report.venues.paradiso.enrichment.matched,1);

 const permitted={venues:{paradiso:{discovery:true,imageUse:'permitted'}}};
 const r2=await runVenueStage({today:'2026-11-05',feed,cache:r.cache,policy:permitted,fetcher:async()=>{throw new Error('cache should suffice');},only:['paradiso'],delay:async()=>{}});
 const mono2=r2.events.find(e=>e.id==='podiuminfo-1');
 assert.equal(mono2.image,'https://assets.paradiso.nl/images/transforms/event/mono.jpg');
 assert.equal(mono2.imageSource,'venue-official');
 assert.deepEqual(mono2.imageCredit,{text:'Image: Paradiso',url:'https://www.paradiso.nl/programma/mono/2900001'});

 // An existing (verified) event image is never replaced
 const withPoster={events:[{...feed.events[0],image:'https://reviewed.example/poster.jpg'}]};
 const r3=await runVenueStage({today:'2026-11-05',feed:withPoster,cache:r.cache,policy:permitted,fetcher:async()=>res(500,'',''),only:['paradiso'],delay:async()=>{}});
 assert.equal(r3.events.find(e=>e.id==='podiuminfo-1').image,'https://reviewed.example/poster.jpg');

 // Discovery off: nothing is added
 const r4=await runVenueStage({today:'2026-11-05',feed,cache:r.cache,policy:{venues:{paradiso:{discovery:false,imageUse:'pending'}}},fetcher:async()=>res(500,'',''),only:['paradiso'],delay:async()=>{}});
 assert.equal(r4.events.filter(e=>e.source==='venue-official').length,0);
});

test('likely catalogue matches are fetched first; fresh cache entries are skipped',()=>{
 const rows=[{url:'https://www.paradiso.nl/programma/other/1',via:'sitemap'},{url:'https://www.paradiso.nl/programma/mono/2',via:'sitemap'},{url:'https://www.paradiso.nl/programma/cached/3',via:'agenda'}];
 const pages={'https://www.paradiso.nl/programma/cached/3':{checkedAt:'2026-11-04',event:{date:'2026-12-01'}}};
 const order=prioritise(rows,pages,{adapter:paradiso,catalogue:[cat('MONO','2026-12-01','Paradiso')],today:'2026-11-05'});
 assert.deepEqual(order.map(r=>r.url),['https://www.paradiso.nl/programma/mono/2','https://www.paradiso.nl/programma/other/1']);
});

test('Patronaat listing drops past dates before any page is fetched',async()=>{
 const html='<a href="https://patronaat.nl/event/a-01-11-26/">a</a><a href="https://patronaat.nl/event/b-20-11-26/">b</a>';
 const client={get:async u=>({status:200,url:u,text:html})};
 const rows=await listEventUrls(patronaat,client,{today:'2026-11-05'});
 assert.deepEqual(rows.map(r=>r.slugDate),['2026-11-20']);
});

test('room names count as on-site; encoded room names are decoded',()=>{
 const effenaar=adapterById('effenaar'),paard=adapterById('paard');
 const o={url:'https://www.effenaar.nl/agenda/oi-va-voi',title:'Oi Va Voi',performers:[],date:'2026-11-08',venueName:'Kleine Zaal'};
 assert.equal(scoreMatch(cat('Oi Va Voi','2026-11-08','Effenaar'),o,effenaar).verdict,'match');
 assert.equal(scoreMatch(cat('Jeremy Pinnell','2026-11-08','Effenaar'),{...o,title:'Jeremy Pinnell',venueName:'Café Wilhelmina'},effenaar).verdict,'match');
 const page=ld({'@type':'Event',name:'Paardcafé: Ginger ILL',startDate:'2026-11-07T21:00',location:{'@type':'Place',name:'Caf&eacute;'}});
 const p=parseEventPage(page,'https://www.paard.nl/event/ginger-ill/',paard);
 assert.equal(p.venueName,'Café');
 assert.equal(scoreMatch(cat('Paardcafé: Ginger ILL','2026-11-07','Paard'),p,paard).verdict,'match');
 assert.equal(scoreMatch(cat('Ginger ILL','2026-11-07','Paard'),p,paard).verdict,'match');
 // A room name of ANOTHER venue type is still off-site
 assert.equal(scoreMatch(cat('Oi Va Voi','2026-11-08','Effenaar'),{...o,venueName:'Tolhuistuin'},effenaar).verdict,'reject');
});
test('Bibelot: first written date with a year is the event date; sidebars without years are ignored',async()=>{
 const {firstDatedText}=await import('../scripts/venue-sources/parse.mjs');
 const bibelot=adapterById('bibelot');
 const html=og('Loïs Lane - Bibelot','https://bibelot.net/wp-content/uploads/lois.jpg')+'<p>6 november</p><span>vr 6 nov 2026</span><aside>za 29 mrt</aside><aside>za 25 apr 2027</aside>';
 assert.equal(firstDatedText(html),'2026-11-06');
 const o=parseEventPage(html,'https://bibelot.net/programma/lois-lane/',bibelot);
 assert.deepEqual([o.title,o.date,o.via],['Loïs Lane','2026-11-06','text-date+opengraph']);
 assert.equal(scoreMatch(cat('Loïs Lane - 40 jaar!','2026-11-06','Bibelot'),o,bibelot).verdict,'match');
 assert.equal(firstDatedText('<p>31 feb 2026</p>'),'');
});
test('imageUse "denied" stores no image candidates',()=>{
 const cache={venues:{paradiso:{pages:{a:{checkedAt:'2026-11-05',event:{url:'https://www.paradiso.nl/programma/mono/1',title:'MONO',performers:['MONO'],date:'2026-12-01',venueName:'',image:'https://assets.paradiso.nl/x.jpg'}}}}}};
 const r=enrichCatalogue([cat('MONO','2026-12-01','Paradiso')],[paradiso],cache,{venues:{paradiso:{imageUse:'denied'}}},{today:'2026-11-05'});
 assert.equal(r.candidates.length,0);assert.equal(r.events[0].officialUrl,'https://www.paradiso.nl/programma/mono/1');
});
test('an "image" that is the page itself or not an image file is dropped',async()=>{
 const {imageUrl}=await import('../scripts/venue-sources/parse.mjs');
 const page='https://www.effenaar.nl/agenda/fatal-flowers';
 assert.equal(imageUrl(page,page),'');
 assert.equal(imageUrl('https://d12y285rxlbnxt.cloudfront.net/2026-10/gallus.png',page),'https://d12y285rxlbnxt.cloudfront.net/2026-10/gallus.png');
 const o=parseEventPage(ld({'@type':'Event','@id':page,name:'The Fatal Flowers',startDate:'2026-11-05T20:00:00+01:00',image:{'@id':page},location:{name:'Grote zaal'}}),page,adapterById('effenaar'));
 assert.equal(o.image,'');
});
test('language variants of one Paard event are one event, not ambiguous; spacing variants match',()=>{
 const paard=adapterById('paard');
 const a={url:'https://www.paard.nl/event/teach/',title:'Paardcafé: TEACH',performers:[],date:'2026-11-21',venueName:'Café'};
 const b={...a,url:'https://www.paard.nl/event/teach-2/'};
 assert.equal(bestOfficialMatch(cat('TEACH','2026-11-21','Paard'),[a,b],paard).match.url,a.url);
 assert.equal(paard.normalizeUrl('https://www.paard.nl/en/event/x/'),'https://www.paard.nl/event/x/');
 const d=adapterById('doornroosje');
 const o={url:'https://www.doornroosje.nl/event/f/',title:'Frankie and the Witch Fingers',performers:['Frankie and the Witch Fingers'],date:'2026-11-11',venueName:'Doornroosje - Paarse zaal'};
 assert.equal(scoreMatch(cat('Frankie And The Witchfingers','2026-11-11','Doornroosje'),o,d).verdict,'match');
 assert.equal(scoreMatch(cat('Knoll','2026-11-24','Doornroosje'),{...o,title:'Imperial Triumphant + Knoll',performers:['Imperial Triumphant','Knoll'],date:'2026-11-24'},d).reasons.at(-1),'catalogue-headliner-is-support');
});
test('one network error does not end a venue run; three in a row do',async()=>{
 let n=0;
 const site=paradisoSite();
 const flaky=async(url,opts)=>{if(url.includes('/programma/mono/')&&n++===0)throw new Error('timeout');return site(url,opts);};
 const r=await refreshVenue(paradiso,{},{catalogue:[cat('MONO','2026-12-01','Paradiso')],today:'2026-11-05',fetcher:flaky,delay:async()=>{}});
 assert.equal(r.stats.errors,1);
 assert.ok(r.stats.parsed>=2);
 const dead=await refreshVenue(paradiso,{},{catalogue:[],today:'2026-11-05',delay:async()=>{},
  fetcher:async(url,opts)=>url.includes('/programma/')?Promise.reject(new Error('down')):site(url,opts)});
 assert.equal(dead.stats.errors,3);assert.equal(dead.stats.fetched,0);
});
