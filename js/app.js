import { recommendEvent, dateToday, norm, cityKey, normalizeEvent, safeUrl, GENRES, COUNTRIES } from './model.js?v=guided-setup-20261104-a';
import {mergeTasteTags,seedDeciding,suggestedNiches} from './taste-engine.js?v=guided-setup-20261104-a';
import {createOnboarding} from './onboarding.js?v=guided-setup-20261104-a';

const STORAGE_KEY = 'lm_friends_v1';
const app = document.querySelector('#app');
const dialogRoot = document.querySelector('#dialog-root');
const importFile = document.querySelector('#import-file');
let state = loadState();
let catalog = { events: [], updatedAt: null, coverage: null, source: 'podiuminfo+festivalinfo', error: '' };
let artistTags = {artists:{}};
let page = 'tonight';
let collection = 'discover';
let searchText = '';
let archiveSearch = '';
let onboarding = null;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed && typeof parsed === 'object') return {
      version: 1,
      profile: parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : null,
      saved: parsed.saved && typeof parsed.saved === 'object' && !Array.isArray(parsed.saved) ? parsed.saved : {},
      archive: Array.isArray(parsed.archive) ? parsed.archive : [],
      pendingDeciding: parsed.pendingDeciding === true
    };
  } catch (err) { console.warn('Could not read saved data', err); }
  return {version:1,profile:null,saved:{},archive:[],pendingDeciding:false};
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { alert('Your device could not save changes. Export a backup from My Taste.'); }
}
function el(tag, cls, content) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (content !== undefined) n.textContent = String(content);
  return n;
}
function button(text, cls, cb) { const b=el('button',cls,text); b.type='button'; b.addEventListener('click',cb); return b; }
function safeLink(url, label, cls='button small ghost') {
  const href = safeUrl(url); if(!href) return null;
  const a=el('a',cls,label); a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function count(label,value) { const n=el('div','kpi');n.append(el('div','kpi-value',value),el('p','kpi-label',label));return n; }
function showDate(date) {
  try{return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(`${date}T12:00:00`));}
  catch{return date;}
}
function formatCountry(code){return COUNTRIES.find(c=>c.code===code)?.name||code||'';}
function displayName(){return state.profile?.name?.trim()||'you';}
function heading(title,description){const frag=document.createDocumentFragment();const hero=el('div','hero');hero.append(el('p','eyebrow','YOUR LIVE MUSIC COMPANION'),el('h1','page-title',title),el('p','page-subtitle',description));frag.append(hero);return frag;}
function empty(title,body,cb,label){const n=el('div','empty');n.append(el('h3','',title),el('p','',body));if(cb)n.append(button(label||'Add a concert','button primary',cb));return n;}
function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(new Date(date+'T12:00:00').getTime());}
function fixSavedItem(x){const event=normalizeEvent(x?.event||x);return event&&validDate(event.date)?{status:['going','deciding','passed'].includes(x?.status)?x.status:'going',event,suggested:x?.suggested===true,suggestionReason:String(x?.suggestionReason||'').slice(0,180)}:null;}
function go(next){page=next;location.hash=next;render();window.scrollTo({top:0,behavior:'smooth'});}

