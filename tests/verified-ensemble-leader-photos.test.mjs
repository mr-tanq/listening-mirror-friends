import test from 'node:test';
import assert from 'node:assert/strict';
import {
 artistKey,explicitlyNamedEnsembleLeader,headlinerSearchNames,headlinerNames,
 resolveConcertImage,resolveConcertImageBackup
} from '../js/artist-images.js';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';
import {buildDisplayImageAudit} from '../scripts/display-image-audit.mjs';

const image='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const image2='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750848e/1000x1000-000000-80-0-0.jpg';
const poster='https://example.org/event-poster-approved.jpg';
const event=(name,overrides={})=>({id:'ensemble-1',artist:name,artists:[name],
 country:'NL',date:'2026-11-13',venue:'TivoliVredenburg',image:'',source:'podiuminfo-agenda',...overrides});
const portrait=(url=image)=>({image:url,source:'deezer',
 sourceUrl:'https://www.deezer.com/artist/123',
 credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/123'}});
test('strict, reusable ensemble-title grammar recognizes an explicitly named musician',()=>{
 for(const [title,soloist] of [
  ['Emmet Cohen Quintet','Emmet Cohen'],
  ['Hania Derej Trio','Hania Derej'],
  ['Oscar Peterson Trio','Oscar Peterson'],
  ['María João Sextet','María João'],
  ['Jean-Luc Ponty Quartet','Jean-Luc Ponty'],
  ['Lars van Dijk Septet','Lars van Dijk'],
  ['Ravi Shankar Octet','Ravi Shankar']
 ]){
  assert.equal(explicitlyNamedEnsembleLeader(event(title)),soloist,title);
  assert.deepEqual(headlinerSearchNames(event(title)),[title,soloist]);
  assert.equal(headlinerNames(event(title))[0],title);
 }
});
test('never infer an ensemble soloist from generic labels, known band grammar or unrelated structured metadata',()=>{
 for(const title of [
  'Trio Joubran','Jazz Trio','New Jazz Quartet','The Blue Trio','The Necks Trio',
  'Modern String Quartet','Blue Note Quintet','Fusion Octet','GoGo quartet',
  'The Roots','Earth, Wind & Fire','Hania Derej Trio Tribute','Hania Derej Trio Tour',
  'Emmet Cohen Quintet / Another Band','Emmet Cohen Trio presents Someone'
 ]){
  assert.equal(explicitlyNamedEnsembleLeader(event(title)),'',title);
 }
 const conflict=event('Hania Derej Trio',{artists:['Another Performer']});
 assert.equal(explicitlyNamedEnsembleLeader(conflict),'');
 assert.deepEqual(headlinerSearchNames(conflict),['Another Performer']);
});
test('whole ensemble photo outranks leader; a verified leader photo has transparent attribution',()=>{
 const e=event('Emmet Cohen Quintet');
 const leader={artists:{'emmet cohen':portrait()}};
 const a=resolveConcertImage(e,leader);
 assert.equal(a.url,image);
 assert.equal(a.kind,'artist-photo');
 assert.match(a.credit.text,/Photo of Emmet Cohen \(ensemble leader\)/);
 assert.match(a.credit.text,/Photo via Deezer/);
 assert.equal(a.credit.url,'https://www.deezer.com/artist/123');
 const full={artists:{'emmet cohen quintet':portrait(image2),'emmet cohen':portrait(image)}};
 const b=resolveConcertImage(e,full);
 assert.equal(b.url,image2);
 assert.equal(b.credit.text,'Photo via Deezer');
 assert.doesNotMatch(b.credit.text,/ensemble leader/);
});
test('poster always wins; leader photo is a credited backup on poster failure',()=>{
 const e=event('Hania Derej Trio',{image:poster});
 const cache={artists:{'hania derej':portrait()}};
 assert.equal(resolveConcertImage(e,cache).url,poster);
 const backup=resolveConcertImageBackup(e,cache);
 assert.equal(backup.kind,'artist-photo');
 assert.equal(backup.url,image);
 assert.match(backup.credit.text,/Hania Derej \(ensemble leader\)/);
});
test('all providers discover the exact ensemble and its soloist without per-concert overrides',()=>{
 const e=event('Hania Derej Trio');
 const list=selectArtistCandidates([e],{artists:{}},{today:'2026-11-08'});
 assert.deepEqual(list.map(x=>x.key),['hania derej trio','hania derej']);
 assert.deepEqual(selectArtistCandidates([e],{artists:{'hania derej':portrait()}},{today:'2026-11-08'}).map(x=>x.key),['hania derej trio']);
});
test('offline image audit counts the same credited photo and never treats an unrelated soloist as a match',()=>{
 const covered=event('Hania Derej Trio');
 const blank=event('Emmet Cohen Quintet',{id:'ensemble-2'});
 const cache={artists:{'hania derej':portrait(),'other musician':portrait()}};
 const audit=buildDisplayImageAudit({events:[covered,blank],updatedAt:'2026-11-08T21:00:00Z'},
  cache,{records:[]},{today:'2026-11-08'});
 assert.equal(audit.totals.artistPhoto,1);
 assert.equal(audit.totals.noImage,1);
 assert.equal(audit.totals.eventPoster,0);
 assert.equal(resolveConcertImage(blank,cache).url,'');
});
