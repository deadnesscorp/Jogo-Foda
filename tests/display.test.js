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
