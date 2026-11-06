import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseWikidataArtist,enrichWikimediaArtistPhotos} from '../scripts/wikimedia-artist-photos.mjs';
import {resolveConcertImage} from '../js/artist-images.js';

const url='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Band_photo.jpg/960px-Band_photo.jpg';
const claimString=s=>({rank:'normal',mainsnak:{datavalue:{value:s}}});
const claimItem=id=>({rank:'normal',mainsnak:{datavalue:{value:{id}}}});
const artist=(id,name,{occupation='band',image='Band photo.jpg'}={})=>({
 id,labels:{en:{value:name}},descriptions:{en:{value:occupation==='band'?'Dutch rock band':'Dutch singer'}},
 claims:{P31:[claimItem(occupation==='band'?'Q215380':'Q5')],
  ...(occupation==='singer'?{P106:[claimItem('Q177220')]}:{}),
  ...(image?{P18:[claimString(image)]}:{})}
});
const search=(...pairs)=>({search:pairs.map(([id,label])=>({id,label}))});
const entities=(...items)=>({entities:Object.fromEntries(items.map(e=>[e.id,e]))});
const pagePhoto=(licence='CC BY-SA 4.0')=>({query:{pages:{10:{imageinfo:[{
 thumburl:url,width:1600,height:1000,mime:'image/jpeg',
 descriptionurl:'https://commons.wikimedia.org/wiki/File:Band_photo.jpg',
 extmetadata:{LicenseShortName:{value:licence},Artist:{value:'Test photographer'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}
}]}}}});
const event=(name='The Skints')=>({artist:name,artists:[name],country:'NL',date:'2026-12-20',image:'',source:'podiuminfo-agenda'});
const mock=(query,entry,image=pagePhoto())=>async address=>{
 if(address.includes('wbsearchentities'))return {ok:true,status:200,json:async()=>query};
 if(address.includes('wbgetentities'))return {ok:true,status:200,json:async()=>entry};
 if(address.includes('commons.wikimedia'))return {ok:true,status:200,json:async()=>image};
 throw Error('Unexpected URL '+address);
};

test('accepts one exact music entity and refuses fuzzy names and ordinary people',()=>{
 const band=artist('Q100','The Skints');
 assert.equal(chooseWikidataArtist(search(['Q100','The Skints']),entities(band),'The Skints').entity.id,'Q100');
 assert.equal(chooseWikidataArtist(search(['Q100','The Skints']),entities(band),'The Skint').entity,null);
 const town={id:'Q200',labels:{en:{value:'The Skints'}},descriptions:{en:{value:'town'}},claims:{P31:[claimItem('Q515')],P18:[claimString('Town.jpg')]}};
 assert.equal(chooseWikidataArtist(search(['Q200','The Skints']),entities(town),'The Skints').entity,null);
});

test('rejects two same-named musicians rather than guessing by result order',()=>{
 const a=artist('Q100','Distant'),b=artist('Q101','Distant',{occupation:'singer'});
 const result=chooseWikidataArtist(search(['Q100','Distant'],['Q101','Distant']),entities(a,b),'Distant');
 assert.equal(result.entity,null);assert.equal(result.reason,'ambiguous-musical-identity');
});

test('publishes only a verified, credited Commons image for an exact music identity',async()=>{
 const album={artists:{},wikimediaAttempted:{}};
 const data=await enrichWikimediaArtistPhotos([event()],album,{
  today:'2026-11-06',maxArtists:1,delay:async()=>{},
  fetcher:mock(search(['Q100','The Skints']),entities(artist('Q100','The Skints')))
 });
 assert.equal(data.stats.found,1);
 assert.equal(data.cache.artists['the skints'].image,url);
 assert.equal(data.cache.artists['the skints'].source,'wikimedia-commons');
 assert.equal(data.cache.artists['the skints'].licence,'CC BY-SA 4.0');
 assert.match(resolveConcertImage(event(),data.cache).credit.text,/Test photographer/);
 assert.equal(data.cache.wikimediaAttempted['the skints'],undefined);
});

test('rejects non-free Commons media and caches the reason without substituting random art',async()=>{
 const x=await enrichWikimediaArtistPhotos([event()],{artists:{}},{
  today:'2026-11-06',maxArtists:1,delay:async()=>{},
  fetcher:mock(search(['Q100','The Skints']),entities(artist('Q100','The Skints')),pagePhoto('CC BY-NC 4.0'))
 });
 assert.equal(x.stats.found,0);assert.equal(x.stats.licenceRejected,1);
 assert.equal(x.cache.artists['the skints'],undefined);
 assert.equal(x.cache.wikimediaAttempted['the skints'].reason,'photo-license-or-size-rejected');
 const noNetwork=async()=>{throw Error('Should not retry during backoff');};
 const y=await enrichWikimediaArtistPhotos([event()],x.cache,{today:'2026-11-06',fetcher:noNetwork});
 assert.equal(y.stats.attempted,0);
});

test('existing trusted artist photo is not replaced and venue artwork is never used',async()=>{
 const original={artists:{'the skints':{image:url,source:'manual-pin'}}};
 const noNetwork=async()=>{throw Error('Never look up an already covered artist');};
 const a=await enrichWikimediaArtistPhotos([event()],original,{today:'2026-11-06',fetcher:noNetwork});
 assert.equal(a.stats.attempted,0);
 assert.equal(a.cache.artists['the skints'].source,'manual-pin');
});

test('HTTP 429 backs off instead of retrying or breaking daily catalogue',async()=>{
 const response=async()=>({ok:false,status:429,json:async()=>({})});
 const r=await enrichWikimediaArtistPhotos([event()],{artists:{}},{
  today:'2026-11-06',maxArtists:1,delay:async()=>{},fetcher:response
 });
 assert.equal(r.stats.errors,1);
 assert.equal(r.cache.wikimediaAttempted['the skints'].retryAfter,'2026-11-08');
});
