import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedArtistCategory,commonsArtistCategoryUrl,selectLicensedCategoryPhoto} from '../scripts/commons-category-photos.mjs';
import {enrichWikimediaArtistPhotos} from '../scripts/wikimedia-artist-photos.mjs';
const IMAGE='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Moreish_Idols_live.jpg/960px-Moreish_Idols_live.jpg';
const file=(name,licence='CC BY 4.0')=>({pageid:7,ns:6,title:'File:'+name,imageinfo:[{
 thumburl:IMAGE,width:1800,height:1100,mime:'image/jpeg',
 descriptionurl:'https://commons.wikimedia.org/wiki/File:Moreish_Idols_live.jpg',
 extmetadata:{LicenseShortName:{value:licence},Artist:{value:'Venue photographer'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}}
]});
const categoryPages=(...pages)=>({query:{pages:Object.fromEntries(pages.map((p,i)=>[String(i+1),p]))}});
const item=id=>({rank:'normal',mainsnak:{datavalue:{value:{id}}}});
const txt=value=>({rank:'normal',mainsnak:{datavalue:{value}}});
const band=(cat='Moreish Idols',extra={})=>({id:'Q100',
 labels:{en:{value:'Moreish Idols'}},descriptions:{en:{value:'British rock band'}},
 claims:{P31:[item('Q215380')],...(cat?{P373:[txt(cat)]}:{})},...extra});
const event={artist:'Moreish Idols',artists:['Moreish Idols'],country:'NL',date:'2026-12-20',image:'',source:'venue-official'};

test('accept only a category explicitly linked to this exact musical artist',()=>{
 assert.equal(linkedArtistCategory(band()),'Moreish Idols');
 assert.equal(linkedArtistCategory(band('Moreish Idols (band)')),'Moreish Idols (band)');
 assert.equal(linkedArtistCategory(band(null,{sitelinks:{commonswiki:{title:'Category:Moreish Idols'}}})),'Moreish Idols');
 assert.equal(linkedArtistCategory(band('Moreish Idols',{sitelinks:{commonswiki:{title:'Category:Moreish Idol Fans'}}})),'');
 assert.equal(linkedArtistCategory(band('British rock music')),'');
 assert.equal(linkedArtistCategory(band('Moreish Idols albums')),'');
 assert.equal(linkedArtistCategory(band(null)),'');
 assert.equal(linkedArtistCategory(band('Moreish Idols',{claims:{P31:[item('Q215380')],P373:[txt('Moreish Idols'),txt('Different category')]}})),'');
});

test('artist category query uses linked category, not a broad name search',()=>{
 const u=new URL(commonsArtistCategoryUrl('Moreish Idols'));
 assert.equal(u.hostname,'commons.wikimedia.org');
 assert.equal(u.searchParams.get('generator'),'categorymembers');
 assert.equal(u.searchParams.get('gcmtitle'),'Category:Moreish Idols');
 assert.equal(u.searchParams.get('gcmnamespace'),'6');
 assert.throws(()=>commonsArtistCategoryUrl('https://evil.test/x'));
});

test('requires full artist name in filename and licensed photographic media',()=>{
 const r=selectLicensedCategoryPhoto(categoryPages(
  file('Moreish Idols live concert.jpg'),
  file('Moreish Idols album cover.png'),
  file('Other band live.jpg'),
  file('Moreish Idols fanart.jpg'),
  file('Moreish Idols secret photo.jpg','CC BY-NC 4.0')
 ),'Moreish Idols','Q100');
 assert.equal(r.image,IMAGE);
 assert.equal(r.author,'Venue photographer');
 assert.equal(r.licence,'CC BY 4.0');
 assert.equal(selectLicensedCategoryPhoto(categoryPages(file('Other band.jpg')),'Moreish Idols','Q100'),null);
 assert.equal(selectLicensedCategoryPhoto(categoryPages(file('Moreish Idols photo.jpg')),'Mono','Q100'),null);
});

test('uses verified artist category after P18 missing and P180 empty',async()=>{
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  const payload=url.includes('wbsearchentities')?{search:[{id:'Q100',label:'Moreish Idols'}]}
   :url.includes('wbgetentities')?{entities:{Q100:band()}}
   :url.includes('generator=categorymembers')?categoryPages(file('Moreish Idols live concert.jpg'))
   :{query:{pages:{}}};
  return {ok:true,status:200,json:async()=>payload};
 };
 const r=await enrichWikimediaArtistPhotos([event],{artists:{},wikimediaAttempted:{}},{
  today:'2026-11-06',fetcher,delay:async()=>{},maxArtists:1});
 assert.equal(r.stats.found,1);assert.equal(r.stats.categoryFound,1);
 assert.equal(r.stats.categoryQueries,1);
 assert.equal(r.cache.artists['moreish idols'].matchedBy,'wikidata-linked-artist-category');
 assert.match(r.cache.artists['moreish idols'].credit.text,/Venue photographer/);
 assert.ok(urls.some(x=>x.includes('generator=categorymembers')));
});

test('older Wikimedia failure is rechecked only once with the newer linked identity strategy',async()=>{
 const original={artists:{},wikimediaAttempted:{'moreish idols':{strategyVersion:2,retryAfter:'2027-02-01',reason:'no-licensed-commons-photo'}}};
 let calls=0;
 const fetcher=async u=>{
  calls++;
  const payload=u.includes('wbsearchentities')?{search:[{id:'Q100',label:'Moreish Idols'}]}
   :u.includes('wbgetentities')?{entities:{Q100:band()}}:{query:{pages:{}}};
  return {ok:true,status:200,json:async()=>payload};
 };
 const r=await enrichWikimediaArtistPhotos([event],original,{today:'2026-11-06',fetcher,delay:async()=>{},maxArtists:1});
 assert.equal(r.stats.attempted,1);
 assert.equal(r.cache.wikimediaAttempted['moreish idols'].strategyVersion,6);
 const count=calls;
 const again=await enrichWikimediaArtistPhotos([event],r.cache,{today:'2026-11-06',fetcher,delay:async()=>{},maxArtists:1});
 assert.equal(again.stats.attempted,0);assert.equal(calls,count);
});
