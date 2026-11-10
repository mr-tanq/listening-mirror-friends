import test from 'node:test';
import assert from 'node:assert/strict';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';

const photoA='https://cdn-images.dzcdn.net/images/artist/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1000x1000-000000-80-0-0.jpg';
const photoB='https://cdn-images.dzcdn.net/images/artist/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/1000x1000-000000-80-0-0.jpg';
const upcoming=(id,artist,date,image='')=>({id,artist,date,image,country:'NL'});
const missing=upcoming('missing','No Portrait','2026-11-21');
const duo=upcoming('duo','Mogwai / MONO','2026-11-11');
const festival={...upcoming('fest','Festival in NL','2026-11-12'),source:'festivalinfo',isFestival:true,artists:['Mogwai','MONO','Stars of the Lid']};

test('only truly unpictured shows are prioritized above events with other verified photos',()=>{
 const cache={artists:{mogwai:{image:photoA}}};
 const candidates=selectArtistCandidates([duo,missing],cache,{today:'2026-11-10'});
 assert.deepEqual(candidates.map(x=>x.name),['No Portrait','MONO']);
 assert.equal(candidates[0].unpicturedCount,1);
 assert.equal(candidates[1].unpicturedCount,0);
});
test('festival remains eligible for additional known performer backups after the first portrait',()=>{
 const cache={artists:{mogwai:{image:photoA},mono:{image:photoB}}};
 const result=selectArtistCandidates([festival],cache,{today:'2026-11-10'});
 assert.deepEqual(result.map(x=>x.name),['Stars of the Lid']);
 assert.equal(result[0].unpicturedCount,0);
});
test('one-act show already pictured does not waste external API calls',()=>{
 const cache={artists:{mogwai:{image:photoA}}};
 const result=selectArtistCandidates([upcoming('one','Mogwai','2026-11-11')],cache,{today:'2026-11-10'});
 assert.deepEqual(result,[]);
});
test('an incomplete group without a poster stays primary until one verified portrait is available',()=>{
 const cache={artists:{mogwai:{image:photoA}}};
 const another=upcoming('none','MONO / Stars of the Lid','2026-11-17');
 const result=selectArtistCandidates([duo,another],cache,{today:'2026-11-10'});
 assert.deepEqual(result.map(x=>x.name),['MONO','Stars of the Lid']);
 assert.equal(result.find(x=>x.name==='MONO').unpicturedCount,1);
 assert.equal(result.find(x=>x.name==='Stars of the Lid').unpicturedCount,1);
});
