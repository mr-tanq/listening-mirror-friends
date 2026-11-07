import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('small concert cards have a truthful typographic fallback on missing and failed images',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(app,/function fallbackShowArtwork\(event\)/);
 assert.match(app,/img\.replaceWith\(fallbackShowArtwork\(e\)\)/);
 assert.match(app,/else card\.append\(fallbackShowArtwork\(e\)\)/);
 assert.doesNotMatch(app,/show-art','♪'/);
 for(const cls of ['show-art-editorial','show-art-kicker','show-art-artist','show-art-venue']){
  assert.ok(app.includes(cls),cls+' in markup');
  assert.ok(styles.includes(cls),cls+' in CSS');
 }
 assert.match(html,/editorial-fallback-v1/);
});
