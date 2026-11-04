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

test('AN Club event pages can use their official Webflow poster CDN',()=>{
 const page='https://www.anclub.gr/events/warning-uk-the-temple-gr';
 const poster='https://cdn.prod.website-files.com/images/warning.webp';
 const html='<meta property="og:image" content="'+poster+'">';
 assert.equal(imageFromVenueHtml(html,page),poster);
 assert.equal(imageFromVenueHtml('<meta property="og:image" content="https://evil.example/poster.jpg">',page),'');
});
test('AN Club missing posters are enriched without refetching existing images',async()=>{
 let requests=0;
 const page='https://www.anclub.gr/events/kwoon-for-the-first-time-in-14-years';
 const rows=[{id:'an-test',url:page,image:'',source:'anclub-index'}, {id:'already',url:page,image:'https://cdn.prod.website-files.com/original.jpg',source:'anclub-index'}];
 const fetcher=async()=>{requests++;return {ok:true,headers:{get:()=> 'text/html'},text:async()=>'<meta property="og:image" content="https://cdn.prod.website-files.com/kwoon.jpg">'};};
 const result=await enrichVenuePosters(rows,{fetcher,max:3,delay:async()=>{}});
 assert.equal(requests,1);
 assert.equal(result.events[0].image,'https://cdn.prod.website-files.com/kwoon.jpg');
 assert.equal(result.events[1].image,'https://cdn.prod.website-files.com/original.jpg');
});
