// Run with: node tests/render-cache.test.js
function runRenderCacheTests(source) {
  let assertions=0,created=0;
  const check=(condition,message)=>{assertions++;if(!condition)throw Error(message);};
  const document={createElement(){
    created++;const commands=[],painter={fillStyle:'',fillRect(x,y,w,h){commands.push({x,y,w,h,color:this.fillStyle});}};
    return {getContext:()=>painter,pixel(x,y){for(let i=commands.length-1;i>=0;i--){const r=commands[i];if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)return r.color;}}};
  }};
  const cache=source.slice(source.indexOf('  const GROUND_CHUNK_SIZE='),source.indexOf('  function drawGround('));
  const visibility=source.slice(source.indexOf('  function isoBuildingVisible('),source.indexOf('  function drawIsoBuilding('));
  const api=new Function('document',`const W=640,H=360;${cache}\n${visibility};return {tile:groundTextureChunk,visible:isoBuildingVisible,get size(){return groundTextureCache.size;}};`)(document);
  const first=api.tile(0,0),count=created;
  check(api.tile(0,0)===first&&created===count,'cached floor is reused without redrawing');
  for(const [cx,cy] of [[0,0],[256,512],[768,1024],[5376,3328]]){
    const tile=api.tile(cx,cy);
    for(let i=0;i<32;i++){
      const x=(i*37)%256,y=(i*53)%256,wx=cx+Math.floor(x/16)*16,wy=cy+Math.floor(y/16)*16;
      const shade=((Math.imul(wx/16,374761393)^Math.imul(wy/16,668265263))>>>0)%5;
      const speck=(wx*7+wy*3)%11===0&&x%16>=4&&x%16<6&&y%16>=5&&y%16<7;
      const expected=speck?'#343b38':shade===0?'#37433b':shade===1?'#354139':'#344038';
      check(tile.pixel(x,y)===expected,'cached floor preserves original texture at world coordinates');
    }
  }
  for(let i=0;i<80;i++)api.tile(i*256,256);
  check(api.size===48,'floor cache has bounded memory');
  check(api.tile(0,0)!==first,'evicted textures can be recreated');
  const shape=(x,y,height=80)=>({base:[{x,y},{x:x+40,y},{x:x+40,y:y+30},{x,y:y+30}],roof:[{x,y:y-height},{x:x+40,y:y-height},{x:x+40,y:y+30-height},{x,y:y+30-height}]});
  check(api.visible(shape(100,100)),'visible buildings remain drawn');
  check(!api.visible(shape(-1000,100))&&!api.visible(shape(1000,100)),'distant buildings on either side are skipped');
  check(!api.visible(shape(100,-200))&&!api.visible(shape(100,1000)),'buildings beyond vertical limits are skipped');
  check(api.visible(shape(100,500,200)),'tall building remains visible when its base is below screen');
  check(api.visible(shape(100,550,100)),'smoke and roof details retain a conservative margin');
  const geometrySource=source.slice(source.indexOf('  const buildingGeometryCache='),source.indexOf('  function isoBuildingVisible('));
  const geometry=new Function(`
    let W=640,H=360,calls=0;const camera={x:0,y:0};
    const UrbanStructures={TYPES:Array.from({length:5},()=>({height:100}))};
    const projectPoint=(x,y)=>{calls++;return {x:W/2+x-camera.x,y:H/2+y-camera.y};};
    ${geometrySource}
    return {get:isoBuildingGeometry,get calls(){return calls;},move(){camera.x++;},resize(){W++;}};
  `)();
  const building=geometry.get(10,20,80,60,0),projections=geometry.calls;
  check(geometry.get(10,20,80,60,0)===building&&geometry.calls===projections,'shadows and building rendering reuse the same projected geometry');
  check(geometry.get(10,20,81,60,0)!==building,'changing a building invalidates its cached geometry');
  geometry.move();const moved=geometry.get(10,20,80,60,0);
  check(moved.base[0].x===building.base[0].x-1,'moving the camera reprojects cached buildings');
  geometry.resize();check(geometry.get(10,20,80,60,0)!==moved,'resizing invalidates projected geometry');
  const bikeDrawing=source.slice(source.indexOf('  function drawBike(x,'),source.indexOf('  function drawBikeFallback('));
  const blended=new Function(`
    let RENDER_SCALE=2,bikeBlendStamp='',blends=0,clears=0,mounted=false;
    const bike={steering:.5,bank:.8,wheel:0},bikeEngineRunning=true,ACTOR_VISUAL_SCALE=.75;
    ${source.slice(source.indexOf('  function bikeMotion('),source.indexOf('  function smoothBikeFacing('))}
    const positions=[],ctx={save(){},restore(){},translate(){},transform(){},drawImage(image,x,y){positions.push([x,y]);}};
    const bikeBlendLayer={width:320,height:320},bikeBlendContext={setTransform(){},translate(){},clearRect(){clears++;},drawImage(){blends++;}};
    const BIKE_DIRECTION_STEP=Math.PI/64,seatedRiderSpriteSheet={};
    const spriteAtlas={mounted:{poses:Array.from({length:128},()=>({crop:[]}))}};
    const mountedPose=spriteAtlas.mounted.poses[20],turnWeights=[];
    let sampledOriginal=false;
    const drawMountedRiderPose=(painter,art,pose)=>{
      blends++;
      turnWeights.push(painter.globalAlpha);
      sampledOriginal=art===seatedRiderSpriteSheet&&pose===mountedPose&&!painter.imageSmoothingEnabled;
    };
    const bikeSpritesReady=()=>true,smoothBikeFacing=angle=>({angle,direction:Math.round(angle/(Math.PI/64))%128});
    const bikeOcclusionLayer={width:320,height:320},bikeOcclusionContext={clearRect(){},drawImage(){}};
    const bikeGroundLayout=(x,y)=>({sx:0,sy:0,sw:20,sh:20,left:x-10,top:y-20,width:20,height:20,contacts:[[x,y],[x+2,y]],riderOffsetX:0,riderOffsetY:0});
    const bikeSpriteSource=()=>({}),drawBikeContactShadow=()=>{},drawBikeGroundShadow=()=>{},drawBikeExhaust=()=>{},drawBikeWheelMotion=()=>{};
    ${bikeDrawing}
    return {draw:drawBike,motion:bikeMotion,turn:bikeTurnDelta,positions,turnWeights,get blends(){return blends;},get clears(){return clears;},get sampledOriginal(){return sampledOriginal;},resize(){bikeBlendStamp='';},mount(){mounted=true;}};
  `)();
  blended.draw(100,100,0,0,0);const draws=blended.blends;
  blended.draw(200,200,0,100,1);
  check(blended.blends===draws&&blended.clears===1,'unchanged bike orientation reuses blended sprite');
  check(blended.positions[1][0]===120&&blended.positions[1][1]===120,'cached sprite still follows bike position');
  blended.draw(200,200,1,100,2);check(blended.blends>draws,'turning refreshes blended sprite');
  const beforeResize=blended.blends;blended.resize();blended.draw(200,200,1,0,3);
  check(blended.blends>beforeResize,'resizing invalidates cached sprite');
  const beforeMount=blended.blends;blended.mount();const rider=blended.draw(200,200,20*Math.PI/64,0,4);
  check(blended.blends>beforeMount&&rider.integrated,'mounting refreshes sprite and embeds rider in motorcycle');
  check(blended.sampledOriginal,'mounted rendering samples the original pixel art without smoothing');
  blended.draw(200,200,127.5*Math.PI/64,80,5);
  check(blended.turnWeights.at(-1)===1,'turning draws one opaque pose without ghost silhouettes');
  const turn=speed=>blended.turn(speed,1,100,100,1/60);
  check(turn(0)===0&&turn(5)>0,'the bike steers as it begins moving and stays still at rest');
  check(turn(-46)===-turn(46),'reverse flips the steering direction');
  check(turn(220)<turn(46),'steering is less abrupt at high speeds');
  const frontLean=blended.motion(110,1,true,0,0).lean;
  const backLean=blended.motion(110,1,true,0,Math.PI).lean;
  check(frontLean<0&&backLean>0,'corner lean follows the heading instead of a fixed screen side');
  check(Math.abs(blended.motion(110,1,true,0,Math.PI/2).lean)<1e-8,'side view does not shear the rider sideways along the motorcycle');
  check(Math.abs(blended.motion(30,1,true).lean)<Math.abs(frontLean),'corner lean decreases at low speed');
  const parked=blended.motion(0,1,false);
  check(parked.compression===1&&parked.lean===0,'parked motorcycle stays still with engine off');
  check(blended.motion(0,1,true).compression!==1,'mounted motorcycle has a subtle engine vibration');
  for(const speed of [-300,30,110,300])for(let time=0;time<2;time+=.05){
    const motion=blended.motion(speed,time,true);
    check(Math.abs(motion.compression-1)<.014&&Math.abs(motion.lean)<=.055,'suspension and corner lean stay bounded at every speed');
  }
  return assertions+' render cache checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function') {
  console.log(runRenderCacheTests(require('fs').readFileSync(require('path').join(__dirname,'../src/game.js'),'utf8')));
}
