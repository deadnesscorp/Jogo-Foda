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
  check(normal.entities.length===3,'day population is reduced to three');
  check(normal.entities.filter(e=>e.indoors).length>=2,'most daytime creatures shelter inside buildings');
  for(let i=0;i<120;i++){
    const previous=normal.entities.map(e=>({x:e.x,y:e.y}));
    normal.update(1/30,{light:day,target});
    normal.entities.forEach((e,index)=>{
      check(e.indoors||normal.isShaded(e.x,e.y),'ordinary daytime creature stays out of sunlight');
      if(!e.indoors)check(Math.hypot(e.x-previous[index].x,e.y-previous[index].y)<=api.TYPES[e.kind].daySpeed/30+1e-8,'day movement remains slow');
    });
  }
  const below=create(()=>.049999);below.reset(day,target);
  const boundary=create(()=>.05);boundary.reset(day,target);
  check(below.entities.every(e=>e.sunRunner),'roll below .05 ignores daylight rules');
  check(boundary.entities.every(e=>!e.sunRunner),'roll at .05 obeys daylight rules');
  const anomaly=below.entities[0];Object.assign(anomaly,{x:750,y:650,indoors:false});
  const before=anomaly.x;
  below.update(.05,{light:day,target});
  check(anomaly.x>before&&anomaly.speed>api.TYPES[anomaly.kind].daySpeed,'rare creature runs in open sun');
  check(below.glitch>0,'nearby daytime anomaly produces glitches');
  const flags=below.entities.map(e=>e.sunRunner);
  for(let i=0;i<60;i++)below.update(1/60,{light:day,target});
  check(below.entities.every((e,i)=>e.sunRunner===flags[i]),'exception is not rerolled each frame');
  const dark=create(()=>.5);dark.reset(night,target);
  check(dark.entities.length===3,'starting at night also builds the population gradually');
  check(dark.entities.every(e=>!e.indoors),'night creatures roam outdoors');
  const hunter=dark.entities[0];Object.assign(hunter,{x:750,y:650});
  dark.update(.05,{light:night,target});
  check(hunter.x>750&&hunter.speed>api.TYPES[hunter.kind].daySpeed,'night creatures move freely across sunlight-only ground');
  check(dark.glitch===0,'nighttime activity does not trigger the daytime anomaly glitch');
  for(let i=0;i<3600;i++)normal.update(.1,{light:night,target});
  check(normal.entities.length===67,'night population grows gradually to sixty-seven');
  normal.update(.05,{light:day,target});
  check(normal.entities.length===3,'extra ordinary creatures retreat at dawn');
  check(normal.entities.every(e=>e.indoors||normal.isShaded(e.x,e.y)),'dawn restores shelter rules');
  const indoor=create(()=>.5);indoor.reset(day,target);
  const resident=indoor.entities.find(e=>e.indoors),roomBefore={x:resident.roomX,y:resident.roomY};
  indoor.update(.1,{light:day,target,room:resident.home,roomTarget:{x:400,y:270},moveRoom:(p,dx,dy)=>{p.x+=dx;p.y+=dy;}});
  check(Math.hypot(resident.roomX-roomBefore.x,resident.roomY-roomBefore.y)>0,'sheltered residents move inside the explored room');
  const atRate=hz=>{
    const model=create(()=>.5);model.reset(night,target);const creature=model.entities[0];Object.assign(creature,{x:720,y:650});
    for(let i=0;i<hz;i++)model.update(1/hz,{light:night,target});
    return creature;
  };
  const at30=atRate(30),at144=atRate(144);
  check(Math.hypot(at30.x-at144.x,at30.y-at144.y)<1e-6,'motion is consistent across frame rates');
  check(api.SUN_LIFETIME===17,'day hunters last no more than seventeen seconds');
  for(const hz of [30,60,144]){
    const model=create(()=>.01);model.reset(day,target);
    const runner=model.entities[0];Object.assign(runner,{x:750,y:650,indoors:false});
    for(let i=0;i<17*hz-1;i++)model.update(1/hz,{light:day,target});
    check(model.entities.includes(runner)&&runner.sunAge>16,'day hunter gradually ages before the deadline at '+hz+' Hz');
    model.update(1/hz,{light:day,target});
    check(!model.entities.includes(runner),'day hunter is removed at seventeen seconds at '+hz+' Hz');
    for(let i=0;i<hz;i++)model.update(1/hz,{light:day,target});
    check(!model.entities.includes(runner)&&model.entities.length>0,'the expired hunter is removed while untriggered creatures remain alive');
  }
  const sheltered=create(()=>.01);sheltered.reset(day,target);
  const exposed=sheltered.entities[0];
  Object.assign(exposed,{x:750,y:650,indoors:false});
  sheltered.update(.1,{light:day,target});
  exposed.indoors=true;
  for(let i=0;i<170;i++)sheltered.update(.1,{light:day,target});
  check(!sheltered.entities.includes(exposed),'hiding cannot reset a started dissolution');
  const sunset=create(()=>.01);sunset.reset(day,target);const fading=sunset.entities[0];
  Object.assign(fading,{x:750,y:650,indoors:false});
  sunset.update(.1,{light:day,target});
  for(let i=0;i<170;i++)sunset.update(.1,{light:night,target});
  check(!sunset.entities.includes(fading),'nightfall cannot extend the life of an exposed hunter');
  const ordinary=create(()=>.5);ordinary.reset(day,target);
  for(let i=0;i<200;i++)ordinary.update(.1,{light:day,target,room:100+i});
  check(ordinary.entities.length===3&&ordinary.entities.every(e=>e.sunAge===null),'ordinary sheltered creatures do not dissolve and room visits respect the population cap');
  const nocturnal=create(()=>.01);nocturnal.reset(night,target);const unexposed=nocturnal.entities[0];
  for(let i=0;i<180;i++)nocturnal.update(.1,{light:night,target});
  check(nocturnal.entities.includes(unexposed)&&unexposed.sunAge===null,'night-only activity does not trigger the daylight countdown');
  let shadowBuilds=0;
  const efficient=api.createEcology({random:()=>.5,getBuildings:()=>buildings,getSize:()=>({w:1600,h:1200}),isBlocked:blocked,getShadows:()=>{shadowBuilds++;return shadows;}});
  efficient.reset(night,target);for(let i=0;i<100;i++)efficient.update(.1,{light:night,target});
  check(shadowBuilds===0,'night simulation skips unused shadow calculations');
  efficient.update(.1,{light:day,target});
  check(shadowBuilds===1,'daybreak refreshes shadow shelter before moving creatures');
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
  const indoorListener=indoorSound.entities.find(e=>e.indoors),indoorSource={x:400,y:270};
  Object.assign(indoorListener,{roomX:360,roomY:250});
  indoorSound.update(.1,{light:day,target,room:indoorListener.home,roomTarget:indoorSource,
    sounds:[api.playerNoise({...indoorSource,speed:45,running:true,room:indoorListener.home})],moveRoom:(p,dx,dy)=>{p.x+=dx;p.y+=dy;}});
  check(indoorListener.behavior==='investigate'&&indoorListener.heard.x===400,'sheltered creatures investigate footsteps in the same room');
  const dusk=create(()=>.5);dusk.reset(day,target);
  dusk.update(.1,{light:{daylight:.27},target});
  check(dusk.entities.length===3,'crossing into dusk does not spawn a wave immediately');
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
  function speedAtExposure(age){
    const model=create(()=>.01);model.reset(day,target);const creature=model.entities[0];
    Object.assign(creature,{x:750,y:650,indoors:false,sunAge:age});
    model.update(.05,{light:day,target:{x:1450,y:650},sounds:[{x:1450,y:650,radius:2000,player:true}]});
    return creature.speed;
  }
  const fresh=speedAtExposure(0),half=speedAtExposure(8.5),late=speedAtExposure(16.5);
  check(fresh>half&&half>late&&late>0,'dissolving hunters progressively slow down instead of stopping abruptly');
  check(half/fresh>.55&&half/fresh<.6&&late/fresh<.2,'half dissolution keeps roughly 57 percent speed and final moments fall below 20 percent');
  const sunTravel=hz=>{
    const model=create(()=>.01);model.reset(day,target);const creature=model.entities[0];Object.assign(creature,{x:750,y:650,indoors:false});
    for(let i=0;i<hz*5;i++)model.update(1/hz,{light:day,target:{x:1450,y:650},sounds:[{x:1450,y:650,radius:2000,player:true}]});
    return creature.x;
  };
  check(Math.abs(sunTravel(30)-sunTravel(144))<1e-6,'sunlight slowdown produces consistent travel across frame rates');
  const idle=create(()=>.01);idle.reset(day,target);const wanderer=idle.entities[0];
  Object.assign(wanderer,{x:600,y:650,indoors:false,destination:{x:400,y:650},retarget:100});
  for(let i=0;i<300;i++)idle.update(.1,{light:day,target});
  check(idle.entities.includes(wanderer)&&wanderer.sunAge===null,'daytime wandering lasts beyond seventeen seconds without dissolving');
  check(wanderer.speed<=api.TYPES[wanderer.kind].daySpeed+1e-6,'an idle daytime hunter wanders slowly');
  Object.assign(wanderer,{x:600,y:650,destination:{x:400,y:650},retarget:100});
  idle.update(.1,{light:day,target,sounds:[{...target,radius:600,kind:'motor',player:false}]});
  check(wanderer.sunAge===null&&wanderer.speed<=api.TYPES[wanderer.kind].daySpeed+1e-6,'investigating an unattended motorcycle does not start a daytime pursuit or dissolution');
  Object.assign(wanderer,{x:730,y:650});
  idle.update(.1,{light:day,target,sounds:[api.playerNoise({...target,speed:50,running:true})]});
  check(wanderer.sunAge>0&&wanderer.pursuingPlayer&&wanderer.speed>api.TYPES[wanderer.kind].daySpeed,'hearing a running player starts the fast daytime pursuit and countdown together');
  const startedAge=wanderer.sunAge;idle.update(.1,{light:day,target:{x:1500,y:1100}});
  check(wanderer.sunAge>startedAge,'once started, losing sight does not reset dissolution');
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
  console.log(runMossCreatureTests(require('../moss-creatures.js')));
}
