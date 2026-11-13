// Run with: node tests/creature-combat.test.js
const fs=require('node:fs'),path=require('node:path');
const api=require('../moss-creatures.js'),healthAPI=require('../character-health.js');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const combat=source.slice(source.indexOf('  function creatureCanHit('),source.indexOf('  function selectedBikePart('));
const damage=source.slice(source.indexOf('  function damageBikePart('),source.indexOf('  function updateBikeCondition('));
function create({riding=true,roll=0,blocked=()=>false,room=false,engine=true}={}){
  const math=Object.create(Math);math.random=()=>roll;
  const moss={...api,attackOutcome:(kind,options)=>api.attackOutcome(kind,{...options,random:()=>roll})};
  return new Function('MossCreatures','CharacterHealth','Math','worldBlocked','mounted','bikeEngineRunning','inRoom',`
    let state=inRoom?'explore':'drive',checkpointReturn=null,exploreBuilding=1;
    let creatureHitCooldown=0,creatureBikeCooldown=0,playerKnockdown=0,knockdownAngle=0;
    let bikeLife=100,bikeRpm=1000,bikeInspectOpen=false,bikeService=null,bikeDragging=false,flash=0;
    const bike={x:200,y:200,angle:0,speed:50,steering:0,bank:0};
    const player={x:200,y:200,gait:null},explorer={x:200,y:200},world={w:500,h:500},ACTOR_VISUAL_SCALE=.6;
    const keys=new Set(),interiorWalls=[],mossEcology={entities:[]},notices=[];
    const characterHealth=CharacterHealth.create(),healthPanel={setOpen(){}},ignition={active:false,close(){}};
    const bikeParts={motor:100,handlebar:100,frontTire:100,rearTire:100};
    const bikePartNames={motor:'MOTOR',handlebar:'GUIDÃO',frontTire:'PNEU DIANTEIRO',rearTire:'PNEU TRASEIRO'};
    const bikeFaults=Object.fromEntries(Object.keys(bikeParts).map(part=>[part,[100,100,100,100]]));
    const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),setToast=message=>notices.push(message);
    const stopBikeDrag=()=>{bikeDragging=false;},updateObjective=()=>{};
    ${damage}
    ${combat}
    return {bike,player,explorer,health:characterHealth,bikeParts,bikeFaults,interiorWalls,notices,
      attack(kind,options={}){const e={kind,x:190,y:200,roomX:190,roomY:200,home:1,indoors:inRoom,behavior:'chase',pursuingPlayer:true,...options};mossEcology.entities=[e];updateCreatureCombat();return e;},
      update:updateCreatureCombat,
      get mounted(){return mounted;},get life(){return bikeLife;},get down(){return playerKnockdown;},get engine(){return bikeEngineRunning;},
      get cooldown(){return creatureHitCooldown;}};
  `)(moss,healthAPI,math,blocked,riding,engine,room);
}
let checks=0;const check=(ok,message)=>{checks++;if(!ok)throw Error(message);};
const [tall,quad,brute]=api.TYPES;
check(quad.nightSpeed>tall.nightSpeed&&tall.nightSpeed>brute.nightSpeed,'quadruped is fastest and brute is slowest');
check(quad.damage<tall.damage&&tall.damage<brute.damage,'the three creatures have increasing rider damage');
check(quad.bikeDamage<tall.bikeDamage&&tall.bikeDamage<brute.bikeDamage,'brute deals the heaviest motorcycle damage');
for(let kind=0;kind<3;kind++){
  const p=api.TYPES[kind];
  check(api.attackOutcome(kind,{mounted:true,random:()=>0}).knockedOff,'each creature can knock down a rider');
  check(!api.attackOutcome(kind,{mounted:true,random:()=>p.knockOffChance}).knockedOff,'knockdown probability respects its upper boundary');
  check(!api.attackOutcome(kind,{mounted:false,random:()=>0}).knockedOff,'foot attacks never produce a motorcycle fall');
  const rider=create();rider.attack(kind);
  check(!rider.mounted&&rider.down>0&&rider.bike.speed===0,'successful attack removes the rider and briefly stuns them');
  check(rider.life<100&&Object.values(rider.bikeParts).some(v=>v<100),'attacks damage real bike integrity and repairable components');
  check(rider.health.status().wounds===1&&rider.health.status().health<100,'rider receives a real body injury');
  check(rider.engine,'a fall does not arbitrarily switch off an intact engine');
  const before=rider.health.status().health,life=rider.life;rider.update();
  check(rider.health.status().health===before&&rider.life===life,'the same overlap cannot deal damage every frame');
  const steady=create({roll:.99});steady.attack(kind);
  check(steady.mounted&&steady.life<100&&steady.health.status().wounds===1,'a resisted knockdown still damages pilot and motorcycle');
}
const light=create({riding:false});light.attack(1);
const heavy=create({riding:false});heavy.attack(2);
check(heavy.health.status().health<light.health.status().health-15,'brute injuries are substantially more dangerous than quadruped cuts');
check(Object.values(heavy.health.parts).some(part=>part.wound?.type==='fracture'),'brute causes fractures');
const slasher=create({riding:false});slasher.attack(0);
check(Object.values(slasher.health.parts).some(part=>part.wound?.type==='deep'),'tall hunter opens deep wounds');
const far=create();far.attack(2,{x:400,y:400});check(far.life===100&&far.health.status().wounds===0,'creatures cannot hit at a distance');
const wall=create({blocked:(x,y)=>x>=194&&x<=196});wall.attack(2);
check(wall.life===100&&wall.health.status().wounds===0,'walls block creature attacks');
const safeFall=create({blocked:x=>x>205});safeFall.attack(2);
check(!safeFall.mounted&&safeFall.player.x<=205,'fall placement avoids walls instead of throwing the player through them');
const parked=create({riding:false});parked.player.x=400;parked.player.y=400;parked.attack(2);
check(parked.life<100&&parked.health.status().wounds===0&&parked.down===0,'an attracted creature can damage a parked bike without injuring a distant player');
const quiet=create({riding:false,engine:false});quiet.player.x=400;quiet.player.y=400;quiet.attack(2,{behavior:'wander',pursuingPlayer:false});
check(quiet.life===100,'passive wandering does not damage a silent parked bike');
const room=create({riding:false,room:true});room.interiorWalls.push({x:194,y:190,w:2,h:20});room.attack(0);
check(room.health.status().wounds===0,'interior walls also stop melee damage');
const otherRoom=create({riding:false,room:true});otherRoom.attack(0,{home:2});
check(otherRoom.health.status().wounds===0,'creatures in another room cannot hit the player');
console.log(checks+' creature-combat checks passed');
