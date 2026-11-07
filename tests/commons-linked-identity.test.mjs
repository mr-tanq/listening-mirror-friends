import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseLinkedWikidataArtist,enrichWikimediaArtistPhotos} from '../scripts/wikimedia-artist-photos.mjs';

const photo='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Artist_live.jpg/960px-Artist_live.jpg';
const item=id=>({rank:'normal',mainsnak:{datavalue:{value:{id}}}});
const textClaim=value=>({rank:'normal',mainsnak:{datavalue:{value}}});
const entity=(id,name,{image='Artist live.jpg',musician=true}={})=>({
 id,labels:{en:{value:name}},descriptions:{en:{value:musician?'rock band':'municipality'}},
 claims:{P31:[item(musician?'Q215380':'Q515')],...(image?{P18:[textClaim(image)]}:{})}
});
const imageInfo={query:{pages:{7:{imageinfo:[{
 thumburl:photo,width:1600,height:1100,mime:'image/jpeg',
 descriptionurl:'https://commons.wikimedia.org/wiki/File:Artist_live.jpg',
 extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},Artist:{value:'Licensed photographer'},
 LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}
}]}}}};
const event=(name,date='2026-11-12')=>({artist:name,artists:[name],date,country:'NL',image:''});
const response=data=>({ok:true,status:200,json:async()=>data});

test('existing MusicBrainz-linked Wikidata ID avoids ambiguous name search altogether',async()=>{
 const links={artists:{'test band':{mbid:'00000000-0000-0000-0000-000000000001',wikidata:'Q4242'}}};
 const attempts={artists:{},wikimediaAttempted:{'test band':{
  strategyVersion:4,retryAfter:'2027-01-01',reason:'no-confirmed-musician'
 }}};
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  if(url.includes('wbsearchentities'))throw Error('Must use known artist identity instead of name search');
  if(url.includes('wbgetentities'))return response({entities:{Q4242:entity('Q4242','Test Band')}});
  if(url.includes('commons.wikimedia.org/w/api.php'))return response(imageInfo);
  throw Error('Unexpected URL '+url);
 };
 const result=await enrichWikimediaArtistPhotos([event('Test Band')],attempts,{
  today:'2026-11-07',identityCache:links,fetcher,delay:async()=>{},maxArtists:1
 });
 assert.equal(result.stats.found,1);
 assert.equal(result.stats.linkedIdentityUsed,1);
 assert.equal(result.stats.linkedIdentityRejected,0);
 assert.equal(result.cache.artists['test band'].image,photo);
 assert.match(result.cache.artists['test band'].credit.text,/Licensed photographer/);
 assert.equal(result.cache.wikimediaAttempted['test band'],undefined);
 assert.ok(urls.some(url=>url.includes('ids=Q4242')));
 assert.ok(!urls.some(url=>url.includes('wbsearchentities')));
});
test('a mismatched or non-musical linked entity is never trusted as a portrait',()=>{
 const wrong=chooseLinkedWikidataArtist({entities:{Q42:entity('Q42','Other Artist')}},'Q42','Test Band');
 assert.equal(wrong.entity,null);
 assert.equal(wrong.reason,'linked-identity-mismatch');
 const town=chooseLinkedWikidataArtist({entities:{Q43:entity('Q43','Test Band',{musician:false})}},'Q43','Test Band');
 assert.equal(town.entity,null);
 assert.equal(town.reason,'linked-identity-mismatch');
 assert.equal(chooseLinkedWikidataArtist({entities:{Q42:entity('Q42','Test Band')}},'Qabc','Test Band').entity,null);
});
test('a verified MusicBrainz link with no P18 enables exact depicts and category fallback',async()=>{
 const linked={artists:{'northern lanterns':{wikidata:'Q4455'}}};
 const musician=entity('Q4455','Northern Lanterns',{image:''});
 musician.claims.P373=[textClaim('Northern Lanterns')];
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  if(url.includes('wbgetentities'))return response({entities:{Q4455:musician}});
  if(url.includes('generator=categorymembers'))return response({query:{pages:{
   8:{pageid:8,ns:6,title:'File:Northern Lanterns performing live.jpg',imageinfo:[{
    ...imageInfo.query.pages[7].imageinfo[0],
    descriptionurl:'https://commons.wikimedia.org/wiki/File:Northern_Lanterns_performing_live.jpg'}]}
  }}});
  if(url.includes('haswbstatement'))return response({query:{pages:{}}});
  throw Error('Unexpected URL '+url);
 };
 const result=await enrichWikimediaArtistPhotos([event('Northern Lanterns')],{artists:{}},{
  today:'2026-11-07',identityCache:linked,fetcher,delay:async()=>{},maxArtists:1
 });
 assert.equal(result.stats.found,1);
 assert.equal(result.stats.categoryFound,1);
 assert.equal(result.stats.linkedIdentityUsed,1);
 assert.ok(urls.some(u=>u.includes('generator=categorymembers')));
 assert.ok(!urls.some(u=>u.includes('wbsearchentities')));
});
test('old network error cooldown is not bypassed by an identity upgrade',async()=>{
 const result=await enrichWikimediaArtistPhotos([event('Test Band')],{
  artists:{},wikimediaAttempted:{'test band':{
   strategyVersion:4,retryAfter:'2026-11-12',reason:'HTTP 429'
  }}
 },{
  today:'2026-11-07',identityCache:{artists:{'test band':{wikidata:'Q4242'}}},
  maxArtists:1,fetcher:async()=>{throw Error('Should stay backed off');}
 });
 assert.equal(result.stats.attempted,0);
});
test('imminent shows with linked identities take precedence under bounded budget',async()=>{
 const links={artists:{'near band':{wikidata:'Q200'},'far band':{wikidata:'Q201'}}};
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  if(url.includes('wbgetentities'))return response({entities:{Q200:entity('Q200','Near Band')}});
  if(url.includes('commons.wikimedia.org'))return response(imageInfo);
  throw Error('Unexpected request '+url);
 };
 const result=await enrichWikimediaArtistPhotos([
  event('Far Band','2027-02-03'),event('Near Band','2026-11-08')
 ],{artists:{}},{
  today:'2026-11-07',identityCache:links,fetcher,delay:async()=>{},maxArtists:1
 });
 assert.equal(result.stats.attempted,1);
 assert.ok(result.cache.artists['near band']?.image);
 assert.equal(result.cache.artists['far band'],undefined);
});
