import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recommendEvent,normalizeEvent,cityKey} from '../js/model.js';
import {mergeTasteTags,seedDeciding} from '../js/taste-engine.js';
import {parseGagarinCalendar} from '../scripts/fetch-events.mjs';

const curated=JSON.parse(readFileSync(new URL('../data/curated-genres.json',import.meta.url),'utf8'));
const confirmed=JSON.parse(readFileSync(new URL('../data/verified-events.json',import.meta.url),'utf8'));
const tags=mergeTasteTags(curated);

test('official Moonspell dates cover Athens, Thessaloniki and Haarlem',()=>{
  for(const [date,city,country] of [['2027-03-30','Thessaloniki','GR'],['2027-03-31','Athens','GR'],['2027-04-18','Haarlem','NL']]){
    const found=confirmed.events.find(e=>e.artist==='Moonspell'&&e.date===date&&e.city===city&&e.country===country);
    assert.ok(found,city+' is missing');
    assert.equal(found.source,'official');
    assert.match(found.url,/^https:\/\/www\.moonspell\.com\/tours\//);
  }
});

test('Igorrr and Moonspell are visible to genre-based recommendation even without feed tags',()=>{
  const profile={country:'GR',city:'Athens',genres:['Metal'],subgenres:[],artists:[]};
  for(const artist of ['Igorrr','Moonspell']){
    const event=normalizeEvent({id:artist,artist,artists:[artist],date:'2027-03-20',venue:'Gagarin 205',city:'Athens',country:'GR',genre:''});
    const recommendation=recommendEvent(event,profile,tags);
    assert.equal(recommendation?.kind,'genre',artist+' should match metal');
  }
});

test('Athens-only Deciding does not include Moonspell Thessaloniki',()=>{
  const profile={country:'GR',city:'Athens',genres:['Metal'],subgenres:[],artists:[]};
  const moon=confirmed.events.filter(e=>e.artist==='Moonspell'&&e.country==='GR');
  assert.deepEqual(seedDeciding(moon,profile,tags,{},10,'2026-11-04','local').map(x=>x.event.city),['Athens']);
  assert.deepEqual(seedDeciding(moon,profile,tags,{},10,'2026-11-04','away').map(x=>x.event.city),['Thessaloniki']);
  assert.equal(cityKey('Νέα Σμύρνη'),'athens');
});

test('official venue iCalendar parser includes dated concerts but excludes comedy and external links',()=>{
  const ics=[
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Europe/Athens:20270320T200000',
    'SUMMARY:IGORRR',
    'URL:https://gagarin205.gr/event/igorrr/',
    'CATEGORIES:Featured',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20270321',
    'SUMMARY:Stand-up Comedy Night',
    'URL:https://gagarin205.gr/event/standup/',
    'CATEGORIES:Comedy',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20270322',
    'SUMMARY:Unknown artist',
    'URL:https://example.com/other/',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const entries=parseGagarinCalendar(ics,{today:'2026-11-04',endDate:'2027-04-23'});
  assert.equal(entries.length,1);
  assert.equal(entries[0].artist,'IGORRR');
  assert.equal(entries[0].date,'2027-03-20');
  assert.equal(entries[0].verification,'venue-calendar');
});
