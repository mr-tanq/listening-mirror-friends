import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFloydCalendar,discoverFloydCalendar} from '../scripts/floyd-calendar.mjs';
const event=(name,date,url='https://www.floyd.gr/event/example/',category='Music')=>
 'BEGIN:VEVENT\nDTSTART:'+date+'T200000\nSUMMARY:'+name+'\nCATEGORIES:'+category+'\nLOCATION:FLOYD\\, Pireos 117\\, Athens\nURL:'+url+'\nEND:VEVENT\n';
test('read confirmed Floyd music dates and exclude standup events',()=>{
 const ics='BEGIN:VCALENDAR\n'+event('Chelsea Wolfe','20261219')+event('Dylan Moran','20270319')+event('Paradise Lost','20261111')+'END:VCALENDAR';
 const rows=parseFloydCalendar(ics,{today:'2026-11-04',endDate:'2027-06-01'});
 assert.deepEqual(rows.map(x=>x.artist),['Paradise Lost','Chelsea Wolfe']);
 assert.ok(rows.every(x=>x.city==='Athens'&&x.source==='floyd-calendar'));
});
test('skip untrusted URLs and unrelated venue locations',()=>{
 const ics='BEGIN:VCALENDAR\n'+event('Band A','20261209','https://evil.example/event/test/')+event('Band B','20261210','http://floyd.gr/event/b/')+'END:VCALENDAR';
 assert.deepEqual(parseFloydCalendar(ics,{today:'2026-11-04'}),[]);
});
test('support mocked official calendar, including multi-line folded ICS',async()=>{
 const body='BEGIN:VCALENDAR\n'+event('Mog\n ul','20270110')+'END:VCALENDAR';
 const rows=await discoverFloydCalendar({today:'2026-11-04',endDate:'2027-02-01',fetcher:async()=>({ok:true,text:async()=>body})});
 assert.equal(rows[0].date,'2027-01-10');
 assert.equal(rows[0].artist,'Mogul');
});
