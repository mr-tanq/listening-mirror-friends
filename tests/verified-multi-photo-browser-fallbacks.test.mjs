import test from 'node:test';
import assert from 'node:assert/strict';
import {
 artistImageOptionsFor,artistImageFor,resolveConcertImage,resolveConcertImageBackup,
 resolveConcertImageBackups
} from '../js/artist-images.js';
import {concertImageFallbacks} from '../js/image-fallback-chain.js';
import {normalizeEvent} from '../js/model.js';
import {buildDisplayImageAudit} from '../scripts/display-image-audit.mjs';

const urls=[
 'https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg',
 'https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750848e/1000x1000-000000-80-0-0.jpg',
 'https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750849e/1000x1000-000000-80-0-0.jpg'
];
const poster='https://example.org/reviewed-event-poster.jpg';
const e=(title='Any Kind / LOMA / Shearwater',overrides={})=>({
 id:'multi-act-gig',artist:title,artists:[title],country:'NL',date:'2026-11-16',
 venue:'TivoliVredenburg',image:'',source:'podiuminfo-agenda',...overrides
});
const portrait=(url,id)=>({
 image:url,source:'deezer',sourceUrl:'https://www.deezer.com/artist/'+id,
 credit:{text:'Photo via Deezer',url:'https://www.deezer.com/artist/'+id}
});
const cache=()=>({artists:{
 'any kind':portrait(urls[0],11),'loma':portrait(urls[1],12),
 'shearwater':portrait(urls[2],13)
}});
test('one multi-act show offers multiple independently verified photos in stable performer order',()=>{
 const event=e();
 const options=artistImageOptionsFor(event,cache());
 assert.deepEqual(options.map(x=>x.url),urls);
 assert.deepEqual(options.map(x=>x.name),['Any Kind','LOMA','Shearwater']);
 assert.equal(artistImageFor(event,cache()).url,urls[0]);
 const first=resolveConcertImage(event,cache());
 assert.equal(first.url,urls[0]);
 assert.match(first.credit.text,/Any Kind \(billed act\)/);
 const alternatives=resolveConcertImageBackups({...event,image:first.url},cache());
 assert.deepEqual(alternatives.map(x=>x.url),urls.slice(1));
 assert.match(alternatives[0].credit.text,/LOMA \(billed act\)/);
 assert.match(alternatives[1].credit.text,/Shearwater \(billed act\)/);
 assert.equal(alternatives[0].credit.url,'https://www.deezer.com/artist/12');
});
test('real event poster takes precedence and all other photos can be tried in turn',()=>{
 const event=e(undefined,{image:poster});
 assert.equal(resolveConcertImage(event,cache()).url,poster);
 const alternatives=resolveConcertImageBackups(event,cache());
 assert.deepEqual(alternatives.map(x=>x.url),urls);
 const firstLegacy=resolveConcertImageBackup(event,cache());
 assert.equal(firstLegacy.url,alternatives[0].url);
});
test('browser sequence preserves per-photo credits and skips duplicates and unsafe alternatives',()=>{
 const event={image:poster,imageFallback:urls[0],imageFallbackKind:'artist-photo',
  imageFallbackCredit:{text:'First',url:'https://www.deezer.com/artist/11'},
  imageAlternates:[
   {url:urls[0],kind:'artist-photo',credit:{text:'Duplicate'}},
   {url:'https://evil.example.com/a.jpg',kind:'event-poster',credit:{text:'Unverified event poster'}},
   {url:'javascript:alert(1)',kind:'artist-photo'},
   {url:urls[1],kind:'artist-photo',credit:{text:'Second',url:'http://unsafe.example.com'}},
   {url:urls[2],kind:'artist-photo',credit:{text:'Third',url:'https://www.deezer.com/artist/13'}}
  ]
 };
 const backups=concertImageFallbacks(event,poster);
 assert.deepEqual(backups.map(x=>x.url),urls);
 assert.deepEqual(backups.map(x=>x.credit?.text),['First','Second','Third']);
 assert.equal(backups[1].credit.url,'');
 assert.equal(concertImageFallbacks(event,urls[0]).length,2);
 assert.deepEqual(concertImageFallbacks({},poster),[]);
});
test('the saved-event normalizer retains a bounded, HTTPS-only alternative photo chain',()=>{
 const original={...e(),image:poster,imageAlternates:[
  ...urls.map(url=>({url,kind:'artist-photo',credit:{text:'Photo via Deezer',url:'https://www.deezer.com'}})),
  {url:'https://evil.example.com/f.jpg',kind:'artist-photo'}
 ]};
 const item=normalizeEvent(original);
 assert.equal(item.imageAlternates.length,3);
 assert.deepEqual(item.imageAlternates.map(x=>x.url),urls);
 assert.equal(item.imageAlternates[0].credit.text,'Photo via Deezer');
 assert.deepEqual(normalizeEvent({...e(),imageAlternates:[{url:'javascript:alert(1)',kind:'artist-photo'}]}).imageAlternates,[]);
});
test('never resurrect blocked, unrelated or out-of-scope musician pictures as backups',()=>{
 const event=e();
 const a=cache();
 a.artists.loma.scopes=[{id:'another-event',date:event.date,country:event.country,venue:event.venue}];
 a.artists.shearwater.image='https://evil.example.net/anything.jpg';
 assert.deepEqual(artistImageOptionsFor(event,a).map(x=>x.url),[urls[0]]);
 assert.deepEqual(resolveConcertImageBackups({...event,image:urls[0]},a),[]);
 assert.equal(artistImageOptionsFor(e('AC/DC'),a).length,0);
 assert.equal(artistImageOptionsFor(e('The Who Tribute / Cover Night'),a).length,0);
});
test('two named artists with the same photo URL are tried only once',()=>{
 const a=cache();
 a.artists.loma.image=urls[0];
 assert.deepEqual(artistImageOptionsFor(e(),a).map(x=>x.url),[urls[0],urls[2]]);
 const options=resolveConcertImageBackups({...e(),image:urls[0]},a);
 assert.deepEqual(options.map(x=>x.url),[urls[2]]);
});
test('existing single URL coverage audit remains stable; live load retries are separately measured',()=>{
 const event=e();
 const report=buildDisplayImageAudit({events:[event]},{artists:cache().artists},
  {records:[]},{today:'2026-11-08'});
 assert.equal(report.totals.artistPhoto,1);
 assert.equal(report.totals.noImage,0);
 const withPoster=buildDisplayImageAudit({events:[{...event,image:poster}]},{artists:cache().artists},
  {records:[]},{today:'2026-11-08'});
 assert.equal(withPoster.totals.posterWithPhotoBackup,1);
});
