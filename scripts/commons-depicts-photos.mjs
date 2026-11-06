/**
 * A second, identity-based Commons route for a band photo:
 * only files explicitly tagged as depicting the exact Wikidata musician/band.
 *
 * Wikimedia Commons search supports haswbstatement:P180=QID. This is NOT a
 * title, filename or fuzzy image search. Licensing and attribution are
 * re-checked on each individual returned file via imageinfo.
 *
 * https://commons.wikimedia.org/wiki/Commons:Structured_data/Get_involved/Finding_data
 */
import {commonsPhotoFromImageInfo,THUMB_WIDTH} from './musicbrainz-identity.mjs';
import {verifiedArtistPhoto} from '../js/artist-images.js';

const COMMONS='https://commons.wikimedia.org/w/api.php';
const QID=/^Q[1-9]\d*$/;
const BAD_FILENAME=/\b(?:poster|flyer|banner|album|cover|single|sleeve|vinyl|record|disc|cd|dvd|logo|icon|illustration|drawing|artwork|painting|cartoon|fanart|fan art|ticket|merchandise|screenshot)\b/i;

/** Search strictly against the depicted subject, never an artist-name string. */
export function commonsDepictsUrl(qid){
 if(!QID.test(qid))throw new Error('Invalid Wikidata entity ID');
 const query=new URLSearchParams({
  action:'query',format:'json',generator:'search',
  gsrsearch:'haswbstatement:P180='+qid,
  gsrnamespace:'6',gsrlimit:'10',prop:'imageinfo',
  iiprop:'url|size|mime|extmetadata',
  iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|AttributionRequired',
  iiurlwidth:String(THUMB_WIDTH)
 });
 return COMMONS+'?'+query.toString();
}

/** Deterministically prefer clear photographs, skip posters and artwork. */
export function selectLicensedDepictsPhoto(payload,qid){
 if(!QID.test(qid)||payload?.error)return null;
 const pages=Object.values(payload?.query?.pages||{})
  .filter(page=>page&&page.ns===6&&/^File:/i.test(page.title||''));
 const scored=[];
 for(const page of pages){
  const file=String(page.title).replace(/^File:/i,'').replace(/_/g,' ');
  if(BAD_FILENAME.test(file))continue;
  const ext=file.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if(!['jpg','jpeg','webp','png'].includes(ext))continue;
  const photo=commonsPhotoFromImageInfo({query:{pages:{[page.pageid||'file']:page}}});
  if(!photo||!verifiedArtistPhoto(photo.image)||
    !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(photo.descriptionUrl||''))continue;
  // Filename is only a safety/quality signal; the actual subject
  // verification comes from the exact P180 statement search query.
  const preference=['jpg','jpeg','webp'].includes(ext)?1:0;
  const pixels=Number(page.imageinfo?.[0]?.width||0)*Number(page.imageinfo?.[0]?.height||0);
  scored.push({photo,preference,pixels,file});
 }
 scored.sort((a,b)=>b.preference-a.preference||b.pixels-a.pixels||a.file.localeCompare(b.file));
 return scored[0]?.photo||null;
}
