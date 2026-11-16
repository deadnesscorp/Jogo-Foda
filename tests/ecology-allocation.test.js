const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/moss-creatures.js'),'utf8');
// Reconstruct the previous allocation/scan strategy while keeping identical gameplay rules.
const baseline=source.replace('      snapshotPositions();','      const positions=new Map(entities.map(entity=>[entity,{x:entity.x,y:entity.y}]));')
  .replace('const pack=hunters.filter(', 'const pack=entities.filter(')
  .replace('for(const other of brutes){','for(const other of entities){');
function create(code,seed){
  let allocations=0,maps=0;const seen=new WeakSet();
  class CountedMap extends Map{
    constructor(...args){super(...args);maps++;}
    set(key,value){if(key&&typeof key==='object'&&value&&typeof value==='object'&&'x' in value&&!seen.has(value)){seen.add(value);allocations++;}return super.set(key,value);}
  }
  const box={module:{exports:{}},Map:CountedMap};vm.runInNewContext(code,box);
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const buildings=Array.from({length:160},(_,i)=>[300+i%20*540,200+Math.floor(i/20)*490,60,50]);
  const ecology=box.module.exports.createEcology({random,getBuildings:()=>buildings,getSize:()=>({w:12800,h:4800}),
    isBlocked:(x,y)=>x>5500&&x<5530&&y>1800&&y<2400,getShadows:()=>[]});
  return {ecology,get allocations(){return allocations;},get maps(){return maps;}};
}
let before=0,after=0,maxPopulation=0;
for(const seed of [7,32,91]){
  const old=create(baseline,seed),now=create(source,seed);
  for(let frame=0;frame<1800;frame++){
    const light={daylight:frame<950||frame>=1300?0:1};
    const target={x:3200+Math.sin(frame*.012)*400,y:2200+Math.cos(frame*.009)*250,angle:frame*.01};
    const room=frame>=700&&frame<850?0:-1;
    const args={light,target,room,roomTarget:{x:180,y:180},moveRoom:(a,dx,dy)=>{a.x+=dx;a.y+=dy;},
      sounds:[{...target,radius:300,room,kind:frame%3?'running':'bait',player:frame%3!==0}]};
    if(frame===1250){old.ecology.reset(light,target);now.ecology.reset(light,target);}
    if(frame%151===0){const kick={...target,range:60,angle:target.angle,room};old.ecology.kick(kick);now.ecology.kick(kick);}
    old.ecology.update(.1,args);now.ecology.update(.1,args);
    assert.equal(JSON.stringify(now.ecology.entities),JSON.stringify(old.ecology.entities),'Exact state at seed '+seed+', frame '+frame);
    assert.equal(now.ecology.glitch,old.ecology.glitch);maxPopulation=Math.max(maxPopulation,now.ecology.entities.length);
  }
  assert(now.maps<old.maps/100,'Map allocations fall without changing simulation');
  before+=old.allocations;after+=now.allocations;
}
assert(maxPopulation>30,'Exercise dense night populations');assert(after<before/100);
console.log('Ecology: '+before+' temporary position objects -> '+after+' reused snapshots; identical states across 5,400 frames, day/night, rooms, kicks and reset');
