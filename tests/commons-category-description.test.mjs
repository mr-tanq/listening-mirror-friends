import test from 'node:test';
import assert from 'node:assert/strict';
import {commonsArtistCategoryUrl,selectLicensedCategoryPhoto} from '../scripts/commons-category-photos.mjs';
import {enrichWikimediaArtistPhotos} from '../scripts/wikimedia-artist-photos.mjs';

const URL='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/IMG_0123.jpg/960px-IMG_0123.jpg';
const response=data=>({ok:true,status:200,json:async()=>data});
const image=(name,{description='',license='CC BY-SA 4.0',width=1800}={})=>({
 pageid:12,ns:6,title:'File:'+name,imageinfo:[{
  thumburl:URL,width,height:1200,mime:'image/jpeg',
  descriptionurl:'https://commons.wikimedia.org/wiki/File:IMG_0123.jpg',
  extmetadata:{
   Artist:{value:'Verified venue photographer'},
   LicenseShortName:{value:license},
   LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},
   ImageDescription:{value:description}
  }
 }]
});
const gallery=(...pages)=>({query:{pages:Object.fromEntries(pages.map((p,i)=>[String(i+1),p]))}});
const val=value=>({rank:'normal',mainsnak:{datavalue:{value}}});
const item=id=>({rank:'normal',mainsnak:{datavalue:{value:{id}}}});
const artist={
 id:'Q8888',labels:{en:{value:'Northern Lanterns'}},
 descriptions:{en:{value:'Dutch indie rock band'}},
 claims:{P31:[item('Q215380')],P373:[val('Northern Lanterns')]}
};
const ev={artist:'Northern Lanterns',artists:['Northern Lanterns'],date:'2026-11-12',country:'NL',image:''};

test('linked Commons category checks 40 direct members and asks for description evidence',()=>{
 const url=new URL(commonsArtistCategoryUrl('Northern Lanterns'));
 assert.equal(url.searchParams.get('gcmlimit'),'40');
 assert.equal(url.searchParams.get('gcmnamespace'),'6');
 assert.ok(url.searchParams.get('iiextmetadatafilter').split('|').includes('ImageDescription'));
});

test('a generic filename is accepted only when the licensed Commons image metadata names the whole artist',()=>{
 const photo=image('IMG_0123.jpg',{
  description:'<p>Photograph of Northern Lanterns performing live in Utrecht.</p>'});
 const selected=selectLicensedCategoryPhoto(gallery(photo),'Northern Lanterns','Q8888');
 assert.equal(selected.image,URL);
 assert.equal(selected.categoryEvidence,'artist-in-image-description');
 assert.match(selected.credit.text,/Verified venue photographer/);
 assert.equal(selectLicensedCategoryPhoto(gallery(image('IMG_0123.jpg',{
  description:'Portrait of Northern Lanterns (a different band)' })), 'Northern', 'Q8888'),null);
 assert.equal(selectLicensedCategoryPhoto(gallery(image('IMG_0123.jpg',{
  description:'A photograph of Northern Lanterns tribute band performing'})),
  'Northern Lanterns','Q8888'),null);
});

test('filename evidence is preferred and generic images without identity evidence fail closed',()=>{
 const named=image('Northern Lanterns live.jpg',{description:'Photo from a gig'});
 const described=image('IMG_0123.jpg',{description:'Northern Lanterns performing'});
 const preferred=selectLicensedCategoryPhoto(gallery(described,named),'Northern Lanterns','Q8888');
 assert.equal(preferred.categoryEvidence,'artist-in-file-title');
 assert.equal(selectLicensedCategoryPhoto(gallery(image('IMG_0123.jpg')),'Northern Lanterns','Q8888'),null);
 assert.equal(selectLicensedCategoryPhoto(gallery(image('Other Band.jpg',{
  description:'Portrait of Other Band'})),'Northern Lanterns','Q8888'),null);
 assert.equal(selectLicensedCategoryPhoto(gallery(image('IMG_0123.jpg',{
  description:'Northern Lanterns on stage',license:'CC BY-NC 4.0'})),'Northern Lanterns','Q8888'),null);
 assert.equal(selectLicensedCategoryPhoto(gallery(image('IMG_0123.jpg',{
  description:'Northern Lanterns live',width:160})),'Northern Lanterns','Q8888'),null);
 assert.equal(selectLicensedCategoryPhoto(gallery(image('Northern Lanterns album cover.jpg',{
  description:'Northern Lanterns concert photograph'})),'Northern Lanterns','Q8888'),null);
});

test('generic Wikimedia job recovers from previously negative photo lookup using verified linked category',async()=>{
 const requests=[];
 const fetcher=async u=>{
  requests.push(u);
  if(u.includes('wbgetentities'))return response({entities:{Q8888:artist}});
  if(u.includes('generator=search'))return response(gallery());
  if(u.includes('generator=categorymembers'))return response(gallery(image('IMG_0123.jpg',{
   description:'Northern Lanterns performing live in Utrecht',
  })));
  throw Error('Unexpected Wikimedia request '+u);
 };
 const cache={artists:{},wikimediaAttempted:{
  'northern lanterns':{strategyVersion:5,retryAfter:'2027-01-01',reason:'no-licensed-commons-photo'}
 }};
 const linked={artists:{'northern lanterns':{wikidata:'Q8888'}}};
 const r=await enrichWikimediaArtistPhotos([ev],cache,{
  today:'2026-11-07',fetcher,identityCache:linked,maxArtists:1,delay:async()=>{}
 });
 assert.equal(r.stats.found,1);
 assert.equal(r.stats.categoryDescriptionFound,1);
 assert.equal(r.cache.artists['northern lanterns'].image,URL);
 assert.equal(r.cache.artists['northern lanterns'].matchedBy,'wikidata-linked-artist-category-description');
 assert.equal(r.cache.wikimediaAttempted['northern lanterns'],undefined);
 assert.ok(requests.some(u=>u.includes('ImageDescription')));
});

test('v6 never bypasses rate-limit, provider errors, or ambiguous-identity cooldowns',async()=>{
 const attempted={
  'northern lanterns':{strategyVersion:5,retryAfter:'2027-01-01',reason:'HTTP 429'}
 };
 let contacted=0;
 const r=await enrichWikimediaArtistPhotos([ev],{artists:{},wikimediaAttempted:attempted},{
  today:'2026-11-07',maxArtists:1,identityCache:{artists:{'northern lanterns':{wikidata:'Q8888'}}},
  fetcher:async()=>{contacted++;throw Error('unexpected provider call')}
 });
 assert.equal(r.stats.attempted,0);
 assert.equal(contacted,0);
});
