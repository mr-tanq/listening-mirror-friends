/**
 * Recover real event artwork from already verified concert entries.
 * Never choose unrelated images just because a band name is similar.
 */
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const venue=s=>{
 const n=fold(s);
 if(/^(gagarin 205|gagarin 205 live music space)$/.test(n))return 'gagarin';
 if(/^(floyd|floyd live music venue)$/.test(n))return 'floyd';
 if(/^(an club|an)$/.test(n))return 'an';
 if(/^(fuzz club|fuzz live music club)$/.test(n))return 'fuzz';
 if(/^(kyttaro|kyttaro live|κυτταρο|κυτταρο live stage|κυτταρο live)$/.test(n))return 'kyttaro';
 if(/^(arch|arch club|arch club live)$/.test(n))return 'arch';
 if(/^(telekom center|ολυμπιακο κλειστο γυμναστηριο telekom center athens)$/.test(n))return 'telekom';
 return n;
};
const imageOK=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const leadMatch=(a,b)=>{
 const x=fold(a),y=fold(b);
 if(!x||!y)return false;
 if(x===y)return true;
 const words=s=>s.split(' ').filter(Boolean);
 const short=x.length<y.length?x:y,long=x.length<y.length?y:x;
 // A named act can appear later inside festival/sponsor billing; require
 // two distinctive tokens or a >= 9-character artist phrase.
 if(short.length<9||words(short).length<2)return false;
 const pos=long.indexOf(short);
 return pos>=0&&(pos===0||long[pos-1]===' ')&&(pos+short.length===long.length||long[pos+short.length]===' ');
};
export function recoverCatalogImages(events){
 const out=events.map(e=>({...e}));let reused=0;
 for(const e of out){
  if(imageOK(e.image))continue;
  const same=out.find(x=>x!==e&&imageOK(x.image)&&x.country===e.country&&x.date===e.date&&venue(x.venue)===venue(e.venue)&&leadMatch(x.artist,e.artist));
  if(same){e.image=same.image;reused++;continue;}
  // Same exact band on an adjacent date within the same verified tour.
  // Never recycle an artist photo/poster across different tours or years.
  // Festival days can have different posters and lineups even for the
  // same title. Reuse a neighbouring-day image only for a named artist.
  const isFestival=/(?:^|\s)(?:festival|fest)(?:\s|$)/i.test(fold(e.artist))||e.isFestival===true;
  const tour=!isFestival&&out.find(x=>x!==e&&!x.isFestival&&imageOK(x.image)&&fold(x.artist)===fold(e.artist)&&
    Math.abs(Date.parse(x.date+'T12:00:00Z')-Date.parse(e.date+'T12:00:00Z'))<=2*86400000);
  if(tour){e.image=tour.image;reused++;}
 }
 return {events:out,reused};
}
