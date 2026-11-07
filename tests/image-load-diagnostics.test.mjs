import test from 'node:test';
import assert from 'node:assert/strict';
import {watchConcertImage,imageLoadReport,resetImageLoadReport,recordRenderedConcert} from '../js/image-load-diagnostics.js';

class FakeImage{
 constructor(){this.src='';this.currentSrc='';this.listeners={};}
 addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
 dispatch(type){for(const listener of this.listeners[type]||[])listener();}
}
const event={id:'podiuminfo-1',artist:'Radar Machine',date:'2026-11-10',venue:'Tivoli',secret:'PRIVATE'};
const main='https://assets.paradiso.nl/images/photo.jpg';
const backup='https://cdn-images.dzcdn.net/images/artist/abc/1000x1000-000000-80-0-0.jpg';

test('reports actual primary failures and successful backup loads without private fields',()=>{
 resetImageLoadReport();
 const img=new FakeImage();
 watchConcertImage(img,event,main,backup);
 img.src=main;img.dispatch('error');
 img.src=backup;img.dispatch('load');
 const report=imageLoadReport();
 assert.equal(report.loaded,1);
 assert.equal(report.failed,1);
 assert.equal(report.primaryFailed,1);
 assert.equal(report.backupLoaded,1);
 assert.equal(report.backupFailed,0);
 assert.equal(report.byHost['assets.paradiso.nl'].failed,1);
 assert.equal(report.byHost['cdn-images.dzcdn.net'].loaded,1);
 assert.equal(report.samples[0].artist,'Radar Machine');
 assert.doesNotMatch(JSON.stringify(report),/PRIVATE|photo\.jpg/);
});
test('counts failed backup separately and bounds saved errors',()=>{
 resetImageLoadReport();
 for(let i=0;i<45;i++){
  const img=new FakeImage();
  watchConcertImage(img,event,main,backup);
  img.src=backup;img.dispatch('error');
 }
 const report=imageLoadReport();
 assert.equal(report.failed,45);
 assert.equal(report.backupFailed,45);
 assert.equal(report.samples.length,40);
 resetImageLoadReport();
 assert.equal(imageLoadReport().failed,0);
});

test('counts unique catalogue cards without a URL rather than image events',()=>{
 resetImageLoadReport();
 const missing={id:'podiuminfo-777',artist:'Otis Gibbs',date:'2026-11-10',
  venue:'TivoliVredenburg',country:'NL',source:'podiuminfo-agenda'};
 const available={...missing,id:'podiuminfo-778',artist:'Another Artist'};
 recordRenderedConcert(missing,'');
 recordRenderedConcert(missing,''); // rerenders and detail views are one show
 recordRenderedConcert(available,main);
 recordRenderedConcert({...missing,id:'manual-1',source:'manual'},'');
 const report=imageLoadReport();
 assert.deepEqual(report.renderedShows,{total:2,withImageUrl:1,withoutImageUrl:1,limit:2000});
 assert.equal(report.withoutImageUrlSamples.length,1);
 assert.equal(report.withoutImageUrlSamples[0].artist,'Otis Gibbs');
 assert.equal(report.failed,0);
 assert.doesNotMatch(JSON.stringify(report),/photo\\.jpg|PRIVATE/);
});
test('a later verified image updates the same event instead of double counting',()=>{
 resetImageLoadReport();
 const show={id:'podiuminfo-779',artist:'Radar Machine',date:'2026-11-11',
  country:'NL',source:'venue-official'};
 recordRenderedConcert(show,null);
 recordRenderedConcert(show,main);
 const report=imageLoadReport();
 assert.equal(report.renderedShows.total,1);
 assert.equal(report.renderedShows.withImageUrl,1);
 assert.equal(report.renderedShows.withoutImageUrl,0);
});
