import {COUNTRIES,GENRES,norm} from './model.js';
import {suggestedNiches,suggestTasteBands,ALL_SUBGENRES} from './taste-engine.js';

const mk=(tag,cls='',text=null)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==null)node.textContent=String(text);
  return node;
};
const btn=(label,cls,handler)=>{
  const b=mk('button',cls,label);b.type='button';b.addEventListener('click',handler);return b;
};
const labelInput=(title,value,placeholder,update,{maxLength=100,required=false}={})=>{
  const box=mk('div','onboarding-field');
  const label=mk('label','',title);
  const input=mk('input','onboarding-input');
  input.type='text';input.value=value||'';input.maxLength=maxLength;input.placeholder=placeholder||'';
  input.required=required;input.addEventListener('input',()=>update(input.value));
  label.append(input);box.append(label);return {box,input};
};
const unique=(names)=>[...new Map(names.filter(x=>typeof x==='string'&&x.trim())
  .map(x=>[norm(x),x.trim().slice(0,110)])).values()];

/**
 * Full-page, accessible four-step setup. The user can go back without losing
 * draft choices. Existing profiles are never changed until Finish is pressed.
 */
export function createOnboarding({initial={},getEvents=()=>[],onFinish,onCancel}={}){
  const draft={
    name:String(initial.name||'').slice(0,80),
    country:COUNTRIES.some(c=>c.code===initial.country)?initial.country:'NL',
    city:String(initial.city||'').slice(0,100),
    genres:new Set((initial.genres||[]).filter(g=>GENRES.includes(g))),
    subgenres:new Set((initial.subgenres||[]).filter(x=>typeof x==='string')),
    artists:unique(initial.artists||[])
  };
  let step=0;
  let root=null;
  const titles=['Welcome to your sound.','What do you listen to?','Go a little deeper.','Who should we follow?'];
  const notes=[
    'Give this Listening Mirror a name and choose where you would like to find live music.',
    'Pick the main genres you love. You can select as many as you want.',
    'Based on your choices, here are related and more specific sounds. Pick what feels right, or skip.',
    'Choose artists you love. These are examples connected to your music taste — not a claim that you have listened to them.'
  ];
  function profile(){
    return {name:draft.name.trim().slice(0,80),
      country:draft.country,city:draft.city.trim().slice(0,100),
      genres:[...draft.genres],subgenres:[...draft.subgenres],
      artists:unique(draft.artists).slice(0,100),onboarded:true};
  }
  function heading(){
    const hero=mk('header','onboarding-heading');
    hero.append(mk('p','onboarding-kicker','LISTENING MIRROR  /  THE FIRST LISTEN'));
    const progress=mk('div','onboarding-progress');
    for(let i=0;i<4;i++){
      const bar=mk('span','onboarding-progress-item'+(i<=step?' active':''));
      bar.setAttribute('aria-label','Step '+(i+1));progress.append(bar);
    }
    hero.append(progress);
    hero.append(mk('p','onboarding-step-label','STEP '+(step+1)+' OF 4'));
    hero.append(mk('h1','onboarding-title',titles[step]));
    hero.append(mk('p','onboarding-description',notes[step]));
    return hero;
  }
  function multiChip(value,selected,onToggle){
    const chip=btn(value,'chip onboarding-chip'+(selected?' selected':''),()=>onToggle(chip));
    chip.setAttribute('aria-pressed',String(selected));return chip;
  }
  function welcome(body){
    const name=labelInput('What should we call you?',draft.name,'Your name',v=>draft.name=v,{maxLength:80,required:true});
    name.input.autocomplete='given-name';body.append(name.box);
    const region=mk('div','onboarding-region');
    const wrap=mk('div','onboarding-field');
    const label=mk('label','','Country');
    const select=mk('select','onboarding-input');
    for(const country of COUNTRIES){
      const opt=mk('option','',country.name);opt.value=country.code;
      if(country.code===draft.country)opt.selected=true;
      select.append(opt);
    }
    select.addEventListener('change',()=>draft.country=select.value);
    label.append(select);wrap.append(label);region.append(wrap);
    region.append(labelInput('Preferred city (optional)',draft.city,'e.g. Athens, Utrecht',v=>draft.city=v,{maxLength:100}).box);
    body.append(region);
    body.append(mk('p','onboarding-hint',
      'Concert feeds currently cover Netherlands, Belgium and Greece. Other countries can be saved as preferences, but do not have an active event feed yet.'));
  }
  function genres(body){
    const chips=mk('div','onboarding-chips');
    for(const genre of GENRES){
      const selected=draft.genres.has(genre);
      chips.append(multiChip(genre,selected,chip=>{
        if(draft.genres.has(genre))draft.genres.delete(genre);else draft.genres.add(genre);
        chip.classList.toggle('selected',draft.genres.has(genre));
        chip.setAttribute('aria-pressed',String(draft.genres.has(genre)));
      }));
    }
    body.append(chips);
    body.append(mk('p','onboarding-hint','These are the starting point. Next we will suggest related styles, including more underground sounds.'));
  }
  function niches(body){
    const choices=suggestedNiches([...draft.genres]);
    const intro=mk('p','onboarding-hint','Exploring from: '+[...draft.genres].join(' · '));
    body.append(intro);
    const chips=mk('div','onboarding-niche-grid');
    for(const item of choices){
      const active=draft.subgenres.has(item.name);
      const chip=mk('button','onboarding-niche'+(active?' selected':''));
      chip.type='button';chip.setAttribute('aria-pressed',String(active));
      chip.append(mk('strong','',item.name));
      if(item.artists.length)chip.append(mk('small','',item.artists.slice(0,2).join(' · ')));
      chip.addEventListener('click',()=>{
        if(draft.subgenres.has(item.name))draft.subgenres.delete(item.name);else draft.subgenres.add(item.name);
        chip.classList.toggle('selected',draft.subgenres.has(item.name));
        chip.setAttribute('aria-pressed',String(draft.subgenres.has(item.name)));
      });
      chips.append(chip);
    }
    body.append(chips);
    const custom=mk('div','onboarding-custom');
    custom.append(mk('p','onboarding-hint','Not seeing your sound? Add a specific style yourself.'));
    const field=mk('input','onboarding-input');
    field.placeholder='e.g. Atmospheric Sludge';field.maxLength=70;
    const add=()=>{
      const value=field.value.trim();
      if(value.length<3||draft.subgenres.size>=40)return;
      if(![...draft.subgenres].some(s=>norm(s)===norm(value)))draft.subgenres.add(value);
      field.value='';render();
    };
    field.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add();}});
    custom.append(field,btn('Add style','button',add));
    body.append(custom);
    if(draft.subgenres.size){
      const picked=mk('p','onboarding-selected-label','Selected: '+[...draft.subgenres].join(' · '));
      body.append(picked);
    }
  }
  function artistStep(body){
    const display=mk('div','onboarding-artist-options');
    const search=mk('input','onboarding-input onboarding-band-search');
    search.type='search';search.placeholder='Search suggestions…';search.setAttribute('aria-label','Filter suggested bands');
    const stats=mk('p','onboarding-selected-label');
    const selected=mk('div','artist-list');
    const manual=mk('div','onboarding-custom');
    const input=mk('input','onboarding-input');input.placeholder='Add a favorite band not listed';input.maxLength=110;
    const add=()=>{
      const names=input.value.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
      draft.artists=unique([...draft.artists,...names]).slice(0,100);
      input.value='';paint();
    };
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add();}});
    manual.append(input,btn('+ Add','button',add));
    const paint=()=>{
      selected.replaceChildren();stats.textContent=draft.artists.length+' favorite artist'+(draft.artists.length===1?'':'s')+' chosen';
      for(const name of draft.artists){
        const pill=mk('span','artist-pill',name);
        const remove=btn('×','',()=>{
          draft.artists=draft.artists.filter(x=>norm(x)!==norm(name));paint();
        });
        remove.setAttribute('aria-label','Remove '+name);pill.append(remove);selected.append(pill);
      }
      display.replaceChildren();
      const matches=suggestTasteBands(profile(),getEvents(),160);
      const query=norm(search.value);
      const visible=(query?matches.filter(x=>norm(x.name).includes(query)):matches.slice(0,36));
      if(!visible.length)display.append(mk('p','onboarding-hint','No suggested bands match that search. You can add any artist below.'));
      for(const item of visible){
        const active=draft.artists.some(a=>norm(a)===norm(item.name));
        const b=mk('button','onboarding-artist'+(active?' selected':''));b.type='button';
        b.setAttribute('aria-pressed',String(active));
        const detail=mk('span','onboarding-artist-detail');
        detail.append(mk('strong','',item.name),mk('small','',item.styles.slice(0,2).join(' · ')));
        if(item.upcoming)detail.append(mk('small','onboarding-artist-live','Upcoming show listed · '+item.upcoming.city));
        b.append(detail,mk('span','onboarding-tick',active?'✓':'+'));
        b.addEventListener('click',()=>{
          if(active)draft.artists=draft.artists.filter(x=>norm(x)!==norm(item.name));
          else draft.artists=unique([...draft.artists,item.name]).slice(0,100);
          paint();
        });
        display.append(b);
      }
    };
    search.addEventListener('input',paint);
    body.append(search,stats,selected,display);
    body.append(mk('p','onboarding-hint','Optional — you can finish without choosing bands. The selected genres still personalize your concerts.'),manual);
    paint();
  }
  function render(){
    if(!root)return;
    root.replaceChildren();
    const panel=mk('div','onboarding-shell');panel.append(heading());
    const body=mk('section','onboarding-body');
    if(step===0)welcome(body);
    else if(step===1)genres(body);
    else if(step===2)niches(body);
    else artistStep(body);
    panel.append(body);
    const status=mk('p','onboarding-error');status.setAttribute('role','status');
    panel.append(status);
    const actions=mk('div','onboarding-actions');
    if(step>0)actions.append(btn('← Back','button',()=>{step--;render();}));
    else if(onCancel)actions.append(btn('Cancel','button ghost',onCancel));
    else actions.append(mk('span','onboarding-spacer'));
    const next=btn(step===3?'Finish & fill my Deciding →':'Continue →','button primary',()=>{
      if(step===0&&!draft.name.trim()){status.textContent='Please enter your name to continue.';return;}
      if(step===1&&!draft.genres.size){status.textContent='Choose at least one music genre.';return;}
      if(step===3){onFinish?.(profile());return;}
      step++;render();
      window.scrollTo({top:0,behavior:'instant'});
    });
    actions.append(next);panel.append(actions);
    panel.append(mk('p','onboarding-privacy','Private to this device · No Last.fm or Spotify connection · You can edit your taste later'));
    root.append(panel);
  }
  return {render(target){root=target;render();},getProfile:profile};
}