function scoreAll() {
  const current=dateToday();
  return catalog.events.filter(e=>e.date>=current).map(event=>{
    const match=recommendEvent(event,state.profile,artistTags);
    return match?{event,...match}:null;
  }).filter(Boolean).sort((a,b)=>{
    const preferred=cityKey(state.profile?.city||'');
    const nearA=preferred&&cityKey(a.event.city)===preferred?1:0;
    const nearB=preferred&&cityKey(b.event.city)===preferred?1:0;
    return nearB-nearA || a.event.date.localeCompare(b.event.date) ||
      b.score-a.score || a.event.artist.localeCompare(b.event.artist);
  });
}
function discoverFeed(){return scoreAll().filter(x=>!state.saved[x.event.id]);}
function savedItems(status){return Object.values(state.saved).map(fixSavedItem).filter(x=>x&&x.status===status).sort((a,b)=>a.event.date.localeCompare(b.event.date));}
function counts(){return {discover:discoverFeed().length,deciding:savedItems('deciding').length,going:savedItems('going').length};}
function setStatus(e,status){state.saved[e.id]={status,event:normalizeEvent(e)};persist();render();}
function archiveEvent(e){
  const event=normalizeEvent(e);if(!event)return;
  if(!state.archive.some(a=>a.id===event.id||[a.artist,a.date,a.venue].join('|')===[event.artist,event.date,event.venue].join('|'))){state.archive.unshift(event);}
  delete state.saved[event.id];persist();render();
}
function card(raw,scoreInfo=null,mode='discover') {
  const e=normalizeEvent(raw);if(!e)return null;
  const card=el('article','show'+(scoreInfo?.score>=100?' featured':''));
  const pic=safeUrl(e.image);
  if(pic){const img=el('img','show-image');img.src=pic;img.loading='lazy';img.alt=`${e.artist} live event artwork`;img.addEventListener('error',()=>{img.replaceWith(el('div','show-art','♪'));},{once:true});card.append(img);}
  else card.append(el('div','show-art','♪'));
  const body=el('div','show-body');
  body.append(el('div','show-date',showDate(e.date)),el('h3','',e.artist),el('p','show-location',[e.venue,e.city,formatCountry(e.country)].filter(Boolean).join(' · ')));
  if(scoreInfo?.reason)body.append(el('p','show-reason',scoreInfo.reason));
  else if(e.genre)body.append(el('p','show-reason',(e.genreEvidence==='title-cue'?'Event title suggests: ':'')+e.genre));
  if(e.source==='podiuminfo-agenda')body.append(el('p','show-reason','Podiuminfo day listing · Confirm event details on source site'));
  const foot=el('div','show-bottom');
  if(mode==='discover'||mode==='explore'){
    foot.append(button('Going','button small primary',()=>setStatus(e,'going')),button('Deciding','button small',()=>setStatus(e,'deciding')));
    foot.append(button('Pass','button small ghost',()=>setStatus(e,'passed')));
  } else {
    if(mode==='deciding')foot.append(button('Going','button small primary',()=>setStatus(e,'going')));
    if(mode==='going')foot.append(button('Attended ✓','button small primary',()=>archiveEvent(e)));
    if(mode==='deciding')foot.append(button('Attended ✓','button small',()=>archiveEvent(e)));
    foot.append(button('Remove','button small ghost',()=>{delete state.saved[e.id];persist();render();}));
  }
  const link=safeLink(e.url,'Event ↗','button small ghost external'); if(link)foot.append(link);
  body.append(foot);card.append(body);return card;
}
function renderTonightList(){
  const root=document.querySelector('#listing');if(!root)return;
  root.replaceChildren();
  const personal=collection==='discover';
  let list=personal?discoverFeed():savedItems(collection).map(x=>({event:x.event,reason:x.suggested?'Suggested for your taste · '+x.suggestionReason:''}));
  if(searchText.trim())list=list.filter(x=>norm([
    x.event.artist,...(x.event.artists||[]),x.event.venue,x.event.city,x.event.genre,x.reason
  ].join(' ')).includes(norm(searchText)));
  if(!list.length){
    const currentCountry=state.profile?.country||'';
    const countryListings=catalog.events.filter(e=>e.country===currentCountry&&e.date>=dateToday()).length;
    const countryName=COUNTRIES.find(c=>c.code===currentCountry)?.name||'your selected country';
    const supported=['NL','BE','GR'].includes(currentCountry);
    const title=personal?(supported&&!countryListings?'No listings loaded for '+countryName+'.':'No music matches yet.')
      :collection==='going'?'Nothing planned yet.':state.pendingDeciding?'Finding your first concerts…':'Nothing in Deciding.';
    const message=personal?(!supported?
      'Concert discovery is not available in this country yet. Currently the shared catalog supports the Netherlands, Belgium and Greece; your profile is saved safely.'
      :!countryListings?
      ('The '+countryName+' source has not returned any upcoming shows yet. We cannot match genres or similar artists until those events are imported.'+
       (currentCountry==='GR'&&catalog.coverage?.greeceFeedError?' Latest source error: '+catalog.coverage.greeceFeedError:''))
      : 'There are '+countryListings+' concerts listed for '+countryName+', but no reliable matches for your selected genres or bands yet. Artist genre coverage is incomplete; unrelated events are not shown as recommendations.')
      :state.pendingDeciding?'Matching live events to your completed music taste. Your first Deciding selections will appear when the concert feed loads.':'Save a concert from Discover, or add a concert manually.';
    root.append(empty(title,message,()=>personal?openProfileDialog(false):openConcertDialog(),personal?'Edit my music taste':'+ Add concert'));
    return;
  }
  if(personal){
    const buckets=[
      ['favorite','Your favorite artists'],
      ['similar','Similar artists · shared music styles'],
      ['genre','Your selected genres']
    ];
    const preferred=cityKey(state.profile?.city||'');
    for(const [kind,title] of buckets){
      const group=list.filter(x=>x.kind===kind);
      if(!group.length)continue;
      const heading=el('div','section-header');
      heading.append(el('h2','section-title',title),el('p','section-sub',group.length+' matched show'+(group.length===1?'':'s')));
      const groupRoot=el('section','recommend-group');groupRoot.append(heading);
      const local=preferred?group.filter(x=>cityKey(x.event.city)===preferred):group;
      const away=preferred?group.filter(x=>cityKey(x.event.city)!==preferred):[];
      const display=(records,label)=>{
        if(!records.length)return;
        if(preferred)groupRoot.append(el('p','help-note',label+' · '+records.length));
        const grid=el('div','show-grid');
        for(const x of records.slice(0,100)){const n=card(x.event,x,'discover');if(n)grid.append(n);}
        groupRoot.append(grid);
        if(records.length>100)groupRoot.append(el('p','help-note','Showing the first 100 of '+records.length+'.'));
      };
      display(local,preferred?'Near '+(state.profile?.city||'your city'):'Upcoming');
      display(away,'Elsewhere in '+(COUNTRIES.find(c=>c.code===state.profile?.country)?.name||'your country'));
      root.append(groupRoot);
    }
    root.append(el('p','help-note','Matches use your favorite artists and available music tags. “Similar” means shared specific genres, not a verified recommendation from a streaming service. Podiuminfo agenda entries require confirmation on their source page.'));
  } else {
    const grid=el('div','show-grid');
    for(const x of list.slice(0,200)){const n=card(x.event,x.reason?{reason:x.reason}:null,collection);if(n)grid.append(n);}
    root.append(grid);
  }
}
function renderTonight(){
  app.replaceChildren(heading('Tonight.',`Hi ${displayName()}. Find shows worth leaving the house for, then decide what to see.`));
  const taste=state.profile?.genres || [];
  if(taste.length)app.querySelector('.hero').append(el('p','help-note',`Genres: ${taste.join(' · ')}`));
  if(state.profile?.artists?.length)app.querySelector('.hero').append(el('p','help-note',
    `Favorite bands: ${state.profile.artists.slice(0,8).join(' · ')}${state.profile.artists.length>8?' …':''}`));
  const actions=el('div','actions');actions.append(button('+ Add concert','button primary',openConcertDialog),button('Edit my taste','button',()=>openProfileDialog(false)),button('Redo music setup','button ghost',startGuidedSetup));
  const info=el('div','notice');
  const desc=el('span');
  if(catalog.error){info.classList.add('error');desc.textContent=`Concert feed unavailable: ${catalog.error}`;}
  else if(catalog.updatedAt){
    const country=state.profile?.country||'';
    const totalInCountry=catalog.events.filter(e=>e.country===country&&e.date>=dateToday()).length;
    const name=COUNTRIES.find(c=>c.code===country)?.name||country;
    desc.textContent=`Live catalogue · ${name}: ${totalInCountry.toLocaleString()} listed events · ${catalog.events.length.toLocaleString()} total · updated ${new Date(catalog.updatedAt).toLocaleDateString('en-GB')}`;
    if(country==='GR'&&catalog.coverage?.greeceFeedError&&!totalInCountry)
      desc.textContent+=' · Greek source temporarily unavailable';
  }
  else desc.textContent='Public event catalog not updated yet · Manual concerts work now';
  info.append(desc);app.append(info);
  const filter=el('div','filters');const tabs=el('div','segments');const cs=counts();
  for(const [key,title] of [['discover','Discover'],['deciding','Deciding'],['going','Going']]){
    const tab=button('','segment'+(collection===key?' active':''),()=>{collection=key;render();});
    tab.textContent=`${title} · ${cs[key]}`;tab.setAttribute('aria-pressed',String(collection===key));tabs.append(tab);
  }
  const search=el('input','search');search.placeholder='Search artist, city, venue…';search.value=searchText;search.type='search';search.setAttribute('aria-label','Search concerts');search.addEventListener('input',e=>{searchText=e.target.value;renderTonightList();});
  filter.append(tabs,search);app.append(filter);
  const list=el('div');list.id='listing';app.append(list);renderTonightList();app.append(el('p','help-note','Your music taste and concert decisions stay on this device. Use My Taste → Export backup to keep them safe.'));app.querySelector('.hero').append(actions);
}
function renderArchiveList(){
  const root=document.querySelector('#archive-list');if(!root)return;root.replaceChildren();
  const sorted=[...state.archive].map(normalizeEvent).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
  const filtered=archiveSearch?sorted.filter(x=>norm(`${x.artist} ${x.city} ${x.venue} ${x.genre}`).includes(norm(archiveSearch))):sorted;
  if(!filtered.length){root.append(empty('Memories start here.',state.archive.length?'No concerts match your search.':'Add the shows you have attended — even ones from years ago.',openConcertDialog,'+ Add past concert'));return;}
  let currentYear='';for(const e of filtered){
    const year=e.date.slice(0,4);if(year!==currentYear){currentYear=year;root.append(el('h3','archive-year',year));}
    const row=el('div','archive-row');row.append(el('div','date',new Date(`${e.date}T12:00:00`).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})));
    const details=el('div');details.append(el('strong','',e.artist),el('small','',[e.venue,e.city,formatCountry(e.country)].filter(Boolean).join(' · ')));row.append(details);
    row.append(button('Remove','button small ghost',()=>{if(confirm(`Remove ${e.artist} from your archive?`)){state.archive=state.archive.filter(a=>a.id!==e.id);persist();render();}}));root.append(row);
  }
}
function renderArchive(){
  app.replaceChildren(heading('Archive.', 'The places, people and music you will remember. Your personal concert history.'));
  const entries=state.archive.map(normalizeEvent).filter(Boolean);const artists=new Map();
  for(const c of entries){const k=c.artist.trim();artists.set(k,(artists.get(k)||0)+1);}
  const actions=el('div','actions');actions.append(button('+ Add past concert','button primary',()=>openConcertDialog('attended')),button('Export backup','button',exportBackup));app.querySelector('.hero').append(actions);
  const kpis=el('div','kpis');kpis.append(count('Concerts',entries.length),count('Artists',artists.size),count('Cities',new Set(entries.map(e=>norm(e.city)).filter(Boolean)).size));app.append(kpis);
  if(artists.size){const stats=el('section','stats-panel');stats.append(el('h3','','Most seen artists'));const top=[...artists].sort((a,b)=>b[1]-a[1]).slice(0,5);for(const [name,n] of top){const r=el('div','stat-bar');r.append(el('span','',name));const track=el('div','bar-track');const fill=el('div','bar-fill');fill.style.width=(n/top[0][1]*100)+'%';track.append(fill);r.append(track,el('b','',n));stats.append(r);}app.append(stats);}
  const head=el('div','section-header');const title=el('div');title.append(el('h2','section-title','Your timeline'),el('p','section-sub','Every show is a story.'));head.append(title);const search=el('input','search');search.type='search';search.value=archiveSearch;search.placeholder='Filter archive…';search.setAttribute('aria-label','Filter archive');search.addEventListener('input',e=>{archiveSearch=e.target.value;renderArchiveList();});head.append(search);app.append(head);
  const list=el('section');list.id='archive-list';app.append(list);renderArchiveList();
}
function render(){
  document.querySelector('.bottom-nav').hidden=!!onboarding;
  document.querySelector('#settings-button').hidden=!!onboarding;
  if(onboarding){onboarding.render(app);return;}
  document.querySelector('#nav-tonight').classList.toggle('active',page==='tonight');
  document.querySelector('#nav-archive').classList.toggle('active',page==='archive');
  if(page==='archive')renderArchive();else renderTonight();
}

