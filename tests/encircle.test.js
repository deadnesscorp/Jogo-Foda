const assert=require('node:assert/strict');
const api=require('../src/moss-creatures.js');
function setup(blocked=()=>false){
  const model=api.createEcology({random:()=>.5,getBuildings:()=>[[50,50,40,40]],getSize:()=>({w:1200,h:1200}),isBlocked:blocked,getShadows:()=>[]});
  model.reset({daylight:0},{x:600,y:600});
  model.entities.forEach((e,i)=>Object.assign(e,{kind:0,x:460+i*10,y:600,indoors:false,heard:{x:600,y:600},heardRoom:-1,heardPlayer:true,alert:4}));
  return model;
}
const options={light:{daylight:0},target:{x:600,y:600},sounds:[{x:600,y:600,radius:800,room:-1,player:true}]};
const model=setup();model.update(.1,options);
assert.equal(model.entities[0].behavior,'investigate');
assert.ok(model.entities.slice(1).every(e=>e.behavior==='encircle'));
assert.ok((model.entities[1].y-600)*(model.entities[2].y-600)<0,'flankers split to opposite sides');
const bait=setup();bait.entities.forEach(e=>{e.heardPlayer=false;});
bait.update(.1,{...options,sounds:[{x:600,y:600,radius:900,player:false}]});
assert.ok(bait.entities.every(e=>e.behavior!=='encircle'),'bait does not reveal the player');
const blocked=setup((x,y)=>y!==600);blocked.update(.1,options);
assert.ok(blocked.entities.every(e=>e.y===600),'flankers respect blocked terrain');
const close=setup();Object.assign(close.entities[1],{x:575,y:600});close.update(.1,options);
assert.ok(close.entities[1].x>575,'a nearby hunter closes in instead of orbiting forever');
console.log('Encircle checks passed');
