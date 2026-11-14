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
  const calibrated={bike:[0,12,30,45,57,72,88,101],survivor:[0,12,20,40,64,72,80,96]};
  check(atlas.survivor.idleDirections===128&&atlas.survivor.columns*atlas.survivor.rows===128,'standing survivor contains 128 physical poses');
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
      if(kind==='survivor'){
        check(x+w/2>=left&&x+w/2<=right&&y+h/2>=top&&y+h/2<=bottom,'complete standing silhouette belongs to its calibrated cell');
        check(h>=130&&h<=150,'standing crop contains the complete figure without a neighboring row');
      }else{
        check(x>=left&&y>=top&&x+w<=right&&y+h<=bottom,kind+' crop never includes a neighboring sprite');
      }
      check(data.wheelContacts[i].length>=1&&data.wheelContacts[i].every(p=>p.length===2&&p.every(Number.isFinite)),kind+' ground anchors have valid nesting');
      check(data.wheelContacts[i].every(([px,py])=>px>=0&&py>=0&&px<=w&&py<=h+1),kind+' wheel anchors stay near silhouette');
      if(kind!=='survivor')check(data.headlightAnchors[i].length===2&&data.headlightAnchors[i].every(Number.isFinite),kind+' headlight has an anchor');
      else{
        check(Array.isArray(data.forearms[i])&&data.forearms[i].length<=2,'each pose measures only its visible forearms');
        for(const [ax,ay,aw,ah] of data.forearms[i])check(ax>=0&&ay>=h*.45&&aw>0&&aw<w*.4&&ah>0&&ax+aw<=w&&ay+ah<=h,'forearm crop includes the hand and stays below the fixed shoulder');
      }
    }
  }
  const walk=atlas.survivor.walk;
  check(!walk.file&&!walk.motionFile,'movement has no animation sheets');
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
    ${directionConstants}
    ${footHeadingSource}
    const draws=[],transforms=[];
    let transform={a:1,b:.1,c:0,d:1,e:0,f:0};
    const ctx={save(){},restore(){},translate(){},beginPath(){},rect(){},clip(){},transform(...args){transforms.push(args);},getTransform(){return transform;},drawImage(...args){draws.push({args,smoothing:this.imageSmoothingEnabled});}};
    ${footDrawing}
    return {draw:drawSurvivorSprite,draws,transforms,transform(value){transform=value;}};
  `)(atlas);
  for(let heading=0;heading<128;heading++){
    const angle=heading*Math.PI/64;
    const direction=Math.round(angle*walk.directions/(Math.PI*2))%walk.directions;
    foot.draw(100,120,angle,{heading:direction,phase:0,stage:'idle'});
    const idle=foot.draws.at(-1).args;
    for(const running of [false,true]){
      foot.draw(100,120,angle,{heading:direction,phase:7.5,stage:'loop',running});
      const drawn=foot.draws.at(-1);
      check(drawn.args[0].kind==='idle','walking and running use standing art');
      check(drawn.args.slice(1).join(',')===idle.slice(1).join(','),'movement preserves standing pose and scale');
      check(!drawn.smoothing&&drawn.args.slice(5).every(Number.isFinite),'standing art renders with valid pixel geometry');
    }
  }
  for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5]){
    for(const running of [false,true]){
      const before=foot.draws.length;
      foot.draw(100,120,angle,{stepAmount:1,stepPhase:Math.PI/2,running,stage:'loop'});
      const pose=Math.round(angle*64/Math.PI)%128,arms=atlas.survivor.forearms[pose];
      check(foot.draws.length-before===3+arms.length*2,'stride renders complete measured forearms with fixed elbow overlaps');
      check(foot.transforms.slice(-2).every(matrix=>matrix.every(Number.isFinite)&&matrix[3]>.6&&matrix[3]<1.4),'leg motion stays bounded in every direction');
      check(foot.transforms.slice(-2).every(([a,b,c,d])=>Math.abs(a*a+b*b-1)<1e-10&&Math.abs(c*c+d*d-1)<1e-10&&Math.abs(a*c+b*d)<1e-10),'walking rotates the calves without stretching or shearing their artwork');
    }
  }
  const beforeRest=foot.draws.length;
  foot.draw(100,120,0,{stepAmount:0,stepPhase:1,stage:'idle'});
  check(foot.draws.length===beforeRest+1,'standing still renders the original full sprite');
  return assertions+' sprite atlas checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function') {
  const fs=require('fs'),path=require('path');
  const atlas=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/sprites-128/atlas.json'),'utf8'));
  console.log(runSpriteAtlasTests(atlas,fs.readFileSync(path.join(__dirname,'../src/game.js'),'utf8')));
}
