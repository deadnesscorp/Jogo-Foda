'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { gameRenderResolution } = require('../src/display.js');

for (const [width, height] of [[320,180],[375,211],[768,432],[1366,768],[1920,1080],[2560,1440]]) {
  for (const ratio of [1,1.25,2,3]) {
    const result = gameRenderResolution(width,height,ratio);
    assert.equal(result.width * 9, result.height * 16, 'Backing resolution preserves exact aspect ratio');
    assert(result.width >= 960 && result.width <= 1920, 'Resolution stays inside the render budget');
  }
}

const callbacks = {}, queued = [], sizes = [];
let observer, measurements = 0;
const canvas = {
  closest: () => ({}),
  getBoundingClientRect() { measurements++; return {width:640,height:360}; }
};
const window = {
  devicePixelRatio:2,
  addEventListener(name, callback) { callbacks[name] = callback; },
  requestAnimationFrame(callback) { queued.push(callback); },
  visualViewport:{addEventListener(name,callback){callbacks.visualResize=callback;}},
  ResizeObserver:class { constructor(callback){observer=callback;} observe(){} }
};
const document = {
  querySelector:()=>null,
  addEventListener(){},
  body:{classList:{toggle(){}}}
};
const context = {window,document};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/display.js'),'utf8'),context);
context.initGameDisplay({canvas,onResize:resolution=>sizes.push(resolution)});
assert.equal(measurements,1,'Initial resolution is set immediately');
callbacks.resize(); callbacks.resize(); callbacks.visualResize(); observer();
assert.equal(queued.length,1,'Window, visual viewport and layout resize events share one frame callback');
assert.equal(measurements,1);
queued.shift()();
assert.equal(measurements,2,'A resize burst triggers one measurement and resolution update');
assert.equal(sizes.length,2);
console.log('Display aspect ratio, resolution budget and resize coalescing checks passed');

const {gameSceneViewport}=require('../src/display.js');
const gameSource=fs.readFileSync(path.join(__dirname,'../src/game.js'),'utf8');
const hudSource=gameSource.slice(gameSource.indexOf('  function drawSurvivalHud()'),gameSource.indexOf('  function drawAtmosphere('));
function statusPanels(state,riding=false){
  const scene=gameSceneViewport(state),panels=[],stack=[];
  let transform=[2,0,0,2,scene.x*2,scene.y*2];
  const initial=transform.slice();
  const ctx={
    save(){stack.push(transform.slice());},restore(){transform=stack.pop();},
    setTransform(...values){transform=values;},fillText(){},fillRect(){}
  };
  const sandbox={ctx,DISPLAY_W:640,DISPLAY_H:360,W:scene.width,H:scene.height,
    RENDER_SCALE:2,gameScene:scene,gameTime:0,
    bikeControlsMounted:()=>riding,bikeDashboardBounds:()=>({y:280}),
    hunger:99,thirst:99,characterHealth:{status:()=>({health:100,maxHealth:100})},
    panel(x,y,w,h){panels.push([x*transform[0]+transform[4],y*transform[3]+transform[5],w,h]);}
  };
  vm.runInNewContext(hudSource+';drawSurvivalHud();',sandbox);
  assert.deepEqual(transform,initial,'HUD restores the scene transform');
  return panels;
}
assert.deepEqual(statusPanels('explore'),statusPanels('drive'),'Life, hunger and thirst stay in the same screen positions indoors and outdoors');
assert.equal(statusPanels('drive',true)[0][1],(280-29)*2,'Riding meters remain above the motorcycle dashboard');
console.log('Status HUD stays anchored to the display across interior transitions');
