import test from 'node:test';
import assert from 'node:assert/strict';
import {imageFromVenueHtml,enrichVenuePosters} from '../scripts/venue-posters.mjs';
const page='https://gagarin205.gr/event/example/';
test('reads an official og:image poster',()=>{
 const html='<html><head><meta property="og:image" content="https://gagarin205.gr/wp-content/uploads/2026/10/show.webp"></head></html>';
 assert.equal(imageFromVenueHtml(html,page),'https://gagarin205.gr/wp-content/uploads/2026/10/show.webp');
});
test('rejects remote, nonsecure or decorative imagery',()=>{
 for(const u of ['https://other.example/show.jpg','http://gagarin205.gr/show.jpg','https://gagarin205.gr/logo.png']){
 const h='<meta property="og:image" content="'+u+'">';
 assert.equal(imageFromVenueHtml(h,page),'');
 }
});
test('bounded fetch skips existing posters and uses a vetted official event page',async()=>{
 let requests=0;
 const e=[{id:'1',url:page,image:'',source:'gagarin-calendar'},{id:'2',url:page,image:'https://gagarin205.gr/existing.jpg',source:'gagarin-calendar'}];
 const fetcher=async()=>{requests++;return {ok:true,headers:{get:()=> 'text/html'},text:async()=>'<meta property="og:image" content="https://gagarin205.gr/poster.jpg">'};};
 const r=await enrichVenuePosters(e,{fetcher,max:2,delay:async()=>{}});
 assert.equal(requests,1);assert.equal(r.found,1);assert.equal(r.events[0].image,'https://gagarin205.gr/poster.jpg');
 assert.equal(r.events[1].image,e[1].image);
});
