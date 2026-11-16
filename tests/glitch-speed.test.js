'use strict';
const assert=require('node:assert/strict');
const api=require('../src/moss-creatures.js');

function travel({kind,sunRunner,night,indoors,pursuing}){
  const light={daylight:night?0:1},target={x:pursuing?640:1000,y:600};
  const model=api.createEcology({random:()=>.5,getBuildings:()=>[[10,10,30,30]],
    getSize:()=>({w:1600,h:1200}),isBlocked:()=>false,getShadows:()=>[]});
  model.reset(light,target);
  model.entities.splice(1);
  const entity=model.entities[0];
  Object.assign(entity,{kind,sunRunner,indoors,home:0,x:600,y:600,
    destination:{x:700,y:600},retarget:100,roomX:200,roomY:200,
    roomDestination:{x:300,y:200}});
  model.update(.1,{light,target,room:indoors?0:-1,
    roomTarget:indoors?{x:pursuing?225:350,y:200}:null,
    moveRoom:(point,dx,dy)=>{point.x+=dx;point.y+=dy;}});
  return indoors?Math.hypot(entity.roomX-200,entity.roomY-200):Math.hypot(entity.x-600,entity.y-600);
}

for(const kind of [0,1,2])for(const night of [false,true]){
  for(const indoors of [false,true])for(const pursuing of [false,true]){
    const options={kind,night,indoors,pursuing};
    const normal=travel({...options,sunRunner:false});
    const glitch=travel({...options,sunRunner:true});
    assert.ok(normal>0,'Encounter must exercise actual movement');
    assert.ok(Math.abs(glitch/normal-1.15)<1e-8,
      `Glitch variant moves 60% faster: ${JSON.stringify(options)}`);
  }
}
console.log('Glitch creatures move 15% faster for all types, indoors/outdoors, day/night and wandering/pursuit');
