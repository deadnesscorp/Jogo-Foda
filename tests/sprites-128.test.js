// Run with: node tests/sprites-128.test.js
function runSpriteAtlasTests(atlas,source) {
  let assertions=0;
  const check=(condition,message)=>{assertions++;if(!condition)throw Error(message);};
  check(atlas.directions===128&&atlas.columns*atlas.rows===128,'atlas defines 128 direction slots');
  check(atlas.stepDegrees===360/128,'rotation covers a complete turn');
  for(const kind of ['bike','mounted','survivor']){
    const data=atlas[kind];
    check(data.frames.length===128&&data.wheelContacts.length===128,'every variant contains 128 sprites and ground anchors');
    for(let i=0;i<128;i++){
      const [x,y,w,h]=data.frames[i];
      check(w>0&&h>0&&x>=0&&y>=0&&x+w<=data.width&&y+h<=data.height,kind+' crop stays in atlas');
      const left=Math.round(i%16*data.width/16),right=Math.round((i%16+1)*data.width/16),top=Math.round(Math.floor(i/16)*data.height/8),bottom=Math.round((Math.floor(i/16)+1)*data.height/8);
      check(x>=left&&y>=top&&x+w<=right&&y+h<=bottom,kind+' crop never includes a neighboring sprite');
      check(data.wheelContacts[i].length>=1&&data.wheelContacts[i].every(p=>p.length===2&&p.every(Number.isFinite)),kind+' ground anchors have valid nesting');
      check(data.wheelContacts[i].every(([px,py])=>px>=0&&py>=0&&px<=w&&py<=h+1),kind+' wheel anchors stay near silhouette');
      if(kind!=='survivor')check(data.headlightAnchors[i].length===2&&data.headlightAnchors[i].every(Number.isFinite),kind+' headlight has an anchor');
    }
  }
  const layout=source.slice(source.indexOf('  function bikeGroundLayout('),source.indexOf('  const DAY_LENGTH_SECONDS'));
  const masks=source.slice(source.indexOf('  function bikeShadowMask('),source.indexOf('  bikeSpriteSheets.forEach('));
  const api=new Function('atlas',`
    const BIKE_SPRITE_COLUMNS=16,bikeShadowMasks=new Map(),images=[{naturalWidth:atlas.bike.width},{naturalWidth:atlas.mounted.width}];
    const bikeSpriteSource=(direction,riding=false)=>images[riding?1:0],bikeSpriteMetadata=(riding=false)=>atlas[riding?'mounted':'bike'];
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
  const foot=new Function('spriteAtlas',`
    const BIKE_SPRITE_COLUMNS=16,survivorSpriteSheet={complete:true,naturalWidth:1774};let calls=0;
    const ctx={save(){},restore(){},drawImage(){calls++;}},smoothBikeFacing=angle=>({angle}),bikeSpritePose=angle=>({direction:Math.round((angle+Math.PI*2)%(Math.PI*2)/(Math.PI*2/128))%128});
    ${footDrawing}
    return {draw:drawSurvivorSprite,get calls(){return calls;}};
  `)(atlas);
  check(foot.draw(100,120,0,0,false)&&foot.calls===1,'standing survivor draws one cached sprite');
  check(foot.draw(100,120,Math.PI,1,true)&&foot.calls===4,'walking animates body and both boots');
  return assertions+' sprite atlas checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function') {
  const fs=require('fs'),path=require('path');
  console.log(runSpriteAtlasTests(JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/sprites-128/atlas.json'),'utf8')),fs.readFileSync(path.join(__dirname,'../game.js'),'utf8')));
}
