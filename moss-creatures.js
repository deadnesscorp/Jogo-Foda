/* Black-moss wildlife: simulation is independent of drawing and browser APIs. */
(() => {
  'use strict';
  const TYPES=[
    {id:'encoberto',name:'Encoberto',role:'Caçador esguio',daySpeed:5,nightSpeed:62,runSpeed:88,height:30,reach:240,
      damage:1.35,wound:'deep',attackReach:15,bikeDamage:10,knockOffChance:.48,attackInterval:2.4,stun:1,
      targets:['chest','abdomen','leftArm','rightArm'],bikeTargets:['handlebar','motor']},
    {id:'rastejante',name:'Rastejante',role:'Quadrúpede veloz',daySpeed:7,nightSpeed:82,runSpeed:108,height:20,reach:310,
      damage:.8,wound:'cut',attackReach:12,bikeDamage:7,knockOffChance:.22,attackInterval:1.8,stun:.75,
      targets:['leftLeg','rightLeg','leftArm','rightArm'],bikeTargets:['frontTire','rearTire']},
    {id:'coroa',name:'Coroa',role:'Brutamontes',daySpeed:3,nightSpeed:27,runSpeed:40,height:32,reach:190,
      damage:2,wound:'fracture',attackReach:19,bikeDamage:22,knockOffChance:.88,attackInterval:3.4,stun:1.25,
      targets:['head','chest','leftLeg','rightLeg'],bikeTargets:['motor','handlebar','frontTire','rearTire']}
  ];
  function attackOutcome(kind,{mounted=false,speed=0,random=Math.random}={}){
    const profile=TYPES[kind]||TYPES[0];
    return {profile,severity:Math.min(2,profile.damage+(mounted?Math.min(.35,Math.abs(speed)/500):0)),
      knockedOff:mounted&&random()<profile.knockOffChance};
  }
  const DAY_COUNT=3,NIGHT_COUNT=67,SUN_RUNNER_CHANCE=.05,SUN_LIFETIME=17;
  const HEARING_MEMORY=4,SPAWN_START_INTERVAL=10,SPAWN_MIN_INTERVAL=2,SPAWN_INTERVAL_STEP=2;
  function playerNoise({x,y,speed=0,running=false,vehicle=false,engineRunning=false,room=-1}){
    speed=Math.abs(speed);
    const radius=vehicle?(engineRunning?180+Math.min(470,speed*2):speed>2?90+Math.min(100,speed):0):speed>1?(running?230:100):0;
    return radius?{x,y,radius,room,kind:vehicle?'motor':running?'running':'steps',player:!vehicle}:null;
  }
  function populationForLight(light){
    const darkness=Math.max(0,Math.min(1,(.45-light.daylight)/.45));
    return DAY_COUNT+Math.floor((NIGHT_COUNT-DAY_COUNT)*darkness);
  }
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function inPolygon(x,y,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  function createEcology({random=Math.random,getBuildings,getSize,isBlocked,getShadows}){
    let entities=[],night=false,initialized=false,serial=0,spawnClock=0,spawnInterval=SPAWN_START_INTERVAL,shadeClock=0,regions=[],glitch=0;
    const roomResidents=new Map();
    const nearHomes=target=>getBuildings().map((b,index)=>({index,d:distance(target,{x:b[0]+b[2]*.825,y:b[1]+b[3]*.825})})).sort((a,b)=>a.d-b.d).slice(0,10);
    function door(home){const b=getBuildings()[home];return {x:b[0]+b[2]*1.155,y:b[1]+b[3]*1.65+14};}
    function shaded(x,y){return regions.some(region=>inPolygon(x,y,region.points));}
    function shadePoint(home){
      const region=regions.find(item=>item.home===home);
      if(!region)return null;
      const xs=region.points.map(p=>p.x),ys=region.points.map(p=>p.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      for(let attempt=0;attempt<64;attempt++){
        const x=minX+random()*(maxX-minX),y=minY+random()*(maxY-minY);
        if(!isBlocked(x,y,5)&&inPolygon(x,y,region.points))return {x,y};
      }
      return null;
    }
    function openPoint(target,inner=180,outer=620){
      const size=getSize();
      for(let attempt=0;attempt<64;attempt++){
        const angle=random()*Math.PI*2,radius=inner+random()*(outer-inner);
        const p={x:Math.max(12,Math.min(size.w-12,target.x+Math.cos(angle)*radius)),y:Math.max(12,Math.min(size.h-12,target.y+Math.sin(angle)*radius))};
        if(!isBlocked(p.x,p.y,5))return p;
      }
      return null;
    }
    function dispersedPoint(target,nearPlayer=false){
      if(nearPlayer)for(let attempt=0;attempt<12;attempt++){
        const p=openPoint(target,180,420);
        if(p&&distance(p,target)>=180&&!entities.some(entity=>distance(p,entity)<100))return p;
      }
      const size=getSize(),columns=5,rows=5,total=columns*rows;
      const width=size.w/columns,height=size.h/rows,start=Math.floor(random()*total);
      const cells=Array.from({length:total},(_,id)=>({id,count:0}));
      for(const entity of entities){
        const col=Math.max(0,Math.min(columns-1,Math.floor(entity.x/width)));
        const row=Math.max(0,Math.min(rows-1,Math.floor(entity.y/height)));
        cells[row*columns+col].count++;
      }
      cells.sort((a,b)=>a.count-b.count||((a.id-start+total)%total)-((b.id-start+total)%total));
      // Prefer empty regions and leave a gap between neighbors and the player.
      for(const cell of cells)for(let attempt=0;attempt<16;attempt++){
        const u=(random()+attempt*.61803398875)%1,v=(random()+attempt*.41421356237)%1;
        const p={x:(cell.id%columns)*width+12+u*Math.max(0,width-24),y:Math.floor(cell.id/columns)*height+12+v*Math.max(0,height-24)};
        if(distance(p,target)<180||isBlocked(p.x,p.y,5))continue;
        if(entities.some(entity=>distance(p,entity)<Math.min(180,width*.35,height*.35)))continue;
        return p;
      }
      return null;
    }
    function shelter(entity){entity.indoors=true;entity.destination=null;entity.speed=0;entity.heard=null;entity.heardPlayer=false;entity.pursuingPlayer=false;entity.alert=0;Object.assign(entity,door(entity.home));}
    function investigate(entity,position,room,sounds,visibleTarget){
      entity.pursuingPlayer=false;
      if(entity.heardRoom!==room||entity.alert===0)entity.heard=null;
      let strongest=0;
      for(const sound of sounds){
        if(!sound||(sound.room??-1)!==room||!Number.isFinite(sound.radius)||sound.radius<=0)continue;
        const radius=sound.radius*TYPES[entity.kind].reach/240*.85;
        const strength=1-distance(position,sound)/radius;
        if(strength>strongest){
          strongest=strength;entity.heard={x:sound.x,y:sound.y};entity.heardRoom=room;entity.alert=HEARING_MEMORY;
          entity.heardPlayer=sound.player===true||sound.kind==='steps'||sound.kind==='running';
        }
      }
      // Sight is deliberately short: silent players can evade a distant hunter.
      if(visibleTarget&&distance(position,visibleTarget)<(room<0?55:30)&&
        (room>=0||!isBlocked((position.x+visibleTarget.x)/2,(position.y+visibleTarget.y)/2,2))){
        entity.pursuingPlayer=true;entity.behavior='chase';return visibleTarget;
      }
      entity.behavior=entity.heard?'investigate':'wander';
      entity.pursuingPlayer=!!entity.heard&&entity.heardPlayer;
      return entity.heard;
    }
    function add(target,nightOnly=false,forcedHome){
      if(entities.length>=NIGHT_COUNT)return null;
      const position=dispersedPoint(target,nightOnly&&serial%3===0);
      const homes=nearHomes(position||target);if(!homes.length)return null;
      const home=forcedHome??homes[Math.floor(random()*homes.length)].index;
      // One roll per creature, never a per-frame roll that eventually becomes inevitable.
      const entity={id:serial++,kind:serial%3,home,nightOnly,sunRunner:random()<SUN_RUNNER_CHANCE,
        x:0,y:0,angle:Math.PI,phase:random()*Math.PI*2,speed:0,indoors:false,destination:null,retarget:0,sunAge:null,
        heard:null,heardRoom:-1,heardPlayer:false,pursuingPlayer:false,alert:0,behavior:'wander',spawnAge:0,attackCooldown:0,
        roomX:90+random()*280,roomY:125+random()*125,roomPhase:0,roomAngle:Math.PI,roomDestination:null};
      entities.push(entity);
      if(night||entity.sunRunner){if(position)Object.assign(entity,position);else shelter(entity);}
      else if(entity.id%3===0){const p=shadePoint(home);if(p)Object.assign(entity,p);else shelter(entity);}
      else shelter(entity);
      return entity;
    }
    function reset(light,target){
      entities=[];roomResidents.clear();serial=0;spawnClock=0;spawnInterval=SPAWN_START_INTERVAL;glitch=0;shadeClock=0;
      night=light.daylight<.28;regions=night?[]:getShadows(light);initialized=true;
      for(let i=0;i<DAY_COUNT;i++)add(target);
    }
    function move(entity,dx,dy,dayRestricted){
      const size=getSize();let x=Math.max(8,Math.min(size.w-8,entity.x+dx)),y=Math.max(8,Math.min(size.h-8,entity.y+dy));
      const allowed=(px,py)=>!isBlocked(px,py,5)&&(!dayRestricted||shaded(px,py));
      const before={x:entity.x,y:entity.y};
      if(allowed(x,entity.y))entity.x=x;
      if(allowed(entity.x,y))entity.y=y;
      const travel=distance(before,entity);
      if(travel>0){entity.angle=Math.atan2(entity.x-before.x,-(entity.y-before.y));entity.phase+=travel/(entity.kind===1?15:23)*Math.PI*2;}
      return travel;
    }
    function update(dt,{light,target,room=-1,roomTarget=null,moveRoom=null,sounds=[]}){
      if(!initialized)reset(light,target);
      if(!Number.isFinite(dt)||dt<=0)return;
      dt=Math.min(.1,dt);shadeClock-=dt;
      const nextNight=night?light.daylight<.45:light.daylight<.28;
      if(nextNight!==night){
        night=nextNight;
        spawnClock=0;spawnInterval=SPAWN_START_INTERVAL;
        shadeClock=0;
        if(night)for(const entity of entities){
          if(entity.indoors){const p=door(entity.home);if(!isBlocked(p.x,p.y,5)){Object.assign(entity,p);entity.indoors=false;}}
          entity.destination=null;
        }
      }
      // Night creatures do not use shadow polygons; avoid rebuilding them then.
      if(!night&&shadeClock<=0){regions=getShadows(light);shadeClock=.35;}
      const populationLimit=night?populationForLight(light):DAY_COUNT;
      if(night&&entities.length<populationLimit){
        spawnClock+=dt;
        if(spawnClock+1e-8>=spawnInterval){
          const spawned=add(target,true);spawnClock=Math.max(0,spawnClock-spawnInterval);
          if(spawned)spawnInterval=Math.max(SPAWN_MIN_INTERVAL,spawnInterval-SPAWN_INTERVAL_STEP);
        }
      }else spawnClock=0;
      if(room>=0&&!roomResidents.has(room)){
        roomResidents.set(room,true);
        if(!night&&entities.length<DAY_COUNT&&!entities.some(e=>e.home===room)&&random()<.45){const resident=add(target,false,room);if(resident)shelter(resident);}
      }
      let nearbyAnomaly=0;
      for(const entity of entities){
        entity.spawnAge=Math.min(1,entity.spawnAge+dt);
        entity.attackCooldown=Math.max(0,(entity.attackCooldown||0)-dt);
        entity.alert=Math.max(0,entity.alert-dt);
        if(entity.alert<=1e-8){entity.alert=0;entity.heard=null;}
        const type=TYPES[entity.kind],restricted=!night&&!entity.sunRunner;
        if(!night&&entity.nightOnly&&!entity.sunRunner){shelter(entity);entity.retired=true;continue;}
        const inRoom=entity.indoors&&entity.home===room&&roomTarget&&moveRoom;
        const interest=entity.indoors
          ?(inRoom?investigate(entity,{x:entity.roomX,y:entity.roomY},room,sounds,roomTarget):null)
          :investigate(entity,entity,-1,sounds,room<0?target:null);
        // The first outdoor daytime pursuit starts an irreversible countdown.
        // Wandering or investigating an unattended engine never starts it.
        if(entity.sunAge!==null||(!night&&entity.sunRunner&&!entity.indoors&&entity.pursuingPlayer)){
          entity.sunAge=(entity.sunAge??0)+dt;
          if(entity.sunAge>=SUN_LIFETIME-1e-8){entity.retired=true;continue;}
        }
        // Average exposure over the frame keeps the gradual slowdown consistent
        // at different refresh rates, reaching 15% speed just before dissolution.
        const sunSpeed=1-.85*Math.min(1,Math.max(0,(entity.sunAge??0)-dt*.5)/SUN_LIFETIME);
        if(entity.indoors){
          if(entity.home===room&&roomTarget&&moveRoom){
            if(!entity.roomDestination||distance({x:entity.roomX,y:entity.roomY},entity.roomDestination)<8)
              entity.roomDestination={x:76+random()*310,y:110+random()*150};
            const to=interest||entity.roomDestination;
            const dx=to.x-entity.roomX,dy=to.y-entity.roomY,len=Math.hypot(dx,dy)||1;
            const pursuing=!restricted&&(night?!!interest:entity.pursuingPlayer);
            const speed=(pursuing?(!night&&entity.sunRunner?type.runSpeed:type.nightSpeed):type.daySpeed)*sunSpeed;
            const local={x:entity.roomX,y:entity.roomY};
            moveRoom(local,dx/len*Math.min(len,speed*dt),dy/len*Math.min(len,speed*dt),4);
            const travel=Math.hypot(local.x-entity.roomX,local.y-entity.roomY);
            if(travel>0){entity.roomAngle=Math.atan2(local.x-entity.roomX,-(local.y-entity.roomY));entity.roomPhase+=travel/20*Math.PI*2;}
            entity.roomX=local.x;entity.roomY=local.y;
          }
          continue;
        }
        if(restricted&&!shaded(entity.x,entity.y)){
          const refuge=shadePoint(entity.home);
          if(refuge&&distance(entity,refuge)<32)Object.assign(entity,refuge);else shelter(entity);
          continue;
        }
        entity.retarget-=dt;
        const chasing=!!interest;
        if(!entity.destination||entity.retarget<=0||distance(entity,entity.destination)<10){
          entity.destination=restricted?shadePoint(entity.home):openPoint(entity,25,110);
          entity.retarget=2+random()*4;
        }
        const to=interest||entity.destination;
        const pursuing=!restricted&&(night?chasing:entity.pursuingPlayer);
        const speed=(pursuing?(!night&&entity.sunRunner?type.runSpeed:type.nightSpeed):type.daySpeed)*sunSpeed;
        entity.speed=0;
        if(to){
          const dx=to.x-entity.x,dy=to.y-entity.y,len=Math.hypot(dx,dy);
          if(len>(chasing?15:3)){
            const travel=move(entity,dx/len*Math.min(len,speed*dt),dy/len*Math.min(len,speed*dt),restricted);
            entity.speed=travel/Math.max(.001,dt);if(travel===0)entity.retarget=0;
          }
        }
        if(!night&&entity.sunRunner)nearbyAnomaly=Math.max(nearbyAnomaly,Math.max(0,1-distance(entity,target)/430));
      }
      entities=entities.filter(entity=>!entity.retired);
      glitch+=(nearbyAnomaly-glitch)*(1-Math.exp(-dt*6));
    }
    return {reset,update,isShaded:shaded,get entities(){return entities;},get night(){return night;},get spawnInterval(){return spawnInterval;},get glitch(){return night?0:glitch;}};
  }
  function createRenderer(atlas,{assetRoot='assets/creatures/'}={}){
    const sheets=atlas.types.map(type=>{const image=new Image();image.src=assetRoot+type.file;return image;});
    const glitchLayer=document.createElement('canvas'),glitchContext=glitchLayer.getContext('2d');
    function draw(ctx,entity,x,y,angle,phase,anomaly=false){
      const type=TYPES[entity.kind],meta=atlas.types[entity.kind],sheet=sheets[entity.kind];
      if(!sheet.complete||!sheet.naturalWidth)return;
      const heading=((Math.round(angle/(Math.PI/2))%4)+4)%4;
      const frame=((Math.floor(phase/(Math.PI*2)*4)%4)+4)%4;
      const [sx,sy,sw,sh,ax,ay]=meta.frames[heading*4+frame],scale=type.height/meta.height;
      const decay=Math.min(1,(entity.sunAge??0)/SUN_LIFETIME);
      if(decay>=1)return;
      ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha*=(1-decay)*Math.min(1,entity.spawnAge??1);
      ctx.fillStyle='#0009';ctx.beginPath();ctx.ellipse(x,y+3,Math.max(4,sw*scale*.32),2.2,0,0,Math.PI*2);ctx.fill();
      if(decay>0){
        // Stable missing blocks make the moss crumble without particles or readback.
        const left=x-ax*scale,top=y+3-ay*scale,width=sw*scale,height=sh*scale,cell=3;
        ctx.beginPath();
        for(let row=0;row<Math.ceil(height/cell);row++)for(let col=0;col<Math.ceil(width/cell);col++){
          const noise=((Math.imul(col+1,374761393)^Math.imul(row+1,668265263)^Math.imul((entity.id??0)+1,1274126177))>>>0)/4294967296;
          if(noise>=decay)ctx.rect(left+col*cell,top+row*cell,Math.min(cell,width-col*cell),Math.min(cell,height-row*cell));
        }
        ctx.clip();
      }
      ctx.drawImage(sheet,sx,sy,sw,sh,x-ax*scale,y+3-ay*scale,sw*scale,sh*scale);
      if(anomaly){ctx.globalAlpha*=.35;ctx.globalCompositeOperation='screen';ctx.drawImage(sheet,sx,sy,sw,sh,x-ax*scale+1,y+3-ay*scale,sw*scale,sh*scale);}
      ctx.restore();
    }
    function drawGlitch(ctx,width,height,time,strength){
      if(strength<.03)return;
      // Short low-opacity scanline displacement, never full-screen flashing.
      const pulse=Math.floor(time*13);if(pulse%5>1)return;
      if(glitchLayer.width!==Math.ceil(width)||glitchLayer.height!==Math.ceil(height)){glitchLayer.width=Math.ceil(width);glitchLayer.height=Math.ceil(height);}
      const transform=ctx.getTransform();
      const x=Math.round(transform.e),y=Math.round(transform.f),w=Math.round(width*transform.a),h=Math.round(height*transform.d);
      glitchContext.clearRect(0,0,width,height);glitchContext.drawImage(ctx.canvas,x,y,w,h,0,0,width,height);
      ctx.save();ctx.globalAlpha=.2*strength;
      for(let i=0;i<4;i++){
        const sy=((pulse*29+i*73)%Math.max(1,height-8)),sh=2+(i%3)*2,shift=Math.sin(pulse*3+i)*8*strength;
        ctx.drawImage(glitchLayer,0,sy,width,sh,shift,sy,width,sh);
        ctx.fillStyle=i%2?'#552b9e':'#174b73';ctx.fillRect(0,sy,width,1);
      }
      ctx.restore();
    }
    return {draw,drawGlitch,sheets};
  }
  const api={TYPES,DAY_COUNT,NIGHT_COUNT,SUN_RUNNER_CHANCE,SUN_LIFETIME,HEARING_MEMORY,SPAWN_START_INTERVAL,SPAWN_MIN_INTERVAL,SPAWN_INTERVAL_STEP,attackOutcome,playerNoise,populationForLight,inPolygon,createEcology,createRenderer};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else globalThis.MossCreatures=api;
})();
