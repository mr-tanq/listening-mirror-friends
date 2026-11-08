import test from 'node:test';
import assert from 'node:assert/strict';
import {
 commonsArtistSubcategoriesUrl,verifiedArtistSubcategories,
 commonsArtistCategoryUrl
} from '../scripts/commons-category-photos.mjs';
import {enrichWikimediaArtistPhotos} from '../scripts/wikimedia-artist-photos.mjs';

const image='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/IMG_3915.jpg/960px-IMG_3915.jpg';
const claimItem=id=>({rank:'normal',mainsnak:{datavalue:{value:{id}}}});
const claimValue=value=>({rank:'normal',mainsnak:{datavalue:{value}}});
const band={id:'Q9898',labels:{en:{value:'Velvet Satellites'}},
 descriptions:{en:{value:'British independent rock band'}},
 claims:{P31:[claimItem('Q215380')],P373:[claimValue('Velvet Satellites')]}};
const source={artist:'Velvet Satellites',artists:['Velvet Satellites'],date:'2026-11-13',
 country:'NL',venue:'Venue X',image:''};
const json=value=>({status:200,ok:true,json:async()=>value});
const pages=(...entries)=>({query:{pages:Object.fromEntries(entries.map((x,i)=>[i+1,x]))}});
const category=name=>({ns:14,title:'Category:'+name,pageid:50});
const file=(label,license='CC BY-SA 4.0',description='Velvet Satellites performing live')=>({
 ns:6,title:'File:'+label,pageid:22,imageinfo:[{
  thumburl:image,width:1900,height:1200,mime:'image/jpeg',
  descriptionurl:'https://commons.wikimedia.org/wiki/File:IMG_3915.jpg',
  extmetadata:{LicenseShortName:{value:license},
   Artist:{value:'Concert photographer'},
   LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},
   ImageDescription:{value:description}
  }
 }]
});
test('only first-level named performance/year child categories are eligible',()=>{
 const url=new URL(commonsArtistSubcategoriesUrl('Velvet Satellites'));
 assert.equal(url.hostname,'commons.wikimedia.org');
 assert.equal(url.searchParams.get('gcmtitle'),'Category:Velvet Satellites');
 assert.equal(url.searchParams.get('gcmnamespace'),'14');
 assert.equal(url.searchParams.get('gcmlimit'),'20');
 assert.throws(()=>commonsArtistSubcategoriesUrl('https://untrusted.test/'));
 const list=verifiedArtistSubcategories(pages(
  category('Velvet Satellites at Paradiso 2025'),
  category('Other Artist at Paradiso 2025'),
  category('Velvet Satellites discography'),
  category('Velvet Satellites at Roadburn 2024'),
  category('Velvet Satellites album covers'),
  category('Velvet Satellites members'),
  category('Velvet Satellites music'),
  category('Velvet Satellites in 2022'),
  {ns:6,title:'File:Velvet Satellites live.jpg',pageid:80}
 ),'Velvet Satellites');
 assert.deepEqual(list,['Velvet Satellites at Paradiso 2025','Velvet Satellites at Roadburn 2024']);
 assert.equal(verifiedArtistSubcategories(pages(category('Other Artist in 2026')),'Velvet Satellites').length,0);
 assert.equal(verifiedArtistSubcategories(pages(category('Velvet Satellites at Roadburn 2024')),'Velvet').length,0);
});
test('shared Commons photo pipeline recovers a licensed photo from a verified direct child performance category',async()=>{
 const requests=[];
 const fetcher=async uri=>{
  const u=new URL(uri);
  requests.push(u);
  if(u.searchParams.get('action')==='wbgetentities')return json({entities:{Q9898:band}});
  if(u.searchParams.get('generator')==='search')return json(pages());
  if(u.searchParams.get('generator')==='categorymembers'){
   const title=u.searchParams.get('gcmtitle'),ns=u.searchParams.get('gcmnamespace');
   if(title==='Category:Velvet Satellites'&&ns==='6')return json(pages());
   if(title==='Category:Velvet Satellites'&&ns==='14')return json(pages(
    category('Velvet Satellites album covers'),
    category('Velvet Satellites at Rock Festival 2023'),
    category('Velvet Satellites at Paradiso 2025')
   ));
   if(title==='Category:Velvet Satellites at Paradiso 2025'&&ns==='6')
    return json(pages(file('IMG_3915.jpg')));
   throw Error('Unexpected Commons child category '+title);
  }
  throw Error('Unrecognized request '+uri);
 };
 const result=await enrichWikimediaArtistPhotos([source],{
  artists:{},wikimediaAttempted:{
   'velvet satellites':{strategyVersion:6,retryAfter:'2027-02-01',reason:'no-licensed-commons-photo'}
  }
 },{
  today:'2026-11-08',fetcher,delay:async()=>{},maxArtists:1,
  identityCache:{artists:{'velvet satellites':{wikidata:'Q9898'}}}
 });
 assert.equal(result.stats.found,1);
 assert.equal(result.stats.categoryFound,1);
 assert.equal(result.stats.subcategoryPhotoFound,1);
 assert.equal(result.stats.subcategoryQueries,2);
 assert.equal(result.cache.artists['velvet satellites'].image,image);
 assert.equal(result.cache.artists['velvet satellites'].matchedBy,'wikidata-linked-artist-subcategory-description');
 assert.match(result.cache.artists['velvet satellites'].credit.text,/Concert photographer/);
 assert.equal(result.cache.wikimediaAttempted['velvet satellites'],undefined);
 assert.equal(requests.filter(x=>x.searchParams.get('generator')==='categorymembers'&&
  x.searchParams.get('gcmnamespace')==='14').length,1);
 assert.ok(requests.every(x=>x.hostname==='www.wikidata.org'||x.hostname==='commons.wikimedia.org'));
});
test('unverified source or an unlicensed child photo never becomes a published image',async()=>{
 const urls=[];
 const fetcher=async uri=>{
  urls.push(uri);
  const u=new URL(uri);
  if(u.searchParams.get('action')==='wbgetentities')return json({entities:{Q9898:band}});
  if(u.searchParams.get('generator')==='search')return json(pages());
  if(u.searchParams.get('gcmnamespace')==='14')
   return json(pages(category('Velvet Satellites at Paradiso 2025')));
  if(u.searchParams.get('gcmtitle')==='Category:Velvet Satellites at Paradiso 2025')
   return json(pages(file('IMG_3915.jpg','CC BY-NC 4.0')));
  return json(pages());
 };
 const result=await enrichWikimediaArtistPhotos([source],{artists:{}},{
  today:'2026-11-08',fetcher,delay:async()=>{},maxArtists:1,
  identityCache:{artists:{'velvet satellites':{wikidata:'Q9898'}}}
 });
 assert.equal(result.stats.found,0);
 assert.equal(result.cache.artists['velvet satellites'],undefined);
 assert.equal(result.cache.wikimediaAttempted['velvet satellites'].strategyVersion,7);
 const withoutIdentity=await enrichWikimediaArtistPhotos([source],{artists:{}},{
  today:'2026-11-08',maxArtists:1,delay:async()=>{},
  fetcher:async url=>{
   if(url.includes('wbsearchentities'))return json({search:[]});
   throw Error('No linked music identity; must not browse Commons categories');
  }
 });
 assert.equal(withoutIdentity.stats.subcategoryQueries,0);
});
test('existing trusted photo prevents additional Commons and subcategory API calls',async()=>{
 const r=await enrichWikimediaArtistPhotos([source],{artists:{
  'velvet satellites':{image,source:'wikimedia-commons'}
 }},{
  today:'2026-11-08',maxArtists:1,fetcher:async()=>{throw Error('Already covered')}
 });
 assert.equal(r.stats.attempted,0);assert.equal(r.stats.subcategoryQueries,0);
});
