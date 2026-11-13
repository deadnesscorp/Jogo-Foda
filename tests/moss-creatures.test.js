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
  check(normal.entities.length===6,'day population is small');
  check(normal.entities.filter(e=>e.indoors).length>=4,'most daytime creatures shelter inside buildings');
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
  check(dark.entities.length===42,'night population is seven times larger');
  check(dark.entities.every(e=>!e.indoors),'night creatures roam outdoors');
  const hunter=dark.entities[0];Object.assign(hunter,{x:750,y:650});
  dark.update(.05,{light:night,target});
  check(hunter.x>750&&hunter.speed>api.TYPES[hunter.kind].daySpeed,'night creatures move freely across sunlight-only ground');
  check(dark.glitch===0,'nighttime activity does not trigger the daytime anomaly glitch');
  for(let i=0;i<100;i++)normal.update(.1,{light:night,target});
  check(normal.entities.length===42,'night population grows gradually after dusk');
  normal.update(.05,{light:day,target});
  check(normal.entities.length===6,'extra ordinary creatures retreat at dawn');
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
  return checks+' moss-creature checks passed';
}
if(typeof module!=='undefined'&&module.exports){
  console.log(runMossCreatureTests(require('../moss-creatures.js')));
}
