import test from 'node:test';
import assert from 'node:assert/strict';
import {nonConcertReason} from '../scripts/venue-sources/music-filter.mjs';
import {applyCachedVenueGenres} from '../scripts/venue-sources/genre-tags.mjs';
import {discoverFromVenues,reconcileVenueEvents} from '../scripts/venue-sources/pipeline.mjs';
import {adapterById} from '../scripts/venue-sources/adapters.mjs';
import {runVenueStage} from '../scripts/update-venue-catalog.mjs';

const venue=adapterById('013');
const policy={venues:{'013':{discovery:true,imageUse:'pending'}}};
const mk=(name,id)=>({url:'https://www.013.nl/programma/'+id+'/'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
 title:name,date:'2026-12-04',performers:[name],venueName:'Poppodium 013',image:'https://example.org/photo.jpg'});
const music=mk('The Skints',2);
const comedy=mk('Jimmy Carr',1);
const children=mk('Ernst, Bobbie & de rest',3);
const listening=mk('Kunstscene: Luistersessies',4);
const cache={venues:{'013':{pages:Object.fromEntries([music,comedy,children,listening].map(o=>[o.url,{event:o}]))}}};
const catalogue=(o)=>({id:'venue-013-'+o.date+'-'+o.title.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
 artist:o.title,artists:[o.title],date:o.date,venue:'013',city:'Tilburg',country:'NL',source:'venue-official',url:o.url,image:''});

test('explicit non-concerts are excluded without blocking real bands',()=>{
 for(const title of ['Jimmy Carr','Ernst, Bobbie & de rest','Kunstscene: Luistersessies','Stand-up comedy night','Kinder voorstelling'.replace(' ','')])
  assert.ok(nonConcertReason({title}),title);
 for(const title of ['The Skints','Tinlicker','Theater of Hate','Comedy of Errors','The Jukebox #18','Paradiso Korendagen 2027'])
  assert.equal(nonConcertReason({title}),'',title);
});

test('discovery filters confirmed non-concerts, retains music, and does not publish pending images',()=>{
 const r=discoverFromVenues([],[venue],cache,policy,{today:'2026-11-05',endDate:'2027-03-01'});
 assert.deepEqual(r.added.map(e=>e.artist),['The Skints']);
 assert.equal(r.added[0].image,'');
 assert.equal(r.stats['013'].skipReasons['non-music:stand-up-comedian'],1);
 assert.equal(r.stats['013'].skipReasons['non-music:children-theatre'],1);
 assert.equal(r.stats['013'].skipReasons['non-music:explicit-non-concert-title'],1);
});

test('already published non-concert venue-only entries are retired safely',()=>{
 const r=reconcileVenueEvents([catalogue(comedy),catalogue(children),catalogue(listening),catalogue(music)],
  [venue],{venues:{}},policy,{today:'2026-11-05'});
 assert.deepEqual(r.events.map(e=>e.artist),['The Skints']);
 assert.equal(r.removed.nonConcert,3);
});

test('venue genres come exclusively from confirmed artist cache, never venue or title',()=>{
 const events=[catalogue(music),catalogue(mk('Tinlicker',5)),catalogue(mk('Theater of Hate',6)),catalogue(mk('Unknown Artist',7))];
 const tags={artists:{'the skints':{genres:['Reggae','MadeUp'],source:'itunes'},'tinlicker':{genres:['Electronic'],source:'itunes'},'theater of hate':{genres:[]}}};
 assert.equal(applyCachedVenueGenres(events,tags),2);
 assert.equal(events[0].genre,'Reggae');assert.equal(events[0].genreEvidence,'metadata');
 assert.equal(events[1].genre,'Electronic');
 assert.equal(events[2].genre,undefined);
 assert.equal(events[3].genre,undefined);
});

test('cached genre metadata is applied during a venue stage even when venue site returns 403',async()=>{
 const old={events:[catalogue(music)]};
 const blocked=async url=>({ok:false,status:403,url,text:async()=>''});
 const r=await runVenueStage({today:'2026-11-05',feed:old,cache:{venues:{}},policy,only:['013'],fetcher:blocked,
  genreTags:{artists:{'the skints':{genres:['Reggae'],source:'itunes'}}}});
 assert.equal(r.events[0].genre,'Reggae');
 assert.equal(r.report.totals.venueGenresTagged,1);
 assert.equal(r.report.totals.venueGenresFromCache,1);
});
