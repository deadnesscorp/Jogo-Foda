'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../src/moss-creatures.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/game.js'),'utf8');
const action=source.slice(source.indexOf('  function mountedKickAngle('),source.indexOf('  const isShelter='));
const visual=source.slice(source.indexOf('  function drawSurvival(){'),source.indexOf('  function mossShadowRegions('));
const projection=source.slice(source.indexOf('  function projectFacing(angle)'),source.indexOf('  function bikeWorldTurnDelta('));
const pointer=source.slice(source.indexOf('  function bikeCanvasPointer('),source.indexOf('  function bikeServicePointer('));

function encounter(heading,side,forward,{mounted=true,scale=1}={}){
  const model=api.createEcology({random:()=>.5,getBuildings:()=>[[10,10,30,30]],
    getSize:()=>({w:1600,h:1200}),isBlocked:()=>false,getShadows:()=>[]});
  model.reset({daylight:0},{x:600,y:600});model.entities.splice(1);
  const bike={x:600,y:600,angle:heading};
  const point=(side,forward)=>({x:600+side*Math.cos(heading)+forward*Math.sin(heading),y:600+side*Math.sin(heading)-forward*Math.cos(heading)});
  const target=model.entities[0];Object.assign(target,point(side,forward),{indoors:false,kind:0});
  const opposite={...target,...point(-Math.sign(side||1)*10,2)};
  model.entities.unshift(opposite);
  const projectPoint=(x,y)=>({x:320+(x-600-(y-600)),y:180+(x-600+y-600)*.5});
  const aimPoint=point(side*5,forward*5),cursor=projectPoint(aimPoint.x,aimPoint.y);
  const rotations=[],ctx={save(){},restore(){},translate(){},rotate(a){rotations.push(a);},beginPath(){},arc(){},stroke(){}};
  const sandbox={state:'drive',mounted,kickCooldown:0,kickVisual:0,kickAngle:0,
    kickPointer:{clientX:40+cursor.x*scale,clientY:20+cursor.y*scale},
    canvas:{getBoundingClientRect:()=>({left:40,top:20,width:640*scale,height:360*scale})},
    DISPLAY_W:640,DISPLAY_H:360,gameScene:{x:0,y:0},
    checkpointReturn:null,playerKnockdown:0,bikeInspectOpen:false,ignition:{active:false},
    shelterLife:{cancel(){}},shelterView:null,stopBikeDrag(){},bike,player:bike,
    mossEcology:model,upgrades:{kick:0},interiorWalls:[],setToast(){},ctx,
    survivalActor:()=>bike,projectPoint,ISO_X:1,ISO_Y:.5,
    survivalEffects:[],hudDetails:false,buildings:[],balanceEvent:null};
  vm.runInNewContext(action+projection+pointer+visual,sandbox);
  return {sandbox,target,opposite,rotations};
}

for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,.73])for(const side of [-25,25]){
  for(const scale of [1,2.4]){
    const {sandbox,target,opposite,rotations}=encounter(heading,side,5,{scale});
    vm.runInNewContext('kickCreature();drawSurvival();',sandbox);
    assert.equal(target.behavior,'stunned','Mouse-directed kick hits the aimed side');
    assert.notEqual(opposite.behavior,'stunned','A nearer enemy on the opposite side is not automatically targeted');
    const angle=Math.atan2(target.x-600,-(target.y-600));
    assert.ok(Math.abs(Math.atan2(Math.sin(sandbox.kickAngle-angle),Math.cos(sandbox.kickAngle-angle)))<1e-8,'Strike follows the cursor after isometric conversion and canvas scaling');
    vm.runInNewContext('expectedVisual=projectFacing(kickAngle);',sandbox);
    assert.ok(Math.abs(rotations[0]-sandbox.expectedVisual)<1e-8,'Drawing matches the mouse aim');
  }
  const rear=encounter(heading,side,-5);
  vm.runInNewContext('kickCreature();',rear.sandbox);
  assert.equal(rear.sandbox.kickVisual,0,'Mouse behind the bike cannot trigger a kick');
  assert.equal(rear.sandbox.kickCooldown,0,'Blocked rear aim does not consume cooldown');
}
const noMouse=encounter(0,25,0);noMouse.sandbox.kickPointer=null;
vm.runInNewContext('kickCreature();',noMouse.sandbox);
assert.equal(noMouse.sandbox.kickVisual,0,'No mouse position means no automatic fallback');
const miss=encounter(0,25,0);miss.target.x=605;miss.target.y=575;
vm.runInNewContext('kickCreature();',miss.sandbox);
assert.notEqual(miss.target.behavior,'stunned','An enemy outside the cursor cone is not hit');
const far=encounter(0,60,0);
vm.runInNewContext('kickCreature();',far.sandbox);
assert.notEqual(far.target.behavior,'stunned','Mouse aim respects the kick range');
const foot=encounter(0,0,25,{mounted:false});foot.sandbox.kickPointer=null;foot.opposite.y=620;
vm.runInNewContext('kickCreature();',foot.sandbox);
assert.equal(foot.target.behavior,'stunned','On-foot kick still uses the character facing without a mouse');
assert.equal(foot.sandbox.kickAngle,foot.sandbox.player.angle);
for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,.73])for(const side of [-1,1]){
  for(const kind of [0,1,2])for(const distance of [0,.25,1,3,7]){
    const close=encounter(heading,side*distance,distance*.8);
    close.target.kind=kind;
    // Aim along the side: the nearby creature's body crosses the cone even if its center does not.
    const dx=side*100*Math.cos(heading),dy=side*100*Math.sin(heading);
    close.sandbox.kickPointer={clientX:40+320+dx-dy,clientY:20+180+(dx+dy)*.5};
    vm.runInNewContext('kickCreature();',close.sandbox);
    assert.equal(close.target.behavior,'stunned','Mouse kick connects with a touching/overlapping creature body');
    assert.notEqual(close.opposite.behavior,'stunned','Contact tolerance does not auto-target the other side');
  }
  const rear=encounter(heading,side*.25,-.25);
  const dx=side*100*Math.cos(heading),dy=side*100*Math.sin(heading);
  rear.sandbox.kickPointer={clientX:40+320+dx-dy,clientY:20+180+(dx+dy)*.5};
  vm.runInNewContext('kickCreature();',rear.sandbox);
  assert.notEqual(rear.target.behavior,'stunned','A touching enemy behind the bike remains protected by the rear restriction');
}
console.log('Mouse kick: both sides, no rear kicks, no auto-aim, projection, range and on-foot behavior passed');