/** Initial setup commits preferences only after the user presses Finish.
 * Existing Going, Deciding, Passed and Archive entries are always preserved.
 */
function startGuidedSetup(){
  onboarding=createOnboarding({
    initial:state.profile||{},
    getEvents:()=>catalog.events,
    onCancel:state.profile?()=>{onboarding=null;render();}:null,
    onFinish:(profile)=>{
      state.profile=profile;
      state.pendingDeciding=true;
      onboarding=null;
      page='tonight';collection='deciding';searchText='';
      persist();
      fillInitialDeciding();
      render();
      window.scrollTo({top:0,behavior:'instant'});
    }
  });
  render();
  window.scrollTo({top:0,behavior:'instant'});
}
function fillInitialDeciding(){
  if(!state.pendingDeciding||!state.profile||!catalog.updatedAt)return;
  const picks=seedDeciding(catalog.events,state.profile,artistTags,state.saved,12);
  for(const item of picks){
    // Never overwrite manual decisions or a previously passed event.
    if(!state.saved[item.id])state.saved[item.id]={
      status:'deciding',event:item.event,suggested:true,suggestionReason:item.suggestionReason
    };
  }
  state.pendingDeciding=false;
  state.lastSuggestedCount=picks.length;
  persist();
}

function startDialog(title){
  dialogRoot.replaceChildren();const dlg=el('dialog');const content=el('div','dialog-content');const head=el('div','dialog-head');const h=el('h2','',title);head.append(h,button('×','close',()=>dlg.close()));content.append(head);dlg.append(content);dialogRoot.append(dlg);dlg.addEventListener('close',()=>dlg.remove());dlg.showModal();return {dlg,content};
}
function makeField(label,type,name,value='',options=null){
  const wrap=el('div','field');const id='field-'+name;const lbl=el('label','',label);lbl.htmlFor=id;wrap.append(lbl);
  let input;
  if(options){input=el('select');for(const [v,t] of options){const opt=el('option','',t);opt.value=v;input.append(opt);}}
  else { input=el('input'); input.type=type||'text'; }
  input.id=id;input.name=name;input.value=value||'';if(options)input.value=value||options[0][0];wrap.append(input);return {wrap,input};
}
function openProfileDialog(firstTime=false){
  const {dlg,content}=startDialog(firstTime?'Make it yours.':'My music taste.');
  const p=state.profile||{name:'',country:'NL',city:'',genres:[],artists:[]};
  const selected=new Set(Array.isArray(p.genres)?p.genres:[]);const selectedStyles=new Set(Array.isArray(p.subgenres)?p.subgenres:[]);let artists=Array.isArray(p.artists)?[...p.artists]:[];
  content.append(el('p','help-note',firstTime?'No Last.fm or Spotify needed. Choose your music and where you want to see it live.':'These preferences personalize Tonight. Changes apply immediately.'));
  const name=makeField('Your name (optional)','text','name',p.name);name.input.placeholder='What should we call you?';content.append(name.wrap);
  const area=el('div','field-row');const country=makeField('Country',null,'country',p.country||'NL',COUNTRIES.map(c=>[c.code,c.name]));const city=makeField('City (preferred, optional)','text','city',p.city||'');city.input.placeholder='Utrecht, Amsterdam…';area.append(country.wrap,city.wrap);content.append(area);
  const label=el('div','field');label.append(el('label','','Favorite music genres'),el('p','field-hint','Select a few. You can change these later.'));const chips=el('div','chip-list');
  for(const g of GENRES){const chip=button(g,'chip'+(selected.has(g)?' selected':''),()=>{if(selected.has(g))selected.delete(g);else selected.add(g);chip.classList.toggle('selected',selected.has(g));chip.setAttribute('aria-pressed',String(selected.has(g)));});chip.setAttribute('aria-pressed',String(selected.has(g)));chips.append(chip);}label.append(chips);content.append(label);
  const stylesBlock=el('div','field');
  stylesBlock.append(el('label','','More specific styles'),el('p','field-hint','Fine-tune genres and related sounds in the guided setup, or update the selections below.'));
  const styleChips=el('div','chip-list');
  const updateStyles=()=>{
    styleChips.replaceChildren();
    const list=[...new Set([...suggestedNiches([...selected]).map(x=>x.name),...selectedStyles])].slice(0,56);
    for(const style of list){
      const chip=button(style,'chip'+(selectedStyles.has(style)?' selected':''),()=>{
        if(selectedStyles.has(style))selectedStyles.delete(style);else selectedStyles.add(style);
        chip.classList.toggle('selected',selectedStyles.has(style));
        chip.setAttribute('aria-pressed',String(selectedStyles.has(style)));
      });
      chip.setAttribute('aria-pressed',String(selectedStyles.has(style)));
      styleChips.append(chip);
    }
  };
  updateStyles();stylesBlock.append(styleChips);content.append(stylesBlock);
  const artistsField=el('div','field');artistsField.append(el('label','','Favorite artists / bands'),el('p','field-hint','Type a band and press Add or Enter. You can paste comma-separated names.'));
  const entry=el('div','artist-row');const input=el('input');input.placeholder='e.g. MONO, Amenra, Sigur Rós';input.maxLength=220;const tags=el('div','artist-list');const redraw=()=>{tags.replaceChildren();for(const a of artists){const p=el('span','artist-pill',a);p.append(button('×','',()=>{artists=artists.filter(x=>x!==a);redraw();}));tags.append(p);}};
  const add=()=>{const names=input.value.split(/[,\n;]/).map(x=>x.trim()).filter(Boolean);for(const n of names){if(!artists.some(x=>norm(x)===norm(n)))artists.push(n.slice(0,110));}artists=artists.slice(0,100);input.value='';redraw();};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add();}});entry.append(input,button('Add','button small',add));artistsField.append(entry,tags);content.append(artistsField);redraw();
  const status=el('p','status');status.setAttribute('role','status');content.append(status);
  const controls=el('div','dialog-actions');if(!firstTime){controls.append(button('Guided setup ↗','button small',()=>{dlg.close();startGuidedSetup();}),button('Export backup','button small ghost',exportBackup),button('Import backup','button small ghost',()=>{dlg.close();importFile.click();}));}
  controls.append(button(firstTime?'Start exploring →':'Save taste','button primary',()=>{
    if(input.value.trim())add();if(!selected.size&&!artists.length){status.textContent='Choose at least one genre or add a favorite band.';return;}
    state.profile={...state.profile,name:name.input.value.trim().slice(0,80),country:country.input.value,city:city.input.value.trim().slice(0,100),genres:[...selected],subgenres:[...selectedStyles],artists};persist();collection='discover';dlg.close();render();
  }));content.append(controls);
  if(!firstTime){const note=el('p','help-note','Private to this browser · no account, no cloud sync. Export a backup before clearing your browser or changing phones.');content.append(el('div','separator'),note);}
}
function openConcertDialog(initial='deciding'){
  const {dlg,content}=startDialog('Add a concert.');
  content.append(el('p','help-note','Know about a show we missed? Or add a concert you attended years ago.'));
  const fields={};for(const [label,type,name,placeholder] of [['Artist / band','text','artist','Artist name'],['Date','date','date',''],['Venue','text','venue','Venue name'],['City','text','city','City'],['Official event URL (optional)','url','url','https://…']]){const f=makeField(label,type,name,'');if(placeholder)f.input.placeholder=placeholder;f.input.required=['artist','date'].includes(name);fields[name]=f.input;content.append(f.wrap);}
  const country=makeField('Country',null,'country',state.profile?.country||'NL',COUNTRIES.map(c=>[c.code,c.name]));content.append(country.wrap);
  const genre=makeField('Genre (optional)',null,'genre','',[['','Choose genre'],...GENRES.map(g=>[g,g])]);content.append(genre.wrap);
  const status=makeField('Save to',null,'status',initial,[['deciding','Deciding'],['going','Going'],['attended','Archive · I attended'],['passed','Passed']]);content.append(status.wrap);
  const feedback=el('p','status');feedback.setAttribute('role','status');content.append(feedback);
  const actions=el('div','dialog-actions');actions.append(button('Cancel','button',()=>dlg.close()),button('Save concert','button primary',()=>{
    if(!fields.artist.value.trim()){feedback.textContent='Enter an artist name.';fields.artist.focus();return;}
    if(!validDate(fields.date.value)){feedback.textContent='Enter a valid date.';fields.date.focus();return;}
    const event=normalizeEvent({id:'manual-'+(globalThis.crypto?.randomUUID?.()||Date.now()),artist:fields.artist.value.trim(),date:fields.date.value,venue:fields.venue.value.trim(),city:fields.city.value.trim(),country:country.input.value,genre:genre.input.value,url:fields.url.value.trim(),source:'manual'});
    if(fields.url.value.trim()&&!safeUrl(fields.url.value.trim())){feedback.textContent='Event URL must start with https://';return;}
    if(!event){feedback.textContent='Could not save this concert.';return;}
    if(status.input.value==='attended')archiveEvent(event);else setStatus(event,status.input.value);dlg.close();
  }));content.append(actions);
}
function exportBackup(){
  const blob=new Blob([JSON.stringify({app:'Listening Mirror Live',exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=`listening-mirror-backup-${dateToday()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
importFile.addEventListener('change',async()=>{
  const file=importFile.files?.[0];importFile.value='';if(!file)return;if(file.size>3_000_000){alert('This backup is too large (3MB limit).');return;}
  try{const next=JSON.parse(await file.text());if(next?.app!=='Listening Mirror Live'||!Array.isArray(next.archive)||!next.profile||typeof next.saved!=='object'||next.saved===null||Array.isArray(next.saved)){throw Error('Invalid Listening Mirror Live backup format.');}
    const cleanArchive=next.archive.slice(0,3000).map(normalizeEvent).filter(x=>x&&validDate(x.date));
    const cleanSaved=Object.fromEntries(Object.values(next.saved).slice(0,2000).map(fixSavedItem).filter(Boolean).map(x=>[x.event.id,x]));
    if(!confirm(`Restore ${cleanArchive.length} archived concerts and ${Object.keys(cleanSaved).length} saved shows? This will replace current data.`))return;
    state={version:1,profile:{name:String(next.profile.name||'').slice(0,80),country:COUNTRIES.some(c=>c.code===next.profile.country)?next.profile.country:'NL',city:String(next.profile.city||'').slice(0,100),genres:Array.isArray(next.profile.genres)?next.profile.genres.filter(x=>GENRES.includes(x)).slice(0,GENRES.length):[],artists:Array.isArray(next.profile.artists)?next.profile.artists.filter(x=>typeof x==='string').slice(0,100):[],subgenres:Array.isArray(next.profile.subgenres)?next.profile.subgenres.filter(x=>typeof x==='string').slice(0,40):[]},saved:cleanSaved,archive:cleanArchive,pendingDeciding:false};persist();render();alert('Your backup is restored.');
  }catch(e){alert(`Could not import backup: ${e.message}`);}
});

async function fetchCatalog(){
  try{const response=await fetch('./data/events.json',{cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status}`);
    const data=await response.json();if(!Array.isArray(data.events))throw Error('Invalid events feed');
    let tags={artists:{}};
    try{
      const tagResponse=await fetch('./data/artist-tags.json',{cache:'no-store'});
      if(tagResponse.ok){const raw=await tagResponse.json();if(raw?.artists && typeof raw.artists==='object')tags=raw;}
    }catch(e){console.warn('Artist genres unavailable',e);}
    try{
      const seeds=await fetch('./data/curated-genres.json',{cache:'no-store'});
      if(seeds.ok){
        const file=await seeds.json();
        for(const [key,item] of Object.entries(file.artists||{})){
          if(Array.isArray(item?.genres)&&item.genres.length){
            const old=tags.artists[key]?.genres||[];
            tags.artists[key]={...tags.artists[key],genres:[...new Set([...item.genres,...old])],source:'curated+metadata'};
          }
        }
      }
    }catch(error){console.warn('Curated artist styles temporarily unavailable',error);}
    artistTags=mergeTasteTags(tags);
    let allEvents=data.events.map(normalizeEvent).filter(x=>x&&validDate(x.date));
    try{
      const resp=await fetch('./data/verified-events.json',{cache:'no-store'});
      if(resp.ok){
        const verified=await resp.json();
        for(const item of verified.events||[]){
          const event=normalizeEvent(item);
          if(!event||!validDate(event.date)||event.date<dateToday())continue;
          // A venue-confirmed listing takes priority over a matching
          // unverified aggregator listing with identical headliner/date.
          allEvents=allEvents.filter(e=>!(e.date===event.date &&
            e.country===event.country&&norm(e.artist)===norm(event.artist)));
          allEvents.push(event);
        }
      }
    }catch(error){console.warn('Venue-confirmed event fallback temporarily unavailable',error);}
    catalog={events:allEvents,updatedAt:data.updatedAt||null,source:data.source||'unknown',coverage:data.coverage||null,error:''};
    fillInitialDeciding();
  }catch(e){catalog.error=e.message||'Could not load';}render();
}
function init(){
  document.querySelector('#nav-tonight').addEventListener('click',()=>go('tonight'));
  document.querySelector('#nav-archive').addEventListener('click',()=>go('archive'));
  document.querySelector('#settings-button').addEventListener('click',()=>openProfileDialog(!state.profile));
  window.addEventListener('hashchange',()=>{const dest=location.hash.replace('#','');if(dest==='tonight'||dest==='archive'){page=dest;render();}});
  page=location.hash==='#archive'?'archive':'tonight';if(!state.profile)startGuidedSetup();else render();fetchCatalog();
}
init();
