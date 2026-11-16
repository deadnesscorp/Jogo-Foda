const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/game.js'),'utf8');
const start=source.indexOf('  function drawRoomMoss('),end=source.indexOf('  function drawExploreSupply(',start);
const residents=Array.from({length:40},(_,i)=>({id:i,roomX:i*3,roomY:(i*47)%220,roomAngle:i*.2,roomPhase:i*.4}));
for(const y of [0,80,160,240]){
  const draws=[];
  const draw=new Function('mossRenderer','explorer','const ctx={};'+source.slice(start,end)+';return drawRoomMoss;')({draw:(ctx,e,...args)=>draws.push([e.id,...args])},{y});
  const sorted=residents.slice().sort((a,b)=>a.roomY-b.roomY);
  draw(true,sorted);draws.push('player');draw(false,sorted);
  const expected=[];
  for(const behind of [true,false]){
    for(const e of residents.slice().sort((a,b)=>a.roomY-b.roomY))if((e.roomY<=y)===behind)expected.push([e.id,e.roomX,e.roomY,e.roomAngle,e.roomPhase]);
    if(behind)expected.push('player');
  }
  assert.deepEqual(draws,expected);
}
console.log('Interior rendering: identical creature/player order across four player depths');
