/**
 * Conservative photo fallback from an artist's own Wikimedia Commons category.
 *
 * Never infer a category from a band name or keyword search. The category
 * must be directly connected to a uniquely verified musical Wikidata item
 * via Commons sitelink and/or P373, and it must be named for that artist.
 *
 * Direct files and at most two verified first-level performance subcategories. Every file must mention the full artist name,
 * not just one shared word, and pass independent Commons imageinfo licence,
 * attribution and minimum-size checks. These safeguards deliberately
 * sacrifice coverage rather than display another band's photo.
 */
import {artistKey} from '../js/artist-images.js';
import {selectLicensedDepictsPhoto} from './commons-depicts-photos.mjs';
import {THUMB_WIDTH} from './musicbrainz-identity.mjs';

const NAMELESS=/^(?:the|a|an|de|het|dj|band|music)$/i;
const BAD_CATEGORY=/\b(?:discography|album|albums|songs|recordings|logos?|posters?|festivals?|covers?|members|tribute|fanclubs?)\b/i;
const BAD_FILE=/\b(?:tribute|cover|album|logo|merch|poster|flyer|sleeve|vinyl|ticket|artwork|drawing|painting|fanart)\b/i;
const BAD_DESCRIPTION=/\b(?:album\s+cover|cover\s+art|fan\s*art|poster|flyer|logo|drawing|illustration|painting|tribute\s+(?:band|act|group|to))\b/i;

const directValues=(entity,prop)=>(entity?.claims?.[prop]||[])
 .filter(c=>c?.rank!=='deprecated')
 .map(c=>c?.mainsnak?.datavalue?.value)
 .filter(v=>typeof v==='string');

