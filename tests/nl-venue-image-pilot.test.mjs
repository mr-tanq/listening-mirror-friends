import test from 'node:test';
import assert from 'node:assert/strict';
import {venueKey,agendaLinks,titleMatch,verifyVenueArtwork} from '../scripts/nl-venue-image-pilot.mjs';

const event={id:'concert-1',artist:'Mogwai',artists:['Mogwai'],venue:'Paradiso',city:'Amsterdam',country:'NL',date:'2026-12-01',image:''};
const page='https://www.paradiso.nl/programma/mogwai/2900001';
const html=(name='Mogwai',date='2026-12-01T20:00:00+01:00',venue='Paradiso',performer=[name])=>
  '<script type="application/ld+json">'+JSON.stringify({'@type':'Event',name,startDate:date,url:page,location:{name:venue},performer:performer.map(n=>({'@type':'PerformingGroup',name:n}))})+
  '</script><meta property="og:image" content="https://assets.paradiso.nl/images/transforms/event/_1200x630_crop_center-center_none/mogwai.jpg">';

test('Only supported NL venue aliases qualify',()=>{
 assert.equal(venueKey(event),'paradiso');
 assert.equal(venueKey({...event,venue:'Melkweg'}),'melkweg');
 assert.equal(venueKey({...event,venue:'Different venue'}),'');
 assert.equal(venueKey({...event,country:'GR'}),'');
});
test('Agenda candidates stay on the official domain and event URL shape',()=>{
 const links=agendaLinks('<a href="/programma/mogwai/2900001">Mogwai</a><a href="https://evil.test/programma/mogwai/1">x</a><a href="/nieuws/x">n</a>','paradiso');
 assert.deepEqual(links.map(l=>l.url),[page]);
});
test('Concert title has to name the real headliner, short names included',()=>{
 assert.equal(titleMatch(event,'Mogwai'),true);
 assert.equal(titleMatch(event,'Mogwai + Another Band'),true);
 assert.equal(titleMatch(event,'Muse'),false);
 assert.equal(titleMatch({...event,artist:'MONO',artists:['MONO']},'MONO + Jo Quail'),true);
 assert.equal(titleMatch({...event,artist:'MONO',artists:['MONO']},'Mono Inc.'),false);
});
test('Verified event date, headliner, on-site venue and official domain are mandatory',()=>{
 assert.equal(verifyVenueArtwork(html(),page,event,'paradiso')?.permission,'review-required');
 assert.equal(verifyVenueArtwork(html('Muse'),page,event,'paradiso'),null);
 assert.equal(verifyVenueArtwork(html('Mogwai','2026-12-02T20:00:00+01:00'),page,event,'paradiso'),null);
 assert.equal(verifyVenueArtwork(html('Mogwai','2026-12-01T20:00:00+01:00','Tolhuistuin'),page,event,'paradiso'),null);
 assert.equal(verifyVenueArtwork(html(),'https://evil.test/programma/mogwai/1',event,'paradiso'),null);
 // headliner only billed as support
 assert.equal(verifyVenueArtwork(html('Slowdive + Mogwai','2026-12-01T20:00:00+01:00','Paradiso',['Slowdive','Mogwai']),page,event,'paradiso'),null);
});
