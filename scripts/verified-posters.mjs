/**
 * Event-specific, manually reviewed tour/concert posters.
 * IDs are explicit: avoid assigning artwork to similarly named concerts.
 */
const imageHostAllowed=url=>{
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&
 ['images.rocking.gr','www.moonspell.com','moonspell.com'].includes(u.hostname)&&
 /\.(jpg|jpeg|png|webp)$/i.test(u.pathname);}catch{return false;}
};
const reviewHostAllowed=url=>{
 try{const u=new URL(url);return u.protocol==='https:'&&
 ['rocking.gr','www.rocking.gr','www.moonspell.com','moonspell.com'].includes(u.hostname);}catch{return false;}
};
export function applyVerifiedPosters(events,config){
 if(!Array.isArray(events))return {events:[],applied:0,invalid:0};
 const byId=new Map();let invalid=0;
 for(const rule of config?.records||[]){
   if(!Array.isArray(rule?.ids)||!imageHostAllowed(rule.image)||!reviewHostAllowed(rule.sourceUrl)){invalid++;continue;}
   for(const id of rule.ids){if(typeof id==='string'&&id.length<200)byId.set(id,rule.image);else invalid++;}
 }
 let applied=0;
 return {events:events.map(e=>{
   const poster=byId.get(e.id);
   if(!poster||e.image===poster)return e;
   applied++;
   return {...e,image:poster};
 }),applied,invalid};
}
