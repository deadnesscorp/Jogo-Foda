// Run with: node tests/start-browser.test.js [path/to/chrome-or-edge]
// Exercise the unmodified game over HTTP and by opening index.html directly.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const smokeOnly=process.argv.includes('--smoke');
const stationsOnly=process.argv.includes('--stations');
const forestOnly=process.argv.includes('--forest')||stationsOnly;
const interiorsOnly=process.argv.includes('--interiors');
const cityOnly=process.argv.includes('--city');
const motorOnly=process.argv.includes('--motor');
const creatureOnly=process.argv.includes('--creatures');
const dragOnly=process.argv.includes('--drag');
const occlusionOnly=process.argv.includes('--occlusion');
const ignitionOnly=process.argv.includes('--ignition');
const combatOnly=process.argv.includes('--combat');
const browser = process.argv.slice(2).find(arg=>!arg.startsWith('--')) || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(file => fs.existsSync(file));
assert(browser, 'Chrome or Edge must be installed');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jogo-start-'));
const errors = [], missing = [];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let data = fs.readFileSync(file);
    if((motorOnly||cityOnly||interiorsOnly||forestOnly)&&path.extname(file)==='.css')data=data.toString().replace(/@import[^;]+;/g,'');
    if((cityOnly||motorOnly||dragOnly||occlusionOnly||combatOnly||interiorsOnly||forestOnly)&&file===path.join(root,'src/game.js')){
      // Test-only access to the closure; local files keep the shipped game intact.
      data=data.toString().replace(/\}\)\(\);\s*$/, 'window.__gameEval=code=>eval(code);})();');
    }
    res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    if (pathname !== '/favicon.ico') missing.push(pathname);
    res.writeHead(404).end();
  }
});
let child, ws, sequence = 0;
const pending = new Map();
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], {windowsHide:true, stdio:'ignore'});
  child.on('error', error => errors.push(error.message));
  const deadline = Date.now() + 30000;
  let port;
  while (!port) {
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch {}
    if (Date.now() > deadline) throw Error('Browser startup timed out');
    if (!port) await new Promise(resolve => setTimeout(resolve, 100));
  }
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      message.error ? callback.reject(Error(message.error.message)) : callback.resolve(message.result);
    }
  };
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.addScriptToEvaluateOnNewDocument', {source:`
    window.__frames = 0;
    if(${ignitionOnly}){
      let factory;
      Object.defineProperty(window,'createBikeIgnition',{configurable:true,get(){return factory;},set(create){
        factory=options=>{
          window.__ignitionOptions=options;window.__engineStarts=0;
          const model=create({...options,random:()=>0,onStart(){window.__engineStarts++;options.onStart();}});
          window.__ignition=model;return model;
        };
      }});
    }
    // Capture the model without exposing test hooks in the shipped game.
    let healthAPI;
    Object.defineProperty(window, 'CharacterHealth', {configurable:true,
      get(){return healthAPI;},set(api){
        healthAPI=api;const create=api.create;
        api.create=(...args)=>{const model=create(...args);window.__healthModel=model;return model;};
      }
    });
    let mossAPI;
    Object.defineProperty(window,'MossCreatures',{configurable:true,get(){return mossAPI;},set(api){
      mossAPI=api;const create=api.createEcology;
      api.createEcology=(...args)=>{
        const model=create(...args),update=model.update;
        model.update=(dt,context)=>{
          if(context.sounds?.some(sound=>sound.kind==='steps'||sound.kind==='running'))window.__heardPlayerSteps=true;
          if(context.sounds?.some(sound=>sound.kind==='motor'))window.__rollingBikeSound=true;
          return update(dt,context);
        };
        return model;
      };
    }});
    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => originalRAF.call(window, time => { window.__frames++; callback(time); });
  `});
  for (const url of ['http://127.0.0.1:' + server.address().port + '/', pathToFileURL(path.join(root, 'index.html')).href]) {
    if((cityOnly||interiorsOnly||forestOnly)&&url.startsWith('file:'))continue;
    await call('Page.navigate', {url});
    await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{
      if(document.readyState==='complete'&&window.__frames>2)resolve(true);
      else if(++tries>300)reject(Error('Game did not initialize'));else setTimeout(poll,50);
    };poll();})`);
    const point = await evaluate(`(()=>{const r=document.querySelector('#start-game').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await call('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', clickCount:1, ...point});
    await call('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...point});
    const frames = await evaluate('window.__frames');
    await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{
      if(window.__frames>${frames}+5)resolve(true);
      else if(++tries>300)reject(Error('Game stopped rendering after start'));else setTimeout(poll,50);
    };poll();})`);
    assert.deepEqual(errors, [], 'Starting the game must not throw');
    assert(await evaluate(`document.querySelector('#title-screen').classList.contains('dismissed')`), 'Start button must dismiss the title');
    assert(await evaluate('window.__frames') > frames + 5, 'Game must keep rendering after start');
    await call('Input.dispatchKeyEvent', {type:'keyDown', key:'w', code:'KeyW', windowsVirtualKeyCode:87});
    await evaluate(`new Promise(resolve=>setTimeout(resolve,350))`);
    await call('Input.dispatchKeyEvent', {type:'keyUp', key:'w', code:'KeyW', windowsVirtualKeyCode:87});
    if(stationsOnly){
      const stationResult=await evaluate('__gameEval('+JSON.stringify(`(()=>{
        const index=buildings.findIndex((b,i)=>isGasStation(i)),door=buildingDoor(index),s=supplies[index];
        keys.clear();mossEcology.entities.length=0;mounted=false;state='drive';
        Object.assign(player,door);Object.assign(bike,door);bike.speed=0;fuel=20;
        const before=s.fuelUses;refuelAtStation();
        const refueled=fuel===100&&s.fuelUses===before-1;
        bike.x=door.x+55; // Park beside the entrance so E selects the door.
        interact();const entered=state==='explore'&&exploreBuilding===index;
        for(const [x,y] of [[322,211],[245,235],[190,170]]){explorer.x=x;explorer.y=y;finishFrame(10,0);}
        const collected=Object.values(s.stock).every(n=>n===0);
        explorer.x=78;explorer.y=200;interact();const exited=state==='drive';
        camera.x=door.x;camera.y=door.y;finishFrame(10,0);
        return {refueled,entered,collected,exited,count:buildings.filter((b,i)=>isGasStation(i)).length};
      })()`)+')');
      assert(stationResult.refueled&&stationResult.entered&&stationResult.collected&&stationResult.exited,JSON.stringify(stationResult));
      assert.deepEqual(errors,[]);console.log('Gas station browser: '+JSON.stringify(stationResult));continue;
    }
    if(forestOnly){
      const result=await evaluate('__gameEval('+JSON.stringify(`(()=>{
        const r=forest.region;keys.clear();mossEcology.entities.length=0;mounted=false;
        state='drive';player.x=r.x;player.y=r.y;camera.x=r.x;camera.y=r.y;hudDetails=false;
        toastTimer=0;toast.classList.remove('visible');finishFrame(60,0);
        const trees=forest.items.filter(p=>p.kind==='tree');
        return {count:forest.items.length,trees:trees.length,collision:trees.every(p=>worldBlocked(p.x,p.y,4)),roads:forest.items.every(p=>!nearAnyRoad(p.x,p.y,115))};
      })()`)+')');
      assert(result.count>500&&result.trees>200,'Map has abundant vegetation');
      assert(result.collision,'All tree trunks block movement');assert(result.roads,'Roads remain clear');
      const shot=await call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(root,'previews','forest-review.png'),Buffer.from(shot.data,'base64'));
      assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
      console.log('Forest browser: '+JSON.stringify(result));continue;
    }
    if(interiorsOnly){
      const seen=new Set();
      for(const index of [0,6,12,3,1,2,148]){
        const result=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
          keys.clear();mossEcology.entities.length=0;state='explore';exploreBuilding=${index};
          mounted=false;checkpointReturn=null;shelterView=null;shelterLife.reset();
          explorer.x=184;explorer.y=226;explorer.gait=null;hudDetails=false;
          toastTimer=0;toast.classList.remove('visible');
          supplies[exploreBuilding].available=false;finishFrame(10,0);
          return {variant:interiorType(exploreBuilding),safe:isShelter(exploreBuilding)};
        })()`)} )`);
        if(!result.safe)seen.add(result.variant);
        const shot=await call('Page.captureScreenshot',{format:'png'});
        fs.mkdirSync(path.join(root,'previews'),{recursive:true});
        fs.writeFileSync(path.join(root,'previews',`interior-${result.variant+1}${result.safe?'-shelter':''}.png`),Buffer.from(shot.data,'base64'));
        if(result.safe){
          const observation=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
            const before=JSON.stringify({player,explorer,camera,worldReturn});
            const originals={drawFootWorld,drawPersonCastShadow,drawDriveHud,drawBike};
            let people=0,shadows=0,hud=0,bikes=0;
            drawFootWorld=()=>people++;drawPersonCastShadow=()=>shadows++;
            drawDriveHud=()=>hud++;drawBike=(...args)=>{bikes++;return originals.drawBike(...args);};
            let viewport,unchanged;
            try{
              shelterKey('o');finishFrame(60,0);viewport={...gameScene};
              unchanged=before===JSON.stringify({player,explorer,camera,worldReturn});
            }finally{
              ({drawFootWorld,drawPersonCastShadow,drawDriveHud,drawBike}=originals);
            }
            const inside=state==='explore';
            shelterKey('escape');finishFrame(60,0);
            return {people,shadows,hud,bikes,viewport,unchanged,inside,returned:shelterView===null&&gameScene.width===480};
          })()`)} )`);
          assert.equal(observation.people,0,'Observing outside never draws the indoor player at the door');
          assert.equal(observation.shadows,0,'The indoor player casts no outdoor shadow');
          assert.equal(observation.hud,0,'Street interaction panels stay hidden while observing');
          assert.equal(observation.bikes,1,'The parked motorcycle remains visible');
          assert.deepEqual(observation.viewport,{x:0,y:0,width:640,height:360},'Exterior fills the display without the interior rectangle');
          assert(observation.unchanged&&observation.inside&&observation.returned,'Observation preserves positions and returns to the interior');
        }
        const checks=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
          const original=RoomInteriors.draw;let redraws=0;
          RoomInteriors.draw=(...args)=>{redraws++;return original(...args);};
          finishFrame(10,0);finishFrame(11,0);RoomInteriors.draw=original;
          const item=supplies[exploreBuilding];item.type='water';item.available=true;item.found=false;thirst=40;
          explorer.x=322;explorer.y=211;finishFrame(10,0);
          const collected=item.found&&thirst>=50&&thirst<=100;
          let slept=true;
          if(isShelter(exploreBuilding)){explorer.x=153;explorer.y=200;interact();slept=shelterLife.activity?.kind==='sleep';shelterLife.reset();}
          explorer.x=78;explorer.y=200;interact();
          return {redraws,collected,slept,exited:state==='drive',cache:roomInteriorCache.size};
        })()`)} )`);
        assert.equal(checks.redraws,0,'Interior artwork is reused between frames');
        assert(checks.collected,'Supplies remain collectible on the table');
        assert(checks.slept,'Safe-house bed remains usable');
        assert(checks.exited,'Door returns to the street');
        assert(checks.cache<=7,'Interior cache stays bounded: six house variants plus the cabin');
      }
      assert.equal(seen.size,3,'Ordinary houses use three different designs');
      const catalogue=await evaluate(`(()=>{
        const canvas=document.createElement('canvas');canvas.width=2580;canvas.height=680;
        const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#101b1d';ctx.fillRect(0,0,1290,340);
        for(let i=0;i<3;i++){
          ctx.save();ctx.translate(i*430,14);RoomInteriors.draw(ctx,i);
          ctx.fillStyle='#d3c59e';ctx.font='bold 10px monospace';ctx.textAlign='center';
          ctx.fillText(RoomInteriors.TYPES[i].name,230,310);ctx.restore();
        }
        return canvas.toDataURL('image/png').split(',')[1];
      })()`);
      fs.writeFileSync(path.join(root,'previews','interiors-three-designs.png'),Buffer.from(catalogue,'base64'));
      assert.deepEqual(errors,[],'All interiors render without browser errors');
      assert.deepEqual(missing,[],'All interior resources load');
      console.log('Three interiors and safe-house variants: render, cache, supplies, bed and exit passed');
      continue;
    }
    if(cityOnly){
      if(url.startsWith('file:'))continue;
      const stats=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
        keys.clear();const oldRandom=Math.random;let value=20261114;
        Math.random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
        generateMapLayout();Math.random=oldRandom;
        let overlaps=0;for(let i=0;i<buildings.length;i++)for(let j=0;j<i;j++){
          const [x,y,w,h]=buildings[i],[a,b,c,d]=buildings[j];
          if(x<a+c*1.65&&x+w*1.65>a&&y<b+d*1.65&&y+h*1.65>b)overlaps++;
        }
        const centers=buildings.map(([x,y,w,h])=>({x:x+w*.825,y:y+h*.825}));
        centers.sort((a,b)=>centers.filter(p=>Math.hypot(p.x-b.x,p.y-b.y)<650).length-centers.filter(p=>Math.hypot(p.x-a.x,p.y-a.y)<650).length);
        let rasterizations=0;const original=UrbanStructures.draw;
        UrbanStructures.draw=(...args)=>{rasterizations++;return original(...args);};
        urbanSpriteCache.clear();urbanSpriteBytes=0;
        const focus=centers[0];camera.x=focus.x;camera.y=focus.y;
        const begin=performance.now();drawIsoDepthObjects(10,false);const cold=performance.now()-begin;
        // Warm the full camera path before checking for redundant rebuilding.
        for(let i=0;i<60;i++){camera.x=focus.x+i*.25;drawIsoDepthObjects(10,false);}
        camera.x=focus.x;
        const first=rasterizations,times=[];
        for(let i=0;i<60;i++){camera.x+=.25;const start=performance.now();drawIsoDepthObjects(10+i/60,false);times.push(performance.now()-start);}
        UrbanStructures.draw=original;times.sort((a,b)=>a-b);
        return {buildings:buildings.length,overlaps,coldMs:cold,p95Ms:times[56],firstRasters:first,repeatedRasters:rasterizations-first,cacheMB:urbanSpriteBytes/1024/1024};
      })()`)} )`);
      console.log('City rendering: '+JSON.stringify(stats));
      assert.equal(stats.overlaps,0,'Generated buildings must not overlap');
      assert.equal(stats.repeatedRasters,0,'Moving through a block reuses cached building artwork');
      assert.deepEqual(errors,[],'City rendering must not throw');
      continue;
    }
    if(motorOnly){
      if(url.startsWith('file:'))continue;
      await evaluate(`__gameEval("keys.clear();mossEcology.entities.length=0;bikeEngineRunning=false;mounted=false;bike.speed=0;fuel=68;bikeLife=100;player.x=bike.x;player.y=bike.y;mount();")`);
      assert(await evaluate(`__gameEval('mounted&&ignition.active&&!bikeEngineRunning')`),'Mounting a stopped bike opens the key minigame');
      const points=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
        const bounds=canvas.getBoundingClientRect(),view=ignition.viewport;
        const point=(x,y)=>({x:bounds.left+(view.x+x*view.scale)/DISPLAY_W*bounds.width,
          y:bounds.top+(view.y+y*view.scale)/DISPLAY_H*bounds.height});
        return {home:point(214,156),lock:point(318,131)};
      })()` )})`);
      await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...points.home});
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...points.lock});
      await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...points.lock});
      const startedOnExit=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
        ignition.key({key:'Enter',repeat:false,preventDefault(){}});
        if(ignition.snapshot.phase!=='success')throw Error('Healthy engine must start');
        keyDown({key:'f',repeat:false,preventDefault(){}});
        return bikeEngineRunning&&!mounted&&!ignition.active;
      })()` )})`);
      assert(startedOnExit,'Dismounting during the success animation preserves the successful start');
      await evaluate(`new Promise(resolve=>setTimeout(resolve,1200))`);
      assert(await evaluate(`__gameEval('bikeEngineRunning&&!mounted&&bikeRpm>=999')`),'Engine idles after dismounting through actual keyboard input');
      assert(await evaluate(`!document.querySelector('.bike-power-controls')`),'Engine power popup is absent');
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'f',code:'KeyF',windowsVirtualKeyCode:70});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'f',code:'KeyF',windowsVirtualKeyCode:70});
      assert(await evaluate(`__gameEval('mounted&&bikeEngineRunning&&!ignition.active')`),'Remounting does not require restarting');
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
      assert(await evaluate(`__gameEval('!bikeEngineRunning')`),'R switches engine off');
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82});
      assert(await evaluate(`__gameEval('ignition.active')`),'R opens ignition to start engine');
      assert.deepEqual(errors,[],'Motor controls must not throw');
      console.log('HTTP: dismount, idle, remount and keyboard power controls passed');
      continue;
    }
    if(smokeOnly){
      assert.deepEqual(errors, [], 'Game and keyboard input must not throw');
      assert.deepEqual(missing, [], 'All game resources must load');
      console.log((url.startsWith('file:')?'Local index.html':'HTTP')+': start, rendering, keyboard and resources passed');
      continue;
    }
    if(combatOnly){
      assert(await evaluate('MossCreatures.TYPES[1].nightSpeed>MossCreatures.TYPES[0].nightSpeed&&MossCreatures.TYPES[0].damage<MossCreatures.TYPES[2].damage'),'Browser loads distinct combat profiles');
      if(url.startsWith('http:')){
        const result=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
          keys.clear();characterHealth.reset();creatureHitCooldown=0;creatureBikeCooldown=0;
          state='drive';mounted=true;bike.speed=0;bikeEngineRunning=true;bikeLife=100;
          player.x=bike.x;player.y=bike.y;player.gait=null;
          const before=characterHealth.status().health;
          mossEcology.reset({daylight:0},player);
          const enemy=mossEcology.entities[0];
          Object.assign(enemy,{kind:2,x:bike.x-10,y:bike.y,indoors:false,attackCooldown:0,sunAge:null,spawnAge:1});
          // Force the low roll only for this real attack, keeping all other RNG intact.
          const original=MossCreatures.attackOutcome;
          MossCreatures.attackOutcome=(kind,options)=>original(kind,{...options,random:()=>0});
          try{updateCreatureCombat();}finally{MossCreatures.attackOutcome=original;}
          enemy.attackCooldown=100;creatureHitCooldown=100;creatureBikeCooldown=100;
          return {mounted,down:playerKnockdown,life:bikeLife,hurt:characterHealth.status().health<before,
            damaged:Object.values(bikeParts).some(value=>value<99),blocked:worldBlocked(player.x,player.y,7*ACTOR_VISUAL_SCALE)};
        })()` )})`);
        assert(!result.mounted&&result.down>0&&result.life<100&&result.hurt&&result.damaged&&!result.blocked,'Actual brute attack knocks off the rider, wounds them and damages repairable bike parts');
        const shot=await call('Page.captureScreenshot',{format:'png'});
        const screenshotPath=path.join(profile,'creature-knockdown.png');fs.writeFileSync(screenshotPath,Buffer.from(shot.data,'base64'));console.log('Combat screenshot: '+screenshotPath);
        await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{
          if(__gameEval('playerKnockdown===0'))resolve(true);else if(++tries>200)reject(Error('Rider did not recover from knockdown'));else setTimeout(poll,50);
        };poll();})`);
        assert(await evaluate(`__gameEval('!mounted&&characterHealth.status().wounds>0')`),'Standing up does not erase injuries or remount automatically');
      }
      assert.deepEqual(errors, [], 'Combat and knockdown rendering must not throw');assert.deepEqual(missing, [], 'Combat assets load');
      console.log((url.startsWith('file:')?'Local index.html':'HTTP')+': creature profiles, combat and game rendering passed');continue;
    }
    if(ignitionOnly){
      assert(await evaluate('__ignitionOptions.getCondition()>=90'),'The actual motorcycle is in excellent starting condition');
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'f',code:'KeyF',windowsVirtualKeyCode:70});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'f',code:'KeyF',windowsVirtualKeyCode:70});
      assert(await evaluate('__ignition.active'),'Mounting opens the real ignition');
      const points=await evaluate(`(()=>{
        const r=document.querySelector('#game').getBoundingClientRect(),v=__ignition.viewport,o=__ignitionOptions;
        const point=(x,y)=>({x:r.left+(v.x+x*v.scale)/o.width*r.width,y:r.top+(v.y+y*v.scale)/o.height*r.height});
        return {home:point(214,156),lock:point(318,131)};
      })()`);
      await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...points.home});
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...points.lock});
      await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...points.lock});
      assert.equal(await evaluate('__ignition.snapshot.phase'),'turn','Mouse inserts the key');
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      assert(await evaluate(`__engineStarts===1||__ignition.snapshot?.phase==='success'`),'Healthy engine succeeds even with the lowest random roll');
      await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{
        if(window.__engineStarts===1&&!__ignition.active)resolve(true);else if(++tries>200)reject(Error('Ignition did not complete'));else setTimeout(poll,50);
      };poll();})`);
      assert.deepEqual(errors, [], 'Ignition must not throw');assert.deepEqual(missing, [], 'Ignition assets load');
      console.log((url.startsWith('file:')?'Local index.html':'HTTP')+': healthy engine starts first try with forced worst-case randomness');
      continue;
    }
    if(occlusionOnly){
      if(url.startsWith('http:')){
        const pixels=await evaluate(`(()=>{
          const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
          const ctx=canvas.getContext('2d');ctx.fillStyle='#0000ff';ctx.fillRect(0,0,100,100);
          const reveal=new Function('ctx','W','H','let buildingRevealLayer=null;'+__gameEval('drawBuildingWithReveal.toString()')+';return drawBuildingWithReveal;')(ctx,100,100);
          reveal(alpha=>{ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle='#ff0000';ctx.fillRect(0,0,100,100);ctx.restore();},.22,{x:50,y:50,radius:15});
          return {inside:Array.from(ctx.getImageData(50,50,1,1).data),middle:Array.from(ctx.getImageData(61,50,1,1).data),edge:Array.from(ctx.getImageData(64,50,1,1).data),outside:Array.from(ctx.getImageData(80,50,1,1).data)};
        })()`);
        assert.deepEqual(pixels.outside,[255,0,0,255],'Building pixels outside the circle stay fully opaque');
        assert(pixels.inside[0]<80&&pixels.inside[2]>170,'Only pixels inside the circle reveal the background');
        assert(pixels.inside[0]<pixels.middle[0]&&pixels.middle[0]<pixels.edge[0]&&pixels.edge[0]<pixels.outside[0],'Circle transparency blends gradually into the opaque wall');
        const selected=await evaluate(`__gameEval(${JSON.stringify(`(()=>{
          keys.clear();mounted=false;player.gait=null;creatureHitCooldown=1000;startHour=12;gameTime=0;buildingOpacities.clear();
          for(let index=0;index<buildings.length;index++){
            const [x,y,w,h]=buildings[index];
            const p={x:x+w*.8,y:y-16};if(worldBlocked(p.x,p.y,7))continue;
            player.x=p.x;player.y=p.y;camera.x=p.x;camera.y=p.y;
            const point=projectPoint(p.x,p.y),shape=isoBuildingGeometry(x,y,w,h,index);
            const rect={left:point.x-7,right:point.x+7,top:point.y-22,bottom:point.y+6};
            if(buildingOccludesActor(shape,rect,x+y+(w+h)*.82,p.x+p.y))return {index,x,y,w,h,behind:p};
          }
          throw Error('No valid occlusion fixture found');
        })()` )})`);
        await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{
          if(__gameEval('buildingOpacities.get(${selected.index})?.value<.3'))resolve(true);
          else if(++tries>200)reject(Error('Wall did not fade over the character'));else setTimeout(poll,50);
        };poll();})`);
        assert(await evaluate(`__gameEval('!worldBlocked(player.x,player.y,7)')`),'Transparency works from a legal position behind the wall');
        const shot=await call('Page.captureScreenshot',{format:'png'});
        const screenshotPath=path.join(profile,'character-behind-wall.png');fs.writeFileSync(screenshotPath,Buffer.from(shot.data,'base64'));
        console.log('Wall visibility screenshot: '+screenshotPath);
        await evaluate(`__gameEval('mounted=true;bike.x=player.x;bike.y=player.y;bike.speed=0;bikeEngineRunning=false;buildingOpacities.clear()')`);
        await evaluate(`new Promise(resolve=>setTimeout(resolve,600))`);
        assert(await evaluate(`__gameEval('buildingOpacities.get(${selected.index})?.value<.5')`),'Mounted character also reveals foreground walls');
        await evaluate(`__gameEval('mounted=false;player.x=${selected.x+selected.w*1.65+25};player.y=${selected.y+selected.h*1.65+25};player.gait=null')`);
        await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{
          if(__gameEval('buildingOpacities.get(${selected.index})?.value>.98'))resolve(true);
          else if(++tries>200)reject(Error('Wall did not return to opaque'));else setTimeout(poll,50);
        };poll();})`);
      }
      assert.deepEqual(errors, [], 'Character visibility must not throw');assert.deepEqual(missing, [], 'Visibility resources load');
      console.log((url.startsWith('file:')?'Local index.html':'HTTP')+': game rendering and automatic wall visibility passed');
      continue;
    }
    if(dragOnly){
      await evaluate('window.__rollingBikeSound=false');
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'g',code:'KeyG',windowsVirtualKeyCode:71});
      assert(await evaluate(`document.querySelector('#toast').textContent.includes('ARRASTAR')`),'G near the bike starts dragging');
      const before=await evaluate(`window.__gameEval?__gameEval('({x:bike.x,y:bike.y,fuel,offsetX:player.x-bike.x,offsetY:player.y-bike.y})'):null`);
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});
      await evaluate(`new Promise((resolve,reject)=>{let tries=0;const poll=()=>{
        if(window.__rollingBikeSound)resolve(true);else if(++tries>150)reject(Error('Dragging did not produce rolling noise'));else setTimeout(poll,50);
      };poll();})`);
      if(before){
        const moved=await evaluate(`__gameEval('({x:bike.x,y:bike.y,fuel,offsetX:player.x-bike.x,offsetY:player.y-bike.y,dragging:bikeDragging,engine:bikeEngineRunning,running:player.gait.running})')`);
        assert(moved.x>before.x&&moved.dragging&&!moved.engine&&!moved.running,'Real input moves the bike manually without engine or sprint');
        assert.equal(moved.fuel,before.fuel,'Dragging burns no fuel');
        assert(Math.abs(moved.offsetX-before.offsetX)<1e-6&&Math.abs(moved.offsetY-before.offsetY)<1e-6,'The real game keeps the grip distance');
      }
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'g',code:'KeyG',windowsVirtualKeyCode:71});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});
      const parked=await evaluate(`window.__gameEval?__gameEval('({x:bike.x,y:bike.y})'):null`);
      await evaluate(`new Promise(resolve=>setTimeout(resolve,400))`);
      if(parked)assert(await evaluate(`__gameEval('!bikeDragging&&bike.x===${parked.x}&&bike.y===${parked.y}')`),'Releasing G leaves the bike parked while walking continues');
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
      assert.deepEqual(errors, [], 'Dragging must not throw');assert.deepEqual(missing, [], 'Dragging loads every resource');
      console.log((url.startsWith('file:')?'Local index.html':'HTTP')+': G + WASD dragging, rolling noise and normal game rendering passed');
      continue;
    }
    if(creatureOnly){
      assert(await evaluate('MossCreatures.DAY_COUNT===3&&MossCreatures.NIGHT_COUNT===67&&MossCreatures.SUN_LIFETIME===17&&MossCreatures.SPAWN_START_INTERVAL===10&&MossCreatures.SPAWN_MIN_INTERVAL===2'), 'Browser loads the population cap, spawn intervals and daylight lifetime');
      assert(await evaluate('!!window.__heardPlayerSteps'),'Actual player movement feeds footstep noise into creature AI');
      const ai=await evaluate(`(()=>{
        const target={x:800,y:650};
        const model=MossCreatures.createEcology({random:()=>.5,getBuildings:()=>[[100,100,50,40]],getSize:()=>({w:1600,h:1200}),isBlocked:()=>false,getShadows:()=>[]});
        model.reset({daylight:1},target);
        model.update(.1,{light:{daylight:0},target});
        const initial=model.entities.length,hunter=model.entities[0];
        Object.assign(hunter,{x:550,y:650,indoors:false,destination:{x:450,y:650},retarget:100});
        model.update(.1,{light:{daylight:0},target,sounds:[MossCreatures.playerNoise({...target,speed:50,running:true})]});
        const heard=hunter.behavior==='investigate'&&hunter.x>550;
        for(let i=0;i<3600;i++)model.update(.1,{light:{daylight:0},target});
        const final=model.entities.length;
        const speedAt=age=>{
          Object.assign(hunter,{x:550,y:650,indoors:false,sunRunner:true,sunAge:age});
          model.update(.05,{light:{daylight:1},target,sounds:[{...target,radius:2000,player:true}]});
          return hunter.speed;
        };
        return {initial,heard,final,speeds:[speedAt(0),speedAt(8.5),speedAt(16.5)]};
      })()`);
      assert(ai.initial===3&&ai.heard&&ai.final===67,'Browser AI investigates sounds and gradually reaches the cap of sixty-seven');
      assert(ai.speeds[0]>ai.speeds[1]&&ai.speeds[1]>ai.speeds[2]&&ai.speeds[2]>0,'Browser hunters slow progressively while dissolving in sunlight');
      if(url.startsWith('http:')){
        const result=await evaluate(`(async()=>{
          const renderer=MossCreatures.createRenderer(MOSS_CREATURE_ATLAS);
          await Promise.all(renderer.sheets.map(image=>image.decode()));
          const canvas=document.createElement('canvas');canvas.width=180;canvas.height=180;
          const ctx=canvas.getContext('2d'),counts=[];
          for(const sunAge of [0,8.5,16.5,17]){
            ctx.clearRect(0,0,180,180);ctx.save();ctx.scale(4,4);
            renderer.draw(ctx,{id:0,kind:0,sunAge},22,36,Math.PI,0,true);ctx.restore();
            const pixels=ctx.getImageData(0,0,180,180).data;let visible=0;
            for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visible++;
            counts.push(visible);
            if(ctx.globalAlpha!==1)throw Error('Creature renderer leaked opacity into the scene');
          }
          return counts;
        })()`);
        assert(result[0]>result[1]&&result[1]>result[2]&&result[2]>=result[3]&&result[3]===0,'Creature visibly crumbles and disappears completely at seventeen seconds');
      }
      assert.deepEqual(errors, [], 'Creature changes must not throw in the browser');
      assert.deepEqual(missing, [], 'Creature assets load');
      console.log((url.startsWith('file:')?'Local index.html':'HTTP')+': game, footsteps, hearing AI, gradual dusk spawning and dissolution passed');
      continue;
    }
    await evaluate(`new Promise(resolve=>setTimeout(resolve,500))`);
    await call('Input.dispatchKeyEvent', {type:'keyDown', key:'j', code:'KeyJ', windowsVirtualKeyCode:74});
    await call('Input.dispatchKeyEvent', {type:'keyUp', key:'h', code:'KeyH', windowsVirtualKeyCode:72});
    assert(await evaluate(`!document.querySelector('#character-health-panel').hidden`), 'J opens the care menu');
    assert(await evaluate(`document.querySelector('[data-effects]').textContent.includes('Nenhuma penalidade')`), 'Healthy menu explains there are no penalties');
    await evaluate(`__healthModel.injure('leftLeg','fracture',1.5);__healthModel.injure('rightArm','cut');__healthModel.injure('chest','bruise');__healthModel.injure('head','bruise');__healthModel.injure('abdomen','cut');document.querySelector('[data-part="leftLeg"]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-part-title]').textContent`), 'Perna esquerda');
    assert(await evaluate(`document.querySelectorAll('.health-effect').length>=6`), 'Menu shows each regional debuff and systemic effects');
    assert(await evaluate(`__healthModel.status().movement<.65&&__healthModel.status().handling<1&&__healthModel.status().focus<1&&__healthModel.status().sprint<1&&__healthModel.status().metabolism>1`), 'Injuries apply the corresponding gameplay multipliers');
    const originalMaterials = await evaluate('__healthModel.items.splints');
    const originalMovement = await evaluate('__healthModel.status().movement');
    await evaluate(`document.querySelector('[data-action="splint"]').click()`);
    assert(await evaluate(`!!__healthModel.action`), 'Treatment starts from the selected region');
    assert(await evaluate(`__healthModel.action.duration>7`), 'Arm injury slows real care actions');
    await evaluate(`new Promise(resolve=>setTimeout(resolve,400))`);
    assert(await evaluate(`!document.querySelector('.health-treatment').hidden&&document.querySelector('.health-treatment progress').value>0`), 'Treatment progress is shown separately from recovery');
    await evaluate(`document.querySelector('[data-cancel]').click()`);
    assert.equal(await evaluate('__healthModel.items.splints'), originalMaterials, 'Cancel does not spend supplies');
    // Advance the same simulation through the treatment, without waiting in real time.
    await evaluate(`document.querySelector('[data-action="splint"]').click();__healthModel.update(__healthModel.action.duration);document.querySelector('[data-part="leftLeg"]').click()`);
    assert.equal(await evaluate('__healthModel.items.splints'), originalMaterials - 1, 'Completed treatment spends one splint');
    assert(await evaluate('__healthModel.status().movement') > originalMovement, 'Treatment reduces the movement penalty');
    assert(await evaluate(`document.querySelector('[data-part="leftLeg"]').dataset.condition==='treated'`), 'Treated region updates on the body map');
    if (url.startsWith('http:')) {
      const screenshot=await call('Page.captureScreenshot', {format:'png'});
      const screenshotPath=path.join(profile, 'health-menu.png');
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data,'base64'));
      console.log('Care menu screenshot: '+screenshotPath);
      await call('Emulation.setDeviceMetricsOverride', {width:480,height:850,deviceScaleFactor:1,mobile:false});
      await evaluate(`new Promise(resolve=>setTimeout(resolve,250))`);
      assert(await evaluate(`(()=>{const p=document.querySelector('#character-health-panel');return p.clientWidth>=p.scrollWidth-1&&p.getBoundingClientRect().left>=0;})()`), 'Care menu fits a narrow viewport without horizontal overflow');
      const mobile=await call('Page.captureScreenshot', {format:'png'});
      fs.writeFileSync(path.join(profile,'health-menu-mobile.png'),Buffer.from(mobile.data,'base64'));
      await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    }
    await evaluate(`document.querySelector('[data-close]').click()`);
    assert(await evaluate(`document.querySelector('#character-health-panel').hidden`), 'Care menu can be closed');
    assert.deepEqual(errors, [], 'Browser must have no uncaught errors');
    assert.deepEqual(missing, [], 'Game resources must exist');
    console.log((url.startsWith('file:') ? 'Local index.html' : 'HTTP') + ': start, rendering, keyboard, care menu, debuffs and treatments passed');
  }
}
const timeout = setTimeout(() => { console.error('Browser test timed out'); child?.kill();process.exit(1); }, 180000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(timeout);
  if (ws?.readyState === WebSocket.OPEN) { await call('Browser.close').catch(() => {}); ws.close(); }
  child?.kill();
  server.close();
});
