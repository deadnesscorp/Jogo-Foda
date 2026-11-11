// Run with: node tests/sprint.test.js
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');
const helper=source.slice(source.indexOf('  const FOOT_WALK_KMH='),source.indexOf('  function drawSurvivorSprite('));
const createWorld=new Function('position',`
  let state='explore',mounted=false;
  const BIKE_SPEED_TO_KMH=.52,hunger=100,thirst=100,ACTOR_VISUAL_SCALE=.75;
  const keys=new Set(),actor={...position};
  const interiorWalls=[{x:142,y:111,w:10,h:77}];
  const walk={directions:8,frameCount:8,fps:10},spriteAtlas={survivor:{walk}};
  ${helper}
  return {actor,walk,updateFootGait,createFootGait,advanceFootPhase,footFrameIndex,footAtlasFrame,
    tick(dt,held){keys.clear();held.forEach(key=>keys.add(key));updateFootMovement(actor,dt,moveExplorer);}};
`);
let checks=0;
function check(ok,message){checks++;if(!ok)throw Error(message);}
const start={x:83,y:198};
function simulate(hz,segments,position=start){
  const world=createWorld(position);
  for(const [seconds,keys] of segments){
    for(let i=0;i<Math.round(seconds*hz);i++)world.tick(1/hz,keys);
  }
  return world.actor;
}

const walk=simulate(60,[[.5,['d']]]),run=simulate(60,[[.5,['d','shift']]]);
check(Math.abs(walk.gait.vx*.52-16)<.001,'Walking approaches 16 km/h');
check(Math.abs(run.gait.vx*.52-40)<.001,'Running approaches 40 km/h');
const stopped=simulate(60,[[.5,['shift']]]);
check(stopped.x===start.x&&stopped.gait.stage==='idle','Shift alone keeps the character idle');
const wall={x:136.75,y:150},blocked=simulate(60,[[.5,['d','shift']]],wall);
check(blocked.x===wall.x&&blocked.gait.vx===0&&blocked.gait.phase===0,'A wall cancels blocked velocity and prevents steps in place');
const bounds=simulate(60,[[.5,['d','s','shift']]],{x:407.9,y:279.9});
check(bounds.x===408&&bounds.y===280,'Sprinting respects room boundaries');
const arrows=simulate(60,[[.5,['arrowup','shift']]]);
check(Math.abs(arrows.gait.vy*.52+40)<.001,'Arrow keys support the calibrated run speed');
const diagonal=simulate(60,[[.5,['d','s','shift']]]);
check(Math.abs(Math.hypot(diagonal.gait.vx,diagonal.gait.vy)-run.gait.vx)<1e-8,'Diagonal input preserves speed');

const segments=[[.5,['d']],[.5,['d','shift']],[.5,['d']],[.5,[]]];
const at60=simulate(60,segments);
for(const hz of [30,120,144]){
  const actor=simulate(hz,segments);
  check(Math.abs(actor.x-at60.x)<.05,'Travel is consistent at '+hz+' Hz');
  check(actor.gait.stage==='idle'&&actor.gait.phase===at60.gait.phase,'Stopping finds the same contact pose at '+hz+' Hz');
}
const world=createWorld(start);
const {actor}=world,dt=1/60;
world.tick(dt,['d']);
check(actor.x>start.x&&actor.gait.vx<16/.52,'Movement starts immediately with a velocity ramp');
for(let i=0;i<24;i++)world.tick(dt,['d']);
const beforeRun=actor.gait.phase;
world.tick(dt,['d','shift']);
check(actor.gait.vx>16/.52&&actor.gait.vx<40/.52,'Shift ramps toward running speed');
check((actor.gait.phase-beforeRun+8)%8<1,'Entering a sprint preserves the current phase');
const beforeRelease=actor.gait.vx;
world.tick(dt,['d']);
check(actor.gait.vx<beforeRelease&&actor.gait.vx>16/.52,'Releasing Shift eases back to walking speed');
const beforeTurn=actor.gait.phase;
for(let i=0;i<12;i++)world.tick(dt,['d','s']);
check(actor.gait.heading===3&&actor.gait.phase!==beforeTurn,'A diagonal turn selects the authored diagonal and advances the same cycle');

