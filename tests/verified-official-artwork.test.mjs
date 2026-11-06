import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyVerifiedOfficialArtwork,verifiedOfficialArtworkRecord} from '../js/verified-official-artwork.js';
import {resolveConcertImage,resolveConcertImageBackup} from '../js/artist-images.js';

const config=JSON.parse(readFileSync(new URL('../data/verified-official-artwork.json',import.meta.url),'utf8'));
const big={id:'podiuminfo-472061',artist:'Big Sleep',artists:['Big Sleep'],date:'2026-11-13',
 venue:'Paradiso',city:'Amsterdam',country:'NL',image:'',source:'podiuminfo-agenda'};
const party={id:'venue-patronaat-2026-11-13-90-s-now',artist:"90's NOW",artists:["90's NOW"],
 date:'2026-11-13',venue:'Patronaat',city:'Haarlem',country:'NL',
 image:'https://patronaat.nl/app/uploads/2026/09/Banner-Blauw--37.png',
 imageKind:'event-poster',imageSource:'venue-official-direct-link'};
const bigUrl='https://assets.paradiso.nl/images/transforms/event/_1200x630_crop_center-center_none/5-1-1.jpg';
const partyUrl='https://patronaat.nl/app/uploads/2026/09/Banner-Blauw-%7F-37-720x720.png';

test('real verified Big Sleep and 90s NOW corrections use official HTTPS image and source',()=>{
 assert.equal(config.records.length,2);
 const r=applyVerifiedOfficialArtwork([big,party],config);
 assert.equal(r.applied,2);
 assert.equal(r.invalid,0);
 assert.equal(r.events[0].image,bigUrl);
 assert.equal(r.events[0].officialUrl,'https://www.paradiso.nl/programma/big-sleep/2895340');
 assert.equal(r.events[0].imageSource,'venue-official-direct-link');
 assert.equal(r.events[1].image,partyUrl);
 assert.equal(r.events[1].imageCredit.url,'https://patronaat.nl/event/90s-now-13-11-26/');
 assert.equal(resolveConcertImage(r.events[0],{artists:{}}).url,bigUrl);
 assert.equal(applyVerifiedOfficialArtwork(r.events,config).applied,0);
});

test('corrections never spread to a second date, venue, band or concert ID',()=>{
 const variants=[
  {...big,id:'podiuminfo-similar'},
  {...big,artist:'Big Sleep Tribute'},
  {...big,date:'2026-11-12'},
  {...big,venue:'Grenswerk'},
  {...big,country:'BE'},
  {...party,id:'venue-patronaat-unrelated'},
  {...party,date:'2026-11-14'}
 ];
 const r=applyVerifiedOfficialArtwork(variants,config);
 assert.equal(r.applied,0);
 assert.deepEqual(r.events,variants);
});

test('another event poster or artist image takes precedence, but bad venue URL is correctable',()=>{
 const thirdParty={...big,image:'https://images.rocking.gr/posters/2026/500/a.jpg',imageSource:'rocking'};
 const portrait={...big,image:'https://example.com/p.jpg',imageSource:'deezer',imageKind:'artist-photo'};
 const corrected=applyVerifiedOfficialArtwork([thirdParty,portrait,party],config).events;
 assert.deepEqual(corrected[0],thirdParty);
 assert.deepEqual(corrected[1],portrait);
 assert.equal(corrected[2].image,partyUrl);
});

test('untrusted, incorrectly scoped or non-image links cannot be saved',()=>{
 const base=config.records[0];
 for(const changes of [
  {image:'https://evil.example.com/preview.jpg'},
  {image:'http://assets.paradiso.nl/images/event.jpg'},
  {image:'https://assets.paradiso.nl/images/event.svg'},
  {sourceUrl:'https://attacker.example.com/programma/big-sleep/2895340'},
  {sourceUrl:'https://www.paradiso.nl/nieuws/big-sleep'},
  {venue:'Unknown Venue'},
  {date:'Nov 13'},
  {id:''}
 ]){
  assert.equal(verifiedOfficialArtworkRecord({...base,...changes}),null,JSON.stringify(changes));
 }
});

test('if a corrected official URL is blocked in the browser, a verified band photo remains available',()=>{
 const photo='https://cdn-images.dzcdn.net/images/artist/0e5945bfdd3a0c8a66a2bb758571b225/1000x1000-000000-80-0-0.jpg';
 const e=applyVerifiedOfficialArtwork([big],config).events[0];
 const alternate=resolveConcertImageBackup(e,{artists:{'big sleep':{image:photo,source:'deezer'}}});
 assert.equal(alternate.url,photo);
 assert.equal(alternate.kind,'artist-photo');
});
