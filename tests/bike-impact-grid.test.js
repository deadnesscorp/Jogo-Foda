const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
const collision=source.slice(source.indexOf('  function nearbyCollisionCells('),source.indexOf('  function nearbyBuilding('));
const damage=source.slice(source.indexOf('  function bikeImpactDamage('),source.indexOf('  function applyBikeImpact('));
const buildings=Array.from({length:100},(_,i)=>[50+i%10*450,50+Math.floor(i/10)*350,70,60]);
const fences=[[250,220,0,0,80,3,Math.PI/4],[800,400,-12,3,60,2,-Math.PI/3]];
const model=new Function('buildings','fenceHitboxes',`let collisionGrid=null;${collision}${damage};return {worldBlocked,obstacleClearance,bikeImpactDamage,nearbyCollisionCells,invalidate(){collisionGrid=null;}};`)(buildings,fences);
function reference(x,y,r){
  for(const [bx,by,w,h] of buildings){
    const nx=Math.max(bx,Math.min(x,bx+w*1.65)),ny=Math.max(by,Math.min(y,by+h*1.65));
    if((x-nx)**2+(y-ny)**2<r*r)return true;
  }
  for(const [fx,fy,rx,ry,w,h,a] of fences){
    const dx=x-fx,dy=y-fy,lx=dx*Math.cos(a)+dy*Math.sin(a),ly=-dx*Math.sin(a)+dy*Math.cos(a);
    if((lx-Math.max(rx,Math.min(lx,rx+w)))**2+(ly-Math.max(ry,Math.min(ly,ry+h)))**2<r*r)return true;
  }
  return false;
}
let seed=8;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;i<12000;i++){
  const x=random()*5000,y=random()*4000,r=1+random()*80;
  assert.equal(model.worldBlocked(x,y,r),reference(x,y,r),`collision ${x},${y},${r}`);
}
for(const [fx,fy,rx,ry,w,h,a] of fences)for(let i=0;i<100;i++){
  const x=fx+random()*150-50,y=fy+random()*150-50;
  assert.equal(model.worldBlocked(x,y,7.2),reference(x,y,7.2),'rotated fence');
}
assert.equal(model.obstacleClearance(40,70,5),5);
assert.equal(model.obstacleClearance(60,70,5),0);
assert(model.bikeImpactDamage(180)>model.bikeImpactDamage(60)*4);
assert(model.bikeImpactDamage(100,0)>model.bikeImpactDamage(100,60));
assert(model.nearbyCollisionCells(60,70,8).flat().length<buildings.length/5,'checks only nearby obstacles');
buildings.splice(0,buildings.length,[1000,1000,30,30]);model.invalidate();
assert.equal(model.worldBlocked(60,70,8),false,'new map clears old collisions');
assert.equal(model.worldBlocked(1010,1010,8),true);
console.log('Collision grid matches 12,200 reference queries; impact scaling, clearance and map reset passed');
