import test from 'node:test';
import assert from 'node:assert/strict';
import {officialImageMode,enrichCatalogue,discoverFromVenues} from '../scripts/venue-sources/pipeline.mjs';
import {adapterById} from '../scripts/venue-sources/adapters.mjs';
import {resolveConcertImageBackup} from '../js/artist-images.js';
import {normalizeEvent} from '../js/model.js';

const venue=adapterById('paradiso');
const page='https://www.paradiso.nl/programma/the-skints/12345';
const image='https://assets.paradiso.nl/images/transforms/event/_1200x630_none/the-skints.jpg';
const official={url:page,title:'The Skints',performers:['The Skints'],date:'2026-12-04',
 venueName:'Paradiso Grote Zaal',image,via:'json-ld'};
const cache={venues:{paradiso:{pages:{[page]:{event:official}}}}};
const event={id:'podiuminfo-the-skints',artist:'The Skints',artists:['The Skints'],
 date:'2026-12-04',venue:'Paradiso',city:'Amsterdam',country:'NL',
 image:'',source:'podiuminfo-agenda',url:'https://podiuminfo.nl/x'};
const p=status=>({venues:{paradiso:{discovery:true,imageUse:status}}});
const run=(one=event,status='direct-link')=>enrichCatalogue([one],[venue],cache,p(status),{today:'2026-11-06'});

test('direct-link mode only accepts original public HTTPS event pages and image files',()=>{
 assert.equal(officialImageMode(venue,official,p('direct-link')),'direct-link');
 assert.equal(officialImageMode(venue,official,p('permitted')),'permitted');
 assert.equal(officialImageMode(venue,official,p('pending')),'');
 assert.equal(officialImageMode(venue,official,p('denied')),'');
 assert.equal(officialImageMode(venue,{...official,url:'http://www.paradiso.nl/programma/the-skints/12345'},p('direct-link')),'');
 assert.equal(officialImageMode(venue,{...official,url:'https://other.nl/programma/the-skints/12345'},p('direct-link')),'');
 assert.equal(officialImageMode(venue,{...official,image:'https://example.org/art.html'},p('direct-link')),'');
 const blocked=adapterById('dbs');
 assert.equal(officialImageMode(blocked,{...official}, {venues:{dbs:{imageUse:'direct-link'}}}),'');
});

test('source linked event art appears with provenance, never as an uploaded copy',()=>{
 const r=run();
 assert.equal(r.events[0].image,image);
 assert.equal(r.events[0].imageSource,'venue-official-direct-link');
 assert.equal(r.events[0].imageKind,'event-poster');
 assert.equal(r.events[0].imageCredit.url,page);
 assert.equal(r.candidates.length,1);
 assert.equal(r.candidates[0].published,true);
 assert.equal(r.candidates[0].displayMode,'direct-link');
 assert.equal(normalizeEvent(r.events[0]).imageSource,'venue-official-direct-link');
 assert.equal(r.stats.paradiso.imagesPublished,1);
});

test('pending and denied never display; existing independent event posters win',()=>{
 assert.equal(run(event,'pending').events[0].image,'');
 assert.equal(run(event,'denied').events[0].image,'');
 const original={...event,image:'https://promoter.example/owned-poster.jpg',imageSource:'more'};
 assert.equal(run(original).events[0].image,original.image);
 assert.equal(run(original).candidates[0].published,false);
});

test('withdrawal, ambiguous match and missing event image remove stale direct links',()=>{
 const linked=run().events[0];
 const revoked=run(linked,'pending');
 assert.equal(revoked.events[0].image,'');
 assert.equal(revoked.events[0].imageSource,'');
 assert.equal(revoked.candidates[0].published,false);
 assert.equal(run(linked,'denied').events[0].image,'');
 const noOfficial=enrichCatalogue([linked],[venue],{venues:{}},p('direct-link'),{today:'2026-11-06'});
 assert.equal(noOfficial.events[0].image,'');
 const changed=run(linked);
 assert.equal(changed.events[0].image,image);
 assert.equal(changed.stats.paradiso.imagesPublished,1);
});

test('discovered venue event uses direct image with official attribution',()=>{
 const discovered=discoverFromVenues([],[venue],cache,p('direct-link'),{today:'2026-11-06',endDate:'2027-01-01'});
 assert.equal(discovered.added.length,1);
 assert.equal(discovered.added[0].image,image);
 assert.equal(discovered.added[0].imageSource,'venue-official-direct-link');
 assert.equal(discovered.added[0].imageCredit.url,page);
});

test('verified artist portrait remains the fallback if external image fails',()=>{
 const photo='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
 const linked=run().events[0];
 const artistCache={artists:{'the skints':{source:'deezer',image:photo}}};
 const backup=resolveConcertImageBackup(linked,artistCache);
 assert.equal(backup.url,photo);
 assert.equal(backup.kind,'artist-photo');
});
