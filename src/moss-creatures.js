/* Black-moss wildlife: simulation is independent of drawing and browser APIs. */
(() => {
  'use strict';
  const TYPES=[
    {id:'encoberto',name:'Encoberto',role:'Caçador esguio',daySpeed:5,nightSpeed:74,runSpeed:102,height:30,reach:240,
      damage:.25,damageMin:25,damageMax:50,wound:'scratch',attackReach:15,bikeDamage:10,knockOffChance:.68,attackInterval:1.7,stun:1,
      targets:['chest','abdomen','leftArm','rightArm'],bikeTargets:['handlebar','motor']},
    {id:'rastejante',name:'Rastejante',role:'Quadrúpede veloz',daySpeed:7,nightSpeed:98,runSpeed:126,height:20,reach:310,
      damage:.15,damageMin:5,damageMax:20,wound:'scratch',attackReach:12,bikeDamage:7,knockOffChance:.55,attackInterval:1.3,stun:.75,
      targets:['leftLeg','rightLeg','leftArm','rightArm'],bikeTargets:['frontTire','rearTire']},
    {id:'coroa',name:'Coroa',role:'Brutamontes',daySpeed:5,nightSpeed:74,runSpeed:102,height:32,reach:190,
      damage:2,damageMin:50,damageMax:80,wound:'fracture',attackReach:19,bikeDamage:22,knockOffChance:.88,attackInterval:2.4,stun:1.25,
      targets:['head','chest','leftLeg','rightLeg'],bikeTargets:['motor','handlebar','frontTire','rearTire']}
  ];
  function attackOutcome(kind,{mounted=false,speed=0,random=Math.random}={}){
    const profile=TYPES[kind]||TYPES[0];
    const damage=profile.damageMin+Math.min(profile.damageMax-profile.damageMin,Math.floor(random()*(profile.damageMax-profile.damageMin+1)));
    return {profile,damage,severity:Math.min(2,profile.damage+(mounted?Math.min(.35,Math.abs(speed)/500):0)),
      knockedOff:mounted&&random()<profile.knockOffChance};
  }
  const DAY_COUNT=12,NIGHT_COUNT=67,SUN_RUNNER_CHANCE=.05,SUN_LIFETIME=17;
  const HEARING_MEMORY=7,SPAWN_START_INTERVAL=10,SPAWN_MIN_INTERVAL=2,SPAWN_INTERVAL_STEP=2;
  function playerNoise({x,y,speed=0,running=false,vehicle=false,engineRunning=false,room=-1}){
    speed=Math.abs(speed);
    const radius=vehicle?(engineRunning?75+Math.min(125,speed*.65):speed>2?25+Math.min(35,speed*.3):0):speed>1?(running?75:32):0;
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
    let entities=[],night=false,initialized=false,serial=0,spawnClock=0,spawnInterval=SPAWN_START_INTERVAL,shadeClock=0,regions=[],glitch=0,shadeLight=null;
    const roomResidents=new Map();
    const positions=new Map(),hunters=[],brutes=[];
    let positionPool=new WeakMap();
    function snapshotPositions(){
      positions.clear();hunters.length=0;brutes.length=0;
      for(const entity of entities){
        let position=positionPool.get(entity);
        if(!position){position={x:0,y:0};positionPool.set(entity,position);}
        position.x=entity.x;position.y=entity.y;positions.set(entity,position);
        if(entity.kind===0)hunters.push(entity);
        else if(entity.kind===2)brutes.push(entity);
      }
    }
    const nearHomes=target=>getBuildings().map((b,index)=>({index,d:distance(target,{x:b[0]+b[2]*.825,y:b[1]+b[3]*.825})})).sort((a,b)=>a.d-b.d).slice(0,10);
    function door(home){const b=getBuildings()[home];return {x:b[0]+b[2]*1.155,y:b[1]+b[3]*1.65+14};}
    function shaded(x,y){
      if(!night&&shadeClock<=0&&shadeLight){regions=getShadows(shadeLight);shadeClock=.35;}
      return regions.some(region=>inPolygon(x,y,region.points));
    }
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
    function kick({x,y,angle=0,facing=angle,room=-1,range=34,stunScale=1,mounted=false,isRoomBlocked=()=>false}){
      const candidates=entities.filter(e=>!e.retired&&(room<0?!e.indoors:e.indoors&&e.home===room))
        .map(e=>({e,x:room<0?e.x:e.roomX,y:room<0?e.y:e.roomY}))
        .filter(p=>{
          const dx=p.x-x,dy=p.y-y,d=Math.hypot(dx,dy);
          if(d>range)return false;
          const forward=dx*Math.sin(angle)-dy*Math.cos(angle);
          if(mounted){
            const bikeForward=dx*Math.sin(facing)-dy*Math.cos(facing);
            const bikeSide=dx*Math.cos(facing)+dy*Math.sin(facing);
            const aimForward=Math.cos(angle-facing),aimSide=Math.sin(angle-facing);
            // Hit only the mouse-directed cone on the chosen side; never behind the bike.
            if(aimForward< -1e-8||Math.abs(aimSide)<1e-8||bikeForward< -1e-8)return false;
            if(d>1e-8&&bikeSide*aimSide<=0)return false;
            // Test the creature's body against the cone, including contact at the bike origin.
            const bodyRadius=Math.max(4,TYPES[p.e.kind].height*.25);
            const bodyAngle=d>bodyRadius?Math.asin(bodyRadius/d):Math.PI/2;
            if(d>1e-8&&Math.acos(Math.max(-1,Math.min(1,forward/d)))>Math.PI/6+bodyAngle)return false;
          }else if(d>1){
            // At contact distance, the body can overlap the forward kick even if its center misses.
            if(forward< -1e-8)return false;
            const bodyRadius=Math.max(4,TYPES[p.e.kind].height*.25);
            const bodyAngle=d>bodyRadius?Math.asin(bodyRadius/d):Math.PI/2;
            if(Math.acos(Math.max(-1,Math.min(1,forward/d)))>Math.acos(.15)+bodyAngle)return false;
          }
          for(let i=1;i<=8;i++)if(room<0?isBlocked(x+dx*i/8,y+dy*i/8,2):isRoomBlocked(x+dx*i/8,y+dy*i/8))return false;
          return true;
        }).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
      if(!candidates.length)return null;
      const hit=candidates[0],e=hit.e,dx=hit.x-x,dy=hit.y-y,d=Math.hypot(dx,dy);
      e.kickStun=(e.kind===2?1.5:e.kind===1?1.1:.9)*stunScale;
      e.kickFlight=e.kind===2?0:.3;e.kickRemaining=e.kind===1?105:e.kind===0?70:0;
      e.kickX=d>1?dx/d:Math.sin(angle);e.kickY=d>1?dy/d:-Math.cos(angle);
      e.destination=null;e.roomDestination=null;e.speed=0;e.behavior='stunned';
      return e;
    }
    function investigate(entity,position,room,sounds,visibleTarget){
      entity.pursuingPlayer=false;
      if(entity.heardRoom!==room||entity.alert===0)entity.heard=null;
      let strongest=0;
      for(const sound of sounds){
        if(!sound||(sound.room??-1)!==room||!Number.isFinite(sound.radius)||sound.radius<=0)continue;
        const radius=sound.radius*TYPES[entity.kind].reach/240*1.1;
        const strength=1-distance(position,sound)/radius;
        if(strength>strongest){
          strongest=strength;entity.heard={x:sound.x,y:sound.y};entity.heardRoom=room;entity.alert=HEARING_MEMORY;
          entity.heardPlayer=sound.player===true||sound.kind==='steps'||sound.kind==='running';
        }
      }
      // Sight is deliberately short: silent players can evade a distant hunter.
      if(visibleTarget&&distance(position,visibleTarget)<(room<0?95:45)&&
        (room>=0||!isBlocked((position.x+visibleTarget.x)/2,(position.y+visibleTarget.y)/2,2))){
        entity.pursuingPlayer=true;entity.behavior='chase';return visibleTarget;
      }
      entity.behavior=entity.heard?'investigate':'wander';
      entity.pursuingPlayer=!!entity.heard&&entity.heardPlayer;
      return entity.heard;
    }
    function add(target,nightOnly=false,forcedHome){
      if(entities.length>=NIGHT_COUNT)return null;
      const position=dispersedPoint(target,night?nightOnly&&serial%3===0:serial%3!==2);
      const homes=nearHomes(position||target);if(!homes.length)return null;
      const home=forcedHome??homes[Math.floor(random()*homes.length)].index;
      // One roll per creature, never a per-frame roll that eventually becomes inevitable.
      const entity={id:serial++,kind:serial%3,home,nightOnly,sunRunner:random()<SUN_RUNNER_CHANCE,
        x:0,y:0,angle:Math.PI,phase:random()*Math.PI*2,speed:0,indoors:false,destination:null,retarget:0,sunAge:null,
        heard:null,heardRoom:-1,heardPlayer:false,pursuingPlayer:false,alert:0,behavior:'wander',spawnAge:0,attackCooldown:0,
        roomX:90+random()*280,roomY:125+random()*125,roomPhase:0,roomAngle:Math.PI,roomDestination:null};
      entities.push(entity);
      if(position)Object.assign(entity,position);else shelter(entity);
      return entity;
    }
    function reset(light,target){
      entities=[];roomResidents.clear();positions.clear();positionPool=new WeakMap();hunters.length=0;brutes.length=0;serial=0;spawnClock=0;spawnInterval=SPAWN_START_INTERVAL;glitch=0;shadeClock=0;
      night=light.daylight<.28;regions=[];shadeLight=light;initialized=true;
      for(let i=0;i<(night?3:4);i++)add(target);
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
    function encircle(entity,interest,positions,room){
      if(!night||entity.kind!==0||!entity.pursuingPlayer||!interest)return null;
      // Each hunter must have seen or heard the player itself. Bait never
      // recruits a pack, and a lost sound does not reveal the player's location.
      const pack=hunters.filter(other=>other.kind===0&&!other.indoors&&!other.retired&&
        distance(positions.get(other),interest)<340&&
        ((other.heardPlayer&&other.alert>0&&other.heard&&distance(other.heard,interest)<80)||
          (room<0&&distance(positions.get(other),interest)<55)))
        .sort((a,b)=>a.id-b.id);
      const slot=pack.indexOf(entity);
      if(pack.length<2||slot<0)return null;
      const origin=positions.get(entity),range=distance(origin,interest);
      // One presses the target; the others spread around the escape routes.
      if(slot===0||range<30)return null;
      const leader=positions.get(pack[0]);
      const base=Math.atan2(leader.y-interest.y,leader.x-interest.x);
      const desired=base+Math.PI*2*slot/pack.length;
      const current=Math.atan2(origin.y-interest.y,origin.x-interest.x);
      const difference=Math.atan2(Math.sin(desired-current),Math.cos(desired-current));
      const angle=current+Math.max(-.65,Math.min(.65,difference));
      const radius=Math.abs(difference)>.45?Math.max(65,Math.min(range,115)):24;
      const size=getSize();
      for(const offset of [0,.35,-.35,.7,-.7]){
        const p={x:interest.x+Math.cos(angle+offset)*radius,y:interest.y+Math.sin(angle+offset)*radius};
        if(p.x<8||p.y<8||p.x>size.w-8||p.y>size.h-8)continue;
        let clear=true;
        for(let step=1;step<=8;step++)if(isBlocked(origin.x+(p.x-origin.x)*step/8,origin.y+(p.y-origin.y)*step/8,5)){clear=false;break;}
        if(clear){entity.behavior='encircle';return p;}
      }
      return null;
    }
    function ambush(entity,interest,visible,positions,room){
      if(entity.kind!==0||!interest||distance(entity,interest)<24)return null;
      const origin=positions.get(entity),dx=interest.x-origin.x,dy=interest.y-origin.y,len=Math.hypot(dx,dy)||1;
      const lateral=(entity.id%2?1:-1)*32;
      const forwardX=visible?Math.sin(visible.angle||0):dx/len;
      const forwardY=visible?-Math.cos(visible.angle||0):dy/len;
      const p={x:interest.x-forwardX*48-forwardY*lateral,y:interest.y-forwardY*48+forwardX*lateral};
      const size=getSize();if(room<0&&(p.x<8||p.y<8||p.x>size.w-8||p.y>size.h-8))return null;
      for(let step=1;step<=8;step++)if(room<0?isBlocked(origin.x+(p.x-origin.x)*step/8,origin.y+(p.y-origin.y)*step/8,5):false)return null;
      entity.behavior='ambush';return p;
    }
    function herdTowardBrute(entity,interest,positions,room){
      if(entity.kind!==1||!interest||!entity.pursuingPlayer)return null;
      const origin=positions.get(entity);let brute=null,best=250*250;
      for(const other of brutes){
        if(other.kind!==2||other.indoors||other.retired)continue;
        const position=positions.get(other),d=(position.x-interest.x)**2+(position.y-interest.y)**2;
        if(d<best){best=d;brute={position};}
      }
      if(!brute)return null;
      const bx=interest.x-brute.position.x,by=interest.y-brute.position.y,len=Math.hypot(bx,by)||1;
      const side=entity.id%2?1:-1,offset=side*26;
      const p={x:interest.x+bx/len*78-by/len*offset,y:interest.y+by/len*78+bx/len*offset};
      const size=getSize();if(room<0&&(p.x<8||p.y<8||p.x>size.w-8||p.y>size.h-8))return null;
      for(let step=1;step<=8;step++)if(room<0&&isBlocked(origin.x+(p.x-origin.x)*step/8,origin.y+(p.y-origin.y)*step/8,5))return null;
      entity.behavior='herd';return p;
    }
    function update(dt,{light,target,room=-1,roomTarget=null,moveRoom=null,sounds=[]}){
      if(!initialized)reset(light,target);
      if(!Number.isFinite(dt)||dt<=0)return;
      dt=Math.min(.1,dt);shadeClock-=dt;shadeLight=light;
      const nextNight=night?light.daylight<.45:light.daylight<.28;
      if(nextNight!==night){
        night=nextNight;
        spawnClock=0;spawnInterval=SPAWN_START_INTERVAL;
        shadeClock=0;
        if(!night)entities=entities.slice(0,DAY_COUNT);
        for(const entity of entities){
          if(entity.indoors){const p=door(entity.home);if(!isBlocked(p.x,p.y,5)){Object.assign(entity,p);entity.indoors=false;}}
          entity.destination=null;
        }
      }
      // Creatures no longer flee sunlight; shadow polygons are built on demand.
      const populationLimit=night?populationForLight(light):DAY_COUNT;
      const interval=night?spawnInterval:12;
      // Reuse far-away daytime population slots so a larger city still has encounters.
      if(!night&&room<0&&entities.length>=populationLimit){
        spawnClock+=dt;
        if(spawnClock+1e-8>=interval){
          const far=entities.findIndex(e=>!e.indoors&&distance(e,target)>1800);
          if(far>=0){const previous=entities.splice(far,1)[0];if(!add(target,false))entities.push(previous);}
          spawnClock=0;
        }
      }else
      if(entities.length<populationLimit){
        spawnClock+=dt;
        if(spawnClock+1e-8>=interval){
          const spawned=add(target,night);spawnClock=Math.max(0,spawnClock-interval);
          if(spawned)spawnInterval=Math.max(SPAWN_MIN_INTERVAL,spawnInterval-SPAWN_INTERVAL_STEP);
        }
      }else spawnClock=0;
      if(room>=0&&!roomResidents.has(room)){
        roomResidents.set(room,true);
        if(!night&&entities.length<DAY_COUNT&&!entities.some(e=>e.home===room)&&random()<.45){const resident=add(target,false,room);if(resident)shelter(resident);}
      }
      let nearbyAnomaly=0;
      snapshotPositions();
      for(const entity of entities){
        entity.spawnAge=Math.min(1,entity.spawnAge+dt);
        entity.attackCooldown=Math.max(0,(entity.attackCooldown||0)-dt);
        entity.alert=Math.max(0,entity.alert-dt);
        if(entity.alert<=1e-8){entity.alert=0;entity.heard=null;}
        const type=TYPES[entity.kind],restricted=false;

        const inRoom=entity.indoors&&entity.home===room&&roomTarget&&moveRoom;
        const interest=entity.indoors
          ?(inRoom?investigate(entity,{x:entity.roomX,y:entity.roomY},room,sounds,roomTarget):null)
          :investigate(entity,entity,-1,sounds,room<0?target:null);
        // Glitches stay threatening on foot but remain outrunnable on a bike.
        const speedScale=entity.sunRunner?1.15:1;
        if(entity.kickStun>0){
          entity.kickStun=Math.max(0,entity.kickStun-dt);entity.behavior='stunned';entity.speed=0;
          if(entity.kickFlight>0){
            const step=Math.min(dt,entity.kickFlight),travel=entity.kickRemaining*step/entity.kickFlight;
            entity.kickFlight=Math.max(0,entity.kickFlight-step);entity.kickRemaining=Math.max(0,entity.kickRemaining-travel);
            if(entity.indoors){
              if(moveRoom){const local={x:entity.roomX,y:entity.roomY};
                for(let n=0;n<Math.ceil(travel/3);n++)moveRoom(local,entity.kickX*travel/Math.ceil(travel/3),entity.kickY*travel/Math.ceil(travel/3),4);
                entity.roomX=local.x;entity.roomY=local.y;}
            }else for(let n=0;n<Math.ceil(travel/3);n++)move(entity,entity.kickX*travel/Math.ceil(travel/3),entity.kickY*travel/Math.ceil(travel/3),false);
          }
          continue;
        }
        if(entity.indoors){
          if(entity.home===room&&roomTarget&&moveRoom){
            if(!entity.roomDestination||distance({x:entity.roomX,y:entity.roomY},entity.roomDestination)<8)
              entity.roomDestination={x:76+random()*310,y:110+random()*150};
            const to=interest||entity.roomDestination;
            const dx=to.x-entity.roomX,dy=to.y-entity.roomY,len=Math.hypot(dx,dy)||1;
            const pursuing=!restricted&&(night?!!interest:entity.pursuingPlayer);
            const speed=(pursuing?(night?type.nightSpeed:type.nightSpeed*.8):type.daySpeed)*speedScale;
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
        const visibleTarget=room<0&&entity.pursuingPlayer&&distance(entity,target)<55?target:null;
        const to=herdTowardBrute(entity,interest,positions,room)||encircle(entity,interest,positions,room)||
          ambush(entity,interest,visibleTarget,positions,room)||interest||entity.destination;
        const pursuing=!restricted&&(night?chasing:entity.pursuingPlayer);
        const speed=(pursuing?(night?type.nightSpeed:type.nightSpeed*.65):type.daySpeed)*speedScale;
        entity.speed=0;
        if(to){
          const dx=to.x-entity.x,dy=to.y-entity.y,len=Math.hypot(dx,dy);
          if(len>(['encircle','ambush','herd'].includes(entity.behavior)?3:chasing?15:3)){
            const travel=move(entity,dx/len*Math.min(len,speed*dt),dy/len*Math.min(len,speed*dt),restricted);
            entity.speed=travel/Math.max(.001,dt);if(travel===0)entity.retarget=0;
          }
        }
        if(!night&&entity.sunRunner)nearbyAnomaly=Math.max(nearbyAnomaly,Math.max(0,1-distance(entity,target)/430));
      }
      entities=entities.filter(entity=>!entity.retired);
      glitch+=(nearbyAnomaly-glitch)*(1-Math.exp(-dt*6));
    }
    return {reset,update,kick,isShaded:shaded,get entities(){return entities;},get night(){return night;},get spawnInterval(){return spawnInterval;},get glitch(){return night?0:glitch;}};
  }
  function createRenderer(atlas,{assetRoot='assets/creatures/'}={}){
    const sheets=atlas.types.map(type=>{const image=new Image();image.src=assetRoot+type.file;return image;});
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
      if(entity.kickFlight>0)y-=Math.sin(Math.PI*(1-entity.kickFlight/.3))*(entity.kind===1?15:10);
      if(entity.kickStun>0){ctx.fillStyle='#e8d294';ctx.fillRect(x-4,y-type.height-6,2,2);ctx.fillRect(x+4,y-type.height-8,2,2);}
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
      if(anomaly){
        const left=x-ax*scale,top=y+3-ay*scale,width=sw*scale,height=sh*scale;
        ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=entity.pursuingPlayer ? .62 : .22;
        ctx.drawImage(sheet,sx,sy,sw,sh,left+Math.sin(phase*3)*2,y+3-ay*scale,width,height);
        if(entity.pursuingPlayer){
          const pulse=Math.sin(phase*5+(entity.id||0));
          ctx.globalAlpha*=.65;ctx.fillStyle='#a84cff';ctx.fillRect(left-3+pulse*2,top+height*.24,width*.52,Math.max(2,height*.12));
          ctx.fillStyle='#49dce7';ctx.fillRect(left+width*.31-pulse*2,top+height*.58,width*.6,Math.max(2,height*.1));
          ctx.globalAlpha*=.55;ctx.drawImage(sheet,sx,sy,sw,sh,left-2-pulse*2,top,width,height);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    function drawGlitch(ctx,width,height,time,strength){
      if(strength<.03)return;
      // Brief, low-opacity interference across the entire display.
      const pulse=Math.floor(time*13);if(pulse%5>1)return;
      ctx.save();ctx.globalAlpha=.035*strength;
      ctx.fillStyle='#552b9e';ctx.fillRect(0,0,width,height);
      ctx.globalAlpha=.38*strength;
      for(let i=0;i<7;i++){
        const sy=((pulse*29+i*47)%Math.max(1,height-8)),sh=2+(i%3)*3;
        ctx.fillStyle=i%2?'#552b9e':'#174b73';
        ctx.fillRect(0,sy,width,sh);
      }
      ctx.restore();
    }
    return {draw,drawGlitch,sheets};
  }
  const api={TYPES,DAY_COUNT,NIGHT_COUNT,SUN_RUNNER_CHANCE,SUN_LIFETIME,HEARING_MEMORY,SPAWN_START_INTERVAL,SPAWN_MIN_INTERVAL,SPAWN_INTERVAL_STEP,attackOutcome,playerNoise,populationForLight,inPolygon,createEcology,createRenderer};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else globalThis.MossCreatures=api;
})();
