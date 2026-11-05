/**
 * Per-venue discovery adapters for Dutch venues.
 *
 * Technique only; usage policy (may we discover events, may we publish
 * images) lives in data/nl-venue-sources.json and is applied by the pipeline.
 *
 * Every adapter was derived from a read-only probe of the venue's own site
 * (robots.txt, sitemaps, structured data) on 2026-11-05, see
 * docs/venue-first-images.md. Fields:
 *   aliases      catalogue venue names this adapter is responsible for
 *   onSite       official location names that count as this venue (rooms)
 *   listings     where the venue publishes its list of event URLs
 *   eventUrl     which URLs are individual event pages
 *   slugDate     date encoded in the URL, when the venue does that
 *   floatingTime the site labels local times as UTC: use the written date
 *   titleSuffix  venue suffix to strip from og:title
 *   onSite       location names (incl. room names) that are this venue
 *   textDate     'first-with-year': first Dutch date WITH a year in the page
 *                text (sidebars list other shows without years); enrichment
 *                only, because the catalogue date must agree as well
 *   minSpacingMs politeness (robots crawl-delay is honoured on top)
 */
const dmy=m=>`20${m[3]}-${m[2]}-${m[1]}`;
export const NL_VENUE_ADAPTERS=[
 {id:'paradiso',name:'Paradiso',city:'Amsterdam',origin:'https://www.paradiso.nl',
  aliases:['Paradiso','Paradiso Noord','Paradiso Amsterdam'],onSite:/paradiso|^(?:grote|kleine) zaal$|^bovenzaal$/i,
  listings:[{type:'html-links',url:'https://www.paradiso.nl/'},{type:'sitemap',url:'https://www.paradiso.nl/sitemap.xml',children:/\/sitemap\/event_\d+\.xml$/,pick:'first',max:3}],
  eventUrl:/^https:\/\/www\.paradiso\.nl\/programma\/[^/]+\/\d+\/?$/,titleSuffix:/\s*\|\s*Paradiso\s*$/i,maxPages:110},
 {id:'013',name:'013',city:'Tilburg',origin:'https://www.013.nl',
  aliases:['013','Poppodium 013','013 Tilburg'],onSite:/\b013\b/i,
  listings:[{type:'html-links',url:'https://www.013.nl/programma'}],
  eventUrl:/^https:\/\/www\.013\.nl\/programma\/\d+\/[^/?#]+\/?$/,titleSuffix:/\s*[-|]\s*013\s*$/i,maxPages:90},
 {id:'doornroosje',name:'Doornroosje',city:'Nijmegen',origin:'https://www.doornroosje.nl',
  aliases:['Doornroosje'],onSite:/doornroosje/i,floatingTime:true,
  listings:[{type:'html-links',url:'https://www.doornroosje.nl/'}],
  eventUrl:/^https:\/\/www\.doornroosje\.nl\/event\/[^/?#]+\/?$/,titleSuffix:/\s*\/\/\s*Doornroosje.*$/i,maxPages:90},
 {id:'effenaar',name:'Effenaar',city:'Eindhoven',origin:'https://www.effenaar.nl',
  aliases:['Effenaar'],onSite:/effenaar|^(?:grote|kleine) zaal$|^altstadt$|^caf[eé] wilhelmina$/i,
  listings:[{type:'html-links',url:'https://www.effenaar.nl/agenda'}],
  eventUrl:/^https:\/\/www\.effenaar\.nl\/agenda\/(?!archief\/?$)[^/?#]+\/?$/,titleSuffix:/\s*[-|]\s*Effenaar\s*$/i,maxPages:50},
 {id:'patronaat',name:'Patronaat',city:'Haarlem',origin:'https://patronaat.nl',
  aliases:['Patronaat'],onSite:/patronaat/i,
  listings:[{type:'html-links',url:'https://patronaat.nl/programma/'}],
  eventUrl:/^https:\/\/patronaat\.nl\/event\/[^/?#]+-\d{2}-\d{2}-\d{2}\/?$/,
  slugDate:url=>{const m=url.match(/-(\d{2})-(\d{2})-(\d{2})\/?$/);return m?dmy(m):'';},
  titleSuffix:/\s*-\s*Patronaat\s*$/i,maxPages:14},
 {id:'paard',name:'Paard',city:'Den Haag',origin:'https://www.paard.nl',
  aliases:['Paard','Paard Den Haag','Het Paard'],onSite:/paard|^caf[eé]$|^gr8$|^grolsch zaal$|^(?:grote|kleine) zaal$/i,floatingTime:true,
  listings:[{type:'sitemap',url:'https://www.paard.nl/sitemap_index.xml',children:/\/event-sitemap\d*\.xml$/,pick:'last',max:2,recentDays:200}],
  eventUrl:/^https:\/\/www\.paard\.nl\/event\/[^/?#]+\/?$/,titleSuffix:/\s*-\s*PAARD\s*$/i,maxPages:50},
 {id:'bibelot',name:'Bibelot',city:'Dordrecht',origin:'https://bibelot.net',
  aliases:['Bibelot'],onSite:/bibelot/i,textDate:'first-with-year',experimental:true,
  listings:[{type:'html-links',url:'https://bibelot.net/programma/'}],
  eventUrl:/^https:\/\/bibelot\.net\/programma\/[^/?#]+\/?$/,titleSuffix:/\s*-\s*Bibelot\s*$/i,maxPages:30},
 {id:'vera',name:'Vera',city:'Groningen',origin:'https://www.vera-groningen.nl',
  aliases:['Vera','Vera Groningen'],onSite:/\bvera\b/i,timeTagDate:true,experimental:true,
  listings:[{type:'sitemap',url:'https://www.vera-groningen.nl/sitemap_index.xml',children:/\/events-sitemap\d*\.xml$/,pick:'last',max:1,recentDays:200}],
  eventUrl:/^https:\/\/www\.vera-groningen\.nl\/events\/[^/?#]+\/?$/,titleSuffix:/\s*-\s*Vera\s*$/i,maxPages:30},
 {id:'baroeg',name:'Baroeg',city:'Rotterdam',origin:'https://baroeg.nl',
  aliases:['Baroeg'],onSite:/baroeg/i,research:'wp_theatre_event URLs are empty sub-records (no title/date); production pages need a dedicated adapter',listings:[]},
 // Sites that refuse automated access or disallow it in robots.txt: no
 // adapter runs. They stay listed so audits show why they are not covered.
 {id:'tivoli',name:'TivoliVredenburg',city:'Utrecht',origin:'https://www.tivolivredenburg.nl',
  aliases:['TivoliVredenburg','Tivoli Vredenburg','Tivoli'],onSite:/tivoli/i,blockedBySite:'Cloudflare HTTP 403 for agenda and sitemap (robots.txt itself allows crawling)',listings:[]},
 {id:'melkweg',name:'Melkweg',city:'Amsterdam',origin:'https://www.melkweg.nl',
  aliases:['Melkweg'],onSite:/melkweg/i,blockedBySite:'AWS WAF browser challenge (HTTP 202) on every URL, including robots.txt',listings:[]},
 {id:'dbs',name:"dB's",city:'Utrecht',origin:'https://www.dbstudio.nl',
  aliases:["dB's","dBs","dB's Utrecht"],onSite:/\bdb'?s\b/i,blockedBySite:'robots.txt disallows all crawling (Disallow: /)',listings:[]},
 {id:'grenswerk',name:'Grenswerk',city:'Venlo',origin:'https://www.grenswerk.nl',
  aliases:['Grenswerk'],onSite:/grenswerk/i,research:'No event links, sitemap events or structured data found yet',listings:[]}
];
export const adapterById=id=>NL_VENUE_ADAPTERS.find(a=>a.id===id);
