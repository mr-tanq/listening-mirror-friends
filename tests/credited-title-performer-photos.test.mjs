import test from 'node:test';
import assert from 'node:assert/strict';
import {
 artistKey,headlinerNames,headlinerSearchNames,
 resolveConcertImage,resolveConcertImageBackup
} from '../js/artist-images.js';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';
import {buildDisplayImageAudit} from '../scripts/display-image-audit.mjs';

const photo='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const other='https://cdn-images.dzcdn.net/images/artist/6e512c28252fbb8d2b8e7aabe06fa7e9/1000x1000-000000-80-0-0.jpg';
const make=(artist,artists=[artist],extra={})=>({
 id:'gig-'+artist,date:'2026-11-25',country:'NL',source:'podiuminfo-agenda',
 venue:'TivoliVredenburg',artist,artists,image:'',...extra
});
const cache={artists:{
 'jared grant':{image:photo,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/5458447'}},
 'luar na lubre':{image:photo,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/8267'}},
 'john illsley':{image:photo,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/329934'}},
 'aespa':{image:photo,source:'deezer',credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/113547672'}}
}};
const cases=[
 make('Michael Jackson Project ft. Jared Grant - Off The Wall'),
 make('Luar Na Lubre - LUBRE: 40th Anniversary Tour',
  ['Luar Na Lubre - LUBRE: 40th Anniversary Tour','Luar Na Lubre']),
 make('John Illsley (of Dire Straits)'),
 make('aespa - LIVE TOUR – SYNK: Complæxity',
  ['aespa - LIVE TOUR – SYNK: Complæxity','aespa'])
];

test('recover explicitly credited performer photos from four real-world title grammar cases',()=>{
 const expected=[
  ['Michael Jackson Project','Jared Grant'],
  ['Luar Na Lubre'],
  ['John Illsley'],
  ['aespa']
 ];
 for(let i=0;i<cases.length;i++){
  assert.deepEqual(headlinerSearchNames(cases[i]),expected[i],cases[i].artist);
  const found=resolveConcertImage(cases[i],cache);
  assert.equal(found.url,photo,cases[i].artist);
  assert.equal(found.kind,'artist-photo');
 }
});
test('featured musician is honestly labelled and original image source credit is kept',()=>{
 const found=resolveConcertImage(cases[0],cache);
 assert.equal(found.credit.text,'Photo of Jared Grant (billed act) · Photo via Deezer');
 assert.equal(found.credit.url,'https://www.deezer.com/artist/5458447');
 assert.ok(!headlinerSearchNames(cases[0]).includes('Michael Jackson'));
 assert.ok(!headlinerSearchNames(cases[2]).includes('Dire Straits'));
});
test('a verified photo of the actual main group is preferred to a featured musician',()=>{
 const full={artists:{
  ...cache.artists,
  'michael jackson project':{image:other,credit:{text:'Project portrait',url:'https://www.deezer.com/artist/200'}}
 }};
 const found=resolveConcertImage(cases[0],full);
 assert.equal(found.url,other);
 assert.equal(found.credit.text,'Project portrait');
});
test('no guest, cited affiliation, or arbitrary support act is used as a speculative headliner',()=>{
 const john=make('John Illsley (of Dire Straits)');
 assert.equal(resolveConcertImage(john,{artists:{'dire straits':cache.artists['john illsley']}}).url,'');
 const tribute=make('A Tribute to Michael Jackson');
 assert.equal(resolveConcertImage(tribute,{artists:{'michael jackson':cache.artists['john illsley']}}).url,'');
 const support=make('Unknown Opening Band',['Unknown Opening Band','Jared Grant']);
 assert.equal(resolveConcertImage(support,cache).url,'');
 const unsupported=make('Entirely Unrelated Marketing Title',['Entirely Unrelated Marketing Title','aespa']);
 assert.deepEqual(headlinerSearchNames(unsupported),['Entirely Unrelated Marketing Title']);
 assert.equal(resolveConcertImage(unsupported,cache).url,'');
});
test('explicit source artist name must prefix the actual title with an event-title boundary',()=>{
 const title='Luar Na Lubre - LUBRE: 40th Anniversary Tour';
 assert.deepEqual(headlinerSearchNames(make(title,[title,'Luar Na Lubre'])),['Luar Na Lubre']);
 assert.deepEqual(headlinerSearchNames(make(title,[title,'John Illsley'])),['Luar Na Lubre - LUBRE']);
 // Only a provenance-backed source name may override the ambiguous colon.
 assert.equal(headlinerNames(make(title,[title,'Luar Na Lubre']))[0],title);
});
test('image enrichment searches exact credited names, not the attached tour, affiliation, or tribute subject',()=>{
 const candidates=selectArtistCandidates(cases,{artists:{}},{today:'2026-11-08'});
 assert.deepEqual(candidates.map(c=>c.key).sort(),[
  'michael jackson project','jared grant','luar na lubre','john illsley','aespa'
 ].sort());
 assert.ok(candidates.every(x=>!x.key.includes('dire straits')&&!x.key.includes('anniversary tour')));
});
test('official event poster remains primary, with labelled participant as fallback',()=>{
 const e={...cases[0],image:'https://example.org/approved-concert-poster.jpg'};
 assert.equal(resolveConcertImage(e,cache).kind,'event-poster');
 const backup=resolveConcertImageBackup(e,cache);
 assert.equal(backup.url,photo);
 assert.match(backup.credit.text,/Photo of Jared Grant \(billed act\)/);
});
test('audited display coverage matches the browser for all four recoveries',()=>{
 const feed={updatedAt:'2026-11-08T18:00:00Z',events:cases};
 const r=buildDisplayImageAudit(feed,cache,{records:[]},{today:'2026-11-08'});
 assert.equal(r.totals.total,4);
 assert.equal(r.totals.artistPhoto,4);
 assert.equal(r.totals.noImage,0);
});
test('existing exact-name, slash-bill and ampersand-band rules still apply',()=>{
 assert.deepEqual(headlinerSearchNames(make('Simon & Garfunkel')),['Simon & Garfunkel']);
 assert.deepEqual(headlinerSearchNames(make('AC/DC')),['AC/DC']);
 assert.deepEqual(headlinerSearchNames(make('Employed To Serve & CABAL')),
  ['Employed To Serve','CABAL']);
 assert.deepEqual(headlinerSearchNames(make('Any Kind / LOMA / Shearwater')),
  ['Any Kind','LOMA','Shearwater']);
});
