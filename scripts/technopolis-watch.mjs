/**
 * Watch the OFFICIAL Technopolis music-category page without importing
 * non-music events or guessing dates from a seasonal empty calendar.
 *
 * This does not crawl other pages. If the schedule fills up, it emits a
 * review signal; source-specific parsing requires a verified event example.
 */
export function inspectTechnopolisMusicPage(html){
 if(typeof html!=='string'||!html.includes('<'))return {status:'invalid',message:'Not an HTML page'};
 if(/(?:Δεν βρέθηκαν σχετικές εκδηλώσεις|No events found)/i.test(html))
  return {status:'empty',message:'Official music category has no announced events'};
 if(/(?:Events List|Events from category|Εκδηλώσεις)/i.test(html))
  return {status:'review-required',message:'Official page has changed; inspect music event entries before importing'};
 return {status:'unrecognized',message:'Official page structure not recognized'};
}
export async function watchTechnopolisMusic({fetcher=fetch}={}){
 const url='https://athens-technopolis.gr/index.php/en/component/djevents/events?cid=16';
 const response=await fetcher(url,{headers:{Accept:'text/html','User-Agent':'ListeningMirrorFriends/1.0 (https://github.com/mr-tanq/listening-mirror-friends)'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Technopolis music category HTTP '+response.status);
 const html=await response.text();
 if(html.length>2_000_000)throw Error('Technopolis response unexpectedly large');
 return {...inspectTechnopolisMusicPage(html),url};
}
