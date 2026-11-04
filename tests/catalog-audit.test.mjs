import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSourceAudit} from '../scripts/catalog-audit.mjs';
test('audit source and image coverage separately from city/venue',()=>{
 const data={updatedAt:'2026-11-04T13:00:00Z',events:[
  {source:'gagarin-calendar',date:'2026-11-05',country:'GR',venue:'Gagarin 205',image:'https://example.com/ok.jpg'},
  {source:'more',date:'2026-11-06',country:'GR',venue:'Kyttaro',image:''},
  {source:'floyd-calendar',date:'2026-10-30',country:'GR',venue:'Floyd',image:'https://example.com/old.jpg'},
  {source:'podiuminfo-agenda',date:'2026-11-07',country:'NL',venue:'Tivoli',image:'http://example.com/insecure.jpg'}]};
 const a=buildSourceAudit(data,{today:'2026-11-04'});
 assert.equal(a.totalPublished,3);
 assert.equal(a.imageCoverageByCountry.GR.events,2);
 assert.equal(a.imageCoverageByCountry.GR.withImage,1);
 assert.equal(a.imageCoverageByCountry.NL.withoutImage,1);assert.equal(a.greekPublished,2);
 assert.equal(a.sources['gagarin-calendar'].withImage,1);
 assert.equal(a.sources.more.withoutImage,1);
 assert.equal(a.sources['podiuminfo-agenda'].withoutImage,1);
 assert.equal(a.venueAdapters['floyd-calendar'].published,0);
 assert.ok(a.topGreekVenues.some(x=>x.name==='Kyttaro'));
});
test('empty catalog creates warnings without making up failed scrapers',()=>{
 const a=buildSourceAudit({events:[]},{today:'2026-11-04'});
 assert.equal(a.totalPublished,0);
 assert.ok(a.venueAdapters['anclub-index'].warning.includes('No published events'));
});
