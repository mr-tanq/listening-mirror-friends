import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveConcertImage,resolveConcertImageBackup} from '../js/artist-images.js';
import {normalizeEvent} from '../js/model.js';
import {selectArtistCandidates} from '../scripts/deezer-artist-images.mjs';

const photo='https://cdn-images.dzcdn.net/images/artist/3780a546a18503f1ca1e67358750847e/1000x1000-000000-80-0-0.jpg';
const poster='https://venue.example/show-poster.jpg';
const credit={text:'Photo: A. Photographer · CC BY-SA 4.0',url:'https://commons.wikimedia.org/wiki/File:Photo.jpg'};
const album={artists:{caro:{image:photo,source:'deezer',credit},'the skints':{image:photo,source:'deezer'}}};
const make=(artist,extra={})=>({artist,artists:[artist],country:'NL',date:'2026-12-01',venue:'Paradiso',city:'Amsterdam',image:'',...extra});

test('a failed event poster can fall back only to the confirmed headliner portrait',()=>{
 const show=make('Caro - Returning to Innocence',{image:poster});
 assert.deepEqual(resolveConcertImage(show,album),{url:poster,kind:'event-poster'});
 assert.deepEqual(resolveConcertImageBackup(show,album),{url:photo,kind:'artist-photo',credit});
 assert.equal(resolveConcertImageBackup(make('Unrelated Band',{image:poster}),album),null);
});

test('backup never overrides an existing artist photo, and never points back to the failed poster',()=>{
 assert.equal(resolveConcertImageBackup(make('Caro',{image:photo,imageKind:'artist-photo'}),album),null);
 assert.equal(resolveConcertImageBackup(make('Caro',{image:photo}),album),null);
 assert.equal(resolveConcertImageBackup(make('Caro'),album),null);
});

test('fallback URL, kind and licence credit survive normalized and saved event records',()=>{
 const source=make('Caro',{image:poster,imageFallback:photo,imageFallbackKind:'artist-photo',imageFallbackCredit:credit});
 const saved=normalizeEvent(normalizeEvent(source));
 assert.equal(saved.image,poster);
 assert.equal(saved.imageFallback,photo);
 assert.equal(saved.imageFallbackKind,'artist-photo');
 assert.deepEqual(saved.imageFallbackCredit,credit);
});

test('Deezer tries clean artist names before explicit event subtitles',()=>{
 const list=selectArtistCandidates([make('Caro - Returning to Innocence')],{artists:{}},{today:'2026-11-05'});
 assert.equal(list[0].key,'caro');
 // An event-title string is not a separate artist: do not spend a lookup on it.
 assert.deepEqual(list.map(x=>x.key),['caro']);
});

test('artist names without subtitles keep their original order and ambiguous names are never guessed',()=>{
 const list=selectArtistCandidates([make('Earth, Wind & Fire'),make('MONO')],{artists:{}},{today:'2026-11-05'});
 assert.deepEqual(list.map(x=>x.key).sort(),['earth wind fire','mono']);
 assert.equal(resolveConcertImageBackup(make('The Who Tribute',{image:poster}),{artists:{'the who':{image:photo}}}),null);
});
