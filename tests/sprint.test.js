// Run with: node tests/sprint.test.js
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
const helper=source.slice(source.indexOf('  const FOOT_WALK_KMH='),source.indexOf('  function drawSurvivorSprite('));
const frameStart=source.indexOf('  function frame(now)');
const movement=source.slice(source.indexOf("    if (state === 'explore') {",frameStart),source.indexOf("    if (state === 'drive' && !mounted)",frameStart));
const move=new Function('held','position','dt',`
  let state='explore',mounted=false,exploreStep=0;
  const BIKE_SPEED_TO_KMH=.52,hunger=100,thirst=100,ACTOR_VISUAL_SCALE=.75;
  const keys=new Set(held),explorer={hp:3,invulnerable:1,...position};
  const interiorWalls=[{x:142,y:111,w:10,h:77}],interiorHazards=[];
  ${helper}
  ${movement}
  return explorer;
`);
let checks=0;
function check(ok,message){checks++;if(!ok)throw Error(message);}
const start={x:83,y:198},walk=move(['d'],start,.04),run=move(['d','shift'],start,.04);
check(Math.abs((walk.x-start.x)/.04*.52-20)<1e-8,'Walking is calibrated to 20 km/h');
check(Math.abs((run.x-start.x)/.04*.52-40)<1e-8,'Shift runs at 40 km/h');
const stopped=move(['shift'],start,.04);
check(stopped.x===start.x&&stopped.y===start.y,'Shift without movement does not move the character');
const wall={x:134.9,y:150},blocked=move(['d','shift'],wall,.045);
check(blocked.x===wall.x&&blocked.y===wall.y,'Sprinting keeps the character outside walls at maximum frame time');
const bounds=move(['d','s','shift'],{x:407.9,y:279.9},.045);
check(bounds.x===408&&bounds.y===280,'Sprinting respects room boundaries');
const arrows=move(['arrowup','shift'],start,.04);
check(Math.abs(arrows.y-(start.y-40/.52*.04))<1e-8,'Arrow keys support the same calibrated sprint speed');
for(const held of [['d','s'],['d','s','shift'],['arrowup','arrowleft','shift']]){
  const diagonal=move(held,start,.04),kmh=Math.hypot(diagonal.x-start.x,diagonal.y-start.y)/.04*.52;
  check(Math.abs(kmh-(held.includes('shift')?40:20))<1e-8,'Diagonal movement keeps the same speed as cardinal movement');
}
console.log(checks+' sprint checks passed');
