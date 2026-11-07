import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDisplayImageAudit} from '../scripts/display-image-audit.mjs';

const photo='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const show=(id,artist,image='',date='2026-11-12',country='NL')=>({id,artist,artists:[artist],image,date,country,venue:'Test Venue'});
test('counts published posters, verified artist photos, browser backups and missing images',()=>{
 const feed={updatedAt:'2026-11-07T10:00:00Z',events:[
  show('poster','Existing','https://venue.example/poster.jpg'),
  show('photo','MONO'),show('missing','Unknown'),show('backup','MONO','https://venue.example/show.jpg'),
  show('later','Other','','2027-03-01','BE'),show('old','Past','','2026-11-01')
 ]};
 const cache={artists:{mono:{image:photo}}};
 const report=buildDisplayImageAudit(feed,cache,{records:[]},{today:'2026-11-07'});
 assert.deepEqual(report.totals,{total:5,eventPoster:2,artistPhoto:1,noImage:2,posterWithPhotoBackup:1});
 assert.equal(report.byCountry.NL.total,4);
 assert.equal(report.byCountry.BE.noImage,1);
 assert.equal(report.missingNext14Days,1);
 assert.equal(report.missingNext14DaysSamples[0].artist,'Unknown');
 assert.equal(report.missingReasons['not-in-artist-cache'],2);
});
test('identifies attempted lookup backoff and avoids storing unbounded examples',()=>{
 const feed={events:[show('a','No Photo'),show('b','Absent')]};
 const cache={artists:{},attempted:{'no photo':{retryAfter:'2026-12-01',reason:'not-found'}}};
 const report=buildDisplayImageAudit(feed,cache,null,{today:'2026-11-07',sampleLimit:1});
 assert.equal(report.missingReasons['artist-not-found'],1);
 assert.equal(report.totals.noImage,2);
 assert.equal(report.missingNext14Days,2);
 assert.equal(report.missingNext14DaysSamples.length,1);
});
test('rejects non-HTTPS event images in audit and uses verified cache if available',()=>{
 const report=buildDisplayImageAudit({events:[show('a','MONO','http://insecure.example/a.jpg')]},
  {artists:{mono:{image:photo}}},null,{today:'2026-11-07'});
 // Browser model drops unsafe URLs before resolution; raw feed has a URL.
 // An unsafe event URL must not be reported as a successful image.
 assert.equal(report.totals.eventPoster,0);
 assert.equal(report.totals.artistPhoto,1);
});

test('reports distinct reasons for ambiguous artists, rejected covers and provider errors',()=>{
 const events=[show('a','Ambiguous'),show('b','Cover'),show('c','Quota'),show('d','No Art')];
 const attempted={
  ambiguous:{reason:'ambiguous-same-name',retryAfter:'2027-01-04'},
  cover:{reason:'album-cover-as-portrait',retryAfter:'2026-12-05'},
  quota:{reason:'Deezer quota exceeded',retryAfter:'2026-11-09'},
  'no art':{reason:'no-photo',retryAfter:'2026-12-01'}
 };
 const report=buildDisplayImageAudit({events},{artists:{},attempted},null,{today:'2026-11-07'});
 assert.equal(report.missingReasons['ambiguous-artist'],1);
 assert.equal(report.missingReasons['album-cover-rejected'],1);
 assert.equal(report.missingReasons['provider-error-backoff'],1);
 assert.equal(report.missingReasons['artist-has-no-photo'],1);
});
