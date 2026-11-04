import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedNiches,suggestTasteBands,mergeTasteTags,seedDeciding,TASTE_BANDS,NICHE_BY_GENRE} from '../js/taste-engine.js';
import {recommendEvent} from '../js/model.js';

const profile={name:'Alex',country:'GR',city:'Athens',genres:['Metal','Rock'],subgenres:['Doom Metal'],artists:['Paradise Lost']};
const show=(id,artist,date,city='Athens',country='GR')=>({
  id,artist,artists:[artist],date,city,country,venue:'Test music venue',url:'https://example.com/'+id
});
const list=[
  show('paradise','Paradise Lost','2027-02-09'),
  show('doom','Candlemass','2027-01-12'),
  show('metal','Kreator','2027-01-13'),
  show('indie','Beach House','2027-01-14'),
  show('far','YOB','2027-01-11','Thessaloniki'),
  show('out','Kyuss','2027-01-10','Utrecht','NL')
];

test('onboarding offers more specific styles related to selected main genres',()=>{
  const names=suggestedNiches(['Metal','Rock']).map(x=>x.name);
  assert.ok(names.includes('Doom Metal'));
  assert.ok(names.includes('Thrash Metal'));
  assert.ok(names.includes('Post-Metal'));
  assert.ok(names.includes('Progressive Rock'));
  assert.equal(names.includes('Dancehall'),false);
});
test('artist suggestions reflect selected niche instead of a random alphabetic list',()=>{
  const suggestions=suggestTasteBands(profile,[],100);
  assert.ok(suggestions.find(x=>x.name==='Paradise Lost'));
  assert.ok(suggestions.find(x=>x.name==='Candlemass'));
  assert.ok(suggestions.find(x=>x.name==='Kreator'));
  assert.equal(suggestions.some(x=>x.name==='Yussef Dayes'),false);
  const top=suggestions.slice(0,10).map(x=>x.name);
  assert.ok(top.includes('Paradise Lost'));
});
test('different taste chooses different suggested artists',()=>{
  const jazz=suggestTasteBands({...profile,genres:['Jazz'],subgenres:['Spiritual Jazz'],artists:[]},[],50);
  assert.ok(jazz.find(x=>x.name==='Kamasi Washington'));
  assert.equal(jazz.some(x=>x.name==='Kreator'),false);
});
test('taste metadata adds specialist styles without discarding trusted original genres',()=>{
  const tags=mergeTasteTags({artists:{'paradise lost':{genres:['Metal'],source:'source'}}});
  assert.ok(tags.artists['paradise lost'].genres.includes('Stoner / Doom'));
  assert.ok(tags.artists['paradise lost'].subgenres.includes('Doom Metal'));
  assert.ok(tags.artists['paradise lost'].genres.includes('Metal'));
});
test('selected subgenres increase the relevance of matching concert listings',()=>{
  const tags=mergeTasteTags({artists:{}});
  const doom=recommendEvent(list[1],{...profile,artists:[]},tags);
  const thrash=recommendEvent(list[2],{...profile,artists:[]},tags);
  assert.ok(doom.score>thrash.score);
  assert.ok(doom.reason.includes('Doom Metal'));
});
test('onboarding seeds only real matching upcoming events and never adds random shows',()=>{
  const picks=seedDeciding(list,profile,mergeTasteTags({artists:{}}),{},12,'2027-01-01');
  const ids=picks.map(x=>x.id);
  assert.ok(ids.includes('paradise'));
  assert.ok(ids.includes('doom'));
  assert.ok(ids.includes('metal'));
  assert.equal(ids.includes('indie'),false);
  assert.equal(ids.includes('out'),false);
  assert.ok(picks.every(x=>x.status==='deciding'&&x.suggested===true));
});
test('onboarding never overwrites Going/Passed/previously saved decisions',()=>{
  const saved={
    paradise:{status:'going',event:list[0]},
    doom:{status:'passed',event:list[1]}
  };
  const picks=seedDeciding(list,profile,mergeTasteTags({artists:{}}),saved,12,'2027-01-01');
  assert.ok(picks.every(x=>!['paradise','doom'].includes(x.id)));
});
test('more local events come before distant shows, with at most two distant backups',()=>{
  const tags=mergeTasteTags({artists:{}});
  const picks=seedDeciding(list,profile,tags,{},12,'2027-01-01');
  const local=picks.filter(x=>x.event.city==='Athens');
  const other=picks.filter(x=>x.event.city==='Thessaloniki');
  assert.ok(local.length>=2);assert.ok(other.length<=2);
});
test('seed respects an empty event catalog and an unsupported country',()=>{
  const tags=mergeTasteTags({artists:{}});
  assert.deepEqual(seedDeciding([],profile,tags),[]);
  assert.deepEqual(seedDeciding(list,{...profile,country:'DE'},tags,{},10,'2027-01-01'),[]);
});
test('curated sample library has broad musical coverage for all selectable genres',()=>{
  const expected=['Metal','Post-Rock','Electronic','Jazz','Hip-Hop','Reggae','Folk','Pop','Classical','Ambient'];
  for(const genre of expected)assert.ok(TASTE_BANDS.some(x=>x.genres.includes(genre)),genre+' lacks artist suggestions');
});

