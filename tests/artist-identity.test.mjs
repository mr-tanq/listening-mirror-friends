import test from 'node:test';
import assert from 'node:assert/strict';
import {headlinerNames,verifiedArtistPhoto,resolveConcertImage,addPodiuminfoArtists} from '../js/artist-images.js';
import {deezerSearchVerdict,isAlbumCoverPortrait,enrichDeezerArtistImages,selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';
import {pickMusicBrainzArtist,linksFromRelations,imageFileFromWikidata,commonsPhotoFromImageInfo,enrichMusicBrainzIdentities} from '../scripts/musicbrainz-identity.mjs';
import {createRateLimiter} from '../scripts/rate-limit.mjs';

const md5='3780a546a18503f1ca1e67358750847e';
const dz=`https://cdn-images.dzcdn.net/images/artist/${md5}/1000x1000-000000-80-0-0.jpg`;
const commonsThumb='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Wolfbrigade_live.jpg/960px-Wolfbrigade_live.jpg';
const ev=(artist,extra={})=>({artist,artists:[artist],country:'NL',date:'2026-12-01',image:'',genre:'',...extra});
const ok=data=>({ok:true,status:200,json:async()=>data});
const noWait={delay:async()=>{}};

test('headliner names strip tour titles, presenters and guests but keep real band names',()=>{
 assert.deepEqual(headlinerNames(ev('Caro - Returning to Innocence')),['Caro - Returning to Innocence','Caro']);
 assert.ok(headlinerNames(ev('Tales From The Punx: Wolfbrigade')).includes('Wolfbrigade'));
 assert.ok(headlinerNames(ev('Baroeg Tribute Night: BEATALLICA')).includes('BEATALLICA'));
 assert.ok(headlinerNames(ev('Disco Inferno met Discophonic Orchestra – 5 YEARS MAASTRICHT')).includes('Disco Inferno'));
 assert.ok(headlinerNames(ev('Extince - 30 JAAR SPRAAKWATER')).includes('Extince'));
 // "Artist: subtitle" keeps the artist, not the subtitle
 assert.ok(headlinerNames(ev('Ludovico Einaudi: The Summer Portraits')).includes('Ludovico Einaudi'));
 assert.ok(!headlinerNames(ev('Ludovico Einaudi: The Summer Portraits')).includes('The Summer Portraits'));
 // Ampersand and a single comma are part of real band names
 assert.deepEqual(headlinerNames(ev('Earth, Wind & Fire')),['Earth, Wind & Fire']);
 // Support acts are never candidates for the headliner's photo
 assert.ok(!headlinerNames({artist:'Benjamin Herman trio',artists:['Benjamin Herman trio','Tomoaki Baba']}).includes('Tomoaki Baba'));
});

test('cards resolve a photo stored under a derived headliner name, with its credit',()=>{
 const cache={artists:{caro:{image:dz,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/1'}}}};
 assert.deepEqual(resolveConcertImage(ev('Caro - Returning to Innocence'),cache),
  {url:dz,kind:'artist-photo',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/1'}});
 assert.equal(resolveConcertImage({...ev('Caro'),image:'https://venue.test/poster.jpg'},cache).kind,'event-poster');
});

test('only Commons originals or thumbnails of photos are accepted',()=>{
 assert.equal(verifiedArtistPhoto(commonsThumb),commonsThumb);
 assert.equal(verifiedArtistPhoto('https://upload.wikimedia.org/wikipedia/commons/a/ab/Band.jpg'),'https://upload.wikimedia.org/wikipedia/commons/a/ab/Band.jpg');
 assert.equal(verifiedArtistPhoto('https://upload.wikimedia.org/wikipedia/en/a/ab/Album_cover.jpg'),'');
 assert.equal(verifiedArtistPhoto('https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo.svg'),'');
});

test('podiuminfo thumbnails never replace better portraits and backoff state survives',()=>{
 const existing={version:1,artists:{mono:{image:dz,source:'deezer'}},attempted:{x:{retryAfter:'2027-01-01'}}};
 const r=addPodiuminfoArtists(existing,[{artist:'MONO',image:'https://www.podiuminfo.nl/img/artist/100/mono.jpg'}]);
 assert.equal(r.cache.artists.mono.image,dz);
 assert.deepEqual(r.cache.attempted,existing.attempted);
});

test('Deezer verdicts: unique, ambiguous same-name and album-cover portraits',()=>{
 assert.equal(deezerSearchVerdict({data:[{id:1,name:'Distant',picture_xl:dz}]},'Distant').artist.deezerId,1);
 const amb=deezerSearchVerdict({data:[{id:1,name:'Distant',picture_xl:dz},{id:2,name:'DISTANT',picture_xl:dz}]},'Distant');
 assert.equal(amb.artist,null);assert.equal(amb.reason,'ambiguous-same-name');assert.deepEqual(amb.candidates,[1,2]);
 assert.equal(deezerSearchVerdict({data:[{id:1,name:'Distant',picture_xl:'https://cdn-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg'}]},'Distant').reason,'no-photo');
 assert.equal(isAlbumCoverPortrait(dz,{data:[{md5_image:md5}]}),true);
 assert.equal(isAlbumCoverPortrait(dz,{data:[{md5_image:'ffff'}]}),false);
});

test('Deezer stage looks up derived headliners, rejects cover art and retries quota errors',async()=>{
 let quotaOnce=true;
 const fetcher=async url=>{
  if(url.includes('/search/artist')&&url.includes('Caro')){
   if(quotaOnce){quotaOnce=false;return ok({error:{code:4,message:'Quota limit exceeded'}});}
   return ok({data:[{id:9,name:'Caro',picture_xl:dz}]});
  }
  if(url.includes('/search/artist'))return ok({data:[{id:5,name:'Coverband',picture_xl:dz}]});
  if(url.includes('/artist/5/albums'))return ok({data:[{md5_image:md5}]});
  return ok({data:[]});
 };
 const r=await enrichDeezerArtistImages([ev('Caro - Returning to Innocence'),ev('Coverband')],{artists:{}},{today:'2026-11-05',fetcher,...noWait});
 assert.equal(r.cache.artists['caro'].image,dz);
 assert.equal(r.cache.artists['coverband'],undefined);
 assert.equal(r.cache.attempted['coverband'].reason,'album-cover-as-portrait');
 assert.equal(r.stats.coverRejected,1);
});

test('the backlog advances instead of retrying the same names every run',async()=>{
 const events=['A1','B2','C3','D4'].map(x=>ev('Band '+x));
 const fetcher=async()=>ok({data:[]});
 const first=await enrichDeezerArtistImages(events,{artists:{}},{today:'2026-11-05',fetcher,maxRequests:2,...noWait});
 const second=await enrichDeezerArtistImages(events,first.cache,{today:'2026-11-05',fetcher,maxRequests:2,...noWait});
 assert.equal(Object.keys(second.cache.attempted).length,4);
});

test('MusicBrainz picks unique names and resolves same-name bands only with clear context',()=>{
 const a=(id,extra)=>({id:id.padEnd(36,'0').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/,'$1-$2-$3-$4-$5'),score:100,name:'Distant',type:'Group',...extra});
 const uniq=pickMusicBrainzArtist({artists:[a('aaaa',{country:'NL'})]},'Distant',{country:'NL'});
 assert.equal(uniq.artist.matchedBy,'unique-name');
 const ctx=pickMusicBrainzArtist({artists:[a('aaaa',{country:'NL',tags:[{name:'deathcore'}]}),a('bbbb',{country:'US',tags:[{name:'jazz'}]})]},'Distant',{country:'NL',genre:'Metal'});
 assert.match(ctx.artist.matchedBy,/country/);assert.ok(ctx.artist.id.startsWith('aaaa'));
 const amb=pickMusicBrainzArtist({artists:[a('aaaa',{country:'US'}),a('bbbb',{country:'GB'})]},'Distant',{country:'NL'});
 assert.equal(amb.artist,null);assert.equal(amb.reason,'ambiguous');
 assert.equal(pickMusicBrainzArtist({artists:[{...a('cccc'),name:'Distant Lights'}]},'Distant').artist,null);
});

test('relations, Wikidata P18 and Commons licence checks',()=>{
 const links=linksFromRelations({relations:[
  {type:'wikidata',url:{resource:'https://www.wikidata.org/wiki/Q123'}},
  {type:'free streaming',url:{resource:'https://www.deezer.com/artist/4242'}},
  {type:'official homepage',url:{resource:'https://band.example/'}},
  {type:'wikidata',ended:true,url:{resource:'https://www.wikidata.org/wiki/Q999'}}]});
 assert.deepEqual(links,{wikidata:'Q123',deezerId:4242,homepage:'https://band.example/'});
 assert.equal(imageFileFromWikidata({entities:{Q1:{claims:{P18:[
  {rank:'normal',mainsnak:{datavalue:{value:'Old.jpg'}}},{rank:'preferred',mainsnak:{datavalue:{value:'Best.jpg'}}}]}}}},'Q1'),'Best.jpg');
 const info=(licence,extra={})=>({query:{pages:{1:{imageinfo:[{thumburl:commonsThumb,url:commonsThumb,width:3000,height:2000,mime:'image/jpeg',
  descriptionurl:'https://commons.wikimedia.org/wiki/File:Wolfbrigade_live.jpg',
  extmetadata:{LicenseShortName:{value:licence},Artist:{value:'<a href="x">Jane Doe</a>'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0'}},...extra}]}}}});
 const p=commonsPhotoFromImageInfo(info('CC BY-SA 4.0'));
 assert.equal(p.image,commonsThumb);assert.equal(p.author,'Jane Doe');
 assert.equal(p.credit.text,'Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons');
 assert.equal(commonsPhotoFromImageInfo(info('Fair use')),null);
 assert.equal(commonsPhotoFromImageInfo(info('CC BY-NC 2.0')),null);
 assert.equal(commonsPhotoFromImageInfo(info('CC0',{width:200,height:150})),null);
});

test('identity stage stores a licensed Commons photo, and a linked Deezer id when no free photo exists',async()=>{
 const mbid1='11111111-1111-1111-1111-111111111111',mbid2='22222222-2222-2222-2222-222222222222';
 const fetcher=async url=>{
  if(url.includes('/ws/2/artist/?')&&url.includes('Wolfbrigade'))return ok({artists:[{id:mbid1,score:100,name:'Wolfbrigade',type:'Group',country:'SE'}]});
  if(url.includes('/ws/2/artist/?'))return ok({artists:[{id:mbid2,score:100,name:'Distant',type:'Group',country:'NL'}]});
  if(url.includes(mbid1))return ok({relations:[{type:'wikidata',url:{resource:'https://www.wikidata.org/wiki/Q7'}}]});
  if(url.includes(mbid2))return ok({relations:[{type:'free streaming',url:{resource:'https://www.deezer.com/artist/77'}}]});
  if(url.includes('wikidata.org'))return ok({entities:{Q7:{claims:{P18:[{rank:'normal',mainsnak:{datavalue:{value:'Wolfbrigade live.jpg'}}}]}}}});
  if(url.includes('commons.wikimedia.org'))return ok({query:{pages:{1:{imageinfo:[{thumburl:commonsThumb,width:2000,height:1500,mime:'image/jpeg',
   descriptionurl:'https://commons.wikimedia.org/wiki/File:Wolfbrigade_live.jpg',extmetadata:{LicenseShortName:{value:'CC BY 2.0'},Artist:{value:'Jane Doe'}}}]}}}});
  throw new Error('unexpected '+url);
 };
 const deezerClient={get:async path=>path.endsWith('/albums?limit=100')?{data:[]}:{id:77,name:'Distant',picture_xl:dz},requests:0};
 const r=await enrichMusicBrainzIdentities([ev('Tales From The Punx: Wolfbrigade'),ev('Distant')],{artists:{}},{artists:{}},
  {today:'2026-11-05',fetcher,deezerClient,...noWait});
 assert.equal(r.images.artists.wolfbrigade.source,'wikimedia-commons');
 assert.equal(r.images.artists.wolfbrigade.licence,'CC BY 2.0');
 assert.equal(r.images.artists.distant.deezerId,77);
 assert.equal(r.images.artists.distant.matchedBy,'musicbrainz-link');
 assert.equal(r.identities.artists.wolfbrigade.wikidata,'Q7');
 assert.equal(r.stats.commons,1);assert.equal(r.stats.deezerLinked,1);
 assert.equal(resolveConcertImage(ev('Tales From The Punx: Wolfbrigade'),r.images).credit.text,'Photo: Jane Doe · CC BY 2.0 · Wikimedia Commons');
});

test('rate limiter never exceeds its window',async()=>{
 let now=0;const starts=[];
 const limiter=createRateLimiter({max:2,perMs:1000,clock:()=>now,delay:async ms=>{now+=ms;}});
 for(let i=0;i<5;i++){await limiter.wait();starts.push(now);}
 assert.deepEqual(starts,[0,0,1000,1000,2000]);
});

test('candidate selection ignores events that already have posters',()=>{
 const c=selectArtistCandidates([{...ev('MONO'),image:'https://venue.test/p.jpg'},ev('Mogwai')],{artists:{}},{today:'2026-11-05'});
 assert.deepEqual(c.map(x=>x.key),['mogwai']);
});

import {applyArtistImageOverrides} from '../scripts/artist-image-overrides.mjs';
test('review overrides block wrong photos permanently and pin reviewed ones',()=>{
 const cache={artists:{distant:{image:dz,source:'deezer'}},attempted:{}};
 const r=applyArtistImageOverrides(cache,{block:['Distant'],pin:[{artist:'Wolfbrigade',image:commonsThumb,credit:{text:'Photo: Jane Doe · CC BY 2.0',url:'https://commons.wikimedia.org/wiki/File:Wolfbrigade_live.jpg'}},{artist:'Bad',image:'https://evil.test/x.jpg'}]});
 assert.equal(r.cache.artists.distant,undefined);
 assert.equal(r.cache.attempted.distant.reason,'blocked-by-review');
 assert.equal(r.cache.artists.wolfbrigade.source,'manual-pin');
 assert.equal(r.cache.artists.bad,undefined);
 assert.equal(r.blocked,1);assert.equal(r.pinned,1);
});
