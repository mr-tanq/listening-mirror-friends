import {safeUrl,norm} from './model.js?v=swipe-friends-v3';

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
export function openConcertDetail(event={},reason=''){
  const dialog=el('dialog','deciding-details');
  const inner=el('section','deciding-details-inner');
  const top=el('div','deciding-details-head');
  top.append(el('p','onboarding-kicker','LIVE SHOW DETAILS'),
    actionButton('×','deciding-close',()=>dialog.close()));
  inner.append(top,el('h2','deciding-detail-name',event.artist||'Concert'));
  const poster=safeUrl(event.image);
  if(poster){const img=el('img','deciding-detail-image');img.src=poster;img.alt='Event artwork';img.loading='lazy';inner.append(img);}
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
  if(event.source==='podiuminfo-agenda')inner.append(el('p','onboarding-hint',
    'This is a day-agenda preview; please confirm the date, venue and lineup on the original event page.'));
  const buttons=el('div','deciding-detail-actions');
  const source=safeUrl(event.url);
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
  const url=safeUrl(event.image);
  if(url){
    const img=el('img','deck-poster');img.src=url;img.alt=event.artist+' concert poster';
    img.loading='eager';img.addEventListener('error',()=>{img.remove();image.classList.add('no-image');},{once:true});
    image.append(img);
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
