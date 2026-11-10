import test from 'node:test';
import assert from 'node:assert/strict';
import {
 verifiedArtistPhoto,pruneInvalidArtistPhotos,resolveConcertImage
} from '../js/artist-images.js';
import {selectArtistCandidates,deezerSearchVerdict,deezerEntry} from '../scripts/deezer-artist-images.mjs';

const placeholder='https://cdn-images.dzcdn.net/images/artist/d41d8cd98f00b204e9800998ecf8427e/1000x1000-000000-80-0-0.jpg';
const real='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const event=artist=>({artist,date:'2026-11-12',country:'NL',image:''});

test('Deezer empty-MD5 placeholder can never pass as a verified artist portrait',()=>{
 assert.equal(verifiedArtistPhoto(placeholder),'');
 assert.equal(verifiedArtistPhoto(placeholder.replace('cdn-images.dzcdn.net','e-cdns-images.dzcdn.net')),'');
 assert.equal(verifiedArtistPhoto(real),real);
 assert.equal(deezerSearchVerdict({data:[{name:'MONO',id:11,picture_xl:placeholder}]},'MONO').reason,'no-photo');
 assert.equal(deezerEntry({name:'MONO',id:11,picture_xl:placeholder},'MONO','musicbrainz-link'),null);
});

test('legacy placeholders are removed without destroying other cache entries or safety metadata',()=>{
 const previous={version:1,artists:{
  mono:{name:'MONO',source:'deezer',kind:'artist-photo',image:placeholder,deezerId:11},
  'night moves':{name:'Night Moves',source:'deezer',kind:'artist-photo',image:real},
  manual:{name:'Manual',image:'https://untrusted.invalid/portrait.jpg'}
 },attempted:{mono:{reason:'not-found',retryAfter:'2026-11-01'}},
  wikimediaAttempted:{mono:{reason:'no-confirmed-musician',retryAfter:'2026-12-22'}}};
 const {cache,removed}=pruneInvalidArtistPhotos(previous);
 assert.equal(removed,2);
 assert.equal(cache.artists.mono,undefined);
 assert.equal(cache.artists.manual,undefined);
 assert.equal(cache.artists['night moves'].image,real);
 assert.deepEqual(cache.attempted,previous.attempted);
 assert.deepEqual(cache.wikimediaAttempted,previous.wikimediaAttempted);
 assert.deepEqual(selectArtistCandidates([event('MONO')],cache,{today:'2026-11-10'}).map(x=>x.name),['MONO']);
 assert.equal(resolveConcertImage(event('MONO'),cache).kind,'fallback');
});

test('expired provider placeholders must not hide real secondary performer portraits',()=>{
 const cache={artists:{
  mono:{image:placeholder},
  mogwai:{image:real,kind:'artist-photo',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/12'}}
 }};
 const duo={artist:'MONO / Mogwai',artists:['MONO / Mogwai'],date:'2026-11-12',country:'NL',image:''};
 const chosen=resolveConcertImage(duo,cache);
 assert.equal(chosen.url,real);
 assert.match(chosen.credit.text,/Mogwai/);
});
