const assert=require('node:assert/strict');
const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
const drawing=source.slice(source.indexOf('  function drawBikeExhaust('),source.indexOf('  function drawBike(',source.indexOf('  function drawBikeExhaust(')));
const create=new Function(`
  let bikeEngineRunning=false,fuel=100,bikeLife=100,bikeRpm=1000;
  const ACTOR_VISUAL_SCALE=.75,ctx={save(){},restore(){},beginPath(){},ellipse(){},fill(){}};
  ${drawing}
  return {draw:drawBikeExhaust,on(){bikeEngineRunning=true;},off(){bikeEngineRunning=false;},rev(){bikeRpm=7000;},empty(){fuel=0;}};
`);
function simulate(api,facing,start,end,angle=0,speed=0){for(let t=start;t<end;t+=.02)api.draw(100,100,angle,speed,t,facing);}
const api=create(),facing={};
simulate(api,facing,0,1);assert.equal(facing.exhaustPuffs.length,0);
api.on();simulate(api,facing,1,2);assert(facing.exhaustPuffs.length>0);
assert(facing.exhaustPuffs.every(p=>p.y>0),'smoke starts behind north-facing motorcycle');
const idleCount=facing.exhaustPuffs.length;
api.rev();simulate(api,facing,2,4);assert(facing.exhaustPuffs.length>idleCount);
assert(facing.exhaustPuffs.length<=32);
api.off();simulate(api,facing,4,6);assert.equal(facing.exhaustPuffs.length,0);
api.on();api.empty();simulate(api,facing,6,7);assert.equal(facing.exhaustPuffs.length,0);
console.log('Exhaust emission, RPM, particle bounds, shutdown and fuel checks passed');
