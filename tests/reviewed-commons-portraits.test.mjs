import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedArtistPhoto,resolveConcertImage} from '../js/artist-images.js';
import {applyArtistImageOverrides} from '../scripts/artist-image-overrides.mjs';

const config=JSON.parse(readFileSync(new URL('../data/artist-image-overrides.json',import.meta.url),'utf8'));
const empty={artists:{},attempted:{}};
const show=(id,artist,date,venue)=>({id,artist,artists:[artist],date,country:'NL',venue,image:''});

test('four manually checked Commons photographs have trusted paths, traceable authors and licences',()=>{
 assert.equal(config.pin.length,4);
 for(const pin of config.pin){
  assert.equal(verifiedArtistPhoto(pin.image),pin.image,pin.artist);
  assert.match(pin.sourceUrl,/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  assert.match(pin.credit?.text||'',/Photo: .+Wikimedia .+CC BY/);
  assert.equal(pin.credit.url,pin.sourceUrl);
  assert.ok(pin.license.startsWith('CC BY'));
  assert.ok(pin.reason.length>30);
 }
 const out=applyArtistImageOverrides(empty,config);
 assert.equal(out.pinned,4);
 assert.equal(out.cache.artists.rymden.image,config.pin.find(x=>x.artist==='Rymden').image);
 assert.equal(verifiedArtistPhoto('https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Rymden_Oslo_Jazzfestival_2024_%28181721%29.jpg/960px-Rymden_Oslo_Jazzfestival_2024_%28181721%29.jpg'),config.pin.find(x=>x.artist==='Rymden').image);
 assert.equal(verifiedArtistPhoto('https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Rymden_Oslo_Jazzfestival_2024_%28181721%29.jpg/960px-Rymden_Oslo_Jazzfestival_2024_%28181721%29.jpg?unreviewed=1'),'');
});

test('specific screenshot events now resolve to correctly credited artist photos',()=>{
 const {cache}=applyArtistImageOverrides(empty,config);
 const items=[
  show('podiuminfo-459802','Otis Gibbs','2026-11-10','TivoliVredenburg'),
  show('podiuminfo-451605','Rymden','2026-11-10','TivoliVredenburg'),
  show('podiuminfo-454067','Whitechapel','2027-02-14','TivoliVredenburg'),
  show('podiuminfo-481301','The Bootleg Beatles','2027-02-10','TivoliVredenburg')
 ];
 for(const item of items){
  const image=resolveConcertImage(item,cache);
  assert.equal(image.kind,'artist-photo',item.artist);
  assert.ok(image.url.startsWith('https://'),item.artist);
  assert.match(image.credit.text,/Photo:/);
  assert.match(image.credit.url,/^https:\/\/commons\.wikimedia\.org\//);
  const poster=resolveConcertImage({...item,image:'https://venue.example.com/event.jpg'},cache);
  assert.equal(poster.kind,'event-poster');
 }
});

test('Whitechapel identity photo cannot leak onto other same-name bands or dates',()=>{
 const {cache}=applyArtistImageOverrides(empty,config);
 const correct=show('podiuminfo-454067','Whitechapel','2027-02-14','TivoliVredenburg');
 for(const wrong of [
  {...correct,id:'podiuminfo-100000'},
  {...correct,date:'2027-02-15'},
  {...correct,venue:"dB's"},
  {...correct,country:'BE'}
 ])assert.equal(resolveConcertImage(wrong,cache).url,'');
 assert.equal(resolveConcertImage(show('else','The Beatles','2027-02-10','TivoliVredenburg'),cache).url,'');
 assert.equal(resolveConcertImage(correct,cache).kind,'artist-photo');
});

test('invalid-scoped manual pin is never applied to every show',()=>{
 const pin={artist:'Whitechapel',image:config.pin.find(p=>p.artist==='Whitechapel').image,
  scopes:[{id:'podiuminfo-454067',date:'bad',country:'NL',venue:'TivoliVredenburg'}]};
 const result=applyArtistImageOverrides(empty,{pin:[pin]});
 assert.equal(result.pinned,0);
 assert.equal(result.cache.artists.whitechapel,undefined);
});
