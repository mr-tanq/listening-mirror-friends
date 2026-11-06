/**
 * Conservative photo fallback from an artist's own Wikimedia Commons category.
 *
 * Never infer a category from a band name or keyword search. The category
 * must be directly connected to a uniquely verified musical Wikidata item
 * via Commons sitelink and/or P373, and it must be named for that artist.
 *
 * Direct file members only. Every file must mention the whole artist name,
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
  gcmtitle:'Category:'+category,gcmnamespace:'6',gcmlimit:'20',
  prop:'imageinfo',iiprop:'url|size|mime|extmetadata',
  iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|AttributionRequired',
  iiurlwidth:String(THUMB_WIDTH)
 });
 return 'https://commons.wikimedia.org/w/api.php?'+search;
}

export function selectLicensedCategoryPhoto(payload,artistName,qid){
 const key=artistKey(artistName);
 const meaningful=key.split(' ').filter(w=>w.length>=3&&!NAMELESS.test(w));
 if(!(meaningful.length>=2||(meaningful.length===1&&meaningful[0].length>=6)))return null;
 const filtered=Object.fromEntries(Object.entries(payload?.query?.pages||{})
  .filter(([,page])=>{
   const file=String(page?.title||'').replace(/^File:/i,'').replace(/_/g,' ');
   if(BAD_FILE.test(file))return false;
   const fileKey=artistKey(file);
   // The FULL artist name, not a substring of another band's name.
   return (' '+fileKey+' ').includes(' '+key+' ');
  }));
 if(!Object.keys(filtered).length)return null;
 return selectLicensedDepictsPhoto({query:{pages:filtered}},qid);
}