const {walk:art,createFootGait,updateFootGait}=world;
for(const run of [0,1]){
  const seam=world.advanceFootPhase(7,.91-.3*run,8,run);
  check(seam>0&&seam<.05,'The last pose hands off promptly to the first');
  const phase=world.advanceFootPhase(0,8,8,run);
  check(Math.min(phase,8-phase)<1e-8,'The seam adjustment preserves total stride distance');
}
check(world.advanceFootPhase(0,1.05,8,0)<1&&world.advanceFootPhase(1,1.05,8,0)>2,
  'The walk lingers at foot contact and moves more quickly through recovery');
const gait=createFootGait(),visited=new Set();
for(let i=0;i<72;i++){
  const previous=Math.floor(gait.phase);
  updateFootGait(gait,(40/.52)/30,Math.PI/2,20/.52,1/30,art,true);
  const frame=Math.floor(gait.phase);
  check((frame-previous+8)%8<=1,'Sprint frames remain in order at 30 Hz');
  visited.add(frame);
}
check(visited.size===8,'All eight source frames play during a sprint');
const expandedArt={...art,frameCount:16,fps:20,pingPong:true};
for(const running of [false,true]){
  const expanded=createFootGait(),frames=new Set();
  for(let i=0;i<90;i++){
    const before=world.footFrameIndex(expanded.phase,16,expanded.pingPong),speed=(running?40:20)/.52;
    updateFootGait(expanded,speed/30,Math.PI/2,20/.52,1/30,expandedArt,running);
    const after=world.footFrameIndex(expanded.phase,16,expanded.pingPong);
    check((running?(after-before+16)%16:Math.abs(after-before))<=1,'The expanded cycle does not skip frames at 30 Hz');
    frames.add(after);
  }
  check(frames.size===16,'All sixteen frames play at the configured pace');
}
const expandedStop=createFootGait();
expandedStop.stage='loop';
expandedStop.phase=2.5;
updateFootGait(expandedStop,0,0,20/.52,1/60,expandedArt);
check(expandedStop.phase-2.5<.28,'The 16-frame walk settles near its walking cadence');
const outAndBack=createFootGait(),sequence=[0];
for(let i=0;i<150;i++){
  updateFootGait(outAndBack,(20/.52)/60,Math.PI/2,20/.52,1/60,expandedArt);
  const frame=world.footFrameIndex(outAndBack.phase,16,outAndBack.pingPong);
  if(frame!==sequence.at(-1))sequence.push(frame);
}
const expected=Array.from({length:31},(_,phase)=>Math.min(phase,30-phase));
check(sequence.slice(0,31).join(',')===expected.join(','),'Walking plays 0 through 15 and back to 0 without a jump');
check(world.advanceFootPhase(15,.5,16,0,true)===15.5&&world.advanceFootPhase(29.75,.5,16,0,true)===.25,
  'The walking phase spends the same time at the endpoints as the other poses');
