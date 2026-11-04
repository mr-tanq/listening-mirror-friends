import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnClubIndex,discoverAnClub} from '../scripts/anclub-index.mjs';
const html='<html><a href="/events/kwoon"><span>11 Nov-2026</span><strong>KWOON</strong><span>Open Doors:20:30</span><img src="https://cdn.prod.website-files.com/example.webp"></a><a href="/events/recordfair"><span>20 Dec-2026</span><span>ΤΟ ΧΡΙΣΤΟΥΓΕΝΝΙΑΤΙΚΟ ΠΑΖΑΡΙ ΔΙΣΚΩΝ ΤΟΥ ΑΝ</span></a><a href="https://evil.example/events/fake"><span>13 Nov-2026</span><span>Warning</span></a></html>';
test('parse AN Club event cards but not record fairs or external URLs',()=>{const rows=parseAnClubIndex(html,{today:'2026-11-04',endDate:'2027-01-01'});assert.equal(rows.length,1);assert.equal(rows[0].artist,'KWOON');assert.equal(rows[0].image,'https://cdn.prod.website-files.com/example.webp');});
test('does not infer dates from event links alone',()=>{assert.deepEqual(parseAnClubIndex('<a href="/events/mystery">Mystery concert</a>'),[]);});
test('fetcher returns only the official index parsed events',async()=>{const rows=await discoverAnClub({today:'2026-11-04',endDate:'2027-01-01',fetcher:async()=>({ok:true,text:async()=>html})});assert.equal(rows[0].venue,'AN Club');});
