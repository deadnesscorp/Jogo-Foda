// Run with: node tests/sprites-128.test.js
function runSpriteAtlasTests(atlas,source) {
  let assertions=0;
  const check=(condition,message)=>{assertions++;if(!condition)throw Error(message);};
  const visualScale=Number(source.match(/const ACTOR_VISUAL_SCALE=([\d.]+)/)[1]);
  check(atlas.directions===128&&atlas.columns*atlas.rows===128,'atlas defines 128 direction slots');
  check(atlas.stepDegrees===360/128,'rotation covers a complete turn');
  const directionConstants=source.slice(source.indexOf('  const BIKE_DIRECTION_COUNT='),source.indexOf('  const bikeSpriteBounds='));
  const poseSource=source.slice(source.indexOf('  function bikeSpritePose('),source.indexOf('  function bikeGroundLayout('));
  const pose=new Function(`${directionConstants}\n${poseSource}\nreturn bikeSpritePose;`)();
  const headings=new Set();
  for(let i=0;i<128;i++){
    headings.add(pose(i*Math.PI*2/128,0,0).direction);
    check(pose((i-128)*Math.PI*2/128,0,0).direction===i,'negative angles preserve all 128 headings');
  }
  check(headings.size===128,'standing, walking and riding select all 128 headings');
  const calibrated={bike:[0,12,30,45,57,72,88,101],survivor:[0,2,3,6,8,9,11,14]};
  check(atlas.survivor.idleDirections===atlas.survivor.walk.directions,'idle and walking use the same eight calibrated orientation anchors');
  for(const kind of ['bike','survivor']){
    const data=atlas[kind];
    check(data.sourceDirections.length===128,'each heading maps to a calibrated source pose');
    calibrated[kind].forEach((frame,i)=>check(data.sourceDirections[i*16]===frame,kind+' uses the matching cardinal/intercardinal pose'));
    check(data.sourceDirections.every((frame,i)=>Number.isInteger(frame)&&frame>=0&&frame<data.columns*data.rows&&(kind==='survivor'||!i||frame>=data.sourceDirections[i-1])),kind+' maps headings to valid physical poses');
    check(data.frames.length===128&&data.wheelContacts.length===128,'every variant contains 128 sprites and ground anchors');
    for(let i=0;i<128;i++){
      const [x,y,w,h]=data.frames[i];
      check(w>0&&h>0&&x>=0&&y>=0&&x+w<=data.width&&y+h<=data.height,kind+' crop stays in atlas');
      const sourceDirection=data.sourceDirections?.[i]??i;
      const cols=data.columns,rows=data.rows;
      const left=Math.round(sourceDirection%cols*data.width/cols),right=Math.round((sourceDirection%cols+1)*data.width/cols),top=Math.round(Math.floor(sourceDirection/cols)*data.height/rows),bottom=Math.round((Math.floor(sourceDirection/cols)+1)*data.height/rows);
      check(x>=left&&y>=top&&x+w<=right&&y+h<=bottom,kind+' crop never includes a neighboring sprite');
      check(data.wheelContacts[i].length>=1&&data.wheelContacts[i].every(p=>p.length===2&&p.every(Number.isFinite)),kind+' ground anchors have valid nesting');
      check(data.wheelContacts[i].every(([px,py])=>px>=0&&py>=0&&px<=w&&py<=h+1),kind+' wheel anchors stay near silhouette');
      if(kind!=='survivor')check(data.headlightAnchors[i].length===2&&data.headlightAnchors[i].every(Number.isFinite),kind+' headlight has an anchor');
    }
  }
  const walk=atlas.survivor.walk;
  check(walk.directions===8&&walk.frameCount===8&&walk.columns*walk.rows===64,'walking atlas has 8 full-body frames for each of 8 directions');
  for(let direction=0;direction<8;direction++){
    check(walk.bodyHeights[direction]>0&&walk.bodyHeights[direction]<=walk.height/8,'walking uses a fixed body scale for the entire directional cycle');
    for(let step=0;step<8;step++){
      const [x,y,w,h]=walk.frames[direction][step],left=Math.round(step*walk.width/8),right=Math.round((step+1)*walk.width/8),top=Math.round(direction*walk.height/8),bottom=Math.round((direction+1)*walk.height/8);
      check(w>0&&h>0&&x>=left&&x+w<=right&&y>=top&&y+h<=bottom,'walking crop never includes another frame');
      const anchor=walk.anchors[direction][step];
      check(anchor.every(Number.isFinite)&&anchor[0]>=0&&anchor[0]<=w&&anchor[1]>=0,'walking has a valid helmet/ground anchor');
    }
  }
  const layout=source.slice(source.indexOf('  function bikeGroundLayout('),source.indexOf('  const DAY_LENGTH_SECONDS'));
  const masks=source.slice(source.indexOf('  function bikeShadowMask('),source.indexOf('  bikeSpriteSheets.forEach('));
  const api=new Function('atlas',`
    const ACTOR_VISUAL_SCALE=${visualScale},BIKE_SPRITE_COLUMNS=16,bikeShadowMasks=new Map(),images=[{naturalWidth:atlas.bike.width},{naturalWidth:atlas.bike.width}];
    const bikeSpriteSource=(direction,riding=false)=>images[riding?1:0],bikeSpriteMetadata=()=>atlas.bike;
    const document={createElement:()=>({getContext:()=>({drawImage(){},fillRect(){}})})};
    ${layout}\n${masks}
    return {layout:bikeGroundLayout,mask:bikeShadowMask};
  `)(atlas);
  for(const riding of [false,true])for(let i=0;i<128;i++){
    const ground=api.layout(250,190,50,i,riding),contacts=ground.contacts;
    const mx=contacts.reduce((sum,p)=>sum+p[0],0)/contacts.length,my=contacts.reduce((sum,p)=>sum+p[1],0)/contacts.length;
    check(Math.abs(mx-250)<1e-8&&Math.abs(my-195)<1e-8,'rotating preserves the motorcycle ground contact center');
  }
  check(api.mask(0,false)!==api.mask(0,true),'mounted rider has its own shadow silhouette');
  check(api.mask(0,true)===api.mask(0,true),'mounted shadow remains cached');
  const footDrawing=source.slice(source.indexOf('  function drawSurvivorSprite('),source.indexOf('  function drawPerson('));
  const smoothingSource=source.slice(source.indexOf('  function smoothBikeFacing('),source.indexOf('  function bikeSpritePose('));
  const foot=new Function('spriteAtlas',`
    const ACTOR_VISUAL_SCALE=${visualScale},survivorSpriteSheet={complete:true,naturalWidth:1774,kind:'idle'},survivorWalkSpriteSheet={complete:true,naturalWidth:1280,kind:'walk'};let calls=0;const draws=[],footAnimationMultiplier=()=>.8;
    ${directionConstants}
    const bikeVisualFacings=new Map();
    const survivorIdleDirections=new Map();
    ${smoothingSource}
    ${poseSource}
    const blends=[],painter={clearRect(){},drawImage(...args){blends.push({alpha:this.globalAlpha,args});}};
    const document={createElement:()=>({getContext:()=>painter})};
    const ctx={save(){},restore(){},translate(){},transform(){},drawImage(...args){calls++;draws.push(args);}};
    ${footDrawing}
    return {draw:drawSurvivorSprite,draws,blends,seed:(angle,time)=>smoothBikeFacing(angle,time,'survivor'),get direction(){return bikeVisualFacings.get('survivor').direction;},get calls(){return calls;},get phase(){return bikeVisualFacings.get('survivor').walkPhase;},ready(value){survivorWalkSpriteSheet.complete=value;}};
  `)(atlas);
  check(foot.draw(100,120,0,0,false)&&foot.calls===1,'standing survivor draws one cached sprite');
  check(foot.draw(100,120,Math.PI,1,true)&&foot.calls===2&&foot.draws.at(-1)[0].kind==='walk','walking draws one complete animated sprite without cutting limbs');
  for(let pose=0;pose<16;pose++){
    foot.draw(100,120,pose*Math.PI/8,2,true);
    foot.draw(100,120,pose*Math.PI/8,2,false);
    const draw=foot.draws.at(-1),height=draw.length===5?foot.blends.at(-1).args[8]/4:draw[8];
    check(Math.abs(height-34*visualScale)<1e-8,'standing survivor keeps the same reduced height in all 16 directions');
  }
  const visited=new Set();
  for(let sample=0;sample<32;sample++){
    foot.draw(100,120,0,3+sample*.05,true);visited.add(foot.draws.at(-1).slice(1,5).join(','));
  }
  check(visited.size===8,'walking advances through all eight distinct animation frames');
  foot.draw(100,120,0,5,false);check(foot.phase===0&&foot.draws.at(-1)[0].kind==='idle','stopping returns to the planted idle pose');
  foot.ready(false);foot.draw(100,120,0,5.05,true);check(foot.draws.at(-1)[0].kind==='idle','walking safely uses the idle pose while its atlas loads');
  foot.ready(true);
  for(const moving of [false,true])for(let direction=0;direction<128;direction++){
    if(!moving)foot.draw(100,120,direction*Math.PI*2/128,6,true);
    const before=foot.blends.length;
    foot.draw(100,120,direction*Math.PI*2/128,6,moving);
    const stride=16;
    if(direction%stride){
      check(foot.blends.length===before+2,'intermediate headings blend two anchored source views');
      const pair=foot.blends.slice(-2);
      check(Math.abs(pair[0].alpha+pair[1].alpha-1)<1e-8,'direction interpolation preserves opacity');
      check(pair.every(draw=>draw.args.slice(1).every(Number.isFinite)),'interpolated frames have finite geometry including the wrap to north');
    }
  }
  for(let heading=0;heading<128;heading++){
    const angle=heading*Math.PI*2/128,time=20+heading;
    foot.seed(angle+Math.PI/2,time);
    foot.draw(100,120,angle,time+1/60,true);
    check(foot.direction===heading,'quick turns immediately use the movement heading on foot');
    foot.draw(100,120,angle+Math.PI/4,time+2/60,false);
    check(foot.direction===heading,'releasing movement preserves the last heading without an intermediate diagonal');
    foot.draw(100,120,angle+Math.PI/2,time+.5,false);
    check(foot.direction===heading,'idle heading stays fixed after the turn');
  }
  for(const scenario of [
    {key:'S',angle:Math.atan2(-1,-.5),poses:[9,11]},
    {key:'A',angle:Math.atan2(-1,.5),poses:[11,14]}
  ]){
    foot.draw(100,120,scenario.angle,200,true);
    const before=foot.blends.length;
    foot.draw(100,120,0,200+1/60,false);
    check(foot.blends.length===before+2,scenario.key+' release uses calibrated neighboring idle views');
    foot.blends.slice(-2).forEach((draw,index)=>{
      const sourceIndex=atlas.survivor.sourceDirections.indexOf(scenario.poses[index]);
      check(draw.args.slice(1,5).join(',')===atlas.survivor.frames[sourceIndex].join(','),scenario.key+' stop selects the correct physical source pose');
    });
  }
  return assertions+' sprite atlas checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function') {
  const fs=require('fs'),path=require('path');
  console.log(runSpriteAtlasTests(JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/sprites-128/atlas.json'),'utf8')),fs.readFileSync(path.join(__dirname,'../game.js'),'utf8')));
}
