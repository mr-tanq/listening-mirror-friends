import test from 'node:test';
import assert from 'node:assert/strict';
import {artistKey,verifiedArtistPhoto,addPodiuminfoArtists,resolveConcertImage} from '../js/artist-images.js';
const photo='https://www.podiuminfo.nl/img/artist/100/100_MONO_1.jpg';
test('normalizes artist names but rejects remote or non-artist photo URLs',()=>{
 assert.equal(artistKey('Sólstafir'),'solstafir');
 assert.equal(verifiedArtistPhoto(photo),photo);
 assert.equal(verifiedArtistPhoto('https://www.podiuminfo.nl/img/concert/cover.jpg'),'');
 assert.equal(verifiedArtistPhoto('https://evil.example/img/artist/100/fake.jpg'),'');
});
test('event poster outranks artist photo',()=>{
 const data=addPodiuminfoArtists(null,[{artist:'MONO',image:photo}]).cache;
 assert.deepEqual(resolveConcertImage({artist:'MONO',image:'https://venue.test/poster.jpg'},data),
  {url:'https://venue.test/poster.jpg',kind:'event-poster'});
 assert.deepEqual(resolveConcertImage({artist:'MONO',image:''},data),
  {url:photo,kind:'artist-photo'});
});
test('same artist receives stored image and others get fallback',()=>{
 const r=addPodiuminfoArtists({artists:{}},[{artist:'Sólstafir',image:photo,sourceUrl:'https://www.podiuminfo.nl/concert/123/example/Vera/'}]);
 assert.equal(r.added,1);
 assert.equal(resolveConcertImage({artist:'SOLSTAFIR',image:''},r.cache).url,photo);
 assert.equal(resolveConcertImage({artist:'Other',image:''},r.cache).kind,'fallback');
});
test('never treats an event poster as an artist portrait',()=>{
 const c=addPodiuminfoArtists(null,[{artist:'MONO',image:'https://venue.test/poster.jpg'}]);
 assert.equal(c.added,0);
 assert.equal(resolveConcertImage({artist:'MONO'},c.cache).url,'');
});
