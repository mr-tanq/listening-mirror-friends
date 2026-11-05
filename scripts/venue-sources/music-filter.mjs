/**
 * Conservative music-only gate for venue-first discovery.
 * These are explicit non-concert cues, not a broad keyword filter: names like
 * "Theater of Hate" (a band) or "Comedy of Errors" (a band) must not be
 * excluded simply because they contain a genre of performance.
 */
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

const EXPLICIT_NON_CONCERT=/\b(?:stand ?up comedy|stand ?up comedian|cabaretvoorstelling|theatervoorstelling|familievoorstelling|kindervoorstelling|theaterstuk|comedyshow|comedy night|pubquiz|rondleiding|lezing|workshop|filmavond|bioscoopvertoning|luistersessies?|concertloze)\b/i;

/** Return a narrow, auditable exclusion reason, or an empty string. */
export function nonConcertReason(item){
 const title=fold(item?.title||item?.artist);
 if(!title)return '';
 if(EXPLICIT_NON_CONCERT.test(title))return 'explicit-non-concert-title';
 // Proven non-concert performer/title combinations in our actual venue feed.
 // A standalone proper name is not evidence of genre; keep this list small.
 if(/^jimmy carr(?:\s|$)/.test(title))return 'stand-up-comedian';
 if(/^ernst bobbie (?:en |de |and )?(?:de )?rest(?:\s|$)/.test(title))
  return 'children-theatre';
 return '';
}
