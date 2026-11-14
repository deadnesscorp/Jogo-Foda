const assert=require('node:assert/strict'),api=require('../moss-creatures.js');
function model(kind,blocked=()=>false){
  const m=api.createEcology({random:()=>.5,getBuildings:()=>[[10,10,30,30]],getSize:()=>({w:1200,h:1200}),isBlocked:blocked,getShadows:()=>[]});
  m.reset({daylight:0},{x:600,y:600});m.entities.splice(1);
  Object.assign(m.entities[0],{kind,x:620,y:600,indoors:false});return m;
}
const options={x:600,y:600,angle:Math.PI/2};
for(const [kind,push] of [[0,70],[1,105],[2,0]]){
  const m=model(kind),e=m.kick(options);assert.ok(e);assert.equal(e.behavior,'stunned');
  if(kind===2)assert.equal(e.kickStun,1.5);
  for(let i=0;i<3;i++)m.update(.1,{light:{daylight:0},target:{x:600,y:600}});
  assert.ok(Math.abs(e.x-620-push)<1e-6);assert.ok(e.kickStun>0);
}
const back=model(0);assert.equal(back.kick({...options,angle:-Math.PI/2}),null);
const far=model(0);far.entities[0].x=650;assert.equal(far.kick(options),null);
const wall=model(0,x=>x>=630);assert.ok(wall.kick(options));
for(let i=0;i<4;i++)wall.update(.1,{light:{daylight:0},target:{x:600,y:600}});
assert.ok(wall.entities[0].x<630,'knockback cannot cross walls');
assert.equal(api.playerNoise({x:0,y:0,speed:40}).radius,32);
assert.equal(api.playerNoise({x:0,y:0,speed:40,running:true}).radius,75);
assert.ok(api.playerNoise({x:0,y:0,speed:300,vehicle:true,engineRunning:true}).radius<=200);
console.log('Kick and reduced hearing checks passed');