outAndBack.phase=20.2;
updateFootGait(outAndBack,(40/.52)/60,Math.PI/2,20/.52,1/60,expandedArt,true);
check(!outAndBack.pingPong&&Math.floor(outAndBack.phase)===10,'Shift preserves the current pose on the return half of the cycle');
const detailedWalk={...expandedArt,frameCount:24,fps:30,playbackFps:13,runFrames:Array.from({length:24},(_,i)=>i).filter(i=>i%3!==1)};
const detailed=createFootGait(),detailedSequence=[0];
for(let i=0;i<130;i++){
  updateFootGait(detailed,(20/.52)/30,Math.PI/2,20/.52,1/30,detailedWalk);
  const frame=world.footAtlasFrame(detailed.phase,detailedWalk,false,true);
  if(frame!==detailedSequence.at(-1))detailedSequence.push(frame);
}
const detailedExpected=Array.from({length:47},(_,phase)=>Math.min(phase,46-phase));
check(detailedSequence.slice(0,47).join(',')===detailedExpected.join(','),'The 24-frame walk uses every pose in both directions at 30 Hz');
detailed.phase=0;
for(let i=0;i<60;i++)updateFootGait(detailed,(20/.52)/60,Math.PI/2,20/.52,1/60,detailedWalk);
check(Math.abs(detailed.phase-13)<1e-8,'The walking cadence advances 13 frames per second at normal pace');
const detailedStart=createFootGait();
updateFootGait(detailedStart,(20/.52)/60,Math.PI/2,20/.52,1/60,detailedWalk);
check(Math.abs(detailedStart.phase-13/60)<1e-8,'Walking starts the cycle without an additional timing penalty');
const detailedFinish={...detailedStart,stage:'loop',phase:3};
updateFootGait(detailedFinish,0,0,20/.52,1/60,detailedWalk);
check(Math.abs(detailedFinish.phase-3-14/60)<1e-8,'The final walk step stays close to the active cadence');
const detailedContact={...detailedStart,stage:'loop',phase:12};
updateFootGait(detailedContact,0,0,20/.52,.05,detailedWalk);
check(detailedContact.stage==='idle'&&detailedContact.phase===12,'A planted walk pose returns to idle after a brief hold');
detailed.phase=33.1;
updateFootGait(detailed,(40/.52)/60,Math.PI/2,20/.52,1/60,detailedWalk,true);
check(world.footAtlasFrame(detailed.phase,detailedWalk,true,false)===14,'Shift maps an added walking pose to the neighboring run pose');
const referenceWalk={...detailedWalk,pingPong:false,playbackFps:1000/110,walkFrames:Array.from({length:24},(_,i)=>i)};
const referenceGait=createFootGait(),referenceSequence=[];
for(let i=0;i<referenceWalk.walkFrames.length;i++){
  const speed=20/.52;
  updateFootGait(referenceGait,speed*.105,Math.PI/2,speed,.105,referenceWalk);
  referenceSequence.push(world.footAtlasFrame(referenceGait.phase,referenceWalk,false,false));
  updateFootGait(referenceGait,speed*.005,Math.PI/2,speed,.005,referenceWalk);
}
check(referenceSequence.join(',')===referenceWalk.walkFrames.join(','),'The walk draws all 24 poses for 110 ms each');
check(Math.min(referenceGait.phase,24-referenceGait.phase)<1e-8,'The 24-pose sequence repeats after 2640 ms');
gait.phase=6.25;
for(let i=0;i<12;i++)updateFootGait(gait,0,0,20/.52,dt,art);
check(gait.stage==='idle'&&gait.phase===0&&gait.heading===2,'Stopping crosses the wrap to a contact pose and retains direction');
gait.stage='loop';gait.phase=4.65;
updateFootGait(gait,0,0,20/.52,dt,art);
check(gait.phase===4&&gait.stage==='stop','Stopping on an already planted frame avoids an extra step');
for(const running of [false,true]){
  const gait=createFootGait(),speed=(running?40:20)/.52;
  updateFootGait(gait,speed*dt,Math.PI/2,20/.52,dt,art,running);
  check(gait.stage==='start','Movement enters the first step before the loop');
  for(let i=0;i<22;i++)updateFootGait(gait,speed*dt,Math.PI/2,20/.52,dt,art,running);
  check(gait.stage==='loop','The first step leads into the repeating stride');
  gait.phase=2.5;
  updateFootGait(gait,0,0,20/.52,dt,art);
  check(gait.stage==='stop'&&gait.phase>2.5,'The end finishes the current step');
  for(let i=0;i<12;i++)updateFootGait(gait,0,0,20/.52,dt,art);
  check(gait.stage==='idle'&&gait.phase===4,'The end holds the planted pose and returns to idle');
}
const firstWalk=simulate(60,[[1/60,['d']]]),firstRun=simulate(60,[[1/60,['d','shift']]]);
check(firstRun.gait.vx/(40/.52)>firstWalk.gait.vx/(16/.52),'Running commits to its target speed more firmly');
const walkingStop=createWorld(start);
for(let i=0;i<24;i++)walkingStop.tick(dt,['d']);
const beforeStop=walkingStop.actor.x;
walkingStop.tick(dt,[]);
check(walkingStop.actor.x>beforeStop&&walkingStop.actor.gait.stage==='stop','The final walk step begins while the character is still decelerating');
walkingStop.tick(dt,['d']);
check(walkingStop.actor.gait.stage==='loop','Movement resumes the current cycle during the final walk step');
const shortWalk=createWorld(start);
for(const [middle,contact] of [[2,4],[6,0]]){
  shortWalk.tick(dt,['d']);
  const shown=new Set();
  for(let i=0;i<30;i++){
    shortWalk.tick(dt,[]);
    shown.add(Math.floor(shortWalk.actor.gait.phase));
  }
  check(shown.has(middle)&&shortWalk.actor.gait.phase===contact&&shortWalk.actor.gait.stage==='idle',
    'A short tap completes the current step and leaves the opposite foot ready');
}
const longWalk=createWorld(start),walkFrames=new Set();
for(let i=0;i<120;i++){
  longWalk.tick(dt,['d']);
  walkFrames.add(Math.floor(longWalk.actor.gait.phase));
}
check(walkFrames.size===8&&longWalk.actor.gait.stage==='loop','Holding movement plays both halves of the walking cycle');
const returnCode=source.slice(source.indexOf('  const RETURN_DEPARTURE='),source.indexOf('  function returnToRoad('));
const recovery=new Function(`
  let checkpointReturn=null,arrivals=0;
  let offsetX=0,offsetY=0;
  const ctx={globalAlpha:1,translate(x,y){offsetX=x;offsetY=y;}},origin={},destination={};
  const spriteAtlas={survivor:{walk:{directions:8,frameCount:8}}};
  const footHeading=()=>2;
  const footAtlasFrame=Math.floor;
  const footPlaybackFrames=()=>null;
  ${returnCode}
  beginCheckpointReturn(origin,()=>{arrivals++;return destination;});
  return {advance:advanceCheckpointReturn,departure:RETURN_DEPARTURE,arrival:RETURN_ARRIVAL,
    pose(atDestination){
      ctx.globalAlpha=1;
      offsetX=offsetY=0;
      const pose=applyReturnPose(atDestination?destination:origin,Math.PI/2,null);
      return {alpha:ctx.globalAlpha,offsetX,offsetY,pose};
    },
    get arrivals(){return arrivals;}};
`)();
recovery.advance(recovery.departure/2);
const departure=recovery.pose(false);
check(recovery.arrivals===0&&departure.alpha===.5&&departure.offsetY===2&&departure.pose.phase===1,'Recovery steps into the recoil before relocating');
recovery.advance(recovery.departure/2);
check(recovery.arrivals===1&&recovery.pose(true).alpha===0,'Recovery switches actors at the invisible midpoint');
recovery.advance(recovery.arrival*.25);
const arrival=recovery.pose(true);
check(arrival.alpha===1&&arrival.offsetX<0&&arrival.pose.phase===2,'The first leg and arm are visible while approaching the checkpoint');
recovery.advance(recovery.arrival*.4);
const otherSide=recovery.pose(true);
check(otherSide.alpha===1&&otherSide.offsetX>arrival.offsetX&&otherSide.pose.phase===6,'The second step continues toward the checkpoint');
recovery.advance(recovery.arrival*.2);
check(recovery.pose(true).pose.phase===0&&recovery.pose(true).offsetX===0,'Both steps end in the contact pose at the checkpoint');
recovery.advance(recovery.arrival*.09);
check(recovery.pose(true).pose.stage==='idle','The character settles into idle before input resumes');
recovery.advance(recovery.arrival*.1);
check(recovery.arrivals===1&&recovery.pose(true).alpha===1,'Recovery ends at full opacity and only relocates once');
console.log(checks+' sprint checks passed');
