const assert=require('node:assert/strict'),api=require('../src/moss-creatures.js');
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

for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,.73]){
  for(const kind of [0,1,2])for(const room of [-1,0]){
    for(const side of [-1,1])for(const gap of [0,.25,1,3,7]){
      const m=model(kind),creature=m.entities[0];
      const x=600+side*gap*Math.cos(angle),y=600+side*gap*Math.sin(angle);
      Object.assign(creature,{x,y,indoors:room>=0,home:0,roomX:x,roomY:y});
      assert.equal(m.kick({x:600,y:600,angle,room}),creature,
        'On-foot kick connects with overlapping bodies, even at the edge of the forward cone, indoors and outdoors');
    }
    const behind=model(kind),creature=behind.entities[0];
    const x=600-Math.sin(angle)*5,y=600+Math.cos(angle)*5;
    Object.assign(creature,{x,y,indoors:room>=0,home:0,roomX:x,roomY:y});
    assert.equal(behind.kick({x:600,y:600,angle,room}),null,'Contact tolerance does not target behind the character');
  }
}
const indoorWall=model(0),resident=indoorWall.entities[0];
Object.assign(resident,{indoors:true,home:0,roomX:603,roomY:600});
assert.equal(indoorWall.kick({x:600,y:600,angle:0,room:0,isRoomBlocked:()=>true}),null,
  'Contact kicks still respect indoor walls');
console.log('On-foot contact kicks passed for all creature types, headings and interior/exterior encounters');
