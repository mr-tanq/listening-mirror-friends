import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseLinkedWikidataArtist,enrichWikimediaArtistPhotos} from '../scripts/wikimedia-artist-photos.mjs';

const MBID='21822f52-470c-4241-8c54-aa92026ac0b8';
const OTHER='53f91349-cd07-48c3-926d-35890cf0b95f';
const PHOTO='https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Artist_on_stage.jpg/960px-Artist_on_stage.jpg';
const claim=value=>({rank:'normal',mainsnak:{datavalue:{value}}});
const entity=(name,{mbid=MBID,musical=true,image='Artist on stage.jpg'}={})=>({
 id:'Q100',labels:{en:{value:name}},descriptions:{en:{value:musical?'South Korean traditional music group':'municipality'}},
 claims:{P31:[claim({id:musical?'Q215380':'Q515'})],
  ...(mbid?{P434:[claim(mbid)]}:{}),...(image?{P18:[claim(image)]}:{})}
});
const info={query:{pages:{10:{imageinfo:[{
 thumburl:PHOTO,width:1400,height:1200,mime:'image/jpeg',
 descriptionurl:'https://commons.wikimedia.org/wiki/File:Artist_on_stage.jpg',
 extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},
  Artist:{value:'Named photographer'}}
}]}}}};
const response=val=>({ok:true,status:200,json:async()=>val});
const show={artist:'LEENALCHI',artists:['LEENALCHI'],date:'2026-11-12',country:'NL',image:''};

test('a unique matching Wikidata P434 verifies a known MBID even if English label differs',()=>{
 const r=chooseLinkedWikidataArtist({entities:{Q100:entity('이날치')}},'Q100','LEENALCHI',MBID);
 assert.equal(r.linked,true);
 assert.equal(r.mbidVerified,true);
 assert.equal(r.file,'Artist on stage.jpg');
 assert.equal(chooseLinkedWikidataArtist({entities:{Q100:entity('이날치',{mbid:''})}},'Q100','LEENALCHI',MBID).entity,null);
});
test('a contradictory P434 is rejected even if entity has the expected English name',()=>{
 const r=chooseLinkedWikidataArtist({entities:{Q100:entity('LEENALCHI',{mbid:OTHER})}},'Q100','LEENALCHI',MBID);
 assert.equal(r.entity,null);
 assert.equal(r.reason,'linked-mbid-conflict');
 assert.equal(chooseLinkedWikidataArtist({entities:{Q100:entity('LEENALCHI',{musical:false})}},'Q100','LEENALCHI',MBID).entity,null);
});
test('a missing P434 may use exact name, but never a different or partial name',()=>{
 const r=chooseLinkedWikidataArtist({entities:{Q100:entity('LEENALCHI',{mbid:''})}},'Q100','LEENALCHI',MBID);
 assert.equal(r.linked,true);
 assert.equal(r.mbidVerified,false);
 assert.equal(chooseLinkedWikidataArtist({entities:{Q100:entity('Leenalchi Tribute',{mbid:''})}},'Q100','LEENALCHI',MBID).entity,null);
 assert.equal(chooseLinkedWikidataArtist({entities:{Q100:entity('LEENALCHI',{mbid:OTHER})}},'Q100','LEENALCHI','').linked, true);
});
test('historically missed artist automatically recovers a licensed portrait through exact MBID, with no fuzzy name search',async()=>{
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  if(url.includes('wbsearchentities'))throw Error('Must use verified MBID, not text search');
  if(url.includes('wbgetentities'))return response({entities:{Q100:entity('이날치')}});
  if(url.includes('commons.wikimedia.org'))return response(info);
  throw Error('unexpected URL '+url);
 };
 const r=await enrichWikimediaArtistPhotos([show],{
  artists:{},wikimediaAttempted:{
   leenalchi:{strategyVersion:7,retryAfter:'2026-12-31',reason:'no-confirmed-musician'}
  }
 },{
  today:'2026-11-08',fetcher,delay:async()=>{},maxArtists:1,
  identityCache:{artists:{leenalchi:{mbid:MBID,wikidata:'Q100'}}}
 });
 assert.equal(r.stats.attempted,1);
 assert.equal(r.stats.found,1);
 assert.equal(r.stats.linkedMbidVerified,1);
 assert.equal(r.stats.linkedMbidConflicts,0);
 assert.equal(r.cache.artists.leenalchi.image,PHOTO);
 assert.match(r.cache.artists.leenalchi.credit.text,/Named photographer/);
 assert.equal(r.cache.wikimediaAttempted.leenalchi,undefined);
 assert.equal(urls.filter(x=>x.includes('wbsearchentities')).length,0);
});
test('a contradictory MusicBrainz ID never falls back to name search or displays the image',async()=>{
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  if(url.includes('wbgetentities'))return response({entities:{Q100:entity('LEENALCHI',{mbid:OTHER})}});
  if(url.includes('wbsearchentities'))throw Error('A conflicting MBID must not permit fuzzy lookup');
  throw Error('No other request should occur: '+url);
 };
 const r=await enrichWikimediaArtistPhotos([show],{artists:{}},{
  today:'2026-11-08',fetcher,delay:async()=>{},maxArtists:1,
  identityCache:{artists:{leenalchi:{mbid:MBID,wikidata:'Q100'}}}
 });
 assert.equal(r.stats.found,0);
 assert.equal(r.stats.linkedMbidConflicts,1);
 assert.equal(r.cache.artists.leenalchi,undefined);
 assert.equal(r.cache.wikimediaAttempted.leenalchi.reason,'linked-mbid-conflict');
 assert.equal(urls.length,1);
});
test('HTTP quota cooldowns are never bypassed by new MBID matching strategy',async()=>{
 let calls=0;
 const r=await enrichWikimediaArtistPhotos([show],{
  artists:{},wikimediaAttempted:{leenalchi:{
   strategyVersion:7,retryAfter:'2026-12-31',reason:'HTTP 429'}}
 },{
  today:'2026-11-08',fetcher:async()=>{calls++;throw Error('not called')},
  identityCache:{artists:{leenalchi:{mbid:MBID,wikidata:'Q100'}}},maxArtists:1
 });
 assert.equal(r.stats.attempted,0);assert.equal(calls,0);
});
