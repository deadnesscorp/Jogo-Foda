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
  check(walk.directions===8&&walk.frameCount===24&&walk.columns*walk.rows===192,'walking atlas has 24 full-body frames for each of 8 directions');
  check(walk.pingPong===false&&walk.walkFrames.length===24&&walk.walkFrames.every((frame,index)=>frame===index),'The walking atlas plays all 24 poses in order');
  check(walk.walkOrder.length===walk.directions&&walk.walkOrder.every(order=>order.length===24&&new Set(order).size===24&&order.every((frame,index)=>Math.floor(frame/3)===Math.floor(index/3)&&(index%3!==0||frame===index))),'Each direction uses all 24 poses and retains its key frames');
  check(Math.abs(1000/walk.playbackFps-110)<1e-8,'Walking uses the reference GIF duration per pose');
  check(walk.runFrames.length===16&&walk.runFrames.every(frame=>frame%3!==1),'Running keeps the original sixteen poses per direction');
  for(let direction=0;direction<8;direction++){
    check(walk.bodyHeights[direction]>0&&walk.bodyHeights[direction]<=walk.height/8,'walking uses a fixed body scale for the entire directional cycle');
    for(let step=0;step<walk.frameCount;step++){
      const [x,y,w,h]=walk.frames[direction][step],left=Math.round(step*walk.width/walk.columns),right=Math.round((step+1)*walk.width/walk.columns),top=Math.round(direction*walk.height/8),bottom=Math.round((direction+1)*walk.height/8);
      check(w>0&&h>0&&x>=left&&x+w<=right&&y>=top&&y+h<=bottom,'walking crop never includes another frame');
      const anchor=walk.anchors[direction][step];
      check(anchor.every(Number.isFinite)&&anchor[0]>=0&&anchor[0]<=w&&anchor[1]>=0,'walking has a valid helmet/ground anchor');
      if(step%3===1){
        const previous=walk.frames[direction][step-1][3],next=walk.frames[direction][(step+1)%walk.frameCount][3];
        check(Math.abs(h-(previous+next)/2)<=2.5,'The intermediate pose matches the height of its neighbors');
      }
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
  const footDrawing=source.slice(source.indexOf('  function drawFootFrame('),source.indexOf('  function drawPerson('));
  const footHeadingSource=source.slice(source.indexOf('  function footHeading('),source.indexOf('  function updateFootGait('));
  const foot=new Function('spriteAtlas',`
    const ACTOR_VISUAL_SCALE=${visualScale};
    const survivorSpriteSheet={complete:true,naturalWidth:1774,kind:'idle'};
    const survivorWalkSpriteSheet={complete:true,naturalWidth:1280,kind:'walk'};
    const survivorWalkMotionSheet={complete:false,naturalWidth:0,kind:'walk-motion'};
    ${directionConstants}
    ${footHeadingSource}
    const draws=[];
    let transform={a:1,b:.1,c:0,d:1,e:0,f:0};
    const ctx={save(){},restore(){},translate(){},getTransform(){return transform;},drawImage(...args){draws.push({args,smoothing:this.imageSmoothingEnabled});}};
    ${footDrawing}
    return {draw:drawSurvivorSprite,draws,ready(value){survivorWalkSpriteSheet.complete=value;},motionReady(){survivorWalkMotionSheet.complete=true;survivorWalkMotionSheet.naturalWidth=spriteAtlas.survivor.walk.width;},transform(value){transform=value;}};
  `)(atlas);
  for(let heading=0;heading<walk.directions;heading++){
    const angle=heading*Math.PI*2/walk.directions;
    for(let step=0;step<walk.frameCount;step++){
      const before=foot.draws.length;
      check(foot.draw(100,120,angle,{heading,phase:step+.25,stage:'loop'}),'walking frame renders');
      const {args,smoothing}=foot.draws.at(-1);
      check(foot.draws.length===before+1&&args[0].kind==='walk'&&!smoothing,'each pose uses one source sprite with smoothing disabled');
      check(args.slice(1,5).join(',')===walk.frames[heading][step].join(','),'each source crop is drawn in sequence');
      check(args.slice(5).every(Number.isFinite),'drawing keeps finite geometry');
      check(Math.abs(args[6]+34*visualScale)<1e-8,'Every frame keeps the same helmet height');
    }
    foot.draw(100,120,angle,{heading,phase:4,stage:'idle'});
    const idle=foot.draws.at(-1).args;
    foot.draw(100,120,angle+Math.PI/2,{heading,phase:4,stage:'idle'});
    check(idle[0].kind==='idle'&&idle.slice(1,5).join(',')===foot.draws.at(-1).args.slice(1,5).join(','),'idle preserves the last walking heading');
    check(Math.abs(idle[8]-34*visualScale)<1e-8,'idle preserves the existing actor scale');
  }
  const walking={heading:4,phase:5,stage:'loop'};
  const matrix={a:1.75,b:0,c:0,d:1.75,e:100.27,f:80.48};
  foot.transform(matrix);
  foot.draw(100,120,Math.PI,walking);
  const [x,y,width,height]=foot.draws.at(-1).args.slice(5);
  check([x*matrix.a+matrix.e,y*matrix.d+matrix.f,width*matrix.a,height*matrix.d].every(value=>Math.abs(value-Math.round(value))<1e-8),'Sprite drawing aligns to the physical pixel grid');
  foot.transform({...matrix,e:100.81,f:80.76});
  foot.draw(100,120,Math.PI,walking);
  check(foot.draws.at(-1).args.slice(7).join(',')===[width,height].join(','),'Subpixel movement cannot change the pose size');
  foot.draw(100,120,Math.PI,{heading:4,phase:38.5,stage:'loop',pingPong:true});
  check(foot.draws.at(-1).args.slice(1,5).join(',')===walk.frames[4][8].join(','),'The renderer selects the correct source frame on the return half');
  foot.draw(100,120,Math.PI,{heading:4,phase:1.5,stage:'loop',running:true});
  check(foot.draws.at(-1).args.slice(1,5).join(',')===walk.frames[4][2].join(','),'Running selects the preserved source poses');
  foot.draw(100,120,Math.PI,{heading:4,phase:1.5,stage:'loop',running:false});
  check(foot.draws.at(-1).args.slice(1,5).join(',')===walk.frames[4][1].join(','),'Walking includes the intermediate poses');
  foot.draw(100,120,Math.PI,{heading:4,phase:7.5,stage:'loop',running:false});
  check(foot.draws.at(-1).args.slice(1,5).join(',')===walk.frames[4][8].join(','),'Walking uses the calibrated intermediate order for its heading');
  foot.motionReady();
  foot.draw(100,120,Math.PI,{heading:4,phase:7.5,stage:'loop',running:false});
  check(foot.draws.at(-1).args[0].kind==='walk-motion'&&foot.draws.at(-1).args[3]===walk.width/walk.columns,'Walking draws the precomposed limb timing pose once');
  foot.draw(100,120,Math.PI,{heading:4,phase:1.5,stage:'loop',running:true});
  check(foot.draws.at(-1).args[0].kind==='walk','Running keeps its original art');
  foot.ready(false);
  foot.draw(100,120,0,{heading:0,phase:1,stage:'loop'});
  check(foot.draws.at(-1).args[0].kind==='idle','walking safely uses idle while its atlas loads');
  return assertions+' sprite atlas checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function') {
  const fs=require('fs'),path=require('path');
  console.log(runSpriteAtlasTests(JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/sprites-128/atlas.json'),'utf8')),fs.readFileSync(path.join(__dirname,'../game.js'),'utf8')));
}