const validCategory=value=>typeof value==='string'&&value.length>=3&&value.length<=150&&
 !/[#?{}\[\]<>|]/.test(value)&&!value.includes('..')&&
 !value.includes('://')&&!/^\s*(?:file:|https?:|\/)/i.test(value);

export function linkedArtistCategory(entity){
 if(!entity||typeof entity!=='object')return '';
 const artist=entity.labels?.en?.value||entity.labels?.mul?.value||'';
 const key=artistKey(artist);
 if(key.length<4||NAMELESS.test(key))return '';
 const p373=directValues(entity,'P373').map(x=>x.replace(/^Category:/i,'').trim());
 const sitelink=String(entity.sitelinks?.commonswiki?.title||'');
 const cats=[...p373,...(/^Category:/i.test(sitelink)?[sitelink.slice(9)]:[])];
 if(!cats.length||cats.some(c=>!validCategory(c)))return '';
 // Conflicting Wikidata links mean we cannot be sure this is the artist.
 const unique=[...new Set(cats.map(artistKey))];
 if(unique.length!==1)return '';
 const category=cats[0],catKey=artistKey(category);
 if(BAD_CATEGORY.test(category)||!(catKey===key||catKey.startsWith(key+' ')))return '';
 return category;
}

export function commonsArtistCategoryUrl(category){
 if(!validCategory(category))throw new Error('Invalid Commons artist category');
 const search=new URLSearchParams({
  action:'query',format:'json',generator:'categorymembers',
  gcmtitle:'Category:'+category,gcmnamespace:'6',gcmlimit:'40',
  prop:'imageinfo',iiprop:'url|size|mime|extmetadata',
  iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|AttributionRequired|ImageDescription',
  iiurlwidth:String(THUMB_WIDTH)
 });
 return 'https://commons.wikimedia.org/w/api.php?'+search;
}


/**
 * One-level browse of a Wikidata-linked artist's *direct* Commons child
 * categories. This never searches global categories or follows arbitrary
 * category links: a child is eligible only if the exact artist's full name
 * prefixes its title and it denotes performance/photos/time.
 */
export function commonsArtistSubcategoriesUrl(parent){
 if(!validCategory(parent))throw new Error('Invalid Commons parent category');
 const search=new URLSearchParams({
  action:'query',format:'json',generator:'categorymembers',
  gcmtitle:'Category:'+parent,gcmnamespace:'14',gcmlimit:'20',
  prop:'info'
 });
 return 'https://commons.wikimedia.org/w/api.php?'+search;
}
export function verifiedArtistSubcategories(payload,artistName,{maxCategories=2}={}){
 const key=artistKey(artistName);
 if(key.length<4||NAMELESS.test(key)||!payload?.query?.pages)return [];
 const temporal=/^(?:at|in|during|live|concerts?|performances?|shows?|photos?|photographs?|on|[12]\d{3})\b/i;
 const eligible=[];
 for(const page of Object.values(payload.query.pages)){
  if(page?.ns!==14||!/^Category:/i.test(String(page.title||'')))continue;
  const title=page.title.slice(9).replace(/_/g,' ').trim();
  if(!validCategory(title)||BAD_CATEGORY.test(title))continue;
  const folded=artistKey(title);
  if(!folded.startsWith(key+' '))continue;
  const suffix=folded.slice(key.length+1);
  if(!temporal.test(suffix))continue;
  eligible.push(title);
 }
 return [...new Set(eligible)].sort((a,b)=>{
  // Performance categories before generic photo collections; stable order.
  const score=v=>/\b(?:live|concerts?|performances?|at)\b/i.test(v)?1:0;
  return score(b)-score(a)||a.localeCompare(b);
 }).slice(0,Math.max(0,Math.min(3,maxCategories)));
}

/** Only a category explicitly linked to the verified music identity is
 * eligible. For files inside that category, require the COMPLETE performer
 * name either in the file title or in its own file-description metadata.
 * Prefer title matches; never accept a generic file merely for being in a
 * category, and never relax licence/image/cover-art checks.
 */
export function selectLicensedCategoryPhoto(payload,artistName,qid){
 const key=artistKey(artistName);
 const meaningful=key.split(' ').filter(w=>w.length>=3&&!NAMELESS.test(w));
 if(!(meaningful.length>=2||(meaningful.length===1&&meaningful[0].length>=6)))return null;
 // A band called "Northern" must not match "Northern Lanterns". The
 // full artist token sequence must finish the caption/name or be followed
 // by a clear photographic context word, not another unexplained name word.
 const CONTEXT_WORDS=new Set(['live','perform','performs','performing','performance',
  'at','in','on','during','from','with','playing','pictured','photographed',
  'photograph','photo','concert','gig','show','stage','band','group',
  'artist','musician','singer','singing','rehearsing','tour','festival']);
 const tokens=key.split(' ');
 const exactPhrase=value=>{
  const words=artistKey(value).split(' ').filter(Boolean);
  for(let i=0;i+tokens.length<=words.length;i++){
   if(!tokens.every((token,j)=>words[i+j]===token))continue;
   const following=words[i+tokens.length];
   if(!following||CONTEXT_WORDS.has(following))return true;
  }
  return false;
 };
 const titleMatches={},descriptionMatches={};
 for(const [id,page] of Object.entries(payload?.query?.pages||{})){
  if(page?.ns!==6||!/^File:/i.test(String(page.title||'')))continue;
  const file=String(page.title).replace(/^File:/i,'').replace(/_/g,' ');
  if(BAD_FILE.test(file))continue;
  const fileMatch=exactPhrase(file);
  const raw=String(page.imageinfo?.[0]?.extmetadata?.ImageDescription?.value||'').slice(0,900);
  // Commons ImageDescription is HTML; normalize only for matching, never
  // render it or store it in the public photo cache.
  const description=raw.replace(/<[^>]*>/g,' ').replace(/&(?:amp|nbsp);/g,' ')
   .replace(/&#(?:39|x27);/gi,"'").replace(/&quot;/g,'"');
  const descriptionMatch=!BAD_DESCRIPTION.test(description)&&exactPhrase(description);
  if(fileMatch)titleMatches[id]=page;
  else if(descriptionMatch)descriptionMatches[id]=page;
 }
 // Established title matches take precedence over lower-confidence
 // description matches, but unsupported licences can still fall through.
 const named=selectLicensedDepictsPhoto({query:{pages:titleMatches}},qid);
 if(named)return {...named,categoryEvidence:'artist-in-file-title'};
 const described=selectLicensedDepictsPhoto({query:{pages:descriptionMatches}},qid);
 return described?{...described,categoryEvidence:'artist-in-image-description'}:null;
}
