import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverCatalogImages} from '../scripts/event-image-recovery.mjs';
const ev=(artist,venue,date,image='',country='GR')=>({id:artist+'-'+venue,artist,venue,date,image,country});
test('reuses matching same-event image for Bryan Adams',()=>{
 const rows=[ev('Bryan Adams','Ολυμπιακό Κλειστό Γυμναστήριο "Telekom Center Athens"','2026-12-19'),
 ev('Bryan Adams Roll With The Punches','Telekom Center','2026-12-19','https://www.more.com/poster.png')];
 const result=recoverCatalogImages(rows);assert.equal(result.reused,1);assert.equal(result.events[0].image,rows[1].image);
});
test('reuses God Is An Astronaut same-date Gagarin concert artwork',()=>{
 const rows=[ev('God Is An Astronaut','Gagarin 205','2026-12-19'),ev('JAMESON CONNECTS GOD IS AN ASTRONAUT','Gagarin 205 Live Music Space','2026-12-19','https://gagarin205.gr/poster.jpg')];
 assert.equal(recoverCatalogImages(rows).events[0].image,rows[1].image);
});
test('reuses exact artist for adjacent tour date but not a distant unrelated one',()=>{
 const rows=[ev('Igorrr','Gagarin 205','2027-03-20','https://more.com/igorrr.jpg'),ev('Igorrr','Principal','2027-03-21'),ev('Igorrr','Floyd','2027-09-01')];
 const result=recoverCatalogImages(rows);assert.equal(result.events[1].image,rows[0].image);assert.equal(result.events[2].image,'');
});
test('does not swap images for similarly named acts or separate show days',()=>{
 const rows=[ev('Into Battle Festival','Kyttaro','2026-11-27','https://source.test/27.jpg'),ev('Into Battle Festival','Kyttaro','2026-11-28'),
 ev('Praying Mantis','Eightball','2026-11-27')];const out=recoverCatalogImages(rows).events;
 assert.equal(out[1].image,'');assert.equal(out[2].image,'');
});
