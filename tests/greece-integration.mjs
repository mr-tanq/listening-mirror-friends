import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parseGreekMusicCatalog,parseRockingAgenda,cleanGreekBilling} from '../scripts/fetch-events.mjs';

const source=path.resolve('.source');
const cheerio=createRequire(path.join(source,'package.json'))('cheerio');
const {moreEvents}=await import(pathToFileURL(path.join(source,'scripts/sources/international-concert-search.mjs')).href);
const item=(title,date,city,country='GR',id='test')=>
  `<article class="play-template" itemscope itemtype="https://schema.org/Event">
    <h3 itemprop="name">${title}</h3>
    <a class="play-template__main" href="/gr-en/tickets/music/${id}/"></a>
    <meta itemprop="startDate" content="${date}T20:00:00+02:00">
    <meta itemprop="endDate" content="${date}T23:00:00+02:00">
    <div itemprop="location">
      <span itemprop="name">FLOYD</span>
      <meta itemprop="addressLocality" content="${city}">
      <meta itemprop="addressCountry" content="${country}">
    </div>
  </article>`;
test('Greek music listing reuses the original checked More.com adapter',()=>{
  const html=item('Paradise Lost','2026-11-11','Athens','GR','paradise-lost')
    +item('Band In NL','2026-11-11','Utrecht','NL','not-greece')
    +item('Past Act','2026-10-01','Athens','GR','past');
  const x=parseGreekMusicCatalog(html,{cheerio,moreEvents,today:'2026-11-03',endDate:'2027-04-01'});
  assert.equal(x.cards,3);
  assert.equal(x.events.length,1);
  assert.equal(x.events[0].artist,'Paradise Lost');
  assert.equal(x.events[0].country,'GR');
  assert.equal(x.events[0].city,'Athens');
  assert.equal(x.events[0].date,'2026-11-11');
  assert.ok(x.events[0].url.startsWith('https://www.more.com/gr-en/tickets/music/'));
});
test('Greek adapter excludes ambiguous multi-day concert listings',()=>{
  const html=item('Valid Rock','2026-11-11','Athens','GR','one')
    +item('Tour','2026-11-12','Athens','GR','two').replace(
      'content="2026-11-12T23:00:00+02:00"','content="2026-11-13T23:00:00+02:00"');
  const found=parseGreekMusicCatalog(html,{cheerio,moreEvents,today:'2026-11-03',endDate:'2027-04-01'});
  assert.equal(found.events.length,1);
});

test('source billed tours normalize names without inventing events',()=>{
  assert.equal(cleanGreekBilling('KREATOR with special guests OVERKILL'),'KREATOR');
  assert.equal(cleanGreekBilling('NILE - UNDERWORLD EUROPE TOUR 2026 @ FUZZ 29/11/2026'),'NILE');
  assert.equal(cleanGreekBilling('Discharge (UK)'),'Discharge');
  assert.equal(cleanGreekBilling('ACID ARAB live in Athens'),'ACID ARAB');
  assert.equal(cleanGreekBilling('PARADISE LOST'),'PARADISE LOST');
  assert.equal(cleanGreekBilling('Riot V - 50th Anniversary Tour - Παρασκευή 6 Νοεμβρίου'),'Riot V');
  assert.equal(cleanGreekBilling('Chelsea Wolfe: THE DARK World Tour'),'Chelsea Wolfe');
});

test('Rocking agenda provides dated Greek music concerts not found in More catalogue',()=>{
  const html='<h2>14 Νοεμβρίου 2026</h2>'+
    '<a href="/agenda/2026/11/14/27497">Sólstafir Αθήνα @ Fuzz Club Από 30 e</a>'+
    '<a href="/agenda/2026/11/23/29777">Kreator, Overkill Αθήνα @ FLOYD Από 55 e</a>'+
    '<a href="/agenda/2026/11/11/20011">Paradise Lost Αθήνα @ FLOYD</a>';
  const rows=parseRockingAgenda(html,{cheerio,today:'2026-11-03',endDate:'2027-03-31',city:'Athens'});
  assert.equal(rows.length,3);
  assert.equal(rows[0].artist,'Sólstafir');
  assert.equal(rows[0].venue,'Fuzz Club');
  assert.equal(rows[0].source,'rocking');
  assert.deepEqual(rows[1].artists,['Kreator','Overkill']);
  assert.equal(rows[0].date,'2026-11-14');
  assert.equal(rows[0].country,'GR');
});
test('Rocking parser refuses unrelated links, wrong city, non-current or invalid dates',()=>{
  const html='<a href="https://attacker.example/agenda/2026/11/14/27497">Sólstafir Αθήνα @ Fuzz Club</a>'+
    '<a href="/agenda/2026/11/14/27497">Sólstafir Θεσσαλονίκη @ Fuzz Club</a>'+
    '<a href="/agenda/2026/10/01/27491">Old Show Αθήνα @ Fuzz Club</a>'+
    '<a href="/agenda/2026/11/41/27497">Invalid Show Αθήνα @ Fuzz Club</a>'+
    '<a href="/agenda/2026/11/23/1234">Sólstafir Αθήνα @ Fuzz Club</a>';
  const rows=parseRockingAgenda(html,{cheerio,today:'2026-11-03',endDate:'2026-12-01',city:'Athens'});
  assert.equal(rows.length,1);
  assert.equal(rows[0].date,'2026-11-23');
});
