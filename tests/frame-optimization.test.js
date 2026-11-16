'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');

const lighting = source.slice(source.indexOf('  let lightingCache='), source.indexOf('  function bikeShadowMask('));
let calculations = 0;
const math = Object.create(Math);
math.sin = value => { calculations++; return Math.sin(value); };
const light = new Function('Math', `
  const DAY_LENGTH_SECONDS=180,ISO_X=Math.SQRT1_2,ISO_Y=Math.SQRT1_2*.5;
  let startHour=15,W=640,H=360;
  const shelterLife=null;
  ${lighting}
  return {get:worldLighting,hour(value){startHour=value;},size(w,h){W=w;H=h;}};
`)(math);
const first = light.get(12);
const initialCalculations = calculations;
for (let i = 0; i < 1000; i++) assert.strictEqual(light.get(12), first);
assert.equal(calculations, initialCalculations, 'Repeated draws reuse lighting without trigonometry');
assert.notStrictEqual(light.get(13), first, 'Time changes invalidate lighting');
light.hour(3);
const night = light.get(13);
assert.notEqual(night.daylight, first.daylight, 'Changing the starting hour updates daylight');
light.size(480, 270);
const resized = light.get(13);
assert.notStrictEqual(resized, night, 'Viewport changes invalidate screen light positions');
assert.equal(resized.daylight, night.daylight);
assert(Math.abs(resized.sourceX / 480 - night.sourceX / 640) < 1e-12);
assert(Math.abs(resized.sourceY / 270 - night.sourceY / 360) < 1e-12);
light.hour(15); light.size(640, 360);
assert.deepEqual(light.get(12), first, 'Returning to original inputs restores the exact visual result');

const depthSource = source.slice(source.indexOf('  function drawIsoDepthObjects('), source.indexOf('  function drawBikeExhaust('));
let commands = 0;
const ctx = new Proxy({}, {get: () => () => { commands++; }, set: () => true});
const terminals = [{x:2000,y:2000,disabled:false,design:0,name:'OFFSCREEN'}];
const draw = new Function('ctx', 'towers', `
  const fenceSegments=[],RENDER_SCALE=2,StreetStructures={draw(){ctx.fillRect(0,0,1,1);}},cityProps=[],buildings=[],bike={x:0,y:0},player=bike,camera={x:0,y:0},mounted=true,W=640,H=360;
  const visibleUrbanSprites=new Set(),trimUrbanSpriteCache=()=>{},forest={query:()=>[]};
  const projectPoint=(x,y)=>({x,y});
  ${depthSource}
  return ()=>drawIsoDepthObjects(0,false);
`)(ctx, terminals);
draw();
assert.equal(commands, 0, 'Offscreen computers issue no canvas commands');
terminals[0].x = 200; terminals[0].y = 200;
draw();
assert(commands > 0, 'Visible computers retain their artwork');
commands = 0; terminals[0].x = -35;
draw();
assert(commands > 0, 'Computers partially intersecting the left edge are retained');
commands = 0; terminals[0].x = 200; terminals[0].y = 420;
draw();
assert(commands > 0, 'The monitor and label stay visible when the base is below the screen');
console.log('Lighting reuse, invalidation and terminal visibility checks passed');

const questions = source.slice(source.indexOf('  const networkQuestions ='), source.indexOf('  const platforms ='));
const hacking = source.slice(source.indexOf('  function completeHack('), source.indexOf('  function keyDown('));
const mission = new Function(`
  const towers=Array.from({length:8},(_,i)=>({disabled:false,name:'PC '+i}));
  const active=()=>towers.find(t=>!t.disabled),keys=new Set(),bike={speed:0};
  const upgrades={fuel:0,armor:0,health:0,kick:0};
  let boosts=0,network=0,activeTower=0,approachedByBike=false,flash=0,mounted=false;
  let state='hack',hackMode='question',hackStep=0,hackTime=90,creatureHitCooldown=0;
  const characterHealth={boost(){boosts++;}},setToast=()=>{},setObjective=()=>{},updateObjective=()=>{};
  const bikeCanvasPointer=event=>event;
  ${questions}
  ${hacking}
  return {
    upgrades,
    questionCount(){return networkQuestions.length;},
    begin(){state='hack';hackMode='question';hackStep=0;hackTime=90;},
    answer(wrong=false){const ok=networkQuestions[activeTower][hackStep].ok;hackInput(wrong?(ok+1)%4:ok);},
    snapshot(){return {state,hackMode,hackStep,hackTime,network,boosts};}
  };
`)();
assert.equal(mission.questionCount(),8,'All eight computers have their own question set');
for(let terminal=0;terminal<8;terminal++){
  mission.begin(); mission.answer(true);
  assert.equal(mission.snapshot().hackTime,86,'Wrong answers retain the time penalty');
  assert.equal(mission.snapshot().hackStep,0);
  for(let question=0;question<3;question++)mission.answer();
  assert.equal(mission.snapshot().hackMode,'question','Hack mode remains on question mode throughout diagnosis');
  assert.equal(mission.snapshot().network,terminal+1);
  assert.equal(mission.snapshot().state,terminal===7?'ending':'drive');
}
assert.deepEqual(mission.upgrades,{fuel:0,armor:0,health:0,kick:0});
assert.equal(mission.snapshot().boosts,0,'Completing computers no longer grants upgrade health');
console.log('All eight computers complete directly after their questions, without upgrades');
