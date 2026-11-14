// Run with: node tests/bike-drag.test.js
const fs=require('node:fs'),path=require('node:path'),healthAPI=require('../character-health.js');
const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
const dragging=source.slice(source.indexOf('  function stopBikeDrag()'),source.indexOf('  function randomizeTowerSpawns()'));
const walking=source.slice(source.indexOf('  const FOOT_WALK_KMH='),source.indexOf('  function drawSurvivorSprite('));
function create({blocked=()=>false,health=healthAPI.create(),fuel=68,life=100,engineRunning=true}={}){
  return new Function('worldBlocked','characterHealth','fuel','bikeLife','engineRunning',`
    let state='drive',mounted=false,checkpointReturn=null,bikeInspectOpen=false,bikeService=null,playerKnockdown=0;
    let bikeDragging=false,bikeDragSpeed=0,bikeEngineRunning=engineRunning,bikeRpm=engineRunning?1000:0;
    const healthPanel={open:false},keys=new Set(),world={w:500,h:500},shelterLife={speed:1};
    const ACTOR_VISUAL_SCALE=.6,BIKE_SPEED_TO_KMH=.52,hunger=100,thirst=100;
    const bike={x:100,y:100,angle:0,wheel:0,speed:0,steering:0,bank:0};
    const player={x:100,y:119,angle:0,gait:null},spriteAtlas={survivor:{walk:{directions:8,frameCount:8,fps:10}}};
    const setToast=()=>{},distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    ${dragging}
    ${walking}
    return {bike,player,keys,healthPanel,start:startBikeDrag,stop:stopBikeDrag,move:moveDraggedBike,
      get dragging(){return bikeDragging;},get engine(){return bikeEngineRunning;},get fuel(){return fuel;},
      mount(){mounted=true;},state(value){state=value;},
      tick(dt,held=['d']){
        keys.clear();held.forEach(key=>keys.add(key));if(bikeDragging)keys.add('g');
        updateFootMovement(player,dt,moveDraggedBike,undefined,.75*characterHealth.status().dexterity);
      }};
  `)(blocked,health,fuel,life,engineRunning);
}
let checks=0;const check=(ok,message)=>{checks++;if(!ok)throw Error(message);};
const normal=create();
check(normal.start()&&normal.dragging&&normal.keys.has('g'),'G grabs a nearby bike');
check(normal.engine&&normal.bike.speed===0,'grabbing preserves a running engine and starts manual movement at rest');
for(let i=0;i<60;i++)normal.tick(1/60);
check(normal.bike.x>110&&normal.player.x===normal.bike.x&&normal.player.y-normal.bike.y===19,'player and bike move together without stretching their grip');
check(normal.bike.wheel>0&&normal.bike.angle>0,'wheels roll and the bike turns toward its travel');
check(normal.fuel===68,'manual dragging consumes no fuel');
check(normal.engine,'moving the bike manually keeps the motor running');
normal.stop();check(!normal.dragging&&!normal.keys.has('g'),'release clears the grip');
check(normal.engine,'releasing the bike leaves a running engine on');
const engineOff=create({engineRunning:false});engineOff.start();engineOff.tick(.05);
check(!engineOff.engine&&engineOff.bike.x>100,'an engine-off bike can still be dragged without starting its motor');
const broken=create({fuel:0,life:0});check(broken.start(),'an empty and broken bike can still be dragged');
broken.tick(.05);check(broken.bike.x>100,'manual movement works without fuel or integrity');
const distant=create();distant.player.x=200;
check(!distant.start()&&distant.engine,'cannot remotely grab a bike or change its engine');
const mounted=create();mounted.mount();check(!mounted.start(),'cannot drag while riding');
const indoor=create();indoor.state('explore');check(!indoor.start(),'cannot drag the road bike from indoors');
const caring=create();caring.healthPanel.open=true;check(!caring.start(),'care menu does not allow grabbing');
const wall=create({blocked:(x,y,r)=>x+r>120&&x-r<125&&y+r>90&&y-r<108});wall.start();
for(let i=0;i<180;i++)wall.tick(1/60);
check(wall.bike.x<=112.8+1e-6,'bike collision blocks movement even when the player clears the wall');
check(wall.player.x===wall.bike.x&&wall.player.y-wall.bike.y===19,'blocked bike cannot be pulled through a wall by the player');
const tunnel=create({blocked:(x,y,r)=>x+r>120&&x-r<121});tunnel.start();tunnel.move(tunnel.player,100,0,4.2);
check(tunnel.bike.x<120,'large movements cannot tunnel through thin fences');
const edge=create();Object.assign(edge.bike,{x:20,y:100});Object.assign(edge.player,{x:20,y:119});edge.start();edge.move(edge.player,-100,0,4.2);
check(edge.bike.x>=18&&edge.player.x>=18,'both bodies respect world bounds');
const shifted=create();shifted.start();for(let i=0;i<60;i++)shifted.tick(1/60,['d','shift']);
check(Math.abs(shifted.bike.x-normal.bike.x)<1e-8,'Shift cannot sprint while dragging');
const injuredHealth=healthAPI.create();injuredHealth.injure('leftArm','fracture',1.5);
const injured=create({health:injuredHealth});injured.start();for(let i=0;i<60;i++)injured.tick(1/60);
check(injured.bike.x<normal.bike.x,'arm injuries slow manual dragging');
function atRate(hz){const model=create();model.start();for(let i=0;i<hz;i++)model.tick(1/hz);return model.bike.x;}
check(Math.abs(atRate(30)-atRate(144))<.01,'manual travel remains consistent across frame rates');
console.log(checks+' bike-drag checks passed');
