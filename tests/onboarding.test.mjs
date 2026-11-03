import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnboarding} from '../js/onboarding.js';
import {ALL_SUBGENRES,suggestedNiches} from '../js/taste-engine.js';
import {GENRES} from '../js/model.js';

test('new user profile starts empty and defaults to a supported country',()=>{
  const view=createOnboarding({initial:{}});
  assert.deepEqual(view.getProfile(),{
    name:'',country:'NL',city:'',genres:[],subgenres:[],artists:[],onboarded:true
  });
});
test('existing profile is copied into a draft without modifying the original',()=>{
  const old={name:'Kim',country:'GR',city:'Athens',genres:['Metal'],subgenres:['Doom Metal'],artists:['Paradise Lost']};
  const controller=createOnboarding({initial:old});
  const draft=controller.getProfile();
  assert.equal(draft.name,'Kim');
  assert.deepEqual(draft.genres,['Metal']);
  assert.deepEqual(draft.subgenres,['Doom Metal']);
  assert.deepEqual(draft.artists,['Paradise Lost']);
  assert.equal(old.onboarded,undefined);
});
test('invalid genres in imported profile drafts do not create unrecognized choices',()=>{
  const view=createOnboarding({initial:{genres:['Metal','Quantum Disco'],artists:['MONO','mono']}});
  assert.deepEqual(view.getProfile().genres,['Metal']);
  assert.deepEqual(view.getProfile().artists,['mono']);
});
test('each broad genre has suggested more specific styles in the setup',()=>{
  for(const genre of GENRES){
    const recs=suggestedNiches([genre]);
    assert.ok(recs.length>=5,genre+' needs more specialist suggestions');
    assert.ok(recs.every(x=>ALL_SUBGENRES.includes(x.name)),genre+' returned an unknown subgenre');
  }
});
