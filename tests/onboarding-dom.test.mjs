import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnboarding} from '../js/onboarding.js';

class FakeElement{
  constructor(tag){
    this.tagName=tag.toUpperCase();this.children=[];this.className='';
    this.attributes={};this.listeners={};this._text='';this.value='';
    this.classList={
      contains:name=>this.className.split(/\s+/).includes(name),
      toggle:(name,force)=>{
        const has=this.classList.contains(name);
        const add=force===undefined?!has:force;
        this.className=[...new Set(this.className.split(/\s+/).filter(x=>x&&x!==name).concat(add?[name]:[]))].join(' ');
      }
    };
  }
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];this._text='';}
  addEventListener(event,fn){(this.listeners[event]??=[]).push(fn);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  send(event,extra={}){for(const fn of this.listeners[event]||[])fn({key:extra.key||'',preventDefault(){}});}
}
const find=(root,predicate)=>{
  if(predicate(root))return root;
  for(const child of root.children||[]){const result=find(child,predicate);if(result)return result;}
  return null;
};
const click=(root,exact)=>{const b=find(root,n=>n.tagName==='BUTTON'&&n.textContent===exact);assert.ok(b,'Expected button '+exact);b.send('click');};
const field=(root,placeholder)=>find(root,n=>n.tagName==='INPUT'&&n.placeholder===placeholder);
test('full 4-step onboarding accepts name, genres, niche and optional artists',()=>{
  globalThis.document={createElement:tag=>new FakeElement(tag)};
  globalThis.window={scrollTo(){}};
  const root=new FakeElement('main');
  let completed=null;
  const view=createOnboarding({initial:{country:'GR'},getEvents:()=>[],
    onFinish:profile=>completed=profile});
  view.render(root);
  // Name is required and progress is blocked without it.
  click(root,'Continue →');
  assert.match(root.textContent,/Please enter your name/);
  const name=field(root,'Your name');
  assert.ok(name);name.value='Alex';name.send('input');
  const city=field(root,'e.g. Athens, Utrecht');
  city.value='Athens';city.send('input');
  click(root,'Continue →');
  assert.match(root.textContent,/What do you listen to/);
  click(root,'Metal');
  click(root,'Continue →');
  assert.match(root.textContent,/Go a little deeper/);
  click(root,'Doom Metal');
  click(root,'Continue →');
  assert.match(root.textContent,/Who should we follow/);
  const band=find(root,n=>n.tagName==='BUTTON'&&n.className.includes('onboarding-artist')&&n.textContent.includes('Paradise Lost'));
  assert.ok(band,'Doom metal seed must offer Paradise Lost');
  band.send('click');
  click(root,'Finish & fill my Deciding →');
  assert.equal(completed.name,'Alex');assert.equal(completed.country,'GR');
  assert.equal(completed.city,'Athens');
  assert.deepEqual(completed.genres,['Metal']);
  assert.ok(completed.subgenres.includes('Doom Metal'));
  assert.ok(completed.artists.includes('Paradise Lost'));
  assert.equal(completed.onboarded,true);
});
test('typed band is included on Finish without needing separate Add click',()=>{
  globalThis.document={createElement:tag=>new FakeElement(tag)};
  globalThis.window={scrollTo(){}};
  const root=new FakeElement('main');
  let completed=null;
  const view=createOnboarding({initial:{name:'Alex',country:'GR',genres:['Metal']},onFinish:p=>completed=p});
  view.render(root);
  click(root,'Continue →');
  click(root,'Continue →');
  click(root,'Continue →');
  const custom=field(root,'Add a favorite band not listed');
  assert.ok(custom);custom.value='My obscure metal band';custom.send('input');
  click(root,'Finish & fill my Deciding →');
  assert.ok(completed.artists.includes('My obscure metal band'));
});
