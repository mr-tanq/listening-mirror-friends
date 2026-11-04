import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const registry=JSON.parse(readFileSync(new URL('../data/venue-registry.json',import.meta.url),'utf8'));
test('Greek source inventory has unique stable IDs and reviewable metadata',()=>{
 assert.ok(registry.venues.length>=25);
 const ids=registry.venues.map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const row of registry.venues){
   assert.match(row.id,/^[a-z0-9-]+$/);
   assert.ok(row.name&&row.country==='GR'&&row.city);
   assert.ok(['venue','promoter','editorial'].includes(row.type));
   assert.ok(['active','verified-index','planned','research'].includes(row.status));
   assert.equal(new URL(row.agenda).protocol,'https:');
 }
});
test('a research or verified index listing is never labeled active',()=>{
 const active=registry.venues.filter(x=>x.status==='active').map(x=>x.id).sort();
 assert.deepEqual(active,['gagarin205','rocking']);
});
test('broad Athens and Thessaloniki source coverage is represented',()=>{
 for(const id of ['gagarin205','anclub','fuzzclub','floyd','technopolis','megaron-athens','principal','moni-lazariston','release','rocking','musicity'])
   assert.ok(registry.venues.some(x=>x.id===id),id);
});
