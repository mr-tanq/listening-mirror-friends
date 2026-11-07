import test from 'node:test';
import assert from 'node:assert/strict';
import {commonsDepictsUrl,selectLicensedDepictsPhoto} from '../scripts/commons-depicts-photos.mjs';
import {enrichWikimediaArtistPhotos} from '../scripts/wikimedia-artist-photos.mjs';

const image='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Moreish_Idols_live.jpg/960px-Moreish_Idols_live.jpg';
const claimId=id=>({rank:'normal',mainsnak:{datavalue:{value:{id}}}});
const claimString=value=>({rank:'normal',mainsnak:{datavalue:{value}}});
const entity=(id='Q123',file='Unfree portrait.jpg')=>({
 id,labels:{en:{language:'en',value:'Moreish Idols'}},
 descriptions:{en:{value:'British rock band'}},
 claims:{P31:[claimId('Q215380')],...(file?{P18:[claimString(file)]}:{})}
});
const search={search:[{id:'Q123',label:'Moreish Idols'}]};
const entities=(...items)=>({entities:Object.fromEntries(items.map(x=>[x.id,x]))});
function page(title,licence,{mime='image/jpeg',width=1400,height=900}={}){
 return {ns:6,pageid:15,title:'File:'+title,imageinfo:[{
  mime,width,height,thumburl:image,
  descriptionurl:'https://commons.wikimedia.org/wiki/File:Moreish_Idols_live.jpg',
  extmetadata:{LicenseShortName:{value:licence},Artist:{value:'<a>Photographer</a>'},
   LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}
 }]};
}
const results=(...pages)=>({query:{pages:Object.fromEntries(pages.map((p,i)=>[String(i+1),p]))}});
const event={artist:'Moreish Idols',artists:['Moreish Idols'],country:'NL',date:'2026-12-12',image:'',source:'venue-official'};
const goodPage=page('Moreish Idols live.jpg','CC BY 4.0');
const deniedPage=page('Moreish Idols copyright.jpg','CC BY-NC 4.0');

test('Commons query requires a real Wikidata QID and searches exact depicts P180',()=>{
 const u=new URL(commonsDepictsUrl('Q123'));
 assert.equal(u.searchParams.get('gsrsearch'),'haswbstatement:P180=Q123');
 assert.equal(u.searchParams.get('gsrnamespace'),'6');
 assert.equal(u.hostname,'commons.wikimedia.org');
 assert.throws(()=>commonsDepictsUrl('random artist'));
});

test('selects licensed musician photograph, not a logo or album artwork',()=>{
 const r=selectLicensedDepictsPhoto(results(
  page('Moreish Idols Album Cover.jpg','CC BY 4.0'),
  page('Moreish Idols official logo.png','CC0'),
  deniedPage,goodPage
 ),'Q123');
 assert.equal(r.image,image);
 assert.equal(r.licence,'CC BY 4.0');
 assert.equal(r.author,'Photographer');
 assert.match(r.credit.text,/CC BY 4.0/);
});

test('rejects non-free, non-image, too small and non-file results',()=>{
 const x=results(deniedPage,
  {...page('Small.jpg','CC BY 4.0'),imageinfo:[{...goodPage.imageinfo[0],width:200,height:200}]},
  {...page('Broken.gif','CC BY 4.0'),imageinfo:[{...goodPage.imageinfo[0],mime:'image/gif'}]},
  {...goodPage,ns:0}
 );
 assert.equal(selectLicensedDepictsPhoto(x,'Q123'),null);
});

test('uses Commons depicts photo when the Wikidata P18 is non-free',async()=>{
 const seen=[];
 const fetcher=async url=>{
  seen.push(url);
  const data=url.includes('wbsearchentities')?search
   :url.includes('wbgetentities')?entities(entity())
   :url.includes('generator=search')?results(goodPage)
   :results(deniedPage);
  return {ok:true,status:200,json:async()=>data};
 };
 const r=await enrichWikimediaArtistPhotos([event],{artists:{},wikimediaAttempted:{}},
  {today:'2026-11-06',fetcher,delay:async()=>{},maxArtists:1});
 assert.equal(r.stats.found,1);
 assert.equal(r.stats.depictsFound,1);
 assert.equal(r.stats.depictsQueries,1);
 assert.equal(r.cache.artists['moreish idols'].image,image);
 assert.equal(r.cache.artists['moreish idols'].matchedBy,'wikidata-exact-commons-depicts');
 assert.match(r.cache.artists['moreish idols'].credit.text,/Photographer/);
 assert.ok(seen.some(x=>x.includes('generator=search')));
});

test('previously rejected P18 records get one new P180/category chance, not repeated every run',async()=>{
 const old={artists:{},wikimediaAttempted:{'moreish idols':{retryAfter:'2027-01-01',reason:'photo-license-or-size-rejected'}}};
 let calls=0;
 const fetcher=async url=>{
  calls++;
  const data=url.includes('wbsearchentities')?search
   :url.includes('wbgetentities')?entities(entity('Q123',''))
   :results(); // Empty P180 search
  return {ok:true,status:200,json:async()=>data};
 };
 const r=await enrichWikimediaArtistPhotos([event],old,{today:'2026-11-06',fetcher,delay:async()=>{},maxArtists:1});
 assert.equal(r.stats.attempted,1);
 assert.equal(r.stats.depictsQueries,1);
 assert.equal(r.cache.wikimediaAttempted['moreish idols'].strategyVersion,5);
 const previously=calls;
 const retry=await enrichWikimediaArtistPhotos([event],r.cache,{today:'2026-11-06',fetcher,delay:async()=>{},maxArtists:1});
 assert.equal(retry.stats.attempted,0);
 assert.equal(calls,previously);
});

test('ambiguous artist identities never trigger photo search',async()=>{
 const twice={search:[{id:'Q123',label:'Moreish Idols'},{id:'Q124',label:'Moreish Idols'}]};
 let requests=0;
 const fetcher=async url=>{
  requests++;
  if(url.includes('generator=search'))throw Error('Must not search Commons without unique identity');
  const data=url.includes('wbsearchentities')?twice
   :entities(entity('Q123'),entity('Q124'));
  return {ok:true,status:200,json:async()=>data};
 };
 const r=await enrichWikimediaArtistPhotos([event],{artists:{}},{today:'2026-11-06',fetcher,delay:async()=>{},maxArtists:1});
 assert.equal(r.stats.found,0);
 assert.equal(r.stats.depictsQueries,0);
 assert.equal(r.stats.ambiguous,1);
 assert.equal(requests,2);
});
