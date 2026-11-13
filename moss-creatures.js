/* Black-moss wildlife: simulation is independent of drawing and browser APIs. */
(() => {
  'use strict';
  const TYPES=[
    {id:'encoberto',name:'Encoberto',daySpeed:5,nightSpeed:31,runSpeed:57,height:30,reach:240},
    {id:'rastejante',name:'Rastejante',daySpeed:7,nightSpeed:43,runSpeed:76,height:20,reach:310},
    {id:'coroa',name:'Coroa',daySpeed:3,nightSpeed:22,runSpeed:45,height:32,reach:190}
  ];
  const DAY_COUNT=6,NIGHT_COUNT=42,SUN_RUNNER_CHANCE=.05;
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
    let entities=[],night=false,initialized=false,serial=0,spawnClock=0,shadeClock=0,regions=[],glitch=0;
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
    function shelter(entity){entity.indoors=true;entity.destination=null;entity.speed=0;Object.assign(entity,door(entity.home));}
    function add(target,nightOnly=false,forcedHome){
      const homes=nearHomes(target);if(!homes.length)return null;
      const home=forcedHome??homes[Math.floor(random()*homes.length)].index;
      // One roll per creature, never a per-frame roll that eventually becomes inevitable.
      const entity={id:serial++,kind:serial%3,home,nightOnly,sunRunner:random()<SUN_RUNNER_CHANCE,
        x:0,y:0,angle:Math.PI,phase:random()*Math.PI*2,speed:0,indoors:false,destination:null,retarget:0,
        roomX:90+random()*280,roomY:125+random()*125,roomPhase:0,roomAngle:Math.PI,roomDestination:null};
      entities.push(entity);
      if(night||entity.sunRunner){const p=openPoint(target);if(p)Object.assign(entity,p);else shelter(entity);}
      else if(entity.id%3===0){const p=shadePoint(home);if(p)Object.assign(entity,p);else shelter(entity);}
      else shelter(entity);
      return entity;
    }
    function reset(light,target){
      entities=[];roomResidents.clear();serial=0;spawnClock=0;glitch=0;shadeClock=0;
      night=light.daylight<.28;regions=getShadows(light);initialized=true;
      for(let i=0;i<(night?NIGHT_COUNT:DAY_COUNT);i++)add(target,i>=DAY_COUNT);
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
    function update(dt,{light,target,room=-1,roomTarget=null,moveRoom=null}){
      if(!initialized)reset(light,target);
      dt=Math.max(0,Math.min(.1,dt));shadeClock-=dt;
      if(shadeClock<=0){regions=getShadows(light);shadeClock=.35;}
      const nextNight=night?light.daylight<.45:light.daylight<.28;
      if(nextNight!==night){
        night=nextNight;
        if(night)for(const entity of entities){
          if(entity.indoors){const p=door(entity.home);if(!isBlocked(p.x,p.y,5)){Object.assign(entity,p);entity.indoors=false;}}
          entity.destination=null;
        }
      }
      if(night&&entities.length<NIGHT_COUNT){
        spawnClock+=dt*5;
        while(spawnClock>=1&&entities.length<NIGHT_COUNT){add(target,true);spawnClock--;}
      }
      if(room>=0&&!roomResidents.has(room)){
        roomResidents.set(room,true);
        if(!entities.some(e=>e.home===room)&&random()<.45){const resident=add(target,false,room);if(resident&&!night)shelter(resident);}
      }
      let nearbyAnomaly=0;
      for(const entity of entities){
        const type=TYPES[entity.kind],restricted=!night&&!entity.sunRunner;
        if(!night&&entity.nightOnly&&!entity.sunRunner){shelter(entity);entity.retired=true;continue;}
        if(distance(entity,target)>1150&&room!==entity.home){
          const homes=nearHomes(target);entity.home=homes[entity.id%homes.length]?.index??entity.home;
          if(night||entity.sunRunner){const p=openPoint(target);if(p){Object.assign(entity,p);entity.indoors=false;entity.destination=null;}}
          else shelter(entity);
        }
        if(entity.indoors){
          if(entity.home===room&&roomTarget&&moveRoom){
            if(!entity.roomDestination||distance({x:entity.roomX,y:entity.roomY},entity.roomDestination)<8)
              entity.roomDestination={x:76+random()*310,y:110+random()*150};
            const to=night||entity.sunRunner?roomTarget:entity.roomDestination;
            const dx=to.x-entity.roomX,dy=to.y-entity.roomY,len=Math.hypot(dx,dy)||1;
            const speed=restricted?type.daySpeed:type.nightSpeed;
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
        const chasing=(!restricted)&&distance(entity,target)<type.reach;
        if(!entity.destination||entity.retarget<=0||distance(entity,entity.destination)<10){
          entity.destination=restricted?shadePoint(entity.home):openPoint(entity,25,110);
          entity.retarget=2+random()*4;
        }
        const to=chasing?target:entity.destination;
        const speed=restricted?type.daySpeed:!night&&entity.sunRunner?type.runSpeed:type.nightSpeed;
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
    return {reset,update,isShaded:shaded,get entities(){return entities;},get night(){return night;},get glitch(){return night?0:glitch;}};
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
      ctx.save();ctx.imageSmoothingEnabled=false;
      ctx.fillStyle='#0009';ctx.beginPath();ctx.ellipse(x,y+3,Math.max(4,sw*scale*.32),2.2,0,0,Math.PI*2);ctx.fill();
      ctx.drawImage(sheet,sx,sy,sw,sh,x-ax*scale,y+3-ay*scale,sw*scale,sh*scale);
      if(anomaly){ctx.globalAlpha=.35;ctx.globalCompositeOperation='screen';ctx.drawImage(sheet,sx,sy,sw,sh,x-ax*scale+1,y+3-ay*scale,sw*scale,sh*scale);}
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
  const api={TYPES,DAY_COUNT,NIGHT_COUNT,SUN_RUNNER_CHANCE,inPolygon,createEcology,createRenderer};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else globalThis.MossCreatures=api;
})();
