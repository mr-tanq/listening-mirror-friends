import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedArtistPhoto,resolveConcertImage} from '../js/artist-images.js';
import {audioDbLicense,verifiedAudioDbArtist,enrichAudioDbArtistPhotos} from '../scripts/theaudiodb-artist-photos.mjs';

const MBID='53f91349-cd07-48c3-926d-35890cf0b95f';
const MBID2='21822f52-470c-4241-8c54-aa92026ac0b8';
const thumb='https://www.theaudiodb.com/images/media/artist/thumb/uxrqxy1347913147.jpg';
const row=(extra={})=>({idArtist:'115223',strArtist:'Niall McCabe',strMusicBrainzID:MBID,
 strCreativeCommons:'CC0 1.0',strArtistThumb:thumb,...extra});
const payload=(...artists)=>({artists});
const show=(name='Niall McCabe',date='2026-11-12')=>({
 id:'event-'+name,artist:name,artists:[name],country:'NL',date,
 venue:'TivoliVredenburg',source:'podiuminfo-agenda',image:''
});
const res=data=>({ok:true,status:200,json:async()=>data});
const photoCache=()=>({artists:{},attempted:{}});
const identities=()=>({artists:{'niall mccabe':{mbid:MBID}}});

test('accept only genuinely reusable CC0 or attributed CC BY / BY-SA, never NC, ND or a vague true flag',()=>{
 for(const text of ['CC0','CC0 1.0','Public Domain'])assert.equal(audioDbLicense(text),'CC0');
 assert.equal(audioDbLicense('CC BY-SA 4.0'),'CC BY SA 4.0');
 assert.equal(audioDbLicense('https://creativecommons.org/licenses/by/4.0/'),'CC BY 4.0');
 for(const text of ['true','yes','1','CC BY-NC 4.0','CC BY-ND 4.0','CC BY-SA-NC 4.0','all rights reserved',''])
  assert.equal(audioDbLicense(text),'',text);
});
test('an exact MusicBrainz ID AND exact performer name are mandatory',()=>{
 const correct=verifiedAudioDbArtist(payload(row()),'Niall McCabe',MBID);
 assert.equal(correct.reason,'accepted');
 assert.equal(correct.photo.image,thumb);
 assert.equal(correct.photo.source,'theaudiodb');
 assert.match(correct.photo.credit.text,/CC0.*TheAudioDB/);
 assert.equal(correct.photo.credit.url,'https://www.theaudiodb.com/artist/115223');
 for(const broken of [
  payload(row({strArtist:'Other Niall McCabe'})),
  payload(row({strMusicBrainzID:MBID2})),
  payload(row(),row({idArtist:'115224'}))
 ])assert.equal(verifiedAudioDbArtist(broken,'Niall McCabe',MBID).photo,null);
 assert.equal(verifiedAudioDbArtist(payload(row()),'Niall McCabe','invalid-mbid').photo,null);
});
test('unlicensed portraits, album art, fanart, unknown authors and arbitrary image URLs are rejected',()=>{
 assert.equal(verifiedArtistPhoto(thumb),thumb);
 const cases=[
  [row({strCreativeCommons:null}),'photo-license-not-confirmed'],
  [row({strCreativeCommons:'CC BY-NC 4.0'}),'photo-license-not-confirmed'],
  [row({strCreativeCommons:'CC BY-SA 4.0'}),'missing-required-creator-credit'],
  [row({strArtistThumb:'https://www.theaudiodb.com/images/media/album/thumb/uxrqxy1347913147.jpg'}),'no-approved-artist-photo'],
  [row({strArtistThumb:'https://www.theaudiodb.com/images/media/artist/fanart/uxrqxy1347913147.jpg'}),'no-approved-artist-photo'],
  [row({strArtistThumb:'https://evil.example.com/artist.jpg'}),'no-approved-artist-photo'],
  [row({idArtist:'<script>alert(1)</script>'}),'invalid-provider-artist-id'],
 ];
 for(const [data,reason] of cases)assert.equal(verifiedAudioDbArtist(payload(data),'Niall McCabe',MBID).reason,reason,reason);
 assert.equal(verifiedArtistPhoto(thumb+'?format=album'),'');
 const credited=verifiedAudioDbArtist(payload(row({
  strCreativeCommons:'CC BY-SA 4.0',strArtistThumbCredit:'Photographer Name'})),'Niall McCabe',MBID);
 assert.equal(credited.reason,'accepted');
 assert.match(credited.photo.credit.text,/Photographer Name.*CC BY SA 4\.0/);
});
test('shared image resolver consumes newly verified photo automatically, without a concert-specific override',async()=>{
 let count=0;
 const r=await enrichAudioDbArtistPhotos([show()],photoCache(),identities(),{
  today:'2026-11-08',maxArtists:2,fetcher:async url=>{
   count++;assert.match(url,/^https:\/\/www\.theaudiodb\.com\/api\/v1\/json\/123\/artist-mb\.php\?i=/);
   assert.ok(url.includes(MBID));
   return res(payload(row()));
  },delay:async()=>{}
 });
 assert.equal(count,1);
 assert.equal(r.stats.eligible,1);
 assert.equal(r.stats.found,1);
 assert.equal(r.cache.artists['niall mccabe'].source,'theaudiodb');
 assert.equal(resolveConcertImage(show(),r.cache).url,thumb);
 assert.equal(resolveConcertImage(show(),r.cache).kind,'artist-photo');
 assert.equal(r.cache.audioDbAttempted['niall mccabe'],undefined);
});
test('no MBID, cached photograph and explicit provider backoff never trigger requests',async()=>{
 let requests=0;
 const never=async()=>{requests++;throw Error('Should not contact source');};
 const a=await enrichAudioDbArtistPhotos([show()],photoCache(),{artists:{}},{
  today:'2026-11-08',fetcher:never
 });
 assert.equal(a.stats.attempted,0);
 const b=await enrichAudioDbArtistPhotos([show()],{artists:{'niall mccabe':{image:thumb}}},
  identities(),{today:'2026-11-08',fetcher:never});
 assert.equal(b.stats.attempted,0);
 const c=await enrichAudioDbArtistPhotos([show()],{
  artists:{},audioDbAttempted:{'niall mccabe':{retryAfter:'2026-12-25',reason:'photo-license-not-confirmed'}}
 },identities(),{today:'2026-11-08',fetcher:never});
 assert.equal(c.stats.attempted,0);
 assert.equal(requests,0);
});
test('provider rate limits stop further calls and do not overwrite artist images',async()=>{
 let clockTime=0;const times=[];
 const ids={artists:{
  'niall mccabe':{mbid:MBID},
  'leenalchi':{mbid:MBID2},
  'nems':{mbid:'f76e0b8d-4fcf-49d6-8d23-1ae5ce047826'}
 }};
 const events=[show('Niall McCabe','2026-11-09'),show('LEENALCHI','2026-11-12'),show('NEMS','2026-11-14')];
 const a=await enrichAudioDbArtistPhotos(events,photoCache(),ids,{
  today:'2026-11-08',maxArtists:3,maxDurationMs:120000,
  clock:()=>clockTime,delay:async ms=>{clockTime+=ms},
  fetcher:async()=>{times.push(clockTime);return times.length===2?
   {ok:false,status:429}:res(payload(row()));}
 });
 assert.equal(a.stats.rateLimited,1);
 assert.equal(a.stats.attempted,2);
 assert.equal(times[1]-times[0]>=2100,true);
 assert.equal(a.cache.artists['niall mccabe'].source,'theaudiodb');
 assert.equal(a.cache.audioDbAttempted.leenalchi.reason,'provider-rate-limited');
 assert.equal(a.cache.artists.nems,undefined);
});
test('unconfirmed rights are counted, cached as misses and never published as a picture',async()=>{
 const result=await enrichAudioDbArtistPhotos([show()],photoCache(),identities(),{
  today:'2026-11-08',maxArtists:2,fetcher:async()=>res(payload(row({strCreativeCommons:''})))
 });
 assert.equal(result.stats.found,0);
 assert.equal(result.stats.licenseMissing,1);
 assert.equal(result.cache.artists['niall mccabe'],undefined);
 assert.equal(result.cache.audioDbAttempted['niall mccabe'].reason,'photo-license-not-confirmed');
});
