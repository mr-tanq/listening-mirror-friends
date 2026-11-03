import test from 'node:test';
import assert from 'node:assert/strict';
import {norm,safeUrl,rankEvent,matchReason,normalizeEvent,titleGenreHints} from '../js/model.js';
import {fromPodiuminfo,fromFestivalinfo,fromOfficialVenue,chooseArtistBatch,classifyMusicBrainzTags,applyGenreMetadata} from '../scripts/fetch-events.mjs';
const profile={country:'NL',city:'Utrecht',artists:['Sigur Rós'],genres:['Post-Rock']};
const event={id:'1',artist:'Sigur Rós',artists:['Sigur Rós'],date:'2027-01-03',country:'NL',city:'Utrecht',genre:'Rock'};
test('normalizes diacritics',()=>assert.equal(norm('Sigur Rós'),'sigur ros'));
test('blocks dangerous links',()=>{assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('http://example.com'),null);});
test('matches preferred artist despite accents and genre mismatch',()=>{assert.ok(rankEvent(event,profile)>=100);assert.match(matchReason(event,profile),/favorite artist/);});
test('does not treat broad rock as guaranteed post-rock',()=>assert.equal(rankEvent({...event,artist:'Unknown act',artists:[]},profile),0));
test('respects country',()=>assert.equal(rankEvent({...event,country:'GB'},profile),0));
test('matches real genre',()=>assert.ok(rankEvent({...event,artist:'Another',artists:[],genre:'Post-Rock'},profile)>0));
test('rejects incomplete feed entries',()=>assert.equal(normalizeEvent({artist:'Test'}),null));
test('maps verified Podiuminfo results preserving lineup, date, place and source',()=>{
 const e=fromPodiuminfo('123',{lineup:['Sigur Rós','MONO'],date:'2027-01-03',venue:'TivoliVredenburg',city:'Utrecht',url:'https://www.podiuminfo.nl/concert/123/test',image:'https://example.com/cover.jpg'},()=> 'NL');
 assert.equal(e.id,'podiuminfo-123');assert.deepEqual(e.artists,['Sigur Rós','MONO']);assert.equal(e.city,'Utrecht');assert.equal(e.source,'podiuminfo');
});
test('rejects ambiguous/unsupported Podiuminfo locations',()=>{
 const e=fromPodiuminfo('123',{lineup:['Band'],date:'2027-01-03',venue:'Stage',city:'Unknown'},()=>null);
 assert.equal(e,null);
});
test('maps Festivalinfo editions and lineup',()=>{
 const f=fromFestivalinfo({festivalName:'Some Festival',concertId:'456',date:'2027-03-20',endDate:'2027-03-21',venue:'Festival Park',city:'Amsterdam',country:'NL',lineup:['MONO','Amenra'],url:'https://www.festivalinfo.nl/festival/456/x/2027/'});
 assert.equal(f.id,'festivalinfo-456');assert.equal(f.isFestival,true);assert.deepEqual(f.artists,['MONO','Amenra']);
});
test('selects only unverified artists from daily candidates',()=>{
 const entries={'2027-01-03':{candidates:[{concertId:'1',rawTitle:'MONO + Amenra'},{concertId:'2',rawTitle:'Sigur Rós'}]}};
 const details={'1':{cachedAt:new Date().toISOString()}};
 const selected=chooseArtistBatch(entries,details,{today:'2027-01-01',endDate:'2027-03-01',max:20,splitLineup: s=>s.split(' + ')});
 assert.deepEqual(selected,['Sigur Rós']);
});

test('classifies independent artist genre tags, without changing concert sources',()=>{
  assert.deepEqual(classifyMusicBrainzTags([{name:'post-rock',count:20},{name:'ambient',count:4}]),['Post-Rock','Ambient']);
});
test('genre metadata annotates verified concerts and reuses cache',async()=>{
  const records=[{source:'podiuminfo',artist:'MONO',artists:['MONO'],genre:''}];
  const cached={artists:{}};let calls=0;
  const result=await applyGenreMetadata(records,cached,{lookup:async()=>{calls++;return ['Post-Rock'];},clock:()=>Date.parse('2026-11-03T17:00:00Z')});
  assert.equal(records[0].genre,'Post-Rock');assert.equal(result.withGenres,1);assert.equal(calls,1);
  await applyGenreMetadata(records,cached,{lookup:async()=>{calls++;return [];},clock:()=>Date.parse('2026-11-04T17:00:00Z')});
  assert.equal(calls,1);
});

test('official venue checks keep authoritative URL and lineup',()=>{
 const e=fromOfficialVenue({id:'rec-official-abc',artist:'MONO',lineup:['MONO'],date:'2027-04-10',venue:'Melkweg',city:'Amsterdam',country:'NL',sourceUrl:'https://www.melkweg.nl/en/agenda/test'});
 assert.equal(e.source,'official');assert.equal(e.artist,'MONO');assert.match(e.url,/melkweg/);
});

test('Jazz title cue personalizes event listing without inventing genre for unrelated acts',()=>{
  const jazz=normalizeEvent({id:'jazz-1',artist:'Paradox Jazz Orchestra & James Carter',date:'2026-11-29',city:'Utrecht',country:'NL',source:'podiuminfo-agenda'});
  const unrelated=normalizeEvent({id:'other',artist:'Carpenter Brut',date:'2026-11-03',city:'Utrecht',country:'NL',source:'podiuminfo-agenda'});
  const jazzTaste={name:'',country:'NL',city:'Utrecht',artists:[],genres:['Jazz']};
  assert.equal(jazz.genre,'Jazz');
  assert.equal(jazz.genreEvidence,'title-cue');
  assert.ok(rankEvent(jazz,jazzTaste)>0);
  assert.match(matchReason(jazz,jazzTaste),/title suggests Jazz/i);
  assert.equal(rankEvent(unrelated,jazzTaste),0);
});
test('title hints are conservative, not broad location or artist guesses',()=>{
  assert.deepEqual(titleGenreHints('Eindhoven Metal Meeting'),['Metal']);
  assert.deepEqual(titleGenreHints('The Jazz Room'),['Jazz']);
  assert.deepEqual(titleGenreHints('Boeklancering JOB Dutchtuber'),[]);
  assert.deepEqual(titleGenreHints('MONO'),[]);
  assert.deepEqual(titleGenreHints('Carpenter Brut'),[]);
});
