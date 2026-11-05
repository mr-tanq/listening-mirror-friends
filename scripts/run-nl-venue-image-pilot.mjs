/**
 * Manual research only:
 * node scripts/run-nl-venue-image-pilot.mjs
 * Does not publish or rehost any images; outputs an audit for human review.
 */
import {readFile} from 'node:fs/promises';
import {inspectNlVenueImages} from './nl-venue-image-pilot.mjs';
const feed=JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const report=await inspectNlVenueImages(feed.events||[],{maxEventPages:12});
console.log(JSON.stringify({generatedAt:new Date().toISOString(),...report},null,2));
