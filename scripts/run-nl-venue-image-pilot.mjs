/**
 * Read-only audit of the venue-first pipeline (no files written):
 *   node scripts/run-nl-venue-image-pilot.mjs
 * Equivalent to: node scripts/update-venue-catalog.mjs --audit
 */
import {readFile} from 'node:fs/promises';
import {runVenueStage} from './update-venue-catalog.mjs';
const load=async f=>JSON.parse(await readFile(new URL('../'+f,import.meta.url),'utf8'));
const feed=await load('data/events.json');
const policy=await load('data/nl-venue-sources.json').catch(()=>({venues:{}}));
const cache=await load('data/venue-events.json').catch(()=>({venues:{}}));
const only=process.env.VENUES?process.env.VENUES.split(','):null;
const {report}=await runVenueStage({audit:true,feed,policy,cache,only});
console.log(JSON.stringify(report,null,1));
