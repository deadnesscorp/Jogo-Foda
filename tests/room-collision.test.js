const assert=require('node:assert/strict');
const fs=require('node:fs');
const RoomInteriors=require('../src/room-interiors.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/game.js'),'utf8');
const movement=source.slice(source.indexOf('  function moveExplorer('),source.indexOf('  function updateFootMovement('));
const move=new Function('RoomInteriors',`const interiorWalls=[];${movement};return moveExplorer;`)(RoomInteriors);
const radius=5.25;
// The old rectangular bounds accepted these points outside each diamond edge.
for(const [x,y] of [[100,120],[370,110],[100,260],[380,260]])assert(!RoomInteriors.contains(x,y));
for(const [x,y] of [[153,200],[322,211]])assert(RoomInteriors.contains(x,y,radius),'bed and supplies remain accessible');
// Exercise actual movement in every direction, including a large knockback step.
for(let direction=0;direction<32;direction++){
  const actor={x:230,y:188},angle=direction*Math.PI/16;
  for(let step=0;step<80;step++){
    move(actor,Math.cos(angle)*12,Math.sin(angle)*12,radius);
    assert(RoomInteriors.contains(actor.x,actor.y,radius),'feet remain inside every wall');
  }
  move(actor,Math.cos(angle)*1000,Math.sin(angle)*1000,radius);
  assert(RoomInteriors.contains(actor.x,actor.y,radius),'large steps cannot cross walls');
}
const actor={x:83,y:198};
move(actor,0,0,radius);
assert(Math.hypot(actor.x-78,actor.y-200)<42,'spawn can still use the exit');
const before={...actor};move(actor,20,0,radius);
assert(Math.hypot(actor.x-before.x,actor.y-before.y)>1,'character can slide along a boundary');
const outside={x:140,y:270};move(outside,0,0,radius);
assert(RoomInteriors.contains(outside.x,outside.y,radius),'old out-of-bounds positions recover');
console.log('Room collision: four walls, 32 directions, knockback, sliding, exit and recovery passed');
