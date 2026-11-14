'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const street=require('../src/street-structures.js');
const source=fs.readFileSync(path.join(__dirname,'../src/game.js'),'utf8');
const collision=source.slice(source.indexOf('  function nearbyCollisionCells('),source.indexOf('  function nearbyBuilding('));
const props=street.TYPES.map((_,kind)=>({x:200+kind*200,y:200,kind,angle:kind*Math.PI/4}));
const hitboxes=props.map(street.footprint);
const rebuildSource=source.slice(source.indexOf('  function rebuildStreetHitboxes('),source.indexOf('  let seed =',source.indexOf('  function rebuildStreetHitboxes(')));
const registry=new Function('StreetStructures',`const streetHitboxes=[],cityProps=[],towers=[{x:900,y:300}];let collisionGrid={};${rebuildSource};return {streetHitboxes,cityProps,towers,rebuild:rebuildStreetHitboxes,get grid(){return collisionGrid;}};`)(street);
registry.cityProps.push(props[0]);registry.rebuild();
assert.equal(registry.streetHitboxes.length,1,'Map generation excludes old terminal locations');
registry.towers[0].x=1100;registry.rebuild(true);
assert.equal(registry.streetHitboxes.length,2,'Register terminals only after their new spawn positions are known');
assert.equal(registry.streetHitboxes[1][0],1100);
assert.equal(registry.grid,null,'Changing street furniture invalidates the collision grid');
const model=new Function('streetHitboxes',`const buildings=[],fenceHitboxes=[];let collisionGrid=null;${collision};return {worldBlocked,obstacleClearance,invalidate(){collisionGrid=null;}};`)(hitboxes);
function world(prop,x,y){const c=Math.cos(prop.angle),s=Math.sin(prop.angle);return {x:prop.x+x*c-y*s,y:prop.y+x*s+y*c};}
for(const prop of props){
  const type=street.TYPES[prop.kind];
  assert(model.worldBlocked(prop.x,prop.y,1),'The structure has a solid base');
  for(const [x,y] of [[type.width/2-1,0],[-type.width/2+1,0],[0,type.depth/2-1],[0,-type.depth/2+1]]){
    const p=world(prop,x,y);assert(model.worldBlocked(p.x,p.y,.5),'Rotated footprint edges collide');
  }
  for(const [x,y] of [[type.width/2+3,0],[-type.width/2-3,0],[0,type.depth/2+3],[0,-type.depth/2-3]]){
    const p=world(prop,x,y);assert(!model.worldBlocked(p.x,p.y,1),'Space outside the base remains open');
  }
}
assert(!model.worldBlocked(props[1].x+20,props[1].y,1),'The lamp arm does not create a floating wall');
assert(!model.worldBlocked(props[4].x+36,props[4].y,5),'A terminal can be approached within interaction range');
// Compare the spatial grid with an independent oriented-rectangle reference.
let seed=14;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;i<3000;i++){
  const prop=props[i%props.length],x=prop.x+(random()-.5)*160,y=prop.y+(random()-.5)*160,r=1+random()*12;
  const expected=hitboxes.some(([px,py,l,t,w,d,a])=>{
    const dx=x-px,dy=y-py,u=dx*Math.cos(a)+dy*Math.sin(a),v=-dx*Math.sin(a)+dy*Math.cos(a);
    return (u-Math.max(l,Math.min(l+w,u)))**2+(v-Math.max(t,Math.min(t+d,v)))**2<r*r;
  });
  assert.equal(model.worldBlocked(x,y,r),expected);
}
const fence=street.fenceParts(180),fenceRects=fence.map(p=>[120,600,p.x,p.y,p.w,p.d,0]);
hitboxes.push(...fenceRects);model.invalidate();
assert(model.worldBlocked(121,600,1),'Fence post blocks movement');
assert(!model.worldBlocked(158,600,2),'Broken fence section remains passable');
assert(model.worldBlocked(185,600,1),'Raised rail blocks crossing the intact fence');
let operations=0;
const painter=new Proxy({}, {get:(_,name)=>(...args)=>{
  for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),name+' receives finite coordinates');
  operations++;
},set:()=>true});
for(let kind=0;kind<5;kind++)for(let i=0;i<8;i++)street.drawRaw(painter,{kind,tint:i%3,angle:i*Math.PI/4,disabled:i%2===0});
street.drawFence(painter,[0,0,180,Math.PI/4],(x,y)=>({x:(x-y)*Math.SQRT1_2,y:(x+y)*Math.SQRT1_2*.5}));
assert(operations>1000,'All visual variants render their details');
// Check that furniture does not bring back per-frame detailed rendering.
let canvases=0;
global.document={createElement(){canvases++;return {getContext:()=>painter,width:0,height:0};}};
for(let i=0;i<120;i++)street.draw(painter,{kind:0,tint:1,angle:Math.PI/4},{x:i/4,y:100},2);
assert.equal(canvases,1,'Camera motion reuses the cached artwork');
delete global.document;
hitboxes.length=0;model.invalidate();assert(!model.worldBlocked(props[0].x,props[0].y,1),'Rebuilding the grid removes old furniture');
console.log('Street structures: five rotated footprints, 3,000 grid comparisons, fence gaps, 40 visual variants and sprite reuse passed.');
