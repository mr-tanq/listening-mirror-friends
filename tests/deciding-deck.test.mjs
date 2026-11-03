import test from 'node:test';
import assert from 'node:assert/strict';
import {swipeDecision,explainConcert,mountDecidingDeck} from '../js/deciding-deck.js';

class Node {
  constructor(tag){
    this.tagName=tag.toUpperCase();this.className='';this.textContent='';
    this.children=[];this.listeners={};this.style={};this.attributes={};
    this.classList={add:x=>this.className+=' '+x,remove:x=>this.className=this.className.split(' ').filter(y=>y!==x).join(' ')};
  }
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(type,handler){(this.listeners[type]||=[]).push(handler);}
  emit(type,data={}){for(const fn of (this.listeners[type]||[]))fn({preventDefault(){},...data});}
}
const find=(n,test)=>{
  if(test(n))return n;
  for(const x of n.children){const found=find(x,test);if(found)return found;}
  return null;
};
const sample={id:'show-1',artist:'SOEN',date:'2027-03-24',city:'Athens',country:'GR',
  venue:'FLOYD',genre:'Metal',artists:['SOEN'],url:'https://example.org/event'};
function create(opts={}){
  globalThis.document={createElement:tag=>new Node(tag)};
  const root=new Node('div');
  const decisions=[];let later=0,infos=0;
  mountDecidingDeck(root,{event:sample,suggestionReason:'Matches progressive metal'},{
    remaining:7,onDecide:(event,status)=>decisions.push({id:event.id,status}),
    onLater:()=>{later++;},onDetails:()=>{infos++;},...opts
  });
  const stage=find(root,x=>x.className.includes('deck-stage'));
  return {root,stage,decisions,get later(){return later;},get infos(){return infos;}};
}
test('swipe threshold distinguishes right, left and cancel',()=>{
  assert.equal(swipeDecision(110),'going');
  assert.equal(swipeDecision(-110),'passed');
  assert.equal(swipeDecision(34),null);
});
test('right swipe moves card into Going',()=>{
  const o=create();
  o.stage.emit('pointerdown',{pointerId:3,clientX:100,clientY:200});
  o.stage.emit('pointermove',{pointerId:3,clientX:220,clientY:200});
  o.stage.emit('pointerup',{pointerId:3,clientX:220,clientY:200});
  assert.deepEqual(o.decisions,[{id:'show-1',status:'going'}]);
});
test('left swipe saves Pass once and vertical swipe does not decide',()=>{
  const o=create();
  o.stage.emit('pointerdown',{pointerId:3,clientX:180,clientY:100});
  o.stage.emit('pointermove',{pointerId:3,clientX:179,clientY:190});
  o.stage.emit('pointerup',{pointerId:3,clientX:179,clientY:190});
  assert.equal(o.decisions.length,0);
  o.stage.emit('pointerdown',{pointerId:7,clientX:190,clientY:200});
  o.stage.emit('pointermove',{pointerId:7,clientX:20,clientY:201});
  o.stage.emit('pointerup',{pointerId:7,clientX:20,clientY:201});
  assert.deepEqual(o.decisions,[{id:'show-1',status:'passed'}]);
});
test('Later cycles without saving or passing an event',()=>{
  const o=create();
  const later=find(o.root,x=>x.tagName==='BUTTON'&&x.textContent==='Later');
  later.emit('click');
  assert.equal(o.later,1);
  assert.equal(o.decisions.length,0);
});
test('Info shows event details without triggering accidental Going',()=>{
  const o=create();
  const button=find(o.root,x=>x.tagName==='BUTTON'&&x.textContent==='Details');
  button.emit('click');
  assert.equal(o.infos,1);
  assert.equal(o.decisions.length,0);
});
test('keyboard arrows provide swipe alternatives',()=>{
  const o=create();
  o.stage.emit('keydown',{key:'ArrowLeft'});
  assert.equal(o.decisions[0].status,'passed');
});
test('detail metadata includes reason, venue and local date, but no invented time',()=>{
  const facts=explainConcert(sample,'Recommended from Metalcore');
  assert.ok(facts.some(([label,value])=>label==='Venue'&&value==='FLOYD'));
  assert.ok(facts.some(([label,value])=>label==='Why this show'&&value.includes('Metalcore')));
  assert.equal(facts.some(([label,value])=>label==='When'&&value.includes('TBA')),false);
});
