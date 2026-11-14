/* Run in Node, or load from moss-creatures-browser.html. */
function runMossCreatureTests(api){
  let checks=0;
  const check=(ok,message)=>{checks++;if(!ok)throw Error(message);};
  const day={daylight:1},night={daylight:0},target={x:800,y:650};
  const buildings=[[100,100,50,40],[300,100,50,40],[500,100,50,40]];
  const shadows=buildings.map(([x],home)=>({home,points:[{x:x-10,y:175},{x:x+95,y:175},{x:x+95,y:235},{x:x-10,y:235}]}));
  const blocked=(x,y,r)=>buildings.some(([bx,by,w,h])=>x>bx-r&&x<bx+w*1.65+r&&y>by-r&&y<by+h*1.65+r);
  function rng(seed=92){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  function create(random=rng()){
    return api.createEcology({random,getBuildings:()=>buildings,getSize:()=>({w:1600,h:1200}),isBlocked:blocked,getShadows:()=>shadows});
  }
  check(api.TYPES.length===3&&new Set(api.TYPES.map(t=>t.id)).size===3,'three distinct creatures');
  check(api.SUN_RUNNER_CHANCE===.05,'sun exception is exactly five percent');
  const normal=create(()=>.5);normal.reset(day,target);
  check(normal.entities.length===1,'day starts with a sparse outdoor population');
  const walker=normal.entities[0];Object.assign(walker,{x:500,y:650,destination:{x:450,y:650},retarget:100});
  normal.update(.1,{light:day,target});
  check(!walker.indoors&&walker.x<500,'ordinary creatures walk in open daylight without sheltering');
  for(let i=0;i<298;i++)normal.update(.1,{light:day,target});
  check(normal.entities.length===1,'day spawning waits thirty seconds');
  normal.update(.1,{light:day,target});
  check(normal.entities.length===2,'day replenishes the outdoor population');
  for(let i=0;i<600;i++)normal.update(.1,{light:day,target});
  check(normal.entities.length===3&&normal.entities.every(e=>!e.indoors),'day stays capped at three outdoor creatures');
  check(normal.entities.includes(walker)&&walker.sunAge===null,'day creatures survive sunlight');
  const dark=create(()=>.5);dark.reset(night,target);
  check(dark.entities.length===3,'night population starts gradually');
  for(let i=0;i<3600;i++)dark.update(.1,{light:night,target});
  check(dark.entities.length===67,'night population grows to sixty-seven');
  dark.update(.1,{light:day,target});
  check(dark.entities.length===3&&dark.entities.every(e=>!e.indoors),'dawn reduces numbers while allowing outdoor movement');
  normal.entities.splice(1);
  for(let i=0;i<600;i++)normal.update(.1,{light:day,target});
  check(normal.entities.length===3,'day respawns missing creatures up to the cap');
  const atRate=hz=>{
    const model=create(()=>.5);model.reset(night,target);const creature=model.entities[0];Object.assign(creature,{x:720,y:650});
    for(let i=0;i<hz;i++)model.update(1/hz,{light:night,target});
    return creature;
  };
  const at30=atRate(30),at144=atRate(144);
  check(Math.hypot(at30.x-at144.x,at30.y-at144.y)<1e-6,'motion is consistent across frame rates');
  check(api.playerNoise({x:0,y:0,speed:0})===null,'standing still emits no footsteps');
  check(api.playerNoise({x:0,y:0,vehicle:true,engineRunning:false})===null,'parked engine-off motorcycle is silent');
  const steps=api.playerNoise({x:800,y:650,speed:25});
  const running=api.playerNoise({x:800,y:650,speed:45,running:true});
  const engine=api.playerNoise({x:800,y:650,speed:90,vehicle:true,engineRunning:true});
  check(steps.radius<running.radius&&running.radius<engine.radius,'running carries farther than walking and a moving engine is loudest');
  check(api.playerNoise({x:0,y:0,vehicle:true,engineRunning:true}).radius>0,'an idling motorcycle still attracts creatures');
  check(api.playerNoise({x:0,y:0,speed:30,vehicle:true}).radius>0,'rolling with the engine off still produces tire noise');
  function listener(){
    const model=create(()=>.5);model.reset(night,target);
    const hunter=model.entities[0];Object.assign(hunter,{x:550,y:650,destination:{x:450,y:650},retarget:100});
    return {model,hunter};
  }
  const silent=listener();silent.model.update(.1,{light:night,target});
  check(silent.hunter.x<550&&silent.hunter.behavior==='wander','a distant silent player is not tracked automatically');
  const quiet=listener();quiet.model.update(.1,{light:night,target,sounds:[steps]});
  check(quiet.hunter.heard===null,'quiet footsteps are not heard outside their radius');
  const reduced=listener();reduced.hunter.x=540;
  reduced.model.update(.1,{light:night,target,sounds:[running]});
  check(reduced.hunter.heard===null,'a running player at 260 units is outside the reduced hearing range');
  const nearby=listener();nearby.hunter.x=730;
  nearby.model.update(.1,{light:night,target,sounds:[running]});
  check(nearby.hunter.heard?.x===800,'a running player at 70 units remains audible');
  const loud=listener();loud.hunter.x=730;loud.model.update(.1,{light:night,target,sounds:[running]});
  check(loud.hunter.x>550&&loud.hunter.behavior==='investigate'&&loud.hunter.heard.x===800,'running attracts a hunter toward the sound source');
  loud.model.update(.1,{light:night,target:{x:1200,y:1000}});
  check(loud.hunter.heard.x===800&&loud.hunter.heard.y===650,'after silence the creature remembers the sound location rather than following the player through the map');
  for(let i=0;i<41;i++)loud.model.update(.1,{light:night,target:{x:1200,y:1000}});
  check(loud.hunter.heard===null&&loud.hunter.behavior==='wander','investigation ends after four seconds without another sound');
  const motorHunter=listener();motorHunter.hunter.x=680;motorHunter.model.update(.1,{light:night,target,sounds:[engine]});
  check(motorHunter.hunter.heard?.x===800,'engine noise draws creatures from farther away');
  const separated=listener();separated.model.update(.1,{light:night,target,sounds:[{...engine,room:1}]});
  check(separated.hunter.heard===null,'indoor footsteps are not confused with world coordinates');
  const close=listener();close.hunter.x=770;close.model.update(.1,{light:night,target});
  check(close.hunter.behavior==='chase','a nearby visible player can still be detected in silence');
  const competing=listener();competing.model.update(.1,{light:night,target:{x:1200,y:1000},sounds:[{x:600,y:650,radius:100},{x:850,y:650,radius:650}]});
  check(competing.hunter.heard?.x===850,'the strongest audible source wins over weaker competing sounds');
  const indoorSound=create(()=>.5);indoorSound.reset(day,target);
  const indoorListener=indoorSound.entities[0],indoorSource={x:400,y:270};
  Object.assign(indoorListener,{indoors:true,roomX:360,roomY:250});
  indoorSound.update(.1,{light:day,target,room:indoorListener.home,roomTarget:indoorSource,
    sounds:[api.playerNoise({...indoorSource,speed:45,running:true,room:indoorListener.home})],moveRoom:(p,dx,dy)=>{p.x+=dx;p.y+=dy;}});
  check(indoorListener.behavior==='investigate'&&indoorListener.heard.x===400,'sheltered creatures investigate footsteps in the same room');
  const dusk=create(()=>.5);dusk.reset(day,target);
  dusk.update(.1,{light:{daylight:.27},target});
  check(dusk.entities.length===1,'crossing into dusk does not spawn a wave immediately');
  for(let i=0;i<1800;i++)dusk.update(.1,{light:{daylight:.27},target});
  const twilightCount=dusk.entities.length;
  check(twilightCount>3&&twilightCount<67&&twilightCount===api.populationForLight({daylight:.27}),'twilight has a smaller population than full darkness');
  let previousCount=twilightCount;
  for(let i=0;i<3600;i++){
    dusk.update(.1,{light:night,target});
    check(dusk.entities.length-previousCount<=1,'no frame creates a burst of creatures');
    previousCount=dusk.entities.length;
  }
  check(dusk.entities.length===67,'full darkness gradually reaches the cap of sixty-seven');
  check(api.populationForLight(day)===3&&api.populationForLight(night)===67,'population budget follows darkness');
  const spawnAtRate=hz=>{const model=create(()=>.5);model.reset(day,target);for(let i=0;i<60*hz;i++)model.update(1/hz,{light:night,target});return model.entities.length;};
  check(spawnAtRate(30)===spawnAtRate(144),'spawn cadence is independent of frame rate');
  const timed=create(()=>.5);timed.reset(night,target);
  check(timed.spawnInterval===10,'a new night starts with a ten-second interval');
  const arrivals=[];let count=timed.entities.length;
  for(let tick=1;tick<=700;tick++){
    timed.update(.1,{light:night,target});
    if(timed.entities.length>count){arrivals.push(tick/10);count=timed.entities.length;}
  }
  check(arrivals.slice(0,6).join(',')==='10,18,24,28,30,32','spawn times follow ten, eight, six, four, then two seconds');
  check(timed.spawnInterval===2,'the interval never falls below two seconds');
  timed.update(.1,{light:day,target});timed.update(.1,{light:night,target});
  check(timed.spawnInterval===10,'the next evening resets the interval to ten seconds');
  const spread=api.createEcology({random:rng(123),getBuildings:()=>buildings,getSize:()=>({w:5600,h:3600}),isBlocked:()=>false,getShadows:()=>shadows});
  spread.reset(night,target);
  for(let tick=0;tick<3600;tick++)spread.update(.1,{light:night,target});
  check(spread.entities.length===67,'all spawn paths respect the total cap');
  const sectors=new Set(spread.entities.map(e=>Math.floor(e.x/1120)+','+Math.floor(e.y/720)));
  check(sectors.size>=15,'creatures occupy many map regions rather than a ring around the player');
  const far=spread.entities.find(e=>Math.hypot(e.x-target.x,e.y-target.y)>1150);
  check(!!far,'distant parts of the map retain their own creatures');
  const farBefore={x:far.x,y:far.y};spread.update(.1,{light:night,target});
  check(Math.hypot(far.x-farBefore.x,far.y-farBefore.y)<=api.TYPES[far.kind].nightSpeed*.1+1e-6,'distant creatures do not teleport toward the player');
  const local=api.createEcology({random:rng(54),getBuildings:()=>buildings,getSize:()=>({w:5600,h:3600}),isBlocked:()=>false,getShadows:()=>[]});
  local.reset(night,target);let nearSpawn=0,farSpawn=0,known=3;
  for(let i=0;i<1600;i++){
    local.update(.1,{light:night,target});
    if(local.entities.length>known){
      const spawned=local.entities[local.entities.length-1],d=Math.hypot(spawned.x-target.x,spawned.y-target.y);
      if(d<425)nearSpawn++;else farSpawn++;
      known=local.entities.length;
    }
  }
  check(nearSpawn>=8&&farSpawn>nearSpawn,'more encounters spawn nearby while most still populate the wider map');
  return checks+' moss-creature checks passed';
}
if(typeof module!=='undefined'&&module.exports){
  console.log(runMossCreatureTests(require('../src/moss-creatures.js')));
}
