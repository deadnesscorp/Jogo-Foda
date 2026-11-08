(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let RENDER_SCALE = 2;
  const DISPLAY_W=640,DISPLAY_H=360;
  const ACTOR_VISUAL_SCALE=.75;
  let W=DISPLAY_W,H=DISPLAY_H,gameScene=gameSceneViewport('title');
  const ignition=createBikeIgnition({canvas,ctx,width:W,height:H,
    onStart:()=>{keys.clear();bike.speed=0;if(fuel<=0||bikeLife<=0){dismount();setToast('VERIFIQUE O COMBUSTÍVEL E O ESTADO DA MOTO.');return;}bikeEngineRunning=true;bikeRpm=1000;setToast('MOTO LIGADA — BOA VIAGEM!');updateObjective();},
    onCancel:()=>{keys.clear();dismount();}
  });
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  const spriteAtlas=SURVIVOR_ATLAS_128;
  const bikeSpriteSheets=['bike'].map(kind=>{
    const image=new Image();image.src='assets/sprites-128/'+spriteAtlas[kind].file;return image;
  });
  const survivorSpriteSheet=new Image();survivorSpriteSheet.src='assets/sprites-128/'+spriteAtlas.survivor.file;
  const survivorWalkSpriteSheet=new Image();survivorWalkSpriteSheet.src='assets/sprites-128/'+spriteAtlas.survivor.walk.file;
  function bikeSpriteSource(direction,riding=false){return bikeSpriteSheets[riding?1:0];}
  function bikeSpriteMetadata(riding=false){return spriteAtlas[riding?'mounted':'bike'];}
  let mountedSpritesBuilt=false;
  function bikeSpritesReady(){return mountedSpritesBuilt;}
  const BIKE_DIRECTION_COUNT=128,BIKE_SPRITE_COLUMNS=16;
  const BIKE_DIRECTION_STEP=Math.PI*2/BIKE_DIRECTION_COUNT;
  const VISUAL_DIRECTION_STRIDE=8,VISUAL_DIRECTION_STEP=BIKE_DIRECTION_STEP*VISUAL_DIRECTION_STRIDE;
  const bikeSpriteBounds=spriteAtlas.bike.frames;
  const bikeVisualFacings = new Map();
  const bikeBlendLayer=document.createElement('canvas');
  bikeBlendLayer.width=160*RENDER_SCALE;bikeBlendLayer.height=160*RENDER_SCALE;
  const bikeBlendContext=bikeBlendLayer.getContext('2d');
  const bikeOcclusionLayer=document.createElement('canvas');
  bikeOcclusionLayer.width=bikeBlendLayer.width;bikeOcclusionLayer.height=bikeBlendLayer.height;
  const bikeOcclusionContext=bikeOcclusionLayer.getContext('2d');
  let bikeBlendStamp='';
  function bikeMotion(speed,time,riding,phase=0) {
    const travel=Math.min(1,Math.abs(speed)/110);
    const idle=riding&&bikeEngineRunning ? .08 : 0;
    return {compression:1-(Math.sin(phase)*.008*travel+Math.sin(time*32)*idle*.012),
      lean:Math.max(-.055,Math.min(.055,bike.steering*.035))*travel};
  }
  function smoothBikeFacing(angle, time, view) {
    let facing = bikeVisualFacings.get(view);
    if (!facing || time < facing.time || time - facing.time > .25) {
      facing = {angle, time, direction: bikeSpritePose(angle, 0, time).direction};
      bikeVisualFacings.set(view, facing);
      return facing;
    }
    const dt = Math.max(0, time - facing.time);
    const difference = Math.atan2(Math.sin(angle - facing.angle), Math.cos(angle - facing.angle));
    facing.angle += difference * (1 - Math.exp(-22 * dt));
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
    if(mountedSpritesBuilt||!bikeSpriteSheets.every(image=>image.complete&&image.naturalWidth>0)||!survivorSpriteSheet.complete||!survivorSpriteSheet.naturalWidth)return;
    // Assemble the same motorcycle and survivor used on foot. A fixed-size
    // seated torso replaces the independently drawn riders in the old atlas.
    const cell=128,unit=2,originX=cell/2,originY=90;
    const sheet=document.createElement('canvas');sheet.width=cell*16;sheet.height=cell;
    const painter=sheet.getContext('2d');painter.imageSmoothingEnabled=false;
    const metadata={file:'composed-at-runtime',width:sheet.width,height:sheet.height,pixelsPerUnit:unit,frames:[],wheelContacts:[],headlightAnchors:[],riderAnchors:[]};
    const person=spriteAtlas.survivor;
    const colors=person.palette;
    for(let direction=0;direction<128;direction+=VISUAL_DIRECTION_STRIDE) {
      const angle=direction*BIKE_DIRECTION_STEP,fx=Math.sin(angle),fy=-Math.cos(angle)*.5,rx=Math.cos(angle),ry=Math.sin(angle)*.5;
      // Compose at canonical size; the finished bike and rider shrink together.
      const ground=bikeGroundLayout(0,0,50,direction,false,1);
      const [lampX,lampY]=spriteAtlas.bike.headlightAnchors[direction],baseScale=ground.width/ground.sw;
      const lamp={x:ground.left+lampX*baseScale,y:ground.top+lampY*baseScale};
      const col=direction/VISUAL_DIRECTION_STRIDE*cell,row=0;
      const hip={x:-fx*6,y:5-fy*6-14};
      painter.save();painter.beginPath();painter.rect(col,row,cell,cell);painter.clip();
      painter.translate(col+originX,row+originY);painter.scale(unit,unit);
      painter.lineCap='round';painter.lineJoin='round';
      // Bent legs sit behind the tank, with boots resting beside the engine.
      const drawLeg=side=>{
        const knee={x:hip.x+fx*3+rx*side*5,y:hip.y+6+ry*side*5};
        const foot={x:rx*side*6,y:1+ry*side*6};
        painter.strokeStyle='#111a1b';painter.lineWidth=4;
        painter.beginPath();painter.moveTo(hip.x+rx*side*2,hip.y+ry*side*2);painter.lineTo(knee.x,knee.y);painter.lineTo(foot.x,foot.y);painter.stroke();
        painter.strokeStyle=colors.trousers;painter.lineWidth=2.4;painter.stroke();
        if(side===-1){painter.fillStyle=colors.patch;painter.fillRect(knee.x-1.1,knee.y-1,2.2,2);}
        painter.strokeStyle=colors.boot;painter.lineWidth=3;
        painter.beginPath();painter.moveTo(foot.x,foot.y);painter.lineTo(foot.x+fx*2,foot.y+fy*2);painter.stroke();
      };
      const nearSide=ry>=0?1:-1;drawLeg(-nearSide);
      painter.drawImage(bikeSpriteSheets[0],ground.sx,ground.sy,ground.sw,ground.sh,ground.left,ground.top,ground.width,ground.height);
      drawLeg(nearSide);
      const [sx,sy,sw,sh]=person.frames[direction],torso=Math.floor(sh*.66);
      const height=25,scale=height/torso,width=sw*scale*.86,left=hip.x-width/2,top=hip.y-height;
      painter.save();painter.translate(left,top);
      painter.transform(1,0,-fx*.10,1,fx*height*.10,0);
      // Keep the helmet/backpack and jacket, excluding the standing arms/legs.
      painter.beginPath();painter.moveTo(0,0);painter.lineTo(width,0);painter.lineTo(width,height*.48);
      painter.lineTo(width*.77,height*.66);painter.lineTo(width*.74,height);painter.lineTo(width*.26,height);
      painter.lineTo(width*.23,height*.66);painter.lineTo(0,height*.48);painter.closePath();painter.clip();
      painter.drawImage(survivorSpriteSheet,sx,sy,sw,torso,0,0,width,height);painter.restore();
      // Gloves follow the grips while the shoulders remain behind the tank.
      for(const side of [-1,1]) {
        const shoulder={x:hip.x+fx*1.5+rx*side*3,y:hip.y-13+ry*side*3};
        const hand={x:lamp.x-fx*2+rx*side*6,y:lamp.y-4+ry*side*6};
        painter.strokeStyle='#111a1b';painter.lineWidth=4.8;
        painter.beginPath();painter.moveTo(shoulder.x,shoulder.y);painter.lineTo(shoulder.x+fx*3,shoulder.y+6);painter.lineTo(hand.x,hand.y);painter.stroke();
        painter.strokeStyle=colors.sleeve;painter.lineWidth=3.2;painter.stroke();
        if(side===-1){
          painter.strokeStyle=colors.tape;painter.lineWidth=3.4;
          const ex=shoulder.x+fx*3,ey=shoulder.y+6;
          painter.beginPath();painter.moveTo(ex+(hand.x-ex)*.55,ey+(hand.y-ey)*.55);painter.lineTo(ex+(hand.x-ex)*.68,ey+(hand.y-ey)*.68);painter.stroke();
        }
        painter.fillStyle=colors.glove;painter.fillRect(hand.x-1.3,hand.y-1.1,2.6,2.2);
      }
      painter.restore();
      metadata.frames[direction]=[col,row,cell,cell];
      const point=([x,y])=>[originX+x*unit,originY+y*unit];
      metadata.wheelContacts[direction]=ground.contacts.map(point);
      metadata.headlightAnchors[direction]=point([lamp.x,lamp.y]);
      metadata.riderAnchors[direction]={hip:point([hip.x,hip.y]),height:height*unit,rearOffset:6*unit};
    }
    for(let direction=0;direction<128;direction++){
      const pose=Math.round(direction/VISUAL_DIRECTION_STRIDE)*VISUAL_DIRECTION_STRIDE%128;
      for(const field of ['frames','wheelContacts','headlightAnchors','riderAnchors'])metadata[field][direction]=metadata[field][pose];
    }
    bikeSpriteSheets[1]=sheet;spriteAtlas.mounted=metadata;mountedSpritesBuilt=true;
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
  function worldLighting(time) {
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
    return {hour, day: Math.floor(totalHours / 24) + 1, daylight, night, moon, elevation,
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
  function bikeLightPose(view = 'world') {
    if (!bikeSpritesReady()) return null;
    const chase = view === 'chase';
    const center = chase ? {x:0,y:0} : projectPoint(bike.x,bike.y);
    const facing = bikeVisualFacings.get(chase ? 'chase' : 'world');
    const angle = facing ? facing.angle : chase ? 0 : projectFacing(bike.angle);
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
    const castX=light.shadowX*light.shadowLength/24,castY=light.shadowY*light.shadowLength/24;
    target.save();target.translate(x,y+5);target.scale(ACTOR_VISUAL_SCALE,ACTOR_VISUAL_SCALE);target.transform(1,0,-castX,-castY,0,0);
    target.fillStyle='#03060b';target.beginPath();target.arc(0,-height+3,3,0,Math.PI*2);target.fill();
    target.fillRect(-4,-height+6,8,height-11);target.fillRect(-6,-height+8,12,3);
    target.fillRect(-4,-5,3,5);target.fillRect(1,-5,3,5);target.restore();
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
    const lamp = light.night>.02 && (view==='chase' || mounted) && bikeEngineRunning && bikeLife>0 && fuel>0 ? bikeLightPose(view) : null;
    if(lamp) {
      const fx=Math.sin(lamp.angle),fy=-Math.cos(lamp.angle),sx=lamp.x,sy=lamp.y;
      const ex=sx+fx*104,ey=sy+fy*104;
      const target=headlightContext;
      target.clearRect(0,0,headlightLayer.width,headlightLayer.height);
      const beam=target.createLinearGradient(sx,sy,ex,ey);
      beam.addColorStop(0,'rgba(0,0,0,.94)');beam.addColorStop(.6,'rgba(0,0,0,.65)');beam.addColorStop(1,'rgba(0,0,0,0)');
      target.fillStyle=beam;
      target.beginPath();target.moveTo(sx-fy*3,sy+fx*3);target.lineTo(ex-fy*33,ey+fx*33);target.lineTo(ex+fy*33,ey-fx*33);target.lineTo(sx+fy*3,sy-fx*3);target.closePath();target.fill();
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
      nightContext.drawImage(headlightLayer,0,0);
      nightContext.globalCompositeOperation='source-over';
    }
    ctx.drawImage(nightLayer,0,0);
    if(lamp && lamp.visibility>0) {
      const radius=5*ACTOR_VISUAL_SCALE;
      const glow=ctx.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,radius);
      glow.addColorStop(0,'rgba(255,226,158,'+(.7*light.night*lamp.visibility)+')');glow.addColorStop(1,'rgba(255,210,128,0)');
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
  const networkCount = document.querySelector('#network-count');
  const networkProgress = document.querySelector('#network-progress');
  const keys = new Set();
  const world = { w: 5600, h: 3600 };
  const towers = [
    { x: 650, y: 360, baseX: 650, baseY: 360, name: 'NÓ AURORA', disabled: false, design: 0, rangeX: 104, rangeY: 36, pace: .20, phase: .2 },
    { x: 1460, y: 1110, baseX: 1460, baseY: 1110, name: 'NÓ VÉSPERA', disabled: false, design: 1, rangeX: 70, rangeY: 88, pace: .16, phase: 1.8 },
    { x: 2450, y: 340, baseX: 2450, baseY: 340, name: 'NÓ MERIDIANO', disabled: false, design: 2, rangeX: 118, rangeY: 53, pace: .24, phase: 3.2 },
    { x: 3350, y: 1700, baseX: 3350, baseY: 1700, name: 'NÓ TUFÃO', disabled: false, design: 3, rangeX: 88, rangeY: 70, pace: .30, phase: .8 },
    { x: 4300, y: 2400, baseX: 4300, baseY: 2400, name: 'NÓ CENTOPEIA', disabled: false, design: 4, rangeX: 42, rangeY: 34, pace: .13, phase: 2.4 }
  ];
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
  let fenceSegments = [[60, 635, 130, 0], [1030, 360, 100, Math.PI / 2], [1390, 900, 160, 0]];
  function rebuildFenceHitboxes() {
    fenceHitboxes.length = 0;
    fenceSegments.forEach(([fx, fy, length, angle]) => {
    const addRect = (x,y,w,h) => fenceHitboxes.push([fx,fy,x,y,w,h,angle]);
    for (let i = 0; i < length; i += 14) {
      if ((i / 14) % 4 === 2) continue;
      addRect(i,0,3,15);
    }
    for (let i = 0; i < length; i += 28) {
      if ((i / 28) % 3 === 1) continue;
      const span = (i / 28) % 2 ? 17 : 24;
      addRect(i,3,span,2); addRect(i+3,11,span-4,2);
    }
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
  let hackStep = 0;
  let hackTime = 0;
  let hackMode = 'question', connectSelected = -1, cableCutAnswer = 0, repairAnswer = 1, pulseTarget = 1, pulseClock = 0, sequenceIndex = 0;
  const wireSequence = [0, 2, 1, 2];
  const cableConnected = [false, false, false];
  const cableMatch = [0, 1, 2];
  const cableColors = ['#e3b64f', '#72b8ae', '#df7257'];
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
  let fuel = 68, hunger = 100, thirst = 100, exploreBuilding = -1, exploreStep = 0;
  let repairKits = 1, bikeLife = 100, bikeWearClock = 0, bikeCrashCooldown = 0, bikeParts = { motor: 100, handlebar: 100, frontTire: 100, rearTire: 100 };
  let bikeInspectOpen = false;
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
      ['Circuito de óleo obstruído', 'Desobstruir circuito', 'route', 'Ligue os trechos: gire cada conexão até formar uma linha.'],
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
  let supplies = buildings.map((b, i) => ({ x: b[0] + b[2] * .8, y: b[1] + b[3] * 1.2, type: i === 10 ? 'fuel' : ['ration','water','can'][i % 3], found: false, available: i === 10 ? Math.random() < .28 : Math.random() < .24 }));
  const worldReturn = { x: 0, y: 0 };
  const explorer = { x: 240, y: 145, hp: 3, invulnerable: 0 };
  const interiorHazards = [{ x: 190, y: 115, kind: 'weak' }, { x: 310, y: 180, kind: 'ceiling' }, { x: 115, y: 205, kind: 'gap' }];
  const interiorWalls = [{x:142,y:111,w:10,h:77},{x:152,y:111,w:58,h:10},{x:222,y:142,w:10,h:58},{x:232,y:142,w:55,h:10},{x:176,y:196,w:65,h:10},{x:250,y:180,w:10,h:37}];
  let walkCycle = 0;
  const camera = { x: 180, y: 3300 };
  const bike = { x: 180, y: 3300, angle: .87, speed: 0, wheel: 0, steering:0 };
  let bikeEngineRunning=false;
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
      { q: 'Qual protocolo aprende rotas entre redes?', a: ['BGP', 'USB', 'JPEG'], ok: 0 },
      { q: 'O que faz a máscara de sub-rede?', a: ['Define a parte de rede do IP', 'Criptografa o monitor', 'Aumenta o sinal Wi-Fi'], ok: 0 },
      { q: 'Qual endereço identifica uma rede local privada?', a: ['192.168.1.10', '8.8.8.8', '1.1.1.1'], ok: 0 }
    ],
    [
      { q: 'Qual protocolo evita loops em switches?', a: ['STP', 'FTP', 'NTP'], ok: 0 },
      { q: 'O que é o gateway padrão?', a: ['Rota de saída para outras redes', 'Senha do Wi-Fi', 'Cabo de fibra'], ok: 0 },
      { q: 'Qual equipamento encaminha quadros pela MAC?', a: ['Switch', 'Roteador de áudio', 'Modem USB'], ok: 0 }
    ]
  ];
  const platforms = [
    { x: 0, w: 82, y: 245 }, { x: 80, w: 73, y: 214 }, { x: 153, w: 70, y: 183 },
    { x: 225, w: 70, y: 152 }, { x: 295, w: 72, y: 121 }, { x: 368, w: 112, y: 90 }
  ];
  const rubble = [];
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
    roads = [[180, 3300]];
    let roadY = 3300;
    const intervals = 17, span = world.w - 360;
    for (let i = 1; i <= intervals; i++) {
      roadY = Math.max(300, Math.min(world.h - 300, roadY + (Math.random() - .5) * 930));
      roads.push([Math.round(180 + span * i / intervals), Math.round(roadY)]);
    }
    branchRoads = [];
    const branchCount = 5 + Math.floor(Math.random() * 4);
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
    for (let i = 0; i < 58; i++) {
      const gasStation = i === 10;
      const w = gasStation ? 100 : 42 + Math.random() * 78;
      const h = gasStation ? 78 : 36 + Math.random() * 68;
      let building = null;
      for (let attempt = 0; attempt < 100 && !building; attempt++) {
        const segment = 1 + Math.floor(Math.random() * (roads.length - 2));
        const [ax, ay] = roads[segment], [bx, by] = roads[segment + 1];
        const ratio = .2 + Math.random() * .6, dx = bx - ax, dy = by - ay;
        const length = Math.hypot(dx, dy) || 1, offset = (Math.random() < .5 ? -1 : 1) * (190 + Math.random() * 330);
        const cx = ax + dx * ratio - dy / length * offset, cy = ay + dy * ratio + dx / length * offset;
        const x = Math.round(cx - w * .825), y = Math.round(cy - h * .825);
        if (x < 70 || y < 70 || x + w * 1.65 > world.w - 70 || y + h * 1.65 > world.h - 70) continue;
        const onBranch = branchRoads.some(path => path.some((point,j)=>j>0&&pointSegmentDistance(cx,cy,path[j-1][0],path[j-1][1],point[0],point[1])<150));
        if (pointSegmentDistance(cx, cy, ax, ay, bx, by) < 150 || onBranch || Math.hypot(cx - bike.x, cy - bike.y) < 260) continue;
        const overlaps = buildings.some(([ox, oy, ow, oh]) => x < ox + ow * 1.65 + 48 && x + w * 1.65 + 48 > ox && y < oy + oh * 1.65 + 48 && y + h * 1.65 + 48 > oy);
        if (!overlaps) building = [x, y, Math.round(w), Math.round(h)];
      }
      if (!building) building = [220 + i * 91 % (world.w - 420), 180 + i * 137 % (world.h - 360), Math.round(w), Math.round(h)];
      buildings.push(building);
    }
    supplies = buildings.map((b, i) => ({ x: b[0] + b[2] * .8, y: b[1] + b[3] * 1.2, type: i === 10 ? 'fuel' : Math.random() < .18 ? 'toolkit' : ['ration','water','can'][i % 3], found: false, available: i === 10 ? Math.random() < .28 : Math.random() < .24 }));
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
  }

  function active() { return towers.find(t => !t.disabled) || null; }
  function updateMachines(time) {
    for (const t of towers) {
      if (t.disabled) continue;
      const phase = time * t.pace + t.phase;
      const sway = Math.sin(phase * .57 + .6) * t.rangeY * .22;
      if (t.design === 0) { t.x = t.baseX + Math.sin(phase) * t.rangeX + Math.sin(phase * .43) * 24; t.y = t.baseY + Math.sin(phase * .5) * t.rangeY + sway; }
      else if (t.design === 1) { t.x = t.baseX + Math.cos(phase) * t.rangeX + Math.sin(phase * .38) * 30; t.y = t.baseY + Math.sin(phase) * t.rangeY + sway; }
      else if (t.design === 2) { t.x = t.baseX + Math.sin(phase) * t.rangeX + Math.sin(phase * 2) * t.rangeY + sway; }
      else if (t.design === 3) { t.x = t.baseX + Math.sin(phase * 1.7) * t.rangeX + Math.sin(phase * .6) * 25; t.y = t.baseY + Math.cos(phase * 1.35) * t.rangeY + sway * 1.8; }
      else { t.x = t.baseX + Math.sin(phase * .46) * t.rangeX; t.y = t.baseY + Math.sin(phase * .92) * t.rangeY + Math.sin(phase * .23) * 17; }
    }
  }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function worldBlocked(x, y, radius) {
    for (const [bx, by, bw, bh] of buildings) {
      const left = bx, top = by, right = bx + bw * 1.65, bottom = by + bh * 1.65;
      const nearestX = Math.max(left, Math.min(x, right)), nearestY = Math.max(top, Math.min(y, bottom));
      if ((x - nearestX) ** 2 + (y - nearestY) ** 2 < radius * radius) return true;
    }
    for (const [fx,fy,rx,ry,rw,rh,angle] of fenceHitboxes) {
      const dx=x-fx,dy=y-fy,localX=dx*Math.cos(angle)+dy*Math.sin(angle),localY=-dx*Math.sin(angle)+dy*Math.cos(angle);
      const nearestX=Math.max(rx,Math.min(localX,rx+rw)),nearestY=Math.max(ry,Math.min(localY,ry+rh));
      if ((localX-nearestX)**2+(localY-nearestY)**2<radius*radius) return true;
    }
    return false;
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
  function moveWorldEntity(entity, dx, dy, radius) {
    const targetX = Math.max(18, Math.min(world.w - 18, entity.x + dx));
    const targetY = Math.max(18, Math.min(world.h - 18, entity.y + dy));
    if (!worldBlocked(targetX, targetY, radius)) { entity.x = targetX; entity.y = targetY; return true; }
    let moved = false;
    if (!worldBlocked(targetX, entity.y, radius)) { entity.x = targetX; moved = true; }
    if (!worldBlocked(entity.x, targetY, radius)) { entity.y = targetY; moved = true; }
    return moved;
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
      const anchor = [1000,2100,3200,4300,5400][i], roadAnchor=sampleRoadAtX(anchor);
      let point = null;
      for (let attempt = 0; attempt < 180 && !point; attempt++) {
        const candidate = { x: anchor, y: Math.max(120, Math.min(world.h - 120, roadAnchor.y + (Math.random() - .5) * 180)) };
        if (distance(candidate, bike) < 650 || placed.some(p => distance(candidate, p) < 850) || worldBlocked(candidate.x, candidate.y, 48)) continue;
        point = candidate;
      }
      if (!point) {
        point = { x: roadAnchor.x, y: roadAnchor.y };
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
  function setToast(message, seconds = 2.2) {
    toast.textContent = message; toast.classList.add('visible'); toastTimer = seconds;
  }
  function setObjective(text, index = activeTower) {
    if(objectiveNode.textContent!==text)objectiveNode.textContent=text;
    const number=String(Math.max(1,Math.min(index+1,towers.length))).padStart(2,'0');
    if(objectiveIndex.textContent!==number)objectiveIndex.textContent=number;
    const count=`${network} / ${towers.length}`,progress=`${network/towers.length*100}%`;
    if(networkCount.textContent!==count)networkCount.textContent=count;
    if(networkProgress.style.width!==progress)networkProgress.style.width=progress;
  }
  function updateObjective() {
    const count=`${network} / ${towers.length}`;
    if(networkCount.textContent!==count)networkCount.textContent=count;
    networkProgress.style.width = `${network / towers.length * 100}%`;
    const tower = active();
    if (!tower) return;
    if (state === 'explore') setObjective('Vasculhe as ruínas por água, comida e combustível.', activeTower);
    else if (state === 'chase') setObjective('Mantenha o ritmo sob a máquina e desvie dos destroços.', activeTower);
    else if (state === 'grapple') setObjective('Mira por trás da moto: clique quando o retículo cruzar a perna.', activeTower);
    else if (state === 'climb') setObjective(`Escale ${tower.name} e alcance o terminal.`, activeTower);
    else if (state === 'hack') setObjective(hackMode === 'question' ? 'Responda sobre como conectar redes no terminal.' : hackMode === 'connect' ? 'Ligue WAN, LAN e backbone às portas corretas.' : hackMode === 'cut' ? 'Corte o cabo identificado pelo sensor de curto.' : hackMode === 'repair' ? 'Emende o cabo rompido para restaurar o enlace.' : hackMode === 'sequence' ? 'Reproduza a sequência de relés.' : 'Sincronize o pulso do terminal.', activeTower);
    else if (mounted && distance(player, tower) > 205) setObjective(`Use a moto para alcançar ${tower.name}.`, activeTower);
    else if (mounted) setObjective(`Aproxime-se de ${tower.name} para iniciar a perseguição.`, activeTower);
    else if (!approachedByBike) setObjective(`Volte à moto e alcance ${tower.name}.`, activeTower);
    else setObjective('A máquina está em movimento. Volte à moto para alcançá-la.', activeTower);
  }
  function startGame() {
    startHour = Math.floor(Math.random() * 1440) / 60;
    bikeVisualFacings.clear();
    state = 'drive'; gameTime = 0; lastTime = 0; activeTower = 0; network = 0;
    bike.x = 180; bike.y = 3300; bike.angle = .87; bike.speed = 0; bike.wheel = 0; bike.steering=0;
    bikeGear=1;bikeShiftCooldown=0;bikeShiftFlash=0;bikeRpm=0;bikeEngineRunning=false;
    player.x = bike.x; player.y = bike.y; player.angle = bike.angle; player.hp = 3;
    mounted = false; approachedByBike = false; totalRide = 0; fuel = 68; hunger = 100; thirst = 100;
    player.x=bike.x+Math.cos(bike.angle)*19;player.y=bike.y+Math.sin(bike.angle)*19;
    repairKits = 1; bikeLife = 100; bikeWearClock = 0; bikeCrashCooldown = 0; Object.keys(bikeParts).forEach(part => bikeParts[part] = 100);
    bikeInspectOpen = false;
    bikeService = null; Object.values(bikeFaults).forEach(faults => faults.fill(100));
    generateMapLayout(); camera.x = player.x; camera.y = player.y;
    supplies.forEach(s => { s.found = false; s.available = s.type === 'fuel' ? Math.random() < .28 : Math.random() < .24; });
    towers.forEach(t => t.disabled = false);
    randomizeTowerSpawns();
    titleScreen.classList.add('dismissed'); keys.clear(); updateObjective();
    setToast('E PARA SUBIR NA MOTO E DAR A PARTIDA');
  }
  document.querySelector('#start-game').addEventListener('click', startGame);

  function dismount() {
    bike.steering=0;
    mounted = false;
    approachedByBike = false;
    player.x = bike.x + Math.cos(bike.angle) * 19;
    player.y = bike.y + Math.sin(bike.angle) * 19;
    player.angle = bike.angle;
    bike.speed = 0;
    setToast('A PÉ — A MOTO FICOU ESTACIONADA AQUI. E PARA VOLTAR'); updateObjective();
  }
  function mount() {
    if (distance(player, bike) > 43) { setToast('A MOTO ESTÁ FORA DE ALCANCE.'); return; }
    bike.steering=0;
    mounted = true; player.x = bike.x; player.y = bike.y; player.angle = bike.angle;
    keys.clear();
    if(!bikeEngineRunning) {
      ignition.open();setObjective('Encaixe a chave e gire para ligar a moto.',activeTower);
      toastTimer=0;toast.classList.remove('visible');
    } else {setToast('MOTOR JÁ LIGADO — BOA VIAGEM!');updateObjective();}
  }
  function switchOffBike() {
    if(state!=='drive'||(!mounted&&distance(player,bike)>43))return;
    if(Math.abs(bike.speed)>2){setToast('PARE A MOTO ANTES DE DESLIGAR.');return;}
    if(!bikeEngineRunning){setToast('SUBA NA MOTO PARA DAR A PARTIDA.');return;}
    bikeEngineRunning=false;bikeRpm=0;bike.speed=0;keys.clear();
    setToast('MOTOR DESLIGADO. DESÇA E SUBA PARA DAR A PARTIDA.');
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
    const stable = Math.abs(needle - target) < .07 && pose.target.planted && chaseLag < 130;
    return { needle, target, stable, pose };
  }
  function attemptGrapple() {
    if (state !== 'grapple') return;
    const aim = grappleMeter(gameTime);
    if (aim.stable) {
      state = 'climb'; mounted = false; climbTime = 0; climbLives = 3; climbCheckpoint = 0; hazardCooldown = 1;
      climber.x = 31; climber.feet = 245; climber.vy = 0; climber.grounded = true; climber.invulnerable = 0;
      grappleAvailable = false; flash = .65; setToast('RAPEL PRESO — ESCALADA INICIADA'); updateObjective();
    } else {
      state = 'chase'; chaseLives = Math.max(1, chaseLives - 1); chaseLag = Math.min(360, chaseLag + 82); grappleAvailable = false;
      updateObjective(); setToast('O GANCHO RASPOU A PERNA — MANTENHA A MOTO ESTÁVEL E TENTE DE NOVO', 2.4);
    }
  }
  grappleButton.addEventListener('click', () => {
    if (state === 'chase') startGrappleAim();
    else if (state === 'grapple') attemptGrapple();
  });
  canvas.addEventListener('pointerdown', event => { if(ignition.active){ignition.down(event);return;}if (bikeInspectOpen) handleBikeInspectPointer(event); else if(handleBikeDashboardPointer(event))return;else if (state === 'grapple') attemptGrapple(); else if (state === 'hack') handleHackPointer(event); });
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
    if (state === 'chase') { startGrappleAim(); return; }
    if (state === 'grapple') { attemptGrapple(); return; }
    if (state === 'drive') {
      if (mounted) { dismount(); return; }
      const building = nearbyEntrance(player.x, player.y);
      if (building >= 0) { state = 'explore'; exploreBuilding = building; exploreStep = 0; worldReturn.x = player.x; worldReturn.y = player.y; explorer.x = 83; explorer.y = 198; explorer.hp = 3; keys.clear(); setToast(building === 10 ? 'POSTO ABANDONADO — VASCULHE A MESA' : 'ENTRE NA RUÍNA — PROCURE SUPRIMENTOS NA MESA'); updateObjective(); return; }
      if (nearbyBuilding(player.x, player.y) >= 0) { setToast('PROCURE A PORTA DA CONSTRUÇÃO PARA ENTRAR.'); return; }
      if (distance(player, bike) < 43) {
        if (bikeLife <= 0 && repairKits <= 0) { setToast('MOTO AVARIADA — PROCURE UM KIT DE REPARO'); return; }
        if (bikeLife < 75 || Object.values(bikeParts).some(value => value < 70)) {
          bikeInspectOpen = true; bikeInspectTab = 'Info'; keys.clear(); return;
        }
        mount(); return;
      }
      const tower = active();
      if (tower && distance(player, tower) < 180) setToast('A MÁQUINA ESTÁ EM MOVIMENTO. ALCANCE-A DE MOTO.');
      else setToast('E  MONTAR NA MOTO ESTACIONADA.');
    } else if (state === 'explore') {
      if (Math.hypot(explorer.x - 78, explorer.y - 200) > 42) { setToast('A SAÍDA FICA NA PORTA — SIGA O MARCADOR.'); return; }
      state = 'drive'; player.x = worldReturn.x; player.y = worldReturn.y; mounted = false; keys.clear(); setToast('VOCÊ VOLTA À ESTRADA.'); updateObjective();
    } else if (state === 'climb') {
      if (climber.feet < 108 && climber.x > 390) {
        state = 'hack'; hackStep = 0; hackTime = 70; hackMode = 'question'; connectSelected = -1; cableConnected.fill(false); setToast('TERMINAL ENCONTRADO — DIAGNÓSTICO DE REDE');
      } else setToast('O TERMINAL FICA NO TOPO DA MÁQUINA.');
    }
  }
  function completeHack() {
    const tower = active();
    tower.disabled = true; network++; activeTower = towers.findIndex(t => !t.disabled); approachedByBike = false;
    flash = 1; state = active() ? 'drive' : 'ending'; mounted = false; bike.speed = 0;
    player.x = bike.x + Math.cos(bike.angle) * 20; player.y = bike.y + Math.sin(bike.angle) * 20; player.angle = bike.angle;
    setToast(active() ? `${tower.name} DESATIVADO — SINAL RESTAURADO` : 'REDE RESTAURADA — A HUMANIDADE VOLTOU A OUVIR', 4);
    if (active()) updateObjective(); else setObjective('Rede restaurada. O mundo voltou a responder.', towers.length - 1);
  }
  function beginCableChallenge() {
    hackMode = ['connect','cut','repair','sequence','timing'][activeTower]; hackStep = 0; connectSelected = -1; cableConnected.fill(false); sequenceIndex = 0; pulseClock = 0; pulseTarget = Math.floor(Math.random() * 3);
    cableCutAnswer = (activeTower + 1) % 3; repairAnswer = 1;
    setToast(hackMode === 'connect' ? 'LIGUE WAN, LAN E BACKBONE ÀS PORTAS CORRETAS' : hackMode === 'cut' ? 'ISOLE O CURTO — CORTE SOMENTE O CABO INDICADO' : hackMode === 'repair' ? 'REPARE A LINHA COM UMA EMENDA CONDUTORA' : hackMode === 'sequence' ? 'REPRODUZA A ORDEM DOS RELÉS' : 'SINCRONIZE O PULSO DO NÓ');
    updateObjective();
  }
  function resolveCablePair(port) {
    if (connectSelected < 0) { setToast('SELECIONE UM CABO À ESQUERDA PRIMEIRO.'); return; }
    if (port === cableMatch[connectSelected]) {
      cableConnected[connectSelected] = true; connectSelected = -1;
      if (cableConnected.every(Boolean)) completeHack(); else setToast('CABO CONECTADO — LIGUE OS OUTROS');
    } else { connectSelected = -1; hackTime -= 3; setToast('PORTA ERRADA — CONFIRA WAN, LAN E BACKBONE'); }
  }
  function hackInput(choice) {
    if (state !== 'hack' || choice < 0 || choice > 2) return;
    if (hackMode === 'question') {
      const question = networkQuestions[activeTower][hackStep];
      if (choice === question.ok) {
        hackStep++;
        if (hackStep >= networkQuestions[activeTower].length) beginCableChallenge();
        else setToast('RESPOSTA CERTA — PRÓXIMA PERGUNTA');
      } else { hackTime -= 4; setToast('RESPOSTA INCORRETA — TENTE OUTRA OPÇÃO', 1.2); }
    } else if (hackMode === 'connect') {
      if (connectSelected < 0) {
        if (cableConnected[choice]) { setToast('ESSE CABO JÁ ESTÁ CONECTADO.'); return; }
        connectSelected = choice; setToast('CABO SELECIONADO — ESCOLHA A PORTA CORRESPONDENTE');
      } else resolveCablePair(choice);
    } else if (hackMode === 'cut') {
      if (choice === cableCutAnswer) completeHack();
      else { hackTime -= 8; setToast('ESSE CABO ESTÁ BOM — VERIFIQUE O DIAGNÓSTICO.'); }
    } else if (hackMode === 'repair') {
      if (choice === repairAnswer) completeHack();
      else { hackTime -= 8; setToast('ESSE MATERIAL NÃO RESTABELECE A CONEXÃO.'); }
    } else if (hackMode === 'sequence') {
      if (choice === wireSequence[sequenceIndex]) { sequenceIndex++; if (sequenceIndex >= wireSequence.length) completeHack(); else setToast(`SINAL CORRETO — ${sequenceIndex}/${wireSequence.length}`); }
      else { sequenceIndex = 0; hackTime -= 6; setToast('SEQUÊNCIA ERRADA — RECOMECE A COMBINAÇÃO.'); }
    } else if (hackMode === 'timing') {
      if (choice === pulseTarget && Math.abs(Math.sin(pulseClock * 7)) > .86) completeHack();
      else { hackTime -= 3; setToast('PULSO PERDIDO — APERTE QUANDO O INDICADOR BRILHAR.'); }
    }
  }
  function handleHackPointer(event) {
    if (state !== 'hack') return;
    const {x,y}=bikeCanvasPointer(event);
    if (hackMode === 'question') {
      const choice = Math.floor((y - 108) / 32);
      if (x >= 100 && x <= 380 && choice >= 0 && choice < 3) hackInput(choice);
    } else if (hackMode === 'connect') {
      const row = Math.round((y - 125) / 35);
      if (row < 0 || row > 2) return;
      if (x < 230) {
        if (!cableConnected[row]) { connectSelected = row; setToast('CABO SELECIONADO — TOQUE NA PORTA À DIREITA'); }
      } else if (x > 250) resolveCablePair(row);
    } else {
      const row = Math.floor((x - 103) / 91);
      if (y >= 134 && y <= 208 && row >= 0 && row < 3) hackInput(row);
    }
  }

  function keyDown(e) {
    if(ignition.active&&e.key.toLowerCase()==='f'){e.preventDefault();if(!e.repeat)ignition.close(false);return;}
    if(ignition.active){ignition.key(e);return;}
    const key = e.key.toLowerCase();
    if (bikeInspectOpen && key === 'escape') { if (bikeService) bikeService = null; else bikeInspectOpen = false; return; }
    if (bikeInspectOpen && key !== 'f') {
      e.preventDefault();
      if(!bikeService&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)){keys.add(key);return;}
      if (!e.repeat && bikeService) {
        if (/^[1-8]$/.test(key)) bikeServiceAction(Number(key)-1);
        else if (['arrowleft','a','-'].includes(key)) bikeServiceAction(0);
        else if (['arrowright','d','+','='].includes(key)) bikeServiceAction(1);
        else if (['e',' ','enter'].includes(key)) bikeServiceAction(2);
      }
      return;
    }
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
    if (state === 'title') { if (key === 'enter') startGame(); return; }
    if (state === 'ending') { if (key === 'enter') { state = 'title'; titleScreen.classList.remove('dismissed'); } return; }
    if(key==='f'&&state==='drive'&&mounted&&!e.repeat){switchOffBike();return;}
    if(bikeControlsMounted()&&['r','q'].includes(key)){e.preventDefault();if(!e.repeat)shiftBikeGear(key==='r'?1:-1);return;}
    if (state === 'drive' && !mounted && key === 'f' && !e.repeat) {
      if (distance(player,bike) <= 85) { bikeInspectOpen = !bikeInspectOpen; keys.clear(); bikeInspectTab = 'Info'; bikeService = null; }
      else setToast('CHEGUE PERTO DA MOTO PARA INSPECIONÁ-LA.');
      return;
    }
    if (state === 'hack') {
      if (['1','2','3'].includes(key) && !e.repeat) hackInput(Number(key) - 1);
      return;
    }
    if (state === 'explore' && key === 'e' && !e.repeat) { interact(); return; }
    if (key === 'e' && !e.repeat) { interact(); return; }
    if (state === 'climb' && (key === ' ' || key === 'w' || key === 'arrowup') && !e.repeat) {
      if (climber.grounded || climber.feet > 235) { climber.vy = -208; climber.grounded = false; }
    }
    keys.add(key);
  }
  function keyUp(e) { keys.delete(e.key.toLowerCase()); }
  addEventListener('keydown', keyDown);
  addEventListener('keyup', keyUp);
  addEventListener('blur', () => keys.clear());

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
    roads.slice(2).filter((_,i) => i % 3 === 0).forEach(([x,y], i) => {
      const [px,py] = roads[Math.min(roads.length-1, i*3+1)], a = Math.atan2(y-py,x-px);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = '#151e20'; ctx.beginPath(); ctx.ellipse(0, 0, 11 + i % 3 * 3, 4 + i % 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#172021'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(1, -2); ctx.lineTo(5, -1); ctx.lineTo(10, -6); ctx.moveTo(-1, 0); ctx.lineTo(-7, -5); ctx.moveTo(4, -1); ctx.lineTo(7, 5); ctx.stroke();
      ctx.restore();
    });
    fenceSegments.forEach(([x,y,length,angle]) => drawFence(x,y,length,angle));
  }
  function drawFence(x, y, length, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    for (let i = 0; i < length; i += 14) { if ((i / 14) % 4 !== 2) { ctx.fillStyle = '#4d554d'; ctx.fillRect(i, 0, 3, 15); } }
    for (let i = 0; i < length; i += 28) {
      if ((i / 28) % 3 === 1) continue;
      const span = (i / 28) % 2 ? 17 : 24; ctx.fillStyle = '#765b43'; ctx.fillRect(i, 3, span, 2); ctx.fillRect(i + 3, 11, span - 4, 2);
    }
    ctx.restore();
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
    const lift = 20 + floors * 13 + h * .26;
    const roof = base.map((p, i) => ({ x: p.x, y: p.y - lift - ((index + i * 2) % 5 === 0 ? 9 + index % 3 * 3 : 0) }));
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
  function drawIsoBuilding(x, y, width, height, index, time, geometry) {
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
      ctx.globalAlpha = .16 * (1 - rise / 34); ctx.fillStyle = '#969d98';
      ctx.beginPath(); ctx.ellipse(center.x + 20 + puff * 4, center.y - lift * .4 - rise, 2 + rise * .12, 1 + rise * .08, -.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
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
  function drawIsoMap(time) {
    ctx.save();
    const camX = (camera.x - camera.y) * ISO_X, camY = (camera.x + camera.y) * ISO_Y;
    ctx.translate(W / 2 - camX, H / 2 - camY);
    ctx.transform(ISO_X, ISO_Y, -ISO_X, ISO_Y, 0, 0);
    drawGround(time);
    ctx.restore();
  }
  function drawIsoDepthObjects(time, includeActors) {
    const objects = [];
    buildings.forEach(([x,y,w,h],i)=>{
      const geometry=isoBuildingGeometry(x,y,w,h,i);
      if(isoBuildingVisible(geometry))objects.push({depth:x+y+(w+h)*.82,draw:()=>drawIsoBuilding(x,y,w,h,i,time,geometry)});
    });
    towers.forEach((tower,i)=>{
      const p=projectPoint(tower.x,tower.y);
      if(p.x>=-220&&p.x<=W+220&&p.y>=-120&&p.y<=H+240)objects.push({depth:tower.x+tower.y,draw:()=>drawIsoTower(tower,i,time)});
    });
    const tower = active();
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
    objects.sort((a, b) => a.depth - b.depth).forEach(o => o.draw());
  }

  function drawBike(x, y, angle, speed, time, view = 'world') {
    const facing = smoothBikeFacing(angle, time, view);
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
    const stamp=direction+':'+RENDER_SCALE+':'+riding;
    if(stamp!==bikeBlendStamp){
    painter.setTransform(1,0,0,1,0,0);painter.clearRect(0,0,bikeBlendLayer.width,bikeBlendLayer.height);
    painter.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,80*RENDER_SCALE,80*RENDER_SCALE);
    painter.imageSmoothingEnabled=false;
    painter.drawImage(bikeSpriteSource(direction,riding),ground.sx,ground.sy,ground.sw,ground.sh,
      ground.left-x,ground.top-y,ground.width,ground.height);
    bikeOcclusionContext.clearRect(0,0,bikeOcclusionLayer.width,bikeOcclusionLayer.height);
    for(let i=0;i<8;i++)bikeOcclusionContext.drawImage(bikeBlendLayer,0,0);
    bikeBlendStamp=stamp;
    }
    const motionDt=Math.max(0,Math.min(.05,time-(facing.motionTime??time)));
    facing.travelPhase=(facing.travelPhase||0)+Math.abs(speed)*motionDt*.16;
    facing.motionTime=time;
    const motion=bikeMotion(speed,time,riding,facing.travelPhase);facing.motion=motion;
    ctx.translate(x,y+5);ctx.transform(1,0,motion.lean,motion.compression,0,0);ctx.translate(-x,-y-5);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(bikeBlendLayer,x-80,y-80,160,160);
    ctx.restore();
    const bounce=Math.sin(time*Math.min(12,4+Math.abs(speed)/25)*Math.PI*2)*Math.min(.3,Math.abs(speed)/150);
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
  function damageBikePart(part, amount, impact = false) {
    if (impact) {
      const faults=bikeFaults[part].map((value,index)=>value>0?index:-1).filter(index=>index>=0);
      if(!faults.length)return;
      const i=faults[Math.floor(Math.random()*faults.length)];bikeFaults[part][i] = Math.max(0,bikeFaults[part][i]-amount*4);
    }
    else bikeFaults[part] = bikeFaults[part].map(value => Math.max(0,value-amount));
    bikeParts[part] = bikeFaults[part].reduce((a,b)=>a+b,0)/4;
  }
  function updateBikeCondition(dt,speed=0) {
    bikeCrashCooldown=Math.max(0,bikeCrashCooldown-dt);
    const moving=Math.abs(speed)>8;
    if(moving)bikeWearClock+=dt;
    // Roughly 1–3 percentage points per ten minutes riding, much less parked.
    const wear=dt*(moving?.002+Math.min(1,Math.abs(speed)/150)*.002:.0001);
    const rates={motor:1,handlebar:.6,frontTire:1.2,rearTire:1.3};
    Object.keys(bikeParts).forEach(part=>damageBikePart(part,wear*rates[part]));
    bikeLife=Math.max(0,bikeLife-wear*.5);
  }
  function applyBikeImpact(speed,label='IMPACTO') {
    if(bikeCrashCooldown>0||Math.abs(speed)<12)return false;
    const parts=Object.keys(bikeParts).filter(part=>bikeParts[part]>0);
    if(!parts.length)return false;
    const part=parts[Math.floor(Math.random()*parts.length)],before=bikeParts[part];
    const amount=.6+Math.min(1,Math.abs(speed)/150)*2.4;
    damageBikePart(part,amount,true);
    bikeLife=Math.max(0,bikeLife-amount*.25);bikeCrashCooldown=1.5;
    const loss=before-bikeParts[part];
    setToast(label+' · '+bikePartNames[part]+' −'+loss.toFixed(1)+'% · inspecione com F');
    return true;
  }
  function selectedBikePart() {
    return bikeInspectTab === 'Motor' ? 'motor' : bikeInspectTab === 'Guidão' ? 'handlebar' : bikeTireSelected;
  }
  function jobsForBikePart(part) { return bikeJobs[part.includes('Tire') ? 'tire' : part]; }
  function startBikeService(part, index) {
    if (!Object.hasOwn(bikeParts,part) || !Number.isInteger(index) || index<0 || index>3) return;
    const practice = bikeFaults[part][index] >= 99.5 && bikeLife >= 99.5;
    if (!practice && repairKits <= 0) { setToast('SEM KIT — PROCURE FERRAMENTAS. Peças íntegras permitem treino.'); return; }
    bikeService = {
      part, index, pulse:0, job: jobsForBikePart(part)[index], practice, clock: 0, progress: 0, mistakes: 0,
      value: 0, stable: 0, phase: 'play', message: '', selected: -1,
      sequence: Array.from({length:4},()=>Math.floor(Math.random()*4)),
      cells: [1,2,3,1].sort(()=>Math.random()-.5),
      remaining: [3,3,3,3], cure:[0,0,0,0], sandWork:[0,0,0,0], order: [2,0,3,1].sort(()=>Math.random()-.5),
      links: [2,0,3,1], done: [false,false,false,false]
    };
    if (bikeService.job[2] === 'pressure') bikeService.value = 16;
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
      repairKits--; bikeFaults[s.part][s.index] = 100;
      bikeParts[s.part] = bikeFaults[s.part].reduce((a,b)=>a+b,0)/4;
      bikeLife = Math.min(100,bikeLife+15);
    }
    s.phase = 'done'; s.message = s.practice ? 'TREINO CONCLUÍDO · nenhum kit consumido' : 'REPARO CONCLUÍDO · 1 kit usado · saúde +15%';
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
    if (!Number.isInteger(choice) || choice < 0 || choice >= (mode === 'wires' ? 8 : 4)) return;
    if (mode === 'timing') {
      if(s.clock-(s.lastHit??-1)<.4){s.message='Espere o próximo ciclo de ignição.';return;}
      if (Math.min(Math.abs(Math.sin(s.clock*2.2)),Math.abs(Math.cos(s.clock*2.2))) < .25) { s.lastHit=s.clock;s.progress++; if (s.progress === 3) completeBikeService(); }
      else bikeServiceMiss('Fora da faixa. Espere o marcador verde.');
    } else if (mode === 'sequence') {
      if(choice<2){const step=s.value>110?100:s.value>25?10:1;s.value=Math.max(0,Math.min(2200,s.value+(choice===0?-step:step)));}
      else if(s.value>=10&&s.value<=15){s.progress++;s.value=(Math.random()<.5?1:22);if(s.progress===4)completeBikeService();}
      else bikeServiceMiss('A lâmina deve passar com leve resistência: 0,10–0,15 mm.');
    } else if (mode === 'route') {
      s.cells[choice] = (s.cells[choice]+1)%4; if(s.cells.every(v=>v%2===0)) completeBikeService();
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
    if(mode==='patch') {
      const ready=s.remaining.findIndex((stage,i)=>!s.done[i]&&s.cure[i]<=0);
      const index=s.drag?.index??(s.hoverIndex>=0?s.hoverIndex:ready);
      return s.remaining[Math.max(0,index)]===3?'sandpaper':s.remaining[Math.max(0,index)]===2?'glue':'patch';
    }
    return ({clean:'brush',pressure:'pump',wires:'pliers',sequence:'gauge',route:'screwdriver',balance:'screwdriver',timing:'screwdriver',bearings:'patch',align:'wrench',torque:'wrench',bolts:'wrench'})[mode]||'wrench';
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
    if(mode==='route') {
      let flowing=true;
      s.cells.forEach((cell,i)=>{
        const x=55+i*92,cx=x+41,cy=159,open=cell%2===0;
        const supplied=flowing;flowing=flowing&&open;
        ctx.fillStyle='#0a1318';ctx.fillRect(x,128,82,69);
        ctx.strokeStyle=open?'#547c72':'#66564b';ctx.strokeRect(x+.5,128.5,81,68);
        // Main oil gallery remains visible between the rotating access ports.
        ctx.strokeStyle='#0b0e10';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(x-5,cy);ctx.lineTo(x+87,cy);ctx.stroke();
        ctx.strokeStyle='#71818a';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(x-5,cy);ctx.lineTo(x+87,cy);ctx.stroke();
        ctx.strokeStyle='#17272c';ctx.lineWidth=6;ctx.stroke();
        ctx.save();ctx.translate(cx,cy);ctx.rotate(cell*Math.PI/2);
        ctx.fillStyle='#233039';ctx.strokeStyle='#72868e';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.arc(0,0,21,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.strokeStyle='#0a1115';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(-21,0);ctx.lineTo(21,0);ctx.stroke();
        ctx.strokeStyle=supplied&&open?'#cc9b4e':'#39484c';ctx.lineWidth=4;ctx.stroke();
        if(supplied&&open)for(let j=0;j<3;j++){
          const px=-21+((s.clock*25+j*14+i*7)%42);
          ctx.fillStyle='#f5d788';ctx.fillRect(px,-1,4,2);
        }
        ctx.fillStyle='#88999e';ctx.fillRect(-2,-16,4,5);ctx.fillRect(-2,11,4,5);
        ctx.restore();
        if(!open){ctx.fillStyle='#a47546';for(let j=0;j<5;j++)ctx.fillRect(cx-11+j*5,cy-3+(j%2)*4,3,3);}
        text('0'+(i+1)+' / '+(open?'LIVRE':'BLOQUEADO'),x+7,139,5.5,open?'#9fc4af':'#cfa77e');
        text(open?'FLUXO ALINHADO':'GIRAR CONEXÃO',x+8,188,5.5,open?'#83b69b':'#a7b6bd');
        ctx.fillStyle=flowing?'#76bc94':'#38464a';ctx.fillRect(x+8,201,66,2);
      });
      const count=s.cells.filter(v=>v%2===0).length;
      text('ÓLEO  →',59,214,6,'#ddb369');
      text('Clique nas conexões ou use 1–4',161,214,6,'#a9bbc0');
      text(count+'/4 livres',365,214,6,'#92b9a3');
    } else if(mode==='timing') {
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
      } else if(['timing','balance','route'].includes(mode)) {
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
          if(mode==='route')label=['──','│','──','│'][s.cells[i]];
          if(mode==='clean')label=s.remaining[i]?'SUJEIRA '+s.remaining[i]+'/3':'✓ LIMPO';
          if(mode==='clean') {
            for(let j=0;j<s.remaining[i]*4;j++){ctx.fillStyle='#796044';ctx.fillRect(x+6+(j*17)%67,135+(j*11)%46,3,2);}
            if(s.pulse>0){const bx=x+15+Math.sin(s.clock*25)*8;ctx.fillStyle='#b7a48b';ctx.fillRect(bx,137,26,5);ctx.fillStyle='#ded2b5';for(let j=0;j<7;j++)ctx.fillRect(bx+j*4,142,1,9);}
          }
          if(mode==='route') {
            ctx.save();ctx.translate(x+41,149);ctx.rotate(s.cells[i]*Math.PI/2);ctx.strokeStyle='#6c8993';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-31,0);ctx.lineTo(31,0);ctx.stroke();
            ctx.fillStyle='#d6b36a';ctx.fillRect(-30+(s.clock*25)%60,-1,5,2);ctx.restore();
          }
          if(mode==='bearings') {
            ctx.strokeStyle='#dbb4ef';ctx.beginPath();ctx.arc(x+41,153,7+s.order[i]*4,0,Math.PI*2);ctx.stroke();
            label=s.order[i]<s.progress?'✓':'Ø '+(s.order[i]+1)*10;
          }
          text(label,x+9,mode==='bearings'?188:166,mode==='route'?22:9);
        }
        text(mode==='sequence'?(s.phase==='memorize'?'MEMORIZE · os números somem em 4 segundos':'Repita: '+s.progress+'/4 · teclas 1 a 4'):mode==='route'?'Clique para girar as conexões · teclas 1 a 4':mode==='bolts'?'Ordem de aperto em cruz: 1 → 2 → 3 → 4':'Clique nas peças · teclas 1 a 4',65,216,8);
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
    label('GARAGEM',40,24,8,'#f1e4fa',true);label('/  ARRASTE PARA MOVER',91,24,5.5,'#a491b4');
    drawBikeMenuIcon('kit',374,21,'#d9b683',.55);
    label(String(repairKits).padStart(2,'0')+' KITS',383,24,6,'#ead0a7',true);ctx.fillStyle=hot(432,15,26,14)?'#68447d':'#392847';ctx.beginPath();ctx.roundRect(432,15,26,14,3);ctx.fill();
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
  const FOOT_WALK_KMH=20,FOOT_RUN_KMH=40;
  function footSpeedMultiplier() {
    return keys.has('shift')&&((state==='drive'&&!mounted)||state==='explore')?FOOT_RUN_KMH/FOOT_WALK_KMH:1;
  }
  function footMovementSpeed() {
    const condition=.55+.45*Math.min(hunger,thirst)/100;
    return FOOT_WALK_KMH/BIKE_SPEED_TO_KMH*footSpeedMultiplier()*condition;
  }
  function footAnimationMultiplier() {
    if(!((state==='drive'&&!mounted)||state==='explore'))return 1;
    return footSpeedMultiplier()>1?1.3:.8;
  }
  function drawSurvivorSprite(x,y,angle,time,moving) {
    if(!survivorSpriteSheet.complete||survivorSpriteSheet.naturalWidth===0)return false;
    const facing=smoothBikeFacing(angle,time,'survivor');
    const direction=facing.direction??bikeSpritePose(facing.angle,0,time).direction;
    const metadata=spriteAtlas.survivor,walk=metadata.walk;
    let sheet=survivorSpriteSheet,frame=metadata.frames[direction],anchor=metadata.wheelContacts[direction][0],height=frame[3];
    const dt=Math.max(0,Math.min(.05,time-(facing.walkTime??time)));facing.walkTime=time;
    if(moving&&survivorWalkSpriteSheet.complete&&survivorWalkSpriteSheet.naturalWidth>0){
      facing.walkPhase=(facing.walkPhase||0)+dt*walk.fps*footAnimationMultiplier();
      const heading=Math.round(direction/16)%walk.directions,step=Math.floor(facing.walkPhase)%walk.frameCount;
      sheet=survivorWalkSpriteSheet;frame=walk.frames[heading][step];anchor=walk.anchors[heading][step];height=walk.bodyHeights[heading];
    } else if(!moving)facing.walkPhase=0;
    const [sx,sy,sw,sh]=frame,scale=34*ACTOR_VISUAL_SCALE/height,scaleX=scale*.90;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(sheet,sx,sy,sw,sh,x-anchor[0]*scaleX,y+5-anchor[1]*scale,sw*scaleX,sh*scale);
    ctx.restore();return true;
  }
  function drawPerson(x, y, angle, time, moving, bikePose = false) {
    if(!bikePose&&drawSurvivorSprite(x,y,angle,time,moving))return;
    ctx.save(); ctx.translate(x, y); ctx.scale(.72*ACTOR_VISUAL_SCALE, .72*ACTOR_VISUAL_SCALE);
    const sideFacing = Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle));
    if (sideFacing && Math.sin(angle) < 0) ctx.scale(-1, 1);
    const step = moving ? Math.sin(time * 13) * 2 : 0;
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
    ctx.fillStyle = '#080f1088'; ctx.beginPath(); ctx.ellipse(x + 2*ACTOR_VISUAL_SCALE, y + 5, 6*ACTOR_VISUAL_SCALE, 3.5*ACTOR_VISUAL_SCALE, 0, 0, Math.PI * 2); ctx.fill();
    const moving=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(key=>keys.has(key));
    drawPerson(x, y, angle, time, moving, mounted);
  }
  function drawMinimap() {
    const x = W - 89, y = 12, w = 77, h = 53;
    panel(x, y, w, h, '#111c1d', '#65766a');
    const sx = w / world.w, sy = h / world.h;
    [roads,...branchRoads].forEach(path=>path.forEach(([rx,ry],i)=>{if(i){const [px,py]=path[i-1];ctx.strokeStyle='#697466';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+px*sx,y+py*sy);ctx.lineTo(x+rx*sx,y+ry*sy);ctx.stroke();}}));
    const p = mounted ? bike : player; ctx.fillStyle = '#ecdfaa'; ctx.fillRect(x + p.x * sx - 2, y + p.y * sy - 2, 4, 4);
  }
  function panel(x, y, w, h, fill = '#101a1c', stroke = '#475a53') {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }
  function drawDriveHud(time) {
    panel(11, 10, 157, 43, '#101a1ddd', '#617369');
    ctx.fillStyle = '#93a49a'; ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.fillText(`SETOR 0${Math.min(activeTower + 1, towers.length)}  /  MANTIQUEIRA`, 19, 21);
    const source = mounted ? bike : player, tower = active();
    const signal = tower ? Math.max(0, 4 - Math.floor(distance(source, tower) / 240)) : 0;
    ctx.fillStyle = '#81928c'; ctx.fillText('SINAL', 19, 36);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i < signal ? '#83d8bd' : '#33413f'; ctx.fillRect(52 + i * 8, 30 - i * 2, 5, 6 + i * 2); }
    if (tower) {
      const angle = Math.atan2(tower.x - source.x, -(tower.y - source.y)) - (mounted ? bike.angle : player.angle);
      ctx.fillStyle = '#81928c'; ctx.fillText('DIREÇÃO', 93, 36);
      ctx.save(); ctx.translate(145, 32); ctx.rotate(angle); ctx.fillStyle = '#e2c17c'; ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(5,5); ctx.lineTo(0,2); ctx.lineTo(-5,5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    if (mounted) {
      drawBikeDashboard(time);
    }
    drawMinimap(); drawSurvivalHud();
    ctx.textAlign = 'right'; ctx.fillStyle = '#82938b'; ctx.font = '6px monospace';
    ctx.fillText(mounted ? 'W ACELERA · S FREIA/RÉ · A/D VIRA · Q/R MARCHA · F DESLIGA · E DESCE' : 'W A S D MOVER  ·  E EXPLORAR / MOTO', W - 12, H - 7);
    if (!mounted && nearbyEntrance(player.x, player.y) >= 0) hint('E  ENTRAR PELA PORTA', W / 2, 31, time);
    else if (!mounted && distance(player,bike)<55 && (bikeLife<75 || Object.values(bikeParts).some(value=>value<70))) hint(repairKits>0?'E  USAR KIT E REPARAR A MOTO':'PROCURE UM KIT DE FERRAMENTAS',W/2,31,time);
    else if (tower && !mounted && distance(player, bike) < 55) hint('E  MONTAR NA MOTO', W / 2, 31, time);
    else if (tower && mounted && distance(bike, tower) < 205) hint('APROXIME-SE PARA INICIAR A PERSEGUIÇÃO', W / 2, 31, time);
    if (!mounted && distance(player,bike)<85) hint('F  INSPECIONAR MOTO',W/2,50,time);
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
    const roomType = exploreBuilding === 10 ? 4 : exploreBuilding % 4;
    const palette = [
      { floor:'#303834', wall:'#4b554c', dark:'#222d2c', light:'#8c8064', accent:'#a56f4d' },
      { floor:'#293638', wall:'#475452', dark:'#192527', light:'#71827a', accent:'#ba8354' },
      { floor:'#34332e', wall:'#514a3d', dark:'#242625', light:'#9b8662', accent:'#aa614a' },
      { floor:'#263334', wall:'#3e4b48', dark:'#1b2627', light:'#748b80', accent:'#c09a61' },
      { floor:'#35332c', wall:'#4a4940', dark:'#242722', light:'#ba9b66', accent:'#a44e3b' }
    ][roomType];
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
    // Alternating stone tiles and long cracks lead the eye into the room.
    for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
      const px = 92 + col * 38 - row * 12, py = 160 + row * 19;
      ctx.strokeStyle = (row + col + exploreBuilding) % 4 === 0 ? '#9a89654a' : '#11191a42'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 17, py - 10); ctx.lineTo(px + 34, py); ctx.stroke();
    }
    ctx.strokeStyle = '#090f10'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(114,208); ctx.lineTo(156,229); ctx.lineTo(174,216); ctx.moveTo(278,245); ctx.lineTo(311,224); ctx.lineTo(324,230); ctx.stroke();
    ctx.strokeStyle = palette.accent; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(114,208); ctx.lineTo(156,229); ctx.lineTo(174,216); ctx.stroke();
    // Ruined windows, exposed reinforcement and sagging conduits.
    polygon([{x:92,y:142},{x:133,y:117},{x:134,y:159},{x:93,y:183}], '#10191a');
    ctx.strokeStyle = '#7b806e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(112,130); ctx.lineTo(114,169); ctx.moveTo(93,161); ctx.lineTo(133,139); ctx.stroke();
    ctx.fillStyle = '#101718'; ctx.fillRect(219,97,6,170); ctx.fillRect(393,169,6,91);
    ctx.fillStyle = palette.light; ctx.fillRect(221,98,2,157); ctx.fillRect(395,171,2,82);
    ctx.strokeStyle = '#806849'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(226,79); ctx.lineTo(249,101); ctx.lineTo(241,119); ctx.lineTo(258,139); ctx.moveTo(396,171); ctx.lineTo(376,185); ctx.lineTo(388,200); ctx.stroke();
    ctx.strokeStyle = '#756d5c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(73,151); ctx.lineTo(94,165); ctx.lineTo(106,160); ctx.moveTo(349,145); ctx.lineTo(366,153); ctx.lineTo(384,142); ctx.stroke();
    // Interior partitions: solid masonry dividers with visible broken tops.
    interiorWalls.forEach((wall,i) => { ctx.fillStyle='#101718'; ctx.fillRect(wall.x-2,wall.y-3,wall.w+4,wall.h+5); ctx.fillStyle=i%2?'#536158':'#62695b'; ctx.fillRect(wall.x,wall.y,wall.w,wall.h); ctx.fillStyle='#879079'; ctx.fillRect(wall.x,wall.y,wall.w,2); ctx.fillStyle='#303b37'; for(let k=5;k<wall.w;k+=12)ctx.fillRect(wall.x+k,wall.y+4,2,wall.h-6); });
    // Each ruin type has a recognizable interior silhouette and a small debris field.
    if (roomType === 0) {
      polygon([{x:263,y:190},{x:300,y:168},{x:338,y:190},{x:300,y:214}], '#111819');
      polygon([{x:267,y:184},{x:300,y:165},{x:334,y:184},{x:300,y:205}], '#687164');
      polygon([{x:267,y:184},{x:300,y:205},{x:300,y:216},{x:267,y:195}], '#37413b');
      ctx.fillStyle = '#967e5c'; ctx.fillRect(296,170,7,3); ctx.fillRect(277,185,5,3);
      polygon([{x:335,y:214},{x:349,y:205},{x:369,y:216},{x:355,y:225}], '#1b2422');
      polygon([{x:335,y:214},{x:355,y:225},{x:355,y:242},{x:335,y:231}], '#343c35');
      polygon([{x:355,y:225},{x:369,y:216},{x:369,y:233},{x:355,y:242}], '#242c29');
      ctx.strokeStyle = palette.light; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(339,216); ctx.lineTo(353,224); ctx.moveTo(340,222); ctx.lineTo(353,230); ctx.stroke();
    } else if (roomType === 1) {
      polygon([{x:278,y:119},{x:312,y:99},{x:357,y:119},{x:323,y:140}], '#151e20');
      polygon([{x:282,y:116},{x:312,y:98},{x:352,y:116},{x:322,y:134}], '#8b7558');
      polygon([{x:282,y:116},{x:322,y:134},{x:322,y:139},{x:282,y:121}], '#3c443d');
      polygon([{x:322,y:134},{x:352,y:116},{x:352,y:121},{x:322,y:139}], '#55503e');
      for (let i = 0; i < 4; i++) { const bx=288+i*14, by=116+(i%2)*15; polygon([{x:bx,y:by},{x:bx+8,y:by-5},{x:bx+15,y:by-1},{x:bx+7,y:by+4}], ['#926d4d','#5c7167','#987f5c'][i%3]); ctx.fillStyle='#172020'; ctx.fillRect(bx+3,by+4,3,7); }
      polygon([{x:354,y:192},{x:364,y:186},{x:374,y:192},{x:364,y:199}], '#171f20');
      polygon([{x:354,y:192},{x:364,y:199},{x:364,y:222},{x:354,y:215}], '#704f3d');
      polygon([{x:364,y:199},{x:374,y:192},{x:374,y:215},{x:364,y:222}], '#4f4138');
      ctx.fillStyle = '#9b7750'; ctx.fillRect(361,187,8,3); ctx.fillStyle = '#202829'; ctx.fillRect(359,205,9,2);
    } else if (roomType === 2) {
      polygon([{x:270,y:187},{x:309,y:164},{x:352,y:188},{x:313,y:212}], '#131b1b');
      polygon([{x:274,y:183},{x:309,y:163},{x:347,y:184},{x:312,y:205}], '#56665e');
      ctx.fillStyle = '#a97a50'; ctx.fillRect(301,172,19,8); ctx.fillStyle = '#a6c09a'; ctx.fillRect(304,174,12,3);
      polygon([{x:274,y:207},{x:288,y:199},{x:302,y:207},{x:288,y:215}], '#252e2b');
      polygon([{x:278,y:206},{x:288,y:200},{x:298,y:206},{x:288,y:212}], '#a17a55');
      polygon([{x:278,y:206},{x:288,y:212},{x:288,y:223},{x:278,y:217}], '#5c4936');
      polygon([{x:288,y:212},{x:298,y:206},{x:298,y:217},{x:288,y:223}], '#403b31');
      polygon([{x:337,y:210},{x:350,y:202},{x:363,y:210},{x:350,y:218}], '#252e2b');
      polygon([{x:340,y:209},{x:350,y:203},{x:360,y:209},{x:350,y:215}], '#a17a55');
      polygon([{x:340,y:209},{x:350,y:215},{x:350,y:226},{x:340,y:220}], '#5c4936');
      polygon([{x:350,y:215},{x:360,y:209},{x:360,y:220},{x:350,y:226}], '#403b31');
    } else if (roomType === 3) {
      polygon([{x:274,y:197},{x:310,y:176},{x:349,y:198},{x:312,y:219}], '#1b2524');
      polygon([{x:276,y:190},{x:310,y:170},{x:347,y:191},{x:312,y:211}], '#667267');
      ctx.fillStyle = '#9b7956'; ctx.fillRect(278,190,4,11); ctx.fillRect(342,190,4,11);
      ctx.fillStyle = '#556d69'; ctx.fillRect(183,232,61,3); ctx.fillRect(203,236,4,11); ctx.fillRect(235,235,4,10);
    } else {
      // Rare service station: counter, dead terminal, oil drums and pump hose.
      polygon([{x:265,y:150},{x:303,y:128},{x:362,y:150},{x:324,y:172}], '#171e1d');
      polygon([{x:269,y:146},{x:303,y:127},{x:357,y:147},{x:323,y:167}], '#a08a61');
      polygon([{x:269,y:146},{x:323,y:167},{x:323,y:174},{x:269,y:153}], '#5d503c');
      polygon([{x:323,y:167},{x:357,y:147},{x:357,y:154},{x:323,y:174}], '#3b3930');
      ctx.fillStyle = '#141d1e'; ctx.fillRect(299,117,31,24); ctx.fillStyle = '#56695e'; ctx.fillRect(302,120,25,14); ctx.fillStyle = '#b95c42'; ctx.fillRect(307,124,14,2);
      polygon([{x:351,y:159},{x:360,y:154},{x:373,y:160},{x:364,y:166}], '#252c28');
      polygon([{x:351,y:159},{x:364,y:166},{x:364,y:194},{x:351,y:187}], '#5e4840');
      polygon([{x:364,y:166},{x:373,y:160},{x:373,y:188},{x:364,y:194}], '#403831');
      ctx.fillStyle = '#9b7a52'; ctx.fillRect(357,155,9,3); ctx.fillStyle = '#202829'; ctx.fillRect(357,174,7,2);
      ctx.strokeStyle = '#c18d5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(352,158); ctx.bezierCurveTo(377,161,371,181,365,182); ctx.stroke();
      ctx.fillStyle = '#222c2a'; ctx.fillRect(276,160,51,4); ctx.fillStyle = '#b08058'; ctx.fillRect(282,164,3,18); ctx.fillRect(319,164,3,18);
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
    ctx.fillStyle = '#d0bd8d'; ctx.font = '4px monospace'; ctx.textAlign = 'center'; ctx.fillText('SUPRIMENTOS',322,230);
    for (let i = 0; i < 12; i++) {
      const rx = 73 + (i * 47 + exploreBuilding * 13) % 330, ry = 247 + (i * 17) % 35;
      ctx.fillStyle = i % 3 ? '#717166' : '#a17c55'; ctx.fillRect(rx,ry,3 + i%3,2); ctx.fillStyle = '#171f20'; ctx.fillRect(rx+2,ry+2,3,1);
    }
    interiorHazards.forEach((hazard, i) => {
      const bob = Math.sin(time * 3 + i) * 2;
      if (hazard.kind === 'weak') { ctx.fillStyle = '#a76547'; ctx.beginPath(); ctx.moveTo(hazard.x - 17, hazard.y + bob); ctx.lineTo(hazard.x, hazard.y - 9 + bob); ctx.lineTo(hazard.x + 18, hazard.y + bob); ctx.lineTo(hazard.x, hazard.y + 9 + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#de9b58'; ctx.font = '5px monospace'; ctx.fillText('FRÁGIL', hazard.x - 12, hazard.y - 12 + bob); }
      else if (hazard.kind === 'gap') { ctx.fillStyle = '#080e10'; ctx.beginPath(); ctx.moveTo(hazard.x - 28,hazard.y); ctx.lineTo(hazard.x,hazard.y - 13); ctx.lineTo(hazard.x + 31,hazard.y); ctx.lineTo(hazard.x,hazard.y + 13); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#d27455'; ctx.fillRect(hazard.x - 3,hazard.y - 2,6,3); }
      else { ctx.fillStyle = '#68706a'; ctx.fillRect(hazard.x - 24,hazard.y - 22 + bob,48,5); ctx.fillStyle = '#b08058'; ctx.fillRect(hazard.x - 17,hazard.y - 17 + bob,3,9); }
    });
    const supply = supplies[exploreBuilding];
    if (supply && supply.available && !supply.found) {
      const sx = 322 + Math.sin(time * .6) * 3, sy = 211;
      drawExploreSupply(supply.type, sx, sy, time);
      if (Math.hypot(explorer.x - sx, explorer.y - sy) < 20) {
        supply.found = true;
        if (supply.type === 'fuel') { fuel = Math.min(100, fuel + 34); setToast('ACHOU COMBUSTÍVEL — +34%'); }
        else if (supply.type === 'ration') { hunger = Math.min(100, hunger + 42); setToast('RAÇÃO MILITAR — FOME REDUZIDA'); }
        else if (supply.type === 'water') { thirst = Math.min(100, thirst + 38); setToast('GARRAFA ENCONTRADA — SEDE REDUZIDA'); }
        else if (supply.type === 'toolkit') { repairKits++; setToast(`KIT DE FERRAMENTAS — REPAROS DISPONÍVEIS: ${repairKits}`); }
        else { hunger = Math.min(100, hunger + 21); setToast('ENLATADO ENCONTRADO — FOME REDUZIDA'); }
      }
    }
    const p = { x: explorer.x, y: explorer.y };
    ctx.fillStyle = '#080d0e88'; ctx.beginPath(); ctx.ellipse(p.x,p.y + 5,8*ACTOR_VISUAL_SCALE,4*ACTOR_VISUAL_SCALE,0,0,Math.PI*2); ctx.fill();
    const walkX=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    const walkY=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    if(walkX||walkY)explorer.spriteAngle=Math.atan2(walkX,-walkY);
    drawPerson(p.x,p.y,explorer.spriteAngle??Math.PI,time,!!(walkX||walkY),false);
    drawAtmosphere(time, 'world');
    panel(10, 9, 180, 33, '#101a1deF', '#667a6e'); ctx.fillStyle = '#d5c18b'; ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.fillText(exploreBuilding === 10 ? 'EXPLORAÇÃO · POSTO DE GASOLINA' : `INTERIOR · SETOR ${String(exploreBuilding + 1).padStart(2,'0')}`, 18, 22); ctx.fillStyle = '#9da99a'; ctx.fillText(Math.hypot(explorer.x - 78, explorer.y - 200) < 42 ? 'E  SAIR PELA PORTA' : 'PROCURE A PORTA PARA SAIR', 18, 34);
    if (Math.hypot(explorer.x - 78, explorer.y - 200) < 42) hint('E  SAIR PELA PORTA', W / 2, 43, time);
    drawSurvivalHud();
  }

  function drawExploreSupply(type, x, y, time) {
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
    for(const [bx,label] of [[x+7,'Q  -'],[x+75,'R  +']]){
      ctx.fillStyle='#19151e';ctx.strokeStyle='#685174';ctx.beginPath();ctx.roundRect(bx,y+61,48,12,5);ctx.fill();ctx.stroke();
      ctx.textAlign='center';ctx.font='5px monospace';ctx.fillStyle='#c5dbe3';ctx.fillText(label,bx+24,y+69);
    }
    ctx.fillStyle=low&&Math.sin(time*5)>0?'#ff855d':'#577582';ctx.beginPath();ctx.arc(x+65,y+67,2,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  function drawSurvivalHud() {
    const riding=bikeControlsMounted(),bounds=bikeDashboardBounds(),w=riding?bounds.w:110,x=W-w-12,top=riding?bounds.y-29:H-42,barWidth=w-53;
    ctx.save();panel(x,top,w,riding?23:31,riding?'#101f2366':'#101f23dc',riding?'#7ba49244':'#506f68');ctx.font='5px monospace';
    const meters=[['GAS',fuel,'#d9ab68'],['FOME',hunger,'#c69d6d'],['SEDE',thirst,'#78b9b0']];
    (riding?meters.slice(1):meters).forEach(([name,value,color],i)=>{
      const y=top+9+i*9;ctx.textAlign='left';ctx.fillStyle='#9ba99d';ctx.fillText(name,x+5,y);
      ctx.fillStyle='#293834';ctx.fillRect(x+27,y-4,barWidth,3);ctx.fillStyle=color;ctx.fillRect(x+27,y-4,barWidth*Math.max(0,value)/100,3);
      ctx.textAlign='right';ctx.fillStyle='#cedbce';ctx.fillText(String(Math.round(value)),x+w-5,y);
    });ctx.restore();
  }
  function drawAtmosphere(time, view) {
    ctx.save();
    ctx.fillStyle = 'rgba(7, 13, 18, .13)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
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
    for (let i = 0; i < 74; i++) {
      const x = (i * 67 + Math.sin(time * .8 + i) * 9) % W;
      const y = (i * 43 + time * (82 + i % 4 * 12)) % H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2.2, y + 5 + i % 3); ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
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
    keys.clear(); setToast('SOB A MÁQUINA — W ACELERA · R SOBE MARCHA · Q REDUZ · A/D DESVIA', 2.8); updateObjective();
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
    chaser.x = Math.max(40, Math.min(W - 40, chaser.x + steer * 250 * dt));
    const condition=(.65+.35*Math.min(hunger,thirst)/100)*(.62+.38*Math.min(bikeParts.frontTire,bikeParts.rearTire)/100);
    const limit=bikeGearSpeedLimit();
    const targetSpeed=fuel<=0||bikeLife<=0?0:keys.has('w')?limit:keys.has('s')?Math.min(38,limit):Math.min(100,limit);
    chaseSpeed += (targetSpeed - chaseSpeed) * Math.min(1, dt * 2.8 * condition);
    if(keys.has('w')&&fuel>0&&bikeLife>0)fuel=Math.max(0,fuel-dt*.08);
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
      if (chaseInvulnerable <= 0) { chaseLives--; chaseInvulnerable = 1.1; chaseLag = Math.min(390, chaseLag + 42); chaser.x += chaser.x < W * .5 ? -24 : 24; applyBikeImpact(chaseSpeed,'IMPACTO NOS ESCOMBROS'); }
    }
    const pose = chaseMachinePose(gameTime, tower);
    for (const foot of pose.feet) {
      if (foot.y > 184 && Math.hypot(foot.x - chaser.x, foot.y - CHASE_BIKE_Y) < 36 && chaseInvulnerable <= 0) {
        chaseLives--; chaseInvulnerable = 1.4; chaseLag = Math.min(390, chaseLag + 58); chaser.x += chaser.x < foot.x ? -55 : 55;
        applyBikeImpact(chaseSpeed,'PISÃO NA MOTO'); break;
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

  function drawClimbBackground(time) {
    ctx.fillStyle = '#182729'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 10) for (let x = 0; x < W; x += 12) {
      ctx.fillStyle = (x + y) % 4 ? '#1c2b2c' : '#202f30'; ctx.fillRect(x, y, 11, 9);
    }
    ctx.fillStyle = '#263638'; ctx.fillRect(32, 20, 416, 226);
    ctx.fillStyle = '#101a1d'; ctx.fillRect(44, 28, 390, 211);
    ctx.fillStyle = '#2b393b'; ctx.fillRect(52, 35, 376, 197);
    // Deep-lit city windows far behind the giant's external framework.
    for (let i = 0; i < 18; i++) {
      const wx = 60 + (i * 47) % 355, wy = 46 + (i * 61) % 169;
      ctx.fillStyle = i % 4 === 0 ? '#9c7850' : '#435b58'; ctx.fillRect(wx, wy, 5, 9);
      ctx.fillStyle = '#182326'; ctx.fillRect(wx + 1, wy + 10, 3, 3);
    }
    // Huge load-bearing ribs frame the climb route on the machine's outer hull.
    ctx.strokeStyle = '#121e21'; ctx.lineWidth = 15; ctx.beginPath();
    ctx.moveTo(36, 243); ctx.lineTo(122, 22); ctx.moveTo(444, 243); ctx.lineTo(357, 22);
    ctx.moveTo(34, 65); ctx.lineTo(446, 65); ctx.moveTo(34, 202); ctx.lineTo(446, 202); ctx.stroke();
    ctx.strokeStyle = '#526560'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(39, 237); ctx.lineTo(125, 27); ctx.moveTo(441, 237); ctx.lineTo(354, 27);
    ctx.moveTo(38, 59); ctx.lineTo(442, 59); ctx.moveTo(38, 196); ctx.lineTo(442, 196); ctx.stroke();
    for (let x = 42; x < 448; x += 40) {
      ctx.fillStyle = '#364644'; ctx.fillRect(x, 25, 4, 218); ctx.fillStyle = '#647568'; ctx.fillRect(x + 1, 28, 1, 210);
    }
    for (let y = 44; y < 240; y += 40) {
      ctx.fillStyle = '#354442'; ctx.fillRect(36, y, 408, 4); ctx.fillStyle = '#596658'; ctx.fillRect(39, y, 402, 1);
    }
    // Distant concentric machine coils and vertical data conduits.
    ctx.strokeStyle = '#46605c'; ctx.lineWidth = 1;
    for (let r = 26; r < 108; r += 13) { ctx.beginPath(); ctx.arc(238, 126, r + Math.sin(time + r) * 2, 0, Math.PI * 2); ctx.stroke(); }
    for (let x = 72; x < 430; x += 71) {
      ctx.fillStyle = '#172222'; ctx.fillRect(x, 21, 7, 230); ctx.fillStyle = '#668171'; ctx.fillRect(x + 3, 21, 1, 230);
      const lightY = (time * 34 + x * 2) % 208 + 24; ctx.fillStyle = '#8ad2b4'; ctx.fillRect(x + 1, lightY, 4, 3);
    }
    ctx.fillStyle = '#1a2627'; ctx.fillRect(0, 246, W, 24); ctx.fillStyle = '#88907c'; ctx.fillRect(0, 245, W, 2);
    // Narrow climb rails join the ledges.
    ctx.fillStyle = '#82907a';
    [[91, 214, 8, 31], [165, 183, 8, 31], [236, 152, 8, 31], [309, 121, 8, 31], [384, 90, 8, 31]].forEach(([x, y, w, h]) => { ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w, y, 2, h); for (let k = 0; k < h; k += 7) ctx.fillRect(x, y + k, w + 2, 2); });
    platforms.forEach((p, i) => {
      ctx.fillStyle = '#121d20'; ctx.fillRect(p.x, p.y, p.w, 9);
      ctx.fillStyle = i === climbCheckpoint ? '#82d5ae' : '#758171'; ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.fillStyle = '#33413e'; ctx.fillRect(p.x + 5, p.y + 5, p.w - 10, 3);
      for (let x = p.x + 7; x < p.x + p.w - 4; x += 18) { ctx.fillStyle = '#b07856'; ctx.fillRect(x, p.y + 2, 2, 2); }
    });
    // Sweeping, live power arcs.
    const beamX = 66 + ((time * (activeTower >= 3 ? 105 : 78)) % 354);
    ctx.fillStyle = '#e7795b'; ctx.globalAlpha = .24 + .22 * Math.sin(time * 8);
    ctx.fillRect(beamX, 179, 35, 3); ctx.fillRect(430 - ((time * 54) % 300), 118, 27, 3); ctx.globalAlpha = 1;
    drawDrone(110 + Math.sin(time * .8) * 115, 137 + Math.sin(time * 1.6) * 13, time);
    // Apex terminal.
    ctx.fillStyle = '#101d20'; ctx.fillRect(404, 47, 56, 31);
    ctx.fillStyle = '#485b52'; ctx.fillRect(407, 50, 50, 24);
    ctx.fillStyle = '#8ce0b6'; ctx.fillRect(415, 55, 34, 4);
    ctx.fillStyle = '#172321'; ctx.fillRect(416, 62, 32, 7);
    ctx.fillStyle = '#cee9c5'; ctx.fillRect(429, 64, 6, 3);
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
    ctx.fillStyle = '#0e181a'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(32, -10); ctx.transform(1, .10, -.12, .90, 0, 0);
    drawClimbBackground(time);
    // Small side-on character with animated legs and a cable pack.
    const blink = climber.invulnerable > 0 && Math.floor(time * 14) % 2;
    if (!blink) {
      if(keys.has('a')||keys.has('arrowleft'))climber.spriteAngle=-Math.PI/2;
      else if(keys.has('d')||keys.has('arrowright'))climber.spriteAngle=Math.PI/2;
      const walking=climber.grounded&&(keys.has('a')||keys.has('d')||keys.has('arrowleft')||keys.has('arrowright'));
      if(!drawSurvivorSprite(Math.round(climber.x),Math.round(climber.feet)-5,climber.spriteAngle??Math.PI/2,time,walking)){
      const x = Math.round(climber.x), y = Math.round(climber.feet - 20);
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
    if (state === 'hack') drawHack(time);
    drawClimbHud(time);
  }
  function drawClimbHud(time) {
    panel(11, 10, 151, 39, '#101a1deF', '#667a6e');
    ctx.textAlign = 'left'; ctx.fillStyle = '#a6b5a5'; ctx.font = '6px monospace'; ctx.fillText(`ESCALADA  ·  NÓ 0${activeTower + 1}`, 19, 22);
    ctx.fillStyle = '#d5b071'; ctx.fillText('INTEGRIDADE', 19, 38);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < climbLives ? '#df8d66' : '#3a4140'; ctx.fillRect(82 + i * 14, 31, 10, 7); }
    panel(W - 108, 10, 97, 24, '#101a1deF', '#667a6e');
    ctx.fillStyle = '#a6b5a5'; ctx.textAlign = 'right'; ctx.fillText('A/D MOVER  ·  W/ESPAÇO SALTAR', W - 18, 25);
    if (state !== 'hack') {
      ctx.fillStyle = '#b5c2aa'; ctx.textAlign = 'center'; ctx.font = '6px monospace';
      ctx.fillText(activeTower===3?'VENTO LATERAL — CONTRA-ESTERCE COM A/D':activeTower===4?'APOIOS MÓVEIS — ESPERE A PLATAFORMA SE APROXIMAR':'SUBA PELOS SUPORTES E EVITE AS DESCARGAS', W / 2, H - 8);
      if (climber.feet < 108 && climber.x > 390) hint('E  ACESSAR TERMINAL', W / 2, 39, time);
    }
  }
  function drawHack(time) {
    ctx.fillStyle = '#071012ce'; ctx.fillRect(0, 0, W, H);
    panel(67, 43, 346, 205, '#142324', '#81d4b1');
    ctx.textAlign = 'center'; ctx.fillStyle = '#9ddfc1'; ctx.font = '8px monospace';
    if (hackMode === 'question') {
      const question = networkQuestions[activeTower][hackStep];
      ctx.fillText('DIAGNÓSTICO · CONEXÃO DE REDES', W / 2, 62);
      ctx.fillStyle = '#82968b'; ctx.font = '6px monospace'; ctx.fillText(`PERGUNTA ${hackStep + 1} / ${networkQuestions[activeTower].length}`, W / 2, 76);
      ctx.fillStyle = '#e3e9db'; ctx.font = '7px monospace'; ctx.fillText(question.q, W / 2, 96);
      question.a.forEach((answer, i) => {
        const x = 107, y = 108 + i * 32;
        ctx.fillStyle = '#202f2e'; ctx.fillRect(x, y, 266, 26); ctx.strokeStyle = '#536d62'; ctx.strokeRect(x + .5, y + .5, 265, 25);
        ctx.fillStyle = '#d5b576'; ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.fillText(`${i + 1}.`, x + 10, y + 16);
        ctx.fillStyle = '#dce5d8'; ctx.fillText(answer, x + 29, y + 16);
      });
      ctx.fillStyle = '#8fa59b'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('RESPONDA COM 1, 2, 3 OU TOQUE NA OPÇÃO', W / 2, 216);
    } else if (hackMode === 'connect') {
      const ys = [124,159,194], sourceNames = ['UPLINK','WAN','LAN'], portNames = ['BACKBONE','INTERNET','REDE LOCAL'];
      ctx.fillText('LIGUE OS CABOS ÀS PORTAS DA REDE', W / 2, 62);
      ctx.fillStyle = '#87998f'; ctx.font = '6px monospace'; ctx.fillText('SELECIONE O CABO À ESQUERDA E A PORTA À DIREITA', W / 2, 78);
      for (let i = 0; i < 3; i++) {
        const y = ys[i];
        ctx.fillStyle = cableConnected[i] ? '#264b3d' : connectSelected === i ? '#594b2d' : '#202c2c'; ctx.fillRect(89,y-12,118,24);
        ctx.fillStyle = '#151d1e'; ctx.fillRect(273,y-12,118,24);
        ctx.strokeStyle = cableConnected[i] ? '#86d5a9' : '#52645b'; ctx.strokeRect(89.5,y-11.5,117,23); ctx.strokeRect(273.5,y-11.5,117,23);
        ctx.fillStyle = cableColors[i]; ctx.fillRect(98,y-2,20,4); ctx.fillStyle = '#dce5d8'; ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.fillText(sourceNames[i],124,y+2);
        ctx.fillStyle = '#dce5d8'; ctx.textAlign = 'center'; ctx.fillText(portNames[i],332,y+2);
        if (cableConnected[i]) {
          ctx.strokeStyle = cableColors[i]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(207,y); ctx.lineTo(235,y); ctx.lineTo(250,ys[cableMatch[i]]); ctx.lineTo(273,ys[cableMatch[i]]); ctx.stroke();
          ctx.fillStyle = '#a4e4b6'; ctx.fillText('✓',247,ys[cableMatch[i]]-6);
        } else {
          ctx.strokeStyle = cableColors[i]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(208,y); ctx.lineTo(230,y); ctx.moveTo(251,y); ctx.lineTo(272,y); ctx.stroke();
        }
      }
      ctx.fillStyle = '#8fa59b'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('TOQUE CABO E PORTA · TECLADO: NÚMERO DO CABO, DEPOIS DA PORTA', W / 2, 216);
    } else if (hackMode === 'cut') {
      const names = ['AMARELO','AZUL','VERMELHO'];
      ctx.fillText('ISOLAR CURTO-CIRCUITO', W / 2, 62);
      ctx.fillStyle = '#e2d5b4'; ctx.font = '7px monospace'; ctx.fillText(`SENSOR: CURTO NA LINHA ${cableCutAnswer + 1} · ${names[cableCutAnswer]}`, W / 2, 86);
      ctx.fillStyle = '#899b91'; ctx.font = '6px monospace'; ctx.fillText('CORTE APENAS O CABO DANIFICADO', W / 2, 103);
      for (let i=0;i<3;i++) {
        const x=103+i*91, y=136;
        ctx.fillStyle='#1c2928'; ctx.fillRect(x,y,80,58); ctx.strokeStyle='#536b61'; ctx.strokeRect(x+.5,y+.5,79,57);
        ctx.fillStyle=cableColors[i]; ctx.fillRect(x+12,y+25,56,7); ctx.fillStyle='#171e1e'; ctx.fillRect(x+33,y+23,14,11);
        ctx.fillStyle='#dce5d8'; ctx.font='6px monospace'; ctx.textAlign='center'; ctx.fillText(`${i+1} · ${names[i]}`,x+40,y+50);
        if(i===cableCutAnswer){ ctx.fillStyle='#f4c477'; ctx.fillRect(x+37,y+19,6,3); }
      }
      ctx.fillStyle='#8fa59b'; ctx.font='6px monospace'; ctx.fillText('TOQUE NO CABO OU PRESSIONE 1, 2 OU 3', W/2,216);
    } else if (hackMode === 'repair') {
      ctx.fillText('EMENDAR CABO ROMPIDO', W / 2, 62);
      ctx.fillStyle='#e2d5b4'; ctx.font='6px monospace'; ctx.fillText('A LINHA DE DADOS PRECISA DE UM CONDUTOR E ISOLAÇÃO', W/2,82);
      ctx.strokeStyle='#74b7ad'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(112,119); ctx.lineTo(213,119); ctx.moveTo(268,119); ctx.lineTo(369,119); ctx.stroke();
      ctx.fillStyle='#df7257'; ctx.fillRect(211,112,5,14); ctx.fillRect(265,112,5,14);
      for(let i=0;i<3;i++){
        const x=103+i*91,y=143; ctx.fillStyle='#1c2928'; ctx.fillRect(x,y,80,52); ctx.strokeStyle='#536b61'; ctx.strokeRect(x+.5,y+.5,79,51);
        if(i===0){ctx.fillStyle='#242b29';ctx.fillRect(x+15,y+22,50,8);ctx.fillStyle='#85877d';ctx.fillRect(x+19,y+24,42,4);}
        else if(i===1){ctx.fillStyle='#a86f48';ctx.fillRect(x+14,y+21,52,10);ctx.fillStyle='#e0b570';ctx.fillRect(x+19,y+18,4,16);ctx.fillRect(x+57,y+18,4,16);ctx.fillStyle='#d6c08d';ctx.fillRect(x+24,y+24,32,4);}
        else{ctx.fillStyle='#277e88';ctx.fillRect(x+14,y+20,52,12);ctx.fillStyle='#7bc5bc';for(let k=0;k<5;k++)ctx.fillRect(x+20+k*9,y+23,4,6);}
        ctx.fillStyle='#dce5d8';ctx.font='5px monospace';ctx.textAlign='center';ctx.fillText(['FITA','EMENDA DE COBRE','PONTE ÓPTICA'][i],x+40,y+45);
      }
      ctx.fillStyle='#8fa59b';ctx.font='6px monospace';ctx.fillText('ESCOLHA A PEÇA E TOQUE PARA REPARAR',W/2,216);
    } else if (hackMode === 'sequence') {
      ctx.fillText('SEQUÊNCIA DE RELÉS',W/2,62);
      ctx.fillStyle='#d5ded2';ctx.font='6px monospace';ctx.fillText('REPRODUZA A ORDEM DE PULSOS ANOTADA NO PAINEL',W/2,83);
      ctx.fillStyle='#e3b64f';ctx.fillRect(111,111,258,31);
      ctx.fillStyle='#202a28';ctx.font='9px monospace';ctx.fillText('1  →  3  →  2  →  3',W/2,131);
      for(let i=0;i<3;i++){const x=124+i*91;ctx.fillStyle=i===sequenceIndex%3?'#263f37':'#1c2928';ctx.fillRect(x,163,68,41);ctx.strokeStyle=i===sequenceIndex%3?'#a9e2b7':'#536b61';ctx.strokeRect(x+.5,163.5,67,40);ctx.fillStyle=cableColors[i];ctx.fillRect(x+28,174,12,12);ctx.fillStyle='#e8e4d5';ctx.font='7px monospace';ctx.fillText(`${i+1}`,x+34,198);}
      ctx.fillStyle='#8fa59b';ctx.font='6px monospace';ctx.fillText(`ENTRADAS CORRETAS ${sequenceIndex}/4 · ERRO REINICIA`,W/2,216);
    } else {
      ctx.fillText('SINCRONIZAR PULSO DE REDE',W/2,62);
      ctx.fillStyle='#d5ded2';ctx.font='6px monospace';ctx.fillText(`ALVO DO SENSOR: RELÉ ${pulseTarget+1} · APERTE NA JANELA VERDE`,W/2,84);
      ctx.fillStyle='#1c2928';ctx.fillRect(108,113,264,24);ctx.fillStyle='#a4bf75';ctx.fillRect(219,113,42,24);
      const needle=110+((pulseClock*105)%260);ctx.fillStyle='#e37558';ctx.fillRect(needle,107,4,36);
      for(let i=0;i<3;i++){const x=124+i*91;ctx.fillStyle=i===pulseTarget?'#3b4831':'#1c2928';ctx.fillRect(x,163,68,41);ctx.strokeStyle=i===pulseTarget?'#c8d995':'#536b61';ctx.strokeRect(x+.5,163.5,67,40);ctx.fillStyle=cableColors[i];ctx.fillRect(x+28,174,12,12);ctx.fillStyle='#e8e4d5';ctx.font='7px monospace';ctx.fillText(`${i+1}`,x+34,198);}
      ctx.fillStyle='#8fa59b';ctx.font='6px monospace';ctx.fillText('APERTE O NÚMERO DO RELÉ ALVO QUANDO A BARRA CRUZAR A ZONA VERDE',W/2,216);
    }
    ctx.fillStyle = '#e2a070'; ctx.fillText(`TEMPO  ${Math.max(0, hackTime).toFixed(1)}s`, W / 2, 238);
  }
  function updateClimb(dt) {
    climbTime += dt; hazardCooldown = Math.max(0, hazardCooldown - dt); climber.invulnerable = Math.max(0, climber.invulnerable - dt);
    if (state === 'hack') {
      hackTime -= dt; pulseClock += dt;
      if (hackTime <= 0) { state = 'climb'; hackStep = 0; hackTime = 36; setToast('TEMPO ESGOTADO — REINICIE O DIAGNÓSTICO'); }
      return;
    }
    const left = keys.has('a') || keys.has('arrowleft'); const right = keys.has('d') || keys.has('arrowright');
    climber.x += ((right ? 1 : 0) - (left ? 1 : 0)) * 82 * dt;
    climber.x = Math.max(8, Math.min(470, climber.x));
    const previousFeet = climber.feet;
    climber.vy += 480 * dt; climber.feet += climber.vy * dt; climber.grounded = false;
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
    // A moving security drone and timed electric sweeps punish careless jumps.
    const droneX = 110 + Math.sin(climbTime * .8) * 115, droneY = 137 + Math.sin(climbTime * 1.6) * 13;
    const beamX = 66 + ((climbTime * (activeTower >= 3 ? 105 : 78)) % 354), secondBeam = 430 - ((climbTime * (activeTower === 4 ? 82 : 54)) % 300);
    const droneHit = Math.abs(climber.x - droneX) < 14 && Math.abs((climber.feet - 12) - droneY) < 12;
    const beamHit = Math.abs(climber.feet - 179) < 8 && climber.x > beamX - 4 && climber.x < beamX + 40;
    const beamHit2 = Math.abs(climber.feet - 118) < 8 && climber.x > secondBeam - 4 && climber.x < secondBeam + 32;
    if ((droneHit || beamHit || beamHit2) && hazardCooldown <= 0 && climber.invulnerable <= 0) {
      climbLives--; climber.invulnerable = 1.05; hazardCooldown = .75;
      if (climbLives <= 0) { climbLives = 2; climbCheckpoint = Math.max(0, climbCheckpoint - 1); climber.x = Math.max(25, platforms[climbCheckpoint].x + 12); climber.feet = platforms[climbCheckpoint].y; setToast('SOBRECARGA — RECUO AO APOIO ANTERIOR'); }
      else setToast('DESCARGA ELÉTRICA — CUIDADO COM OS ARCOS');
    }
  }

  function finishFrame(time, dt) {
    gameScene=gameSceneViewport(state);W=gameScene.width;H=gameScene.height;
    ctx.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,0,0);
    ctx.fillStyle='#101819';ctx.fillRect(0,0,DISPLAY_W,DISPLAY_H);
    ctx.translate(gameScene.x,gameScene.y);
    ctx.fillStyle = '#090f12'; ctx.fillRect(0, 0, W, H);
    if (state === 'title') { drawWorld(time, dt); }
    else if (state === 'drive') drawWorld(time, dt);
    else if (state === 'explore') drawExplore(time);
    else if (state === 'chase') drawChase(time);
    else if (state === 'grapple') drawGrappleView(time);
    else if (state === 'climb' || state === 'hack') drawClimber(time, dt);
    else if (state === 'ending') drawEnding(time);
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
    if(fuel<=0||bikeLife<=0)bikeEngineRunning=false;
    if(ignition.active)ignition.update(dt);
    updateBikeGearbox(dt,state==='chase'||state==='grapple'?chaseSpeed:bike.speed,bikeControlsMounted()&&keys.has('w'));
    if (bikeInspectOpen && (state !== 'drive' || mounted || distance(player,bike)>120)) {bikeInspectOpen=false;bikeService=null;}
    if (bikeInspectOpen) updateBikeService(dt);
    if(state!=='title'&&state!=='ending')updateBikeCondition(dt,state==='chase'||state==='grapple'?chaseSpeed:state==='drive'&&mounted?bike.speed:0);
    updateMachines(gameTime);
    hunger = Math.max(0, hunger - dt * .035); thirst = Math.max(0, thirst - dt * .06);
    if (state === 'explore') {
      const dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      const step=footMovementSpeed()*dt/(Math.hypot(dx,dy)||1);
      const nextX = Math.max(58, Math.min(408, explorer.x + dx*step)), nextY = Math.max(95, Math.min(280, explorer.y + dy*step));
      const radius=7*ACTOR_VISUAL_SCALE;
      const hitsWall = (x,y) => interiorWalls.some(w => x+radius>w.x && x-radius<w.x+w.w && y+radius>w.y && y-radius<w.y+w.h);
      if (!hitsWall(nextX, explorer.y)) explorer.x = nextX;
      if (!hitsWall(explorer.x, nextY)) explorer.y = nextY;
      exploreStep += dt; explorer.invulnerable = Math.max(0, explorer.invulnerable - dt);
      const hazard = interiorHazards.find(h => Math.hypot(explorer.x - h.x, explorer.y - h.y) < (h.kind === 'gap' ? 18 : 16));
      if (hazard && explorer.invulnerable <= 0) {
        explorer.hp--; explorer.invulnerable = 1.3; explorer.x = 240; explorer.y = 145;
        setToast(hazard.kind === 'weak' ? 'O PISO CEDEU — DESVIE DAS PLACAS FENDIDAS' : hazard.kind === 'gap' ? 'SEM CHÃO! VOCÊ VOLTOU AO ÚLTIMO APOIO' : 'TETO DESABOU — PROCURE UM ABRIGO');
        if (explorer.hp <= 0) { state = 'drive'; player.x = worldReturn.x; player.y = worldReturn.y; mounted = false; explorer.hp = 3; setToast('VOCÊ ESCAPOU DA CONSTRUÇÃO POR POUCO.'); }
      }
    }
    if (state === 'drive' && !mounted) {
      const dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      if (dx || dy) {
        const p=footMovementSpeed()*dt/Math.hypot(dx,dy);
        moveWorldEntity(player, dx * p, dy * p, 7*ACTOR_VISUAL_SCALE); player.angle = Math.atan2(dx, -dy); walkCycle += dt * 12;
      }
      if (active() && Math.hypot(player.x - active().x, player.y - active().y) > 205 && !mounted) { /* the machine remains safely out of reach on foot */ }
      updateObjective();
    } else if (state === 'drive' && mounted) {
      const throttle = keys.has('w') || keys.has('arrowup');
      const reverse = keys.has('s') || keys.has('arrowdown');
      const turn = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      bike.steering+=(turn-bike.steering)*(1-Math.exp(-9*dt));
      const motorFactor = (.38 + .62 * bikeParts.motor / 100)*(.65+.35*Math.min(hunger,thirst)/100)*(.62+.38*Math.min(bikeParts.frontTire,bikeParts.rearTire)/100);
      if (throttle && bikeEngineRunning && fuel > 0 && bikeLife > 0 && bikeShiftCooldown<=0) bike.speed += bikeGearAcceleration() * motorFactor * dt;
      else if (reverse && bikeLife > 0 && (bike.speed>0||bikeEngineRunning&&fuel>0)) bike.speed += (bike.speed > 0 ? -300 : -105 * motorFactor) * dt;
      else bike.speed = Math.sign(bike.speed) * Math.max(0, Math.abs(bike.speed) - 75 * dt);
      const maxForward=bikeGearSpeedLimit();
      // Engine braking brings a downshift into its new range without teleporting speed.
      if(bike.speed>maxForward)bike.speed=Math.max(maxForward,bike.speed-dt*260);
      bike.speed=Math.max(-48,bike.speed);
      if ((throttle || reverse) && Math.abs(bike.speed)>0) fuel=Math.max(0,fuel-dt*(reverse?.045:.11)*(1+(100-bikeParts.motor)/38));
      bike.angle += bike.steering * dt * (.7 + Math.abs(bike.speed) / 115) * (.2 + .8*bikeParts.handlebar/100) * (.5 + .5*Math.min(bikeParts.frontTire,bikeParts.rearTire)/100) * (bike.speed<0?-1:1);
      const previousX=bike.x,previousY=bike.y,impactSpeed=bike.speed;
      const rideX=Math.sin(bike.angle)*bike.speed*dt,rideY=-Math.cos(bike.angle)*bike.speed*dt;
      moveWorldEntity(bike,rideX,rideY,12*ACTOR_VISUAL_SCALE);
      const blockedFraction=Math.min(1,Math.hypot(rideX-(bike.x-previousX),rideY-(bike.y-previousY))/Math.max(.001,Math.hypot(rideX,rideY)));
      const tower = active();
      if (tower && bikeEngineRunning && distance(bike, tower) < 155) { bike.speed *= .25; startChase(); }
      else if (blockedFraction>.15) {
        applyBikeImpact(impactSpeed*blockedFraction);
        bike.speed *= blockedFraction>.85?.38:.8;
      }
      if (bikeLife <= 0) { bike.speed=0; if (mounted) { mounted=false; player.x=bike.x+Math.cos(bike.angle)*18; player.y=bike.y+Math.sin(bike.angle)*18; setToast('MOTO QUEBROU — USE E AO LADO DELA COM UM KIT.'); } }
      totalRide += Math.abs(bike.speed) * dt; bike.wheel += Math.abs(bike.speed) * dt / 9;
      player.x = bike.x; player.y = bike.y; player.angle = bike.angle;
      updateObjective();
    } else if (state === 'chase' || state === 'grapple') updateChase(dt);
    else if (state === 'climb' || state === 'hack') updateClimb(dt);
    finishFrame(gameTime, dt);
    requestAnimationFrame(frame);
  }

  setObjective('Chegue à primeira máquina de moto.', 0);
  const gameDisplay=initGameDisplay({canvas,onResize:resolution=>{
    if(canvas.width===resolution.width&&canvas.height===resolution.height)return;
    canvas.width=resolution.width;canvas.height=resolution.height;
    RENDER_SCALE=canvas.width/DISPLAY_W;
    ctx.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,0,0);ctx.imageSmoothingEnabled=false;
    bikeBlendLayer.width=Math.ceil(160*RENDER_SCALE);bikeBlendLayer.height=Math.ceil(160*RENDER_SCALE);
    bikeOcclusionLayer.width=bikeBlendLayer.width;bikeOcclusionLayer.height=bikeBlendLayer.height;
    bikeBlendStamp='';
  }});
  requestAnimationFrame(frame);
})();
