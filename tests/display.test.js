// Run with: node tests/display.test.js
async function runDisplayTests(source) {
  let assertions=0;
  const check=(condition,message)=>{assertions++;if(!condition)throw Error(message);};
  function create(native=true){
    const windowEvents={},documentEvents={},buttonEvents={},startEvents={},classes=new Set(),attributes={},label={textContent:''};
    const button={addEventListener:(name,fn)=>buttonEvents[name]=fn,setAttribute:(name,value)=>attributes[name]=value,querySelector:()=>label};
    const document={fullscreenElement:null,querySelector:selector=>selector==='#start-game'?{addEventListener:(name,fn)=>startEvents[name]=fn}:button,addEventListener:(name,fn)=>documentEvents[name]=fn,
      body:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),toggle(name,value){if(value)classes.add(name);else classes.delete(name);}}},
      async exitFullscreen(){document.fullscreenElement=null;documentEvents.fullscreenchange();}};
    const frame={};if(native)frame.requestFullscreen=async()=>{document.fullscreenElement=frame;documentEvents.fullscreenchange();};
    const canvas={closest:()=>frame,getBoundingClientRect:()=>({width:960,height:540})};
    const window={devicePixelRatio:2,addEventListener:(name,fn)=>windowEvents[name]=fn};
    const mod={exports:{}};
    new Function('window','document','requestAnimationFrame','module',source)(window,document,fn=>fn(),mod);
    const sizes=[];mod.exports.initGameDisplay({canvas,onResize:size=>sizes.push(size)});
    return {api:mod.exports,document,frame,attributes,label,classes,sizes,windowEvents,start:startEvents.click,toggle:buttonEvents.click};
  }
  const h=create();
  for(const [w,h,dpr,ew,eh] of [[960,540,1,960,540],[1920,1080,1,1920,1080],[1120,630,2,1920,1080],[3840,2160,2,1920,1080],[320,180,1,960,540]]){
    const size=globalThis.gameRenderResolution(w,h,dpr);
    check(size.width===ew&&size.height===eh,'render resolution matches screen size with safe limits');
    check(size.width/size.height===16/9,'render resolution retains playfield proportions');
  }
  check(h.sizes[0].width===1920,'initial render accounts for pixel density');
  check(h.classes.has('game-expanded')&&h.label.textContent==='MINIMIZAR','game starts expanded with minimize as secondary action');
  await h.toggle();check(!h.classes.has('game-expanded')&&h.label.textContent==='EXPANDIR','first button click minimizes game');
  await h.toggle();check(h.document.fullscreenElement===h.frame&&h.attributes['aria-pressed']==='true','button enters native fullscreen');
  check(h.label.textContent==='MINIMIZAR','fullscreen button updates its label');
  await h.toggle();check(h.document.fullscreenElement===null&&h.attributes['aria-pressed']==='false','button exits fullscreen');
  h.windowEvents.resize();check(h.sizes.length>=4,'resizing refreshes render resolution');
  const fallback=create(false);
  check(fallback.classes.has('game-expanded'),'unsupported fullscreen expands game in browser');
  let intercepted=false;const event={key:'Escape',preventDefault(){intercepted=true;},stopImmediatePropagation(){intercepted=true;}};
  fallback.windowEvents.keydown(event);check(!intercepted,'escape remains available to game menus');
  await fallback.toggle();
  check(!fallback.classes.has('game-expanded'),'minimize restores browser layout');
  await fallback.toggle();await fallback.toggle();check(!fallback.classes.has('game-expanded'),'fallback fullscreen button restores layout');
  const started=create();started.start();
  check(started.document.fullscreenElement===started.frame,'start click enters native fullscreen when supported');
  const world=h.api.gameSceneViewport('drive');
  check(world.width===640&&world.height===360,'larger logical viewport makes world and HUD 25 percent smaller');
  check(world.x===0&&world.y===0,'world uses the entire playfield');
  for(const state of ['explore','chase','grapple','climb','hack']){
    const scene=h.api.gameSceneViewport(state);
    check(scene.x+scene.width/2===320&&scene.y+scene.height/2===180,'fixed minigames remain centered in enlarged view');
    check(scene.width===480&&scene.height===270,'fixed minigames retain their control coordinates');
  }
  const changes=[],budget=h.api.createRenderBudget(value=>changes.push(value));
  for(let i=0;i<180;i++)budget.sampleFrame(1000/60);
  check(budget.quality===1&&changes.length===0,'stable frame rate preserves full quality');
  for(let i=0;i<150;i++)budget.sampleFrame(33);
  check(budget.quality<1&&changes.length===1,'sustained slow frames reduce resolution');
  for(let i=0;i<600;i++)budget.sampleFrame(33);
  check(Math.abs(budget.quality-.8)<1e-9,'adaptive quality has a readability floor');
  const reduced=budget.quality;budget.sampleFrame(2000);
  check(budget.quality===reduced,'window pauses do not lower quality');
  for(let i=0;i<900;i++)budget.sampleFrame(1000/60);
  check(budget.quality>reduced,'sustained stable frames restore quality gradually');
  for(let i=0;i<9000;i++)budget.sampleFrame(1000/60);
  check(budget.quality===1,'restored quality never exceeds native budget');
  const limited=h.api.gameRenderResolution(3840,2160,2,.8);
  check(limited.width===1536&&limited.height===864,'slow-device render budget preserves more detail without changing layout');
  return assertions+' display checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function') {
  runDisplayTests(require('fs').readFileSync(require('path').join(__dirname,'../display.js'),'utf8')).then(console.log).catch(error=>{console.error(error);process.exitCode=1;});
}
