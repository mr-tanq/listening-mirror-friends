import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {parseGreekMusicCatalog} from '../scripts/fetch-events.mjs';

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
