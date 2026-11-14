(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let RENDER_SCALE = 2;
  const DISPLAY_W=640,DISPLAY_H=360;
  const ACTOR_VISUAL_SCALE=.60;
  let W=DISPLAY_W,H=DISPLAY_H,gameScene=gameSceneViewport('title');
  const ignition=createBikeIgnition({canvas,ctx,width:W,height:H,
    getCondition:()=>bikeParts.motor*.7+bikeLife*.3,
    onStart:()=>{keys.clear();if(fuel<=0||bikeLife<=0){dismount();setToast('VERIFIQUE O COMBUSTÍVEL E O ESTADO DA MOTO.');return;}bikeEngineRunning=true;bikeRpm=1000;setToast('MOTO LIGADA — BOA VIAGEM!');updateObjective();},
    onCancel:()=>{keys.clear();setToast('PARTIDA CANCELADA — USE O BOTÃO LIGAR MOTO OU R PARA TENTAR NOVAMENTE.');updateObjective();},
    onFail:()=>setToast('O MOTOR NÃO PEGOU — GIRE A CHAVE NOVAMENTE.')
  });
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  const spriteAtlas=SURVIVOR_ATLAS_128;
  const bikeSpriteSheets=['bike'].map(kind=>{
    const image=new Image();image.src='assets/sprites-128/'+spriteAtlas[kind].file;return image;
  });
  const survivorSpriteSheet=new Image();survivorSpriteSheet.src='assets/sprites-128/'+spriteAtlas.survivor.file;
  const survivorWalkSheet=new Image();
  const survivorWalkFrames=SURVIVOR_WALK_V2.frames;
  survivorWalkSheet.src='assets/sprites-128/'+SURVIVOR_WALK_V2.file;
  const survivorWalkRightSheet=new Image();
  survivorWalkRightSheet.src='assets/sprites-128/'+SURVIVOR_WALK_D.file;
  const seatedRiderSpriteSheet=new Image();seatedRiderSpriteSheet.src='assets/sprites-128/'+MOUNTED_BIKE_ART.file;
  function bikeSpriteSource(direction,riding=false){return bikeSpriteSheets[riding?1:0];}
  function bikeSpriteMetadata(riding=false){return spriteAtlas[riding?'mounted':'bike'];}
  let mountedSpritesBuilt=false;
  function bikeSpritesReady(){return mountedSpritesBuilt;}
  const BIKE_DIRECTION_COUNT=128,BIKE_SPRITE_COLUMNS=16;
  const BIKE_DIRECTION_STEP=Math.PI*2/BIKE_DIRECTION_COUNT;
  const VISUAL_DIRECTION_STRIDE=1,VISUAL_DIRECTION_STEP=BIKE_DIRECTION_STEP*VISUAL_DIRECTION_STRIDE;
  const bikeSpriteBounds=spriteAtlas.bike.frames;
  const bikeVisualFacings = new Map();
  const bikeBlendLayer=document.createElement('canvas');
  bikeBlendLayer.width=160*RENDER_SCALE;bikeBlendLayer.height=160*RENDER_SCALE;
  const bikeBlendContext=bikeBlendLayer.getContext('2d');
  const bikeOcclusionLayer=document.createElement('canvas');
  bikeOcclusionLayer.width=bikeBlendLayer.width;bikeOcclusionLayer.height=bikeBlendLayer.height;
  const bikeOcclusionContext=bikeOcclusionLayer.getContext('2d');
  let bikeBlendStamp='';
  function bikeMotion(speed,time,riding,phase=0,angle=0) {
    const travel=Math.min(1,Math.abs(speed)/110);
    const idle=bikeEngineRunning ? .08 : 0;
    return {compression:1-(Math.sin(phase)*.008*travel+Math.sin(time*32)*idle*.012),
      lean:Math.max(-.16,Math.min(.16,-(bike.bank||0)*Math.sign(speed)*Math.cos(angle)*.16))*travel};
  }
  function bikeTurnDelta(speed,steering,handlebar,grip,dt) {
    const travel=Math.abs(speed);
    // Tight parking turns, with a progressive reduction at road speeds.
    const turnRate=3.4*(travel/(travel+12))/(1+Math.pow(travel/150,1.4));
    // Worn parts soften steering without making ordinary corners impractical.
    const steeringControl=.65+.35*Math.max(0,Math.min(100,handlebar))/100;
    const tireGrip=.8+.2*Math.max(0,Math.min(100,grip))/100;
    return Math.sign(speed)*steering*turnRate*steeringControl*tireGrip*dt;
  }
  function updateBikeSteering(current,input,dt) {
    // Release promptly; cross through center continuously when changing sides.
    const response=input===0?24:current*input<0?22:16;
    return input+(current-input)*Math.exp(-response*dt);
  }
  function smoothBikeFacing(angle, time, view) {
    let facing = bikeVisualFacings.get(view);
    if (!facing || time < facing.time || time - facing.time > .25) {
      facing = {angle, time, direction: bikeSpritePose(angle, 0, time).direction};
      bikeVisualFacings.set(view, facing);
      return facing;
    }
    const difference = Math.atan2(Math.sin(angle - facing.angle), Math.cos(angle - facing.angle));
    // The silhouette follows the same heading as the tires and travel vector.
    facing.angle += difference;
    facing.time = time;
    const fromSprite = Math.atan2(Math.sin(facing.angle - facing.direction * BIKE_DIRECTION_STEP), Math.cos(facing.angle - facing.direction * BIKE_DIRECTION_STEP));
    // A small deadband prevents flicker when steering near a sprite boundary.
    if (Math.abs(fromSprite) > VISUAL_DIRECTION_STEP*.6) facing.direction = bikeSpritePose(facing.angle, 0, time).direction;
    return facing;
  }
  function bikeSpritePose(angle, speed, time) {
    const turn = Math.PI * 2;
    const heading = ((angle % turn + turn) % turn) / BIKE_DIRECTION_STEP;
    const direction = Math.round(heading/VISUAL_DIRECTION_STRIDE)*VISUAL_DIRECTION_STRIDE % BIKE_DIRECTION_COUNT;
    return { direction,
      frame: Math.abs(speed) > 2 ? Math.floor(time * Math.min(12, 4 + Math.abs(speed) / 25)) % 4 : 0 };
  }
  function bikeGroundLayout(x, y, size, direction, riding=false,visualScale=ACTOR_VISUAL_SCALE) {
    const metadata=bikeSpriteMetadata(riding);
    const [sx, sy, sw, sh] = metadata.frames[direction];
    const sheet=bikeSpriteSource(direction,riding);
    const scale = (metadata.pixelsPerUnit ? size/50/metadata.pixelsPerUnit : size / ((sheet.naturalWidth||sheet.width) / BIKE_SPRITE_COLUMNS))*visualScale;
    const contacts = metadata.wheelContacts[direction];
    const anchorX = contacts.reduce((sum, point) => sum + point[0], 0) / contacts.length;
    const anchorY = contacts.reduce((sum, point) => sum + point[1], 0) / contacts.length;
    const left = x - anchorX * scale, top = y + 5 - anchorY * scale;
    return {sx, sy, sw, sh, left, top, width: sw * scale, height: sh * scale,riding,
      riderOffsetX: (sw / 2 - anchorX) * scale,
      riderOffsetY: -5.5 + (sh - anchorY) * scale,
      contacts: contacts.map(([px, py]) => [left + px * scale, top + py * scale])};
  }
  function buildMountedSprites() {
    if(mountedSpritesBuilt||!bikeSpriteSheets[0].complete||!bikeSpriteSheets[0].naturalWidth||!seatedRiderSpriteSheet.complete||!seatedRiderSpriteSheet.naturalWidth)return;
    const composed=createMountedRiderAtlas({
      rider:seatedRiderSpriteSheet,bike:bikeSpriteSheets[0],atlas:spriteAtlas,
      layout:direction=>bikeGroundLayout(0,0,50,direction,false,1)
    });
    bikeSpriteSheets[1]=composed.sheet;spriteAtlas.mounted=composed.metadata;mountedSpritesBuilt=true;
    bikeBlendStamp='';bikeShadowMasks.clear();
  }
  const DAY_LENGTH_SECONDS = 180;
  let startHour = 15;
  const bikeShadowMasks = new Map();
  const nightLayer = document.createElement('canvas');
  nightLayer.width = W; nightLayer.height = H;
  const nightContext = nightLayer.getContext('2d');
  const headlightLayer = document.createElement('canvas');
  headlightLayer.width = W; headlightLayer.height = H;
  const headlightContext = headlightLayer.getContext('2d');
  let lightingCache=null,lightingTime,lightingHour,lightingWidth,lightingHeight;
  function worldLighting(time) {
    if(lightingCache&&time===lightingTime&&startHour===lightingHour&&W===lightingWidth&&H===lightingHeight)return lightingCache;
    lightingTime=time;lightingHour=startHour;lightingWidth=W;lightingHeight=H;
    const totalHours = startHour + Math.max(0, time) * 24 / DAY_LENGTH_SECONDS;
    const hour = totalHours % 24;
    const solarAngle = (hour - 6) * Math.PI / 12;
    const sunElevation = Math.sin(solarAngle);
    const amount = Math.max(0, Math.min(1, (sunElevation + .12) / .85));
    const daylight = amount * amount * (3 - 2 * amount);
    const night = 1 - daylight;
    const moon = sunElevation < 0;
    const sourceAngle = solarAngle + (moon ? Math.PI : 0);
    // World +X is east, -X is west, and -Y is north. Project light like the map.
    const sourceWorldX = Math.cos(sourceAngle);
    const sourceWorldY = -.35 * Math.sin(sourceAngle);
    const elevation = Math.max(0, Math.sin(sourceAngle));
    const sourceX = (sourceWorldX - sourceWorldY) * ISO_X;
    const sourceY = (sourceWorldX + sourceWorldY) * ISO_Y - elevation * .8;
    const sourceDistance = Math.hypot(sourceX, sourceY) || 1;
    const warmth = 1 - Math.max(0, sunElevation);
    const solarColor = [255,244-82*warmth,221-126*warmth];
    const twilight = Math.max(0,Math.min(1,1+sunElevation/.22));
    const color = [144,173,237].map((value,i)=>Math.round(value*(1-twilight)+solarColor[i]*twilight));
    return lightingCache={hour, day: Math.floor(totalHours / 24) + 1, daylight, night, moon, elevation,
      sunWorldX: Math.cos(solarAngle), sunWorldY: -.35 * sunElevation,
      sourceWorldX, sourceWorldY, color,
      sourceX: W / 2 + sourceX / sourceDistance * W * .7,
      sourceY: H / 2 + sourceY / sourceDistance * H * .85,
      origin: Math.abs(sourceWorldX) < .27 ? 'A PINO' : sourceWorldX > 0 ? 'LESTE' : 'OESTE',
      dusk: Math.max(0, 1 - Math.abs(sunElevation) / .35),
      shadowX: -(sourceWorldX - sourceWorldY) * ISO_X,
      shadowY: -(sourceWorldX + sourceWorldY) * ISO_Y,
      shadowLength: Math.min(64,16/Math.max(.2,elevation)),
      shadowAlpha: (moon ? .17 : .5) * Math.pow(elevation,.4),
      period: hour >= 5 && hour < 7 ? 'AMANHECER' : hour >= 7 && hour < 17 ? 'DIA' : hour >= 17 && hour < 19 ? 'ENTARDECER' : 'NOITE'};
  }
  function bikeShadowMask(direction,riding=false) {
    const key=direction+':'+riding;
    if (bikeShadowMasks.has(key)) return bikeShadowMasks.get(key);
    const [sx, sy, sw, sh] = bikeSpriteMetadata(riding).frames[direction];
    const mask = document.createElement('canvas'); mask.width = sw; mask.height = sh;
    const painter = mask.getContext('2d');
    painter.drawImage(bikeSpriteSource(direction,riding), sx, sy, sw, sh, 0, 0, sw, sh);
    painter.globalCompositeOperation = 'source-in'; painter.fillStyle = '#03060b'; painter.fillRect(0, 0, sw, sh);
    bikeShadowMasks.set(key, mask);
    return mask;
  }
  bikeSpriteSheets.forEach(image => image.addEventListener('load', () => {
    buildMountedSprites();
    // Shadow masks are created lazily for the poses actually drawn.
  }));
  survivorSpriteSheet.addEventListener('load',buildMountedSprites);
  seatedRiderSpriteSheet.addEventListener('load',buildMountedSprites);
  function bikeLightPose(view = 'world') {
    if (!bikeSpritesReady()) return null;
    const chase = view === 'chase';
    const center = chase ? {x:0,y:0} : projectPoint(bike.x,bike.y);
    const facing = bikeVisualFacings.get(chase ? 'chase' : 'world');
    // Use the rendered 128-way pose as the lamp axis so the beam cannot drift
    // away from the discrete headlight anchor while the bike turns.
    const angle = facing ? facing.direction * BIKE_DIRECTION_STEP : chase ? 0 : projectFacing(bike.angle);
    const direction = facing ? facing.direction : bikeSpritePose(angle,0,0).direction;
    const riding=chase||mounted,metadata=bikeSpriteMetadata(riding);
    const ground=bikeGroundLayout(center.x,center.y,50,direction,riding),[mx,my]=metadata.headlightAnchors[direction],scale=ground.width/ground.sw;
    const motion=facing?.motion||{compression:1,lean:0};
    const rawX=ground.left+mx*scale,rawY=ground.top+my*scale;
    const x=rawX+motion.lean*(rawY-center.y-5),y=center.y+5+(rawY-center.y-5)*motion.compression;
    // Direction zero shows the rear: the front lamp is hidden behind the tank.
    // Fade its lens glow into view only as the front turns toward the camera.
    const visibility=Math.max(0,Math.min(1,(.3-Math.cos(angle))/.6));
    if (!chase) return {x,y,angle,direction,visibility};
    const tilt = chaser.steer * .13;
    return {x:chaser.x + (x*Math.cos(tilt)-y*Math.sin(tilt))*1.55,
      y:CHASE_BIKE_Y + (x*Math.sin(tilt)+y*Math.cos(tilt))*1.55,angle:angle+tilt,direction,visibility};
  }
  const worldShadowLayer = document.createElement('canvas');
  worldShadowLayer.width = W; worldShadowLayer.height = H;
  const worldShadowContext = worldShadowLayer.getContext('2d');
  worldShadowContext.imageSmoothingEnabled = false;
  const softShadowLayer=document.createElement('canvas');
  softShadowLayer.width=W;softShadowLayer.height=H;
  const softShadowContext=softShadowLayer.getContext('2d');
  function drawBikeContactShadow(x, y, ground) {
    const first = ground.contacts[0], last = ground.contacts[ground.contacts.length - 1];
    const wheelbase = Math.hypot(last[0]-first[0],last[1]-first[1]);
    const rotation = wheelbase > 1 ? Math.atan2(last[1]-first[1],last[0]-first[0]) : -Math.PI/2;
    ctx.save();
    const radius = Math.max(8*ACTOR_VISUAL_SCALE,wheelbase/2+5*ACTOR_VISUAL_SCALE);
    ctx.translate((first[0]+last[0])/2,(first[1]+last[1])/2);
    ctx.rotate(rotation);ctx.scale(1,.38);
    const contact = ctx.createRadialGradient(0,0,0,0,0,radius);
    contact.addColorStop(0,'#02070978');contact.addColorStop(.55,'#02070938');contact.addColorStop(1,'#02070900');
    ctx.fillStyle=contact;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
    ctx.save();
    ground.contacts.forEach(([px,py])=>{
      ctx.save();ctx.translate(px,py+.25);ctx.scale(1,.42);
      const tireRadius=4.5*ACTOR_VISUAL_SCALE;
      const tire=ctx.createRadialGradient(0,0,.6*ACTOR_VISUAL_SCALE,0,0,tireRadius);
      tire.addColorStop(0,'#010508d9');tire.addColorStop(.45,'#01050899');tire.addColorStop(1,'#01050800');
      ctx.fillStyle=tire;ctx.fillRect(-tireRadius,-tireRadius,tireRadius*2,tireRadius*2);ctx.restore();
    });
    ctx.restore();
  }
  function drawBikeCastShadow(x, y, ground, direction, light, target) {
    const first=ground.contacts[0],last=ground.contacts[ground.contacts.length-1];
    const dx=last[0]-first[0],dy=last[1]-first[1];
    const height=Math.max(18,ground.height*.8);
    const castX=light.shadowX*light.shadowLength/height,castY=light.shadowY*light.shadowLength/height;
    const mask=bikeShadowMask(direction,ground.riding),scale=ground.width/ground.sw;
    // Project narrow columns from the wheel contact line. Clamp outside the
    // wheelbase: extrapolating it makes handlebars cast sideways at sharp angles.
    // Near head-on views the contacts merge, so use their midpoint instead.
    const separation=Math.abs(dx),blend=Math.min(1,separation/3);
    const depth=.12;
    target.save();target.imageSmoothingEnabled=true;
    for(let column=0;column<ground.sw;column+=2) {
      const width=Math.min(2,ground.sw-column);
      const px=ground.left+(column+width/2)*scale;
      const along=separation>.001?Math.max(0,Math.min(1,(px-first[0])/dx)):.5;
      const baseline=(first[1]+last[1])/2+(along-.5)*dy*blend;
      target.save();target.translate(px,baseline);
      target.transform(1,0,-castX,depth-castY,0,0);
      target.drawImage(mask,column,0,width,ground.sh,
        -width*scale/2,ground.top-baseline,width*scale,ground.height);
      target.restore();
    }
    target.restore();
  }
  function drawPersonCastShadow(x,y,height,light,target) {
    const reach=height*ACTOR_VISUAL_SCALE*light.shadowLength/24;
    const dx=light.shadowX*reach,dy=light.shadowY*reach;
    target.fillStyle='#03060b';
    target.beginPath();
    target.ellipse(x+dx/2,y+5+dy/2,Math.hypot(dx,dy)/2+3,3*ACTOR_VISUAL_SCALE,Math.atan2(dy,dx),0,Math.PI*2);
    target.fill();
  }
  function drawBikeGroundShadow(x,y,ground,direction,time) {
    const light=worldLighting(time);
    ctx.save();ctx.globalAlpha=light.shadowAlpha;ctx.filter='blur('+(light.moon?1.7:.6+(1-light.elevation)*1.2)+'px)';
    drawBikeCastShadow(x,y,ground,direction,light,ctx);ctx.restore();
    drawBikeContactShadow(x,y,ground);
  }
  function shadowHull(points) {
    const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),hull=[];
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for(const p of sorted){while(hull.length>1&&cross(hull[hull.length-2],hull[hull.length-1],p)<=0)hull.pop();hull.push(p);}
    const lower=hull.length;
    for(let i=sorted.length-2;i>=0;i--){const p=sorted[i];while(hull.length>lower&&cross(hull[hull.length-2],hull[hull.length-1],p)<=0)hull.pop();hull.push(p);}
    return hull;
  }
  function drawWorldGroundShadows(time) {
    const light=worldLighting(time),target=worldShadowContext;
    target.clearRect(0,0,worldShadowLayer.width,worldShadowLayer.height);target.save();target.fillStyle='#03060b';
    buildings.forEach(([x,y,w,h],index)=>{
      const corner=projectPoint(x,y),pad=184;
      if(corner.x+w*1.65*ISO_X < -pad||corner.x-h*1.65*ISO_X>W+pad||corner.y>H+pad||corner.y+(w+h)*1.65*ISO_Y < -pad)return;
      const shape=isoBuildingGeometry(x,y,w,h,index);
      const projected=shape.roof.map((roof,i)=>{
        const distance=Math.min(180,(shape.base[i].y-roof.y)*light.shadowLength/24);
        return {x:roof.x+light.shadowX*distance,y:shape.base[i].y+light.shadowY*distance};
      });
      const points=shape.base.concat(projected);
      if(points.every(p=>p.x < -4)||points.every(p=>p.x>W+4)||points.every(p=>p.y < -4)||points.every(p=>p.y>H+4))return;
      const hull=shadowHull(points);
      target.beginPath();hull.forEach((p,i)=>i?target.lineTo(p.x,p.y):target.moveTo(p.x,p.y));target.closePath();target.fill();
    });
    if(bikeSpritesReady()) {
      const p=projectPoint(bike.x,bike.y),facing=smoothBikeFacing(projectFacing(bike.angle),time,'world');
      const ground=bikeGroundLayout(p.x,p.y,50,facing.direction,mounted);
      drawBikeCastShadow(p.x,p.y,ground,facing.direction,light,target);
    }
    if(!mounted){const p=projectPoint(player.x,player.y);drawPersonCastShadow(p.x,p.y,22,light,target);}
    target.restore();
    // Composite the combined mask once so overlapping objects do not multiply the darkness.
    softShadowContext.clearRect(0,0,softShadowLayer.width,softShadowLayer.height);
    softShadowContext.filter='blur('+((light.moon?1.7:.6+(1-light.elevation)*1.2)/RENDER_SCALE)+'px)';
    softShadowContext.drawImage(worldShadowLayer,0,0);
    ctx.save();ctx.globalAlpha=light.shadowAlpha;
    ctx.drawImage(softShadowLayer,0,0);ctx.restore();
  }
  function drawDayNightLighting(time, view = 'world') {
    const light = worldLighting(time);
    ctx.save();
    const [red,green,blue] = light.color;
    ctx.fillStyle = 'rgba('+red+','+green+','+blue+',' + (.025 * light.daylight + .13 * light.dusk) + ')';ctx.fillRect(0,0,W,H);
    // The light source travels across the map instead of applying a fixed wash.
    const glow = ctx.createRadialGradient(light.sourceX,light.sourceY,0,light.sourceX,light.sourceY,W*1.25);
    const strength = light.moon ? .045 * light.elevation : .06 * light.daylight + .15 * light.dusk;
    glow.addColorStop(0,'rgba('+red+','+green+','+blue+','+strength+')');
    glow.addColorStop(1,'rgba('+red+','+green+','+blue+',0)');
    ctx.globalCompositeOperation='screen';ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='source-over';
    const darkness = .06 + light.night * .55;
    nightContext.clearRect(0,0,nightLayer.width,nightLayer.height);
    nightContext.globalCompositeOperation = 'source-over';
    nightContext.fillStyle = 'rgba(5,14,35,' + darkness + ')';nightContext.fillRect(0,0,W,H);
    const lamp = light.night>.02 && (view==='chase' || state==='drive') && bikeHeadlightOn && bikeEngineRunning && bikeLife>0 && fuel>0 ? bikeLightPose(view) : null;
    if(lamp) {
      const fx=Math.sin(lamp.angle),fy=-Math.cos(lamp.angle);
      const sx=lamp.x,sy=lamp.y,ex=sx+fx*145,ey=sy+fy*145;
      const target=headlightContext;
      target.clearRect(0,0,headlightLayer.width,headlightLayer.height);
      const beam=target.createLinearGradient(sx,sy,ex,ey);
      beam.addColorStop(0,'rgba(0,0,0,.97)');beam.addColorStop(.48,'rgba(0,0,0,.82)');beam.addColorStop(1,'rgba(0,0,0,0)');
      target.fillStyle=beam;
      target.beginPath();target.moveTo(sx-fy*5,sy+fx*5);target.lineTo(ex-fy*42,ey+fx*42);target.lineTo(ex+fy*42,ey-fx*42);target.lineTo(sx+fy*5,sy-fx*5);target.closePath();target.fill();
      // The beam lights the road; the same blended sprite blocks it on the bike.
      target.save();target.globalCompositeOperation='destination-out';
      target.imageSmoothingEnabled=false;
      if(view==='chase') {
        target.translate(chaser.x,CHASE_BIKE_Y);target.rotate(chaser.steer*.13);target.scale(1.55,1.55);
      } else {
        const center=projectPoint(bike.x,bike.y);target.translate(center.x,center.y);
      }
      const motion=bikeVisualFacings.get(view)?.motion||{compression:1,lean:0};
      target.translate(0,5);target.transform(1,0,motion.lean,motion.compression,0,0);target.translate(0,-5);
      // Make even cross-faded edge pixels fully occlude the road beam.
      target.drawImage(bikeOcclusionLayer,-80,-80,160,160);
      target.restore();
      nightContext.globalCompositeOperation='destination-out';
      // Blur the cutout mask so the beam fades into the surrounding darkness
      // instead of ending at a hard polygon edge.
      nightContext.filter='blur(6px)';
      nightContext.drawImage(headlightLayer,0,0);
      nightContext.filter='none';
      nightContext.globalCompositeOperation='source-over';
      // Reuse the beam mask, including its bike-shaped cutout, for the warm
      // road spill so light cannot paint over the rider or motorcycle.
      const warm=target.createLinearGradient(sx,sy,ex,ey);
      warm.addColorStop(0,'rgba(255,224,160,.34)');
      warm.addColorStop(.48,'rgba(255,218,148,.23)');
      warm.addColorStop(1,'rgba(255,214,145,0)');
      target.globalCompositeOperation='source-in';target.fillStyle=warm;
      target.fillRect(0,0,headlightLayer.width,headlightLayer.height);
      target.globalCompositeOperation='source-over';
    }
    ctx.drawImage(nightLayer,0,0);
    if(lamp){ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(headlightLayer,0,0);ctx.restore();}
    if(lamp && lamp.visibility>0) {
      const radius=8*ACTOR_VISUAL_SCALE;
      const glow=ctx.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,radius);
      glow.addColorStop(0,'rgba(255,226,158,'+(.88*light.night*lamp.visibility)+')');glow.addColorStop(1,'rgba(255,210,128,0)');
      ctx.globalCompositeOperation='screen';ctx.fillStyle=glow;ctx.fillRect(lamp.x-radius,lamp.y-radius,radius*2,radius*2);
    }
    ctx.restore();
  }
  const CHASE_BIKE_Y = 216;
  const ISO_X = Math.SQRT1_2, ISO_Y = Math.SQRT1_2 * .5;
  const CHASE_MACHINE_SCALE_X = 1.48, CHASE_MACHINE_SCALE_Y = 1.08;
  const titleScreen = document.querySelector('#title-screen');
  const toast = document.querySelector('#toast');
  const objectiveNode = document.querySelector('#objective');
  const objectiveIndex = document.querySelector('#objective-index');
  const keys = new Set();
  const upgrades={fuel:0,armor:0,health:0,kick:0};
  const characterHealth=CharacterHealth.create({onNotice:message=>setToast(message)});
  const healthPanel=createCharacterHealthPanel({container:canvas.parentElement,model:characterHealth,onOpen:()=>{keys.clear();stopBikeDrag();}});
  function healthCareContext(){
    return {available:['drive','explore'].includes(state)&&!mounted&&!ignition.active&&!bikeInspectOpen&&!checkpointReturn&&playerKnockdown<=0,
      moving:['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(key=>keys.has(key)),running:keys.has('shift'),hunger,thirst};
  }
  let creatureHitCooldown=0,creatureBikeCooldown=0,playerKnockdown=0,knockdownAngle=0;
  function woundCharacter(source,severity=1){
    const pick=list=>list[Math.floor(Math.random()*list.length)];
    const part=source==='fall'?pick(['leftLeg','rightLeg']):source==='ceiling'?pick(['head','chest']):pick(['leftArm','rightArm','chest','abdomen']);
    const type=source==='fall'&&severity>1.3?'fracture':source==='ceiling'?'bruise':source==='creature'?'cut':severity>1.5?'deep':'scratch';
    characterHealth.injure(part,type,severity);
  }
  function updateCharacterCare(dt){
    const active=state!=='title'&&state!=='ending';
    creatureHitCooldown=Math.max(0,creatureHitCooldown-dt);
    creatureBikeCooldown=Math.max(0,creatureBikeCooldown-dt);
    playerKnockdown=Math.max(0,playerKnockdown-dt);
    healthPanel.update(dt,healthCareContext());
    if(active){
      characterHealth.update(dt,healthCareContext());
      const condition=characterHealth.status();
      player.hp=explorer.hp=condition.critical?0:Math.max(1,Math.ceil(condition.health/34));
      if(condition.critical){
        state='title';mounted=false;bike.speed=0;bikeEngineRunning=false;bikeRpm=0;
        keys.clear();stopBikeDrag();ignition.reset();
        bikeInspectOpen=false;bikeService=null;shelterLife.cancel();shelterView=null;
        balanceEvent=null;checkpointReturn=null;playerKnockdown=0;flash=0;
        titleScreen.classList.remove('dismissed');
        document.querySelector('#start-game').textContent='JOGAR NOVAMENTE';
        setObjective('Voce morreu. Inicie uma nova partida para tentar novamente.');
        setToast('VOCE MORREU - ENTER OU JOGAR NOVAMENTE',5);
        return;
      }
    }
  }
  const world = { w: 12800, h: 4800 };
  const towers = Array.from({length:5},(_,i)=>({x:0,y:0,disabled:false,design:i,pace:0,phase:0,name:`COMPUTADOR 0${i+1}`}));
  let roads = [
    [0, 1450], [260, 1450], [440, 1120], [570, 570], [650, 460],
    [940, 520], [1240, 800], [1460, 1130], [1830, 1290], [2160, 870],
    [2380, 480], [2450, 440], [2780, 440]
  ];
  let branchRoads = [];
  let buildings = [
    [250, 560, 56, 42], [330, 520, 40, 32], [390, 750, 62, 48], [760, 600, 50, 40],
    [940, 850, 46, 36], [1010, 880, 58, 38], [1340, 670, 64, 46], [1440, 750, 38, 34],
    [1320, 390, 60, 43], [1720, 660, 62, 48], [1530, 870, 48, 38], [280, 880, 44, 32],
    [465, 210, 64, 82], [820, 270, 77, 64], [875, 915, 90, 76], [1280, 200, 88, 80],
    [1375, 630, 82, 70], [1710, 120, 90, 80], [70, 950, 80, 66],
    [980, 1450, 105, 86], [1150, 220, 90, 70], [1670, 390, 120, 96], [1900, 300, 94, 74],
    [2090, 1180, 112, 91], [2320, 1420, 78, 66], [2550, 960, 130, 92], [2670, 150, 100, 80],
    [390, 1480, 68, 54], [730, 1250, 76, 62], [1530, 1560, 90, 73], [2170, 180, 72, 58]
  ];
  const fenceHitboxes = [];
  const streetHitboxes = [];
  let collisionGrid=null;
  let fenceSegments = [[60, 635, 130, 0], [1030, 360, 100, Math.PI / 2], [1390, 900, 160, 0]];
  function rebuildFenceHitboxes() {
    collisionGrid=null;
    fenceHitboxes.length = 0;
    fenceSegments.forEach(([fx, fy, length, angle]) => {
    const addRect = (x,y,w,h) => fenceHitboxes.push([fx,fy,x,y,w,h,angle]);
    for(const part of StreetStructures.fenceParts(length))addRect(part.x,part.y,part.w,part.d);
    });
  }
  rebuildFenceHitboxes();
  let state = 'title';
  let activeTower = 0;
  let mounted = true;
  let approachedByBike = false;
  let gameTime = 0;
  let lastTime = 0;
  let toastTimer = 0;
  let flash = 0;
  let totalRide = 0;
  let network = 0;
  let climbTime = 0;
  let climbLives = 3;
  let climbCheckpoint = 0;
  let climbGrip = 100;
  let checkpointReturn = null;
  let hackStep = 0;
  let hackTime = 0;
  let hackMode = 'question';
  let chaseProgress = 0;
  let chaseSpeed = 105;
  let chaseLag = 90;
  let chaseElapsed = 0;
  let chaseLives = 3;
  let chaseInvulnerable = 0;
  let hookReady = false;
  let grappleAvailable = false;
  let grappleStartedAt = 0;
  let grappleOffset = 0;
  let grappleAttempts = 0;
  const grappleButton = document.querySelector('#grapple-action');
  const chaser = { x: 240, feet: 218, vy: 0, grounded: true, duck: 0, steer: 0 };
  const chaseObstacles = [
    { at: 620, x: 105, kind: 'debris', cleared: false }, { at: 1020, x: 365, kind: 'wall', cleared: false },
    { at: 1420, x: 225, kind: 'wreck', cleared: false }, { at: 1820, x: 112, kind: 'debris', cleared: false },
    { at: 2220, x: 358, kind: 'wall', cleared: false }, { at: 2620, x: 238, kind: 'wreck', cleared: false }
  ];
  let hazardCooldown = 0;
  let fuel = 68, hunger = 100, thirst = 100, exploreBuilding = -1;
  const toolboxes=[100];
  function addToolbox(){toolboxes.push(100);repairKits=toolboxes.length;}
  function spendTools(){
    if(!toolboxes.length)return 0;
    const cost=Math.min(toolboxes[0],1+Math.floor(Math.random()*10));
    toolboxes[0]-=cost;if(toolboxes[0]<=0)toolboxes.shift();repairKits=toolboxes.length;return cost;
  }
  let repairKits = 1, bikeLife = 100, bikeWearClock = 0, bikeCrashCooldown = 0, bikeParts = { motor: 100, handlebar: 100, frontTire: 100, rearTire: 100 };
  let bikeInspectOpen = false;
  let bikeDragging=false,bikeDragSpeed=0;
  let bikeInspectHover = null;
  const bikeWorkshopWindow={x:null,y:null,full:false,drag:null};
  let bikeInspectTab = 'Info', bikeTireSelected = 'frontTire', bikeService = null;
  const bikeInspectTabs = ['Info', 'Motor', 'Pneus', 'Guidão'];
  const bikeFaults = Object.fromEntries(Object.keys(bikeParts).map(part => [part, [100,100,100,100]]));
  const bikeToolCursors = new Map();
  const bikeJobs = {
    motor: [
      ['Ignição fora de ponto', 'Sincronizar ignição', 'timing', 'Pare o marcador dentro da faixa verde, três vezes.'],
      ['Válvulas desreguladas', 'Regular válvulas', 'sequence', 'Pegue pelo cabo e arraste para cima ou para baixo. Confirme entre 0,10 e 0,15 mm.'],
      ['Motor furado / vazamento de gasolina', 'Vedar furo do motor', 'engineHole', 'Segure sobre cada ponto para vedar. Teclado: 1–4 seleciona, E aplica.'],
      ['Mistura irregular', 'Ajustar mistura', 'balance', 'Use − / + para estabilizar a mistura no centro por 3 segundos.']
    ],
    tire: [
      ['Perfurações na borracha', 'Aplicar remendos', 'patch', 'Em cada furo: lixe, aplique cola, espere secar e pressione o remendo.'],
      ['Pressão incorreta', 'Calibrar pressão', 'pressure', 'Arraste a bomba para baixo e para cima; alivie com − e confirme entre 30–34 PSI.'],
      ['Fixação da roda frouxa', 'Apertar fixações', 'bolts', 'Segure o cabo da chave e gire em cruz: 1 → 2 → 3 → 4. Teclas também funcionam.'],
      ['Sujeira nos sulcos', 'Limpar sulcos', 'clean', 'Arraste a escova sobre os sulcos até retirar a sujeira; teclas 1–4 também funcionam.']
    ],
    handlebar: [
      ['Direção desalinhada', 'Alinhar direção', 'align', 'Use − / + para centralizar a roda e confirme o alinhamento.'],
      ['Cabos desconectados', 'Reconectar cabos', 'wires', 'Arraste cada cabo ao conector de mesmo símbolo, ou selecione os pares com cliques.'],
      ['Mesa com aperto incorreto', 'Regular torque', 'torque', 'Gire a chave no sentido horário e confirme entre 18 e 22 Nm. − / + também ajustam.'],
      ['Rolamentos fora de posição', 'Assentar rolamentos', 'bearings', 'Dê três batidas no mesmo ponto: clique em BATER ou pressione 1.']
    ]
  };
  const bikePartNames = { motor: 'MOTOR', handlebar: 'GUIDÃO', frontTire: 'PNEU DIANTEIRO', rearTire: 'PNEU TRASEIRO' };
  let supplies = buildings.map((b, i) => ({ x: b[0] + b[2] * .8, y: b[1] + b[3] * 1.2, type: i === 10 ? 'fuel' : i%7===3 ? 'medical' : ['ration','water','can'][i % 3], found: false, available: i === 10 ? Math.random() < .9 : Math.random() < .85 }));
  const worldReturn = { x: 0, y: 0 };
  const explorer = { x: 240, y: 145, hp: 3, invulnerable: 0 };
  const interiorWalls = [];
  const camera = { x: 180, y: 3300 };
  const mossEcology=MossCreatures.createEcology({
    getBuildings:()=>buildings,getSize:()=>world,isBlocked:worldBlocked,getShadows:mossShadowRegions
  });
  const mossRenderer=MossCreatures.createRenderer(MOSS_CREATURE_ATLAS);
  function creatureSounds(){
    const sounds=[],actor=state==='explore'?explorer:player;
    if(state==='explore'||!mounted){
      const footstep=MossCreatures.playerNoise({x:actor.x,y:actor.y,
        speed:Math.hypot(actor.gait?.vx||0,actor.gait?.vy||0),running:!!actor.gait?.running,
        room:state==='explore'?exploreBuilding:-1});
      if(footstep)sounds.push(footstep);
    }
    const engine=MossCreatures.playerNoise({x:bike.x,y:bike.y,speed:bikeDragging?bikeDragSpeed:bike.speed,vehicle:true,engineRunning:bikeEngineRunning});
    if(engine){engine.player=state!=='explore'&&mounted;sounds.push(engine);}
    sounds.push(...survivalEffects.filter(p=>p.kind==='bait').map(p=>({...p,radius:240,player:false})));
    return sounds;
  }
  let survivalItems={bait:4},survivalEffects=[],balanceEvent=null;
  let hudDetails=false;
  let kickCooldown=0,kickVisual=0;
  function kickCreature(){
    if(!['drive','explore'].includes(state)||mounted||kickCooldown>0||checkpointReturn||playerKnockdown>0||bikeInspectOpen)return;
    shelterLife.cancel();shelterView=null;stopBikeDrag();
    const actor=state==='explore'?explorer:player;
    const hit=mossEcology.kick({x:actor.x,y:actor.y,angle:actor.angle,room:state==='explore'?exploreBuilding:-1,range:34+upgrades.kick*12,stunScale:1+upgrades.kick*.5,
      isRoomBlocked:(x,y)=>interiorWalls.some(w=>x>=w.x&&x<=w.x+w.w&&y>=w.y&&y<=w.y+w.h)});
    kickCooldown=1.7;kickVisual=.25;
    if(hit)setToast(hit.kind===2?'BRUTAMONTES ATORDOADO — CORRA!':hit.kind===1?'RASTEJANTE ARREMESSADO!':'ENCOBERTO AFASTADO!',1.2);
  }
  const isShelter=index=>index>=0&&index!==10&&index%6===0;
  const shelterLife=ShelterSurvival.create();
  let shelterView=null;
  const inSafeShelter=()=>state==='explore'&&isShelter(exploreBuilding);
  function shelterKey(key){
    if(!inSafeShelter()||checkpointReturn)return false;
    if(['escape','w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e'].includes(key)){
      shelterLife.cancel();shelterView=null;return key==='escape';
    }
    if(!['z','o'].includes(key))return false;
    shelterLife.cancel();keys.clear();explorer.gait=null;
    if(key==='z'){shelterView=null;shelterLife.sleep();setToast('DESCANSANDO - MOVA-SE PARA ACORDAR.');}
    if(key==='o')shelterView=shelterView==='observe'?null:'observe';
    return true;
  }
  function updateShelter(dt){
    if(state==='title'||state==='ending')return;
    const safe=inSafeShelter();
    if(!safe)shelterView=null;
    const moving=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>keys.has(k));
    const result=shelterLife.update(dt,{safe:safe&&!checkpointReturn,moving,running:moving&&keys.has('shift')});
    if(result==='rested')setToast('DESCANSADO — FÔLEGO E EQUILÍBRIO RECUPERADOS.');
  }
  function drawShelter(){
    if(!['drive','explore'].includes(state))return;
    ctx.save();ctx.textAlign='left';ctx.font='6px monospace';
    if(hudDetails||shelterLife.fatigue>65){
      ctx.fillStyle='#142020e8';ctx.fillRect(8,H-57,180,13);ctx.fillStyle=shelterLife.fatigue>65?'#efad79':'#b9d9c4';
      ctx.fillText(`CANSAÇO ${Math.round(shelterLife.fatigue)}% · ${shelterLife.fatigue>65?'PRECISA DORMIR':'VIGÍLIA'}`,13,H-48);
    }
    if(inSafeShelter()){
      if(!shelterView&&!shelterLife.activity&&!hudDetails){
        ctx.fillStyle='#bdd8c8';ctx.fillText('ABRIGO - E NA CAMA PARA DORMIR',12,H-30);ctx.restore();return;
      }
      const y=H-119;
      panel(8,y,Math.min(W-16,390),77,'#0c1b21f2','#78ad93');ctx.fillStyle='#d8e9d9';
      ctx.fillText('ABRIGO - E NA CAMA PARA DORMIR',16,y+13);
      const job=shelterLife.activity;
      if(job?.kind==='sleep'){
        ctx.fillText('DORMINDO · O TEMPO CONTINUA · MOVA-SE PARA ACORDAR',16,y+29);
        ctx.fillStyle='#73dca7';ctx.fillRect(16,y+40,(1-shelterLife.fatigue/100)*250,5);
      }else if(shelterView==='observe'){
        const door=buildingDoor(exploreBuilding),near=mossEcology.entities.filter(c=>!c.indoors&&distance(c,door)<300);
        ctx.fillText(`PELA FRESTA · ${near.length} CRIATURA(S) A ATÉ 300 m`,16,y+30);
        ctx.fillText('O OU ESC VOLTA · MOVIMENTO NA RUA CONTINUA',16,y+46);
      }else{
        ctx.fillText('DESCANSE, PREPARE ITENS E ESCOLHA A PRÓXIMA ROTA.',16,y+30);
        ctx.fillText('PROCURE COMIDA, AGUA E FERRAMENTAS NAS CASAS.',16,y+47);
      }
    }
    ctx.restore();
  }
  function survivalActor(){return state==='explore'?explorer:mounted?bike:player;}
  function survivalUse(key){
    if(!['drive','explore'].includes(state)||ignition.active||bikeInspectOpen||checkpointReturn||playerKnockdown>0)return;
    const actor=survivalActor(),room=state==='explore'?exploreBuilding:-1;
    if(key==='j'){
      if(mounted){setToast('DESÇA DA MOTO PARA APLICAR O CURATIVO.');return;}
      healthPanel.update(0,healthCareContext());healthPanel.setOpen(!healthPanel.open);return;
    }
    if(key!=='b')return;
    const kind='bait';
    if(survivalItems.bait<=0){setToast('SEM ISCAS SONORAS.');return;}
    let p={x:actor.x,y:actor.y};
    if(kind==='bait'){
      const angle=state==='explore'?explorer.angle:mounted?bike.angle:player.angle;
      for(let step=1;step<=12;step++){
        const next={x:actor.x+Math.sin(angle||0)*step*10,y:actor.y-Math.cos(angle||0)*step*10};
        if(room<0?(next.x<12||next.y<12||next.x>world.w-12||next.y>world.h-12||worldBlocked(next.x,next.y,4)):(next.x<60||next.x>405||next.y<98||next.y>278||interiorWalls.some(w=>next.x>=w.x&&next.x<=w.x+w.w&&next.y>=w.y&&next.y<=w.y+w.h)))break;
        p=next;
      }
    }
    survivalItems[kind]--;survivalEffects.push({...p,room,kind,radius:150,ttl:9});
    setToast('ISCA LAN\u00c7ADA \u2014 AFASTE-SE DO BARULHO!');
  }
  function attemptBalance(){
    if(!balanceEvent)return;
    const event=balanceEvent;balanceEvent=null;
    if(Math.abs(event.elapsed-.6)<=shelterLife.balanceWidth/2){creatureHitCooldown=3;setToast('EQUILÍBRIO RECUPERADO!');}
    else if(mounted&&state==='drive'){knockRiderOff(event.creature,event.profile);setToast('PERDEU O EQUILÍBRIO — VOCÊ CAIU!');}
  }
  function updateSurvival(dt){
    kickCooldown=Math.max(0,kickCooldown-dt);kickVisual=Math.max(0,kickVisual-dt);
    if(!['drive','explore'].includes(state)){balanceEvent=null;return;}
    survivalEffects.forEach(p=>p.ttl-=dt);survivalEffects=survivalEffects.filter(p=>p.ttl>0);
    if(balanceEvent){
      if(!mounted||state!=='drive')balanceEvent=null;
      else {balanceEvent.elapsed+=dt;if(balanceEvent.elapsed>1.2)attemptBalance();}
    }
  }
  function drawSurvival(){
    if(!['drive','explore'].includes(state))return;
    const room=state==='explore'?exploreBuilding:-1;
    ctx.save();ctx.textAlign='left';ctx.font='6px monospace';
    if(kickVisual>0){
      const actor=survivalActor(),pos=room<0?projectPoint(actor.x,actor.y):actor,angle=room<0?projectFacing(actor.angle):actor.angle;
      ctx.save();ctx.translate(pos.x,pos.y-3);ctx.rotate(angle);ctx.strokeStyle='#eed4a0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,18+(1-kickVisual/.25)*10,-Math.PI*.8,-Math.PI*.2);ctx.stroke();ctx.restore();
    }
    for(const p of survivalEffects){
      if(p.room!==room)continue;
      const pos=room<0?projectPoint(p.x,p.y):p;
      ctx.fillStyle='#8bdcdd';ctx.beginPath();ctx.arc(pos.x,pos.y,4+Math.sin(gameTime*12)*1.5,0,Math.PI*2);ctx.fill();
    }
    if(hudDetails){
      ctx.fillStyle='#0b171ee6';ctx.fillRect(8,H-24,Math.min(W-16,460),18);ctx.fillStyle='#e1e6d0';
      ctx.fillText(`B ISCA ${survivalItems.bait} \u00b7 J CURATIVO ${characterHealth.items.bandages}`,13,H-13);
    }
    if(room<0){
      buildings.forEach((b,i)=>{if(isShelter(i)){const door=buildingDoor(i);if(!hudDetails&&distance(survivalActor(),door)>250)return;const p=projectPoint(door.x,door.y);ctx.fillStyle='#73ffc0';ctx.fillRect(p.x-2,p.y-25,4,15);ctx.fillRect(p.x-7,p.y-20,14,4);if(hudDetails)ctx.fillText('ABRIGO',p.x-12,p.y-29);}});
    }
    if(balanceEvent){
      const x=W/2-90,y=H/2-28;
      ctx.fillStyle='#101a20f5';ctx.fillRect(x-8,y-20,196,65);ctx.fillStyle='#ffffff';ctx.fillText('EQUILÍBRIO! CLIQUE / ESPAÇO NO VERDE',x,y-6);
      ctx.fillStyle='#713b3b';ctx.fillRect(x,y+5,180,12);ctx.fillStyle='#63d39a';ctx.fillRect(x+180*(.6-shelterLife.balanceWidth/2)/1.2,y+5,180*shelterLife.balanceWidth/1.2,12);
      ctx.fillStyle='#fff';ctx.fillRect(x+180*balanceEvent.elapsed/1.2-1,y+2,3,18);
    }
    ctx.restore();
  }
  function mossShadowRegions(light){
    return buildings.map(([x,y,w,h],home)=>{
      const shape=isoBuildingGeometry(x,y,w,h,home);
      const cast=shape.roof.map((roof,i)=>{
        const reach=Math.min(180,(shape.base[i].y-roof.y)*light.shadowLength/24);
        return {x:roof.x+light.shadowX*reach,y:shape.base[i].y+light.shadowY*reach};
      });
      const points=shadowHull(shape.base.concat(cast)).map(point=>{
        const px=(point.x-W/2)/ISO_X,py=(point.y-H/2)/ISO_Y;
        return {x:camera.x+(px+py)/2,y:camera.y+(py-px)/2};
      });
      return {home,points};
    });
  }
  const bike = { x: 180, y: 3300, angle: .87, speed: 0, wheel: 0, steering:0, bank:0 };
  let bikeEngineRunning=false;
  let bikeHeadlightOn=true;
  const BIKE_GEAR_LIMITS=[0,30,60,90,125],BIKE_SPEED_TO_KMH=.52;
  let bikeGear=1,bikeShiftCooldown=0,bikeShiftFlash=0,bikeRpm=1000;
  function bikeGearSpeedLimit(gear=bikeGear) {
    return BIKE_GEAR_LIMITS[Math.max(1,Math.min(BIKE_GEAR_LIMITS.length-1,gear))]/BIKE_SPEED_TO_KMH;
  }
  function bikeGearAcceleration(gear=bikeGear) {return [0,190,145,110,90][gear];}
  function updateBikeGearbox(dt,speed,throttle) {
    bikeShiftCooldown=Math.max(0,bikeShiftCooldown-dt);bikeShiftFlash=Math.max(0,bikeShiftFlash-dt);
    const ratio=Math.min(1.15,Math.abs(speed)/bikeGearSpeedLimit());
    const target=bikeEngineRunning&&bikeLife>0&&fuel>0?1000+ratio*5900+(throttle?350:0):0;
    bikeRpm+=(target-bikeRpm)*(1-Math.exp(-8*dt));
  }
  function shiftBikeGear(delta) {
    if(bikeShiftCooldown>0||!(state==='drive'&&mounted||state==='chase'||state==='grapple'))return false;
    const next=Math.max(1,Math.min(BIKE_GEAR_LIMITS.length-1,bikeGear+delta));
    if(next===bikeGear)return false;
    bikeGear=next;bikeShiftCooldown=.28;bikeShiftFlash=.6;
    return true;
  }
  function bikeControlsMounted() {return state==='drive'&&mounted||state==='chase'||state==='grapple';}
  const BIKE_DASHBOARD_SCALE = .75;
  function bikeDashboardBounds(){const w=130*BIKE_DASHBOARD_SCALE,h=76*BIKE_DASHBOARD_SCALE;return {x:W-w-12,y:H-h-12,w,h};}
  function handleBikeDashboardPointer(event) {
    if(event.button!==0||!bikeControlsMounted())return false;
    const pointer=bikeCanvasPointer(event),bounds=bikeDashboardBounds();
    const p={x:(pointer.x-bounds.x)/BIKE_DASHBOARD_SCALE,y:(pointer.y-bounds.y)/BIKE_DASHBOARD_SCALE},x=0,y=0;
    if(p.y<y+61||p.y>y+73)return false;
    if(p.x>=x+7&&p.x<=x+55){shiftBikeGear(-1);return true;}
    if(p.x>=x+75&&p.x<=x+123){shiftBikeGear(1);return true;}
    return false;
  }
  const player = { x: 180, y: 3300, angle: .87, hp: 3 };
  const climber = { x: 34, feet: 245, vy: 0, grounded: true, invulnerable: 0 };
  const networkQuestions = [
    [
      { q: 'Qual equipamento encaminha dados entre redes?', a: ['Roteador', 'Switch', 'Repetidor USB'], ok: 0 },
      { q: 'Qual porta do roteador liga à internet?', a: ['LAN', 'USB', 'WAN'], ok: 2 },
      { q: 'Que cabo conecta o roteador ao modem?', a: ['HDMI', 'Ethernet', 'Áudio P2'], ok: 1 }
    ],
    [
      { q: 'O que liga vários aparelhos na rede local?', a: ['Switch', 'Microfone', 'Tela'], ok: 0 },
      { q: 'Em qual porta conectamos um PC da rede local?', a: ['WAN', 'VGA', 'LAN'], ok: 2 },
      { q: 'O que um switch encaminha entre aparelhos?', a: ['Energia da bateria', 'Sinal de vídeo', 'Pacotes de dados'], ok: 2 }
    ],
    [
      { q: 'O que permite a comunicação entre redes?', a: ['Roteador', 'Mouse', 'Caixa de som'], ok: 0 },
      { q: 'O que identifica um aparelho numa rede IP?', a: ['Nome da tela', 'Endereço IP', 'Frequência de áudio'], ok: 1 },
      { q: 'Qual serviço entrega IP aos aparelhos?', a: ['DHCP', 'HDMI', 'BIOS'], ok: 0 }
    ],
    [
      { q: 'O que significa LAN?', a: ['Rede local', 'Monitor', 'Teclado'], ok: 0 },
      { q: 'O que faz a máscara de sub-rede?', a: ['Define a parte de rede do IP', 'Criptografa o monitor', 'Aumenta o sinal Wi-Fi'], ok: 0 },
      { q: 'Qual endereço identifica uma rede local privada?', a: ['192.168.1.10', '8.8.8.8', '1.1.1.1'], ok: 0 }
    ],
    [
      { q: 'Qual tecnologia conecta sem cabos?', a: ['Wi-Fi', 'HDMI', 'USB'], ok: 0 },
      { q: 'O que é o gateway padrão?', a: ['Rota de saída para outras redes', 'Senha do Wi-Fi', 'Cabo de fibra'], ok: 0 },
      { q: 'Qual serviço traduz nomes de sites em IP?', a: ['DNS', 'Teclado', 'Monitor'], ok: 0 }
    ]
  ];
  networkQuestions.flat().forEach((question,i)=>question.a.push(['Bluetooth','Cabo de energia','Impressora','Antena de TV','Placa de som'][i%5]));
  const upgradeOptions=['Economia: -20% de consumo de gasolina','Blindagem: +30% de resistencia da moto','Vitalidade: +25 de vida maxima','Chute: +12 de alcance e +50% de stun'];
  function chooseUpgrade(choice){
    upgrades[['fuel','armor','health','kick'][choice]]++;
    if(choice===2)characterHealth.boost();
    completeHack();
  }
  const platforms = [
    { x: 0, w: 82, y: 245 }, { x: 80, w: 73, y: 214 }, { x: 153, w: 70, y: 183 },
    { x: 225, w: 70, y: 152 }, { x: 295, w: 72, y: 121 }, { x: 368, w: 112, y: 90 }
  ];
  const rubble = [];
  const cityProps=[];
  function rebuildStreetHitboxes(includeTerminals=false){
    streetHitboxes.length=0;
    for(const prop of cityProps)streetHitboxes.push(StreetStructures.footprint(prop));
    if(includeTerminals)for(const terminal of towers)streetHitboxes.push(StreetStructures.footprint({...terminal,kind:4}));
    collisionGrid=null;
  }
  let seed = 98201;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < 390; i++) {
    const x = random() * world.w, y = random() * world.h;
    const nearRoad = roads.some(([rx, ry]) => Math.hypot(x - rx, y - ry) < 100);
    const nearTower = towers.some(t => Math.hypot(x - t.x, y - t.y) < 112);
    if (!nearTower && (!nearRoad || random() < .72)) rubble.push({ x, y, s: 2 + random() * 6, color: random() });
  }

  function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  function nearAnyRoad(x,y,limit) {
    return [roads,...branchRoads].some(path=>path.some((p,i)=>i>0&&pointSegmentDistance(x,y,path[i-1][0],path[i-1][1],p[0],p[1])<limit));
  }
  function generateMapLayout() {
    urbanSpriteCache.clear();urbanSpriteBytes=0;
    buildingGeometryCache.clear();buildingOpacities.clear();collisionGrid=null;
    cityProps.length=0;streetHitboxes.length=0;
    roads = [[180, 3300]];
    let roadY = 3300;
    const intervals = 36, span = world.w - 360;
    for (let i = 1; i <= intervals; i++) {
      roadY = Math.max(300, Math.min(world.h - 300, roadY + (Math.random() - .5) * 930));
      roads.push([Math.round(180 + span * i / intervals), Math.round(roadY)]);
    }
    branchRoads = [];
    const branchCount = 12 + Math.floor(Math.random() * 5);
    for (let b = 0; b < branchCount; b++) {
      const segment = 2 + Math.floor(Math.random() * (roads.length - 4));
      const [ax,ay] = roads[segment], [bx,by] = roads[segment+1];
      const t = .25 + Math.random() * .55, dx=bx-ax, dy=by-ay, baseAngle=Math.atan2(dy,dx);
      const angle=baseAngle+(Math.random()<.5?-1:1)*(.45+Math.random()*.8), path=[[Math.round(ax+dx*t),Math.round(ay+dy*t)]];
      let x=path[0][0],y=path[0][1],heading=angle;
      const points=3+Math.floor(Math.random()*4);
      for(let p=0;p<points;p++){heading+=(Math.random()-.5)*.62;x=Math.max(70,Math.min(world.w-70,x+Math.cos(heading)*(250+Math.random()*260)));y=Math.max(70,Math.min(world.h-70,y+Math.sin(heading)*(250+Math.random()*260)));path.push([Math.round(x),Math.round(y)]);}
      branchRoads.push(path);
    }
    buildings = [];
    for (let i = 0; i < 160; i++) {
      const gasStation = i === 10;
      const w = gasStation ? 100 : Math.round(42 + Math.random() * 78);
      const h = gasStation ? 78 : Math.round(36 + Math.random() * 68);
      const canPlace=(x,y)=>{
        if(x<70||y<70||x+w*1.65>world.w-70||y+h*1.65>world.h-70)return false;
        const cx=x+w*.825,cy=y+h*.825;
        if(nearAnyRoad(cx,cy,64+Math.hypot(w,h)*.825)||Math.hypot(cx-bike.x,cy-bike.y)<260)return false;
        return !buildings.some(([ox,oy,ow,oh])=>x<ox+ow*1.65+48&&x+w*1.65+48>ox&&y<oy+oh*1.65+48&&y+h*1.65+48>oy);
      };
      let building = null;
      for (let attempt = 0; attempt < 100 && !building; attempt++) {
        const segment = 1 + Math.floor(Math.random() * (roads.length - 2));
        const [ax, ay] = roads[segment], [bx, by] = roads[segment + 1];
        const ratio = .2 + Math.random() * .6, dx = bx - ax, dy = by - ay;
        const length = Math.hypot(dx, dy) || 1, offset = (Math.random() < .5 ? -1 : 1) * (190 + Math.random() * 330);
        const cx = ax + dx * ratio - dy / length * offset, cy = ay + dy * ratio + dx / length * offset;
        const x = Math.round(cx - w * .825), y = Math.round(cy - h * .825);
        if(canPlace(x,y))building=[x,y,w,h];
      }
      // Failed roadside attempts must still respect spacing and road clearance.
      for(let y=70;y<world.h-70&&!building;y+=96)for(let x=70;x<world.w-70&&!building;x+=96){
        if(canPlace(x,y))building=[x,y,w,h];
      }
      if(!building)throw Error('Sem espaço livre para gerar os prédios.');
      buildings.push(building);
    }
    supplies = buildings.map((b, i) => ({ x: b[0] + b[2] * .8, y: b[1] + b[3] * 1.2, type: i === 10 ? 'fuel' : i%7===3 ? 'medical' : Math.random() < .3 ? 'toolkit' : ['ration','water','can'][i % 3], found: false, available: i === 10 ? Math.random() < .9 : Math.random() < .85 }));
    seed = Math.floor(Math.random() * 4294967296);
    rubble.length = 0;
    for (let i = 0; i < 1450; i++) {
      const x = random() * world.w, y = random() * world.h;
      const nearRoad = nearAnyRoad(x,y,90);
      if (!nearRoad || random() < .18) rubble.push({ x, y, s: 2 + random() * 6, color: random() });
    }
    fenceSegments = [];
    [3, 8, 13].forEach(index => {
      const [ax, ay] = roads[index], [bx, by] = roads[index + 1];
      const angle = Math.atan2(by - ay, bx - ax), length = 46 + Math.random() * 35;
      const dx = bx - ax, dy = by - ay, span = Math.hypot(dx, dy) || 1;
      fenceSegments.push([(ax + bx) * .5 - dy / span * 105, (ay + by) * .5 + dx / span * 105, length, angle]);
    });
    rebuildFenceHitboxes();
    cityProps.length=0;
    for(let i=0;i<220;i++){
      const segment=1+Math.floor(Math.random()*(roads.length-2));
      const [ax,ay]=roads[segment],[bx,by]=roads[segment+1],t=Math.random(),dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;
      const side=i%2?1:-1,offset=side*(95+Math.random()*45);
      const x=ax+dx*t-dy/len*offset,y=ay+dy*t+dx/len*offset;
      const kind=i%4,radius=StreetStructures.radius(kind);
      if(x<40||y<40||x>world.w-40||y>world.h-40||worldBlocked(x,y,radius+8))continue;
      if(cityProps.some(prop=>Math.hypot(x-prop.x,y-prop.y)<radius+StreetStructures.radius(prop.kind)+12))continue;
      if(towers.some(terminal=>Math.hypot(x-terminal.x,y-terminal.y)<radius+85))continue;
      const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4);
      cityProps.push({x,y,kind,tint:i%3,angle});
    }
    rebuildStreetHitboxes();
  }

  function active() { return towers.find(t => !t.disabled) || null; }
  function updateMachines(time) {
    // Network computers stay at their reachable spawn positions.
  }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function nearbyCollisionCells(x,y,radius){
    if(!collisionGrid){
      collisionGrid=new Map();
      function insert(rect,left,top,right,bottom){
        for(let gx=Math.floor(left/256);gx<=Math.floor(right/256);gx++)for(let gy=Math.floor(top/256);gy<=Math.floor(bottom/256);gy++){
          const key=gx+','+gy;let cell=collisionGrid.get(key);if(!cell){cell=[];collisionGrid.set(key,cell);}cell.push(rect);
        }
      }
      for(const [x,y,w,h] of buildings)insert({x,y,left:0,top:0,right:w*1.65,bottom:h*1.65,c:1,s:0},x,y,x+w*1.65,y+h*1.65);
      for(const [x,y,left,top,w,h,angle] of [...fenceHitboxes,...streetHitboxes]){
        const c=Math.cos(angle),s=Math.sin(angle),right=left+w,bottom=top+h;
        const points=[[left,top],[right,top],[right,bottom],[left,bottom]].map(([px,py])=>({x:x+px*c-py*s,y:y+px*s+py*c}));
        insert({x,y,left,top,right,bottom,c,s},Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y)));
      }
    }
    const cells=[];
    for(let gx=Math.floor((x-radius)/256);gx<=Math.floor((x+radius)/256);gx++)for(let gy=Math.floor((y-radius)/256);gy<=Math.floor((y+radius)/256);gy++){
      const cell=collisionGrid.get(gx+','+gy);if(cell)cells.push(cell);
    }
    return cells;
  }
  function obstacleDistanceSquared(rect,x,y){
    const dx=x-rect.x,dy=y-rect.y,lx=dx*rect.c+dy*rect.s,ly=-dx*rect.s+dy*rect.c;
    return (lx-Math.max(rect.left,Math.min(lx,rect.right)))**2+(ly-Math.max(rect.top,Math.min(ly,rect.bottom)))**2;
  }
  function worldBlocked(x, y, radius) {
    for(const cell of nearbyCollisionCells(x,y,radius))for(const rect of cell)if(obstacleDistanceSquared(rect,x,y)<radius*radius)return true;
    return false;
  }
  function obstacleClearance(x,y,radius){
    let nearest=120+radius;
    for(const cell of nearbyCollisionCells(x,y,nearest))for(const rect of cell)nearest=Math.min(nearest,Math.sqrt(obstacleDistanceSquared(rect,x,y)));
    return Math.max(0,nearest-radius);
  }
  function nearbyBuilding(x, y) {
    return buildings.findIndex(([bx, by, bw, bh]) => x > bx - 24 && x < bx + bw * 1.65 + 24 && y > by - 24 && y < by + bh * 1.65 + 24);
  }
  function buildingDoor(index) {
    const [x, y, w, h] = buildings[index];
    return { x: x + w * 1.65 * .7, y: y + h * 1.65 + 12 };
  }
  function nearbyEntrance(x, y, maxDistance = 48) {
    let nearest = -1, best = maxDistance;
    buildings.forEach((_, i) => { const d = distance({ x, y }, buildingDoor(i)); if (d < best) { best = d; nearest = i; } });
    return nearest;
  }
  function doorFacesPriority(actor, building, bikeRange) {
    if(building<0||distance(actor,bike)>bikeRange)return false;
    const door=buildingDoor(building),doorDistance=distance(actor,door),bikeDistance=distance(actor,bike);
    const facingX=Math.sin(actor.angle),facingY=-Math.cos(actor.angle);
    const doorScore=((door.x-actor.x)*facingX+(door.y-actor.y)*facingY)/Math.max(1,doorDistance);
    const bikeScore=((bike.x-actor.x)*facingX+(bike.y-actor.y)*facingY)/Math.max(1,bikeDistance);
    return doorScore>bikeScore;
  }
  function moveWorldEntity(entity, dx, dy, radius) {
    const targetX = Math.max(18, Math.min(world.w - 18, entity.x + dx));
    const targetY = Math.max(18, Math.min(world.h - 18, entity.y + dy));
    if (!worldBlocked(targetX, targetY, radius)) { entity.x = targetX; entity.y = targetY; return true; }
    let moved = false;
    if (!worldBlocked(targetX, entity.y, radius)) { entity.x = targetX; moved = true; }
    if (!worldBlocked(entity.x, targetY, radius)) { entity.y = targetY; moved = true; }
    return moved;
  }
  function stopBikeDrag(){
    bikeDragging=false;bikeDragSpeed=0;keys.delete('g');
  }
  function startBikeDrag(){
    if(state!=='drive'||mounted||checkpointReturn||playerKnockdown>0)return false;
    if(distance(player,bike)>43){setToast('CHEGUE PERTO DA MOTO PARA ARRASTAR.');return false;}
    bikeInspectOpen=false;bikeService=null;
    bike.speed=0;bike.steering=0;bike.bank=0;
    player.gait=null;bikeDragging=true;keys.add('g');
    setToast('SEGURE G + WASD PARA ARRASTAR — SOLTE G PARA LARGAR.');return true;
  }
  function moveDraggedBike(actor,dx,dy,radius){
    const beforeX=bike.x,beforeY=bike.y,bikeRadius=12*ACTOR_VISUAL_SCALE;
    function step(sx,sy){
      const ax=actor.x+sx,ay=actor.y+sy,bx=bike.x+sx,by=bike.y+sy;
      if(Math.min(ax,ay,bx,by)<18||Math.max(ax,bx)>world.w-18||Math.max(ay,by)>world.h-18)return false;
      if(worldBlocked(ax,ay,radius)||worldBlocked(bx,by,bikeRadius))return false;
      actor.x=ax;actor.y=ay;bike.x=bx;bike.y=by;return true;
    }
    // Move both bodies together, with short steps to keep fences solid.
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/3));
    for(let i=0;i<steps;i++)if(!step(dx/steps,dy/steps)){step(dx/steps,0);step(0,dy/steps);}
    const travel=Math.hypot(bike.x-beforeX,bike.y-beforeY);
    if(travel>0){
      const heading=Math.atan2(bike.x-beforeX,-(bike.y-beforeY));
      const turn=Math.atan2(Math.sin(heading-bike.angle),Math.cos(heading-bike.angle));
      bike.angle+=turn*Math.min(1,travel/18);bike.wheel+=travel/9;
    }
    return travel>0;
  }
  function randomizeTowerSpawns() {
    const placed = [];
    function sampleRoadAtX(targetX) {
      for (let i=0;i<roads.length-1;i++) {
        const [ax,ay]=roads[i],[bx,by]=roads[i+1];
        if(targetX>=ax&&targetX<=bx){const ratio=(targetX-ax)/(bx-ax),dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;return{x:targetX,y:ay+dy*ratio,nx:-dy/len,ny:dx/len};}
      }
      return {x:targetX,y:roads[Math.floor(roads.length/2)][1],nx:0,ny:1};
    }
    towers.forEach((tower, i) => {
      const anchor = [1600,4100,6600,9100,11600][i], roadAnchor=sampleRoadAtX(anchor);
      let point = null;
      for (let attempt = 0; attempt < 180 && !point; attempt++) {
        const candidate = { x: anchor, y: Math.max(120, Math.min(world.h - 120, roadAnchor.y + (Math.random() - .5) * 180)) };
        if (distance(candidate, bike) < 1000 || placed.some(p => distance(candidate, p) < 2300) || worldBlocked(candidate.x, candidate.y, 48)) continue;
        point = candidate;
      }
      if (!point) {
        // A blocked road must never place a computer inside a building.
        for(let offset=0;offset<world.h&&!point;offset+=48)for(const side of [1,-1]){
          const candidate={x:anchor,y:roadAnchor.y+offset*side};
          if(candidate.y>=120&&candidate.y<=world.h-120&&!worldBlocked(candidate.x,candidate.y,48)){point=candidate;break;}
        }
        if(!point)point={x:roadAnchor.x,y:120};
      }
      tower.baseX = tower.x = point.x; tower.baseY = tower.y = point.y;
      tower.rangeX = tower.design === 3 ? 72 + Math.random() * 26 : tower.design === 4 ? 32 + Math.random() * 20 : 28 + Math.random() * 30;
      tower.rangeY = tower.design === 3 ? 58 + Math.random() * 26 : 18 + Math.random() * 24; tower.phase = Math.random() * Math.PI * 2;
      placed.push(point);
    });
  }
  function projectPoint(x, y) {
    return {
      x: W / 2 + (x - camera.x - (y - camera.y)) * ISO_X,
      y: H / 2 + (x - camera.x + y - camera.y) * ISO_Y
    };
  }
  function projectFacing(angle) {
    const vx = Math.sin(angle), vy = -Math.cos(angle);
    return Math.atan2((vx - vy) * ISO_X, -(vx + vy) * ISO_Y);
  }
  function bikeWorldTurnDelta(angle, screenDelta) {
    // Apply steering in screen space, then recover the world heading.
    // Isometric foreshortening otherwise changes the apparent turn rate.
    const heading=projectFacing(angle)+screenDelta;
    const diagonalX=Math.sin(heading)/ISO_X;
    const diagonalY=-Math.cos(heading)/ISO_Y;
    const next=Math.atan2(diagonalX+diagonalY,diagonalX-diagonalY);
    return Math.atan2(Math.sin(next-angle),Math.cos(next-angle));
  }
  function setToast(message, seconds = 2.2) {
    toast.textContent = message; toast.classList.add('visible'); toastTimer = seconds;
  }
  function setObjective(text) {
    if(objectiveNode.textContent!==text)objectiveNode.textContent=text;
    if(objectiveIndex.textContent!=='')objectiveIndex.textContent='';
  }
  function updateObjective() {
    if (state === 'explore') setObjective('Procure recursos nas construções e volte ao abrigo antes da noite.');
    else if (state === 'ending') setObjective('Você sobreviveu. Continue explorando este mundo abandonado.');
    else if(active()) setObjective(`Siga o sinal até o ${active().name}. A pé, pressione E e responda 3 perguntas. (${network}/5)`);
    else setObjective('Sobreviva à noite: encontre abrigo, água e comida.');
  }
  function startGame() {
    Object.keys(upgrades).forEach(key=>upgrades[key]=0);
    kickCooldown=0;kickVisual=0;
    hudDetails=false;
    shelterLife.reset();shelterView=null;
    survivalItems={bait:4};survivalEffects=[];balanceEvent=null;
    stopBikeDrag();
    buildingOpacities.clear();
    characterHealth.reset();creatureHitCooldown=0;creatureBikeCooldown=0;playerKnockdown=0;
    startHour = Math.floor(Math.random() * 1440) / 60;
    bikeVisualFacings.clear();
    player.gait=null;
    checkpointReturn=null;
    ignition.reset();
    state = 'drive'; gameTime = 0; lastTime = 0; activeTower = 0; network = 0;
    bike.x = 180; bike.y = 3300; bike.angle = .87; bike.speed = 0; bike.wheel = 0; bike.steering=0;bike.bank=0;
    bikeGear=1;bikeShiftCooldown=0;bikeShiftFlash=0;bikeRpm=0;bikeEngineRunning=false;bikeHeadlightOn=true;
    player.x = bike.x; player.y = bike.y; player.angle = bike.angle; player.hp = 3;
    mounted = false; approachedByBike = false; totalRide = 0; fuel = 68; hunger = 100; thirst = 100;
    bikeFuelStains.length=0;bikeFuelDripClock=0;
    player.x=bike.x+Math.cos(bike.angle)*19;player.y=bike.y+Math.sin(bike.angle)*19;
    toolboxes.splice(0,toolboxes.length,100);repairKits = 1; bikeLife = 100; bikeWearClock = 0; bikeCrashCooldown = 0; Object.keys(bikeParts).forEach(part => bikeParts[part] = 100);
    bikeInspectOpen = false;
    bikeService = null; Object.values(bikeFaults).forEach(faults => faults.fill(100));
    generateMapLayout(); camera.x = player.x; camera.y = player.y;
    mossEcology.reset(worldLighting(0),player);
    supplies.forEach(s => { s.found = false; s.available = Math.random() < (s.type === 'fuel' ? .9 : .85); });
    supplies.forEach((s,i)=>{if(isShelter(i)){s.type='medical';s.available=true;}});
    towers.forEach(t => t.disabled = false);
    randomizeTowerSpawns();
    rebuildStreetHitboxes(true);
    titleScreen.classList.add('dismissed'); keys.clear(); updateObjective();
    setToast('WASD MOVE - E INTERAGE - F MONTA - ESPACO CHUTA - J CURA');
  }
  document.querySelector('#start-game').addEventListener('click', startGame);

  function dismount() {
    keys.clear();
    player.gait=null;
    bike.steering=0;bike.bank=0;
    mounted = false;
    approachedByBike = false;
    player.x = bike.x + Math.cos(bike.angle) * 19;
    player.y = bike.y + Math.sin(bike.angle) * 19;
    player.angle = bike.angle;
    bike.speed = 0;
    setToast(bikeEngineRunning?'MOTO CONTINUA LIGADA — R PARA DESLIGAR · F PARA VOLTAR':'MOTO DESLIGADA — F PARA MONTAR'); updateObjective();
  }
  function mount() {
    if(playerKnockdown>0){setToast('ESPERE O PERSONAGEM SE LEVANTAR.');return;}
    if (distance(player, bike) > 43) { setToast('A MOTO ESTÁ FORA DE ALCANCE.'); return; }
    bike.steering=0;bike.bank=0;
    mounted = true; player.x = bike.x; player.y = bike.y; player.angle = bike.angle;
    player.gait=null;
    keys.clear();
    if(!bikeEngineRunning){
      ignition.open();
      setObjective('Arraste a chave até a fechadura e gire para a direita para ligar a moto.');
      toastTimer=0;toast.classList.remove('visible');
    }else updateObjective();
  }
  function switchOffBike() {
    if(state!=='drive'||(!mounted&&distance(player,bike)>43))return;
    if(!bikeEngineRunning){
      if(Math.abs(bike.speed)>2){setToast('PARE A MOTO PARA MEXER NA IGNIÇÃO.');return;}
      keys.clear();ignition.open();setObjective('Encaixe a chave e gire para ligar a moto.',activeTower);
      return;
    }
    bikeEngineRunning=false;bikeRpm=0;keys.clear();
    setToast(Math.abs(bike.speed)>2?'MOTOR DESLIGADO — A MOTO VAI PARAR AOS POUCOS.':'MOTOR DESLIGADO — R PARA DAR A PARTIDA.');
  }
  function startGrappleAim() {
    if (!grappleAvailable) { setToast('APROXIME A MOTO DE UMA PERNA E MANTENHA O RITMO'); return; }
    state = 'grapple'; grappleStartedAt = gameTime; grappleAttempts++;
    grappleOffset = Math.sin(gameTime * 2.13 + activeTower) * 1.4;
    keys.clear(); updateObjective(); setToast('MIRA INSTÁVEL — CLIQUE NO BOTÃO NO MOMENTO CERTO', 2.2);
  }
  function grappleMeter(time) {
    const tower = active();
    const pose = chaseMachinePose(time, tower);
    const elapsed = gameTime - grappleStartedAt;
    const motion = elapsed * (2.1 + chaseSpeed * .0045) + grappleOffset;
    const needle = .5 + Math.sin(motion) * .46;
    const lateralDrift = (chaser.x - W * .5) / W * .16 + Math.sin(time * 7.4 + activeTower) * .07;
    const target = Math.max(.13, Math.min(.87, .5 + Math.sin(pose.phase * 1.2) * .21 + lateralDrift));
    const stable = Math.abs(needle - target) < .07*characterHealth.status().focus && pose.target.planted && chaseLag < 130;
    return { needle, target, stable, pose };
  }
  function attemptGrapple() {
    if (state !== 'grapple') return;
    const aim = grappleMeter(gameTime);
    if (aim.stable) {
      state = 'climb'; mounted = false; climbTime = 0; climbLives = 3; climbCheckpoint = 0; climbGrip = 100; hazardCooldown = 1;
      climber.x = 31; climber.feet = 245; climber.vy = 0; climber.grounded = true; climber.invulnerable = 0; climber.gait=null;
      grappleAvailable = false; flash = .65; setToast('RAPEL PRESO — A/D AVANÇA · W SOBE · SEGURE ESPAÇO PARA AGARRAR'); updateObjective();
    } else {
      state = 'chase'; chaseLives = Math.max(1, chaseLives - 1); chaseLag = Math.min(360, chaseLag + 82); grappleAvailable = false;
      updateObjective(); setToast('O GANCHO RASPOU A PERNA — MANTENHA A MOTO ESTÁVEL E TENTE DE NOVO', 2.4);
    }
  }
  grappleButton.addEventListener('click', () => {
    if (state === 'chase') startGrappleAim();
    else if (state === 'grapple') attemptGrapple();
  });
  canvas.addEventListener('pointerdown', event => { if(balanceEvent){event.preventDefault();attemptBalance();return;}if(ignition.active){ignition.down(event);return;}if (bikeInspectOpen) handleBikeInspectPointer(event); else if(handleBikeDashboardPointer(event))return;else if (state === 'grapple') attemptGrapple(); else if (state === 'hack') handleHackPointer(event); });
  canvas.addEventListener('dblclick', event => {
    if(event.button!==0||!bikeInspectOpen||ignition.active)return;
    const {x,y}=bikeServicePointer(event);
    const title=y>=13&&y<31&&x>=35&&x<430;
    const tab=y>=31&&y<=49&&x>=15&&x<465;
    if(!title&&!tab)return;
    event.preventDefault();
    endBikeWorkshopWindowDrag({pointerId:bikeWorkshopWindow.drag?.pointerId});
    bikeWorkshopWindow.full=!bikeWorkshopWindow.full;
    bikeInspectHover=null;
  });
  canvas.addEventListener('pointermove', event => {
    if(ignition.active){ignition.move(event);return;}
    bikeInspectHover=bikeInspectOpen?bikeServicePointer(event):null;
    moveBikeServiceGesture(event);
  });
  canvas.addEventListener('pointerleave', () => {bikeInspectHover=null;});
  canvas.addEventListener('pointerup', event=>{if(ignition.active)ignition.up(event);else endBikeServiceGesture(event);});
  canvas.addEventListener('pointercancel', event=>{if(ignition.active)ignition.up(event);else endBikeServiceGesture(event);});
  canvas.addEventListener('lostpointercapture', event=>{if(ignition.active)ignition.up(event);else endBikeServiceGesture(event);});
  window.addEventListener('blur', () => {ignition.cancelDrag();endBikeWorkshopWindowDrag({pointerId:bikeWorkshopWindow.drag?.pointerId});if(bikeService){bikeService.drag=null;}});
  canvas.addEventListener('contextmenu', event => {
    if (bikeInspectOpen) event.preventDefault();
  });
  function syncGrappleButton() {
    const visible = state === 'chase' || state === 'grapple';
    if(grappleButton.hidden===visible)grappleButton.hidden=!visible;
    const disabled=state==='chase'&&!grappleAvailable;
    if(grappleButton.disabled!==disabled)grappleButton.disabled=disabled;
    const label=state==='grapple'?'DISPARAR RAPEL':grappleAvailable?'MIRAR / RAPEL':'RAPEL INDISPONÍVEL';
    if(grappleButton.textContent!==label)grappleButton.textContent=label;
  }
  function interact() {
    if(checkpointReturn)return;
    if (state === 'chase') { startGrappleAim(); return; }
    if (state === 'grapple') { attemptGrapple(); return; }
    if (state === 'drive') {
      if (mounted) { dismount(); return; }
      const terminal = active();
      if(terminal && distance(player,terminal)<65){state='hack';hackStep=0;hackTime=90;hackMode='question';keys.clear();bikeInspectOpen=false;setToast(terminal.name+' — RESPONDA AS 3 PERGUNTAS');return;}
      const building = nearbyEntrance(player.x, player.y);
      const bikeDistance=distance(player,bike),doorDistance=building>=0?distance(player,buildingDoor(building)):Infinity;
      const chooseDoor=building>=0&&(bikeDistance>=43||doorFacesPriority(player,building,43));
      if (building >= 0 && chooseDoor) { bikeInspectOpen=false;bikeService=null;state = 'explore'; exploreBuilding = building; worldReturn.x = player.x; worldReturn.y = player.y; player.gait=null; explorer.x = 83; explorer.y = 198; explorer.hp = 3; explorer.gait=null; keys.clear(); setToast('INTERIOR C-03 — VASCULHE A MESA E SAIA PELA PORTA.'); updateObjective(); return; }
      if (nearbyBuilding(player.x, player.y) >= 0 && bikeDistance>=43) { setToast('PROCURE A PORTA DA CONSTRUÇÃO PARA ENTRAR.'); return; }
      if (bikeDistance < 43) {
        if (bikeLife <= 0 && repairKits <= 0) { setToast('MOTO AVARIADA — PROCURE UM KIT DE REPARO'); return; }
        if (bikeLife <= 0) {
          bikeInspectOpen = true; bikeInspectTab = 'Info'; keys.clear(); return;
        }
        mount(); return;
      }
      const tower = active();
      if (tower && distance(player, tower) < 180) setToast('A MÁQUINA ESTÁ EM MOVIMENTO. ALCANCE-A DE MOTO.');
      else setToast('F  MONTAR NA MOTO ESTACIONADA.');
    } else if (state === 'explore') {
      if (isShelter(exploreBuilding) && Math.hypot(explorer.x - 153, explorer.y - 200) < 38) {
        shelterView=null;shelterLife.sleep();keys.clear();explorer.gait=null;
        setToast('VOCÊ SE DEITA NA CAMA — MOVER-SE INTERROMPE O DESCANSO.');return;
      }
      if (Math.hypot(explorer.x - 78, explorer.y - 200) > 42) { setToast('A SAÍDA FICA NA PORTA — SIGA O MARCADOR.'); return; }
      checkpointReturn=null;
      state='drive';player.x=worldReturn.x;player.y=worldReturn.y;player.gait=null;
      camera.x=player.x;camera.y=player.y;mounted=false;keys.clear();
      setToast('VOCÊ VOLTA À ESTRADA.');updateObjective();
    } else if (state === 'climb') {
      if (climber.feet < 108 && climber.x > 390) {
        state = 'hack'; hackStep = 0; hackTime = 70; hackMode = 'question'; setToast('TERMINAL ENCONTRADO — DIAGNÓSTICO DE REDE');
      } else setToast('O TERMINAL FICA NO TOPO DA MÁQUINA.');
    }
  }
  function completeHack() {
    const tower = active();
    tower.disabled = true; network++; activeTower = towers.findIndex(t => !t.disabled); approachedByBike = false;
    flash = 1; state = active() ? 'drive' : 'ending'; mounted = false; bike.speed = 0;
    creatureHitCooldown=Math.max(creatureHitCooldown,4);
    keys.clear();
    setToast(active() ? `${tower.name} CONCLUÍDO — SINAL RESTAURADO` : 'REDE RESTAURADA — A HUMANIDADE VOLTOU A OUVIR', 4);
    if (active()) updateObjective(); else setObjective('Rede restaurada. O mundo voltou a responder.', towers.length - 1);
  }
  function hackInput(choice) {
    if (state !== 'hack' || choice < 0 || choice > 3) return;
    if(hackMode==='upgrade'){chooseUpgrade(choice);return;}
    if (hackMode === 'question') {
      const question = networkQuestions[activeTower][hackStep];
      if (choice === question.ok) {
        hackStep++;
        if (hackStep >= networkQuestions[activeTower].length) {hackMode='upgrade';keys.clear();setToast('ESCOLHA UMA MELHORIA PERMANENTE');}
        else setToast('RESPOSTA CERTA — PRÓXIMA PERGUNTA');
      } else { hackTime -= 4; setToast('RESPOSTA INCORRETA — TENTE OUTRA OPÇÃO', 1.2); }
    }
  }
  function handleHackPointer(event) {
    if (state !== 'hack') return;
    const {x,y}=bikeCanvasPointer(event);
    if (hackMode === 'question'||hackMode==='upgrade') {
      const choice = Math.floor((y - 108) / 27);
      if (x >= 107 && x <= 373 && y<213 && choice >= 0 && choice < 4) hackInput(choice);
    }
  }

  function keyDown(e) {
    if(ignition.active&&['e','f'].includes(e.key.toLowerCase())){e.preventDefault();if(!e.repeat){ignition.close(false);if(e.key.toLowerCase()==='f')dismount();}return;}
    if(ignition.active){ignition.key(e);return;}
    const key = e.key.toLowerCase();
    if(healthPanel.key(key)){e.preventDefault();return;}
    if(key==='tab'&&state!=='title'){e.preventDefault();if(!e.repeat)hudDetails=!hudDetails;return;}
    if(!e.repeat&&shelterKey(key)){e.preventDefault();return;}
    if(balanceEvent&&key===' '){e.preventDefault();if(!e.repeat)attemptBalance();return;}
    if(['b','j'].includes(key)&&['drive','explore'].includes(state)&&!e.repeat){e.preventDefault();survivalUse(key);return;}
    if(bikeDragging&&['e','f','h','r','escape'].includes(key))stopBikeDrag();
    if (bikeInspectOpen && key === 'escape') { if (bikeService) bikeService = null; else bikeInspectOpen = false; return; }
    if (bikeInspectOpen && key !== 'f' && key !== 'g' && (key !== 'e' || bikeService)) {
      e.preventDefault();
      if(!bikeService&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)){keys.add(key);return;}
      if (!e.repeat && bikeService) {
        if (/^[1-8]$/.test(key)) bikeServiceAction(Number(key)-1);
        else if (['arrowleft','a','-'].includes(key)) bikeServiceAction(0);
        else if (['arrowright','d','+','='].includes(key)) bikeServiceAction(1);
        else if (['e',' ','enter'].includes(key)) bikeServiceAction(bikeService.job[2]==='engineHole'?4:2);
      }
      return;
    }
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
    if(checkpointReturn){
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key))keys.add(key);
      return;
    }
    if (state === 'title') { if (key === 'enter') startGame(); return; }
    if (state === 'ending') { if (key === 'enter') { state = 'title'; titleScreen.classList.remove('dismissed'); } return; }
    if(playerKnockdown>0){e.preventDefault();return;}
    if(key===' '&&['drive','explore'].includes(state)&&!e.repeat){e.preventDefault();kickCreature();return;}
    if(key==='g'&&!e.repeat){e.preventDefault();startBikeDrag();return;}
    if(bikeControlsMounted()&&['q','e'].includes(key)){e.preventDefault();if(!e.repeat)shiftBikeGear(key==='e'?1:-1);return;}
    if(key==='r'&&state==='drive'&&!e.repeat){e.preventDefault();switchOffBike();return;}
    if(key==='h'&&state==='drive'&&!e.repeat&&(mounted||distance(player,bike)<=43)){e.preventDefault();bikeHeadlightOn=!bikeHeadlightOn;setToast(bikeHeadlightOn?'FAROL LIGADO':'FAROL DESLIGADO');return;}
    if(key==='f'&&state==='drive'&&!e.repeat){bikeInspectOpen=false;bikeService=null;if(mounted)dismount();else mount();return;}
    if (state === 'drive' && !mounted && key === 'e' && !e.repeat && (bikeInspectOpen || distance(player,bike)<=43) && !doorFacesPriority(player,nearbyEntrance(player.x,player.y),43)) {
      if (distance(player,bike) <= 43) { bikeInspectOpen = !bikeInspectOpen; keys.clear(); bikeInspectTab = 'Info'; bikeService = null; }
      else setToast('CHEGUE PERTO DA MOTO PARA INSPECIONÁ-LA.');
      return;
    }
    if (state === 'hack') {
      if (['1','2','3','4'].includes(key) && !e.repeat) hackInput(Number(key) - 1);
      return;
    }
    if (state === 'explore' && key === 'e' && !e.repeat) { interact(); return; }
    if (key === 'e' && !e.repeat) { interact(); return; }
    if (state === 'climb' && (key === 'w' || key === 'arrowup') && !e.repeat) {
      if (climber.grounded || climber.feet > 235) { climber.vy = -208; climber.grounded = false; }
    }
    keys.add(key);
  }
  function keyUp(e) { const key=e.key.toLowerCase();keys.delete(key);if(key==='g')stopBikeDrag(); }
  addEventListener('keydown', keyDown);
  addEventListener('keyup', keyUp);
  addEventListener('blur', () => {keys.clear();stopBikeDrag();});

  const GROUND_CHUNK_SIZE=256,groundTextureCache=new Map();
  function groundTextureChunk(x,y) {
    const key=x+','+y;
    if(groundTextureCache.has(key))return groundTextureCache.get(key);
    const tile=document.createElement('canvas');tile.width=tile.height=GROUND_CHUNK_SIZE;
    const painter=tile.getContext('2d');
    for(let py=0;py<GROUND_CHUNK_SIZE;py+=16)for(let px=0;px<GROUND_CHUNK_SIZE;px+=16){
      const wx=x+px,wy=y+py,shade=((Math.imul(wx/16,374761393)^Math.imul(wy/16,668265263))>>>0)%5;
      painter.fillStyle=shade===0?'#37433b':shade===1?'#354139':'#344038';painter.fillRect(px,py,16,16);
      if((wx*7+wy*3)%11===0){painter.fillStyle='#343b38';painter.fillRect(px+4,py+5,2,2);}
    }
    // Keep a bounded working set rather than retaining the entire world texture.
    if(groundTextureCache.size>=48)groundTextureCache.delete(groundTextureCache.keys().next().value);
    groundTextureCache.set(key,tile);return tile;
  }
  function drawGround(time) {
    ctx.fillStyle = '#34413a'; ctx.fillRect(0, 0, world.w, world.h);
    const left = Math.max(0, Math.floor((camera.x - 520) / 16) * 16), right = Math.min(world.w, camera.x + 520);
    const top = Math.max(0, Math.floor((camera.y - 520) / 16) * 16), bottom = Math.min(world.h, camera.y + 520);
    for(let y=Math.floor(top/GROUND_CHUNK_SIZE)*GROUND_CHUNK_SIZE;y<bottom;y+=GROUND_CHUNK_SIZE)for(let x=Math.floor(left/GROUND_CHUNK_SIZE)*GROUND_CHUNK_SIZE;x<right;x+=GROUND_CHUNK_SIZE){
      const width=Math.min(GROUND_CHUNK_SIZE,world.w-x),height=Math.min(GROUND_CHUNK_SIZE,world.h-y);
      ctx.drawImage(groundTextureChunk(x,y),0,0,width,height,x,y,width,height);
    }
    rubble.forEach(r => { if (Math.abs(r.x-camera.x)<560 && Math.abs(r.y-camera.y)<560) { ctx.fillStyle = r.color > .5 ? '#3c4641' : '#1c292b'; ctx.fillRect(r.x, r.y, r.s, r.s * .7); } });
    ctx.lineCap = 'square'; ctx.lineJoin = 'round';
    ctx.beginPath(); roads.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = '#282f30'; ctx.lineWidth = 46; ctx.stroke();
    ctx.beginPath(); roads.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = '#50554d'; ctx.lineWidth = 30; ctx.stroke();
    branchRoads.forEach(path=>{ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle='#282f30';ctx.lineWidth=46;ctx.stroke();ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle='#50554d';ctx.lineWidth=30;ctx.stroke();});
    ctx.setLineDash([9, 13]); ctx.lineWidth = 1; ctx.strokeStyle = '#a1805a40'; ctx.stroke(); ctx.setLineDash([]);
    branchRoads.forEach(path=>{ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.setLineDash([9,13]);ctx.lineWidth=1;ctx.strokeStyle='#a1805a40';ctx.stroke();ctx.setLineDash([]);});
    // Buckled asphalt, potholes and long cracks scar the old transit routes.
    for(let roadIndex=2;roadIndex<roads.length;roadIndex+=3) {
      const [x,y]=roads[roadIndex],i=(roadIndex-2)/3;
      const [px,py] = roads[Math.min(roads.length-1, i*3+1)], a = Math.atan2(y-py,x-px);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = '#151e20'; ctx.beginPath(); ctx.ellipse(0, 0, 11 + i % 3 * 3, 4 + i % 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#172021'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(1, -2); ctx.lineTo(5, -1); ctx.lineTo(10, -6); ctx.moveTo(-1, 0); ctx.lineTo(-7, -5); ctx.moveTo(4, -1); ctx.lineTo(7, 5); ctx.stroke();
      ctx.restore();
    }
  }
  function drawFence(x,y,length,angle,part){
    StreetStructures.drawFence(ctx,[x,y,length,angle],projectPoint,part);
  }
  function polygon(points, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath(); ctx.fill();
  }
  const buildingGeometryCache=new Map();
  let buildingGeometryView='';
  function isoBuildingGeometry(x, y, w, h, index) {
    const view=camera.x+':'+camera.y+':'+W+':'+H;
    if(view!==buildingGeometryView){buildingGeometryCache.clear();buildingGeometryView=view;}
    const cached=buildingGeometryCache.get(index);
    if(cached&&cached.x===x&&cached.y===y&&cached.width===w&&cached.height===h)return cached.shape;
    const width=w,height=h;
    w *= 1.65; h *= 1.65;
    const base = [projectPoint(x, y), projectPoint(x + w, y), projectPoint(x + w, y + h), projectPoint(x, y + h)];
    const floors = index === 10 ? 1 : w >= 115 && h >= 99 ? 3 + index % 4 : 1 + index % 2;
    const lift = index===10?20+floors*13+h*.26:UrbanStructures.TYPES[index%5].height;
    const roof = base.map(p => ({ x: p.x, y: p.y - lift }));
    const shape={w,h,base,roof,lift};
    buildingGeometryCache.set(index,{x,y,width,height,shape});
    return shape;
  }
  function isoBuildingVisible(shape) {
    return !(
      shape.base.every(p=>p.x < -64)||shape.base.every(p=>p.x>W+64)||
      shape.base.every(p=>p.y < -64)||shape.roof.every(p=>p.y>H+128)
    );
  }
  const urbanSpriteCache=new Map();
  const visibleUrbanSprites=new Set();
  let urbanSpriteBytes=0;
  const URBAN_SPRITE_BUDGET=24*1024*1024;
  function trimUrbanSpriteCache(extraBytes=0){
    for(const [key,sprite] of urbanSpriteCache){
      if(urbanSpriteBytes+extraBytes<=URBAN_SPRITE_BUDGET)break;
      // Keep the visible working set, even when a dense block exceeds the
      // background cache budget, so buildings are not rasterized every frame.
      if(visibleUrbanSprites.has(sprite.index))continue;
      urbanSpriteBytes-=sprite.bytes;urbanSpriteCache.delete(key);
    }
  }
  function drawUrbanBuildingSprite(shape,index){
    const key=index+':'+shape.w+':'+shape.h+':'+shape.lift+':'+RENDER_SCALE;
    let sprite=urbanSpriteCache.get(key);
    if(!sprite){
      const origin=shape.base[0],pad=40+Math.ceil(Math.max(shape.w,shape.h)*.3);
      const points=shape.base.concat(shape.roof);
      const left=Math.floor(Math.min(...points.map(p=>p.x-origin.x))-pad);
      const top=Math.floor(Math.min(...points.map(p=>p.y-origin.y))-pad);
      const width=Math.ceil(Math.max(...points.map(p=>p.x-origin.x))-left+pad);
      const height=Math.ceil(Math.max(...points.map(p=>p.y-origin.y))-top+pad);
      const layer=document.createElement('canvas');layer.width=Math.ceil(width*RENDER_SCALE);layer.height=Math.ceil(height*RENDER_SCALE);
      const painter=layer.getContext('2d');painter.scale(RENDER_SCALE,RENDER_SCALE);painter.imageSmoothingEnabled=false;
      const local=p=>({x:p.x-origin.x-left,y:p.y-origin.y-top});
      UrbanStructures.draw(painter,{...shape,base:shape.base.map(local),roof:shape.roof.map(local)},index);
      sprite={layer,left,top,index,width:layer.width/RENDER_SCALE,height:layer.height/RENDER_SCALE,bytes:layer.width*layer.height*4};
      trimUrbanSpriteCache(sprite.bytes);
      urbanSpriteCache.set(key,sprite);urbanSpriteBytes+=sprite.bytes;
    }else{urbanSpriteCache.delete(key);urbanSpriteCache.set(key,sprite);}
    ctx.drawImage(sprite.layer,shape.base[0].x+sprite.left,shape.base[0].y+sprite.top,sprite.width,sprite.height);
  }
  function drawIsoBuilding(x, y, width, height, index, time, geometry, opacity=1) {
    if(index!==10){
      ctx.save();ctx.globalAlpha*=opacity;drawUrbanBuildingSprite(geometry||isoBuildingGeometry(x,y,width,height,index),index);ctx.restore();return;
    }
    ctx.save();ctx.globalAlpha*=opacity;
    const buildingAlpha=ctx.globalAlpha;
    const {w,h,base,roof,lift} = geometry||isoBuildingGeometry(x,y,width,height,index);
    ctx.fillStyle = '#11191a88'; ctx.beginPath(); ctx.ellipse((base[0].x + base[2].x) / 2 + 4, (base[0].y + base[2].y) / 2 + 3, w * .48, h * .18, 0, 0, Math.PI * 2); ctx.fill();
    polygon([base[1], base[2], roof[2], roof[1]], index % 2 ? '#1a2425' : '#161f21');
    polygon([base[2], base[3], roof[3], roof[2]], index % 3 ? '#232a29' : '#1b2324');
    const facePoint = (a, b, bottom, u, v) => ({ x: a.x + (b.x - a.x) * u + (bottom.x - a.x) * v, y: a.y + (b.y - a.y) * u + (bottom.y - a.y) * v });
    const rows = Math.max(2, Math.floor(lift / 15)), columns = Math.min(5, Math.max(2, Math.floor(w / 34)));
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const u = (col + 1) / (columns + 1), v = (row + 1) / (rows + 1);
      const p1 = { x: roof[1].x + (roof[2].x - roof[1].x) * u + (base[1].x - roof[1].x) * v, y: roof[1].y + (roof[2].y - roof[1].y) * u + (base[1].y - roof[1].y) * v };
      const p2 = { x: roof[2].x + (roof[3].x - roof[2].x) * u + (base[2].x - roof[2].x) * v, y: roof[2].y + (roof[3].y - roof[2].y) * u + (base[2].y - roof[2].y) * v };
      const pane = (row * 3 + col * 5 + index) % 9;
      ctx.fillStyle = pane === 0 ? '#956647' : pane < 3 ? '#303a38' : '#111a1c';
      ctx.fillRect(p1.x - 2, p1.y - 3, 4, 6); ctx.fillRect(p2.x - 2, p2.y - 3, 4, 6);
    }
    if (index % 2 === 0) {
      const hole = [facePoint(roof[1], roof[2], base[1], .56,.32),facePoint(roof[1], roof[2], base[1],.76,.34),facePoint(roof[1],roof[2],base[1],.73,.45),facePoint(roof[1],roof[2],base[1],.8,.55),facePoint(roof[1],roof[2],base[1],.65,.72),facePoint(roof[1],roof[2],base[1],.5,.67)];
      polygon(hole, '#0d1416'); ctx.strokeStyle = '#504d42'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hole[1].x, hole[1].y); ctx.lineTo(hole[2].x, hole[2].y); ctx.lineTo(hole[3].x, hole[3].y); ctx.stroke();
    } else {
      const hole = [facePoint(roof[2], roof[3], base[2], .18,.55),facePoint(roof[2], roof[3], base[2],.42,.51),facePoint(roof[2],roof[3],base[2],.48,.63),facePoint(roof[2],roof[3],base[2],.37,.78),facePoint(roof[2],roof[3],base[2],.14,.72)];
      polygon(hole, '#0e1517');
    }
    const door = [facePoint(roof[2],roof[3],base[2],.22,.62), facePoint(roof[2],roof[3],base[2],.40,.62), facePoint(roof[2],roof[3],base[2],.40,1), facePoint(roof[2],roof[3],base[2],.22,1)];
    polygon(door, '#0a1112');
    ctx.strokeStyle = '#867253'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(door[0].x,door[0].y); ctx.lineTo(door[3].x,door[3].y); ctx.lineTo(door[2].x,door[2].y); ctx.stroke();
    ctx.fillStyle = '#d0a56d'; ctx.fillRect((door[2].x+door[3].x)*.5-1,(door[2].y+door[3].y)*.5-2,2,2);
    polygon(roof, index % 3 ? '#3b4542' : '#555c50');
    // Broken rooftop slabs and snapped reinforcement rods break the old skyline.
    for (let chunk = 0; chunk < 3; chunk++) {
      const px = roof[0].x + (roof[1].x - roof[0].x) * ((chunk + 1) / 4);
      const py = roof[0].y + (roof[1].y - roof[0].y) * ((chunk + 1) / 4);
      ctx.fillStyle = chunk % 2 ? '#202a29' : '#697064'; ctx.fillRect(px - 5, py - 4 - (chunk + index) % 3 * 2, 9, 3);
      if ((chunk + index) % 2 === 0) { ctx.strokeStyle = '#78604a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 2, py - 3); ctx.lineTo(px + 5, py - 14); ctx.lineTo(px + 9, py - 16); ctx.stroke(); }
    }
    const center = { x: (roof[0].x + roof[1].x + roof[2].x + roof[3].x) / 4, y: (roof[0].y + roof[1].y + roof[2].y + roof[3].y) / 4 };
    if (index === 10) {
      ctx.fillStyle = '#8b4939'; ctx.fillRect(center.x - 12, center.y - lift * .45, 24, 9); ctx.fillStyle = '#e2b879'; ctx.font = '5px monospace'; ctx.textAlign = 'center'; ctx.fillText('GAS', center.x, center.y - lift * .45 + 6);
      ctx.fillStyle = '#303936'; ctx.fillRect(center.x - 19, center.y - lift * .45 + 9, 38, 4);
    }
    ctx.fillStyle = '#303d39'; ctx.fillRect(center.x - 9, center.y - 4, 18, 9);
    ctx.fillStyle = '#819078'; ctx.fillRect(center.x - 7, center.y - 3, 9, 2);
    ctx.fillStyle = '#d28a58'; ctx.fillRect(center.x + 5, center.y + 2, 3, 3);
    ctx.fillStyle = '#667366'; ctx.fillRect(center.x + 11, center.y - lift * .35, 3, lift * .38);
    ctx.fillStyle = index % 4 === 0 && Math.sin(time * 2.7 + index * 1.8) > -.2 ? '#bb754e' : '#4e4138'; ctx.fillRect(center.x + 11, center.y - lift * .35 - 3, 3, 3);
    for (let puff = 0; puff < 3; puff++) {
      const rise = (time * 7 + index * 11 + puff * 13) % 32;
      ctx.globalAlpha = buildingAlpha * .16 * (1 - rise / 34); ctx.fillStyle = '#969d98';
      ctx.beginPath(); ctx.ellipse(center.x + 20 + puff * 4, center.y - lift * .4 - rise, 2 + rise * .12, 1 + rise * .08, -.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawIsoTower(tower, index, time) {
    const screenCenter = projectPoint(tower.x, tower.y);
    const gait = time * tower.pace * ([5,4.2,7,10,2.6][tower.design]) + tower.phase;
    const bodyBob = Math.sin(gait * (tower.design===4?1:2)) * (tower.design===4?1:1.6);
    ctx.save(); ctx.translate(screenCenter.x, screenCenter.y + bodyBob); ctx.scale(1.58, 1.52);
    const c = { x: 0, y: 0 };
    const activeNode = !tower.disabled && tower === active();
    const pulse = Math.sin(time * 2.8 + index) * 2;
    const pace = gait;
    const stride = Math.sin(pace) * ([9,13,9,17,5][tower.design]);
    const shell = tower.design === 0 ? '#56635f' : tower.design === 1 ? '#685a49' : '#536274';
    const edge = tower.design === 0 ? '#88958a' : tower.design === 1 ? '#b08a58' : '#8ba4b4';
    const core = tower.disabled ? '#75d9ae' : '#f07558';
    ctx.fillStyle = '#07101199'; ctx.beginPath(); ctx.ellipse(c.x + 4, c.y + 26, 83, 29, 0, 0, Math.PI * 2); ctx.fill();
    if (activeNode) { ctx.strokeStyle = '#e9785a66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x, c.y + 22, 96 + pulse, 35 + pulse * .3, 0, 0, Math.PI * 2); ctx.stroke(); }

    // The three walkers have different leg counts and gait: a heavy four-legger,
    // a broad six-leg carrier, and a tall, three-legged surveyor.
    const legs = tower.design === 1
      ? [[-49,-44,-78,-56,-92,-7],[-34,-38,-51,-65,-67,-18],[4,-38,19,-68,30,-13],[43,-43,69,-62,83,-4],[52,-36,84,-39,96,8],[-47,-35,-77,-22,-91,13]]
      : tower.design === 2
        ? [[-21,-48,-48,-65,-72,22],[21,-48,49,-65,74,19],[0,-42,4,-4,0,43]]
        : tower.design === 3
          ? [[-46,-42,-74,-56,-96,13],[-20,-38,-38,-7,-54,27],[20,-38,38,-7,54,27],[46,-42,74,-56,96,13]]
          : tower.design === 4
            ? [[-51,-42,-69,-58,-78,13],[-37,-39,-49,-12,-57,25],[-20,-37,-27,-2,-36,28],[-4,-35,-6,-5,-12,29],[12,-35,15,-4,19,28],[28,-37,39,-2,47,26],[43,-39,59,-13,68,23],[54,-41,76,-55,89,12]]
            : [[-38,-43,-65,-57,-79,15],[-23,-38,-39,-5,-48,28],[28,-38,43,-5,52,29],[42,-43,70,-58,84,14]];
    legs.forEach(([hx,hy,kx,ky,fx,fy], i) => {
      const legPhase = pace + (i % 2) * Math.PI;
      const swing = Math.sin(legPhase) * ([5,7,5,10,3][tower.design]);
      const hip = { x: c.x + hx, y: c.y + hy };
      const knee = { x: c.x + kx + swing * .45, y: c.y + ky + Math.max(0, Math.cos(legPhase) * 3) };
      const foot = { x: c.x + fx + swing, y: c.y + fy + Math.max(0, Math.sin(legPhase) * 5) };
      ctx.strokeStyle = '#11191b'; ctx.lineWidth = tower.design === 2 ? 10 : 8; ctx.lineCap = 'square'; ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.strokeStyle = shell; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.fillStyle = '#202a2d'; ctx.fillRect(knee.x - 5, knee.y - 5, 10, 10); ctx.fillStyle = edge; ctx.fillRect(knee.x - 2, knee.y - 2, 4, 4);
      ctx.fillStyle = '#121a1c'; ctx.fillRect(foot.x - 8, foot.y - 3, 16, 6); ctx.fillStyle = edge; ctx.fillRect(foot.x - 5, foot.y - 2, 10, 2);
    });

    if (tower.design === 0) {
      // Aurora: tall sensor mast rising from a massive sloped command hull.
      polygon([{x:c.x-54,y:c.y-54},{x:c.x-43,y:c.y-76},{x:c.x+34,y:c.y-76},{x:c.x+59,y:c.y-57},{x:c.x+50,y:c.y-29},{x:c.x-48,y:c.y-27}], '#11191b');
      polygon([{x:c.x-49,y:c.y-55},{x:c.x-40,y:c.y-70},{x:c.x+31,y:c.y-70},{x:c.x+50,y:c.y-55},{x:c.x+44,y:c.y-33},{x:c.x-45,y:c.y-31}], shell);
      polygon([{x:c.x-34,y:c.y-69},{x:c.x-22,y:c.y-91},{x:c.x+21,y:c.y-91},{x:c.x+34,y:c.y-70}], '#303b3c');
      ctx.fillStyle = '#172123'; ctx.fillRect(c.x - 17, c.y - 87, 34, 12); ctx.fillStyle = core; ctx.fillRect(c.x - 11, c.y - 83, 22, 4);
      ctx.fillStyle = edge; ctx.fillRect(c.x - 37, c.y - 60, 3, 21); ctx.fillRect(c.x + 34, c.y - 59, 3, 18);
      ctx.fillStyle = '#293436'; ctx.fillRect(c.x - 27, c.y - 25, 53, 9); ctx.fillStyle = '#a4a48d'; ctx.fillRect(c.x - 19, c.y - 22, 31, 2);
      ctx.strokeStyle = '#242e30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.x + 48, c.y - 48); ctx.lineTo(c.x + 75, c.y - 65); ctx.lineTo(c.x + 83, c.y - 63); ctx.stroke();
    } else if (tower.design === 1) {
      // Véspera: low, wide armored carrier with paired reactor pods and hazard paint.
      ctx.fillStyle = '#11191b'; ctx.fillRect(c.x - 66, c.y - 64, 132, 43);
      polygon([{x:c.x-61,y:c.y-61},{x:c.x-48,y:c.y-74},{x:c.x+45,y:c.y-74},{x:c.x+62,y:c.y-57},{x:c.x+56,y:c.y-29},{x:c.x-57,y:c.y-28}], shell);
      ctx.fillStyle = '#333c3a'; ctx.fillRect(c.x - 48, c.y - 56, 96, 7); ctx.fillStyle = edge; ctx.fillRect(c.x - 45, c.y - 54, 52, 2);
      ctx.fillStyle = '#192224'; ctx.fillRect(c.x - 62, c.y - 46, 18, 25); ctx.fillRect(c.x + 44, c.y - 46, 18, 25);
      ctx.fillStyle = core; ctx.fillRect(c.x - 59, c.y - 39, 12, 4); ctx.fillRect(c.x + 47, c.y - 39, 12, 4);
      ctx.fillStyle = '#d0ad68'; for (let i = 0; i < 6; i++) ctx.fillRect(c.x - 28 + i * 11, c.y - 28, 5, 3);
      ctx.fillStyle = '#1c2729'; ctx.fillRect(c.x - 22, c.y - 84, 44, 20); ctx.fillStyle = shell; ctx.fillRect(c.x - 16, c.y - 81, 32, 14);
      ctx.fillStyle = core; ctx.fillRect(c.x - 7, c.y - 76, 14, 4);
    } else if (tower.design === 2) {
      // Meridian: narrow three-leg sentinel, with a forward lance and crown antenna.
      polygon([{x:c.x-34,y:c.y-48},{x:c.x-45,y:c.y-70},{x:c.x-19,y:c.y-88},{x:c.x+29,y:c.y-76},{x:c.x+41,y:c.y-52},{x:c.x+24,y:c.y-29},{x:c.x-27,y:c.y-28}], '#101719');
      polygon([{x:c.x-29,y:c.y-51},{x:c.x-37,y:c.y-68},{x:c.x-16,y:c.y-82},{x:c.x+25,y:c.y-72},{x:c.x+34,y:c.y-53},{x:c.x+20,y:c.y-34},{x:c.x-23,y:c.y-33}], shell);
      ctx.fillStyle = '#202b30'; ctx.fillRect(c.x - 12, c.y - 71, 27, 12); ctx.fillStyle = core; ctx.fillRect(c.x - 5, c.y - 67, 18, 4);
      polygon([{x:c.x+28,y:c.y-60},{x:c.x+50,y:c.y-67},{x:c.x+81,y:c.y-63},{x:c.x+82,y:c.y-56},{x:c.x+49,y:c.y-51},{x:c.x+29,y:c.y-52}], '#283338');
      ctx.fillStyle = edge; ctx.fillRect(c.x + 51, c.y - 63, 25, 2);
      ctx.strokeStyle = '#202a2d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(c.x, c.y - 84); ctx.lineTo(c.x + 2, c.y - 104); ctx.lineTo(c.x + 23, c.y - 111); ctx.stroke();
      ctx.fillStyle = core; ctx.fillRect(c.x + 20, c.y - 114, 5, 5);
    } else if (tower.design === 3) {
      // Tufão: fast four-legged runner with a long turbine body and twin fins.
      polygon([{x:c.x-59,y:c.y-51},{x:c.x-45,y:c.y-78},{x:c.x+37,y:c.y-78},{x:c.x+59,y:c.y-54},{x:c.x+52,y:c.y-31},{x:c.x-51,y:c.y-30}], '#101719');
      polygon([{x:c.x-52,y:c.y-54},{x:c.x-40,y:c.y-72},{x:c.x+34,y:c.y-72},{x:c.x+50,y:c.y-52},{x:c.x+44,y:c.y-36},{x:c.x-45,y:c.y-35}], shell);
      ctx.fillStyle='#202c30';ctx.fillRect(c.x-22,c.y-67,45,15);ctx.fillStyle=core;ctx.fillRect(c.x-16,c.y-62,32,5);
      ctx.fillStyle=edge;ctx.beginPath();ctx.moveTo(c.x-48,c.y-58);ctx.lineTo(c.x-76,c.y-74);ctx.lineTo(c.x-71,c.y-47);ctx.fill();ctx.beginPath();ctx.moveTo(c.x+47,c.y-58);ctx.lineTo(c.x+77,c.y-76);ctx.lineTo(c.x+68,c.y-45);ctx.fill();
      ctx.strokeStyle='#69766b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(c.x-15,c.y-83);ctx.lineTo(c.x+8,c.y-99);ctx.lineTo(c.x+30,c.y-83);ctx.stroke();
    } else {
      // Centopeia: low armored crawler with eight short synchronized legs.
      polygon([{x:c.x-61,y:c.y-49},{x:c.x-53,y:c.y-66},{x:c.x+49,y:c.y-66},{x:c.x+63,y:c.y-50},{x:c.x+56,y:c.y-29},{x:c.x-56,y:c.y-29}], '#101719');
      polygon([{x:c.x-54,y:c.y-52},{x:c.x-47,y:c.y-62},{x:c.x+45,y:c.y-62},{x:c.x+54,y:c.y-49},{x:c.x+49,y:c.y-35},{x:c.x-49,y:c.y-35}], shell);
      ctx.fillStyle='#212b2d';ctx.fillRect(c.x-31,c.y-58,63,12);ctx.fillStyle=core;ctx.fillRect(c.x-21,c.y-54,42,4);
      for(let i=0;i<6;i++){ctx.fillStyle=i%2?edge:'#373e38';ctx.fillRect(c.x-45+i*18,c.y-30,8,5);}
      ctx.strokeStyle=edge;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(c.x-39,c.y-63);ctx.lineTo(c.x-49,c.y-81);ctx.moveTo(c.x+39,c.y-63);ctx.lineTo(c.x+49,c.y-81);ctx.stroke();
    }
    if (!tower.disabled) {
      const beamX = c.x + Math.sin(time * 1.7 + index) * 68;
      ctx.strokeStyle = core; ctx.globalAlpha = .36; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(beamX, c.y - 68); ctx.lineTo(beamX + 8, c.y + 11); ctx.stroke(); ctx.globalAlpha = 1;
    } else { ctx.fillStyle = '#8fe0b9'; ctx.fillRect(c.x - 4, c.y - 82, 8, 3); }
    ctx.restore();
    ctx.fillStyle = '#d4dac3'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText(tower.name, screenCenter.x, screenCenter.y - 180);
  }
  const bikeFuelStains=[];
  let bikeFuelDripClock=0;
  function updateBikeFuelTrail(dt) {
    for(let i=bikeFuelStains.length-1;i>=0;i--) {
      bikeFuelStains[i].age+=dt;
      if(bikeFuelStains[i].age>=90)bikeFuelStains.splice(i,1);
    }
    const severity=bikeHoleSeverity();
    if(fuel<=0||severity<=0){bikeFuelDripClock=0;return;}
    bikeFuelDripClock+=dt;
    const interval=.12+.6*(1-severity);
    if(bikeFuelDripClock<interval)return;
    bikeFuelDripClock%=interval;
    const x=bike.x+Math.cos(bike.angle)*3,y=bike.y+Math.sin(bike.angle)*3;
    const last=bikeFuelStains[bikeFuelStains.length-1];
    if(last&&Math.hypot(x-last.x,y-last.y)<5) {
      last.radius=Math.min(10,last.radius+.15+severity*.25);last.age=0;
    } else {
      bikeFuelStains.push({x,y,radius:1.8+severity*2,age:0});
      if(bikeFuelStains.length>400)bikeFuelStains.shift();
    }
  }
  function drawBikeFuelTrail() {
    ctx.save();
    for(const stain of bikeFuelStains) {
      ctx.globalAlpha=.65*Math.min(1,(90-stain.age)/25);
      ctx.fillStyle='#9c4d1f';ctx.beginPath();
      ctx.ellipse(stain.x,stain.y,stain.radius*1.35,stain.radius,.3,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha*=.65;
      ctx.fillStyle='#f2a348';ctx.beginPath();
      ctx.ellipse(stain.x-stain.radius*.25,stain.y-stain.radius*.2,stain.radius*.7,stain.radius*.25,.3,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawIsoMap(time) {
    ctx.save();
    const camX = (camera.x - camera.y) * ISO_X, camY = (camera.x + camera.y) * ISO_Y;
    ctx.translate(W / 2 - camX, H / 2 - camY);
    ctx.transform(ISO_X, ISO_Y, -ISO_X, ISO_Y, 0, 0);
    drawGround(time);
    drawBikeFuelTrail();
    ctx.restore();
  }
  const buildingOpacities=new Map();
  function screenPolygonOverlapsRect(points,rect){
    const corners=[{x:rect.left,y:rect.top},{x:rect.right,y:rect.top},{x:rect.right,y:rect.bottom},{x:rect.left,y:rect.bottom}];
    const axes=[{x:1,y:0},{x:0,y:1}];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];axes.push({x:-(b.y-a.y),y:b.x-a.x});
    }
    for(const axis of axes){
      let pMin=Infinity,pMax=-Infinity,rMin=Infinity,rMax=-Infinity;
      for(const p of points){const d=p.x*axis.x+p.y*axis.y;pMin=Math.min(pMin,d);pMax=Math.max(pMax,d);}
      for(const p of corners){const d=p.x*axis.x+p.y*axis.y;rMin=Math.min(rMin,d);rMax=Math.max(rMax,d);}
      if(pMax<rMin||rMax<pMin)return false;
    }
    return true;
  }
  function buildingOccludesActor(shape,rect,buildingDepth,actorDepth){
    if(buildingDepth<=actorDepth)return false;
    const {base,roof}=shape;
    return screenPolygonOverlapsRect(roof,rect)||
      screenPolygonOverlapsRect([base[1],base[2],roof[2],roof[1]],rect)||
      screenPolygonOverlapsRect([base[2],base[3],roof[3],roof[2]],rect);
  }
  function buildingOpacity(index,occluded,time){
    const previous=buildingOpacities.get(index)||{value:1,time:time-1/60};
    const target=occluded ? .22 : 1,dt=Math.max(0,Math.min(.1,time-previous.time));
    previous.value=target+(previous.value-target)*Math.exp(-12*dt);
    if(Math.abs(previous.value-target)<.005)previous.value=target;
    previous.time=time;buildingOpacities.set(index,previous);return previous.value;
  }
  let buildingRevealLayer=null;
  function drawBuildingWithReveal(draw,opacity,circle){
    if(opacity>=.995){draw(1);return;}
    // Save only the small patch behind the wall, then blend it back with a
    // feathered radial mask. This keeps the rest of the building fully solid.
    const t=ctx.getTransform(),cx=t.a*circle.x+t.c*circle.y+t.e,cy=t.b*circle.x+t.d*circle.y+t.f;
    const rx=circle.radius*Math.hypot(t.a,t.c),ry=circle.radius*Math.hypot(t.b,t.d);
    const left=Math.floor(cx-rx)-1,top=Math.floor(cy-ry)-1;
    const width=Math.ceil(cx+rx)-left+1,height=Math.ceil(cy+ry)-top+1;
    if(!buildingRevealLayer)buildingRevealLayer=document.createElement('canvas');
    const layer=buildingRevealLayer;
    if(layer.width!==width)layer.width=width;if(layer.height!==height)layer.height=height;
    const painter=layer.getContext('2d');
    painter.setTransform(1,0,0,1,0,0);painter.globalCompositeOperation='source-over';painter.globalAlpha=1;
    painter.clearRect(0,0,width,height);
    painter.drawImage(ctx.canvas,left,top,width,height,0,0,width,height);
    draw(1);
    painter.save();painter.setTransform(t.a,t.b,t.c,t.d,t.e-left,t.f-top);
    const mask=painter.createRadialGradient(circle.x,circle.y,circle.radius*.45,circle.x,circle.y,circle.radius);
    for(const step of [0,.25,.5,.75,1]){
      const fade=1-step*step*(3-2*step);
      mask.addColorStop(step,'rgba(0,0,0,'+((1-opacity)*fade)+')');
    }
    painter.globalCompositeOperation='destination-in';painter.fillStyle=mask;
    painter.fillRect(circle.x-circle.radius-2,circle.y-circle.radius-2,circle.radius*2+4,circle.radius*2+4);painter.restore();
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';
    ctx.drawImage(layer,left,top);ctx.restore();
  }
  function drawCityProp(prop,p){
    StreetStructures.draw(ctx,prop,p,RENDER_SCALE);
  }
  function drawIsoDepthObjects(time, includeActors) {
    const objects = [];
    visibleUrbanSprites.clear();
    const actor=mounted?bike:player,actorPoint=projectPoint(actor.x,actor.y);
    const halfWidth=mounted?18:7;
    const actorRect={left:actorPoint.x-halfWidth,right:actorPoint.x+halfWidth,top:actorPoint.y-(mounted?30:22),bottom:actorPoint.y+6};
    const revealCircle={x:actorPoint.x,y:actorPoint.y-8,radius:mounted?56:40};
    for(const prop of cityProps){
      const p=projectPoint(prop.x,prop.y);
      if(p.x<-80||p.x>W+80||p.y<-40||p.y>H+100)continue;
      objects.push({depth:prop.x+prop.y,draw:()=>drawCityProp(prop,p)});
    }
    for(const [x,y,length,angle] of fenceSegments){
      const end={x:x+Math.cos(angle)*length,y:y+Math.sin(angle)*length};
      const a=projectPoint(x,y),b=projectPoint(end.x,end.y);
      if(Math.max(a.x,b.x)<-12||Math.min(a.x,b.x)>W+12||Math.max(a.y,b.y)<-12||Math.min(a.y,b.y)-34>H+12)continue;
      for(const part of StreetStructures.fenceParts(length)){
        const lx=part.x+part.w/2,ly=part.y+part.d/2;
        const wx=x+lx*Math.cos(angle)-ly*Math.sin(angle),wy=y+lx*Math.sin(angle)+ly*Math.cos(angle);
        objects.push({depth:wx+wy,draw:()=>drawFence(x,y,length,angle,part)});
      }
    }
    buildings.forEach(([x,y,w,h],i)=>{
      const corner=projectPoint(x,y),lift=i===10?100:UrbanStructures.TYPES[i%5].height;
      if(corner.x+w*1.65*ISO_X < -80||corner.x-h*1.65*ISO_X>W+80||corner.y-lift>H+128||corner.y+(w+h)*1.65*ISO_Y < -80)return;
      const geometry=isoBuildingGeometry(x,y,w,h,i);
      if(isoBuildingVisible(geometry)){
        if(i!==10)visibleUrbanSprites.add(i);
        const depth=x+y+(w+h)*.82;
        const occluded=includeActors&&state==='drive'&&buildingOccludesActor(geometry,actorRect,depth,actor.x+actor.y);
        const opacity=buildingOpacity(i,occluded,time);
        objects.push({depth,draw:()=>drawBuildingWithReveal(alpha=>drawIsoBuilding(x,y,w,h,i,time,geometry,alpha),opacity,revealCircle)});
      }
    });
    towers.forEach(terminal=>{
      const p=projectPoint(terminal.x,terminal.y);
      if(p.x+36<0||p.x-36>W||p.y+16<0||p.y-64>H)return;
      objects.push({depth:terminal.x+terminal.y,draw:()=>{
      StreetStructures.draw(ctx,{...terminal,kind:4,angle:0},p,RENDER_SCALE);
      ctx.fillStyle=terminal.disabled?'#779889':'#8af1c4';ctx.textAlign='center';ctx.font='5px monospace';
      ctx.fillText(terminal.name,p.x,p.y-61);

    }});
    });
    if (includeActors && mounted) objects.push({ depth: bike.x + bike.y, draw: () => {
      const p = projectPoint(bike.x, bike.y);
      const rider = drawBike(p.x, p.y, projectFacing(bike.angle), bike.speed, time);
      if(!rider.integrated)drawPerson(rider.x, rider.y, projectFacing(player.angle), time, Math.abs(bike.speed) > 2, true);
    } });
    else if (includeActors) {
      objects.push({ depth: bike.x + bike.y, draw: () => {
        const p = projectPoint(bike.x, bike.y);
        drawBike(p.x, p.y, projectFacing(bike.angle), 0, time);
      } });
      objects.push({ depth: player.x + player.y, draw: () => {
        const p = projectPoint(player.x, player.y);
        drawFootWorld(p.x, p.y, projectFacing(player.angle), time);
      } });
    }
    if(includeActors&&state!=='title')for(const creature of mossEcology.entities){
      if(creature.indoors)continue;
      const p=projectPoint(creature.x,creature.y);
      if(p.x < -60||p.x>W+60||p.y < -60||p.y>H+70)continue;
      objects.push({depth:creature.x+creature.y,draw:()=>mossRenderer.draw(ctx,creature,p.x,p.y,
        projectFacing(creature.angle),creature.phase,creature.sunRunner&&creature.pursuingPlayer)});
    }
    objects.sort((a, b) => a.depth - b.depth).forEach(o => o.draw());
    trimUrbanSpriteCache();
  }

  function drawBikeExhaust(x,y,angle,speed,time,facing) {
    const dt=Math.max(0,Math.min(.05,time-(facing.exhaustTime??time)));
    facing.exhaustTime=time;
    const puffs=facing.exhaustPuffs??(facing.exhaustPuffs=[]);
    const forwardX=Math.sin(angle),forwardY=-Math.cos(angle);
    for(let i=puffs.length-1;i>=0;i--) {
      const p=puffs[i];p.age+=dt;
      p.x+=(p.vx-forwardX*speed)*dt;p.y+=(p.vy-forwardY*speed)*dt;
      if(p.age>=p.life)puffs.splice(i,1);
    }
    const running=bikeEngineRunning&&fuel>0&&bikeLife>0;
    if(running) {
      const power=Math.max(0,Math.min(1,(bikeRpm-1000)/6000));
      facing.exhaustClock=(facing.exhaustClock||0)+dt;
      const interval=.16-power*.08;
      while(facing.exhaustClock>=interval&&puffs.length<32) {
        facing.exhaustClock-=interval;
        puffs.push({x:(-forwardX*13+Math.cos(angle)*5)*ACTOR_VISUAL_SCALE,
          y:(-forwardY*13+Math.sin(angle)*5)*ACTOR_VISUAL_SCALE-2,
          vx:-forwardX*(8+power*9)+3,vy:-forwardY*(8+power*9)-8,
          age:0,life:.85+power*.25,power});
      }
    } else facing.exhaustClock=0;
    ctx.save();
    for(const p of puffs) {
      const progress=p.age/p.life,radius=(1.1+progress*(4+p.power*2))*ACTOR_VISUAL_SCALE;
      ctx.fillStyle=`rgba(167,175,171,${(1-progress)*(.24+p.power*.1)})`;
      ctx.beginPath();ctx.ellipse(x+p.x,y+p.y,radius,radius*.8,0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawBikeWheelMotion(ground,angle,phase,speed) {
    if(Math.abs(speed)<1)return;
    // Subtle moving tread, placed at the tire contacts of the current pose.
    const side=Math.abs(Math.sin(angle)),radius=2.1*ACTOR_VISUAL_SCALE;
    ctx.save();
    ctx.strokeStyle='#a9aaa4';ctx.globalAlpha=.28*side;
    ctx.lineWidth=.55;
    for(const [x,y] of ground.contacts){
      ctx.beginPath();
      ctx.ellipse(x,y-radius,radius*Math.max(.18,side),radius,0,phase,phase+1.1);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawBike(x, y, angle, speed, time, view = 'world') {
    const facing = smoothBikeFacing(angle, time, view);
    drawBikeExhaust(x,y,facing.angle,speed,time,facing);
    if (!bikeSpritesReady()) {
      ctx.save();ctx.translate(x,y+5);ctx.scale(ACTOR_VISUAL_SCALE,ACTOR_VISUAL_SCALE);
      drawBikeFallback(0,-5,angle,speed,time);ctx.restore();
      return {x, y};
    }
    const direction=facing.direction;
    const riding=view==='chase'||mounted;
    const ground=bikeGroundLayout(x,y,50,direction,riding);
    ctx.save();
    if (view === 'world') drawBikeContactShadow(x,y,ground);
    else drawBikeGroundShadow(x,y,ground,direction,time);
    // Cache the complete pose; the lamp mask uses this exact same silhouette.
    const painter=bikeBlendContext;
    const poses=riding?spriteAtlas.mounted.poses:null;
    const first=direction;
    const stamp=RENDER_SCALE+':'+(riding?'mounted:'+first:'parked:'+direction);
    if(stamp!==bikeBlendStamp){
      painter.setTransform(1,0,0,1,0,0);painter.clearRect(0,0,bikeBlendLayer.width,bikeBlendLayer.height);
      painter.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,80*RENDER_SCALE,80*RENDER_SCALE);
      painter.imageSmoothingEnabled=false;
      if(riding){
        painter.imageSmoothingQuality='medium';
        painter.translate(0,5);
        painter.globalCompositeOperation='source-over';
        painter.globalAlpha=1;
        drawMountedRiderPose(painter,seatedRiderSpriteSheet,poses[first],ACTOR_VISUAL_SCALE,0);
        painter.globalAlpha=1;
        painter.globalCompositeOperation='source-over';
      }else{
        painter.drawImage(bikeSpriteSource(direction),ground.sx,ground.sy,ground.sw,ground.sh,
          ground.left-x,ground.top-y,ground.width,ground.height);
      }
      bikeOcclusionContext.clearRect(0,0,bikeOcclusionLayer.width,bikeOcclusionLayer.height);
      for(let i=0;i<8;i++)bikeOcclusionContext.drawImage(bikeBlendLayer,0,0);
      bikeBlendStamp=stamp;
    }
    const motionDt=Math.max(0,Math.min(.05,time-(facing.motionTime??time)));
    facing.travelPhase=view==='world'?bike.wheel:(facing.travelPhase||0)+speed*motionDt/9;
    facing.motionTime=time;
    const motion=bikeMotion(speed,time,riding,facing.travelPhase,facing.angle);facing.motion=motion;
    ctx.translate(x,y+5);ctx.transform(1,0,motion.lean,motion.compression,0,0);ctx.translate(-x,-y-5);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(bikeBlendLayer,x-80,y-80,160,160);
    if(riding)drawBikeWheelMotion(ground,facing.angle,facing.travelPhase,speed);
    ctx.restore();
    const bounce=Math.sin(facing.travelPhase*2)*Math.min(.3,Math.abs(speed)/150);
    return { integrated:riding,x: x + ground.riderOffsetX - 6 * ACTOR_VISUAL_SCALE * Math.sin(facing.angle),
      y: y + ground.riderOffsetY - (14-2*Math.cos(facing.angle)-bounce)*ACTOR_VISUAL_SCALE };
  }
  function drawBikeFallback(x, y, angle, speed, time) {
    ctx.save(); ctx.translate(x + 3, y + 6); ctx.scale(1, .62); ctx.fillStyle = '#07101188'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(.72, .72);
    const bounce = Math.abs(Math.sin(time * 17)) * Math.min(1, Math.abs(speed) / 70);
    // Soft shadow, two aligned tires, and a clear front/rear silhouette.
    ctx.fillStyle = '#0a1111aa'; ctx.fillRect(-10, -13 + bounce, 20, 31);
    ctx.fillStyle = '#080d0f'; ctx.fillRect(-4, -18, 8, 11); ctx.fillRect(-5, 9, 10, 11);
    ctx.fillStyle = '#535a57'; ctx.fillRect(-2, -16, 4, 7); ctx.fillRect(-3, 11, 6, 7);
    ctx.fillStyle = '#9a6b4e'; ctx.fillRect(-3, 17, 6, 2);
    // Black fairing and tank with restrained steel highlights.
    ctx.fillStyle = '#111719'; ctx.fillRect(-7, -11, 14, 25);
    ctx.fillStyle = '#252c2d'; ctx.fillRect(-8, -7, 16, 11);
    ctx.fillStyle = '#3e4746'; ctx.fillRect(-6, -9, 2, 8); ctx.fillRect(4, -9, 2, 8);
    ctx.fillStyle = '#080d0f'; ctx.fillRect(-5, 3, 10, 9);
    ctx.fillStyle = '#343c3d'; ctx.fillRect(-4, 4, 8, 6);
    ctx.fillStyle = '#70746c'; ctx.fillRect(-2, 5, 4, 4);
    ctx.fillStyle = '#121719'; ctx.fillRect(-8, -2, 3, 8); ctx.fillRect(5, -2, 3, 8);
    ctx.fillStyle = '#6748a0'; ctx.fillRect(-1, -8, 2, 7); ctx.fillRect(-6, 0, 2, 4); ctx.fillRect(4, 0, 2, 4);
    // Purple crossbar and grips are deliberately easy to spot from above.
    ctx.fillStyle = '#160f21'; ctx.fillRect(-12, -13, 24, 5);
    ctx.fillStyle = '#a77be4'; ctx.fillRect(-11, -12, 22, 2);
    ctx.fillStyle = '#714bb0'; ctx.fillRect(-12, -14, 4, 7); ctx.fillRect(8, -14, 4, 7);
    ctx.fillStyle = '#d9b6ff'; ctx.fillRect(-10, -13, 2, 2); ctx.fillRect(8, -13, 2, 2);
    ctx.fillStyle = '#f0cb83'; ctx.fillRect(-3, -18, 6, 3); ctx.fillStyle = '#fff0c2'; ctx.fillRect(-2, -18, 4, 1);
    ctx.fillStyle = '#ed7356'; ctx.fillRect(-2, 18, 4, 2);
    ctx.restore();
  }
  function bikePartColor(value) {
    return value >= 100 ? '#edf1e5' : value >= 72 ? '#78d49a' : value >= 38 ? '#e5a44e' : '#e26052';
  }
  function bikeHoleSeverity() {
    return Math.max(0,Math.min(1,(95-bikeFaults.motor[2])/95));
  }
  function bikeFuelLeakRate() {
    return .35*bikeHoleSeverity()**2;
  }
  function damageBikePart(part, amount, impact = false) {
    amount/=1+upgrades.armor*.3;
    if (impact) {
      const faults=bikeFaults[part].map((value,index)=>value>0?index:-1).filter(index=>index>=0);
      if(!faults.length)return;
      const i=faults[Math.floor(Math.random()*faults.length)];bikeFaults[part][i] = Math.max(0,bikeFaults[part][i]-amount*4);
    }
    else bikeFaults[part] = bikeFaults[part].map(value => Math.max(0,value-amount));
    bikeParts[part] = bikeFaults[part].reduce((a,b)=>a+b,0)/4;
  }
  function updateBikeCondition(dt,speed=0) {
    fuel=Math.max(0,fuel-bikeFuelLeakRate()*dt/(1+upgrades.fuel*.25));
    if(fuel<=0)bikeEngineRunning=false;
    bikeCrashCooldown=Math.max(0,bikeCrashCooldown-dt);
    const moving=Math.abs(speed)>8;
    if(moving)bikeWearClock+=dt;
    // Roughly 1–3 percentage points per ten minutes riding, much less parked.
    const wear=dt*(moving?.002+Math.min(1,Math.abs(speed)/150)*.002:.0001);
    const rates={motor:1,handlebar:.6,frontTire:1.2,rearTire:1.3};
    Object.keys(bikeParts).forEach(part=>damageBikePart(part,wear*rates[part]));
    bikeLife=Math.max(0,bikeLife-wear*.5/(1+upgrades.armor*.3));
  }
  function bikeImpactDamage(speed,clearance=0){
    const ratio=Math.min(1.5,Math.abs(speed)/180),proximity=1-Math.min(1,Math.max(0,clearance)/80);
    return (2+28*ratio*ratio)*(.65+.35*proximity);
  }
  function applyBikeImpact(speed,label='IMPACTO',clearance=0) {
    if(bikeCrashCooldown>0||Math.abs(speed)<12)return false;
    const parts=Object.keys(bikeParts).filter(part=>bikeParts[part]>0);
    if(!parts.length)return false;
    const part=parts[Math.floor(Math.random()*parts.length)],before=bikeParts[part];
    const amount=bikeImpactDamage(speed,clearance);
    damageBikePart(part,amount,true);
    bikeLife=Math.max(0,bikeLife-amount*.8/(1+upgrades.armor*.3));bikeCrashCooldown=1.2;
    const loss=before-bikeParts[part];
    setToast(label+' · '+bikePartNames[part]+' −'+loss.toFixed(1)+'% · inspecione com E');
    return true;
  }
  function applyMountedImpact(speed,label,clearance=0){
    const impacted=applyBikeImpact(speed,label,clearance);
    if(impacted&&mounted&&Math.abs(speed)>45)woundCharacter('impact',Math.min(1.8,.65+Math.abs(speed)/150));
    return impacted;
  }
  function creatureCanHit(creature,target,inRoom=false,radius=4){
    const origin=inRoom?{x:creature.roomX,y:creature.roomY}:creature;
    if(distance(origin,target)>MossCreatures.TYPES[creature.kind].attackReach+radius)return false;
    for(const fraction of [.25,.5,.75]){
      const x=origin.x+(target.x-origin.x)*fraction,y=origin.y+(target.y-origin.y)*fraction;
      if(inRoom?interiorWalls.some(w=>x>=w.x&&x<=w.x+w.w&&y>=w.y&&y<=w.y+w.h):worldBlocked(x,y,1))return false;
    }
    return true;
  }
  function damageBikeByCreature(profile){
    let parts=profile.bikeTargets.filter(part=>bikeParts[part]>0);
    if(!parts.length)parts=Object.keys(bikeParts).filter(part=>bikeParts[part]>0);
    let label='ESTRUTURA';
    if(parts.length){
      const part=parts[Math.floor(Math.random()*parts.length)];
      damageBikePart(part,profile.bikeDamage,true);label=bikePartNames[part];
    }
    bikeLife=Math.max(0,bikeLife-profile.bikeDamage*.6/(1+upgrades.armor*.3));
    creatureBikeCooldown=1.2;
    if(bikeLife<=0){bikeEngineRunning=false;bikeRpm=0;bike.speed=0;}
    return label;
  }
  function knockRiderOff(creature,profile){
    mounted=false;bike.speed=0;bike.steering=0;bike.bank=0;
    stopBikeDrag();bikeInspectOpen=false;bikeService=null;
    if(ignition.active)ignition.close(false);
    keys.clear();player.gait=null;
    const away=Math.atan2(bike.y-creature.y,bike.x-creature.x);
    let landing={x:bike.x,y:bike.y};
    search:for(const radius of [24,32,40])candidateSearch:for(const turn of [0,.5,-.5,1,-1,2,-2,Math.PI]){
      const angle=away+turn,candidate={x:bike.x+Math.cos(angle)*radius,y:bike.y+Math.sin(angle)*radius};
      if(candidate.x<18||candidate.y<18||candidate.x>world.w-18||candidate.y>world.h-18)continue;
      for(let step=1;step<=8;step++)if(worldBlocked(bike.x+(candidate.x-bike.x)*step/8,bike.y+(candidate.y-bike.y)*step/8,7*ACTOR_VISUAL_SCALE))continue candidateSearch;
      landing=candidate;break search;
    }
    player.x=landing.x;player.y=landing.y;
    playerKnockdown=profile.stun;knockdownAngle=creature.x>bike.x?-Math.PI/2:Math.PI/2;
    creatureHitCooldown=Math.max(creatureHitCooldown,profile.stun+1.5);
    updateObjective();
  }
  function updateCreatureCombat(){
    if(!['drive','explore'].includes(state)||checkpointReturn)return;
    if(balanceEvent||(state==='explore'&&isShelter(exploreBuilding)))return;
    const inRoom=state==='explore',actor=inRoom?explorer:mounted?bike:player;
    for(const creature of mossEcology.entities){
      if((creature.attackCooldown||0)>0||creature.retired)continue;
      if(creature.kickStun>0)continue;
      if(inRoom?(!creature.indoors||creature.home!==exploreBuilding):creature.indoors)continue;
      const profile=MossCreatures.TYPES[creature.kind];
      if(creatureHitCooldown<=0&&creatureCanHit(creature,actor,inRoom,mounted?8:4)){
        const wasMounted=mounted&&!inRoom;
        const hit=MossCreatures.attackOutcome(creature.kind,{mounted:wasMounted,speed:bike.speed});
        characterHealth.damage(hit.damage);
        creature.attackCooldown=profile.attackInterval;creatureHitCooldown=1.5;flash=.28;
        let message=profile.name.toUpperCase()+' ATACOU — -'+hit.damage+' VIDA';
        if(wasMounted){
          const damaged=creatureBikeCooldown<=0?damageBikeByCreature(profile):'MOTO';
          if(hit.knockedOff||bikeLife<=0){
            if(bikeLife>0&&Math.abs(bike.speed)>12){balanceEvent={creature,profile,elapsed:0};message='RECUPERE O EQUILÍBRIO! CLIQUE OU ESPAÇO NA FAIXA VERDE.';}
            else {knockRiderOff(creature,profile);message=profile.name.toUpperCase()+' DERRUBOU VOCÊ! '+damaged+' DANIFICADO.';}
          }
          else {bike.speed*=1-profile.knockOffChance*.65;message=profile.name.toUpperCase()+' ATINGIU O PILOTO E A MOTO · '+damaged+' DANIFICADO.';}
        }
        setToast(message,3);return;
      }
      if(!inRoom&&creatureBikeCooldown<=0&&(bikeEngineRunning||creature.pursuingPlayer||creature.behavior==='investigate')&&creatureCanHit(creature,bike,false,8)){
        const damaged=damageBikeByCreature(profile);creature.attackCooldown=profile.attackInterval;
        setToast(profile.name.toUpperCase()+' ATACOU A MOTO · '+damaged+' DANIFICADO.',2.5);
      }
    }
  }
  function selectedBikePart() {
    return bikeInspectTab === 'Motor' ? 'motor' : bikeInspectTab === 'Guidão' ? 'handlebar' : bikeTireSelected;
  }
  function jobsForBikePart(part) { return bikeJobs[part.includes('Tire') ? 'tire' : part]; }
  function startBikeService(part, index) {
    if(bikeEngineRunning){setToast('DESLIGUE O MOTOR ANTES DE CONSERTAR A MOTO. USE R PERTO DELA PARA DESLIGAR.');return;}
    if (!Object.hasOwn(bikeParts,part) || !Number.isInteger(index) || index<0 || index>3) return;
    const practice = bikeFaults[part][index] >= 99.5 && bikeLife >= 99.5;
    if (!practice && repairKits <= 0) { setToast('SEM KIT — PROCURE FERRAMENTAS. Peças íntegras permitem treino.'); return; }
    bikeService = {
      part, index, pulse:0, job: jobsForBikePart(part)[index], practice, clock: 0, progress: 0, mistakes: 0,
      value: 0, stable: 0, phase: 'play', message: '', selected: -1,
      sequence: Array.from({length:4},()=>Math.floor(Math.random()*4)),
      remaining: [3,3,3,3], cure:[0,0,0,0], sandWork:[0,0,0,0], order: [2,0,3,1].sort(()=>Math.random()-.5),
      links: [2,0,3,1], done: [false,false,false,false]
    };
    if (bikeService.job[2] === 'pressure') bikeService.value = 16;
    if (bikeService.job[2] === 'engineHole') {
      const severity=bikeHoleSeverity(),radius=12+severity*17;
      bikeService.holeRadius=radius;
      bikeService.sealTime=.5+severity*.9;
      bikeService.sealWork=[0,0,0,0];
      bikeService.holes=Array.from({length:4},(_,i)=>{
        const a=i*Math.PI/2-Math.PI/2;
        return [240+Math.cos(a)*(radius+6),161+Math.sin(a)*(radius+6)];
      });
    }
    if (bikeService.job[2] === 'patch') {
      // Randomize within the rubber annulus, keeping patches separated and reachable.
      const count=1+Math.floor(Math.random()*3),angle=Math.random()*Math.PI*2;
      bikeService.holes=Array.from({length:count},(_,i)=>{
        const a=angle+i*Math.PI*2/count+(Math.random()-.5)*.6;
        const radius=Math.sqrt(35*35+Math.random()*(42*42-35*35));
        return [240+Math.cos(a)*radius,162+Math.sin(a)*radius*.84];
      });
      bikeService.remaining=Array(count).fill(3);bikeService.cure=Array(count).fill(0);
      bikeService.sandWork=Array(count).fill(0);bikeService.done=Array(count).fill(false);
    }
    if (bikeService.job[2] === 'bolts') bikeService.order = [0,1,2,3];
    if (bikeService.job[2] === 'balance') bikeService.value = .7;
    if (bikeService.job[2] === 'align') bikeService.value = Math.random() < .5 ? -12 : 12;
    if (bikeService.job[2] === 'sequence') bikeService.value = (Math.random()<.5?1:22);
    if (bikeService.job[2] === 'bearings') {bikeService.bearingStage='hammer';bikeService.seated=0;bikeService.hits=0;bikeService.lastStrike=-1;}
  }
  function completeBikeService() {
    const s = bikeService;
    if (!s || s.phase !== 'play') return;
    if (!s.practice) {
      if (repairKits <= 0) { s.message = 'Sem kit disponível.'; return; }
      s.toolCost=spendTools(); bikeFaults[s.part][s.index] = 100;
      bikeParts[s.part] = bikeFaults[s.part].reduce((a,b)=>a+b,0)/4;
      bikeLife = Math.min(100,bikeLife+15);
    }
    s.phase = 'done'; s.message = s.practice ? 'TREINO CONCLUIDO - sem desgaste' : 'REPARO CONCLUIDO - ferramentas -'+s.toolCost+'% - caixa '+(toolboxes[0]||0)+'%';
    setToast(s.message);
  }
  function bikeServiceMiss(message) {
    const s = bikeService; s.mistakes++; s.message = message;
    if (s.mistakes >= 3) { s.phase = 'failed'; s.message = '3 erros. Tente novamente; nenhum kit foi consumido.'; }
  }
  function bikeServiceAction(choice) {
    const s = bikeService;
    if (!s || s.phase === 'done' || s.phase === 'failed' || s.phase === 'memorize') return;
    s.message = '';
    s.pulse=.3;
    const mode = s.job[2];
    if (!Number.isInteger(choice) || choice < 0 || choice >= (mode === 'wires' ? 8 : mode==='engineHole'?5:4)) return;
    if (mode === 'timing') {
      if(s.clock-(s.lastHit??-1)<.4){s.message='Espere o próximo ciclo de ignição.';return;}
      if (Math.min(Math.abs(Math.sin(s.clock*2.2)),Math.abs(Math.cos(s.clock*2.2))) < .25) { s.lastHit=s.clock;s.progress++; if (s.progress === 3) completeBikeService(); }
      else bikeServiceMiss('Fora da faixa. Espere o marcador verde.');
    } else if (mode === 'sequence') {
      if(choice<2){const step=s.value>110?100:s.value>25?10:1;s.value=Math.max(0,Math.min(2200,s.value+(choice===0?-step:step)));}
      else if(s.value>=10&&s.value<=15){s.progress++;s.value=(Math.random()<.5?1:22);if(s.progress===4)completeBikeService();}
      else bikeServiceMiss('A lâmina deve passar com leve resistência: 0,10–0,15 mm.');
    } else if (mode === 'engineHole') {
      if(choice===4&&s.selected>=0) {
        // Keyboard applies sealant gradually; holding E cannot bypass the repair.
        const index=s.selected;
        if(s.clock-(s.lastSeal??-1)<.18)return;
        s.lastSeal=s.clock;
        s.sealWork[index]=Math.min(s.sealTime,s.sealWork[index]+.2);
      } else if(choice<4)s.selected=choice;
    } else if (mode === 'balance') {
      if(choice<2) s.value = Math.max(-1,Math.min(1,s.value+(choice===0?-.12:.12)));
    } else if (mode === 'pressure' || mode === 'torque' || mode === 'align') {
      if(choice<2) s.value = Math.max(mode==='align'?-20:0,Math.min(50,s.value+(choice===0?-1:1)*(mode==='pressure'?2:1)));
      else if(mode==='pressure' ? s.value>=30&&s.value<=34 : mode==='torque' ? s.value>=18&&s.value<=22 : Math.abs(s.value)<=1) completeBikeService();
      else bikeServiceMiss('Ajuste fora da faixa indicada.');
    } else if (mode === 'patch') {
      if(choice>=s.holes.length)return;
      if(!s.done[choice]) {
        if(s.cure[choice]>0){s.message='Aguarde a cola secar antes de pressionar o remendo.';return;}
        s.remaining[choice]--;
        if(s.remaining[choice]===1)s.cure[choice]=1.2;
        if(s.remaining[choice]===0){s.done[choice]=true;s.progress++;if(s.progress===s.holes.length)completeBikeService();}
      }
    } else if (mode === 'clean') {
      s.lastClean=choice;
      s.remaining[choice]=Math.max(0,s.remaining[choice]-1); if(s.remaining.every(v=>v===0)) completeBikeService();
    } else if (mode === 'bearings') {
      if(choice!==0)return;
      if(s.clock-s.lastStrike<.15)return;
      s.lastStrike=s.clock;s.hitPoint=0;s.hits++;s.progress=s.hits;s.seated=s.hits/3;
      s.message='Boa! Mais uma batida no mesmo lugar.';
      if(s.hits>=3)completeBikeService();
    } else if (mode === 'bolts') {
      if(s.order[choice]===s.progress) {s.progress++;if(s.progress===4)completeBikeService();}
      else bikeServiceMiss(mode==='bolts'?'Siga a ordem em cruz.':'Comece pelo menor rolamento restante.');
    } else if (mode === 'wires') {
      if(choice<4) s.selected=choice;
      else if(s.selected>=0) {
        if(s.links[choice-4]===s.selected && !s.done[s.selected]) {s.done[s.selected]=true;s.progress++;if(s.progress===4)completeBikeService();}
        else bikeServiceMiss('Os símbolos não correspondem.');
        s.selected=-1;
      }
    }
  }
  function updateBikeService(dt) {
    const s=bikeService;if(!s)return;
    if(s.phase==='done' || s.phase==='failed') {
      if(s.job[2]==='bearings'){s.clock+=dt;s.pulse=Math.max(0,s.pulse-dt);}
      return;
    }
    s.clock+=dt;
    s.pulse=Math.max(0,s.pulse-dt);
    s.cure=s.cure.map(value=>Math.max(0,value-dt));
    if(s.job[2]==='engineHole') {
      const d=s.drag;
      if(d?.kind==='seal') {
        const [x,y]=s.holes[d.index];
        if(Math.hypot(d.x-x,d.y-y)<=14)s.sealWork[d.index]=Math.min(s.sealTime,s.sealWork[d.index]+dt);
      }
      s.progress=s.sealWork.filter(work=>work>=s.sealTime).length;
      if(s.progress===4){completeBikeService();s.drag=null;}
    }
    if(s.drag?.kind==='press') {
      const d=s.drag,[x,y]=s.holes[d.index];
      if(s.cure[d.index]<=0&&Math.hypot(d.x-x,d.y-y)<14) {
        d.held+=dt;
        if(d.held>=.8){bikeServiceAction(d.index);s.drag=null;}
      } else d.held=0;
    }
    if(s.phase==='memorize' && s.clock>4) {s.phase='play';s.clock=0;}
    if(s.job[2]==='balance') {
      s.value=Math.max(-1,Math.min(1,s.value+Math.sin(s.clock*1.7)*dt*.25));
      s.stable=Math.abs(s.value)<.16?s.stable+dt:0;
      if(s.stable>=3)completeBikeService();
    }
  }
  function handleBikeInspectPointer(event) {
    if (event.button !== 0) return;
    const {x,y}=bikeServicePointer(event);
    if(x<13||x>467||y<12||y>258)return;
    if (x >= 17 && x <= 32 && y >= 13 && y <= 28) { bikeInspectOpen = false; bikeService=null; return; }
    if(x>=432&&x<=458&&y>=15&&y<=29){bikeWorkshopWindow.full=!bikeWorkshopWindow.full;bikeInspectHover=null;return;}
    if(y>=13&&y<31&&x>=35&&x<430){
      if(event.pointerId!==undefined&&!bikeWorkshopWindow.full){
        const p=bikeCanvasPointer(event),view=bikeWorkshopViewport();
        event.preventDefault();canvas.setPointerCapture(event.pointerId);
        bikeWorkshopWindow.drag={pointerId:event.pointerId,dx:p.x-view.x,dy:p.y-view.y};
      }
      return;
    }
    if (y >= 31 && y <= 49 && x >= 15 && x < 465) {bikeInspectTab = bikeInspectTabs[Math.floor((x-15)/(450/bikeInspectTabs.length))];bikeService=null;return;}
    if(bikeService?.phase==='play'&&bikeWrenchHit(bikeService,x,y)&&beginBikeServiceGesture(event,x,y))return;
    if(bikeService) {
      if(y>=229&&y<=246&&x>=30&&x<=160) {
        if(bikeService.phase==='failed') startBikeService(bikeService.part,bikeService.index);
        else bikeService=null; return;
      }
      if(bikeService.phase!=='play')return;
      if(beginBikeServiceGesture(event,x,y))return;
      const mode=bikeService.job[2];
      if(mode==='engineHole')return;
      if(mode==='bearings') {
        if(x>=170&&x<=310&&y>=120&&y<=212)bikeServiceAction(0);
        return;
      }
      if(mode==='patch' || mode==='bolts') {
        const points=mode==='patch'?bikeService.holes:[[240,123],[240,191],[206,157],[274,157]];
        const hit=points.findIndex(([px,py])=>Math.hypot(x-px,y-py)<=13);
        if(hit>=0)bikeServiceAction(hit);
      } else if(mode==='wires') {
        const row=Math.floor((y-116)/24);
        if(row>=0&&row<4) {if(x>=65&&x<=180)bikeServiceAction(row);else if(x>=270&&x<=385)bikeServiceAction(row+4);}
      } else if(['timing','balance','pressure','torque','align','sequence'].includes(mode)) {
        if(y>=182&&y<=210) {if(x>=100&&x<180)bikeServiceAction(0);else if(x>=190&&x<270)bikeServiceAction(1);else if(x>=280&&x<=365)bikeServiceAction(2);}
      } else if(y>=128&&y<=197&&x>=55&&x<423) bikeServiceAction(Math.floor((x-55)/92));
      return;
    }
    if(bikeInspectTab==='Info') {
      if(x>=210&&x<=454&&y>=103&&y<231) {
        const part=['motor','handlebar','frontTire','rearTire'][Math.floor((y-103)/32)];
        bikeInspectTab=part==='motor'?'Motor':part==='handlebar'?'Guidão':'Pneus';
        if(part.includes('Tire'))bikeTireSelected=part;
      }
      return;
    }
    if(bikeInspectTab==='Pneus'&&y>=58&&y<=76) {bikeTireSelected=x<240?'frontTire':'rearTire';return;}
    if(y>=110&&y<230&&x>=25&&x<=455) startBikeService(selectedBikePart(),Math.floor((y-110)/30));
  }
  function bikeWorkshopViewport(){
    if(bikeWorkshopWindow.full){
      const scale=Math.min((W-8)/454,(H-8)/246);
      return {x:(W-454*scale)/2-13*scale,y:(H-246*scale)/2-12*scale,scale};
    }
    return {x:bikeWorkshopWindow.x??W-480*.64-8,y:bikeWorkshopWindow.y??5,scale:.64};
  }
  function moveBikeWorkshopWindow(event){
    const drag=bikeWorkshopWindow.drag;
    if(!drag||drag.pointerId!==event.pointerId||!bikeInspectOpen)return false;
    const p=bikeCanvasPointer(event),{scale}=bikeWorkshopViewport();
    bikeWorkshopWindow.x=Math.max(4-13*scale,Math.min(W-4-467*scale,p.x-drag.dx));
    bikeWorkshopWindow.y=Math.max(4-12*scale,Math.min(H-4-258*scale,p.y-drag.dy));
    bikeInspectHover=null;return true;
  }
  function endBikeWorkshopWindowDrag(event){
    const drag=bikeWorkshopWindow.drag;if(!drag||drag.pointerId!==event.pointerId)return false;
    bikeWorkshopWindow.drag=null;
    if(canvas.hasPointerCapture(drag.pointerId))canvas.releasePointerCapture(drag.pointerId);
    canvas.dataset.bikeTool='__window__';return true;
  }
  function bikeCanvasPointer(event) {
    const bounds=canvas.getBoundingClientRect();
    return {x:(event.clientX-bounds.left)/bounds.width*DISPLAY_W-gameScene.x,y:(event.clientY-bounds.top)/bounds.height*DISPLAY_H-gameScene.y};
  }
  function bikeServicePointer(event) {
    const p=bikeCanvasPointer(event),view=bikeWorkshopViewport();
    return {x:Math.round((p.x-view.x)/view.scale*1e6)/1e6,y:Math.round((p.y-view.y)/view.scale*1e6)/1e6};
  }
  function bikeServiceTool() {
    const s=bikeService;if(!s)return 'wrench';
    const mode=s.job[2];
    if(mode==='bearings'&&s.bearingStage==='hammer')return 'mallet';
    if(mode==='engineHole')return 'glue';
    if(mode==='patch') {
      const ready=s.remaining.findIndex((stage,i)=>!s.done[i]&&s.cure[i]<=0);
      const index=s.drag?.index??(s.hoverIndex>=0?s.hoverIndex:ready);
      return s.remaining[Math.max(0,index)]===3?'sandpaper':s.remaining[Math.max(0,index)]===2?'glue':'patch';
    }
    return ({clean:'brush',pressure:'pump',wires:'pliers',sequence:'gauge',balance:'screwdriver',timing:'screwdriver',bearings:'patch',align:'wrench',torque:'wrench',bolts:'wrench'})[mode]||'wrench';
  }
  function syncBikeServiceCursor() {
    if(bikeWorkshopWindow.drag){canvas.style.cursor='grabbing';return;}
    if(bikeInspectOpen&&bikeInspectHover&&bikeInspectHover.y>=13&&bikeInspectHover.y<31&&bikeInspectHover.x>=35){
      canvas.style.cursor=bikeInspectHover.x>=432?'pointer':bikeWorkshopWindow.full?'default':'grab';
      canvas.dataset.bikeTool='__window__';return;
    }
    const active=bikeInspectOpen&&bikeService?.phase==='play';
    const tool=active?bikeServiceTool():'';
    if(canvas.dataset.bikeTool===tool)return;
    canvas.dataset.bikeTool=tool;canvas.style.touchAction=active?'none':'';
    if(!active){canvas.style.cursor='';return;}
    if(!bikeToolCursors.has(tool)) {
      const shapes={
        mallet:'<path d="M8 39L30 15" stroke="#b58a53" stroke-width="6"/><path d="M17 8L27 2L43 20L33 28Z" fill="#1c2424" stroke="#879287" stroke-width="2"/>',
        wrench:'<path d="M12 27L28 11M26 4L23 11L29 17L36 14L32 20L26 20L9 36L4 31L21 14L20 8Z" fill="#b8c6ce"/>',
        screwdriver:'<path d="M10 33L29 12L33 8" stroke="#cbd5d9" stroke-width="4"/><path d="M7 35L18 23" stroke="#df924c" stroke-width="8"/>',
        brush:'<path d="M10 34L24 18" stroke="#c89460" stroke-width="7"/><path d="M19 14L29 6L40 17L31 27Z" fill="#ceb985"/><path d="M28 9L23 20M32 12L27 24M36 15L31 27" stroke="#736348" stroke-width="2"/>',
        sandpaper:'<path d="M16 8L36 5L41 23L20 27Z" fill="#aa8964"/><path d="M21 13L34 10M23 19L36 16" stroke="#6a5140" stroke-dasharray="2 2"/>',
        glue:'<path d="M19 13L30 10L37 30L24 34Z" fill="#cfb166"/><path d="M20 14L17 7L21 4L27 11" fill="#e8e2d2"/>',
        patch:'<ellipse cx="28" cy="15" rx="13" ry="10" fill="#373e44"/><ellipse cx="28" cy="15" rx="9" ry="6" fill="#a9794e"/>',
        pliers:'<path d="M10 35L24 17L21 5M16 38L29 20L38 11" fill="none" stroke="#d78a4e" stroke-width="5"/><path d="M24 17L21 5M29 20L38 11" stroke="#c3cdd4" stroke-width="4"/>',
        gauge:'<path d="M10 35L35 9L40 12L15 39Z" fill="#bbc6ca"/><path d="M19 31L37 12" stroke="#626f78"/>',
        pump:'<path d="M24 10L24 31M15 31L34 31M14 9L34 9" stroke="#b7c6cb" stroke-width="4"/><path d="M29 23Q42 23 38 8" fill="none" stroke="#c39b61" stroke-width="3"/>'
      };
      const glove='<path d="M4 44L4 36Q4 33 7 30L12 25Q14 23 16 25L13 30L21 22Q23 20 25 23L20 29L27 23Q30 21 31 24L25 31L29 28Q32 27 33 30L28 36Q25 39 23 43L22 47L7 47Z" fill="url(#leather)" stroke="#251e22" stroke-width="1.4"/><path d="M8 34Q15 36 20 40M13 30L17 33M20 29L23 32M25 31L27 33" fill="none" stroke="#e3ba82" stroke-width="1"/><path d="M7 40L23 43L22 47L6 47Z" fill="#292735"/><path d="M9 43L20 45" stroke="#9874b9" stroke-width="2"/><path d="M7 32L10 29M8 37L10 38" stroke="#f5d5a0" stroke-linecap="round"/>';
      const details={
        mallet:'<path d="M10 37L27 19" stroke="#e6bc80" stroke-width="1.5"/><path d="M22 8L36 23M26 5L40 20" stroke="#4c5a60" stroke-width="2"/>',
        wrench:'<path d="M10 32L24 18" stroke="#f0f5f4" stroke-width="2"/><circle cx="9" cy="32" r="2" fill="#37444b"/><path d="M25 6L25 11L29 15L33 14" fill="none" stroke="#f4f7ef"/>',
        screwdriver:'<path d="M20 23L32 10" stroke="#f1f8f7" stroke-width="1.2"/><path d="M8 33L15 26M11 36L18 29" stroke="#764027" stroke-width="1.5"/>',
        brush:'<path d="M27 9L38 19" stroke="#ede0b4" stroke-width="2"/><path d="M22 17L30 25M24 15L33 23M27 13L36 21" stroke="#9e834f"/><path d="M11 32L20 22" stroke="#edc088"/>',
        sandpaper:'<path d="M17 8L20 26L40 22" fill="none" stroke="#e1b882"/><path d="M23 10L25 22M29 9L31 21M35 8L37 20" stroke="#604c3d" stroke-dasharray="1 3"/>',
        glue:'<path d="M23 19L31 16L34 25L26 28Z" fill="#ede8d1"/><path d="M26 21L31 19" stroke="#ad7750" stroke-width="2"/><path d="M19 8L22 6" stroke="#fff5ce"/>',
        patch:'<ellipse cx="28" cy="15" rx="11" ry="8" fill="none" stroke="#dfaa73" stroke-dasharray="2 2"/><path d="M23 14L26 17L33 12" fill="none" stroke="#e9c99b" stroke-width="1.5"/>',
        pliers:'<circle cx="26" cy="19" r="3.5" fill="#899ca5"/><circle cx="26" cy="19" r="1" fill="#24343e"/><path d="M10 33L20 21M17 35L25 25" stroke="#ffc480" stroke-width="1.3"/>',
        gauge:'<path d="M20 28L35 12" stroke="#edf5f2"/><path d="M23 28L26 29M27 24L30 25M31 20L34 21" stroke="#4a5861"/>',
        pump:'<path d="M15 7L33 7" stroke="#e6eeeb"/><path d="M21 17L27 17L27 29L21 29Z" fill="#b98b56"/><path d="M22 19L22 27" stroke="#f0ca8f"/>'
      };
      const defs='<defs><linearGradient id="leather" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e2ba82"/><stop offset=".5" stop-color="#b58453"/><stop offset="1" stop-color="#715035"/></linearGradient><filter id="shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="1" stdDeviation=".6" flood-opacity=".65"/></filter></defs>';
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'+defs+'<g filter="url(#shadow)" stroke="#20272b" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">'+shapes[tool]+(details[tool]||'')+glove+'</g><circle cx="28" cy="12" r="1.2" fill="#fff1bf" stroke="#29232c" stroke-width=".6"/></svg>';
      bikeToolCursors.set(tool,'url("data:image/svg+xml,'+encodeURIComponent(svg)+'") 28 12, crosshair');
    }
    canvas.style.cursor=bikeToolCursors.get(tool);
  }
  function bikeWrenchHit(s,x,y) {
    const mode=s.job[2];
    if(mode!=='torque'&&mode!=='bolts')return null;
    const index=mode==='bolts'?s.progress:-1;
    if(index>3)return null;
    const [cx,cy]=mode==='bolts'?[[240,123],[240,191],[206,157],[274,157]][index]:[240,153];
    const angle=mode==='bolts'?(s.boltAngles?.[index]??.2):(s.toolAngle??.3);
    const dx=x-cx,dy=y-cy,along=dx*Math.cos(angle)+dy*Math.sin(angle),across=-dx*Math.sin(angle)+dy*Math.cos(angle);
    return along>=7&&along<=(mode==='bolts'?46:63)&&Math.abs(across)<=9?{index,cx,cy,angle}:null;
  }
  function beginBikeServiceGesture(event,x,y) {
    // Keyboard and menu buttons remain available; gestures operate on the workpiece.
    if(event.pointerId===undefined)return false;
    const s=bikeService,mode=s.job[2],grip=bikeWrenchHit(s,x,y);
    if((y<116||y>212)&&!grip)return false;
    let kind='',index=-1,cx=240,cy=153;
    if(mode==='bearings')return false;
    if(mode==='engineHole') {
      index=s.holes.findIndex(([px,py])=>Math.hypot(x-px,y-py)<=14);
      if(index>=0&&s.sealWork[index]<s.sealTime){kind='seal';s.selected=index;}
    }
    if(mode==='torque'&&Math.hypot(x-cx,y-cy)<61)kind='turn';
    if(mode==='pressure'&&x>304&&x<399&&y<181)kind='pump';
    if(mode==='align'&&x>110&&x<370&&y<178)kind='align';
    if(mode==='sequence') {
      const handleY=141+Math.max(0,Math.min(35,s.value))*.5;
      if(x>=101&&x<=152&&y>=handleY-3&&y<=handleY+13)kind='feeler';
    }
    if(mode==='patch') {
      index=s.holes.findIndex(([px,py])=>Math.hypot(x-px,y-py)<14);
      if(index>=0&&!s.done[index]) {
        if(s.cure[index]>0){s.message='Cola secando neste furo. Você pode preparar os outros.';return true;}
        kind=s.remaining[index]===3?'sand':s.remaining[index]===1?'press':'glue';
      }
    }
    if(mode==='clean'&&x>=55&&x<423&&y>=128&&y<=197){index=Math.floor((x-55)/92);kind='brush';}
    if(mode==='wires'&&x>=65&&x<=180&&y<212){index=Math.floor((y-116)/24);if(index<4&&!s.done[index]){kind='wire';s.selected=index;}}
    if(mode==='bolts') {
      const points=[[240,123],[240,191],[206,157],[274,157]];
      index=grip?grip.index:points.findIndex(([px,py])=>Math.hypot(x-px,y-py)<14);
      if(index>=0){kind='bolt';[cx,cy]=points[index];}
    }
    if(!kind)return false;
    event.preventDefault();canvas.setPointerCapture(event.pointerId);
    s.drag={pointerId:event.pointerId,kind,index,x,y,startX:x,startY:y,cx,cy,angle:Math.atan2(y-cy,x-cx),work:0,held:0,down:false};
    if(kind==='turn'||kind==='bolt') {
      s.boltWork??=[0,0,0,0];s.boltAngles??=[.2,.2,.2,.2];
      const visual=kind==='turn'?(s.toolAngle??.3):s.boltAngles[index];
      s.drag.gripOffset=visual-s.drag.angle;
      if(kind==='bolt')s.drag.work=s.boltWork[index];
    }
    if(kind==='glue') {
      bikeServiceAction(index);
      s.drag=null;
      s.message='Cola aplicada no furo '+(index+1)+'. Prepare outro enquanto seca.';
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    }
    return true;
  }
  function moveBikeServiceGesture(event) {
    if(moveBikeWorkshopWindow(event))return;
    const s=bikeService;if(!bikeInspectOpen||!s||s.phase!=='play')return;
    const p=bikeServicePointer(event);
    if(s.job[2]==='patch')s.hoverIndex=s.holes.findIndex(([x,y])=>Math.hypot(p.x-x,p.y-y)<14);
    const d=s.drag;if(!d||d.pointerId!==event.pointerId)return;
    const dx=p.x-d.x,dy=p.y-d.y;d.x=p.x;d.y=p.y;s.pulse=.18;
    if(d.kind==='turn'||d.kind==='bolt') {
      const angle=Math.atan2(p.y-d.cy,p.x-d.cx);
      const delta=Math.atan2(Math.sin(angle-d.angle),Math.cos(angle-d.angle));d.angle=angle;
      if(Math.hypot(p.x-d.cx,p.y-d.cy)>65)return;
      if(d.kind==='turn')s.toolAngle=angle+d.gripOffset;
      else s.boltAngles[d.index]=angle+d.gripOffset;
      const turn=Math.max(-.5,Math.min(.5,delta));
      if(d.kind==='turn'){
        if(Math.hypot(p.x-d.cx,p.y-d.cy)<10)return;
        // Slow down further near the target so fine adjustments do not overshoot.
        const sensitivity=s.value>=16&&s.value<=24?.7:2;
        s.value=Math.max(0,Math.min(50,s.value+turn*sensitivity));
      }
      else {
        if(Math.hypot(p.x-d.cx,p.y-d.cy)<8)return;
        d.work=Math.max(0,d.work+Math.max(-.2,Math.min(.2,delta))*.12);
        s.boltWork[d.index]=d.work;
        if(d.work>=1.1){bikeServiceAction(d.index);s.drag=null;}
      }
    } else if(d.kind==='pump') {
      if(p.y-d.startY>20&&!d.down){bikeServiceAction(1);d.down=true;}
      if(p.y-d.startY<5)d.down=false;
    } else if(d.kind==='align')s.value=Math.max(-20,Math.min(20,s.value+dx*.15));
    else if(d.kind==='bearingAlign')s.value=Math.max(-12,Math.min(12,s.value+dx*.15));
    else if(d.kind==='feeler')s.value=Math.max(0,Math.min(35,s.value+dy*2));
    else if(d.kind==='sand'||d.kind==='brush') {
      if(d.kind==='brush'&&p.x>=55&&p.x<423&&p.y>=128&&p.y<=197) {
        const index=Math.floor((p.x-55)/92);
        s.brushWork??=[0,0,0,0];
        d.index=index;d.work=s.brushWork[index];
      }
      const inside=d.kind==='sand'?Math.hypot(p.x-s.holes[d.index][0],p.y-s.holes[d.index][1])<17:p.x>=55+d.index*92&&p.x<137+d.index*92&&p.y>=128&&p.y<=197;
      if(inside){
        const motion=Math.min(12,Math.hypot(dx,dy));
        d.work+=motion;
        if(d.kind==='sand'){s.sandWork[d.index]=Math.min(32,s.sandWork[d.index]+motion);d.work=s.sandWork[d.index];}
        else s.brushWork[d.index]=d.work;
        if(d.work>=32){d.work=0;bikeServiceAction(d.index);if(d.kind==='sand')s.drag=null;else s.brushWork[d.index]=0;}
      }
    }
  }
  function endBikeServiceGesture(event) {
    if(endBikeWorkshopWindowDrag(event))return;
    const s=bikeService,d=s?.drag;if(!d||d.pointerId!==event.pointerId)return;
    s.drag=null;
    if(d.kind==='bearingLift'&&event.type==='pointerup'&&s.phase==='play') {
      const p=bikeServicePointer(event);
      if(Math.hypot(p.x-242,p.y-153)<34)bikeServiceAction(d.index);
    }
    if(d.kind==='wire'&&event.type!=='pointercancel'&&event.type!=='lostpointercapture'&&s.phase==='play') {
      const p=bikeServicePointer(event),row=Math.floor((p.y-116)/24);
      if(p.x>=270&&p.x<=385&&row>=0&&row<4)bikeServiceAction(row+4);
      else s.selected=-1;
    }
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  function drawBikePressureService(s,text,button) {
    ctx.save();
    const casing=ctx.createLinearGradient(0,116,0,224);
    casing.addColorStop(0,'#29383e');casing.addColorStop(1,'#101d23');
    ctx.fillStyle=casing;ctx.strokeStyle='#42585f';ctx.lineWidth=.7;
    ctx.beginPath();ctx.roundRect(56,117,369,108,5);ctx.fill();ctx.stroke();
    const cx=143,cy=148,r=29;
    ctx.fillStyle='#03090d';ctx.beginPath();ctx.arc(cx+1,cy+3,r+4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#303a3d';ctx.strokeStyle='#788789';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(cx,cy,r+3,0,Math.PI*2);ctx.fill();ctx.stroke();
    const face=ctx.createLinearGradient(0,120,0,177);face.addColorStop(0,'#e0ddca');face.addColorStop(1,'#aaa994');
    ctx.fillStyle=face;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#72986c';ctx.lineWidth=4;ctx.beginPath();ctx.arc(cx,cy,24,Math.PI*.75+30/50*Math.PI*1.5,Math.PI*.75+34/50*Math.PI*1.5);ctx.stroke();
    for(let i=0;i<=25;i++) {
      const a=Math.PI*.75+i/25*Math.PI*1.5,major=i%5===0;
      ctx.strokeStyle='#38413e';ctx.lineWidth=major?1:.5;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(major?20:23),cy+Math.sin(a)*(major?20:23));ctx.lineTo(cx+Math.cos(a)*26,cy+Math.sin(a)*26);ctx.stroke();
      if(major)text(String(i*2),cx+Math.cos(a)*15-3,cy+Math.sin(a)*15+2,4.5,'#35413d');
    }
    text('PSI',cx-5,cy+17,5,'#4f5c52');
    const needle=Math.PI*.75+s.value/50*Math.PI*1.5;
    ctx.strokeStyle='#b05039';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(cx-Math.cos(needle)*4,cy-Math.sin(needle)*4);ctx.lineTo(cx+Math.cos(needle)*23,cy+Math.sin(needle)*23);ctx.stroke();
    ctx.fillStyle='#414c49';ctx.beginPath();ctx.arc(cx,cy,2.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#09161b';ctx.beginPath();ctx.roundRect(205,120,96,56,3);ctx.fill();
    text('PRESSÃO ATUAL',214,130,5.5,'#91a9ac');
    text(s.value.toFixed(1)+' PSI',214,147,13,'#dfebd7');
    text('IDEAL: 30–34 PSI',214,163,7,'#a9c99c');
    const pumpY=126+Math.max(0,Math.min(23,s.drag?.kind==='pump'?s.drag.y-s.drag.startY:0));
    ctx.strokeStyle='#667e87';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(341,173);ctx.lineTo(341,pumpY);ctx.stroke();
    ctx.fillStyle='#b88b56';ctx.beginPath();ctx.roundRect(322,pumpY-3,38,6,2);ctx.fill();
    const barrel=ctx.createLinearGradient(332,0,351,0);barrel.addColorStop(0,'#203e47');barrel.addColorStop(.5,'#4f7880');barrel.addColorStop(1,'#1c323b');
    ctx.fillStyle=barrel;ctx.fillRect(333,147,17,26);ctx.fillStyle='#151c20';ctx.fillRect(322,173,39,4);
    ctx.strokeStyle='#060d12';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(333,169);ctx.bezierCurveTo(311,184,187,183,174,155);ctx.stroke();
    ctx.strokeStyle='#3a5059';ctx.lineWidth=1;ctx.stroke();
    text('BOMBA ↓↑',318,122,5,'#a4bdc0');
    button('− Aliviar [←]',100,182);button('+ Ar [→]',190,182);button('Confirmar [E]',280,182,85);
    text('Arraste a bomba para baixo e para cima. − libera o excesso de ar.',76,219,6,'#adc3c2');
    ctx.restore();
  }
  function drawBikeServiceInstrument(s,mode,text,button) {
    if(mode==='pressure'){drawBikePressureService(s,text,button);return;}
    const metal=ctx.createLinearGradient(0,120,0,176);
    metal.addColorStop(0,'#c6ced0');metal.addColorStop(.5,'#626e75');metal.addColorStop(1,'#303b42');
    ctx.fillStyle='#111a1e';ctx.fillRect(67,117,345,62);
    if(mode==='pressure'||mode==='torque') {
      const cx=mode==='pressure'?194:240,cy=150,r=29;
      ctx.fillStyle='#d2d1bd';ctx.strokeStyle='#6e7c84';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.stroke();
      for(let i=0;i<=10;i++){
        const a=Math.PI*.75+i*Math.PI*1.5/10;
        ctx.strokeStyle='#36444b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*22,cy+Math.sin(a)*22);ctx.lineTo(cx+Math.cos(a)*26,cy+Math.sin(a)*26);ctx.stroke();
      }
      const a=Math.PI*.75+Math.min(1,s.value/50)*Math.PI*1.5;
      ctx.strokeStyle='#ae4f3b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*22,cy+Math.sin(a)*22);ctx.stroke();
      if(mode==='pressure') {
        const pumpY=126+Math.max(0,Math.min(23,s.drag?.kind==='pump'?s.drag.y-s.drag.startY:0));
        ctx.strokeStyle='#839ba7';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(341,170);ctx.lineTo(341,pumpY);ctx.moveTo(323,pumpY);ctx.lineTo(359,pumpY);ctx.stroke();
        ctx.fillStyle=metal;ctx.fillRect(333,146,16,29);ctx.fillRect(321,173,40,3);
        ctx.strokeStyle='#576e7d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(333,170);ctx.bezierCurveTo(303,189,275,134,224,152);ctx.stroke();
        text('Arraste a bomba ↓↑',278,122,6,'#a5b5b9');
      } else {
        ctx.save();ctx.translate(cx,cy);ctx.rotate(s.drag?.kind==='turn'?s.drag.angle:Math.PI*.15);
        ctx.fillStyle=metal;ctx.fillRect(6,-3,44,6);ctx.fillStyle='#c78c53';ctx.fillRect(38,-5,18,10);ctx.restore();
        text('Gire a chave ↻',310,146,7,'#b9cbd1');
      }
      text(s.value.toFixed(1)+(mode==='pressure'?' PSI · alvo 30–34':' Nm · alvo 18–22'),133,174,8,'#e5ddc7');
    } else if(mode==='align') {
      ctx.strokeStyle='#77a18d';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(240,120);ctx.lineTo(240,176);ctx.stroke();ctx.setLineDash([]);
      ctx.save();ctx.translate(240,151);ctx.rotate(s.value*Math.PI/180);
      ctx.fillStyle='#20282d';ctx.fillRect(-7,-27,14,54);ctx.strokeStyle='#9caab2';ctx.lineWidth=3;ctx.strokeRect(-7,-27,14,54);
      ctx.beginPath();ctx.moveTo(-64,-16);ctx.lineTo(-34,-23);ctx.lineTo(-18,-7);ctx.lineTo(18,-7);ctx.lineTo(34,-23);ctx.lineTo(64,-16);ctx.stroke();ctx.restore();
      text('Arraste o guidão para centralizar',84,126,6,'#b9cbd1');
      text(s.value.toFixed(1)+'° · alvo −1 a +1',287,174,7);
    } else {
      const travel=Math.max(0,Math.min(35,s.value))*.5;
      ctx.fillStyle=metal;ctx.fillRect(184,123,103,13);ctx.fillRect(242,136,12,8);
      // Keep the blade below the upper contact and above the moving valve tip.
      ctx.fillRect(242,149+travel,12,25-travel);
      ctx.strokeStyle='#818f95';ctx.lineWidth=2;ctx.strokeRect(177,119,119,55);
      const handleY=141+travel,held=s.drag?.kind==='feeler';
      ctx.fillStyle='#b5c9ce';ctx.fillRect(145,handleY+4,105,2);
      ctx.fillStyle=held?'#d5ab70':'#a97e49';ctx.strokeStyle=held?'#efdcac':'#624a32';ctx.lineWidth=1;
      ctx.beginPath();ctx.roundRect(104,handleY,45,10,3);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#6d4c2e';
      for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(113+i*6,handleY+2);ctx.lineTo(113+i*6,handleY+8);ctx.stroke();}
      ctx.strokeStyle=held?'#e2cd91':'#91afa7';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(91,148);ctx.lineTo(91,172);ctx.moveTo(88,151);ctx.lineTo(91,148);ctx.lineTo(94,151);ctx.moveTo(88,169);ctx.lineTo(91,172);ctx.lineTo(94,169);ctx.stroke();
      text('Pegue o cabo e mova para cima / baixo',88,126,6,'#b9cbd1');
      text('Válvula '+(s.progress+1)+'/4 · '+(s.value/100).toFixed(2)+' mm',307,153,7);
      text('Alvo 0,10–0,15',307,166,6,'#8db19a');
    }
    button('− [←]',100,182);button('+ [→]',190,182);button('Confirmar [E]',280,182,85);
    text(mode==='torque'?'Gire sem exceder o torque e confirme.':mode==='pressure'?'Bombeie com movimentos completos; − alivia a pressão.':mode==='align'?'Compare a roda com a linha de referência.':'Cima diminui a folga; baixo aumenta. Confirme com E.',80,220,7,'#b6c6c2');
  }
  function drawBikeEngineHoleService(s,text) {
    ctx.save();
    const metal=ctx.createLinearGradient(0,119,0,222);
    metal.addColorStop(0,'#617079');metal.addColorStop(.5,'#29363e');metal.addColorStop(1,'#17242b');
    ctx.fillStyle=metal;ctx.strokeStyle='#9ca8a6';ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(153,119,174,86,9);ctx.fill();ctx.stroke();
    for(let i=0;i<6;i++){ctx.fillStyle='#121e25';ctx.fillRect(159,124+i*13,162,3);}
    const radius=s.holeRadius;
    ctx.fillStyle='#070d10';ctx.strokeStyle='#c39b74';ctx.lineWidth=2;
    ctx.beginPath();
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8,r=radius*(i%2?.83:1);
      const x=240+Math.cos(a)*r,y=161+Math.sin(a)*r;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();ctx.fill();ctx.stroke();
    const severity=bikeHoleSeverity(),drops=Math.ceil(severity*6);
    if(fuel>0)for(let i=0;i<drops;i++){
      const t=(s.clock*(.7+severity)+i/drops)%1;
      ctx.fillStyle=`rgba(219,177,89,${(1-t)*.8})`;
      ctx.beginPath();ctx.ellipse(237+Math.sin(i*4)*radius*.3,170+t*38,1+severity,2+severity,0,0,Math.PI*2);ctx.fill();
    }
    s.holes.forEach(([x,y],i)=>{
      const fraction=s.sealWork[i]/s.sealTime,done=fraction>=1;
      ctx.fillStyle=done?'#87ad8a':'#382f38';ctx.strokeStyle=s.selected===i?'#ecd99a':'#a5aaa3';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#afc79c';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(x,y,11,-Math.PI/2,-Math.PI/2+fraction*Math.PI*2);ctx.stroke();
      text(done?'OK':String(i+1),x-4,y+3,6,done?'#13251c':'#f0e2c6');
    });
    text('FURO NO MOTOR',54,134,8,'#e7bc92');
    text('Tamanho: '+Math.round(severity*100)+'%',54,150,7,'#c6b4a0');
    text('Gasolina perdida:',54,170,7,'#c6b4a0');
    text((bikeFuelLeakRate()*60).toFixed(1)+'% / min',54,184,9,'#e5b76f');
    text('VEDAÇÃO',349,138,7,'#c3d3c4');
    text(s.progress+'/4 pontos',349,154,8,'#b8d4ab');
    text('Segure o mouse',339,178,6,'#b5c2be');
    text('sobre os pontos.',339,189,6,'#b5c2be');
    text('1–4 seleciona · E aplica selante · concluir estanca o vazamento',54,221,6,'#b9c8c1');
    ctx.restore();
  }
  function drawBikeEngineService(s,mode,text,button) {
    const metal=ctx.createLinearGradient(0,118,0,215);
    metal.addColorStop(0,'#394950');metal.addColorStop(.45,'#202d33');metal.addColorStop(1,'#111c21');
    ctx.save();
    ctx.fillStyle='#03080c';ctx.fillRect(40,115,402,112);
    ctx.fillStyle=metal;ctx.strokeStyle='#52636a';ctx.lineWidth=.7;
    ctx.beginPath();ctx.roundRect(43,117,394,108,5);ctx.fill();ctx.stroke();
    // Machined housing: seams, fine brushing and recessed fasteners.
    ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle='#c3d4d7';
    for(let y=121;y<222;y+=4){ctx.beginPath();ctx.moveTo(49,y);ctx.lineTo(431,y);ctx.stroke();}ctx.restore();
    [[49,123],[431,123],[49,219],[431,219]].forEach(([x,y])=>{
      ctx.fillStyle='#0c151a';ctx.beginPath();ctx.arc(x,y,2.6,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#829298';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-1.4,y+1);ctx.lineTo(x+1.4,y-1);ctx.stroke();
    });
    if(mode==='timing') {
      const cx=133,cy=167,r=39,phase=s.clock*2.2,ready=Math.min(Math.abs(Math.sin(phase)),Math.abs(Math.cos(phase)))<.25;
      ctx.fillStyle='#080f14';ctx.strokeStyle='#576d76';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(cx,cy,r+5,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#5d9278';ctx.lineWidth=4;
      for(const a of [-Math.PI/2,0,Math.PI/2,Math.PI]){ctx.beginPath();ctx.arc(cx,cy,r+2,a-Math.asin(.25),a+Math.asin(.25));ctx.stroke();}
      ctx.save();ctx.translate(cx,cy);ctx.rotate(phase);
      for(let i=0;i<32;i++){ctx.save();ctx.rotate(i*Math.PI/16);ctx.fillStyle=i%4===0?'#a0afb3':'#647982';ctx.fillRect(-1,-r,2,5);ctx.restore();}
      ctx.fillStyle=metal;ctx.strokeStyle='#85969b';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(0,0,r-7,0,Math.PI*2);ctx.fill();ctx.stroke();
      for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.fillStyle='#09151b';ctx.beginPath();ctx.arc(Math.cos(a)*20,Math.sin(a)*20,6,0,Math.PI*2);ctx.fill();}
      ctx.strokeStyle='#e7c588';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-r+8);ctx.lineTo(0,-r+2);ctx.stroke();
      ctx.fillStyle='#b0bdba';ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.fillStyle=ready?'#b8dfab':'#d4b375';ctx.beginPath();ctx.moveTo(cx,cy-r-1);ctx.lineTo(cx-4,cy-r-9);ctx.lineTo(cx+4,cy-r-9);ctx.closePath();ctx.fill();
      text('VOLANTE / PMS',92,218,5.5,'#9aadb3');
      ctx.fillStyle='#08171a';ctx.fillRect(218,127,199,44);
      ctx.strokeStyle='#203b3b';ctx.lineWidth=.5;
      for(let i=0;i<9;i++){ctx.beginPath();ctx.moveTo(220+i*24,129);ctx.lineTo(220+i*24,169);ctx.stroke();}
      ctx.beginPath();ctx.moveTo(220,149);ctx.lineTo(415,149);ctx.stroke();
      ctx.strokeStyle=ready?'#a7dcaa':'#69a491';ctx.lineWidth=1.2;ctx.beginPath();
      for(let i=0;i<=194;i++){const p=phase-(194-i)*.035,y=149-Math.sin(p)*14;i?ctx.lineTo(221+i,y):ctx.moveTo(221+i,y);}ctx.stroke();
      ctx.strokeStyle='#d3c08a';ctx.beginPath();ctx.moveTo(415,129);ctx.lineTo(415,169);ctx.stroke();
      text(ready?'MARCA ALINHADA':'AGUARDE O ALINHAMENTO',222,181,7,ready?'#aed3a4':'#a5b7bd');
      for(let i=0;i<3;i++){ctx.fillStyle=i<s.progress?'#a8d5a3':'#30454b';ctx.beginPath();ctx.arc(229+i*15,196,3,0,Math.PI*2);ctx.fill();}
      button('Sincronizar [E]',280,182,85);
      text(s.progress+'/3 ciclos sincronizados',221,218,6,'#9cb9b4');
    } else {
      const balanced=Math.abs(s.value)<.16;
      // Carburetor cutaway: venturi, butterfly and atomized fuel jet.
      ctx.fillStyle='#0c171c';ctx.strokeStyle='#7a8c91';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(68,134);ctx.lineTo(105,134);ctx.lineTo(122,144);ctx.lineTo(146,144);ctx.lineTo(162,134);ctx.lineTo(194,134);ctx.lineTo(194,166);ctx.lineTo(162,166);ctx.lineTo(146,156);ctx.lineTo(122,156);ctx.lineTo(105,166);ctx.lineTo(68,166);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#8a7147';ctx.fillRect(124,166,25,9);ctx.fillStyle='#b9a06c';ctx.fillRect(133,153,4,20);
      ctx.save();ctx.translate(157,150);ctx.rotate(.55+s.value*.35);ctx.fillStyle='#8d9b9e';ctx.fillRect(-2,-12,4,24);ctx.restore();
      for(let i=0;i<13;i++){
        const x=70+((s.clock*43+i*11)%121),y=140+(i%4)*6;
        ctx.fillStyle='#7aafbd';ctx.fillRect(x,y,4,1);
      }
      const fuelCount=Math.round(7+(s.value+1)*5);
      for(let i=0;i<fuelCount;i++){
        const t=(s.clock*1.6+i/fuelCount)%1;
        ctx.fillStyle='#d8b16c';ctx.fillRect(136+t*51,155-Math.sin(t*Math.PI)*8+(i%3)*2,1.5,1.5);
      }
      text('CARBURADOR / CORTE',76,126,5,'#b5c4c8');
      const gx=222,gy=139,gw=188;
      text('POBRE',gx,130,5.5,'#8eb6c6');text('IDEAL',gx+78,130,5.5,'#a7c9a8');text('RICA',gx+170,130,5.5,'#ceaa7e');
      const strip=ctx.createLinearGradient(gx,0,gx+gw,0);strip.addColorStop(0,'#375e72');strip.addColorStop(.5,'#7fa080');strip.addColorStop(1,'#94683d');
      ctx.fillStyle=strip;ctx.fillRect(gx,gy,gw,10);
      ctx.strokeStyle='#bbd3ad';ctx.lineWidth=.6;ctx.strokeRect(gx+gw*.42,gy-2,gw*.16,14);
      const px=gx+gw*(s.value+1)/2;
      ctx.fillStyle='#ebdbb8';ctx.beginPath();ctx.moveTo(px,gy+8);ctx.lineTo(px-3,gy+17);ctx.lineTo(px+3,gy+17);ctx.closePath();ctx.fill();
      ctx.strokeStyle=balanced?'#a6d0a3':'#bc9268';ctx.lineWidth=1;ctx.beginPath();
      for(let i=0;i<188;i++){const jitter=Math.sin(i*.8+s.clock*16)*(balanced?1:3+Math.abs(s.value)*5),y=168+jitter;i?ctx.lineTo(gx+i,y):ctx.moveTo(gx+i,y);}ctx.stroke();
      button('− [←]',100,182);button('+ [→]',190,182);
      text('ESTABILIDADE',293,187,5.5,'#98b4ad');ctx.fillStyle='#142724';ctx.fillRect(293,192,116,5);
      ctx.fillStyle=balanced?'#9bc79a':'#997b56';ctx.fillRect(293,192,116*Math.min(1,s.stable/3),5);
      text(s.stable.toFixed(1)+' / 3,0 s',323,207,6,'#bcd1bf');
      text('Ajuste o parafuso da mistura e mantenha o motor estável.',76,219,6,'#9fb9b8');
    }
    ctx.restore();
  }
  function drawBikePatchService(s,text) {
    ctx.save();
    const bench=ctx.createLinearGradient(0,116,0,225);
    bench.addColorStop(0,'#263338');bench.addColorStop(1,'#101b21');
    ctx.fillStyle=bench;ctx.fillRect(44,116,392,109);
    ctx.strokeStyle='#384a50';ctx.lineWidth=.5;
    for(let x=48;x<434;x+=12){ctx.beginPath();ctx.moveTo(x,117);ctx.lineTo(x,224);ctx.stroke();}
    ctx.fillStyle='#03090cc0';ctx.beginPath();ctx.ellipse(243,174,59,43,0,0,Math.PI*2);ctx.fill();
    // A tilted rubber torus: thick tread below the face, soft shoulders and a matte bead.
    ctx.save();ctx.translate(240,162);ctx.scale(1,.84);ctx.translate(-240,-162);
    for(let layer=14;layer>=1;layer--){
      ctx.fillStyle=layer>10?'#090a09':layer>5?'#171916':'#252823';
      ctx.strokeStyle='#0e100e';ctx.lineWidth=.5;
      ctx.beginPath();ctx.arc(240+layer*.65,162+layer,54,0,Math.PI*2);
      ctx.arc(240+layer*.65,162+layer,24,0,Math.PI*2,true);ctx.fill('evenodd');ctx.stroke();
    }
    const rubber=ctx.createRadialGradient(237,157,22,240,162,55);
    rubber.addColorStop(0,'#0c0e0c');rubber.addColorStop(.2,'#232621');rubber.addColorStop(.45,'#3c4038');rubber.addColorStop(.7,'#2c3029');rubber.addColorStop(.9,'#1b1f19');rubber.addColorStop(1,'#0b0e0b');
    ctx.fillStyle=rubber;ctx.strokeStyle='#252a23';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(240,162,54,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#58604b35';ctx.lineWidth=2;ctx.beginPath();ctx.arc(240,162,48,Math.PI*1.05,Math.PI*1.8);ctx.stroke();
    ctx.strokeStyle='#141912';ctx.lineWidth=.8;
    for(const radius of [27,29,50]){ctx.beginPath();ctx.arc(240,162,radius,0,Math.PI*2);ctx.stroke();}
    for(let i=0;i<430;i++){
      const a=i*2.399963,r=30+((i*37)%210)/10;
      ctx.fillStyle=i%3?'#080b082b':'#98a38313';ctx.fillRect(240+Math.cos(a)*r,162+Math.sin(a)*r,.65,.65);
    }
    // Directional tread blocks wrap around the tire instead of a flat grey disc.
    for(let i=0;i<36;i++){
      ctx.save();ctx.translate(240,162);ctx.rotate(i*Math.PI/18);
      ctx.strokeStyle='#080c08';ctx.lineWidth=2.8;
      ctx.beginPath();ctx.moveTo(-2,-53);ctx.lineTo(-6,-46);ctx.lineTo(-3,-38);ctx.stroke();
      ctx.strokeStyle='#4d554033';ctx.lineWidth=.6;
      ctx.beginPath();ctx.moveTo(0,-52);ctx.lineTo(-4,-46);ctx.lineTo(-1,-38);ctx.stroke();ctx.restore();
    }
    // The dark opening and raised bead make the rubber thickness visible.
    ctx.fillStyle='#080c09';ctx.strokeStyle='#30372b';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(240,162,24,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#141a13';ctx.lineWidth=4;ctx.beginPath();ctx.arc(240,162,21,0,Math.PI*2);ctx.stroke();
    ctx.restore();
    text('MOTO / REPARO',222,158,4.5,'#809399');
    text(s.progress+' / '+s.holes.length+' VEDADOS',219,167,5,'#b6c9bf');
    s.holes.forEach(([x,y],i)=>{
      const stage=s.remaining[i],drying=s.cure[i]>0,done=s.done[i];
      if(stage<3&&!done){
        ctx.fillStyle=stage===2?'#a1a19a66':drying?'#d6b25c99':'#b2a16a55';
        ctx.beginPath();ctx.ellipse(x,y,10,8,-.4,0,Math.PI*2);ctx.fill();
        if(stage===2){ctx.strokeStyle='#c3c2af99';ctx.lineWidth=.5;for(let j=-5;j<=5;j+=2){ctx.beginPath();ctx.moveTo(x-6,y+j);ctx.lineTo(x+6,y+j-2);ctx.stroke();}}
        if(stage===1&&drying){ctx.strokeStyle='#ead4a5';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-5,y-3);ctx.quadraticCurveTo(x,y-6,x+4,y-3);ctx.stroke();}
      }
      if(done){
        ctx.save();ctx.translate(x,y);ctx.rotate(-.4);ctx.fillStyle='#a56b3b';ctx.strokeStyle='#e0aa68';ctx.lineWidth=.7;
        ctx.beginPath();ctx.roundRect(-10,-7,20,14,4);ctx.fill();ctx.stroke();
        ctx.fillStyle='#1c2429';ctx.beginPath();ctx.roundRect(-7,-5,14,10,3);ctx.fill();
        ctx.strokeStyle='#66756f';ctx.lineWidth=.5;for(let j=-4;j<=4;j+=2){ctx.beginPath();ctx.moveTo(j,-3);ctx.lineTo(j,3);ctx.stroke();}ctx.restore();
      } else {
        ctx.fillStyle='#030508';ctx.strokeStyle='#a0a7a3';ctx.lineWidth=1;
        ctx.beginPath();ctx.ellipse(x,y,4.8,3.7,-.4,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.strokeStyle='#070b10';ctx.lineWidth=1.4;
        for(let j=0;j<5;j++){const a=j*Math.PI*2/5+.3;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*3,y+Math.sin(a)*3);ctx.lineTo(x+Math.cos(a)*8,y+Math.sin(a)*7);ctx.stroke();}
        ctx.strokeStyle='#f3b878';ctx.lineWidth=1.1;ctx.setLineDash([2,2]);
        ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle='#f2ca91';ctx.fillRect(x+7,y-13,8,8);text(String(i+1),x+9,y-7,6,'#151c21');
        if(stage===3){const rise=(s.clock*10+i*5)%14;ctx.strokeStyle='#aac9d288';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(x+2,y-rise,1+rise/12,0,Math.PI*2);ctx.stroke();}
      }
      const color=done?'#9acba5':drying?'#d5ae6a':stage===1?'#c3d8aa':'#bec8ca';
      ctx.strokeStyle=color;ctx.lineWidth=1;
      if(drying||s.drag?.index===i){
        const fraction=drying?1-s.cure[i]/1.2:s.drag.kind==='press'?s.drag.held/.8:s.sandWork[i]/32;
        ctx.beginPath();ctx.arc(x,y,12,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,fraction));ctx.stroke();
      }
      const right=x>240,cardX=right?320:56;
      const sideHoles=s.holes.map((p,index)=>({p,index})).filter(item=>(item.p[0]>240)===right).sort((a,b)=>a.p[1]-b.p[1]);
      const slot=sideHoles.findIndex(item=>item.index===i),cardY=120+slot*32;
      ctx.strokeStyle='#71888c77';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x+(right?13:-13),y);ctx.lineTo(right?315:164,y);ctx.lineTo(right?315:164,cardY+9);ctx.lineTo(right?320:158,cardY+9);ctx.stroke();
      ctx.fillStyle='#0b151bdc';ctx.fillRect(cardX,cardY,103,31);
      ctx.fillStyle=color;ctx.fillRect(cardX,cardY,2,31);
      text('FURO 0'+(i+1),cardX+8,cardY+9,5.5,'#c2d0d1');
      const label=done?'VEDADO':drying?'COLA SECANDO · '+s.cure[i].toFixed(1)+'s':stage===3?'LIXAR A BORRACHA':stage===2?'APLICAR COLA':'PRONTO / PRESSIONAR';
      text(label,cardX+8,cardY+20,5.3,color);
      if(drying){ctx.fillStyle='#314047';ctx.fillRect(cardX+8,cardY+25,87,2);ctx.fillStyle=color;ctx.fillRect(cardX+8,cardY+25,87*(1-s.cure[i]/1.2),2);}
    });
    text('Prepare os outros furos enquanto a cola seca. Segure o remendo por 0,8 s.',61,221,6,'#adc1c2');
    ctx.restore();
  }
  function drawBikeTireWorkshop(s,mode,text) {
    ctx.save();
    const backdrop=ctx.createLinearGradient(0,117,0,225);
    backdrop.addColorStop(0,'#27363b');backdrop.addColorStop(1,'#0e1a20');
    ctx.fillStyle=backdrop;ctx.fillRect(45,116,390,110);
    if(mode==='bolts') {
      ctx.fillStyle='#050c10';ctx.beginPath();ctx.ellipse(242,165,57,44,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#1b211e';ctx.strokeStyle='#303a32';ctx.lineWidth=5;
      ctx.beginPath();ctx.ellipse(240,157,50,43,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      const wheel=ctx.createLinearGradient(205,121,267,196);
      wheel.addColorStop(0,'#a3b0b0');wheel.addColorStop(.4,'#596a70');wheel.addColorStop(1,'#29383f');
      ctx.fillStyle=wheel;ctx.strokeStyle='#18262d';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(240,157,39,0,Math.PI*2);ctx.fill();ctx.stroke();
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4+.18;ctx.save();ctx.translate(240,157);ctx.rotate(a);
        ctx.fillStyle='#162128';ctx.beginPath();ctx.roundRect(15,-4,13,8,3);ctx.fill();ctx.restore();
      }
      ctx.fillStyle='#28383d';ctx.strokeStyle='#8e9c9e';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(240,157,15,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#0e181e';ctx.beginPath();ctx.arc(240,157,7,0,Math.PI*2);ctx.fill();
      const points=[[240,123],[240,191],[206,157],[274,157]];
      ctx.setLineDash([2,3]);ctx.strokeStyle='#acbf8e66';ctx.lineWidth=.6;ctx.beginPath();
      points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([]);
      points.forEach(([x,y],i)=>{
        const done=i<s.progress,active=i===s.progress;
        ctx.fillStyle='#080f14';ctx.beginPath();ctx.arc(x+1,y+2,10,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#546369';ctx.strokeStyle=done?'#a9caa3':active?'#dfba7a':'#71848b';ctx.lineWidth=1;
        ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle=done?'#819583':'#bbc5c3';ctx.beginPath();
        for(let j=0;j<6;j++){const a=j*Math.PI/3+.2,px=x+Math.cos(a)*6.5,py=y+Math.sin(a)*6.5;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();
        ctx.fillStyle='#26383e';ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill();
        if(active){
          ctx.strokeStyle='#e5c48a';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,y,12,-Math.PI/2,-Math.PI/2+Math.PI*2*(s.drag?.kind==='bolt'?Math.min(1,s.drag.work/1.1):1));ctx.stroke();
          ctx.save();ctx.translate(x,y);ctx.rotate(s.boltAngles?.[i]??.2);
          ctx.fillStyle='#9eafb2';ctx.strokeStyle='#253a42';ctx.lineWidth=.7;
          ctx.beginPath();ctx.roundRect(7,-3,30,6,2);ctx.fill();ctx.stroke();
          ctx.fillStyle='#b18855';ctx.beginPath();ctx.roundRect(28,-4,14,8,2);ctx.fill();ctx.restore();
        }
      });
      text('APERTO EM CRUZ',65,131,7,'#d8c69d');
      text('1  →  2  →  3  →  4',65,145,6,'#a9babc');
      text('Fixação '+(s.progress+1)+'/4',65,166,8,'#d8e0d4');
      text('Gire a chave ↻',65,179,6,'#8fa9aa');
      text('FIXAÇÕES',333,130,6,'#97adb0');
      for(let i=0;i<4;i++){
        ctx.fillStyle=i<s.progress?'#9bc598':i===s.progress?'#dfbb78':'#3d5159';ctx.fillRect(333,139+i*15,5,5);
        text('0'+(i+1)+'  '+(i<s.progress?'APERTADA':i===s.progress?'EM AJUSTE':'AGUARDANDO'),344,144+i*15,5.5,i<s.progress?'#aac4ac':'#98aeb3');
      }
      text('Segure o cabo da chave e gire em arco · ou use as teclas 1–4.',66,221,6,'#a8bcba');
    } else {
      text('BANDA DE RODAGEM / ESCOVA',60,124,5.5,'#b8c8c6');
      const rubber=ctx.createLinearGradient(0,128,0,197);
      rubber.addColorStop(0,'#10150f');rubber.addColorStop(.3,'#353a2d');rubber.addColorStop(.65,'#282e22');rubber.addColorStop(1,'#0c120d');
      ctx.fillStyle='#030907';ctx.beginPath();ctx.roundRect(53,132,371,68,7);ctx.fill();
      ctx.fillStyle=rubber;ctx.beginPath();ctx.roundRect(55,128,368,69,6);ctx.fill();
      for(let i=0;i<4;i++){
        const x=55+i*92,level=s.remaining[i],active=s.drag?.kind==='brush'&&s.drag.index===i;
        ctx.save();ctx.beginPath();ctx.rect(x+2,130,88,65);ctx.clip();
        for(let j=0;j<4;j++){
          const px=x+12+j*21;
          ctx.strokeStyle='#080e09';ctx.lineWidth=5;
          ctx.beginPath();ctx.moveTo(px-7,128);ctx.lineTo(px+5,147);ctx.lineTo(px-4,165);ctx.lineTo(px+8,182);ctx.lineTo(px+1,198);ctx.stroke();
          ctx.strokeStyle='#5b634033';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(px-4,128);ctx.lineTo(px+8,147);ctx.lineTo(px-1,165);ctx.lineTo(px+11,182);ctx.stroke();
        }
        for(let j=0;j<64;j++){
          const px=x+4+(j*31)%83,py=132+(j*17)%60;
          ctx.fillStyle=j%3?'#090d081f':'#a9b08413';ctx.fillRect(px,py,1,1);
        }
        for(let j=0;j<level*10;j++){
          const px=x+7+(j*29)%76,py=136+(j*19)%52,size=2+(j%3);
          ctx.fillStyle=['#58452d','#77603e','#423421'][j%3];ctx.beginPath();ctx.ellipse(px,py,size*1.5,size,.4,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#a285512f';ctx.fillRect(px-1,py-1,2,1);
        }
        ctx.restore();

        if(active||s.lastClean===i&&s.pulse>0){
          const bx=active?s.drag.x:x+45,by=active?s.drag.y:155;
          const t=1-s.pulse/.3;
          for(let j=0;j<8;j++){ctx.fillStyle=j%2?'#95784c':'#645031';ctx.fillRect(bx+(j-4)*3*t,by-7-(j%3)*8*t,1.8,1.8);}
          ctx.save();ctx.translate(bx,by);ctx.rotate(-.25);
          ctx.fillStyle='#ae8654';ctx.beginPath();ctx.roundRect(-15,-12,30,9,3);ctx.fill();
          ctx.fillStyle='#785c39';ctx.fillRect(-11,-11,22,2);
          ctx.strokeStyle='#c8b889';ctx.lineWidth=1.2;for(let j=0;j<11;j++){ctx.beginPath();ctx.moveTo(-13+j*2.5,-3);ctx.lineTo(-14+j*2.5,4+(j%2));ctx.stroke();}ctx.restore();
        }
      }
      const partial=(s.brushWork||[]).reduce((sum,value,i)=>sum+(s.remaining[i]>0?value/32:0),0);
      const fraction=Math.min(1,(12-s.remaining.reduce((a,b)=>a+b,0)+partial)/12);
      ctx.fillStyle='#172821';ctx.fillRect(60,203,292,5);
      ctx.fillStyle='#9cbe8c';ctx.fillRect(60,203,292*fraction,5);
      text('LIMPEZA '+Math.floor(fraction*100)+'%',361,208,6,'#b8cfb4');
      text('Mantenha o botão pressionado e escove toda a banda de rodagem.',65,222,6,'#a6bbb4');
    }
    ctx.restore();
  }
  function drawBikeBearingService(s,text,button) {
    ctx.save();
    ctx.fillStyle='#0e1d25';ctx.beginPath();ctx.roundRect(50,117,380,108,6);ctx.fill();
    text('TRES BATIDAS E PRONTO',66,134,8,'#dec795');
    text('Sem alinhar ou alternar os lados.',66,146,6,'#a5bfc2');
    const age=s.hits>0?s.clock-s.lastStrike:1,impact=Math.max(0,1-age/.3);
    const settle=s.hits>0?(s.hits-1+1-Math.pow(1-Math.min(1,age/.2),3))/3:0;
    const cy=165+settle*7,jolt=Math.sin(age*65)*impact*1.4;
    ctx.save();ctx.translate(jolt,0);
    const wood=ctx.createLinearGradient(0,182,0,191);wood.addColorStop(0,'#a27b50');wood.addColorStop(1,'#4c3629');
    ctx.fillStyle=wood;ctx.beginPath();ctx.roundRect(184,182,112,10,2);ctx.fill();
    ctx.strokeStyle='#cda47955';ctx.lineWidth=.6;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(190,184+i*2);ctx.bezierCurveTo(218,181+i*2,263,189+i*2,289,184+i*2);ctx.stroke();}
    ctx.fillStyle='#354c53';ctx.beginPath();ctx.ellipse(240,cy+5,29,14,0,0,Math.PI*2);ctx.fill();
    const steel=ctx.createLinearGradient(215,cy-10,265,cy+10);steel.addColorStop(0,'#687f89');steel.addColorStop(.35,'#edf2df');steel.addColorStop(.65,'#81969b');steel.addColorStop(1,'#c1cdc4');
    ctx.strokeStyle=steel;ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(240,cy,23,11,0,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#7eaa9b';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(240,cy,17,7,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5;ctx.fillStyle='#d5e0d8';ctx.beginPath();ctx.ellipse(240+Math.cos(a)*20,cy+Math.sin(a)*9,1.4,1,0,0,Math.PI*2);ctx.fill();
    }
    const idle=s.phase==='play'?Math.sin(s.clock*3)*1.5:0,lift=impact*18;
    ctx.save();ctx.translate(259+lift*.3,cy-12-lift+idle);ctx.rotate(-.45-impact*.7);
    const handle=ctx.createLinearGradient(0,-3,0,4);handle.addColorStop(0,'#e4bd82');handle.addColorStop(1,'#805330');
    ctx.fillStyle=handle;ctx.beginPath();ctx.roundRect(0,-2,36,5,2);ctx.fill();
    ctx.fillStyle='#20282b';ctx.strokeStyle='#93a4a4';ctx.lineWidth=.8;ctx.beginPath();ctx.roundRect(-6,-10,14,20,3);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#52656b';ctx.beginPath();ctx.moveTo(-3,-7);ctx.lineTo(5,-7);ctx.moveTo(-3,6);ctx.lineTo(5,6);ctx.stroke();ctx.restore();
    if(impact>0){
      ctx.globalAlpha=impact;ctx.strokeStyle='#e8d8a8';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(240,cy,25+(1-impact)*19,12+(1-impact)*8,0,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<7;i++){
        const angle=-Math.PI+i*Math.PI/6,travel=(1-impact)*23;
        ctx.fillStyle=i%2?'#b49a71':'#e0c795';ctx.fillRect(252+Math.cos(angle)*travel,cy-5+Math.sin(angle)*travel+(1-impact)**2*10,1.5,1.5);
      }
      ctx.globalAlpha=1;
    }
    ctx.restore();
    for(let i=0;i<3;i++){
      ctx.fillStyle=i<s.hits?'#abd59d':'#344953';ctx.beginPath();ctx.arc(335+i*17,169,5+(i===s.hits-1?impact*2:0),0,Math.PI*2);ctx.fill();
    }
    text(s.hits+' / 3 BATIDAS',322,188,7,'#d6c391');
    button('BATER [1]',180,197,120);
    text('Clique no rolamento ou em BATER. Teclado: 1.',66,220,6,'#b3c8c4');
    ctx.restore();
  }
  function drawBikeHandlebarService(s,mode,text,button) {
    if(mode==='bearings'){drawBikeBearingService(s,text,button);return;}
    ctx.save();
    const metal=ctx.createLinearGradient(0,118,0,221);
    metal.addColorStop(0,'#536970');metal.addColorStop(.35,'#b1bfbd');metal.addColorStop(1,'#30464f');
    const bg=ctx.createLinearGradient(0,117,0,225);bg.addColorStop(0,'#24353d');bg.addColorStop(1,'#0c191f');
    ctx.fillStyle=bg;ctx.strokeStyle='#3b535c';ctx.lineWidth=.7;
    ctx.beginPath();ctx.roundRect(47,116,386,110,5);ctx.fill();ctx.stroke();
    if(mode==='align') {
      text('MESA / VISTA SUPERIOR',59,127,5.5,'#adc2c6');
      ctx.strokeStyle='#799c8d';ctx.lineWidth=.7;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(240,120);ctx.lineTo(240,177);ctx.stroke();ctx.setLineDash([]);
      ctx.save();ctx.translate(240,151);ctx.rotate(s.value*Math.PI/180);
      ctx.fillStyle='#111913';ctx.strokeStyle='#424c40';ctx.lineWidth=2;
      ctx.beginPath();ctx.roundRect(-9,-29,18,57,6);ctx.fill();ctx.stroke();
      for(let i=0;i<7;i++){ctx.strokeStyle='#080f0a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-6,-24+i*7);ctx.lineTo(0,-20+i*7);ctx.lineTo(6,-24+i*7);ctx.stroke();}
      ctx.strokeStyle='#718891';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-17,-18);ctx.lineTo(-17,24);ctx.moveTo(17,-18);ctx.lineTo(17,24);ctx.stroke();
      ctx.strokeStyle='#aab9ba';ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(-74,-13);ctx.lineTo(-47,-21);ctx.lineTo(-23,-9);ctx.lineTo(23,-9);ctx.lineTo(47,-21);ctx.lineTo(74,-13);ctx.stroke();
      for(const sign of [-1,1]){
        ctx.save();ctx.translate(sign*65,-15);ctx.rotate(sign*.27);ctx.fillStyle='#1a211e';ctx.beginPath();ctx.roundRect(-14,-5,28,10,3);ctx.fill();ctx.strokeStyle='#4b5549';ctx.lineWidth=.7;for(let i=-10;i<12;i+=3){ctx.beginPath();ctx.moveTo(i,-4);ctx.lineTo(i,4);ctx.stroke();}ctx.restore();
      }
      ctx.fillStyle=metal;ctx.fillRect(-23,-13,46,9);ctx.restore();
      ctx.fillStyle='#0b181d';ctx.fillRect(337,126,84,48);
      text('DESVIO',346,138,6,'#93acb0');text(s.value.toFixed(1)+'°',346,153,11,Math.abs(s.value)<=1?'#b6d4a4':'#dbbc84');text('ALVO −1° A +1°',346,167,5,'#99b8a0');
      button('− [←]',100,182);button('+ [→]',190,182);button('Confirmar [E]',280,182,85);
      text('Arraste o guidão e alinhe a roda à linha central.',83,220,6,'#a8bfc0');
    } else if(mode==='torque') {
      text('MESA / APERTO CONTROLADO',59,128,5.5,'#aec0c1');
      ctx.fillStyle='#111e24';ctx.beginPath();ctx.roundRect(184,127,112,49,6);ctx.fill();
      ctx.fillStyle=metal;ctx.beginPath();ctx.roundRect(196,136,88,28,4);ctx.fill();
      ctx.strokeStyle='#1c3039';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(170,150);ctx.lineTo(310,150);ctx.stroke();
      for(const x of [206,274])for(const y of [141,159]){ctx.fillStyle='#172a32';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();}
      ctx.save();ctx.translate(240,153);ctx.rotate(s.toolAngle??.3);
      ctx.strokeStyle='#2a3d45';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(51,0);ctx.stroke();ctx.strokeStyle='#a8b8b6';ctx.lineWidth=5;ctx.stroke();
      ctx.fillStyle='#9a7951';ctx.beginPath();ctx.roundRect(32,-5,27,10,3);ctx.fill();ctx.fillStyle='#d6caaa';ctx.fillRect(37,-2,12,4);
      ctx.fillStyle='#b5c0ba';ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#344a52';ctx.fillRect(-3,-3,6,6);ctx.restore();
      ctx.fillStyle='#09171d';ctx.fillRect(335,125,86,51);text('TORQUÍMETRO',341,136,5,'#9bb4b7');text(s.value.toFixed(1)+' Nm',342,153,10,'#d7e2d1');text('IDEAL 18–22 Nm',342,166,5.5,'#a5c39c');
      const ratio=Math.min(1,s.value/50);ctx.fillStyle='#1b2c30';ctx.fillRect(64,163,102,5);ctx.fillStyle=s.value>22?'#c58e67':'#a4bd91';ctx.fillRect(64,163,102*ratio,5);ctx.strokeStyle='#c2d2ae';ctx.lineWidth=.7;ctx.strokeRect(64+102*.36,161,102*.08,9);
      text('Gire a chave ↻',64,151,7,'#d0c5a5');
      button('− [←]',100,182);button('+ [→]',190,182);button('Confirmar [E]',280,182,85);
      text('Segure o cabo do torquímetro, gire e confirme na faixa ideal.',77,220,6,'#a8bfc0');
    } else if(mode==='wires') {
      const symbols=['●','▲','■','◆'],colors=['#c18b70','#81a7ba','#c5b677','#94af82'];
      ctx.fillStyle='#0c1a21';ctx.fillRect(192,126,66,77);ctx.strokeStyle='#405964';ctx.lineWidth=.6;ctx.strokeRect(192,126,66,77);
      text('CHICOTE',208,141,5,'#91aeb4');text('ELÉTRICO',205,151,5,'#91aeb4');
      for(let i=0;i<4;i++){
        const y=127+i*24,row=s.links.indexOf(i),destY=127+row*24,done=s.done[i];
        ctx.strokeStyle=colors[i];ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(72,y);ctx.bezierCurveTo(100,y+7,129,y-8,152,y);ctx.stroke();
        if(done){ctx.beginPath();ctx.moveTo(170,y);ctx.bezierCurveTo(220,y,230,destY,285,destY);ctx.stroke();}
        else if(s.drag?.kind==='wire'&&s.drag.index===i){ctx.beginPath();ctx.moveTo(170,y);ctx.bezierCurveTo(220,y,s.drag.x-25,s.drag.y,s.drag.x,s.drag.y);ctx.stroke();}
        ctx.fillStyle=done?'#657e68':s.selected===i?'#a68d5d':'#647984';ctx.beginPath();ctx.roundRect(150,y-7,23,14,2);ctx.fill();ctx.fillStyle='#d3bc83';ctx.fillRect(173,y-4,6,8);
        text(symbols[i]+' '+(i+1),91,y-3,6,colors[i]);
      }
      for(let row=0;row<4;row++){
        const i=s.links[row],y=127+row*24,done=s.done[i];ctx.fillStyle='#354d58';ctx.beginPath();ctx.roundRect(276,y-9,103,18,3);ctx.fill();
        ctx.fillStyle='#07131a';ctx.fillRect(281,y-5,12,10);ctx.strokeStyle=colors[i];ctx.lineWidth=1;ctx.strokeRect(281,y-5,12,10);
        text(symbols[i]+'  '+(row+5)+(done?'  ✓ CONECTADO':'  ENCAIXAR'),300,y+2,6,done?'#abc99d':colors[i]);
      }
      text('Arraste o terminal ao símbolo igual · teclas 1–4 e 5–8',70,220,6,'#a8bfc0');
    } else {
      text('CAIXA DE DIREÇÃO / ASSENTAMENTO',60,125,5.5,'#a9bfc2');
      for(let i=0;i<4;i++){
        const x=55+i*92,r=9+s.order[i]*4,done=s.order[i]<s.progress,next=s.order[i]===s.progress;
        ctx.fillStyle='#0c1b23';ctx.beginPath();ctx.roundRect(x,128,82,69,4);ctx.fill();
        ctx.fillStyle='#020b10';ctx.beginPath();ctx.ellipse(x+43,163,r+6,r*.55+4,0,0,Math.PI*2);ctx.fill();
        ctx.save();ctx.translate(x+41,154);ctx.scale(1,.75);
        ctx.strokeStyle=done?'#839d83':next?'#d1b580':'#798e96';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle='#293d48';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r-5,0,Math.PI*2);ctx.stroke();
        for(let j=0;j<10;j++){const a=j*Math.PI/5;ctx.fillStyle=j%2?'#aabbb8':'#71868c';ctx.beginPath();ctx.arc(Math.cos(a)*(r-2),Math.sin(a)*(r-2),1.8,0,Math.PI*2);ctx.fill();}ctx.restore();
        text(done?'✓ ASSENTADO':next?'PRÓXIMO':'AGUARDANDO',x+10,185,5.5,done?'#adc89f':next?'#ddc99e':'#8da8b1');
        text('['+(i+1)+'] Ø '+(s.order[i]+1)*10,x+14,140,6,'#bdcfcf');
      }
      text('Encaixados '+s.progress+'/4 · selecione do menor para o maior.',78,218,6,'#a8bfc0');
    }
    ctx.restore();
  }
  function drawBikeServiceContent() {
    const text=(str,x,y,size=8,color='#ddd')=>{ctx.fillStyle=color;ctx.font=size+'px sans-serif';ctx.textAlign='left';ctx.fillText(str,x,y);};
    const button=(label,x,y,w=78)=>{
      const primary=label.startsWith('Confirmar')||label.startsWith('Sincronizar');
      const face=ctx.createLinearGradient(0,y,0,y+23);
      face.addColorStop(0,primary?'#665078':'#3b3048');face.addColorStop(1,primary?'#392747':'#211a2b');
      ctx.fillStyle='#030a0d88';ctx.beginPath();ctx.roundRect(x,y+2,w,23,3);ctx.fill();
      ctx.fillStyle=face;ctx.strokeStyle=primary?'#c49cdd':'#79608c';ctx.lineWidth=.7;
      ctx.beginPath();ctx.roundRect(x,y,w,23,3);ctx.fill();ctx.stroke();
      ctx.strokeStyle=primary?'#c9dac333':'#b6d3dd22';ctx.beginPath();ctx.moveTo(x+4,y+2);ctx.lineTo(x+w-4,y+2);ctx.stroke();
      text(label,x+7,y+15,8,primary?'#dce8ce':'#c8dbdf');
    };
    ctx.fillStyle='#100d16';ctx.fillRect(15,51,450,205);
    const s=bikeService;
    if(s) {
      const mode=s.job[2];
      ctx.fillStyle='#89b8a5';ctx.fillRect(24,57,2,13);
      text(bikePartNames[s.part]+' / '+s.job[1],32,68,11,'#d4e2d5');
      ctx.strokeStyle='#344a4f';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(28,74);ctx.lineTo(451,74);ctx.stroke();
      text(s.job[3],28,84,7);text(s.practice?'TREINO · sem consumo de kit':'REPARO · 1 kit somente ao concluir',28,98,7,'#a9c6ad');
      if(s.phase==='done'||s.phase==='failed') {text(s.phase==='done'?'SERVIÇO FINALIZADO':'REPARO INTERROMPIDO',80,146,14,'#e1b5ef');text(s.message,45,169,8);button(s.phase==='failed'?'Tentar de novo':'Voltar',30,229,130);return;}
      text('Erros: '+s.mistakes+'/3',355,98,7);
      for(let i=0;i<3;i++){ctx.fillStyle=i<s.mistakes?'#c78164':'#3a5156';ctx.beginPath();ctx.arc(421+i*9,95,2,0,Math.PI*2);ctx.fill();}
      if(s.part==='handlebar') {
        drawBikeHandlebarService(s,mode,text,button);

      } else if(['pressure','torque','align','sequence'].includes(mode)) {
        drawBikeServiceInstrument(s,mode,text,button);
      } else if(mode==='engineHole') {
        drawBikeEngineHoleService(s,text);
      } else if(['timing','balance'].includes(mode)) {
        drawBikeEngineService(s,mode,text,button);
      } else if(mode==='patch') {
        drawBikePatchService(s,text);
      } else if(mode==='bolts'||mode==='clean') {
        drawBikeTireWorkshop(s,mode,text);
      } else {
        for(let i=0;i<4;i++) {
          const x=55+i*92;
          ctx.fillStyle='#211b26';ctx.fillRect(x,128,82,69);ctx.strokeStyle='#9b6cac';ctx.strokeRect(x,128,82,69);
          let label='';
          if(mode==='sequence')label=s.phase==='memorize'?String(s.sequence[i]+1):String(i+1);
          if(mode==='clean')label=s.remaining[i]?'SUJEIRA '+s.remaining[i]+'/3':'✓ LIMPO';
          if(mode==='clean') {
            for(let j=0;j<s.remaining[i]*4;j++){ctx.fillStyle='#796044';ctx.fillRect(x+6+(j*17)%67,135+(j*11)%46,3,2);}
            if(s.pulse>0){const bx=x+15+Math.sin(s.clock*25)*8;ctx.fillStyle='#b7a48b';ctx.fillRect(bx,137,26,5);ctx.fillStyle='#ded2b5';for(let j=0;j<7;j++)ctx.fillRect(bx+j*4,142,1,9);}
          }
          if(mode==='bearings') {
            ctx.strokeStyle='#dbb4ef';ctx.beginPath();ctx.arc(x+41,153,7+s.order[i]*4,0,Math.PI*2);ctx.stroke();
            label=s.order[i]<s.progress?'✓':'Ø '+(s.order[i]+1)*10;
          }
          text(label,x+9,mode==='bearings'?188:166,9);
        }
        text(mode==='sequence'?(s.phase==='memorize'?'MEMORIZE · os números somem em 4 segundos':'Repita: '+s.progress+'/4 · teclas 1 a 4'):mode==='bolts'?'Ordem de aperto em cruz: 1 → 2 → 3 → 4':'Clique nas peças · teclas 1 a 4',65,216,8);
      }
      text(s.message,30,110,7,'#f2bf8d');button('Cancelar / Esc',30,229,130);
      return;
    }
    const part=selectedBikePart(),jobs=jobsForBikePart(part),condition=bikeParts[part];
    if(bikeInspectTab==='Pneus') {
      button((part==='frontTire'?'● ':'')+'Dianteiro',28,55,208);button((part==='rearTire'?'● ':'')+'Traseiro',244,55,208);
      text('CONDIÇÃO '+Math.round(condition)+'%',30,96,7,bikePartColor(condition));
      text('Escolha um serviço abaixo',282,96,6,'#ad94bd');
    } else {
      const summary=ctx.createLinearGradient(25,56,455,102);summary.addColorStop(0,'#35213f');summary.addColorStop(1,'#18121f');
      ctx.fillStyle=summary;ctx.strokeStyle='#493355';ctx.lineWidth=.5;ctx.beginPath();ctx.roundRect(25,56,430,46,5);ctx.fill();ctx.stroke();
      ctx.fillStyle='#3d2b49';ctx.beginPath();ctx.roundRect(33,64,30,30,5);ctx.fill();
      drawBikeMenuIcon(part,48,79,'#dfb4f3',.95);
      text('DIAGNÓSTICO / '+jobs.length+' SERVIÇOS',73,69,5,'#b69bc5');
      text(bikePartNames[part],73,84,12,'#f2e5fa');
      text('Repare avarias ou pratique nos componentes íntegros.',73,95,5,'#ae96ba');
      text('CONDIÇÃO',363,69,5,'#b69bc5');
      text(Math.round(condition)+'%',385,84,12,bikePartColor(condition));
      for(let j=0;j<12;j++){ctx.fillStyle=condition>j*100/12?bikePartColor(condition):'#392c43';ctx.fillRect(364+j*6,91,4,2);}
    }
    jobs.forEach((job,i)=>{
      const value=bikeFaults[part][i],y=110+i*30,color=bikePartColor(value);
      const hover=bikeInspectHover&&bikeInspectHover.x>=25&&bikeInspectHover.x<=455&&bikeInspectHover.y>=y&&bikeInspectHover.y<y+27;
      const row=ctx.createLinearGradient(25,y,455,y+27);row.addColorStop(0,hover?'#35243f':'#25202d');row.addColorStop(1,hover?'#261b33':'#17131f');
      ctx.fillStyle=row;ctx.strokeStyle=hover?'#aa77cf':'#44324f';ctx.lineWidth=.5;ctx.beginPath();ctx.roundRect(25,y,430,27,4);ctx.fill();ctx.stroke();
      ctx.fillStyle=hover?'#523162':'#30233d';ctx.beginPath();ctx.roundRect(31,y+5,18,17,3);ctx.fill();
      text(String(i+1).padStart(2,'0'),35,y+16,6,'#b899cf');
      text(job[0],57,y+10,7,'#e9dcef');
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(59,y+19,1.3,0,Math.PI*2);ctx.fill();
      text(value>=99.5?'Íntegro / treino':value>=72?'Desgaste leve':value>=38?'Problema moderado':'Problema crítico',64,y+21,5.5,color);
      text(Math.round(value)+'%',237,y+12,7,color);
      for(let j=0;j<9;j++){ctx.fillStyle=value>j*100/9?color:'#3d2c46';ctx.fillRect(225+j*5,y+18,3.5,2);}
      const action=ctx.createLinearGradient(282,y+4,447,y+23);action.addColorStop(0,hover?'#67417d':'#443052');action.addColorStop(1,hover?'#472957':'#2b1d39');
      ctx.fillStyle=action;ctx.strokeStyle=hover?'#cf9bef':'#6c4a7f';ctx.beginPath();ctx.roundRect(282,y+4,165,19,3);ctx.fill();ctx.stroke();
      text(job[1],291,y+16,7,'#ead1fa');
      ctx.strokeStyle='#c398db';ctx.beginPath();ctx.moveTo(434,y+10);ctx.lineTo(438,y+13.5);ctx.lineTo(434,y+17);ctx.stroke();
    });
    ctx.strokeStyle='#3c2b47';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(28,235);ctx.lineTo(451,235);ctx.stroke();
    drawBikeMenuIcon('kit',35,245,'#c8ab7d',.5);
    text('1 KIT POR REPARO',45,248,5.5,'#d8bc90');
    text('O kit só é consumido ao concluir. Treino não gasta kits.',175,248,5.5,'#a991b9');
  }
  function drawBikeMenuIcon(kind,x,y,color='#c9a3e5',scale=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.2;ctx.lineCap='round';ctx.lineJoin='round';
    if(kind==='motor') {
      ctx.beginPath();ctx.moveTo(-6,-3);ctx.lineTo(-2,-3);ctx.lineTo(0,-6);ctx.lineTo(5,-6);ctx.lineTo(5,-2);ctx.lineTo(8,-2);ctx.lineTo(8,5);ctx.lineTo(5,5);ctx.lineTo(3,7);ctx.lineTo(-5,7);ctx.lineTo(-5,3);ctx.lineTo(-8,3);ctx.lineTo(-8,-1);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-3,-6);ctx.lineTo(-6,-6);ctx.moveTo(0,-1);ctx.lineTo(-2,2);ctx.lineTo(2,2);ctx.lineTo(0,5);ctx.stroke();
    } else if(kind==='handlebar') {
      ctx.beginPath();ctx.moveTo(-9,-4);ctx.lineTo(-5,-6);ctx.lineTo(-2,-1);ctx.lineTo(2,-1);ctx.lineTo(5,-6);ctx.lineTo(9,-4);ctx.moveTo(-2,0);ctx.lineTo(-2,6);ctx.lineTo(2,6);ctx.lineTo(2,0);ctx.stroke();
      ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-10,-3);ctx.lineTo(-7,-5);ctx.moveTo(7,-5);ctx.lineTo(10,-3);ctx.stroke();
    } else if(kind==='frontTire'||kind==='rearTire'||kind==='tire') {
      ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,5.5,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*5,Math.sin(a)*5);ctx.stroke();}
      ctx.beginPath();ctx.arc(0,0,1.5,0,Math.PI*2);ctx.fill();
    } else if(kind==='kit') {
      ctx.beginPath();ctx.roundRect(-8,-4,16,11,2);ctx.stroke();ctx.beginPath();ctx.moveTo(-3,-4);ctx.lineTo(-3,-7);ctx.lineTo(3,-7);ctx.lineTo(3,-4);ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.moveTo(0,-1);ctx.lineTo(0,2);ctx.stroke();
    } else {
      ctx.beginPath();ctx.arc(0,0,8,-Math.PI,0);ctx.lineTo(8,6);ctx.lineTo(-8,6);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,3);ctx.lineTo(4,-2);ctx.moveTo(-4,-2);ctx.lineTo(-3,-1);ctx.moveTo(0,-4);ctx.lineTo(0,-3);ctx.stroke();
    }
    ctx.restore();
  }
  function drawBikeInspectMenu() {
    ctx.save();
    const view=bikeWorkshopViewport();ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
    const shell=ctx.createLinearGradient(0,12,0,258);
    shell.addColorStop(0,'#38313e');shell.addColorStop(.12,'#18151f');shell.addColorStop(1,'#0d0d14');
    ctx.shadowColor='#000b';ctx.shadowBlur=12;ctx.shadowOffsetY=3;
    ctx.fillStyle=shell;ctx.strokeStyle='#67576f';ctx.lineWidth=.8;
    ctx.beginPath();ctx.roundRect(13,12,454,246,8);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.strokeStyle='#d3b5e522';ctx.beginPath();ctx.moveTo(23,13);ctx.lineTo(457,13);ctx.stroke();
    for(const bx of [18,462])for(const by of [17,253]){
      ctx.fillStyle='#615767';ctx.beginPath();ctx.arc(bx,by,1.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#17121f';ctx.beginPath();ctx.moveTo(bx-.6,by);ctx.lineTo(bx+.6,by);ctx.stroke();
    }
    const label=(str,x,y,size=8,color='#e5dfeb',bold=false)=>{
      ctx.textAlign='left';ctx.font=(bold?'bold ':'')+size+'px sans-serif';ctx.fillStyle=color;ctx.fillText(str,x,y);
    };
    const hot=(x,y,w,h)=>bikeInspectHover&&bikeInspectHover.x>=x&&bikeInspectHover.x<=x+w&&bikeInspectHover.y>=y&&bikeInspectHover.y<=y+h;
    const card=(x,y,w,h,hover=false)=>{
      const fill=ctx.createLinearGradient(x,y,x+w,y+h);fill.addColorStop(0,hover?'#35223f':'#24202c');fill.addColorStop(1,hover?'#221a2d':'#14131d');
      ctx.fillStyle=fill;ctx.strokeStyle=hover?'#af79d6':'#44364f';ctx.lineWidth=.6;ctx.beginPath();ctx.roundRect(x,y,w,h,5);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#d8b7ee0d';ctx.beginPath();ctx.moveTo(x+6,y+1);ctx.lineTo(x+w-6,y+1);ctx.stroke();
    };
    ctx.fillStyle=hot(17,16,15,12)?'#633d70':'#302537';ctx.beginPath();ctx.roundRect(17,16,15,12,3);ctx.fill();
    ctx.strokeStyle='#dac5e7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(22,19);ctx.lineTo(27,24);ctx.moveTo(27,19);ctx.lineTo(22,24);ctx.stroke();
    label('GARAGEM',40,24,8,'#f1e4fa',true);label('/  2 CLIQUES: AMPLIAR / REDUZIR',91,24,5.5,'#a491b4');
    drawBikeMenuIcon('kit',374,21,'#d9b683',.55);
    label(repairKits+' CX '+(toolboxes[0]||0)+'%',368,24,5,'#ead0a7',true);ctx.fillStyle=hot(432,15,26,14)?'#68447d':'#392847';ctx.beginPath();ctx.roundRect(432,15,26,14,3);ctx.fill();
    ctx.strokeStyle='#e0c7f0';ctx.lineWidth=.8;
    if(bikeWorkshopWindow.full){
      ctx.strokeRect(443,18,8,6);ctx.fillStyle='#392847';ctx.fillRect(439,21,8,6);ctx.strokeRect(439,21,8,6);
    } else {
      ctx.strokeRect(439,18,12,8);ctx.beginPath();ctx.moveTo(439,20);ctx.lineTo(451,20);ctx.stroke();
    }
    const tabWidth=450/bikeInspectTabs.length;
    bikeInspectTabs.forEach((tab,i)=>{
      const x=15+i*tabWidth,active=tab===bikeInspectTab,hover=hot(x,31,tabWidth,18);
      ctx.fillStyle=active?'#3b284c':hover?'#2a2035':'#17141e';ctx.fillRect(x,31,tabWidth,18);
      if(active){const shine=ctx.createLinearGradient(x,31,x,49);shine.addColorStop(0,'#c583e300');shine.addColorStop(1,'#c583e322');ctx.fillStyle=shine;ctx.fillRect(x,31,tabWidth,18);}
      ctx.fillStyle=active?'#cb92ef':'#3a2e43';ctx.fillRect(x+8,47,tabWidth-16,active?2:.5);
      drawBikeMenuIcon(['info','motor','tire','handlebar'][i],x+29,39,active?'#e6baff':'#8c7c9a',.55);
      label(tab==='Info'?'Visão geral':tab,x+42,42,7,active?'#f3e5ff':'#b0a0bd',active);
    });
    if(bikeInspectTab!=='Info'){drawBikeServiceContent();ctx.restore();return;}
    card(24,58,175,178);
    ctx.save();ctx.beginPath();ctx.roundRect(25,59,173,176,5);ctx.clip();
    const aura=ctx.createRadialGradient(112,147,4,112,147,95);aura.addColorStop(0,'#b76df044');aura.addColorStop(.6,'#7f49ab13');aura.addColorStop(1,'#7f49ab00');ctx.fillStyle=aura;ctx.fillRect(25,59,173,176);
    ctx.strokeStyle='#a688bb0c';ctx.lineWidth=.5;
    for(let gx=30;gx<198;gx+=12){ctx.beginPath();ctx.moveTo(gx,98);ctx.lineTo(gx,203);ctx.stroke();}
    for(let gy=99;gy<204;gy+=12){ctx.beginPath();ctx.moveTo(25,gy);ctx.lineTo(198,gy);ctx.stroke();}
    ctx.strokeStyle='#b992d41a';ctx.beginPath();ctx.ellipse(111,160,69,34,-.15,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.ellipse(111,160,76,40,-.15,0,Math.PI*2);ctx.stroke();ctx.restore();
    label('VEÍCULO / 01',35,72,5,'#b19bc0');label('MOTOCICLETA',35,85,10,'#f1e6f6',true);
    ctx.fillStyle=bikeLife>0&&fuel>0?'#96c9ae':'#e4aa7b';ctx.beginPath();ctx.arc(185,69,2,0,Math.PI*2);ctx.fill();
    label('PRETA',35,96,4.5,'#a99aae');ctx.fillStyle='#a976cf';ctx.fillRect(62,92,4,4);label('ROXA',69,96,4.5,'#c2a0d9');
    ctx.save();ctx.translate(111,194);ctx.scale(1,.22);
    const shadow=ctx.createRadialGradient(0,0,4,0,0,69);shadow.addColorStop(0,'#b179f15c');shadow.addColorStop(.7,'#5c368f22');shadow.addColorStop(1,'#5c368f00');ctx.fillStyle=shadow;ctx.fillRect(-69,-69,138,138);ctx.restore();
    if(bikeSpritesReady()){
      const direction=32,[sx,sy,sw,sh]=bikeSpriteBounds[direction],width=145,height=sh/sw*width;
      ctx.drawImage(bikeSpriteSource(direction),sx,sy,sw,sh,38,100,width,height);
    } else {ctx.save();ctx.translate(107,171);ctx.scale(2.6,2.6);drawBikeFallback(0,0,Math.PI/2,0,0);ctx.restore();}
    // Fine leader lines identify the mechanical areas without covering the bike.
    ctx.strokeStyle='#c6a0dc66';ctx.lineWidth=.5;
    for(const [ax,ay,bx,by] of [[103,157,45,150],[162,144,180,118],[62,184,40,193]]){
      ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.fillStyle='#d9bbeb';ctx.beginPath();ctx.arc(ax,ay,1.3,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#100e18';ctx.beginPath();ctx.roundRect(31,207,161,23,3);ctx.fill();
    label('COMBUSTÍVEL',37,215,5,'#c4afce');
    ctx.textAlign='right';ctx.font='bold 7px monospace';ctx.fillStyle=fuel<=20?'#eea076':'#e5c38c';ctx.fillText(Math.round(fuel)+'%',186,218);
    const fuelLevel=Math.max(0,Math.min(100,fuel));
    for(let i=0;i<18;i++){ctx.fillStyle=fuelLevel>i*100/18?(fuel<=20?'#eea076':'#cca46c'):'#372e40';ctx.fillRect(37+i*6.8,221,5,3);}
    card(210,58,244,39);
    label('ESTADO GERAL',220,69,5,'#ad98bd');
    ctx.fillStyle=bikePartColor(bikeLife);ctx.beginPath();ctx.arc(221,81,2,0,Math.PI*2);ctx.fill();
    label(bikeLife>=72?'Pronta para rodar':bikeLife>=38?'Revisão recomendada':'Manutenção urgente',228,84,8,bikePartColor(bikeLife),true);
    ctx.textAlign='right';ctx.font='bold 16px monospace';ctx.fillStyle='#f1e4fa';ctx.fillText(Math.round(bikeLife),435,82);ctx.font='6px monospace';ctx.fillStyle='#a18cab';ctx.fillText('%',445,82);
    for(let i=0;i<32;i++){ctx.fillStyle=bikeLife>i*100/32?bikePartColor(bikeLife):'#35283f';ctx.fillRect(220+i*7,90,5,2);}
    const entries=[['motor','Motor','Potência e aceleração'],['handlebar','Guidão','Direção e controle'],['frontTire','Pneu dianteiro','Estabilidade e frenagem'],['rearTire','Pneu traseiro','Tração e aderência']];
    entries.forEach(([part,title,description],i)=>{
      const value=bikeParts[part],rowY=103+i*32,color=bikePartColor(value),hover=hot(210,rowY,244,29);
      card(210,rowY,244,29,hover);
      ctx.fillStyle=hover?'#4d325f':'#302438';ctx.beginPath();ctx.roundRect(216,rowY+4,22,21,4);ctx.fill();
      drawBikeMenuIcon(part,227,rowY+14,color,.67);
      label(title,244,rowY+11,7.5,'#eee2f5',true);label(description,244,rowY+22,5,'#a995b5');
      ctx.textAlign='right';ctx.font='bold 8px monospace';ctx.fillStyle=color;ctx.fillText(Math.round(value)+'%',433,rowY+12);
      ctx.strokeStyle=hover?'#e0b5fd':'#8a6a9e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(443,rowY+10);ctx.lineTo(447,rowY+14);ctx.lineTo(443,rowY+18);ctx.stroke();
      for(let j=0;j<10;j++){ctx.fillStyle=value>j*10?color:'#3b2d46';ctx.fillRect(385+j*5,rowY+20,3.5,2);}
    });
    ctx.strokeStyle='#43314f';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(25,238);ctx.lineTo(455,238);ctx.stroke();
    ctx.fillStyle='#251a31';ctx.beginPath();ctx.roundRect(26,242,20,9,2);ctx.fill();label('ESC',29,249,5,'#d2b9e2');label('FECHAR',51,249,5,'#a18bac');
    label('Selecione uma peça para abrir o diagnóstico.',211,249,5.5,'#c1a7d1');
    ctx.restore();
  }
  const FOOT_WALK_KMH=16,FOOT_RUN_KMH=35;
  function footSpeedMultiplier() {
    return keys.has('shift')&&((state==='drive'&&!mounted)||state==='explore')?Math.max(1,FOOT_RUN_KMH/FOOT_WALK_KMH*(typeof characterHealth==='undefined'?1:characterHealth.status().sprint)):1;
  }
  function footWalkSpeed() {
    const condition=.55+.45*Math.min(hunger,thirst)/100;
    const injury=typeof characterHealth==='undefined'?1:characterHealth.status().movement;
    return FOOT_WALK_KMH/BIKE_SPEED_TO_KMH*condition*injury;
  }
  function createFootGait() {
    return {vx:0,vy:0,phase:0,heading:undefined,stage:'idle',running:false,pingPong:false,startPhase:0,stopAt:0,settle:0,contactHold:0,turnTime:0};
  }
  function footHeading(angle,count) {
    return ((Math.round(angle*count/(2*Math.PI))%count)+count)%count;
  }
  function footFrameIndex(phase,frameCount,pingPong) {
    const frame=Math.floor(phase);
    return pingPong?Math.min(frame,2*(frameCount-1)-frame):frame;
  }
  function rightWalkFrame(phase,count) {
    // The painted reach is one way: play it back before starting another reach.
    const period=2*(count-1);
    const step=((Math.floor(phase/(Math.PI*2)*count)%period)+period)%period;
    return footFrameIndex(step,count,true);
  }
  function footPlaybackFrames(walk,running,heading) {
    if(running===true)return walk.runFrames;
    if(running===false)return walk.walkOrder?.[heading]??walk.walkFrames;
    return null;
  }
  function footAtlasFrame(phase,walk,running,pingPong,heading) {
    const frames=footPlaybackFrames(walk,running,heading);
    const index=footFrameIndex(phase,frames?.length??walk.frameCount,pingPong);
    return frames?frames[index]:index;
  }
  function advanceFootPhase(phase,travel,frameCount,run,pingPong=false,uniform=false) {
    if(pingPong||uniform)return (phase+travel)%(pingPong?2*(frameCount-1):frameCount);
    const halfCycle=frameCount/2;
    while(travel>0){
      const frame=Math.floor(phase);
      // Running holds the contact frame longer, then moves briskly through the recovery.
      let cost=frame%halfCycle===0?1+.3*run:1-.1*run;
      // Keep the seam slightly quicker without making the walking frame flash by.
      const seamReduction=frameCount===8?.1+.2*run:.06;
      if(frame===frameCount-1)cost-=seamReduction;
      else if(frame%halfCycle!==0)cost+=seamReduction/(frameCount-3);
      // In the walk, give the planted and passing poses more time without slowing the cycle.
      if(frameCount===8&&frame!==7){
        const step=frame%4;
        cost+=(1-run)*(step===0?.12:step===2?.03:-.1);
      }
      const remaining=(frame+1-phase)*cost;
      if(travel<remaining)return (phase+travel/cost)%frameCount;
      travel-=remaining;
      phase=(frame+1)%frameCount;
    }
    return phase;
  }
  function updateFootGait(gait,distance,angle,walkSpeed,dt,walk,running=gait.running,finishingWalk=false) {
    if(dt<=0)return;
    const {directions}=walk;
    const speed=distance/dt;
    const stopping=distance===0||finishingWalk;
    const activeRunning=stopping?gait.running:running;
    const playbackFrames=footPlaybackFrames(walk,activeRunning,gait.heading);
    const frameCount=playbackFrames?.length??walk.frameCount;
    const fps=walk.fps*frameCount/walk.frameCount;
    const walkCadence=walk.playbackFps??fps*.8;
    const referenceWalk=!!walk.walkFrames&&!activeRunning;
    if(stopping){
      if(gait.stage==='idle')return;
      const period=gait.pingPong?2*(frameCount-1):frameCount;
      const contactInterval=frameCount/2;
      if(gait.stage!=='stop'){
        const firstStep=gait.stage==='start';
        gait.stage='stop';
        const frame=Math.floor(gait.phase);
        const contacts=gait.pingPong?[0,contactInterval,frameCount-1,period-contactInterval,period]:[0,contactInterval,period];
        // Let a short tap finish its first step before settling.
        if(!firstStep&&contacts.includes(frame))gait.phase=frame;
        const target=contacts.find(contact=>contact>=gait.phase);
        gait.stopAt=target%period;
        gait.settle=target-gait.phase;
        gait.contactHold=0;
      }
      const walkStopCadence=referenceWalk?walkCadence:gait.pingPong?walkCadence+1:16;
      const rate=gait.running?Math.min(22,fps*1.8):Math.min(16,walkStopCadence,fps*1.35);
      const step=Math.min(gait.settle,dt*rate);
      gait.phase=(gait.phase+step)%period;
      gait.settle-=step;
      if(gait.settle===0){
        gait.phase=gait.stopAt;
        gait.contactHold+=Math.max(0,dt-step/rate);
        const hold=gait.running?.035:(gait.pingPong||referenceWalk)?.045:.075;
        if(gait.contactHold>=hold&&distance===0)gait.stage='idle';
      }
      gait.turnTime=0;
      return;
    }

    const wasIdle=gait.stage==='idle';
    const pingPong=!!walk.pingPong&&!running;
    const changedCycle=gait.pingPong!==pingPong;
    if((walk.runFrames||walk.walkFrames)&&running!==gait.running){
      const pose=footAtlasFrame(gait.phase,walk,gait.running,gait.pingPong,gait.heading);
      const nearest=playbackFrames?(running?playbackFrames.findIndex(frame=>frame>=pose):playbackFrames.indexOf(pose)):pose;
      const index=nearest<0?0:nearest;
      gait.phase=index+gait.phase%1;
    }else if(gait.pingPong&&!pingPong){
      gait.phase=footFrameIndex(gait.phase,frameCount,true)+gait.phase%1;
    }
    gait.pingPong=pingPong;
    const period=pingPong?2*(frameCount-1):frameCount;
    if(wasIdle){gait.stage='start';gait.startPhase=gait.phase;}
    else if(gait.stage==='stop'||changedCycle)gait.stage='loop';
    gait.running=running;
    const previousFrame=Math.floor(gait.phase);
    const run=Math.max(0,Math.min(1,speed/walkSpeed-1));
    const startingWalk=gait.stage==='start'&&!running&&!pingPong&&!referenceWalk;
    const cadence=pingPong||referenceWalk?walkCadence:fps*.7;
    const distancePerFrame=walkSpeed/cadence*(1+.22*run)*(startingWalk?1.15:1);
    gait.phase=advanceFootPhase(gait.phase,distance/distancePerFrame,frameCount,run,pingPong,referenceWalk);
    if(gait.stage==='start'&&(gait.phase-gait.startPhase+period)%period>=frameCount/4)gait.stage='loop';

    const heading=footHeading(angle,directions);
    const difference=angle-gait.heading*2*Math.PI/directions;
    const turn=Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference)));
    const sector=2*Math.PI/directions;
    if(wasIdle||turn>=sector*1.5){
      gait.heading=heading;
      gait.turnTime=0;
    }else if(turn>sector*.58){
      gait.turnTime+=dt;
      if(Math.floor(gait.phase)!==previousFrame||gait.turnTime>=.055){
        gait.heading=heading;
        gait.turnTime=0;
      }
    }else{
      gait.turnTime=0;
    }
  }
  function moveExplorer(actor,dx,dy,radius) {
    const x=Math.max(58,Math.min(408,actor.x+dx)),y=Math.max(95,Math.min(280,actor.y+dy));
    const hitsWall=(x,y)=>interiorWalls.some(w=>x+radius>w.x&&x-radius<w.x+w.w&&y+radius>w.y&&y-radius<w.y+w.h);
    if(!hitsWall(x,actor.y))actor.x=x;
    if(!hitsWall(actor.x,y))actor.y=y;
  }
  function updateFootMovement(actor,dt,move,screenAngle,speedScale=1) {
    if(dt<=0)return;
    const gait=actor.gait??=createFootGait();
    const dx=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
    const dy=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
    const input=Math.hypot(dx,dy),walkSpeed=footWalkSpeed()*speedScale*shelterLife.speed;
    const multiplier=speedScale<1?1:footSpeedMultiplier(),running=input?multiplier>1:gait.running;
    const targetSpeed=walkSpeed*multiplier/(input||1);
    const targetX=dx*targetSpeed,targetY=dy*targetSpeed;
    // Integrate the velocity ramp over the whole interval, including partial frames.
    const response=input?(running?38:20):(running?52:27);
    const blend=-Math.expm1(-response*dt),carry=blend/response;
    const stepX=targetX*dt+(gait.vx-targetX)*carry,stepY=targetY*dt+(gait.vy-targetY)*carry;
    gait.vx+=(targetX-gait.vx)*blend;
    gait.vy+=(targetY-gait.vy)*blend;
    const x=actor.x,y=actor.y;
    if(stepX||stepY)move(actor,stepX,stepY,7*ACTOR_VISUAL_SCALE);
    const movedX=actor.x-x,movedY=actor.y-y;
    if(Math.abs(movedX-stepX)>1e-6||(targetX===0&&Math.abs(gait.vx)<.5))gait.vx=0;
    if(Math.abs(movedY-stepY)>1e-6||(targetY===0&&Math.abs(gait.vy)<.5))gait.vy=0;
    const distance=Math.hypot(movedX,movedY);
    gait.stepPhase=(gait.stepPhase||0)+distance/(running?40:28)*Math.PI*2;
    const moveAngle=distance>0?Math.atan2(movedX,-movedY):actor.angle;
    const viewAngle=screenAngle?screenAngle(moveAngle):moveAngle;
    if(footHeading(viewAngle,8)===3){
      // Match the painted two-step reach to actual ground travel in screen space.
      const groundDistance=screenAngle
        ?Math.hypot((movedX-movedY)*Math.SQRT1_2,(movedX+movedY)*Math.SQRT1_2*.5):distance;
      gait.rightStepPhase=(gait.rightStepPhase||0)+groundDistance/(running?24:18)*Math.PI*2;
    }
    const stepTarget=Math.min(1,distance/dt/Math.max(1,walkSpeed*.65));
    gait.stepAmount=(gait.stepAmount||0)+(stepTarget-(gait.stepAmount||0))*(-Math.expm1(-18*dt));
    if(stepTarget===0&&gait.stepAmount<.01)gait.stepAmount=0;
    if(distance>0)actor.angle=Math.atan2(movedX,-movedY);
    // Sprint cadence uses half its target speed as the start of its stride range.
    const strideReference=running?walkSpeed*FOOT_RUN_KMH/(2*FOOT_WALK_KMH):walkSpeed;
    updateFootGait(gait,distance,screenAngle?screenAngle(actor.angle):actor.angle,strideReference,dt,spriteAtlas.survivor.walk,running,!input&&!running);
  }
  function drawFootFrame(painter,sheet,crop,anchor,height) {
    const scale=34*ACTOR_VISUAL_SCALE/height,scaleX=scale*.90;
    let left=-anchor[0]*scaleX,top=-anchor[1]*scale;
    let width=crop[2]*scaleX,drawHeight=crop[3]*scale;
    const {a,b,c,d,e,f}=painter.getTransform();
    // Keep a pose's sampling grid stable as the camera and actor move.
    if(b===0&&c===0&&a>0&&d>0){
      left=(Math.round(e)+Math.round(left*a)-e)/a;
      top=(Math.round(f)+Math.round(top*d)-f)/d;
      width=Math.max(1,Math.round(width*a))/a;
      drawHeight=Math.max(1,Math.round(drawHeight*d))/d;
    }
    painter.drawImage(sheet,...crop,left,top,width,drawHeight);
  }
  function drawSurvivorSprite(x,y,angle,gait) {
    if(!survivorSpriteSheet.complete||survivorSpriteSheet.naturalWidth===0)return false;
    const metadata=spriteAtlas.survivor;
    const idleCount=metadata.idleDirections||metadata.columns*metadata.rows;
    const index=footHeading(angle,idleCount)*BIKE_DIRECTION_COUNT/idleCount;
    const idle=metadata.frames[index];
    ctx.save();
    ctx.translate(x,y+5);
    ctx.imageSmoothingEnabled=false;
    if(gait?.stepAmount>.01&&survivorWalkSheet.complete&&survivorWalkSheet.naturalWidth>0){
      const direction=footHeading(angle,8);
      const phase=direction===3?(gait.rightStepPhase??gait.stepPhase??0):(gait.stepPhase||0);
      const frame=((Math.floor(phase/(Math.PI*2)*8)%8)+8)%8;
      if(direction===3&&survivorWalkRightSheet.complete&&survivorWalkRightSheet.naturalWidth>0){
        const count=SURVIVOR_WALK_D.frames.length;
        const rightFrame=rightWalkFrame(phase,count);
        const [sx,sy,sw,sh,headX,groundY]=SURVIVOR_WALK_D.frames[rightFrame];
        const scale=34*ACTOR_VISUAL_SCALE/SURVIVOR_WALK_D.height;
        ctx.imageSmoothingEnabled=true;
        ctx.drawImage(survivorWalkRightSheet,sx,sy,sw,sh,-headX*scale*.9,-groundY*scale,sw*scale*.9,sh*scale);
        ctx.restore();return true;
      }
      // Front/back use opposite limbs for the second step, rather than repeating one leg.
      const mirror=(direction===0||direction===4)&&frame>=4;
      const pose=survivorWalkFrames[direction*8+(mirror?frame-4:frame)];
      const [sx,sy,sw,sh,headX,groundY]=pose;
      const scale=34*ACTOR_VISUAL_SCALE/SURVIVOR_WALK_V2.height;
      // Fixed scale and a helmet anchor prevent foot/hand extents from shifting the body.
      ctx.imageSmoothingEnabled=true;
      if(mirror)ctx.scale(-1,1);
      if(direction===1||direction===2||direction===3||direction===7){
        drawDiagonalWalkArm(ctx,survivorWalkSheet,pose,scale,direction,gait.stepPhase||0,gait.stepAmount);
      }else ctx.drawImage(survivorWalkSheet,sx,sy,sw,sh,-headX*scale*.9,-groundY*scale,sw*scale*.9,sh*scale);
    }else{
      drawFootFrame(ctx,survivorSpriteSheet,idle,metadata.wheelContacts[index][0],idle[3]);
    }
    ctx.restore();return true;
  }
  function drawDiagonalWalkArm(painter,sheet,pose,scale,direction,phase,amount) {
    const [sx,sy,sw,sh,headX,groundY]=pose;
    const facing=direction===7?-1:1;
    const armWidth=22,armTop=62,armHeight=46;
    const armLeft=headX+(direction===3?-23:direction===2?-14:direction===7?-12:-10);
    const bodySide=direction===3?-1:facing;
    painter.save();
    painter.scale(scale*.9,scale);
    painter.translate(-headX,-groundY);
    // Remove the painted static arm before drawing its articulated replacement.
    painter.save();painter.beginPath();
    painter.rect(-2,-2,sw+4,sh+4);painter.rect(armLeft,armTop,armWidth,armHeight);
    painter.clip('evenodd');painter.drawImage(sheet,sx,sy,sw,sh,0,0,sw,sh);painter.restore();
    // Continue the jacket/trousers beneath the moving arm, leaving its outer edge clear.
    const bodyX=bodySide>0?armLeft-6:armLeft+armWidth;
    painter.drawImage(sheet,sx+bodyX,sy+armTop,6,armHeight,
      bodySide>0?armLeft:armLeft+armWidth-10,armTop,10,armHeight);
    const swing=Math.sin(phase)*.32*Math.min(1,amount||0);
    painter.save();
    const backDiagonal=direction===1||direction===7;
    painter.translate(armLeft+armWidth/2+(backDiagonal?facing*5:0),armTop+2);
    painter.rotate(facing*((backDiagonal?-.14:0)+swing));
    painter.drawImage(sheet,sx+armLeft,sy+armTop,armWidth,armHeight,-armWidth/2,-2,armWidth,armHeight);
    painter.restore();painter.restore();
  }
  function drawPerson(x, y, angle, time, moving, bikePose = false, gait = null) {
    if(!bikePose&&drawSurvivorSprite(x,y,angle,gait))return;
    ctx.save(); ctx.translate(x, y); ctx.scale(.72*ACTOR_VISUAL_SCALE, .72*ACTOR_VISUAL_SCALE);
    const sideFacing = Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle));
    if (sideFacing && Math.sin(angle) < 0) ctx.scale(-1, 1);
    const step = 0;
    const reach = bikePose ? -2 : 0;
    // Backpack and silhouette shadow.
    ctx.fillStyle = '#0c1315'; ctx.fillRect(-8, -8, 17, 21);
    ctx.fillStyle = '#765a41'; ctx.fillRect(4, -4, 5, 8); ctx.fillStyle = '#c0a06b'; ctx.fillRect(6, -2, 2, 3);
    // Boots and legs animate independently while walking.
    ctx.fillStyle = '#171e20'; ctx.fillRect(-6, 4 + step, 5, 7); ctx.fillRect(2, 4 - step, 5, 7);
    ctx.fillStyle = '#937354'; ctx.fillRect(-6, 9 + step, 5, 2); ctx.fillRect(2, 9 - step, 5, 2);
    // Jacket, shoulder pads, arms, gloves, and utility belt.
    ctx.fillStyle = '#233636'; ctx.fillRect(-7, -5, 15, 12);
    ctx.fillStyle = '#405751'; ctx.fillRect(-6, -5, 12, 2); ctx.fillRect(-2, -3, 3, 8);
    ctx.fillStyle = '#b07854'; ctx.fillRect(-1, 1, 2, 2);
    ctx.fillStyle = '#171f20'; ctx.fillRect(-10, -4 + reach, 4, 9); ctx.fillRect(7, -4 + reach, 4, 9);
    ctx.fillStyle = '#65756a'; ctx.fillRect(-9, -4 + reach, 2, 4); ctx.fillRect(8, -4 + reach, 2, 4);
    ctx.fillStyle = '#b4875c'; ctx.fillRect(-11, 3 + reach, 4, 3); ctx.fillRect(7, 3 + reach, 4, 3);
    // Helmet, brim, visor, and a small signal light on the pack.
    ctx.fillStyle = '#11191c'; ctx.fillRect(-6, -13, 13, 10);
    ctx.fillStyle = '#d7c18c'; ctx.fillRect(-6, -13, 12, 3); ctx.fillRect(-4, -15, 8, 2);
    ctx.fillStyle = '#7658a6'; ctx.fillRect(-4, -10, 8, 3);
    ctx.fillStyle = '#c6ecce'; ctx.fillRect(7, -5, 2, 2);
    ctx.restore();
  }
  function drawFootWorld(x, y, angle, time) {
    ctx.save();
    const gait=applyReturnPose(player,angle,player.gait);
    ctx.fillStyle = '#080f1088'; ctx.beginPath(); ctx.ellipse(x + 2*ACTOR_VISUAL_SCALE, y + 5, 6*ACTOR_VISUAL_SCALE, 3.5*ACTOR_VISUAL_SCALE, 0, 0, Math.PI * 2); ctx.fill();
    if(playerKnockdown>0){ctx.translate(x,y+5);ctx.rotate(knockdownAngle*Math.min(1,playerKnockdown/.25));ctx.translate(-x,-y-5);}
    drawPerson(x, y, angle, time, !!gait&&gait.stage!=='idle', mounted, gait);
    ctx.restore();
  }
  function panel(x, y, w, h, fill = '#101a1c', stroke = '#475a53') {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }
  function drawCompass(x,y,heading){
    const turn=Math.PI*2,angle=((heading%turn)+turn)%turn;
    const label=['N','NE','L','SE','S','SO','O','NO'][Math.round(angle/(Math.PI/4))%8];
    ctx.save();ctx.translate(x,y);ctx.font='5px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#10201dbb';ctx.beginPath();ctx.arc(0,0,13,0,turn);ctx.fill();
    ctx.strokeStyle='#58766b';ctx.lineWidth=.7;ctx.stroke();
    for(const [text,bearing] of [['N',0],['L',Math.PI/2],['S',Math.PI],['O',-Math.PI/2]]){
      const direction=projectFacing(bearing);ctx.fillStyle=text==='N'?'#e3bc7d':'#849d90';
      ctx.fillText(text,Math.sin(direction)*18,-Math.cos(direction)*18);
    }
    ctx.save();ctx.rotate(projectFacing(heading));ctx.fillStyle='#a4e1c6';
    ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(3,4);ctx.lineTo(0,2);ctx.lineTo(-3,4);ctx.closePath();ctx.fill();ctx.restore();
    ctx.textAlign='left';ctx.fillStyle='#c7d8c9';ctx.fillText(label,25,0);ctx.restore();
  }
  function drawDriveHud(time) {
    ctx.save();
    ctx.textAlign = 'right'; ctx.fillStyle = '#82938b'; ctx.font = '6px monospace';
    ctx.fillText(mounted ? `Q REDUZ · E SOBE MARCHA · F DESCE · J CURATIVO · H CORPO` : 'E INTERAGIR  ·  F MONTAR  ·  J CURATIVO  ·  H CORPO', W - 12, H - 7);
    ctx.restore();
    drawCompass(hudDetails?193:101,25,mounted?bike.angle:player.angle);
    if(!hudDetails){
      const source=mounted?bike:player;
      const target=active();const shelter={index:target?activeTower:-1,distance:target?distance(source,target):Infinity};
      const signal=shelter.index>=0?Math.max(0,4-Math.floor(shelter.distance/420)):0;
      ctx.save();ctx.textAlign='left';ctx.font='6px monospace';ctx.fillStyle='#a4b9ad';ctx.fillText('REDE',14,22);
      for(let i=0;i<4;i++){ctx.fillStyle=i<signal?'#83d8bd':'#33413f';ctx.fillRect(43+i*7,24-i*3,4,5+i*3);}
      ctx.restore();
    }
    if(!hudDetails){
      if(mounted)drawBikeDashboard(time);
      drawSurvivalHud();
      if(shelterView==='observe')return;
      if(playerKnockdown>0)hint('LEVANTANDO...',W/2,25,time);
      else if(!mounted&&active()&&distance(player,active())<65)hint('E ACESSAR COMPUTADOR',W/2,25,time);
      else if(!mounted&&nearbyEntrance(player.x,player.y)>=0)hint('E ENTRAR',W/2,25,time);
      else if(bikeDragging)hint('ARRASTANDO · WASD MOVE · SOLTE G PARA LARGAR',W/2,25,time);
      else if(!mounted&&distance(player,bike)<43)hint('F MONTAR · E OFICINA · SEGURE G PARA ARRASTAR',W/2,25,time);
      if(bikeInspectOpen&&!mounted)drawBikeInspectMenu();
      return;
    }
    panel(11, 10, 157, 43, '#101a1ddd', '#617369');
    const source = mounted ? bike : player;
    const target=active();const shelter={index:target?activeTower:-1,distance:target?distance(source,target):Infinity};
    const signal=shelter.index>=0?Math.max(0,4-Math.floor(shelter.distance/420)):0;
    ctx.fillStyle = '#93a49a'; ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.fillText('NOITE · MANTIQUEIRA', 19, 21);
    ctx.fillStyle = '#81928c'; ctx.fillText('REDE', 19, 36);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i < signal ? '#83d8bd' : '#33413f'; ctx.fillRect(52 + i * 8, 30 - i * 2, 5, 6 + i * 2); }
    if (shelter.index>=0) {
      const door=active();
      const angle = Math.atan2(door.x - source.x, -(door.y - source.y)) - (mounted ? bike.angle : player.angle);
      ctx.fillStyle = '#81928c'; ctx.fillText('DIREÇÃO', 93, 36);
      ctx.save(); ctx.translate(145, 32); ctx.rotate(angle); ctx.fillStyle = '#e2c17c'; ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(5,5); ctx.lineTo(0,2); ctx.lineTo(-5,5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    if (mounted) {
      drawBikeDashboard(time);
    }
    drawSurvivalHud();

    if(playerKnockdown>0)hint('DERRUBADO — LEVANTANDO...',W/2,31,time);
    else if (!mounted && active() && distance(player,active())<65) hint('E ACESSAR COMPUTADOR',W/2,31,time);
    else if (!mounted && nearbyEntrance(player.x, player.y) >= 0) hint('E  ENTRAR PELA PORTA', W / 2, 31, time);
    else if (!mounted && distance(player,bike)<43 && (bikeLife<75 || Object.values(bikeParts).some(value=>value<70))) hint(repairKits>0?'E  REPARAR MOTO · F  MONTAR':'E  INSPECIONAR · PROCURE UM KIT',W/2,31,time);
    else if (!mounted && distance(player, bike) < 55) hint('F  MONTAR NA MOTO', W / 2, 31, time);
    if(playerKnockdown<=0){
      if(bikeDragging)hint('ARRASTANDO · WASD MOVER · SOLTE G PARA LARGAR',W/2,50,time);
      else if (!mounted && distance(player,bike)<43) hint('E  INSPECIONAR · SEGURE G PARA ARRASTAR',W/2,50,time);
    }
    if (bikeInspectOpen && !mounted) drawBikeInspectMenu();
  }
  function hint(text, x, y, time) {
    const width = Math.max(132, text.length * 4.6 + 18);
    panel(x - width / 2, y - 11, width, 19, '#142323eF', '#83d2b2');
    ctx.fillStyle = Math.sin(time * 6) > -.3 ? '#ccf4d7' : '#83d2b2'; ctx.textAlign = 'center'; ctx.font = '7px monospace'; ctx.fillText(text, x, y + 2);
  }

  function drawWorld(time, dt) {
    const focus = mounted ? bike : player;
    camera.x += (focus.x - camera.x) * Math.min(1, dt * 5);
    camera.y += (focus.y - camera.y) * Math.min(1, dt * 5);
    ctx.fillStyle = '#182425'; ctx.fillRect(0, 0, W, H);
    drawIsoMap(time); drawWorldGroundShadows(time); drawIsoDepthObjects(time, true);
    drawAtmosphere(time, 'world');
    drawDayNightLighting(time);
    drawDriveHud(time);
  }
  function drawExplore(time) {
    // Shared C-03 first-floor layout, adapted to the room's 430x320 game canvas.
    const palette = {floor:'#252e2b',wall:'#39423d',dark:'#1c2523',light:'#828574',accent:'#b88e5c'};
    ctx.fillStyle = '#101819'; ctx.fillRect(0, 0, W, H);
    for (let y = -50; y < H + 60; y += 24) for (let x = -60; x < W + 60; x += 40) {
      const sx = x + ((y / 24) % 2) * 20, sy = y + Math.sin(time * .7 + x) * .4;
      ctx.fillStyle = ((x + y) / 24) % 3 ? palette.floor : '#283435';
      ctx.beginPath(); ctx.moveTo(sx, sy + 12); ctx.lineTo(sx + 20, sy); ctx.lineTo(sx + 40, sy + 12); ctx.lineTo(sx + 20, sy + 24); ctx.closePath(); ctx.fill();
    }
    // Room shell, layered walls, fractured masonry, and perspective floor insets.
    polygon([{x:39,y:190},{x:226,y:67},{x:430,y:185},{x:236,y:306}], '#11191a');
    polygon([{x:60,y:187},{x:226,y:86},{x:405,y:188},{x:236,y:289}], palette.floor);
    polygon([{x:44,y:187},{x:226,y:75},{x:236,y:270},{x:44,y:158}], palette.dark);
    polygon([{x:226,y:75},{x:421,y:187},{x:421,y:154},{x:236,y:42}], palette.wall);
    polygon([{x:44,y:187},{x:236,y:302},{x:236,y:270},{x:44,y:158}], '#202b2b');
    polygon([{x:236,y:302},{x:421,y:187},{x:421,y:154},{x:236,y:270}], '#293331');
    // Broad concrete floor slabs echo the reference room's clean, worn floor.
    ctx.strokeStyle='#111a18a8';ctx.lineWidth=1;
    for(let i=1;i<6;i++){const x=60+i*54;ctx.beginPath();ctx.moveTo(x,187-(x-60)*.56);ctx.lineTo(x+42,211+(x-60)*.56);ctx.stroke();}
    for(let i=1;i<5;i++){const y=187+i*20;ctx.beginPath();ctx.moveTo(60+(y-187)*1.62,y);ctx.lineTo(405-(y-187)*1.62,y);ctx.stroke();}
    // Slatted window above the sleeping area.
    polygon([{x:92,y:142},{x:133,y:117},{x:134,y:159},{x:93,y:183}], '#10191a');
    polygon([{x:96,y:143},{x:130,y:122},{x:130,y:155},{x:97,y:174}], '#ba9868');
    ctx.fillStyle='#192321';ctx.fillRect(98,141,31,32);ctx.strokeStyle='#876b49';ctx.lineWidth=1;
    for(let i=0;i<6;i++){const y=145+i*4;ctx.beginPath();ctx.moveTo(98,y);ctx.lineTo(129,y-18);ctx.stroke();}
    ctx.fillStyle='#d3a96a';ctx.fillRect(99,143,30,2);
    ctx.fillStyle = '#101718'; ctx.fillRect(219,97,6,170); ctx.fillRect(393,169,6,91);
    ctx.fillStyle = palette.light; ctx.fillRect(221,98,2,157); ctx.fillRect(395,171,2,82);
    ctx.strokeStyle = '#806849'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(226,79); ctx.lineTo(249,101); ctx.lineTo(241,119); ctx.lineTo(258,139); ctx.moveTo(396,171); ctx.lineTo(376,185); ctx.lineTo(388,200); ctx.stroke();
    ctx.strokeStyle = '#756d5c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(73,151); ctx.lineTo(94,165); ctx.lineTo(106,160); ctx.moveTo(349,145); ctx.lineTo(366,153); ctx.lineTo(384,142); ctx.stroke();
    // Kitchen run along the back wall: refrigerator, sink, cupboards and stove.
    polygon([{x:202,y:166},{x:217,y:157},{x:239,y:169},{x:224,y:178}], '#171f1d');
    polygon([{x:202,y:166},{x:224,y:178},{x:224,y:218},{x:202,y:206}], '#596057');
    polygon([{x:224,y:178},{x:239,y:169},{x:239,y:209},{x:224,y:218}], '#404942');
    ctx.strokeStyle='#a09272';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(206,170);ctx.lineTo(206,201);ctx.moveTo(219,181);ctx.lineTo(219,211);ctx.stroke();
    ctx.fillStyle='#b28e5d';ctx.fillRect(212,184,3,2);
    polygon([{x:235,y:164},{x:278,y:139},{x:322,y:164},{x:279,y:189}], '#1a2321');
    polygon([{x:239,y:160},{x:278,y:137},{x:318,y:160},{x:279,y:183}], '#777466');
    polygon([{x:239,y:160},{x:279,y:183},{x:279,y:202},{x:239,y:179}], '#50574f');
    polygon([{x:279,y:183},{x:318,y:160},{x:318,y:179},{x:279,y:202}], '#3a433e');
    // Sink basin and faucet.
    polygon([{x:249,y:159},{x:267,y:149},{x:287,y:160},{x:269,y:171}], '#303934');
    polygon([{x:253,y:158},{x:267,y:150},{x:283,y:159},{x:269,y:167}], '#10191a');
    ctx.strokeStyle='#a3a08c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(269,151);ctx.lineTo(269,146);ctx.lineTo(274,146);ctx.stroke();
    // Small cooker on the right end of the counter.
    polygon([{x:287,y:157},{x:305,y:147},{x:315,y:153},{x:297,y:164}], '#343b36');
    ctx.strokeStyle='#b3a27b';ctx.lineWidth=1;ctx.beginPath();ctx.arc(298,155,3,0,Math.PI*2);ctx.arc(307,153,3,0,Math.PI*2);ctx.stroke();
    // Lit extractor hood and overhead cupboard.
    polygon([{x:248,y:127},{x:284,y:106},{x:313,y:122},{x:277,y:143}], '#242d29');
    polygon([{x:253,y:124},{x:284,y:106},{x:308,y:119},{x:277,y:137}], '#565b50');
    ctx.fillStyle='#e0b579';ctx.fillRect(263,139,40,3);ctx.fillStyle='#b98851';ctx.fillRect(260,143,44,2);
    // Wall shelves with boxes and jars.
    polygon([{x:324,y:115},{x:347,y:102},{x:374,y:117},{x:351,y:131}], '#222a26');
    polygon([{x:328,y:112},{x:347,y:101},{x:370,y:114},{x:351,y:126}], '#716b59');
    polygon([{x:329,y:134},{x:351,y:121},{x:374,y:134},{x:352,y:147}], '#242c28');
    polygon([{x:333,y:131},{x:351,y:120},{x:370,y:131},{x:352,y:142}], '#7b735e');
    ctx.fillStyle='#4f493c';ctx.fillRect(343,103,11,9);ctx.fillRect(352,125,8,7);ctx.fillRect(362,128,5,6);
    ctx.strokeStyle='#9a8a68';ctx.lineWidth=1;ctx.strokeRect(343,103,11,9);ctx.strokeRect(352,125,8,7);
    // Open stairwell on the right, visibly blocked by a striped safety barrier.
    polygon([{x:351,y:165},{x:390,y:142},{x:415,y:157},{x:377,y:180}], '#111917');
    for(let i=0;i<5;i++){
      const x=365+i*8,y=170-i*5;
      polygon([{x,y},{x:x+27,y:y-16},{x:x+34,y:y-12},{x:x+7,y:y+4}], '#555a50');
      polygon([{x,y},{x:x+7,y:y+4},{x:x+7,y:y+9},{x,y:y+5}], '#343c37');
    }
    ctx.strokeStyle='#7b7b69';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(365,168);ctx.lineTo(397,149);ctx.moveTo(366,176);ctx.lineTo(398,157);ctx.stroke();
    ctx.fillStyle='#b9a174';ctx.font='5px monospace';ctx.textAlign='center';ctx.fillText('↑ 2º ANDAR',389,158);
    ctx.strokeStyle='#c49a57';ctx.lineWidth=4;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(354,188);ctx.lineTo(397,164);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#ddd1b1';ctx.fillRect(372,175,13,11);ctx.fillStyle='#8f4940';ctx.beginPath();ctx.arc(378,180,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ddd1b1';ctx.fillRect(376,179,4,2);
    // Low storage rack and stacked crates along the near right wall.
    ctx.fillStyle='#292f2a';ctx.fillRect(339,222,4,29);ctx.fillRect(378,200,4,29);ctx.fillRect(338,228,42,3);ctx.fillRect(338,240,42,3);
    ctx.strokeStyle='#777362';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(339,228);ctx.lineTo(379,205);ctx.moveTo(339,240);ctx.lineTo(379,217);ctx.stroke();
    for(const [x,y] of [[345,219],[359,212],[366,231],[347,234]]){
      polygon([{x,y},{x:x+10,y:y-6},{x:x+20,y:y},{x:x+10,y:y+6}], '#6a604d');
      polygon([{x,y},{x:x+10,y:y+6},{x:x+10,y:y+14},{x,y:y+8}], '#49483d');
      polygon([{x:x+10,y:y+6},{x:x+20,y:y},{x:x+20,y:y+8},{x:x+10,y:y+14}], '#393d35');
    }
    // The exit is a real doorway in the near wall, with a lit threshold to guide return.
    polygon([{x:58,y:181},{x:79,y:168},{x:99,y:180},{x:99,y:207},{x:79,y:220},{x:58,y:207}], '#111819');
    polygon([{x:64,y:183},{x:79,y:174},{x:93,y:182},{x:93,y:202},{x:79,y:212},{x:64,y:203}], '#080e10');
    ctx.strokeStyle = '#a78659'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(63,203); ctx.lineTo(79,213); ctx.lineTo(94,203); ctx.stroke();
    ctx.fillStyle = Math.sin(time * 5) > 0 ? '#e1bd78' : '#876c4d'; ctx.fillRect(77,210,4,2);
    ctx.fillStyle = '#b8b39a'; ctx.font = '5px monospace'; ctx.textAlign = 'center'; ctx.fillText('PORTA',79,166);
    // Shared salvage table: every discoverable food or fuel item is placed on top.
    ctx.fillStyle = '#080d0e99'; ctx.beginPath(); ctx.ellipse(322,244,39,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#302a22'; ctx.fillRect(297,225,5,22); ctx.fillRect(341,225,5,21); ctx.fillRect(309,234,4,13); ctx.fillRect(332,234,4,12);
    polygon([{x:288,y:220},{x:320,y:200},{x:355,y:220},{x:323,y:241}], '#17201e');
    polygon([{x:291,y:217},{x:320,y:199},{x:351,y:217},{x:322,y:236}], '#80664a');
    polygon([{x:291,y:217},{x:322,y:236},{x:322,y:241},{x:291,y:222}], '#4a3b2d');
    polygon([{x:322,y:236},{x:351,y:217},{x:351,y:222},{x:322,y:241}], '#594530');
    ctx.strokeStyle = '#b18d61'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(298,217); ctx.lineTo(321,231); ctx.lineTo(344,217); ctx.stroke();
    // Mug and loose papers on the dining table, as in the C-03 reference.
    ctx.fillStyle='#3d3328';ctx.fillRect(309,207,5,6);ctx.fillStyle='#8d8875';ctx.fillRect(309,206,5,2);ctx.strokeStyle='#8d8875';ctx.lineWidth=1;ctx.beginPath();ctx.arc(314,210,2,Math.PI*1.5,Math.PI*.5);ctx.stroke();
    polygon([{x:327,y:210},{x:337,y:204},{x:345,y:209},{x:335,y:215}], '#b4aa8f');
    ctx.strokeStyle='#696858';ctx.beginPath();ctx.moveTo(330,210);ctx.lineTo(338,206);ctx.moveTo(333,212);ctx.lineTo(341,208);ctx.stroke();
    const supply = supplies[exploreBuilding];
    if (supply && supply.available && !supply.found) {
      const sx = 322 + Math.sin(time * .6) * 3, sy = 211;
      drawExploreSupply(supply.type, sx, sy, time);
      if (!checkpointReturn&&Math.hypot(explorer.x - sx, explorer.y - sy) < 20) {
        supply.found = true;
        if (supply.type === 'fuel') { fuel = Math.min(100, fuel + 34); setToast('ACHOU COMBUSTÍVEL — +34%'); }
        else if (supply.type === 'ration') { hunger = Math.min(100, hunger + 42); setToast('RAÇÃO MILITAR — FOME REDUZIDA'); }
        else if (supply.type === 'water') { thirst = Math.min(100, thirst + 38); setToast('GARRAFA ENCONTRADA — SEDE REDUZIDA'); }
        else if (supply.type === 'toolkit') { addToolbox(); setToast('CAIXA DE FERRAMENTAS: 100% - '+repairKits+' CAIXAS'); }
        else if (supply.type === 'medical') {characterHealth.restock();survivalItems.bait+=2;setToast('PRIMEIROS SOCORROS + 2 ISCAS');}
        else { hunger = Math.min(100, hunger + 21); setToast('ENLATADO ENCONTRADO — FOME REDUZIDA'); }
      }
    }
    if(isShelter(exploreBuilding)){
      // Bright, clearly recognizable bed reserved for the safe-base room.
      ctx.fillStyle='#080d0eaa';ctx.beginPath();ctx.ellipse(153,220,53,13,0,0,Math.PI*2);ctx.fill();
      polygon([{x:105,y:199},{x:151,y:172},{x:207,y:203},{x:160,y:231}], '#292e2a');
      polygon([{x:110,y:192},{x:151,y:168},{x:201,y:196},{x:160,y:224}], '#b9b29c');
      polygon([{x:110,y:192},{x:160,y:224},{x:160,y:236},{x:110,y:204}], '#625d50');
      polygon([{x:160,y:224},{x:201,y:196},{x:201,y:208},{x:160,y:236}], '#44483f');
      polygon([{x:117,y:189},{x:141,y:175},{x:159,y:185},{x:135,y:200}], '#eee5ca');
      polygon([{x:143,y:187},{x:160,y:177},{x:194,y:196},{x:161,y:216}], '#758579');
      ctx.strokeStyle='#bba77e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(114,198);ctx.lineTo(159,225);ctx.lineTo(198,202);ctx.stroke();
      ctx.fillStyle='#d2b579';ctx.font='bold 6px monospace';ctx.textAlign='center';ctx.fillText('CAMA',155,164);
      ctx.fillStyle='#d0bd8d';ctx.fillRect(130,229,2,2);ctx.fillRect(178,229,2,2);
    }
    ctx.save();
    drawRoomMoss(true);
    const p = { x: explorer.x, y: explorer.y };
    const angle=explorer.angle??Math.PI,gait=applyReturnPose(explorer,angle,explorer.gait);
    ctx.fillStyle = '#080d0e88'; ctx.beginPath(); ctx.ellipse(p.x,p.y + 5,8*ACTOR_VISUAL_SCALE,4*ACTOR_VISUAL_SCALE,0,0,Math.PI*2); ctx.fill();
    drawPerson(p.x,p.y,angle,time,!!gait&&gait.stage!=='idle',false,gait);
    drawRoomMoss(false);
    ctx.restore();
    drawAtmosphere(time, 'world');
    if(hudDetails){
      panel(10, 9, 180, 33, '#101a1deF', '#667a6e'); ctx.fillStyle = '#83d8bd'; ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.fillText('C-03 · INTERIOR (1º ANDAR)', 18, 22); ctx.fillStyle = '#9da99a'; ctx.fillText(Math.hypot(explorer.x - 78, explorer.y - 200) < 42 ? 'E  SAIR PELA PORTA' : 'PROCURE A PORTA PARA SAIR', 18, 34);
    }
    if (isShelter(exploreBuilding)&&Math.hypot(explorer.x - 153, explorer.y - 200) < 38) hint('E  DORMIR NA CAMA · Z  DESCANSO', W / 2, 43, time);
    else if (Math.hypot(explorer.x - 78, explorer.y - 200) < 42) hint('E  SAIR PELA PORTA', W / 2, 43, time);
    drawSurvivalHud();
  }
  function drawRoomMoss(behind){
    if(isShelter(exploreBuilding))return;
    for(const creature of mossEcology.entities.filter(entity=>entity.indoors&&entity.home===exploreBuilding)
      .sort((a,b)=>a.roomY-b.roomY)){
      if((creature.roomY<=explorer.y)!==behind)continue;
      mossRenderer.draw(ctx,creature,creature.roomX,creature.roomY,creature.roomAngle,creature.roomPhase);
    }
  }

  function drawExploreSupply(type, x, y, time) {
    if(type==='medical'){
      ctx.save();ctx.translate(x,y+Math.sin(time*3)*1.5);
      ctx.fillStyle='#10191b';ctx.fillRect(-13,-12,26,24);ctx.fillStyle='#c4c3ac';ctx.fillRect(-11,-10,22,20);
      ctx.strokeStyle='#87978a';ctx.lineWidth=2;ctx.strokeRect(-5,-15,10,5);
      ctx.fillStyle='#8e514d';ctx.fillRect(-3,-7,6,14);ctx.fillRect(-7,-3,14,6);ctx.restore();return;
    }
    const bob = Math.sin(time * 3.2) * 1.5;
    y += bob;
    ctx.fillStyle = '#070d0e99'; ctx.beginPath(); ctx.ellipse(x, y + 14, type === 'ration' ? 19 : 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (type === 'ration') {
      // Sealed olive drab R2 field-ration pouch, with crimped foil edges and a printed 24h label.
      polygon([{x:x-13,y:y-16},{x:x-9,y:y-20},{x:x+10,y:y-20},{x:x+14,y:y-16},{x:x+16,y:y+12},{x:x+12,y:y+16},{x:x-12,y:y+16},{x:x-16,y:y+12}], '#202a20');
      polygon([{x:x-11,y:y-16},{x:x-8,y:y-18},{x:x+9,y:y-18},{x:x+12,y:y-15},{x:x+13,y:y+11},{x:x+10,y:y+13},{x:x-10,y:y+13},{x:x-13,y:y+10}], '#596044');
      ctx.fillStyle = '#7b7951'; ctx.fillRect(x-11,y-16,5,4); ctx.fillRect(x+4,y-11,6,4); ctx.fillRect(x-7,y+5,7,5); ctx.fillRect(x+7,y+6,4,4);
      ctx.fillStyle = '#303c2d'; ctx.fillRect(x-10,y-10,20,16); ctx.fillStyle = '#c9c5a4'; ctx.fillRect(x-8,y-8,16,12);
      ctx.fillStyle = '#596044'; ctx.fillRect(x-6,y-6,12,2); ctx.fillStyle = '#9b5e3f'; ctx.fillRect(x-6,y-3,12,1);
      ctx.fillStyle = '#263126'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('R2',x,y+4);
      ctx.fillStyle = '#4c5840'; ctx.font = '4px monospace'; ctx.fillText('24 HORAS',x,y+9);
      ctx.fillStyle = '#d4c99d'; ctx.fillRect(x-10,y-20,20,2); for (let i=0;i<5;i++) ctx.fillRect(x-9+i*4,y-21,1,4);
      ctx.fillStyle = '#e1d7ad'; ctx.fillRect(x+10,y-15,3,3); ctx.fillStyle = '#6b7653'; ctx.fillRect(x+11,y-14,1,1);
    } else if (type === 'water') {
      ctx.fillStyle = '#172526'; ctx.fillRect(x-7,y-15,14,28); ctx.fillStyle = '#52827c'; ctx.fillRect(x-5,y-13,10,24);
      ctx.fillStyle = '#619b91'; ctx.fillRect(x-4,y-17,8,5); ctx.fillStyle = '#d1b274'; ctx.fillRect(x-4,y-21,8,4);
      ctx.fillStyle = '#202d2b'; ctx.fillRect(x-5,y-5,10,8); ctx.fillStyle = '#c4d1ba'; ctx.fillRect(x-3,y-3,6,2); ctx.fillStyle = '#9ac6b5'; ctx.fillRect(x-2,y+1,4,1);
      ctx.fillStyle = '#a5cfc1'; ctx.fillRect(x-3,y-11,2,5);
    } else if (type === 'toolkit') {
      ctx.fillStyle='#19221e';ctx.fillRect(x-15,y-12,30,25);ctx.fillStyle='#6e775d';ctx.fillRect(x-13,y-10,26,21);ctx.fillStyle='#c5aa72';ctx.fillRect(x-8,y-5,16,3);ctx.fillRect(x-2,y-9,4,14);ctx.fillStyle='#252d27';ctx.fillRect(x-10,y+12,20,3);ctx.fillStyle='#dfc990';ctx.font='5px monospace';ctx.textAlign='center';ctx.fillText('TOOLS',x,y+4);
    } else if (type === 'fuel') {
      ctx.fillStyle = '#171c19'; ctx.fillRect(x-12,y-12,24,26); ctx.fillStyle = '#85553c'; ctx.fillRect(x-10,y-10,20,22);
      ctx.fillStyle = '#b08058'; ctx.fillRect(x-7,y-15,10,4); ctx.fillRect(x-2,y-18,8,3); ctx.fillStyle = '#d2b071'; ctx.fillRect(x-4,y-16,4,2);
      ctx.fillStyle = '#1c2724'; ctx.fillRect(x-7,y-5,14,9); ctx.fillStyle = '#d3bd83'; ctx.fillRect(x-5,y-3,10,2); ctx.fillStyle = '#c46b45'; ctx.fillRect(x-2,y+1,4,2);
      ctx.fillStyle = '#a16a48'; ctx.fillRect(x-11,y-8,2,16); ctx.fillRect(x+9,y-8,2,16);
    } else {
      // Canned meal with rolled metal rim, label band and pull tab.
      ctx.fillStyle = '#161e1f'; ctx.fillRect(x-10,y-14,20,27); ctx.fillStyle = '#969486'; ctx.fillRect(x-8,y-13,16,24);
      ctx.fillStyle = '#c2b89b'; ctx.fillRect(x-8,y-14,16,3); ctx.fillRect(x-8,y+9,16,3); ctx.fillStyle = '#626e61'; ctx.fillRect(x-7,y-7,14,13);
      ctx.fillStyle = '#ad7048'; ctx.fillRect(x-5,y-5,10,2); ctx.fillStyle = '#d4c492'; ctx.fillRect(x-4,y-2,8,5); ctx.fillStyle = '#496354'; ctx.fillRect(x-2,y-1,4,3);
      ctx.fillStyle = '#ddd2ae'; ctx.fillRect(x-2,y-13,4,1); ctx.fillRect(x+1,y-12,3,2);
    }
    ctx.textAlign = 'left';
  }

  function drawBikeDashboard(time) {
    const bounds=bikeDashboardBounds(),x=0,y=0,w=130,h=76;
    const speed=state==='chase'||state==='grapple'?chaseSpeed:bike.speed,kmh=Math.abs(speed)*BIKE_SPEED_TO_KMH;
    ctx.save();
    ctx.translate(bounds.x,bounds.y);ctx.scale(BIKE_DASHBOARD_SCALE,BIKE_DASHBOARD_SCALE);
    const face=ctx.createLinearGradient(x,y,x,y+h);
    face.addColorStop(0,'#454349');face.addColorStop(.12,'#232126');face.addColorStop(.7,'#111014');face.addColorStop(1,'#07070a');
    ctx.fillStyle=face;ctx.strokeStyle='#98949d';ctx.lineWidth=1;
    // Rounded black instrument pod matches the bike's tank and silver hardware.
    ctx.beginPath();ctx.moveTo(x+25,y);ctx.lineTo(x+w-25,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+25);ctx.lineTo(x+w,y+h-22);
    ctx.quadraticCurveTo(x+w-2,y+h,x+w-19,y+h);ctx.lineTo(x+19,y+h);
    ctx.quadraticCurveTo(x+2,y+h,x,y+h-22);ctx.lineTo(x,y+25);
    ctx.quadraticCurveTo(x,y,x+25,y);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='#8953b2';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(x+3,y+24);ctx.lineTo(x+3,y+50);ctx.lineTo(x+11,y+60);
    ctx.moveTo(x+w-3,y+24);ctx.lineTo(x+w-3,y+50);ctx.lineTo(x+w-11,y+60);ctx.stroke();
    ctx.strokeStyle='#060b10';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(x+9,y+59);ctx.lineTo(x+w-9,y+59);ctx.stroke();
    const glass=ctx.createLinearGradient(x,y+6,x,y+58);
    glass.addColorStop(0,'#302936');glass.addColorStop(.45,'#18151e');glass.addColorStop(1,'#0d0d13');
    ctx.fillStyle=glass;ctx.strokeStyle='#655c70';ctx.lineWidth=.5;
    ctx.beginPath();ctx.moveTo(x+21,y+6);ctx.lineTo(x+w-21,y+6);
    ctx.lineTo(x+w-6,y+21);ctx.lineTo(x+w-6,y+51);
    ctx.lineTo(x+w-13,y+58);ctx.lineTo(x+13,y+58);
    ctx.lineTo(x+6,y+51);ctx.lineTo(x+6,y+21);ctx.closePath();ctx.fill();ctx.stroke();
    // A circular silver bezel recalls the small round gauge above the handlebars.
    ctx.fillStyle='#101015';ctx.strokeStyle='#a8a2ae';ctx.lineWidth=1.3;
    ctx.beginPath();ctx.arc(x+44,y+34,16,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#513565';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(x+44,y+34,14.5,0,Math.PI*2);ctx.stroke();
    for(const boltX of [x+4,x+w-4]){
      ctx.fillStyle='#81909a';ctx.beginPath();ctx.arc(boltX,y+37,1.3,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#18242d';ctx.beginPath();ctx.moveTo(boltX-.7,y+37);ctx.lineTo(boltX+.7,y+37);ctx.stroke();
    }
    ctx.textAlign='left';ctx.font='4px monospace';ctx.fillStyle='#8db7c8';ctx.fillText('RPM  x1000',x+23,y+12);
    for(let i=0;i<24;i++){
      ctx.fillStyle=bikeRpm/8000>(i+.5)/24?(i>=20?'#ff765f':i>=17?'#f4c775':'#bc8fe1'):'#393040';
      ctx.fillRect(x+10+i*4.55,y+15-(i/6|0),3.2,2+(i/6|0));
    }
    ctx.textAlign='center';ctx.fillStyle='#f1e9dc';ctx.font='bold 15px monospace';
    ctx.fillText(String(Math.round(kmh)).padStart(2,'0'),x+44,y+36);
    ctx.font='4px monospace';ctx.fillStyle='#c6b0d5';ctx.fillText('km/h',x+44,y+43);
    ctx.fillStyle=bikeShiftFlash>0?'#56366d':'#292033';ctx.beginPath();ctx.roundRect(x+96,y+24,23,24,3);ctx.fill();
    ctx.textAlign='center';ctx.font='4px monospace';ctx.fillStyle='#9cbdcc';ctx.fillText('GEAR',x+107.5,y+30);
    ctx.font='bold 16px monospace';ctx.fillStyle='#f7cd7f';ctx.fillText(speed<0?'R':String(bikeGear),x+107.5,y+45);
    const level=Math.max(0,Math.min(100,fuel)),low=level<=20;
    ctx.textAlign='left';ctx.font='4px monospace';ctx.fillStyle=low?'#ff9a70':'#b3d2d9';
    ctx.fillText('GAS',x+10,y+56);ctx.fillText('E',x+25,y+56);
    for(let i=0;i<10;i++){
      ctx.fillStyle=level>i*10?(low?'#ff9864':'#d4af70'):'#393040';ctx.fillRect(x+32+i*5.5,y+52,4,4);
    }
    ctx.fillStyle='#b3d2d9';ctx.fillText('F',x+89,y+56);
    ctx.textAlign='right';ctx.fillStyle=low?'#ff9a70':'#c5e5e9';ctx.fillText(Math.round(level)+'%',x+119,y+56);
    for(const [bx,label] of [[x+7,'Q  -'],[x+75,'E  +']]){
      ctx.fillStyle='#19151e';ctx.strokeStyle='#685174';ctx.beginPath();ctx.roundRect(bx,y+61,48,12,5);ctx.fill();ctx.stroke();
      ctx.textAlign='center';ctx.font='5px monospace';ctx.fillStyle='#c5dbe3';ctx.fillText(label,bx+24,y+69);
    }
    ctx.fillStyle=low&&Math.sin(time*5)>0?'#ff855d':'#577582';ctx.beginPath();ctx.arc(x+65,y+67,2,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  function drawSurvivalHud() {
    const riding=bikeControlsMounted(),bounds=bikeDashboardBounds(),w=110,x=W-w-12;
    const top=riding?bounds.y-29:H-42,barWidth=w-53;
    ctx.save();panel(x,top,w,23,'#101f23bb','#506f6866');ctx.font='5px monospace';
    const meters=[['FOME',hunger,'#c69d6d'],['SEDE',thirst,'#78b9b0']];
    meters.forEach(([name,value,color],i)=>{
      const y=top+9+i*9;ctx.textAlign='left';ctx.fillStyle='#9ba99d';ctx.fillText(name,x+5,y);
      ctx.fillStyle='#293834';ctx.fillRect(x+27,y-4,barWidth,3);ctx.fillStyle=color;ctx.fillRect(x+27,y-4,barWidth*Math.max(0,value)/100,3);
      ctx.textAlign='right';ctx.fillStyle='#cedbce';ctx.fillText(String(Math.round(value)),x+w-5,y);
    });
    const status=characterHealth.status();
    ctx.textAlign='left';ctx.font='6px monospace';ctx.fillStyle='#dbe6dc';ctx.fillText('VIDA '+Math.ceil(status.health)+' / '+status.maxHealth,12,H-77);
    ctx.fillStyle='#25322f';ctx.fillRect(12,H-72,110,7);ctx.fillStyle=status.health<status.maxHealth*.3?'#ee806e':'#83d8a5';ctx.fillRect(13,H-71,108*status.health/status.maxHealth,5);
    ctx.restore();
  }
  function drawAtmosphere(time, view) {
    ctx.save();
    ctx.fillStyle = 'rgba(7, 13, 18, .13)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    const hazeCount=view==='climb'?1:3;
    for (let i = 0; i < hazeCount; i++) {
      const drift = ((time * (5 + i * 3) + i * 197) % (W + 280)) - 140;
      const cy = 55 + i * 76 + Math.sin(time * .18 + i * 2) * 18;
      const haze = ctx.createRadialGradient(drift, cy, 4, drift, cy, 152 + i * 24);
      haze.addColorStop(0, i === 1 ? 'rgba(109, 131, 129, .15)' : 'rgba(97, 121, 120, .11)');
      haze.addColorStop(.52, 'rgba(80, 103, 104, .055)'); haze.addColorStop(1, 'rgba(65, 83, 88, 0)');
      ctx.fillStyle = haze; ctx.fillRect(drift - 180, cy - 180, 360, 360);
    }
    if (view === 'world') {
      towers.forEach((tower, i) => {
        if (tower.disabled) return;
        const p = projectPoint(tower.x, tower.y);
        if (p.x < -90 || p.x > W + 90 || p.y < -100 || p.y > H + 90) return;
        const glow = ctx.createRadialGradient(p.x, p.y - 32, 2, p.x, p.y - 32, 82);
        glow.addColorStop(0, i === activeTower ? 'rgba(235, 112, 81, .2)' : 'rgba(177, 95, 74, .1)');
        glow.addColorStop(1, 'rgba(177, 95, 74, 0)'); ctx.fillStyle = glow; ctx.fillRect(p.x - 90, p.y - 122, 180, 180);
      });
    }
    ctx.globalCompositeOperation = 'source-over';
    const lightning = Math.pow(Math.max(0, Math.sin(time * .43 + 1.7)), 38);
    if (lightning > .22) { ctx.fillStyle = `rgba(177, 199, 201, ${lightning * .13})`; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = 'rgba(174, 193, 196, .17)'; ctx.lineWidth = .55;
    const rainCount=view==='climb'?20:74;
    ctx.beginPath();
    for (let i = 0; i < rainCount; i++) {
      const x = (i * 67 + Math.sin(time * .8 + i) * 9) % W;
      const y = (i * 43 + time * (82 + i % 4 * 12)) % H;
      ctx.moveTo(x, y); ctx.lineTo(x - 2.2, y + 5 + i % 3);
    }
    ctx.stroke();
    const dustCount=view==='climb'?5:18;
    for (let i = 0; i < dustCount; i++) {
      const x = (i * 109 + Math.sin(time * .25 + i * 3) * 23 + W) % W;
      const y = ((i * 53 - time * 4 + H * 2) % H + H) % H;
      ctx.fillStyle = i % 3 ? 'rgba(171, 186, 166, .3)' : 'rgba(226, 163, 103, .38)';
      ctx.fillRect(x, y, .7, .7);
    }
    const vignette = ctx.createRadialGradient(W * .5, H * .47, 42, W * .5, H * .47, Math.hypot(W, H) * .68);
    vignette.addColorStop(0, 'rgba(2, 7, 10, 0)'); vignette.addColorStop(.64, 'rgba(2, 7, 10, .12)'); vignette.addColorStop(1, 'rgba(2, 7, 10, .58)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function startChase() {
    const entrySpeed=Math.min(bikeGearSpeedLimit(),Math.max(0,bike.speed));
    state = 'chase'; mounted = false; bike.speed = 0; approachedByBike = true;
    chaseProgress = 0; chaseSpeed = entrySpeed; chaseLag = 90; chaseElapsed = 0; chaseLives = 3; chaseInvulnerable = 0; hookReady = false; grappleAvailable = false;
    chaser.x = 240; chaser.feet = CHASE_BIKE_Y; chaser.vy = 0; chaser.grounded = true; chaser.duck = 0; chaser.steer = 0;
    chaseObstacles.forEach(o => o.cleared = false);
    keys.clear(); setToast('W ACELERA · Q REDUZ · E SOBE MARCHA · A/D VIRA', 2.8); updateObjective();
  }
  function chaseMachinePose(time, tower) {
    const phase = time * (1.5 + tower.design * .22) + tower.phase;
    const step = Math.sin(phase * 2.1);
    const roots = tower.design === 1
      ? [[82,0],[150,Math.PI],[330,Math.PI],[398,0],[118,Math.PI*.5],[362,Math.PI*1.5]]
      : tower.design === 2
        ? [[135,0],[240,Math.PI*1.25],[345,Math.PI*.5]]
        : tower.design === 3
          ? [[86,0],[151,Math.PI],[329,Math.PI],[394,0]]
          : tower.design === 4
            ? [[55,0],[104,Math.PI],[153,0],[202,Math.PI],[278,0],[327,Math.PI],[376,0],[425,Math.PI]]
            : [[95,0],[164,Math.PI],[316,Math.PI],[385,0]];
    const feet = roots.map(([rootX, offset], i) => {
      const cycle = tower.design===4 ? Math.sin(phase * 1.15 + offset) : Math.sin(phase * (tower.design===3?2.8:2.1) + offset);
      return { x: rootX + Math.sin(phase + offset) * (tower.design===4?13:tower.design===3?48:32), rootX, y: 70 + Math.max(0, cycle) * (tower.design===4?102:tower.design===3?145:132), planted: cycle > (tower.design===3?.76:.68), index: i };
    });
    const bike = { x: chaser.x, y: CHASE_BIKE_Y };
    const target = feet.reduce((best, foot) => Math.hypot(foot.x - bike.x, foot.y - bike.y) < Math.hypot(best.x - bike.x, best.y - bike.y) ? foot : best, feet[0]);
    return {
      phase, step, feet, target,
      bodyX: W * .5 + Math.sin(phase * .32) * 12
    };
  }
  function updateChase(dt) {
    const left = keys.has('a') || keys.has('arrowleft'), right = keys.has('d') || keys.has('arrowright');
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    chaser.steer += (steer - chaser.steer) * Math.min(1, dt * 8);
    chaser.x = Math.max(40, Math.min(W - 40, chaser.x + steer * 250 * dt*characterHealth.status().handling));
    const condition=(.65+.35*Math.min(hunger,thirst)/100)*(.62+.38*Math.min(bikeParts.frontTire,bikeParts.rearTire)/100);
    const limit=bikeGearSpeedLimit();
    const targetSpeed=fuel<=0||bikeLife<=0?0:keys.has('w')?limit:keys.has('s')?Math.min(38,limit):Math.min(100,limit);
    chaseSpeed += (targetSpeed - chaseSpeed) * Math.min(1, dt * 2.8 * condition);
    if(keys.has('w')&&fuel>0&&bikeLife>0)fuel=Math.max(0,fuel-dt*.08/(1+upgrades.fuel*.25));
    chaseProgress += chaseSpeed * dt;
    chaseElapsed += dt;
    const tower = active(), machineSpeed = [151,159,167,188,126][tower.design]*.8;
    chaseLag = Math.max(0, Math.min(390, chaseLag + (machineSpeed - chaseSpeed) * dt));
    chaseInvulnerable = Math.max(0, chaseInvulnerable - dt);
    for (const o of chaseObstacles) {
      const y = CHASE_BIKE_Y - (o.at - chaseProgress) * .27;
      if (o.cleared) continue;
      if (y > CHASE_BIKE_Y + 36) { o.cleared = true; continue; }
      if (Math.abs(y - CHASE_BIKE_Y) > 20 || Math.abs(o.x - chaser.x) > 40) continue;
      o.cleared = true;
      if (chaseInvulnerable <= 0) { chaseLives--; chaseInvulnerable = 1.1; chaseLag = Math.min(390, chaseLag + 42); chaser.x += chaser.x < W * .5 ? -24 : 24; applyMountedImpact(chaseSpeed,'IMPACTO NOS ESCOMBROS'); }
    }
    const pose = chaseMachinePose(gameTime, tower);
    for (const foot of pose.feet) {
      if (foot.y > 184 && Math.hypot(foot.x - chaser.x, foot.y - CHASE_BIKE_Y) < 36 && chaseInvulnerable <= 0) {
        chaseLives--; chaseInvulnerable = 1.4; chaseLag = Math.min(390, chaseLag + 58); chaser.x += chaser.x < foot.x ? -55 : 55;
        applyMountedImpact(chaseSpeed,'PISÃO NA MOTO'); break;
      }
    }
    if (chaseLag >= 375) { state = 'drive'; grappleAvailable = false; keys.clear(); bike.speed = 0; setToast('VOCÊ FICOU PARA TRÁS — REENCONTRE A MÁQUINA NO MAPA', 3.2); updateObjective(); return; }
    grappleAvailable = chaseProgress > 620 && chaseLag < 125 && pose.target.planted && Math.hypot(pose.target.x - chaser.x, pose.target.y - CHASE_BIKE_Y) < 92;
    hookReady = grappleAvailable;
    if (state === 'grapple' && gameTime - grappleStartedAt > 6) { state = 'chase'; chaseLives = Math.max(1, chaseLives - 1); chaseLag = Math.min(390, chaseLag + 60); updateObjective(); setToast('A JANELA DO RAPEL FECHOU — VOLTE A PERSEGUIR', 2); }
  }


  function drawChase(time) {
    const tower = active(), pose = chaseMachinePose(time, tower), scroll = chaseProgress * .27;
    ctx.fillStyle = '#10191c'; ctx.fillRect(0, 0, W, H);
    // A broken service road and enormous ruined blocks slide beneath the top-down camera.
    for (let y = -40; y < H + 36; y += 30) for (let x = -24; x < W + 30; x += 48) {
      const yy = ((y + scroll) % 30 + 30) % 30 + y - ((y + scroll) % 30);
      ctx.fillStyle = ((x / 48 + y / 30) % 3) ? '#202a2c' : '#253032';
      ctx.beginPath(); ctx.moveTo(x, yy + 9); ctx.lineTo(x + 23, yy); ctx.lineTo(x + 47, yy + 10); ctx.lineTo(x + 24, yy + 21); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#171f21'; ctx.fillRect(31, 0, W - 62, H);
    ctx.fillStyle = '#232a29'; ctx.fillRect(48, 0, W - 96, H);
    ctx.fillStyle = '#343a36'; ctx.fillRect(54, 0, 2, H); ctx.fillRect(W - 56, 0, 2, H);
    ctx.strokeStyle = '#81745655'; ctx.lineWidth = 1; ctx.setLineDash([12, 18]); ctx.beginPath(); ctx.moveTo(W / 2, -12 + scroll % 30); ctx.lineTo(W / 2, H + 12); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      const row = Math.floor((i * 76 + chaseProgress * .46) / 420), y = ((i * 76 + chaseProgress * .46) % 420) - 70;
      const leftX = i % 2 ? 4 : 15, rightX = W - 15 - (i % 2 ? 0 : 13), height = 48 + (i * 29 % 46), width = 40 + i % 3 * 13;
      drawChaseRuin(leftX, y, width, height, row + i, time);
      drawChaseRuin(rightX - width, y - 26, width, height + 19, row + i + 2, time);
    }
    // Collapsed paving, cracked slabs and snapped reinforcement are the driving hazards.
    chaseObstacles.forEach(o => {
      if (o.cleared) return;
      const y = CHASE_BIKE_Y - (o.at - chaseProgress) * .27;
      if (y < -48 || y > H + 48) return;
      drawChaseDebris(o, y, time);
      const distanceY = CHASE_BIKE_Y - y;
      if (distanceY > 18 && distanceY < 112) {
        const blink = Math.sin(time * 12 + o.at) > -.2;
        ctx.fillStyle = blink ? '#e1b76e' : '#855949'; ctx.beginPath(); ctx.moveTo(o.x, y + 24); ctx.lineTo(o.x - 5, y + 34); ctx.lineTo(o.x + 5, y + 34); ctx.closePath(); ctx.fill();
      }
    });
    drawTopdownMachine(tower, pose, time);
    drawChaseBike(chaser.x, CHASE_BIKE_Y, time);
    if (grappleAvailable) {
      const t = pose.target;
      ctx.strokeStyle = '#8be4b6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, 18 + Math.sin(time * 12) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#8be4b666'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(chaser.x, CHASE_BIKE_Y - 18); ctx.lineTo(t.x, t.y + 12); ctx.stroke(); ctx.setLineDash([]);
    }
    drawAtmosphere(time, 'chase');
    drawDayNightLighting(time, 'chase');
    panel(10, 9, 107, 37, '#101a1deF', '#667a6e');
    ctx.textAlign = 'left'; ctx.fillStyle = '#a6b5a5'; ctx.font = '6px monospace'; ctx.fillText(`SOB A MÁQUINA · NÓ 0${activeTower + 1}`, 17, 21); ctx.fillStyle = '#df8d66'; ctx.fillText('INTEGRIDADE', 17, 38);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < chaseLives ? '#df8d66' : '#3a4140'; ctx.fillRect(75 + i * 11, 31, 8, 6); }
    panel(139, 9, 202, 37, '#101a1deF', '#667a6e');
    ctx.fillStyle = '#a6b5a5'; ctx.textAlign = 'center'; ctx.fillText('DISTÂNCIA DA MÁQUINA', 240, 21);
    ctx.fillStyle = '#283432'; ctx.fillRect(151, 28, 178, 5); ctx.fillStyle = chaseLag > 250 ? '#df795e' : '#80c9a9'; ctx.fillRect(151, 28, 178 * (1 - chaseLag / 390), 5);

    ctx.textAlign = 'center'; ctx.fillStyle = '#bdc8b2'; ctx.fillText('SEGURE W PARA ACOMPANHAR · A/D DESVIA · S FREIA', W / 2, H - 9);
    if (grappleAvailable) { ctx.fillStyle = '#a8e6bd'; ctx.fillText('PERNA AO ALCANCE — APERTE E OU USE O BOTÃO DE RAPEL', W / 2, H - 22); }
  }

  function drawChaseRuin(x, y, w, h, seed, time) {
    ctx.fillStyle = '#0d1416aa'; ctx.fillRect(x + 4, y + 5, w, h);
    ctx.fillStyle = seed % 2 ? '#252d2c' : '#303632';
    ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + w * .2, y); ctx.lineTo(x + w * .62, y + 3); ctx.lineTo(x + w, y + 12); ctx.lineTo(x + w - 3, y + h); ctx.lineTo(x + 7, y + h - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#101719'; ctx.fillRect(x + w * .28, y + h * .25, 8, h * .32); ctx.fillRect(x + w * .68, y + h * .16, 7, h * .23);
    ctx.fillStyle = '#76563f'; ctx.fillRect(x + w * .28, y + h * .25, 3, 4);
    ctx.strokeStyle = '#11191a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w * .57, y + 5); ctx.lineTo(x + w * .48, y + h * .35); ctx.lineTo(x + w * .66, y + h * .58); ctx.lineTo(x + w * .51, y + h - 4); ctx.stroke();
    ctx.fillStyle = '#8d9285'; for (let i = 0; i < 4; i++) { const px = x + ((seed * 13 + i * 17) % Math.max(1, w - 5)); const py = y + h - 4 + Math.sin(time + seed + i) * 2; ctx.fillRect(px, py, 3 + i % 2, 2); }
  }

  function drawChaseDebris(obstacle, y, time) {
    const x = obstacle.x;
    ctx.fillStyle = '#080e10a8'; ctx.beginPath(); ctx.ellipse(x + 3, y + 9, obstacle.kind === 'wall' ? 30 : 22, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (obstacle.kind === 'wall') {
      ctx.fillStyle = '#323936'; ctx.beginPath(); ctx.moveTo(x - 29, y - 9); ctx.lineTo(x - 17, y - 20); ctx.lineTo(x + 8, y - 16); ctx.lineTo(x + 27, y - 7); ctx.lineTo(x + 22, y + 10); ctx.lineTo(x - 18, y + 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#171f20'; ctx.fillRect(x - 5, y - 11, 8, 17); ctx.fillStyle = '#8c6044'; ctx.fillRect(x + 5, y - 18, 2, 12);
      ctx.strokeStyle = '#9c7650'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 6, y - 16); ctx.lineTo(x + 17, y - 27); ctx.lineTo(x + 21, y - 25); ctx.stroke();
    } else if (obstacle.kind === 'wreck') {
      ctx.fillStyle = '#151c1e'; ctx.beginPath(); ctx.moveTo(x - 23, y - 11); ctx.lineTo(x - 14, y - 18); ctx.lineTo(x + 17, y - 17); ctx.lineTo(x + 24, y - 7); ctx.lineTo(x + 18, y + 13); ctx.lineTo(x - 17, y + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4d5149'; ctx.fillRect(x - 12, y - 11, 25, 5); ctx.fillStyle = '#a15f46'; ctx.fillRect(x + 18, y - 4, 4, 4); ctx.fillStyle = '#080d0f'; ctx.fillRect(x - 22, y - 14, 8, 6); ctx.fillRect(x + 12, y + 8, 9, 6);
    } else {
      ctx.fillStyle = '#353a35'; ctx.beginPath(); ctx.moveTo(x - 21, y + 8); ctx.lineTo(x - 18, y - 9); ctx.lineTo(x - 2, y - 15); ctx.lineTo(x + 9, y - 7); ctx.lineTo(x + 22, y - 10); ctx.lineTo(x + 18, y + 11); ctx.lineTo(x + 1, y + 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#171f20'; ctx.fillRect(x - 5, y - 7, 6, 15); ctx.fillStyle = '#747365'; ctx.fillRect(x - 15, y - 6, 7, 3);
      ctx.strokeStyle = '#a07b51'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 12, y - 11); ctx.lineTo(x + 25, y - 20); ctx.lineTo(x + 27, y - 16); ctx.stroke();
    }
    if (Math.sin(time * 8 + obstacle.at) > .65) { ctx.fillStyle = '#e6a65f'; ctx.fillRect(x - 2, y - 2, 3, 2); }
  }

  function drawTopdownMachine(tower, pose, time) {
    const shell = tower.design === 0 ? '#4c5a57' : tower.design === 1 ? '#61523f' : '#4e6072';
    const trim = tower.design === 0 ? '#88948a' : tower.design === 1 ? '#b38c59' : '#91a8bd';
    const core = tower.disabled ? '#78d4aa' : '#ed765b';
    pose.feet.forEach((foot, i) => {
      const hipX = foot.rootX, kneeX = (hipX + foot.x) * .5 + Math.sin(pose.phase + i) * 8, kneeY = (48 + foot.y) * .5;
      ctx.strokeStyle = '#091113'; ctx.lineWidth = 22; ctx.lineCap = 'square'; ctx.beginPath(); ctx.moveTo(hipX, 42); ctx.lineTo(kneeX, kneeY); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.strokeStyle = shell; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(hipX, 42); ctx.lineTo(kneeX, kneeY); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.fillStyle = '#1b2528'; ctx.fillRect(kneeX - 9, kneeY - 9, 18, 18); ctx.fillStyle = trim; ctx.fillRect(kneeX - 4, kneeY - 4, 8, 8);
      if (foot.y > 146) { ctx.fillStyle = '#d75f5050'; ctx.beginPath(); ctx.ellipse(foot.x, CHASE_BIKE_Y, 42, 24, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#060c0e88'; ctx.beginPath(); ctx.ellipse(foot.x + 3, foot.y + 9, 32, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#101719'; ctx.fillRect(foot.x - 24, foot.y - 17, 48, 34); ctx.fillStyle = shell; ctx.fillRect(foot.x - 19, foot.y - 16, 38, 27);
      ctx.fillStyle = trim; ctx.fillRect(foot.x - 11, foot.y - 11, 4, 15); ctx.fillRect(foot.x + 8, foot.y - 11, 4, 15);
      if (foot.planted) { ctx.fillStyle = core; ctx.fillRect(foot.x - 5, foot.y + 10, 10, 3); }
    });
    const bx = pose.bodyX;
    ctx.fillStyle = '#080e10b0'; ctx.beginPath(); ctx.ellipse(bx + 5, 28, 211, 61, 0, 0, Math.PI * 2); ctx.fill();
    if (tower.design === 0) {
      ctx.fillStyle = '#111a1d'; ctx.beginPath(); ctx.moveTo(bx - 214, 6); ctx.lineTo(bx - 180, -24); ctx.lineTo(bx - 83, -33); ctx.lineTo(bx + 153, -29); ctx.lineTo(bx + 211, -3); ctx.lineTo(bx + 183, 58); ctx.lineTo(bx - 189, 61); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shell; ctx.beginPath(); ctx.moveTo(bx - 199, 4); ctx.lineTo(bx - 168, -17); ctx.lineTo(bx - 77, -26); ctx.lineTo(bx + 148, -22); ctx.lineTo(bx + 192, 1); ctx.lineTo(bx + 169, 49); ctx.lineTo(bx - 172, 52); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#243033'; ctx.fillRect(bx - 54, 2, 111, 31); ctx.fillStyle = core; ctx.fillRect(bx - 24, 11, 51, 7); ctx.fillStyle = trim; ctx.fillRect(bx - 154, 8, 4, 27); ctx.fillRect(bx + 137, 5, 4, 29);
    } else if (tower.design === 1) {
      ctx.fillStyle = '#101719'; ctx.fillRect(bx - 218, -16, 436, 78); ctx.fillStyle = shell; ctx.fillRect(bx - 204, -8, 408, 58);
      ctx.fillStyle = '#1c2629'; ctx.fillRect(bx - 169, 0, 338, 29); ctx.fillStyle = trim; ctx.fillRect(bx - 113, 7, 216, 4);
      ctx.fillStyle = core; ctx.fillRect(bx - 177, 37, 19, 6); ctx.fillRect(bx + 158, 37, 19, 6);
      for (let i = 0; i < 9; i++) { ctx.fillStyle = '#bc985f'; ctx.fillRect(bx - 79 + i * 19, 43, 9, 4); }
    } else if (tower.design === 2) {
      ctx.fillStyle = '#101719'; ctx.beginPath(); ctx.moveTo(bx - 181, 45); ctx.lineTo(bx - 156, -22); ctx.lineTo(bx - 47, -36); ctx.lineTo(bx + 121, -24); ctx.lineTo(bx + 216, 7); ctx.lineTo(bx + 151, 54); ctx.lineTo(bx - 133, 57); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shell; ctx.beginPath(); ctx.moveTo(bx - 167, 38); ctx.lineTo(bx - 143, -16); ctx.lineTo(bx - 42, -28); ctx.lineTo(bx + 112, -17); ctx.lineTo(bx + 194, 8); ctx.lineTo(bx + 137, 45); ctx.lineTo(bx - 124, 48); ctx.closePath(); ctx.fill();
      ctx.fillStyle = core; ctx.fillRect(bx + 74, 5, 67, 6); ctx.fillStyle = trim; ctx.fillRect(bx - 89, 6, 84, 3);
    } else if (tower.design === 3) {
      ctx.fillStyle=shell;ctx.beginPath();ctx.moveTo(bx-208,28);ctx.lineTo(bx-174,-22);ctx.lineTo(bx+142,-22);ctx.lineTo(bx+213,15);ctx.lineTo(bx+168,53);ctx.lineTo(bx-177,53);ctx.closePath();ctx.fill();
      ctx.fillStyle='#263236';ctx.fillRect(bx-91,-7,182,30);ctx.fillStyle=core;ctx.fillRect(bx-60,2,120,8);ctx.fillStyle=trim;ctx.fillRect(bx-190,17,37,5);ctx.fillRect(bx+151,14,35,5);
      ctx.strokeStyle=trim;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(bx-126,-16);ctx.lineTo(bx-156,-43);ctx.moveTo(bx+126,-16);ctx.lineTo(bx+159,-43);ctx.stroke();
    } else {
      ctx.fillStyle=shell;ctx.fillRect(bx-213,-10,426,64);ctx.fillStyle='#263033';ctx.fillRect(bx-168,-23,336,42);ctx.fillStyle=core;ctx.fillRect(bx-122,-9,244,7);
      for(let i=0;i<8;i++){ctx.fillStyle=i%2?trim:'#242d2b';ctx.fillRect(bx-177+i*50,30,29,14);}
    }
    ctx.fillStyle = '#11191b'; ctx.fillRect(bx - 138, 52, 276, 20); ctx.fillStyle = shell; ctx.fillRect(bx - 119, 56, 238, 10);
    ctx.fillStyle = '#aeb7a4'; ctx.fillRect(bx - 50, 59, 100, 2);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = Math.sin(time * 2 + i + tower.phase) > .25 ? core : '#714b41'; ctx.fillRect(bx - 126 + i * 31, 70, 5, 3); }
  }

  function drawChaseBike(x, y, time) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(chaser.steer * .13); ctx.scale(1.55, 1.55);
    const rider = drawBike(0, 0, 0, chaseSpeed, time, 'chase'); if(!rider.integrated)drawPerson(rider.x, rider.y, 0, time, true, true); ctx.restore();
    if (chaseSpeed > 165) { ctx.fillStyle = '#b88c58'; ctx.globalAlpha = .56; ctx.fillRect(x - 10, y + 25 + (time * 18) % 9, 2, 2); ctx.fillRect(x + 6, y + 29 + (time * 12) % 8, 2, 2); ctx.globalAlpha = 1; }
  }

  function drawGrappleView(time) {
    const tower = active(), aim = grappleMeter(time), pose = aim.pose;
    ctx.fillStyle = '#10171a'; ctx.fillRect(0, 0, W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, 190); sky.addColorStop(0, '#202b30'); sky.addColorStop(1, '#11191d'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 190);
    drawAtmosphere(time, 'grapple');
    for (let i = 0; i < 7; i++) {
      const w = 45 + i % 3 * 25, h = 70 + i * 13, x = ((i * 89 - chaseProgress * .14) % 650 + 650) % 650 - 82;
      ctx.fillStyle = i % 2 ? '#202a2d' : '#293333'; ctx.beginPath(); ctx.moveTo(x, 190); ctx.lineTo(x + 3, 190 - h + 18); ctx.lineTo(x + w * .25, 190 - h + 4); ctx.lineTo(x + w * .32, 190 - h + 17); ctx.lineTo(x + w, 190 - h + 26); ctx.lineTo(x + w, 190); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#82634a'; for (let j = 0; j < 3; j++) if ((i + j) % 3 === 0) ctx.fillRect(x + 9 + j * 13, 190 - h + 35 + j * 14, 4, 5);
    }
    ctx.fillStyle = '#262e2c'; ctx.beginPath(); ctx.moveTo(135, 0); ctx.lineTo(345, 0); ctx.lineTo(476, H); ctx.lineTo(4, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#66705c66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(135, 0); ctx.lineTo(64, H); ctx.moveTo(345, 0); ctx.lineTo(416, H); ctx.stroke();
    for (let y = 23; y < H; y += 27) { const row = (y + chaseProgress * .16) % H; ctx.strokeStyle = '#90805b26'; ctx.beginPath(); ctx.moveTo(180 - row * .35, row); ctx.lineTo(300 + row * .35, row); ctx.stroke(); }
    const targetX = W * .5 + (pose.target.x - chaser.x) * .52 + Math.sin(pose.phase) * 14;
    const targetY = 93 + (pose.target.y - CHASE_BIKE_Y) * .32;
    // Reuse the mounted survivor atlas in the grapple camera as well.
    ctx.save();ctx.translate(W*.5,244);ctx.scale(1.55,1.55);
    const rider=drawBike(0,0,0,chaseSpeed,time,'chase');
    if(!rider.integrated)drawPerson(rider.x,rider.y,0,time,true,true);
    ctx.restore();
    // The hanging leg fills the forward view; the reticle and timing bar follow its motion.
    ctx.strokeStyle = '#0b1214'; ctx.lineWidth = 31; ctx.beginPath(); ctx.moveTo(targetX + 17, -20); ctx.lineTo(targetX - 10, 48); ctx.lineTo(targetX, targetY + 2); ctx.stroke();
    ctx.strokeStyle = tower.design === 1 ? '#756044' : tower.design === 2 ? '#586d80' : '#5b6962'; ctx.lineWidth = 21; ctx.beginPath(); ctx.moveTo(targetX + 17, -20); ctx.lineTo(targetX - 10, 48); ctx.lineTo(targetX, targetY + 2); ctx.stroke();
    ctx.fillStyle = '#141b1e'; ctx.fillRect(targetX - 24, targetY - 8, 48, 18); ctx.fillStyle = '#8a8e80'; ctx.fillRect(targetX - 18, targetY - 7, 36, 4);
    ctx.strokeStyle = aim.stable ? '#a4f1bd' : '#e1ac67'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(targetX, targetY, 11 + Math.sin(time * 18) * 2, 0, Math.PI * 2); ctx.stroke();
    const barX = 74, barY = 147, barW = 332;
    ctx.fillStyle = '#10191beF'; ctx.fillRect(barX - 9, barY - 24, barW + 18, 48); ctx.strokeStyle = '#65766d'; ctx.strokeRect(barX - 8.5, barY - 23.5, barW + 17, 47);
    ctx.fillStyle = '#667064'; ctx.textAlign = 'center'; ctx.font = '6px monospace'; ctx.fillText('CLIQUE QUANDO O RETÍCULO CRUZAR A FAIXA VERDE', W / 2, barY - 12);
    ctx.fillStyle = '#35433f'; ctx.fillRect(barX, barY, barW, 6);
    const bandW = 33, targetBarX = barX + aim.target * barW;
    ctx.fillStyle = aim.stable ? '#9be6b5' : '#578d73'; ctx.fillRect(targetBarX - bandW / 2, barY - 3, bandW, 12);
    const needleX = barX + aim.needle * barW; ctx.fillStyle = '#f1d18b'; ctx.fillRect(needleX - 2, barY - 8, 4, 22);
    ctx.fillStyle = '#e4e9dc'; ctx.textAlign = 'left'; ctx.fillText('MIRA', barX, barY + 20); ctx.textAlign = 'right'; ctx.fillText('RAPEL', barX + barW, barY + 20);
    panel(11, 10, 145, 27, '#101a1deF', '#667a6e'); ctx.fillStyle = '#a6b5a5'; ctx.textAlign = 'left'; ctx.fillText(`ALVO · NÓ 0${activeTower + 1}`, 18, 27);
  }

  let climbBackgroundCache=null,climbBackgroundCacheWidth=0,climbBackgroundCacheHeight=0;
  function drawClimbBackground(time) {
    if(!climbBackgroundCache||climbBackgroundCacheWidth!==W||climbBackgroundCacheHeight!==H){
      climbBackgroundCache=document.createElement('canvas');climbBackgroundCache.width=W;climbBackgroundCache.height=H;
      climbBackgroundCacheWidth=W;climbBackgroundCacheHeight=H;
      const bg=climbBackgroundCache.getContext('2d');
      const wallShade=bg.createLinearGradient(0,0,0,H);wallShade.addColorStop(0,'#1b2b2c');wallShade.addColorStop(1,'#111c1e');
      bg.fillStyle=wallShade;bg.fillRect(0,0,W,H);
      bg.strokeStyle='#263638';bg.lineWidth=1;for(let y=48;y<H;y+=48){bg.beginPath();bg.moveTo(0,y);bg.lineTo(W,y);bg.stroke();}
      bg.fillStyle='#263638';bg.fillRect(32,20,416,226);bg.fillStyle='#101a1d';bg.fillRect(44,28,390,211);bg.fillStyle='#2b393b';bg.fillRect(52,35,376,197);
      for(let i=0;i<18;i++){const wx=60+(i*47)%355,wy=46+(i*61)%169;bg.fillStyle=i%4===0?'#9c7850':'#435b58';bg.fillRect(wx,wy,5,9);bg.fillStyle='#182326';bg.fillRect(wx+1,wy+10,3,3);}
      bg.strokeStyle='#121e21';bg.lineWidth=15;bg.beginPath();bg.moveTo(36,243);bg.lineTo(122,22);bg.moveTo(444,243);bg.lineTo(357,22);bg.moveTo(34,65);bg.lineTo(446,65);bg.moveTo(34,202);bg.lineTo(446,202);bg.stroke();
      bg.strokeStyle='#526560';bg.lineWidth=2;bg.beginPath();bg.moveTo(39,237);bg.lineTo(125,27);bg.moveTo(441,237);bg.lineTo(354,27);bg.moveTo(38,59);bg.lineTo(442,59);bg.moveTo(38,196);bg.lineTo(442,196);bg.stroke();
      for(let x=42;x<448;x+=40){bg.fillStyle='#364644';bg.fillRect(x,25,4,218);bg.fillStyle='#647568';bg.fillRect(x+1,28,1,210);}
      for(let y=44;y<240;y+=40){bg.fillStyle='#354442';bg.fillRect(36,y,408,4);bg.fillStyle='#596658';bg.fillRect(39,y,402,1);}
      bg.strokeStyle='#46605c';bg.lineWidth=1;for(let r=26;r<108;r+=13){bg.beginPath();bg.arc(238,126,r,0,Math.PI*2);bg.stroke();}
      for(let x=72;x<430;x+=71){bg.fillStyle='#172222';bg.fillRect(x,21,7,230);bg.fillStyle='#668171';bg.fillRect(x+3,21,1,230);}
      bg.fillStyle='#1a2627';bg.fillRect(0,246,W,24);bg.fillStyle='#88907c';bg.fillRect(0,245,W,2);
      bg.fillStyle='#82907a';[[91,214,8,31],[165,183,8,31],[236,152,8,31],[309,121,8,31],[384,90,8,31]].forEach(([x,y,w,h])=>{bg.fillRect(x,y,2,h);bg.fillRect(x+w,y,2,h);for(let k=0;k<h;k+=7)bg.fillRect(x,y+k,w+2,2);});
      bg.fillStyle='#101d20';bg.fillRect(404,47,56,31);bg.fillStyle='#485b52';bg.fillRect(407,50,50,24);bg.fillStyle='#8ce0b6';bg.fillRect(415,55,34,4);bg.fillStyle='#172321';bg.fillRect(416,62,32,7);bg.fillStyle='#cee9c5';bg.fillRect(429,64,6,3);
    }
    ctx.drawImage(climbBackgroundCache,0,0,W,H);
    // Only moving parts are drawn each frame.
    for(let x=72;x<430;x+=71){const lightY=(time*34+x*2)%208+24;ctx.fillStyle='#8ad2b4';ctx.fillRect(x+1,lightY,4,3);}
    platforms.forEach((p,i)=>{ctx.fillStyle='#121d20';ctx.fillRect(p.x,p.y,p.w,9);ctx.fillStyle=i===climbCheckpoint?'#82d5ae':'#758171';ctx.fillRect(p.x,p.y,p.w,3);ctx.fillStyle='#33413e';ctx.fillRect(p.x+5,p.y+5,p.w-10,3);ctx.fillStyle=i===climbCheckpoint?'#b8e3b1':'#c7a46b';ctx.fillRect(p.x+8,p.y-7,5,4);ctx.fillRect(p.x+p.w-14,p.y-7,5,4);});
    const beamX=66+((time*(activeTower>=3?105:78))%354);ctx.fillStyle='#e7795b';ctx.globalAlpha=.24+.22*Math.sin(time*8);ctx.fillRect(beamX,179,35,3);ctx.fillRect(430-((time*54)%300),118,27,3);ctx.globalAlpha=1;
    drawDrone(110+Math.sin(time*.8)*115,137+Math.sin(time*1.6)*13,time);
  }
  function drawDrone(x, y, time) {
    ctx.fillStyle = '#0b1416'; ctx.fillRect(x - 12, y - 6, 25, 13);
    ctx.fillStyle = '#a35548'; ctx.fillRect(x - 8, y - 3, 16, 6);
    ctx.fillStyle = '#e38261'; ctx.fillRect(x - 3, y - 1, 6, 2);
    ctx.fillStyle = '#b27356'; ctx.fillRect(x - 16, y - 9, 7, 2); ctx.fillRect(x + 9, y - 9, 7, 2);
    ctx.fillStyle = '#c17c58'; ctx.fillRect(x - 15, y + 7, 5, 2); ctx.fillRect(x + 10, y + 7, 5, 2);
    ctx.fillStyle = Math.sin(time * 6) > 0 ? '#efbd73' : '#7d534b'; ctx.fillRect(x - 2, y + 5, 4, 3);
  }
  function drawClimber(time, dt) {
    if(state==='hack'){drawWorld(time,dt);drawHack(time);return;}
    ctx.fillStyle = '#0e181a'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(32, -10); ctx.transform(1, .10, -.12, .90, 0, 0);
    const shakePhase=climbTime%10,shaking=shakePhase>6.2&&shakePhase<8.1;
    if(shaking)ctx.translate(Math.sin(climbTime*27)*5,Math.sin(climbTime*31)*2);
    drawClimbBackground(time);
    // Small side-on character with animated legs and a cable pack.
    const blink = !checkpointReturn&&climber.invulnerable > 0 && Math.floor(time * 14) % 2;
    if (!blink) {
      const feet=climber.feet,angle=climber.spriteAngle??Math.PI/2;
      const gait=applyReturnPose(climber,angle,climber.grounded?climber.gait:null);
      if(!drawSurvivorSprite(Math.round(climber.x),Math.round(feet)-5,angle,gait)){
      const x = Math.round(climber.x), y = Math.round(feet - 20);
      const step = climber.grounded ? Math.sin(time * 10) * 2 : -2;
      ctx.fillStyle = '#0d1719'; ctx.fillRect(x - 7, y - 1, 15, 21);
      ctx.fillStyle = '#705641'; ctx.fillRect(x + 5, y + 4, 5, 10); ctx.fillStyle = '#c2a071'; ctx.fillRect(x + 7, y + 6, 2, 3);
      ctx.fillStyle = '#314541'; ctx.fillRect(x - 5, y + 4, 11, 11);
      ctx.fillStyle = '#60766a'; ctx.fillRect(x - 5, y + 6, 2, 6); ctx.fillRect(x + 3, y + 5, 2, 4);
      ctx.fillStyle = '#d18d61'; ctx.fillRect(x - 3, y - 5, 8, 8);
      ctx.fillStyle = '#d9c18e'; ctx.fillRect(x - 4, y - 8, 10, 4); ctx.fillRect(x - 2, y - 10, 6, 2);
      ctx.fillStyle = '#7658a6'; ctx.fillRect(x + 3, y - 4, 3, 2);
      ctx.fillStyle = '#252522'; ctx.fillRect(x - 5, y + 14 + step, 4, 6); ctx.fillRect(x + 1, y + 14 - step, 4, 6);
      ctx.fillStyle = '#a4825e'; ctx.fillRect(x - 6, y + 19 + step, 5, 2); ctx.fillRect(x + 1, y + 19 - step, 5, 2);
      ctx.fillStyle = '#a77be4'; ctx.fillRect(x - 9, y + 7, 3, 2); ctx.fillRect(x + 7, y + 5, 3, 2);
      }
    }
    ctx.restore(); drawAtmosphere(time, 'climb');
    drawClimbHud(time);
  }
  function drawClimbHud(time) {
    panel(11, 10, 177, 48, '#101a1deF', '#667a6e');
    ctx.textAlign = 'left'; ctx.fillStyle = '#a6b5a5'; ctx.font = '6px monospace'; ctx.fillText(`ESCALADA  ·  NÓ 0${activeTower + 1}`, 19, 22);
    ctx.fillStyle = '#d5b071'; ctx.fillText('INTEGRIDADE', 19, 37);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < climbLives ? '#df8d66' : '#3a4140'; ctx.fillRect(70 + i * 14, 30, 10, 7); }
    ctx.fillStyle='#a6b5a5';ctx.fillText('PEGADA',19,51);ctx.fillStyle='#263331';ctx.fillRect(70,46,102,6);
    ctx.fillStyle=climbGrip<28?'#df8d66':'#82d5ae';ctx.fillRect(71,47,100*Math.max(0,climbGrip)/100,4);
    panel(W - 161, 10, 150, 24, '#101a1deF', '#667a6e');
    ctx.fillStyle = '#a6b5a5'; ctx.textAlign = 'right'; ctx.fillText('A/D AVANÇA · W SOBE', W - 19, 20);ctx.fillText('ESPAÇO SEGURA',W-19,29);
    if (state !== 'hack') {
      ctx.fillStyle = '#b5c2aa'; ctx.textAlign = 'center'; ctx.font = '6px monospace';
      const phase=climbTime%10,isShaking=phase>6.2&&phase<8.1;
      ctx.fillText(isShaking?'O COLOSSO ESTÁ SACUDINDO — SEGURE ESPAÇO!':'SOLTE EM UM APOIO PARA RECUPERAR A PEGADA', W / 2, H - 8);
      if (climber.feet < 108 && climber.x > 390) hint('E  ACESSAR TERMINAL', W / 2, 39, time);
    }
  }
  function drawHack(time) {
    ctx.fillStyle = '#071012ce'; ctx.fillRect(0, 0, W, H);
    panel(67, 43, 346, 205, '#142324', '#81d4b1');
    ctx.textAlign = 'center'; ctx.fillStyle = '#9ddfc1'; ctx.font = '8px monospace';
    if (hackMode === 'question'||hackMode==='upgrade') {
      const reward=hackMode==='upgrade';
      const question=reward?{q:'Escolha uma melhoria para continuar',a:upgradeOptions}:networkQuestions[activeTower][hackStep];
      ctx.fillText(reward?'COMPUTADOR CONCLUIDO - MELHORIA':'DIAGNOSTICO - REDES', W / 2, 62);
      ctx.fillStyle = '#82968b'; ctx.font = '6px monospace'; ctx.fillText(reward?`MELHORIAS ACUMULAM - COMPUTADOR ${network+1}/5`:`PERGUNTA ${hackStep + 1} / 3`, W / 2, 76);
      ctx.fillStyle = '#e3e9db'; ctx.font = '7px monospace'; ctx.fillText(question.q, W / 2, 96);
      question.a.forEach((answer, i) => {
        const x = 107, y = 108 + i * 27;
        ctx.fillStyle = '#202f2e'; ctx.fillRect(x, y, 266, 24); ctx.strokeStyle = '#536d62'; ctx.strokeRect(x + .5, y + .5, 265, 23);
        ctx.fillStyle = '#d5b576'; ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.fillText(`${i + 1}.`, x + 10, y + 16);
        ctx.fillStyle = '#dce5d8'; ctx.font = reward?'6px monospace':'7px monospace';ctx.fillText(answer, x + 29, y + 16);
      });
      ctx.fillStyle = '#8fa59b'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('ESCOLHA COM 1, 2, 3, 4 OU TOQUE', W / 2, 216);
    }
    ctx.fillStyle = '#e2a070'; ctx.fillText(`TEMPO  ${Math.max(0, hackTime).toFixed(1)}s`, W / 2, 238);
  }
  function updateClimb(dt) {
    climbTime += dt; hazardCooldown = Math.max(0, hazardCooldown - dt); climber.invulnerable = Math.max(0, climber.invulnerable - dt);
    if (state === 'hack') {
      if(climber.gait)updateFootGait(climber.gait,0,climber.spriteAngle,82,dt,spriteAtlas.survivor.walk);
      if(hackMode==='upgrade')return;
      hackTime -= dt/characterHealth.status().focus;
      if (hackTime <= 0) { state = 'drive'; keys.clear(); hackStep = 0; hackTime = 90; setToast('TEMPO ESGOTADO — REINICIE O DIAGNÓSTICO'); }
      return;
    }
    const left = keys.has('a') || keys.has('arrowleft'); const right = keys.has('d') || keys.has('arrowright');
    const up=keys.has('w')||keys.has('arrowup'),down=keys.has('s')||keys.has('arrowdown'),gripping=keys.has(' ');
    const shakePhase=climbTime%10,shaking=shakePhase>6.2&&shakePhase<8.1;
    const previousX=climber.x;
    climber.x += ((right ? 1 : 0) - (left ? 1 : 0)) * 82 * dt;
    climber.x = Math.max(8, Math.min(470, climber.x));
    const movedX=climber.x-previousX;
    if(movedX)climber.spriteAngle=movedX<0?-Math.PI/2:Math.PI/2;
    const previousFeet = climber.feet;
    const wasGrounded=climber.grounded,gripBefore=climbGrip;
    if(!wasGrounded&&gripping&&climbGrip>0){
      climbGrip=Math.max(0,climbGrip-(shaking?34:15)*dt);
      if(climbGrip>0){climber.vy=0;climber.feet+=(down?58:up?-58:0)*dt;}
      else{climber.vy+=480*dt;climber.feet+=climber.vy*dt;}
    }else{climber.vy+=480*dt;climber.feet+=climber.vy*dt;}
    if(gripBefore>0&&climbGrip===0)setToast('SEM FÔLEGO — SOLTE EM UM APOIO PARA RECUPERAR A PEGADA.');
    climber.feet=Math.max(52,Math.min(255,climber.feet));climber.grounded = false;
    platforms.forEach((p,i) => { if(p.baseX===undefined)p.baseX=p.x; p.x=activeTower===4?p.baseX+Math.sin(climbTime*1.35+i*.8)*17:p.baseX; });
    if(activeTower===3) climber.x += Math.sin(climbTime*2.7)*13*dt;
    for (let i = platforms.length - 1; i >= 0; i--) {
      const p = platforms[i];
      if (climber.vy >= 0 && previousFeet <= p.y && climber.feet >= p.y && climber.x > p.x - 4 && climber.x < p.x + p.w + 4) {
        climber.feet = p.y; climber.vy = 0; climber.grounded = true;
        if (i > climbCheckpoint) { climbCheckpoint = i; setToast('PONTO DE APOIO ALCANÇADO', 1); }
        break;
      }
    }
    if (climber.feet > 248) {
      climber.feet = 245; climber.vy = 0; climber.grounded = true;
    }
    if(climber.grounded)climbGrip=Math.min(100,climbGrip+(left||right||up||down?12:24)*dt);
    updateFootGait(climber.gait??=createFootGait(),climber.grounded?Math.abs(movedX):0,climber.spriteAngle,82,dt,spriteAtlas.survivor.walk);
    // The giant's periodic convulsion can throw the climber unless they keep a grip.
    const shakeHit=shaking&&!gripping&&hazardCooldown<=0;
    // A moving security drone and timed electric sweeps add pressure along the climb.
    const droneX = 110 + Math.sin(climbTime * .8) * 115, droneY = 137 + Math.sin(climbTime * 1.6) * 13;
    const beamX = 66 + ((climbTime * (activeTower >= 3 ? 105 : 78)) % 354), secondBeam = 430 - ((climbTime * (activeTower === 4 ? 82 : 54)) % 300);
    const droneHit = Math.abs(climber.x - droneX) < 14 && Math.abs((climber.feet - 12) - droneY) < 12;
    const beamHit = Math.abs(climber.feet - 179) < 8 && climber.x > beamX - 4 && climber.x < beamX + 40;
    const beamHit2 = Math.abs(climber.feet - 118) < 8 && climber.x > secondBeam - 4 && climber.x < secondBeam + 32;
    if ((droneHit || beamHit || beamHit2 || shakeHit) && hazardCooldown <= 0 && climber.invulnerable <= 0) {
      climbLives--; woundCharacter('impact',1);climber.invulnerable = 1.05; hazardCooldown = shakeHit?1.9:.75;
      if (climbLives <= 0) {
        climbLives = 2;
        climbCheckpoint = Math.max(0, climbCheckpoint - 1);
        setToast('SOBRECARGA — RECUO AO APOIO ANTERIOR');
        beginCheckpointReturn(climber,()=>{
          const platform=platforms[climbCheckpoint];
          climber.x=Math.max(25,platform.x+12);
          climber.feet=platform.y;
          climber.vy=0;
          climber.grounded=true;
          climber.gait=null;
          return climber;
        });
      }
      else setToast(shakeHit?'O COLOSSO SACUDIU VOCÊ — SEGURE ESPAÇO NO PRÓXIMO TREMOR':'DESCARGA ELÉTRICA — CUIDADO COM OS ARCOS');
    }
  }

  const RETURN_DEPARTURE=.26,RETURN_ARRIVAL=.9;
  function beginCheckpointReturn(actor,arrive,recoil=4) {
    checkpointReturn={actor,arrive,recoil,elapsed:0};
  }
  function advanceCheckpointReturn(dt) {
    const returning=checkpointReturn;
    returning.elapsed+=dt;
    if(returning.arrive&&returning.elapsed>=RETURN_DEPARTURE){
      returning.actor=returning.arrive();
      returning.arrive=null;
    }
    if(returning.elapsed>=RETURN_DEPARTURE+RETURN_ARRIVAL)checkpointReturn=null;
  }
  function applyReturnPose(actor,angle,gait) {
    const returning=checkpointReturn;
    if(returning?.actor!==actor)return gait;
    const progress=returning.arrive?returning.elapsed/RETURN_DEPARTURE:
      (returning.elapsed-RETURN_DEPARTURE)/RETURN_ARRIVAL;
    const eased=progress*progress*(3-2*progress);
    const walk=spriteAtlas.survivor.walk,{directions}=walk;
    const frameCount=walk.runFrames?.length??walk.frameCount;
    const heading=gait?.heading??footHeading(angle,directions);
    if(returning.arrive){
      ctx.globalAlpha*=1-eased;
      ctx.translate(0,returning.recoil*eased);
      const step=Math.floor(progress*3);
      if(step===0)return gait;
      const frames=footPlaybackFrames(walk,gait?.running,heading);
      const count=frames?.length??walk.frameCount;
      const period=gait?.pingPong?2*(count-1):count;
      const phase=(Math.floor(gait?.phase??0)+step)%period;
      return {heading,phase:footAtlasFrame(phase,walk,gait?.running,gait?.pingPong,heading),stage:'stop'};
    }
    // Finish the fade before either of the passing poses where the arms swing.
    const fade=Math.min(1,progress*(frameCount+2)/2);
    ctx.globalAlpha*=fade*fade*(3-2*fade);
    // Play both steps, then hold the first contact pose before settling.
    const phase=progress*(frameCount+2),step=Math.floor(phase);
    const approach=Math.max(0,1-phase/frameCount);
    if(approach>0){
      const headingAngle=heading*2*Math.PI/directions;
      const distance=8*approach*(.5+.5*approach);
      ctx.translate(-Math.sin(headingAngle)*distance,Math.cos(headingAngle)*distance);
    }
    if(step>frameCount)return {heading,stage:'idle'};
    const index=step%frameCount;
    return {heading,phase:walk.runFrames?.[index]??index,stage:'stop'};
  }
  function returnToRoad(message,recoil) {
    beginCheckpointReturn(explorer,()=>{
      state='drive';
      player.x=worldReturn.x;player.y=worldReturn.y;player.gait=null;
      camera.x=player.x;camera.y=player.y;
      mounted=false;
      keys.clear();
      setToast(message);
      updateObjective();
      return player;
    },recoil);
  }

  function finishFrame(time, dt) {
    gameScene=gameSceneViewport(state);W=gameScene.width;H=gameScene.height;
    ctx.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,0,0);
    ctx.fillStyle='#101819';ctx.fillRect(0,0,DISPLAY_W,DISPLAY_H);
    ctx.translate(gameScene.x,gameScene.y);
    ctx.fillStyle = '#090f12'; ctx.fillRect(0, 0, W, H);
    if (state === 'title') { drawWorld(time, dt); }
    else if (state === 'drive') drawWorld(time, dt);
    else if (state === 'explore') {
      if(shelterView==='observe'&&inSafeShelter()){
        const saved={x:camera.x,y:camera.y},door=buildingDoor(exploreBuilding);
        camera.x=door.x;camera.y=door.y;drawWorld(time,0);Object.assign(camera,saved);
        ctx.fillStyle='#020809';ctx.fillRect(0,0,W,45);ctx.fillRect(0,H-132,W,132);
      }else drawExplore(time);
    }
    else if (state === 'chase') drawChase(time);
    else if (state === 'grapple') drawGrappleView(time);
    else if (state === 'climb' || state === 'hack') drawClimber(time, dt);
    else if (state === 'ending') drawEnding(time);
    drawSurvival();
    drawShelter();
    if(state==='drive'||state==='explore'){
      ctx.save();
      ctx.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,0,0);
      mossRenderer.drawGlitch(ctx,DISPLAY_W,DISPLAY_H,time,mossEcology.glitch);
      ctx.restore();
    }
    if(state==='chase'||state==='grapple'){drawSurvivalHud();drawBikeDashboard(time);}
    if (flash > 0) { ctx.fillStyle = `rgba(203,255,224,${Math.min(.55, flash * .45)})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 1.4); }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toast.classList.remove('visible'); }
    syncGrappleButton();
    if(ignition.active)ignition.draw(time);
    else syncBikeServiceCursor();
  }
  function drawEnding(time) {
    drawIsoMap(time); drawIsoDepthObjects(time, false);
    drawAtmosphere(time, 'world');
    ctx.fillStyle = '#081013c9'; ctx.fillRect(0, 0, W, H);
    panel(63, 48, 354, 177, '#142325', '#8ad7b5');
    ctx.fillStyle = '#8ad7b5'; ctx.textAlign = 'center'; ctx.font = '8px monospace'; ctx.fillText('SINAL RESTABELECIDO', W / 2, 77);
    ctx.fillStyle = '#e8e9d8'; ctx.font = '23px monospace'; ctx.fillText('VOCÊ NÃO ESTÁ SÓ.', W / 2, 116);
    ctx.fillStyle = '#b4c4b5'; ctx.font = '8px monospace'; ctx.fillText('Uma frequência cruza a noite. Depois outra.', W / 2, 145);
    ctx.fillText('O mundo começa a responder.', W / 2, 160);
    ctx.fillStyle = '#d8b477'; ctx.fillText('ENTER  ·  VOLTAR AO INÍCIO', W / 2, 197);
    for (let i = 0; i < 16; i++) { const x = 125 + i * 15; ctx.fillStyle = Math.sin(time * 2 + i) > 0 ? '#72cbaa' : '#263635'; ctx.fillRect(x, 176 + Math.sin(time * 3 + i) * 3, 5, 2); }
  }

  function frame(now) {
    gameScene=gameSceneViewport(state);W=gameScene.width;H=gameScene.height;
    if(lastTime)gameDisplay.sampleFrame(now-lastTime);
    if (!lastTime) lastTime = now;
    const dt = Math.min(.045, (now - lastTime) / 1000); lastTime = now;
    gameTime += dt;
    updateSurvival(dt);
    updateShelter(dt);
    updateCharacterCare(dt);
    if(bikeDragging&&(!keys.has('g')||state!=='drive'||mounted||bikeInspectOpen||ignition.active||checkpointReturn||distance(player,bike)>44))stopBikeDrag();
    if(fuel<=0||bikeLife<=0)bikeEngineRunning=false;
    if(ignition.active)ignition.update(dt);
    updateBikeGearbox(dt,state==='chase'||state==='grapple'?chaseSpeed:bike.speed,bikeControlsMounted()&&keys.has('w'));
    if (bikeInspectOpen && (state !== 'drive' || mounted || distance(player,bike)>43)) {bikeInspectOpen=false;bikeService=null;}
    if (bikeInspectOpen) updateBikeService(dt);
    if(state!=='title'&&state!=='ending')updateBikeCondition(dt,state==='chase'||state==='grapple'?chaseSpeed:state==='drive'&&mounted?bike.speed:0);
    if(state!=='title'&&state!=='ending')updateBikeFuelTrail(dt);
    updateMachines(gameTime);
    const metabolism=characterHealth.status().metabolism;
    hunger = Math.max(0, hunger - dt * .035*metabolism); thirst = Math.max(0, thirst - dt * .06*metabolism);
    if(checkpointReturn){
      advanceCheckpointReturn(dt);
      finishFrame(gameTime,dt);
      requestAnimationFrame(frame);
      return;
    }
    if (state === 'explore') {
      updateFootMovement(explorer,dt,moveExplorer);
      explorer.invulnerable = Math.max(0, explorer.invulnerable - dt);
    }
    if (state === 'drive' && !mounted) {
      const beforeX=bike.x,beforeY=bike.y;
      if(playerKnockdown<=0)updateFootMovement(player,dt,bikeDragging?moveDraggedBike:moveWorldEntity,projectFacing,bikeDragging ? .75*characterHealth.status().dexterity : 1);
      bikeDragSpeed=dt>0?Math.hypot(bike.x-beforeX,bike.y-beforeY)/dt:0;
      updateObjective();
    } else if (state === 'drive' && mounted) {
      const throttle = keys.has('w') || keys.has('arrowup');
      const reverse = keys.has('s') || keys.has('arrowdown');
      const turn = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      bike.steering=updateBikeSteering(bike.steering,turn,dt);
      // Ease the rider into the turn independently of the handlebars.
      bike.bank+=(bike.steering-bike.bank)*(1-Math.exp(-8*dt));
      const previousSpeed=bike.speed;
      const motorFactor = (.38 + .62 * bikeParts.motor / 100)*(.65+.35*Math.min(hunger,thirst)/100)*(.62+.38*Math.min(bikeParts.frontTire,bikeParts.rearTire)/100);
      if (reverse&&bike.speed>0) bike.speed=Math.max(0,bike.speed-300*dt);
      else if (throttle&&!reverse&&bike.speed<0) bike.speed=Math.min(0,bike.speed+300*dt);
      else if (throttle&&!reverse&&bikeEngineRunning&&fuel>0&&bikeLife>0&&bikeShiftCooldown<=0) bike.speed+=bikeGearAcceleration()*motorFactor*dt;
      else if (reverse&&!throttle&&bikeLife>0&&bikeEngineRunning&&fuel>0) bike.speed-=105*motorFactor*dt;
      else bike.speed = Math.sign(bike.speed) * Math.max(0, Math.abs(bike.speed) - (bikeEngineRunning?75:48) * dt);
      const maxForward=bikeGearSpeedLimit();
      // Engine braking brings a downshift into its new range without teleporting speed.
      if(bike.speed>maxForward)bike.speed=Math.max(maxForward,bike.speed-dt*260);
      bike.speed=Math.max(-48,bike.speed);
      if ((throttle || reverse) && Math.abs(bike.speed)>0) fuel=Math.max(0,fuel-dt/(1+upgrades.fuel*.25)*(reverse?.045:.11)*(1+(100-bikeParts.motor)/38));
      const travelSpeed=(previousSpeed+bike.speed)/2;
      const steeringDelta=bikeTurnDelta(travelSpeed,bike.steering,bikeParts.handlebar,Math.min(bikeParts.frontTire,bikeParts.rearTire),dt)*characterHealth.status().handling;
      const turnDelta=bikeWorldTurnDelta(bike.angle,steeringDelta);
      const travelAngle=bike.angle+turnDelta/2;
      bike.angle+=turnDelta;
      const previousX=bike.x,previousY=bike.y,impactSpeed=travelSpeed;
      const rideX=Math.sin(travelAngle)*travelSpeed*dt,rideY=-Math.cos(travelAngle)*travelSpeed*dt;
      const collisionRadius=12*ACTOR_VISUAL_SCALE;
      const clearance=obstacleClearance(bike.x,bike.y,collisionRadius);
      // Short steps keep fast motorcycles from crossing thin fences.
      const rideSteps=Math.max(1,Math.ceil(Math.hypot(rideX,rideY)/3));
      for(let step=0;step<rideSteps;step++)moveWorldEntity(bike,rideX/rideSteps,rideY/rideSteps,collisionRadius);
      const blockedFraction=Math.min(1,Math.hypot(rideX-(bike.x-previousX),rideY-(bike.y-previousY))/Math.max(.001,Math.hypot(rideX,rideY)));
      const tower = active();
      if (blockedFraction>.15) {
        applyMountedImpact(impactSpeed*Math.sqrt(blockedFraction),'IMPACTO NO OBSTACULO',clearance);
        bike.speed *= blockedFraction>.85?.38:.8;
      }
      if (bikeLife <= 0) { bike.speed=0; if (mounted) { mounted=false; player.x=bike.x+Math.cos(bike.angle)*18; player.y=bike.y+Math.sin(bike.angle)*18; setToast('MOTO QUEBROU — USE E AO LADO DELA COM UM KIT.'); } }
      const riddenDistance=Math.hypot(bike.x-previousX,bike.y-previousY);
      totalRide += riddenDistance; bike.wheel += Math.sign(travelSpeed)*riddenDistance/9;
      player.x = bike.x; player.y = bike.y; player.angle = bike.angle;
      updateObjective();
    } else if (state === 'chase' || state === 'grapple') updateChase(dt);
    else if (state === 'climb' || state === 'hack') updateClimb(dt);
    if(state==='drive'||state==='explore')mossEcology.update(dt,{
      light:worldLighting(gameTime),target:state==='explore'?worldReturn:player,
      room:state==='explore'?exploreBuilding:-1,roomTarget:state==='explore'&&!isShelter(exploreBuilding)?explorer:null,moveRoom:moveExplorer,sounds:creatureSounds()
    });
    updateCreatureCombat();
    finishFrame(gameTime, dt);
    requestAnimationFrame(frame);
  }

  setObjective('Sobreviva à noite: encontre abrigo, água e comida.');
  const gameDisplay=initGameDisplay({canvas,onResize:resolution=>{
    if(canvas.width===resolution.width&&canvas.height===resolution.height)return;
    canvas.width=resolution.width;canvas.height=resolution.height;
    RENDER_SCALE=canvas.width/DISPLAY_W;
    urbanSpriteCache.clear();urbanSpriteBytes=0;
    ctx.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,0,0);ctx.imageSmoothingEnabled=false;
    bikeBlendLayer.width=Math.ceil(160*RENDER_SCALE);bikeBlendLayer.height=Math.ceil(160*RENDER_SCALE);
    bikeOcclusionLayer.width=bikeBlendLayer.width;bikeOcclusionLayer.height=bikeBlendLayer.height;
    bikeBlendStamp='';
  }});
  requestAnimationFrame(frame);
})();