test('mainstream styles and metalcore have real suggested artists',()=>{
  for(const genre of ['Metalcore','Deathcore','Hardcore','Pop-Punk','R&B / Soul','Blues','Funk / Disco','Country','Latin','K-Pop','Afrobeats']){
    assert.ok((NICHE_BY_GENRE[genre]||[]).length>=5,genre);
    assert.ok(TASTE_BANDS.some(x=>x.genres.includes(genre)),genre);
  }
  const b=suggestTasteBands({genres:['Metalcore'],subgenres:['Progressive Metalcore'],artists:[],country:'NL'},[],100);
  assert.ok(b.some(x=>x.name==='ERRA'));
  assert.ok(b.some(x=>x.name==='Bring Me the Horizon'));
  assert.equal(b.some(x=>x.name==='Taylor Swift'),false);
});
test('band suggestions include genre-tagged artists on real regional concert listings',()=>{
  const evt=[{id:'local',artist:'New Heavy Artist',artists:['New Heavy Artist'],
    country:'GR',city:'Athens',date:'2099-04-16',genre:'Metalcore'}];
  const tags={artists:{'new heavy artist':{genres:['Metalcore'],subgenres:['Progressive Metalcore']}}};
  const matches=suggestTasteBands({country:'GR',city:'Athens',genres:['Metalcore'],subgenres:[],artists:[]},evt,500,tags);
  assert.ok(matches.some(x=>x.name==='New Heavy Artist'&&x.upcoming?.city==='Athens'));
  assert.equal(matches.some(x=>x.name==='Unknown Artist'),false);
});
test('choosing a favorite helps rank other stylistically similar bands',()=>{
  const a={genres:['Metalcore'],subgenres:[],artists:['ERRA'],country:'GR',city:'Athens'};
  const b=suggestTasteBands(a,[],500);
  const erra=b.find(x=>x.name==='ERRA');
  const northlane=b.find(x=>x.name==='Northlane');
  assert.ok(erra.selected);
  assert.ok(northlane.score>0);
});

test('Similar uses shared specific metalcore styles, not just same city',()=>{
  const tags=mergeTasteTags({artists:{}});
  const user={country:'NL',city:'Utrecht',genres:[],subgenres:[],artists:['ERRA']};
  const northlane={id:'nl-1',artist:'Northlane',artists:['Northlane'],date:'2027-07-17',
    country:'NL',city:'Utrecht',venue:'Concert hall'};
  const unrelated={id:'nl-2',artist:'Taylor Swift',artists:['Taylor Swift'],date:'2027-07-18',
    country:'NL',city:'Utrecht',venue:'Concert hall'};
  const related= recommendEvent(northlane,user,tags);
  assert.equal(related?.kind,'similar');
  assert.match(related?.reason||'',/shared .*Metalcore|shared .*Djent/i);
  assert.equal(recommendEvent(unrelated,user,tags),null);
});


test('Igorrr and Moonspell become genre-matched even when the aggregator lacks genre tags',()=>{
  const tags=mergeTasteTags({artists:{
    igorrr:{genres:['Metal','Experimental','Electronic'],source:'curated'},
    moonspell:{genres:['Metal'],source:'curated'}
  }});
  const user={country:'GR',city:'Athens',genres:['Metal'],subgenres:[],artists:[]};
  const igorrr=show('igorrr-gagarin','IGORRR','2027-03-20');
  const moonspell=show('moonspell-gagarin','Moonspell','2027-03-31');
  assert.equal(recommendEvent(igorrr,user,tags)?.kind,'genre');
  assert.equal(recommendEvent(moonspell,user,tags)?.kind,'genre');
});

test('city-scoped Deciding does not mix Athens with other cities',()=>{
  const tags=mergeTasteTags({artists:{}});
  const athens=seedDeciding(list,profile,tags,{},12,'2027-01-01','local');
  const elsewhere=seedDeciding(list,profile,tags,{},12,'2027-01-01','away');
  assert.ok(athens.length>0);
  assert.ok(athens.every(x=>x.event.city==='Athens'));
  assert.ok(elsewhere.length>0);
  assert.ok(elsewhere.every(x=>x.event.city!=='Athens'&&x.event.country==='GR'));
});
