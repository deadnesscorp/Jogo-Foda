// Run with: node tests/ignition.test.js
function runIgnitionTests(factory,source) {
  let assertions=0;
  const check=(condition,message)=>{assertions++;if(!condition)throw Error(message);};
  function create(scale=1,random=()=>.9,getCondition=()=>100) {
    let started=0,cancelled=0,captured=null,labels=0;
    const gradient={addColorStop(){}},ctx=new Proxy({fillText(){labels++;}}, {get:(target,key)=>target[key]??((key==='createLinearGradient'||key==='createRadialGradient')?()=>gradient:()=>{}),set:(target,key,value)=>(target[key]=value,true)});
    const canvas={style:{},getBoundingClientRect:()=>({left:12,top:20,width:480*scale,height:270*scale}),
      setPointerCapture(id){captured=id;},hasPointerCapture:id=>captured===id,releasePointerCapture(){captured=null;}};
    const game=factory({canvas,ctx,width:480,height:270,random,getCondition,onStart(){started++;},onCancel(){cancelled++;}});
    const event=(x,y,type='pointerup',button=0)=>{const view=game.viewport;return {button,pointerId:1,clientX:12+(view.x+x*view.scale)*scale,clientY:20+(view.y+y*view.scale)*scale,type,preventDefault(){}};};
    return {game,canvas,down:(x,y)=>game.down(event(x,y)),move:(x,y)=>game.move(event(x,y)),up:(x,y,type,button)=>game.up(event(x,y,type,button)),
      key:(key,repeat=false)=>game.key({key,repeat,preventDefault(){}}),get started(){return started;},get cancelled(){return cancelled;},get captured(){return captured;},get labels(){return labels;}};
  }
  for(const scale of [1,2,.75]) {
    const h=create(scale);h.game.open();h.game.draw(0);const home=h.game.snapshot,view=h.game.viewport;
    check(Math.abs(view.x+318*view.scale-240)<1e-9&&Math.abs(view.y+131*view.scale-135)<1e-9,'lock is centered exactly on the canvas');
    check(h.labels>0,'ignition displays instructions and current status');
    check(h.game.active&&home.phase==='place','ignition starts awaiting insertion');
    h.down(50,50);check(!h.game.snapshot.dragging,'background cannot grab the key');
    h.down(home.x,home.y);check(h.game.snapshot.dragging&&h.captured===1,'key handle captures pointer');
    h.move(318,181);h.up(318,181);
    check(h.game.snapshot.phase==='place'&&h.game.snapshot.x===home.x,'releasing below the lock does not connect');
    h.down(home.x,home.y);h.move(318,131);
    check(h.game.snapshot.phase==='place','hovering while held does not insert key');
    h.up(318,131,'pointerup',2);
    check(h.game.snapshot.phase==='place'&&h.game.snapshot.dragging,'right button release does not connect key');
    h.up(318,131);
    check(h.game.snapshot.phase==='turn'&&h.captured===null,'left release over lock connects at any canvas scale');
    h.game.draw(.5);h.down(338,131);h.move(318,111);
    check(h.game.snapshot.angle===0&&h.started===0,'turning counterclockwise cannot start engine');
    h.up(318,111);h.down(338,131);h.move(332.142,145.142);
    check(h.game.snapshot.phase==='turn'&&h.started===0,'partial turn is insufficient to start engine');
    h.move(318,151);
    check(h.game.snapshot.phase==='success'&&h.started===0,'clockwise turn enters success animation');
    check(h.captured===null,'successful turn releases captured pointer');
    h.game.draw(1);h.game.update(.4);check(h.game.active,'success animation remains visible briefly');
    h.game.update(.5);check(!h.game.active&&h.started===1&&h.cancelled===0,'successful turn starts engine exactly once');
    h.game.update(1);h.game.close(true);check(h.started===1,'closed ignition cannot start twice');
  }
  {
    const h=create();h.game.open();const home=h.game.snapshot;
    h.key('Enter',true);h.key('Enter');h.key('e');h.key(' ');
    check(h.game.snapshot.phase==='place','keyboard cannot bypass mouse insertion');
    h.down(home.x,home.y);h.up(318,131);
    check(h.game.snapshot.phase==='turn','release position is used even without a last pointermove');
    h.key('ArrowRight');check(h.game.snapshot.angle>0,'keyboard can turn an already inserted key');
    h.key('Enter');h.game.update(1);check(h.started===1,'keyboard can finish turning inserted key');
    h.game.open();h.down(home.x,home.y);h.key('Escape');
    check(!h.game.active&&h.cancelled===1&&h.captured===null,'escape cancels and releases capture');
    check(h.canvas.style.cursor===''&&h.canvas.style.touchAction==='','closing restores canvas input');
    h.game.open();h.down(home.x,home.y);h.move(318,131);h.up(318,131,'pointercancel');
    check(h.game.snapshot.phase==='place'&&!h.game.snapshot.dragging,'cancelled touch does not insert key');
    h.down(home.x,home.y);h.move(200,160);h.game.cancelDrag();
    check(h.game.snapshot.x===home.x&&h.captured===null,'losing window focus safely resets drag');
    h.down(home.x,home.y);h.move(-100,900);
    check(h.game.snapshot.x>=46&&h.game.snapshot.y<=228,'drag stays within visible canvas');
    h.up(0,0);h.down(443,27);check(h.game.active,'removed close label leaves no invisible button');
    h.key('Escape');check(!h.game.active&&h.cancelled===2,'escape still closes captionless ignition');
  }
  {
    const h=create(1,()=>0);h.game.open();h.down(214,156);h.up(318,131);
    for(let i=0;i<5;i++) {
      h.key('Enter');check(h.game.snapshot.phase==='failed'&&h.started===0,'failed turn never starts engine');
      h.key('Enter');h.game.update(1);
      check(h.game.snapshot.phase==='turn'&&h.game.snapshot.angle===0,'failed key returns for another attempt');
      if(i===2){h.game.close(false);h.game.open();h.down(214,156);h.up(318,131);}
    }
    h.key('Enter');check(h.game.snapshot.phase==='success','sixth attempt succeeds even after cancelling and reopening');
    h.game.update(1);check(h.started===1,'guaranteed start fires once');
    h.game.open();h.down(214,156);h.up(318,131);h.key('Enter');
    check(h.game.snapshot.phase==='failed','successful start resets consecutive failures');
  }
  {
    for(const [condition,roll,expected] of [[100,.36,'success'],[50,.59,'failed'],[50,.61,'success'],[0,.84,'failed'],[0,.86,'success'],[-50,.86,'success'],[150,.36,'success']]) {
      const h=create(1,()=>roll,()=>condition);h.game.open();h.down(214,156);h.up(318,131);h.key('Enter');
      check(h.game.snapshot.phase===expected,'damage adjusts failure probability and clamps condition');
    }
    let condition=0;
    const h=create(1,()=>.5,()=>condition);h.game.open();h.down(214,156);h.up(318,131);h.key('Enter');
    check(h.game.snapshot.phase==='failed','damaged motorcycle fails at elevated probability');
    h.game.update(1);condition=100;h.key('Enter');
    check(h.game.snapshot.phase==='success','repair updates probability on the next turn');
    const damaged=create(1,()=>0,()=>0);damaged.game.open();damaged.down(214,156);damaged.up(318,131);
    for(let i=0;i<5;i++){damaged.key('Enter');damaged.game.update(1);}
    damaged.key('Enter');check(damaged.game.snapshot.phase==='success','maximum damage still permits only five consecutive failures');
  }
  if(source) {
    check(source.includes('getCondition:()=>bikeParts.motor*.7+bikeLife*.3'),'starting condition combines motor and overall motorcycle health');
    const lifecycle=source.slice(source.indexOf('  function dismount()'),source.indexOf('  function startGrappleAim()'));
    const h=new Function(`
      let state='drive',mounted=false,bikeEngineRunning=false,approachedByBike=false,bikeRpm=0,opened=0;
      const bike={x:0,y:0,angle:0,speed:0,steering:0},player={x:0,y:0,angle:0},keys=new Set(),activeTower=0;
      let toastTimer=0;
      const toast={classList:{remove(){}}},ignition={open(){opened++;}},setToast=()=>{},setObjective=()=>{},updateObjective=()=>{};
      const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
      ${lifecycle}
      return {mount,dismount,off:switchOffBike,bike,player,
        start(){bikeEngineRunning=true;},get running(){return bikeEngineRunning;},get mounted(){return mounted;},get opened(){return opened;}};
    `)();
    h.mount();check(h.mounted&&h.opened===1,'mounting stopped engine opens ignition');
    h.start();h.dismount();check(h.running&&!h.mounted,'dismount preserves running engine');
    h.mount();check(h.mounted&&h.opened===1,'remounting running engine skips ignition');
    h.bike.speed=30;h.off();check(h.running,'cannot switch off moving motorcycle');
    h.bike.speed=0;h.off();check(!h.running,'stationary motorcycle can be switched off');
    h.off();check(h.mounted&&h.opened===2,'stationary rider can reopen ignition without dismounting');
    h.dismount();h.mount();check(h.opened===3,'mounting after switching off reopens ignition');
    h.dismount();h.player.x=200;h.mount();check(!h.mounted&&h.opened===3,'distant motorcycle cannot open ignition');
    const frameSource=source.slice(source.indexOf('  function frame(now)'),source.indexOf('\n  setObjective(',source.indexOf('  function frame(now)')));
    const createWorld=new Function('igniting','repairing',`
      let lastTime=1000,gameTime=0,fuel=100,bikeLife=100,bikeEngineRunning=false,hunger=100,thirst=100;
      let W=480,H=270,gameScene=null;const gameSceneViewport=()=>({x:0,y:0,width:480,height:270});
      let state='drive',mounted=false,bikeInspectOpen=repairing,bikeService=null,checkpointReturn=null;
      let machineTicks=0,wearTicks=0,ignitionTicks=0,repairTicks=0,rendered=0;
      const bike={x:0,y:0,speed:0},player={x:0,y:0},keys=new Set();
      const ignition={active:igniting,update(){ignitionTicks++;}};
      const gameDisplay={sampleFrame(){}},updateBikeGearbox=()=>{},bikeControlsMounted=()=>false,distance=()=>0;
      const updateBikeService=()=>repairTicks++,updateBikeCondition=()=>wearTicks++,updateMachines=()=>machineTicks++;
      const updateBikeFuelTrail=()=>{};
      const updateObjective=()=>{},active=()=>null,finishFrame=()=>rendered++,requestAnimationFrame=()=>{};
      const updateFootMovement=()=>{},moveWorldEntity=()=>{},projectFacing=angle=>angle;
      ${frameSource}
      frame(1016);
      return {machineTicks,wearTicks,ignitionTicks,repairTicks,rendered,hunger,thirst};
    `);
    for(const [igniting,repairing] of [[true,false],[false,true]]){
      const world=createWorld(igniting,repairing);
      check(world.machineTicks===1&&world.rendered===1,'world and rendering continue during bike interaction');
      check(world.hunger<100&&world.thirst<100&&world.wearTicks===1,'needs and wear continue during bike interaction');
      check(igniting?world.ignitionTicks===1:world.repairTicks===1,'active minigame advances with world');
    }
  }
  return assertions+' ignition checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function') {
  console.log(runIgnitionTests(require('../ignition.js'),require('fs').readFileSync(require('path').join(__dirname,'../game.js'),'utf8')));
}
