import {watchConcertImage,recordRenderedConcert} from './image-load-diagnostics.js?v=rendered-v2';
import {safeUrl,norm} from './model.js?v=photo-recovery-v1';
import {concertImageFallbacks} from './image-fallback-chain.js?v=multi-photo-fallback-v1';

const el=(tag,cls,text)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);
  return n;
};
const actionButton=(text,cls,fn)=>{
  const button=el('button',cls,text);button.type='button';button.addEventListener('click',fn);return button;
};
const readableDate=date=>{
  try{return new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
    .format(new Date(date+'T12:00:00'));}catch{return date||'Date TBA';}
};
export function swipeDecision(dx,threshold=90){
  if(dx>=threshold)return 'going';
  if(dx<=-threshold)return 'passed';
  return null;
}
export function explainConcert(event={},reason=''){
  const entries=[];
  if(event.date)entries.push(['When',readableDate(event.date)+(event.time?' · '+event.time:'')]);
  if(event.venue)entries.push(['Venue',event.venue]);
  if(event.city)entries.push(['City',event.city]);
  if(event.country)entries.push(['Country',event.country]);
  if(event.genre)entries.push(['Music',event.genre]);
  if(reason)entries.push(['Why this show',reason]);
  return entries;
}
// Licensed photos (e.g. Wikimedia Commons CC BY-SA) must show their credit.
function imageCredit(event){
  const credit=event?.imageCredit;
  if(!credit||typeof credit.text!=='string'||!credit.text.trim())return null;
  const url=safeUrl(credit.url);
  const node=url?el('a','deck-credit',credit.text):el('span','deck-credit',credit.text);
  if(url){node.href=url;node.target='_blank';node.rel='noopener noreferrer';}
  node.addEventListener('pointerdown',e=>e.stopPropagation());
  return node;
}
export function openConcertDetail(event={},reason=''){
  const dialog=el('dialog','deciding-details');
  const inner=el('section','deciding-details-inner');
  const top=el('div','deciding-details-head');
  top.append(el('p','onboarding-kicker','LIVE SHOW DETAILS'),
    actionButton('×','deciding-close',()=>dialog.close()));
  inner.append(top,el('h2','deciding-detail-name',event.artist||'Concert'));
  const poster=safeUrl(event.image);
  recordRenderedConcert(event,poster);
  if(poster){
    const img=el('img','deciding-detail-image');img.alt='Event artwork';img.loading='lazy';
    const backups=concertImageFallbacks(event,poster);
    watchConcertImage(img,event,poster,backups.map(x=>x.url));inner.append(img);
    let credit=null,nextBackup=0;
    const setCredit=value=>{
      if(credit)credit.remove();
      credit=imageCredit({imageCredit:value});
      if(credit)img.after(credit);
    };
    img.addEventListener('error',()=>{
      const next=backups[nextBackup++];
      if(next){
        img.alt=event.artist+' verified artist photo';
        setCredit(next.credit);img.src=next.url;return;
      }
      if(credit)credit.remove();
      img.remove();
    });
    setCredit(event.imageCredit);img.src=poster;
  }
  const facts=el('dl','deciding-facts');
  for(const [title,value] of explainConcert(event,reason)){
    const item=el('div','deciding-fact');item.append(el('dt','',title),el('dd','',value));facts.append(item);
  }
  inner.append(facts);
  const lineup=[...new Set((event.artists||[]).filter(x=>typeof x==='string'&&x.trim()&&norm(x)!==norm(event.artist)))].slice(0,15);
  if(lineup.length){
    inner.append(el('h3','deciding-detail-lineup-title','Listed artists / support'),
      el('p','deciding-detail-lineup',lineup.join(' · ')));
  }
  const official=safeUrl(event.officialUrl);
  if(event.source==='podiuminfo-agenda'&&!official)inner.append(el('p','onboarding-hint',
    'This is a day-agenda preview; please confirm the date, venue and lineup on the original event page.'));
  if(official&&event.source!=='venue-official')inner.append(el('p','onboarding-hint','Date, venue and headliner confirmed on the venue\'s official page.'));
  const buttons=el('div','deciding-detail-actions');
  const source=safeUrl(event.url);
  if(official&&official!==source){
    const a=el('a','button primary','Official venue page ↗');
    a.href=official;a.target='_blank';a.rel='noopener noreferrer';buttons.append(a);
  }
  if(source){
    const a=el('a','button primary','View event / tickets ↗');
    a.href=source;a.target='_blank';a.rel='noopener noreferrer';buttons.append(a);
  }
  buttons.append(actionButton('Close','button',()=>dialog.close()));
  inner.append(buttons);dialog.append(inner);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
}
export function mountDecidingDeck(host,entry,{remaining=1,onDecide=()=>{},onLater=()=>{},onDetails=openConcertDetail}={}){
  host.replaceChildren();
  if(!entry?.event)return null;
  const event=entry.event;
  const reason=entry.suggestionReason||entry.reason||'Suggested from your music taste';
  const shell=el('section','deck-shell');
  const intro=el('div','deck-topline');
  intro.append(el('p','onboarding-kicker','YOUR NEXT LIVE DISCOVERY'),
    el('span','deck-count',remaining+' to decide'));
  shell.append(intro);
  const card=el('article','deck-stage');
  card.tabIndex=0;
  card.setAttribute('role','group');
  card.setAttribute('aria-label','Concert decision: '+event.artist+'. Swipe right to mark Going or left to Pass.');
  const image=el('div','deck-image');
  // Always keep the typographic artwork underneath. If a remote poster
  // fails (404, blocked hotlink, etc), the deck still has a designed card.
  const fallback=el('div','deck-typographic-poster');
  fallback.append(el('span','deck-typographic-kicker','LIVE / '+(event.country||'')),
    el('strong','deck-typographic-artist',event.artist||'Live concert'),
    el('span','deck-typographic-venue',event.venue||event.city||'Concert'));
  image.append(fallback);
  const url=safeUrl(event.image);
  recordRenderedConcert(event,url);
  if(url){
    const img=el('img','deck-poster');img.alt=event.artist+' artwork';
    const backups=concertImageFallbacks(event,url);
    img.loading='eager';watchConcertImage(img,event,url,backups.map(x=>x.url));
    image.append(img);
    let credit=null,nextBackup=0;
    const setCredit=value=>{
      if(credit)credit.remove();
      credit=imageCredit({imageCredit:value});
      if(credit)image.append(credit);
    };
    img.addEventListener('error',()=>{
      const next=backups[nextBackup++];
      if(next){
        img.alt=event.artist+' verified artist photo';
        setCredit(next.credit);img.src=next.url;return;
      }
      if(credit)credit.remove();
      img.remove();image.classList.add('no-image');
    });
    setCredit(event.imageCredit);img.src=url;
  }else image.classList.add('no-image');
  image.append(el('span','deck-counter','01 / '+String(remaining).padStart(2,'0')));
  const indicators=el('div','deck-indicators');
  const reject=el('span','deck-verdict deck-reject','PASS');
  const accept=el('span','deck-verdict deck-accept','GOING');
  indicators.append(reject,accept);image.append(indicators);
  card.append(image);
  const content=el('div','deck-copy');
  content.append(el('p','deck-date',readableDate(event.date)));
  content.append(el('h2','deck-artist',event.artist));
  content.append(el('p','deck-location',[event.venue,event.city,event.country].filter(Boolean).join(' · ')));
  if(event.genre)content.append(el('p','deck-music',event.genre));
  content.append(el('p','deck-match',reason));
  if((event.artists||[]).length>1)content.append(el('p','deck-support',
    'Lineup: '+(event.artists||[]).slice(0,4).join(' · ')));
  content.append(el('p','deck-info-tip','Tap Details for lineup, source and event information'));
  card.append(content);
  shell.append(card);
  const footer=el('div','deck-actions');
  let decided=false,startX=0,startY=0,dx=0,pointerId=null,axis=null;
  const preview=x=>{
    card.style.transform='translateX('+x+'px) rotate('+(x/28)+'deg)';
    const strength=Math.min(Math.abs(x)/95,1);
    accept.style.opacity=x>18?String(strength):'0';
    reject.style.opacity=x< -18?String(strength):'0';
  };
  const reset=()=>{
    card.classList.remove('dragging');card.style.transform='';
    accept.style.opacity='0';reject.style.opacity='0';
    startX=0;startY=0;dx=0;axis=null;pointerId=null;
  };
  const finish=status=>{
    if(decided)return;
    if(status==='later'){onLater(event);return;}
    decided=true;card.classList.add(status==='going'?'fly-right':'fly-left');
    const done=()=>onDecide(event,status);
    // Gives the user immediate swipe feedback while still persisting the
    // final action with the host app's synchronous local-storage callback.
    if(typeof window!=='undefined'&&typeof window.setTimeout==='function')window.setTimeout(done,155);
    else done();
  };
  const pointerDown=e=>{
    if(decided)return;
    pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;axis=null;dx=0;
    card.classList.add('dragging');
    if(typeof card.setPointerCapture==='function') {
      try { card.setPointerCapture(e.pointerId); } catch { /* A pointer may already be cancelled */ }
    }
  };
  const pointerMove=e=>{
    if(decided||pointerId!==e.pointerId)return;
    const x=e.clientX-startX,y=e.clientY-startY;
    if(axis===null && (Math.abs(x)>9||Math.abs(y)>9))axis=Math.abs(x)>Math.abs(y)?'x':'y';
    if(axis!=='x')return;
    dx=x;preview(dx);
  };
  const pointerEnd=e=>{
    if(pointerId!==e.pointerId||decided)return;
    const result=axis==='x'?swipeDecision(dx):null;
    if(result){pointerId=null;finish(result);}else reset();
  };
  card.addEventListener('pointerdown',pointerDown);
  card.addEventListener('pointermove',pointerMove);
  card.addEventListener('pointerup',pointerEnd);
  card.addEventListener('pointercancel',reset);
  card.addEventListener('keydown',e=>{
    if(e.key==='ArrowRight'){e.preventDefault();finish('going');}
    else if(e.key==='ArrowLeft'){e.preventDefault();finish('passed');}
  });
  footer.append(actionButton('✕  Pass','deck-btn deck-btn-no',()=>finish('passed')),
    actionButton('Details','deck-btn deck-btn-info',()=>onDetails(event,reason)),
    actionButton('Later','deck-btn deck-btn-later',()=>finish('later')),
    actionButton('♥  Going','deck-btn deck-btn-yes',()=>finish('going')));
  shell.append(footer,el('p','deck-guidance','← Swipe left to Pass · Swipe right to Going →'));
  host.append(shell);
  return {card,reset,finish};
}
