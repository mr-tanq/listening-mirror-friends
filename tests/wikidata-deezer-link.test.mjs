import test from 'node:test';
import assert from 'node:assert/strict';
import {wikidataDeezerId,sameVerifiedArtist,verifiedWikidataDeezerPhoto} from '../scripts/wikidata-deezer-link.mjs';
import {enrichWikimediaArtistPhotos} from '../scripts/wikimedia-artist-photos.mjs';

const pic='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const md5='3780a546a18503f1ca1e67358750847e';
const prop=(value,rank='normal')=>({rank,mainsnak:{datavalue:{value}}});
const band=(ids=['12345'])=>({
 id:'Q210',labels:{en:{value:'The Skints'}},aliases:{en:[{value:'Skints'}]},
 descriptions:{en:{value:'British reggae band'}},
 claims:{P31:[prop({id:'Q215380'})],P2722:ids.map(id=>prop(id))}
});
const full=(id=12345,name='The Skints')=>({id,name,picture_xl:pic});
const validClient={requests:0,get:async path=>path.endsWith('/albums?limit=100')?{data:[]}:full()};
const ev={artist:'The Skints',artists:['The Skints'],country:'NL',date:'2026-12-20',image:''};

test('P2722 uses a single, non-deprecated numeric Deezer artist ID',()=>{
 assert.equal(wikidataDeezerId(band()),12345);
 assert.equal(wikidataDeezerId(band(['12345','12345'])),12345);
 assert.equal(wikidataDeezerId(band(['12345','99999'])),null);
 assert.equal(wikidataDeezerId(band(['xyz'])),null);
 const e=band();
 e.claims.P2722.push(prop('99999','deprecated'));
 assert.equal(wikidataDeezerId(e),12345);
});

test('Wikidata name or documented alias must match exact Deezer name',()=>{
 assert.equal(sameVerifiedArtist(band(),'The Skints','The Skints'),true);
 assert.equal(sameVerifiedArtist(band(),'Skints','The Skints'),true);
 assert.equal(sameVerifiedArtist(band(),'The Skintz','The Skints'),false);
 assert.equal(sameVerifiedArtist(band(),'The Skints','Other Band'),false);
});

test('a uniquely linked artist photo is saved with provenance and Deezer credit',async()=>{
 const found=await verifiedWikidataDeezerPhoto(band(),'The Skints',validClient);
 assert.equal(found.reason,'verified');
 assert.equal(found.photo.image,pic);
 assert.equal(found.photo.deezerId,12345);
 assert.equal(found.photo.wikidata,'Q210');
 assert.equal(found.photo.matchedBy,'wikidata-p2722');
 assert.match(found.photo.credit.text,/Deezer/);
});

test('reject mismatch, ambiguous IDs, missing image and album-cover portrait',async()=>{
 const mismatch={get:async path=>path.endsWith('/albums?limit=100')?{data:[]}:full(12345,'The Skintz')};
 assert.equal((await verifiedWikidataDeezerPhoto(band(),'The Skints',mismatch)).reason,'linked-id-name-mismatch');
 assert.equal((await verifiedWikidataDeezerPhoto(band(['12345','67890']),'The Skints',validClient)).reason,'no-unique-linked-id');
 const cover={get:async path=>path.endsWith('/albums?limit=100')?{data:[{md5_image:md5}]}:full()};
 assert.equal((await verifiedWikidataDeezerPhoto(band(),'The Skints',cover)).reason,'album-cover-as-portrait');
 const unverifiable={get:async path=>path.endsWith('/albums?limit=100')?null:full()};
 assert.equal((await verifiedWikidataDeezerPhoto(band(),'The Skints',unverifiable)).reason,'unverified-album-portrait');
});

test('new Wikidata ID bridge fills unresolved band only when Commons has no safe photo',async()=>{
 const seen=[];
 const fakeFetcher=async url=>{
  seen.push(url);
  const data=url.includes('wbsearchentities')
   ?{search:[{id:'Q210',label:'The Skints'}]}
   :url.includes('wbgetentities')?{entities:{Q210:band()}}
   :{query:{pages:{}}};
  return {ok:true,status:200,json:async()=>data};
 };
 const old={artists:{},wikimediaAttempted:{'the skints':{strategyVersion:3,retryAfter:'2027-03-01',reason:'no-licensed-commons-photo'}}};
 const r=await enrichWikimediaArtistPhotos([ev],old,{
  today:'2026-11-06',maxArtists:1,fetcher:fakeFetcher,delay:async()=>{},deezerClient:validClient
 });
 assert.equal(r.stats.found,1);
 assert.equal(r.stats.linkedDeezerFound,1);
 assert.equal(r.cache.artists['the skints'].deezerId,12345);
 assert.equal(r.cache.artists['the skints'].source,'deezer');
 assert.equal(r.cache.wikimediaAttempted['the skints'],undefined);
 assert.ok(seen.some(x=>x.includes('haswbstatement')||x.includes('generator=search')));
});

test('existing photo is preserved and no unconfirmed item calls Deezer',async()=>{
 let calls=0;
 const client={get:async()=>{calls++;return full();}};
 const saved={artists:{'the skints':{image:pic,source:'manual-pin'}}};
 const a=await enrichWikimediaArtistPhotos([ev],saved,{today:'2026-11-06',deezerClient:client,
  fetcher:async()=>{throw Error('should not fetch Wikidata');}});
 assert.equal(a.stats.attempted,0);
 assert.equal(calls,0);
 const fakeFetcher=async url=>({ok:true,status:200,json:async()=>url.includes('wbsearchentities')
  ?{search:[{id:'Q210',label:'The Skints'},{id:'Q211',label:'The Skints'}]}
  :{entities:{Q210:band(),Q211:{...band(),id:'Q211'}}}});
 const b=await enrichWikimediaArtistPhotos([ev],{artists:{}},{today:'2026-11-06',
  deezerClient:client,fetcher:fakeFetcher,delay:async()=>{},maxArtists:1});
 assert.equal(b.stats.found,0);
 assert.equal(b.stats.linkedDeezerChecks,0);
 assert.equal(calls,0);
});
