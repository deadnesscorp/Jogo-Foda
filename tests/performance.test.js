const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const urban=require('../urban-structures.js');
const cache=source.slice(source.indexOf('  const urbanSpriteCache='),source.indexOf('  function drawIsoBuilding('));
let detailedDraws=0,commands=0,blits=0;
const context=()=>new Proxy({}, {get:(obj,key)=>obj[key]??(()=>{commands++;}),set:(obj,key,value)=>(obj[key]=value,true)});
const document={createElement(){return {width:0,height:0,getContext:context};}};
const ctx=context();ctx.drawImage=()=>blits++;
const model=new Function('document','ctx','UrbanStructures',`let RENDER_SCALE=2;${cache};return {draw:drawUrbanBuildingSprite,resize(){RENDER_SCALE=3;},get bytes(){return urbanSpriteBytes;},get count(){return urbanSpriteCache.size;}};`)(document,ctx,{draw(...args){detailedDraws++;urban.draw(...args);}});
const shape=(x=0,y=0)=>({w:132,h:99,lift:116,base:[{x,y},{x:x+90,y:y+45},{x:x+20,y:y+80},{x:x-70,y:y+35}],roof:[{x,y:y-116},{x:x+90,y:y-71},{x:x+20,y:y-36},{x:x-70,y:y-81}]});
model.draw(shape(),0);const first=commands;
for(let i=0;i<120;i++)model.draw(shape(i*.5,i*.25),0);
assert.equal(detailedDraws,1,'camera movement reuses the same detailed building art');
assert.equal(commands,first,'cached frames issue no detailed architecture commands');assert.equal(blits,121);
model.resize();model.draw(shape(),0);assert.equal(detailedDraws,2,'resolution changes rebuild the raster');
for(let i=0;i<160;i++)model.draw(shape(),i);
assert(model.bytes<=24*1024*1024,'cache stays within 24 MB');assert(model.count<160,'old buildings are evicted');
let baselineCommands=0;const baseline=new Proxy({}, {get:(o,k)=>o[k]??(()=>baselineCommands++),set:(o,k,v)=>(o[k]=v,true)});
for(let i=0;i<120;i++)urban.draw(baseline,shape(i*.5,i*.25),0);
console.log(`Building rendering: ${baselineCommands} detailed canvas calls -> 120 cached image draws across 120 moving-camera frames`);
const ecologySource=fs.readFileSync(path.join(__dirname,'../moss-creatures.js'),'utf8');
const old=ecologySource.replace('night=light.daylight<.28;regions=[];shadeLight=light;initialized=true;','night=light.daylight<.28;regions=night?[]:getShadows(light);shadeLight=light;initialized=true;')
  .replace('// Creatures no longer flee sunlight; shadow polygons are built on demand.','if(!night&&shadeClock<=0){regions=getShadows(light);shadeClock=.35;}');
function run(code){
  const box={module:{exports:{}},console};vm.runInNewContext(code,box);let seed=32,shadows=0;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const api=box.module.exports,m=api.createEcology({random,getBuildings:()=>[[20,20,40,40]],getSize:()=>({w:12800,h:4800}),isBlocked:()=>false,getShadows:()=>{shadows++;return [];}});
  const target={x:1200,y:2000};m.reset({daylight:1},target);
  for(let i=0;i<1200;i++)m.update(.05,{light:{daylight:1},target,sounds:[]});
  return {shadows,positions:JSON.stringify(m.entities.map(e=>[e.id,e.x,e.y,e.kind,e.behavior]))};
}
const before=run(old),after=run(ecologySource);assert.equal(after.positions,before.positions,'removing unused shadows preserves creature movement and spawning');
assert.equal(after.shadows,0);assert(before.shadows>100);
console.log(`Day simulation: ${before.shadows} unused shadow rebuilds -> 0 over 60 seconds; population and movement unchanged`);
