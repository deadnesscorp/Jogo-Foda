'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/game.js'),'utf8');
const layout=source.slice(source.indexOf('  function pointSegmentDistance('),source.indexOf('  function active()'));
let seed=1;
const math=Object.assign(Object.create(Math),{random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
const generate=new Function('Math','StreetStructures','Forest',`const world={w:12800,h:4800},bike={x:180,y:3300},cityProps=[],rubble=[],safeCabins=new Set();
const towers=[],streetHitboxes=[];const rebuildStreetHitboxes=()=>{};
const forest=Forest.create();
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const buildingDoor=i=>{const [x,y,w,h]=buildings[i];return {x:x+w*1.65*.7,y:y+h*1.65+12};};
let roads,branchRoads,buildings,supplies,fenceSegments,seed,urbanSpriteBytes,collisionGrid;
const urbanSpriteCache=new Map(),buildingGeometryCache=new Map(),buildingOpacities=new Map();
const random=()=>Math.random(),rebuildFenceHitboxes=()=>{},worldBlocked=()=>false;
${layout}
return ()=>{generateMapLayout();return {buildings,roads,branchRoads,nearAnyRoad,forest,cityProps,supplies};};`)(math,require('../src/street-structures.js'),require('../src/forest.js'));
for(let n=0;n<30;n++){
  seed=n+1;const {buildings,nearAnyRoad,forest,cityProps,supplies}=generate();
  const stations=buildings.map((b,i)=>({b,i})).filter(({b})=>b[4]==='station');
  assert(stations.length>=1&&stations.length<=5);
  for(const {b,i} of stations){
    assert(supplies[i].fuelUses>=1&&supplies[i].fuelUses<=5);
    assert.deepEqual(supplies[i].stock,{toolkit:1,water:1,ration:1});
    for(const {b:c,i:j} of stations)if(i!==j)assert(Math.hypot(b[0]+b[2]*.825-c[0]-c[2]*.825,b[1]+b[3]*.825-c[1]-c[3]*.825)>=2200);
  }
  assert.equal(buildings.length,160,'Keep all buildings and their stable indices');
  assert.equal(buildings[10][2],100,'Preserve the gas station index');
  for(let i=0;i<buildings.length;i++){
    const [x,y,w,h]=buildings[i];
    assert(forest.allowsBuilding(x,y,w,h,buildings[i][4]==='cabin'),'Entire footprint stays in its biome');
    assert(x>=70&&y>=70&&x+w*1.65<=12730&&y+h*1.65<=4730);
    assert(!nearAnyRoad(x+w*.825,y+h*.825,64+Math.hypot(w,h)*.825),'Keep the footprint clear of every road');
    for(let j=0;j<i;j++){
      const [a,b,c,d]=buildings[j];
      assert(!(x<a+c*1.65+48&&x+w*1.65+48>a&&y<b+d*1.65+48&&y+h*1.65+48>b),'Buildings must retain a gap');
    }
  }
}
// A dense visible block can exceed the background cache budget. It must stay
// cached across camera movement, then release its sprites after leaving view.
const cache=source.slice(source.indexOf('  const urbanSpriteCache='),source.indexOf('  function drawIsoBuilding('));
let rasters=0;
const painter={scale(){},imageSmoothingEnabled:false};
const document={createElement:()=>({width:0,height:0,getContext:()=>painter})};
const api=new Function('document','UrbanStructures',`const RENDER_SCALE=2,ctx={drawImage(){}};
${cache}
return {draw:drawUrbanBuildingSprite,visible:visibleUrbanSprites,trim:trimUrbanSpriteCache,get bytes(){return urbanSpriteBytes;},budget:URBAN_SPRITE_BUDGET};`)(document,{draw(){rasters++;}});
const shape=(x,y)=>{const w=198,h=171.6,k=Math.SQRT1_2;const base=[{x,y},{x:x+w*k,y:y+w*k*.5},{x:x+(w-h)*k,y:y+(w+h)*k*.5},{x:x-h*k,y:y+h*k*.5}];return {w,h,lift:143,base,roof:base.map(p=>({x:p.x,y:p.y-143}))};};
const indices=Array.from({length:24},(_,i)=>i===10?30:i);
indices.forEach(i=>api.visible.add(i));
indices.forEach(i=>api.draw(shape(100,100),i));
assert(api.bytes>api.budget,'Exercise a working set larger than the cache budget');
const coldRasters=rasters;
for(let frame=0;frame<10;frame++)indices.forEach(i=>api.draw(shape(100+frame*.25,100),i));
assert.equal(rasters,coldRasters,'Moving the camera must reuse every visible building sprite');
api.visible.clear();api.trim();assert(api.bytes<=api.budget,'Leaving the block restores the background memory budget');
console.log('City checks passed: 30 maps without overlaps; dense sprites reused across 10 frames; cache released offscreen.');
