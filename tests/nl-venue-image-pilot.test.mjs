import test from 'node:test';
import assert from 'node:assert/strict';
import {venueKey,agendaLinks,titleMatch,verifyVenueArtwork} from '../scripts/nl-venue-image-pilot.mjs';

const event={id:'concert-1',artist:'Mogwai',artists:['Mogwai'],venue:'Melkweg',city:'Amsterdam',country:'NL',date:'2026-12-01',image:''};
const page='https://www.melkweg.nl/nl/agenda/mogwai-01-12-2026/';
const html=(name='Mogwai',date='2026-12-01',venue='Melkweg')=>
  '<script type="application/ld+json">'+JSON.stringify({'@type':'MusicEvent',name,startDate:date,location:{name:venue}})+
  '</script><meta property="og:image" content="https://assets.melkweg.nl/mogwai.jpg">';

test('Only supported exact NL venue aliases qualify',()=>{
 assert.equal(venueKey(event),'melkweg');
 assert.equal(venueKey({...event,venue:'Different venue'}),'');
 assert.equal(venueKey({...event,country:'GR'}),'');
});
test('Agenda candidates stay on official domain',()=>{
 const links=agendaLinks('<a href="/nl/agenda/mogwai-01-12-2026/">Mogwai</a><a href="https://evil.test/agenda/mogwai">Mogwai</a>','melkweg');
 assert.equal(links.length,1);
 assert.equal(links[0].url,page);
});
test('Concert title has to include the real headliner, not an unrelated artist',()=>{
 assert.equal(titleMatch(event,'Mogwai'),true);
 assert.equal(titleMatch(event,'Mogwai support: Another Band'),true);
 assert.equal(titleMatch(event,'Muse'),false);
});
test('Verified event date, title and venue are mandatory',()=>{
 assert.equal(verifyVenueArtwork(html(),page,event,'melkweg')?.permission,'review-required');
 assert.equal(verifyVenueArtwork(html('Muse'),page,event,'melkweg'),null);
 assert.equal(verifyVenueArtwork(html('Mogwai','2026-12-02'),page,event,'melkweg'),null);
 assert.equal(verifyVenueArtwork(html('Mogwai','2026-12-01','Paradiso'),page,event,'melkweg'),null);
 assert.equal(verifyVenueArtwork(html(),'https://evil.test/nl/agenda/mogwai/',event,'melkweg'),null);
});
