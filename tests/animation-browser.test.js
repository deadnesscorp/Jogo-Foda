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
      check(bikeSpriteSheets[1].width*bikeSpriteSheets[1].height===16*128*128,'Mounted atlas stores only the 16 visible poses');
      for(let direction=0;direction<128;direction+=8){
        const ground=bikeGroundLayout(0,0,50,direction,true),base=bikeGroundLayout(0,0,50,direction,false);
        const scale=ground.width/ground.sw,anchor=spriteAtlas.mounted.riderAnchors[direction];
        check(Math.abs(anchor.height*scale-25*.75)<1e-8,'Seated rider keeps the same reduced height in every direction');
        check(Math.abs(anchor.rearOffset*scale-6*.75)<1e-8,'Seat offset scales together with the motorcycle');
        check(ground.contacts.every((point,i)=>Math.hypot(point[0]-base.contacts[i][0],point[1]-base.contacts[i][1])<1e-8),'Mounting never changes motorcycle scale or wheel contacts');
      }
      check(bikeSpritePose(-.01,0,0).direction===bikeSpritePose(Math.PI*2+.01,0,0).direction,'Rotation wraps without a discontinuity');
      const stable=smoothBikeFacing(Math.PI/16-.01,0,'boundary-test').direction;
      for(let i=1;i<=20;i++)check(smoothBikeFacing(Math.PI/16+(i%2?.01:-.01),i/60,'boundary-test').direction===stable,'Small steering changes must not flicker between poses');
      check(Math.abs(bikeMotion(40,1,true,3).compression-bikeMotion(41,1,true,3).compression)<.001,'Acceleration must not jump the suspension phase');
      let time=0;
      for(const riding of [false,true])for(let direction=0;direction<128;direction++){
        mounted=riding;time+=.017;const angle=direction*Math.PI*2/128;
        ctx.setTransform(RENDER_SCALE,0,0,RENDER_SCALE,0,0);ctx.clearRect(0,0,640,360);
        const pose=drawBike(320,180,angle,100,time);
        check(!!pose.integrated===riding,'Mounted rider must render with the motorcycle');
        const facing=bikeVisualFacings.get('world');
        check(facing.direction%8===0,'Turning selects one complete stable pose');
        const layer=bikeBlendContext.getImageData(0,0,bikeBlendLayer.width,bikeBlendLayer.height).data;
        let solid=0;for(let i=3;i<layer.length;i+=4)if(layer[i]>240)solid++;
        check(solid>80,'Bike must remain visible and opaque');
      }
      for(let frame=0;frame<120;frame++){
        time+=.017;ctx.clearRect(0,0,640,360);
        check(drawSurvivorSprite(320,180,frame/120*Math.PI*2,time,frame%30!==0),'Walking and stopping render in every direction');
      }
      state='drive';mounted=false;keys.clear();player.x=bike.x;player.y=bike.y;
      const sprintStart={x:player.x,y:player.y};let sprintNow=performance.now();lastTime=sprintNow;
      keys.add('d');frame(sprintNow+=1000/60);const walkDistance=player.x-sprintStart.x;
      player.x=sprintStart.x;player.y=sprintStart.y;
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',bubbles:true}));
      frame(sprintNow+=1000/60);const runDistance=player.x-sprintStart.x;
      check(Math.abs(walkDistance*60*BIKE_SPEED_TO_KMH-20)<.001,'Actual walking speed is 20 km/h');
      check(Math.abs(runDistance*60*BIKE_SPEED_TO_KMH-40)<.001,'Actual Shift running speed is 40 km/h');
      window.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));
      player.x=sprintStart.x;player.y=sprintStart.y;frame(sprintNow+=1000/60);
      check(Math.abs((player.x-sprintStart.x)/walkDistance-1)<.001,'Releasing Shift restores walking speed immediately');
      keys.clear();bikeVisualFacings.clear();
      drawSurvivorSprite(320,180,0,100,true);drawSurvivorSprite(320,180,0,100.05,true);
      const walkPhase=bikeVisualFacings.get('survivor').walkPhase;
      const runner=bikeVisualFacings.get('survivor');runner.walkPhase=0;
      keys.add('shift');drawSurvivorSprite(320,180,0,100.1,true);
      check(Math.abs(runner.walkPhase/walkPhase-1.3/.8)<1e-8,'Running has a faster, human-paced animation cadence');
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
        bikeVisualFacings.clear();drawSurvivorSprite(x,y+94,angle,30+i,true);
      }
      const preview=canvas.toDataURL('image/png');
      ctx.fillStyle='#26323c';ctx.fillRect(0,0,640,360);
      for(let heading=0;heading<8;heading++)for(let step=0;step<8;step++){
        bikeVisualFacings.clear();const angle=heading*Math.PI/4;
        const facing=smoothBikeFacing(angle,100,'survivor');facing.walkPhase=step;facing.walkTime=100;
        drawSurvivorSprite(40+step*80,40+heading*43,angle,100,true);
        check(Math.floor(facing.walkPhase)%8===step,'All eight directional walk frames render');
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
