// Run with: node tests/animation-browser.test.js [path/to/chrome]
// Uses a real headless Chromium browser and the game's actual canvas renderer.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const browser=process.argv[2]||[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(file=>fs.existsSync(file));
if(!browser)throw Error('Pass the path to a Chromium browser as the first argument.');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jogo-animation-'));
const missingResources=[];
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    let data=fs.readFileSync(file);
    if(file===path.join(root,'game.js')){
      // Test-only access to the closure; the shipped game has no debug API.
      data=data.toString().replaceAll('requestAnimationFrame(frame);','')
        .replace(/\}\)\(\);\s*$/, 'window.__gameEval=code=>eval(code);})();');
    }
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch{if(!req.url.startsWith('/favicon.ico'))missingResources.push(req.url);res.writeHead(404).end();}
});
let child,ws,sequence=0;const pending=new Map(),errors=[];
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const deadline=Date.now()+20000,portFile=path.join(profile,'DevToolsActivePort');
  let port;
  while(!port){
    try{
      const candidate=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();
      if(/^\d+$/.test(candidate))port=candidate;
    }catch(error){if(!['ENOENT','EBUSY','EACCES'].includes(error.code))throw error;}
    if(port)break;
    if(Date.now()>deadline)throw Error('Browser startup timed out');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text+': '+(message.params.exceptionDetails.exception?.description||''));
    const callback=pending.get(message.id);if(callback){pending.delete(message.id);message.error?callback.reject(Error(message.error.message)):callback.resolve(message.result);}
  };
  function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){
    const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  }
  await call('Runtime.enable');await call('Page.enable');
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await evaluate(`new Promise((resolve,reject)=>{let attempts=0;const poll=()=>{if(window.__gameEval&&__gameEval('bikeSpritesReady()&&survivorSpriteSheet.complete&&survivorWalkSpriteSheet.complete&&survivorWalkSpriteSheet.naturalWidth>0'))resolve(true);else if(++attempts>200)reject(Error('Game load timed out'));else setTimeout(poll,50);};poll();})`);
  async function fullscreenState(expected){
    await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{const active=!!document.fullscreenElement||document.body.classList.contains('game-fullscreen');if(active===${expected})requestAnimationFrame(()=>requestAnimationFrame(resolve));else if(++tries>100)reject(Error('Fullscreen toggle did not complete'));else setTimeout(poll,50);};poll();})`);
  }
  for(const expected of [true,false]){
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'p',code:'KeyP',windowsVirtualKeyCode:80});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'p',code:'KeyP',windowsVirtualKeyCode:80});
    await fullscreenState(expected);
  }
  for(const expected of [true,false]){
    const point=await evaluate(`(()=>{const r=document.querySelector('#fullscreen-toggle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await fullscreenState(expected);
  }
  console.log('Fullscreen keyboard P and button toggles passed in Chromium.');
  if(process.env.JOGO_FOOT_IDLE_PREVIEW==='1'){
    const result=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
      startGame();mounted=false;
      canvas.width=1600;canvas.height=1000;ctx.setTransform(2.5,0,0,2.5,0,0);
      ctx.fillStyle='#29323c';ctx.fillRect(0,0,640,400);
      let checks=0;
      const inputNames=['W','W + D','D','D + S','S (baixo)','S + A','A (esquerda)','A + W'];
      for(let i=0;i<8;i++){
        const angle=projectFacing(i*Math.PI/4),x=80+(i%4)*160,y=110+Math.floor(i/4)*200;
        const gait=createFootGait(),walk=spriteAtlas.survivor.walk,expected=footHeading(angle,walk.directions);
        updateFootGait(gait,3,angle,footWalkSpeed(),1/30,walk);
        drawSurvivorSprite(x-24,y,angle,gait);
        if(gait.heading!==expected)throw Error('Walking did not follow '+inputNames[i]);checks++;
        for(let tick=0;tick<86;tick++)updateFootGait(gait,0,0,footWalkSpeed(),1/60,walk);
        drawSurvivorSprite(x+24,y,0,gait);
        if(gait.stage!=='idle'||gait.heading!==expected)throw Error('Stopping changed facing for '+inputNames[i]);checks++;
        drawSurvivorSprite(-100,-100,Math.PI/4,gait);
        if(gait.heading!==expected)throw Error('Idle facing drifted for '+inputNames[i]);checks++;
        ctx.fillStyle='#d9e3ed';ctx.font='8px sans-serif';ctx.fillText(inputNames[i],x-18,y+22);
        ctx.font='6px sans-serif';ctx.fillText('andando',x-38,y+38);ctx.fillText('parado',x+13,y+38);
      }
      return {checks,preview:canvas.toDataURL('image/png')};
    })()` )})`);
    if(errors.length||missingResources.length)throw Error([...errors,...missingResources].join('\n'));
    const output=path.join(root,'assets/sprites-128/parar-direcao-preview.png');
    fs.writeFileSync(output,Buffer.from(result.preview.split(',')[1],'base64'));
    console.log(result.checks+' quick-turn and idle-facing browser checks passed');console.log('Preview: '+output);
    return;
  }
  if(process.env.JOGO_MOUNTED_PREVIEW==='1'){
    const result=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
      startGame();mounted=true;bikeEngineRunning=false;
      canvas.width=1600;canvas.height=1000;ctx.setTransform(2.5,0,0,2.5,0,0);
      ctx.fillStyle='#29323c';ctx.fillRect(0,0,640,400);
      let checks=0;
      if(spriteAtlas.mounted.file!=='unified-mounted-art')throw Error('Old layered rider compositor is still active');
      checks++;
      const originalDraw=CanvasRenderingContext2D.prototype.drawImage,drawSources=[];
      CanvasRenderingContext2D.prototype.drawImage=function(image,...args){drawSources.push(image);return originalDraw.call(this,image,...args);};
      try{
        createMountedRiderAtlas({rider:seatedRiderSpriteSheet,bike:bikeSpriteSheets[0],atlas:spriteAtlas,layout:d=>bikeGroundLayout(0,0,50,d,false,1)});
      }finally{CanvasRenderingContext2D.prototype.drawImage=originalDraw;}
      if(drawSources.length!==128*9||drawSources.some(image=>image!==seatedRiderSpriteSheet))throw Error('Each mounted pose must draw only one unified sprite, without duplicate limbs or motorcycle overlays');
      checks++;
      for(let direction=0;direction<128;direction++){
        const ground=bikeGroundLayout(0,0,50,direction,true);
        const source=spriteAtlas.mounted.sourceDirections[direction],crop=MOUNTED_BIKE_ART.frames[source],contacts=MOUNTED_BIKE_ART.wheelContacts[source];
        const ax=contacts.reduce((n,p)=>n+p[0],0)/contacts.length,ay=contacts.reduce((n,p)=>n+p[1],0)/contacts.length;
        const artScale=36/crop[3]*ACTOR_VISUAL_SCALE;
        if(!ground.contacts.every((p,i)=>Math.hypot(p[0]-(contacts[i][0]-ax)*artScale,p[1]-5-(contacts[i][1]-ay)*artScale)<1e-8))throw Error('Shadow does not follow mounted tire scale at '+direction);
        checks++;
        const [x,y,w,h]=spriteAtlas.mounted.frames[direction];
        if(x<0||y<0||x+w>bikeSpriteSheets[1].width||y+h>bikeSpriteSheets[1].height)throw Error('Mounted frame outside sheet');
        checks++;
        const pixels=bikeSpriteSheets[1].getContext('2d');
        for(const [px,py] of spriteAtlas.mounted.wheelContacts[direction]){
          const sample=pixels.getImageData(Math.floor(x+px)-1,Math.floor(y+py)-1,3,3).data;
          let touches=false;for(let i=3;i<sample.length;i+=4)if(sample[i]>64)touches=true;
          if(!touches)throw Error('Tire anchor points into empty space at '+direction);
          checks++;
        }
      }
      for(let i=0;i<16;i++){
        const x=80+(i%4)*160,y=80+Math.floor(i/4)*100,angle=i*Math.PI/8;
        bikeVisualFacings.clear();drawBike(x,y,angle,0,30+i);
        ctx.fillStyle='#d9e3ed';ctx.font='9px sans-serif';ctx.fillText(String(i*8)+' / 128',x-18,y+22);
      }
      const preview=canvas.toDataURL('image/png');
      canvas.width=1800;canvas.height=900;ctx.setTransform(6,0,0,6,0,0);
      ctx.fillStyle='#29323c';ctx.fillRect(0,0,300,150);
      [24,32,40,88,96,104].forEach((direction,i)=>{
        const x=50+(i%3)*100,y=60+Math.floor(i/3)*75;
        bikeVisualFacings.clear();drawBike(x,y,direction*Math.PI*2/128,0,60+i);
        ctx.fillStyle='#d9e3ed';ctx.font='4px sans-serif';ctx.fillText(direction+' / 128',x-8,y+10);
      });
      return {checks,preview,detail:canvas.toDataURL('image/png')};
    })()` )})`);
    if(errors.length||missingResources.length)throw Error([...errors,...missingResources].join('\n'));
    const output=path.join(root,'assets/sprites-128/piloto-moto-preview.png');
    fs.writeFileSync(output,Buffer.from(result.preview.split(',')[1],'base64'));
    fs.writeFileSync(path.join(root,'assets/sprites-128/piloto-moto-laterais.png'),Buffer.from(result.detail.split(',')[1],'base64'));
    console.log(result.checks+' mounted rider browser checks passed');console.log('Preview: '+output);
    // Also exercise the user's double-click/index.html workflow. HTTP alone
    // does not expose canvas security errors caused by local image readback.
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__mountedSpriteDraws=0;window.__riderCompositionDraws=0;
      const originalDrawImage=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
        if(image instanceof HTMLCanvasElement&&image.width===2048&&image.height===9216)window.__mountedSpriteDraws++;
        if(image instanceof HTMLImageElement&&/piloto-moto-(unificado|angular)\.png/.test(image.src))window.__riderCompositionDraws++;
        return originalDrawImage.call(this,image,...args);
      };
    `});
    await call('Page.navigate',{url:require('node:url').pathToFileURL(path.join(root,'index.html')).href});
    await evaluate(`new Promise((resolve,reject)=>{let attempts=0;const poll=()=>{
      if(window.__riderCompositionDraws>0&&document.querySelector('#start-game'))resolve(true);
      else if(++attempts>300)reject(Error('Local-file rider composition did not load'));else setTimeout(poll,50);
    };poll();})`);
    await evaluate(`document.querySelector('#start-game').click();window.dispatchEvent(new KeyboardEvent('keydown',{key:'f',bubbles:true}));`);
    await evaluate(`new Promise((resolve,reject)=>{let attempts=0;const poll=()=>{
      if(window.__mountedSpriteDraws>0)resolve(true);else if(++attempts>150)reject(Error('Local-file mounted sprites were not rendered'));else setTimeout(poll,50);
    };poll();})`);
    if(errors.length)throw Error(errors.join('\n'));
    console.log('Local index.html: separate rider composed and mounted sprites rendered without canvas security errors.');
    return;
  }
  const result=await evaluate(`__gameEval(${JSON.stringify(`
    (()=>{
      let checks=0;const check=(ok,message)=>{checks++;if(!ok)throw Error(message);};
      check(!document.fullscreenElement&&!!document.querySelector('#fullscreen-toggle')&&!document.body.classList.contains('game-fullscreen'),'Game must start inside the page with optional fullscreen');
      document.querySelector('#start-game').click();
      check(!document.fullscreenElement,'Starting must not enter fullscreen');
      bikeInspectOpen=true;bikeInspectTab='Motor';startBikeService('motor',2);
      check(bikeService.job[2]==='engineHole','Engine hole replaces circuit clearing');
      finishFrame(0,.016);
      const fuelBeforeLeak=fuel;updateBikeCondition(1,0);
      check(fuel<fuelBeforeLeak,'Damaged housing leaks in the actual game');
      for(let point=1;point<=4;point++) {
        keyDown({key:String(point),repeat:false,preventDefault(){}});
        for(let dose=0;dose<8&&bikeService.phase==='play';dose++) {
          keyDown({key:'e',repeat:false,preventDefault(){}});updateBikeService(.2);
          finishFrame(dose*.2,.016);
        }
      }
      check(bikeService.phase==='done'&&bikeFuelLeakRate()===0,'Keyboard seals all four points and stops the leak');
      startGame();
      bikeEngineRunning=true;bike.steering=.5;
      check(bikeSpriteSheets[1].width*bikeSpriteSheets[1].height===128*9*128*128,'Mounted atlas stores 128 headings and nine banking poses');
      for(let direction=0;direction<128;direction++){
        const ground=bikeGroundLayout(0,0,50,direction,true),base=bikeGroundLayout(0,0,50,direction,false);
        const scale=ground.width/ground.sw,anchor=spriteAtlas.mounted.riderAnchors[direction];
        check(Math.abs(anchor.height*scale-24*.75)<1e-8,'Seated rider keeps the reduced full-body scale');
        check(Math.abs(anchor.rearOffset*scale-3.375*.75)<1e-8,'Seat offset scales together with the motorcycle');
        check(Math.abs(ground.contacts.reduce((sum,p)=>sum+p[1],0)/ground.contacts.length-5)<1e-8,'Mounted tires keep their contact center on the ground');
      }
      check(bikeSpritePose(-.01,0,0).direction===bikeSpritePose(Math.PI*2+.01,0,0).direction,'Rotation wraps without a discontinuity');
      const stable=smoothBikeFacing(Math.PI/16-.001,0,'boundary-test').direction;
      for(let i=1;i<=20;i++)check(smoothBikeFacing(Math.PI/16+(i%2?.001:-.001),i/60,'boundary-test').direction===stable,'Small steering changes must not flicker between poses');
      check(Math.abs(bikeMotion(40,1,true,3).compression-bikeMotion(41,1,true,3).compression)<.001,'Acceleration must not jump the suspension phase');
      let time=0;
      for(const riding of [false,true])for(let direction=0;direction<128;direction++){
        mounted=riding;time+=.017;const angle=direction*Math.PI*2/128;
        ctx.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,0,0);ctx.clearRect(0,0,640,360);
        const pose=drawBike(320,180,angle,100,time);
        check(!!pose.integrated===riding,'Mounted rider must render with the motorcycle');
        const facing=bikeVisualFacings.get('world');
        check(Number.isInteger(facing.direction)&&facing.direction>=0&&facing.direction<128,'Turning keeps a valid shadow and lamp direction');
        const layer=bikeBlendContext.getImageData(0,0,bikeBlendLayer.width,bikeBlendLayer.height).data;
        let solid=0;for(let i=3;i<layer.length;i+=4)if(layer[i]>240)solid++;
        check(solid>80,'Bike must remain visible and opaque');
      }
      const walk=spriteAtlas.survivor.walk,gait=createFootGait();
      for(let tick=0;tick<120;tick++){
        const angle=tick/120*Math.PI*2;
        updateFootGait(gait,tick%30!==0?.7:0,angle,footWalkSpeed(),.017,walk);
        ctx.clearRect(0,0,640,360);
        check(drawSurvivorSprite(320,180,angle,gait),'Walking and stopping render in every direction');
      }
      state='drive';mounted=false;keys.clear();player.x=bike.x;player.y=bike.y;player.gait=null;
      let sprintNow=performance.now();lastTime=sprintNow;
      keys.add('d');
      let walkDraws=0,walkingFrames=0;
      const drawImage=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
        if(image===survivorWalkSpriteSheet||image===survivorWalkMotionSheet)walkDraws++;
        return drawImage.call(this,image,...args);
      };
      try{
        for(let tick=0;tick<24;tick++){
          walkDraws=0;
          frame(sprintNow+=1000/60);
          check(walkDraws<=1,'Each displayed frame draws at most one walking sprite');
          if(walkDraws===1)walkingFrames++;
        }
        check(walkingFrames>0,'The gameplay loop draws the walking sprite');
      }finally{
        CanvasRenderingContext2D.prototype.drawImage=drawImage;
      }
      const walkSpeed=player.gait.vx,walkFrame=footAtlasFrame(player.gait.phase,walk,false,player.gait.pingPong,player.gait.heading);
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',bubbles:true}));
      frame(sprintNow+=1000/60);
      check(player.gait.vx>walkSpeed&&player.gait.vx<2*walkSpeed,'Shift accelerates progressively in the game loop');
      check(Math.abs(footAtlasFrame(player.gait.phase,walk,true,false)-walkFrame)<=2,'Shift keeps the current stride phase');
      for(let tick=0;tick<24;tick++)frame(sprintNow+=1000/60);
      const runSpeed=player.gait.vx;
      check(runSpeed>walkSpeed*1.9,'Running reaches the configured pace');
      window.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));
      frame(sprintNow+=1000/60);
      check(player.gait.vx>walkSpeed&&player.gait.vx<runSpeed,'Releasing Shift decelerates progressively in the game loop');
      keys.clear();for(let tick=0;tick<86;tick++)frame(sprintNow+=1000/60);
      check(player.gait.stage==='idle'&&player.gait.vx===0,'Releasing movement returns to a planted idle pose');
      mounted=true;check(footSpeedMultiplier()===1,'Shift does not change motorcycle controls');
      state='climb';mounted=false;check(footSpeedMultiplier()===1,'Shift does not accelerate climbing');
      state='drive';keys.clear();lastTime=0;
      mounted=true;bikeEngineRunning=true;gameTime=60;keys.add('w');keys.add('a');
      let now=performance.now();
      for(let tick=0;tick<18;tick++){frame(now+=1000/60);check(Number.isFinite(bike.x+bike.y+bike.speed),'Driving and night lighting must stay valid');}
      keys.clear();mounted=false;player.x=bike.x+20;player.y=bike.y;
      keys.add('d');
      for(let tick=0;tick<18;tick++){frame(now+=1000/60);check(Number.isFinite(player.x+player.y),'Walking in the actual game loop must stay valid');}
      keys.clear();
      startChase();
      exploreBuilding=0;
      for(const mode of ['chase','grapple','climb','hack','explore','ending']){
        state=mode;finishFrame(time,.016);
        check(W>0&&H>0,'Scene renders after cleanup: '+mode);
      }
      state='explore';
      for(const room of [0,1,2,3,10]){exploreBuilding=room;finishFrame(time,.016);check(W>0,'Interior renders: '+room);}
      state='drive';W=640;H=360;
      // A contact sheet from the actual renderer for visual review.
      ctx.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,0,0);
      ctx.fillStyle='#26323c';ctx.fillRect(0,0,640,360);
      for(let i=0;i<16;i++){
        const x=40+(i%8)*80,y=80+Math.floor(i/8)*160,angle=i*Math.PI/8;
        bikeVisualFacings.clear();mounted=true;drawBike(x,y,angle,80,30+i);
        bikeVisualFacings.clear();mounted=false;drawBike(x,y+48,angle,0,30+i);
        drawSurvivorSprite(x,y+94,angle,{stage:'loop',heading:footHeading(angle,walk.directions),phase:0});
      }
      const preview=canvas.toDataURL('image/png');
      ctx.fillStyle='#26323c';ctx.fillRect(0,0,640,360);
      for(let heading=0;heading<walk.directions;heading++)for(let step=0;step<walk.frameCount;step++){
        const columnWidth=640/walk.frameCount;
        check(drawSurvivorSprite((step+.5)*columnWidth,40+heading*43,heading*Math.PI/4,{stage:'loop',heading,phase:step}),
          'Every directional walk frame renders');
      }
      return {checks,preview,walkingPreview:canvas.toDataURL('image/png')};
    })()
  `)})`);
  if(errors.length)throw Error(errors.join('\n'));
  if(missingResources.length)throw Error('Missing game resources: '+missingResources.join(', '));
  const output=path.join(os.tmpdir(),'jogo-animation-preview.png');
  fs.writeFileSync(output,Buffer.from(result.preview.split(',')[1],'base64'));
  const walkingOutput=path.join(os.tmpdir(),'jogo-walking-preview.png');
  fs.writeFileSync(walkingOutput,Buffer.from(result.walkingPreview.split(',')[1],'base64'));
  console.log(result.checks+' browser animation checks passed');console.log('Preview: '+output);
  console.log('Walking preview: '+walkingOutput);
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/assets/sprites-128/andar-preview.html'});
  await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{if(document.querySelector('#status')?.textContent.startsWith('Quadro '))resolve(true);else if(++tries>100)reject(Error('Walking preview did not load'));else setTimeout(poll,50);};poll();})`);
  await evaluate(`(async()=>{
    document.querySelector('#play').click();
    const step=document.querySelector('#step');step.value=6;step.dispatchEvent(new Event('input'));
    document.querySelector('#direction').selectedIndex=4;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(document.querySelector('#status').textContent!=='Quadro 7 / 8')throw Error('Walking preview controls did not select the requested frame');
    return true;
  })()`);
  if(errors.length||missingResources.length)throw Error([...errors,...missingResources].join('\n'));
  console.log('Animated walking preview loaded; direction, pause and frame controls passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  ws?.close();child?.kill();server.close();
  // Keep only this run's temporary profile for the OS to reclaim; Chromium may
  // still have background processes finishing writes when its parent exits.
});
