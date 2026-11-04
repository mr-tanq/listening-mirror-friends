import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFuzzCalendar,discoverFuzzCalendar} from '../scripts/fuzzclub-calendar.mjs';
const calendar='BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261114T200000\nSUMMARY:Sólstafir\nLOCATION:Fuzz Club\\, Athens\nURL:https://www.fuzzclub.gr/event/solstafir-2/\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:20261115T200000\nSUMMARY:Stand Up Comedy Night\nCATEGORIES:Comedy\nURL:https://www.fuzzclub.gr/event/comedy/\nEND:VEVENT\nEND:VCALENDAR';
test('reads music-only official Fuzz events',()=>{const x=parseFuzzCalendar(calendar,{today:'2026-11-04',endDate:'2027-01-31'});assert.equal(x.length,1);assert.equal(x[0].artist,'Sólstafir');assert.equal(x[0].source,'fuzzclub-calendar');});
test('rejects off-domain and HTTP event links',()=>{const fake=calendar.replace('https://www.fuzzclub.gr/event/solstafir-2/','https://unknown.test/event/wrong');assert.deepEqual(parseFuzzCalendar(fake,{today:'2026-11-04',endDate:'2027-01-31'}),[]);});
test('fetches an official iCalendar payload when supplied',async()=>{const r=await discoverFuzzCalendar({today:'2026-11-04',endDate:'2027-01-31',fetcher:async()=>({ok:true,text:async()=>calendar})});assert.equal(r.length,1);});
