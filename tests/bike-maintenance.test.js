// Run with: node tests/bike-maintenance.test.js
function runBikeMaintenanceTests(source) {
  new Function(source); // Check the complete game's syntax as well as the extracted logic.
  const jobs=source.slice(source.indexOf('  const bikeJobs ='),source.indexOf('  const bikePartNames ='));
  const logic=source.slice(source.indexOf('  function bikeHoleSeverity('),source.indexOf('  function handleBikeInspectPointer('));
  const interaction=source.slice(source.indexOf('  function handleBikeInspectPointer('),source.indexOf('  function drawBikeInspectMenu('));
  const create=new Function('random',`
    const Math=Object.create(globalThis.Math);Math.random=random||globalThis.Math.random;
    let bikeService=null,repairKits=5,bikeLife=60,bikeInspectTab='Motor',bikeTireSelected='frontTire';
    let bikeWearClock=0,bikeCrashCooldown=0,fuel=100,bikeEngineRunning=false;
    let bikeInspectOpen=true,bikeInspectHover=null;
    const bikeWorkshopWindow={x:null,y:null,full:false,drag:null};
    const W=480,H=270,DISPLAY_W=480,DISPLAY_H=270,gameScene={x:0,y:0},canvas={getBoundingClientRect:()=>({left:0,top:0,width:480,height:270}),dataset:{},style:{},setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){}};
    const bikeToolCursors=new Map();
    const gradient={addColorStop(){}},ctx=new Proxy({}, {get:(target,key)=>target[key]??((key==='createLinearGradient'||key==='createRadialGradient')?()=>gradient:()=>{}),set:(target,key,value)=>(target[key]=value,true)});
    const bikePartNames={motor:'Motor',handlebar:'Guidão',frontTire:'Dianteiro',rearTire:'Traseiro'},bikePartColor=()=>'#fff';
    const bikeParts={motor:60,handlebar:60,frontTire:60,rearTire:60};
    const bikeFaults=Object.fromEntries(Object.keys(bikeParts).map(p=>[p,[60,60,60,60]]));
    const setToast=()=>{};
    ${jobs}\n${logic}\n${interaction}
    const input=(x,y)=>{const view=bikeWorkshopViewport();return {clientX:view.x+x*view.scale,clientY:view.y+y*view.scale};};
    return {start:startBikeService,action:bikeServiceAction,update:updateBikeService,damage:damageBikePart,
      wear:updateBikeCondition,impact:applyBikeImpact,
      render:drawBikeServiceContent,click:(x,y)=>handleBikeInspectPointer({button:0,...input(x,y)}),
      down:(x,y)=>handleBikeInspectPointer({button:0,pointerId:1,...input(x,y),preventDefault(){}}),
      move:(x,y)=>moveBikeServiceGesture({pointerId:1,...input(x,y),buttons:1}),
      up:(x,y,type='pointerup')=>endBikeServiceGesture({pointerId:1,...input(x,y),type}),
      cursor:syncBikeServiceCursor,get cursorStyle(){return canvas.style.cursor},
      view:bikeWorkshopViewport,get window(){return bikeWorkshopWindow;},
      cancel(){bikeService=null},get service(){return bikeService},get kits(){return repairKits},
      resources(kits,life){repairKits=kits;bikeLife=life},
      engine(running){bikeEngineRunning=running;},
      get life(){return bikeLife},get fuel(){return fuel},leak:bikeFuelLeakRate,parts:bikeParts,faults:bikeFaults};
  `);
  let assertions=0;
  const check=(condition,message)=>{assertions++;if(!condition)throw Error(message);};
  {
    const h=create();h.engine(true);h.start('motor',2);
    check(!h.service,'running engine prevents starting repairs');
    check(h.kits===5,'blocked repair does not consume a kit');
    h.engine(false);h.start('motor',2);
    check(!!h.service,'stopped engine permits repairs');
  }
  {
    const h=create();h.faults.motor[2]=100;
    check(h.leak()===0,'intact housing does not leak');
    h.faults.motor[0]=0;check(h.leak()===0,'other engine faults do not create a hole');
    h.faults.motor[2]=70;const small=h.leak();
    h.faults.motor[2]=20;check(h.leak()>small,'larger hole leaks faster');
    const before=h.fuel,rate=h.leak();h.wear(10,0);
    check(Math.abs(h.fuel-(before-rate*10))<1e-8,'fuel leaks even while parked with engine off');
    h.start('motor',2);h.render();const s=h.service;
    for(let i=0;i<4;i++) {
      const [x,y]=s.holes[i];h.down(x,y);h.update(.2);h.up(x,y);
      check(s.sealWork[i]>0&&s.sealWork[i]<s.sealTime,'short hold makes partial sealing progress');
      h.down(x,y);h.move(x+40,y);const work=s.sealWork[i];h.update(1.5);
      check(s.sealWork[i]===work,'holding away from repair point does not seal');
      h.move(x,y);h.update(1.5);h.up(x,y);
    }
    check(s.phase==='done'&&h.leak()===0&&h.kits===4,'sealing all points stops leak and consumes one kit');
    const smallHole=create(),largeHole=create();smallHole.faults.motor[2]=80;largeHole.faults.motor[2]=0;
    smallHole.start('motor',2);largeHole.start('motor',2);
    check(largeHole.service.holeRadius>smallHole.service.holeRadius&&largeHole.service.sealTime>smallHole.service.sealTime,'larger holes look bigger and take longer to seal');
    largeHole.action(0);largeHole.action(4);largeHole.cancel();
    check(largeHole.leak()>0&&largeHole.kits===5,'cancelling does not repair the hole or consume a kit');
    largeHole.wear(1000,0);check(largeHole.fuel===0,'leak cannot make fuel negative');
    const smooth=create(),single=create();
    for(let i=0;i<100;i++)smooth.wear(.1,0);single.wear(10,0);
    check(Math.abs(smooth.fuel-single.fuel)<.0001,'leak is stable across frame rates despite gradual wear');
  }
  for(const part of ['motor','handlebar','frontTire'])for(let index=0;index<4;index++) {
    const h=create();h.start(part,index);const s=h.service,mode=s.job[2];
    h.render();
    if(mode==='timing')for(let i=0;i<3;i++){s.clock=i*Math.PI/2.2;h.action(2);}
    if(mode==='sequence')for(let i=0;i<4;i++){while(s.value>12)h.action(0);while(s.value<10)h.action(1);h.action(2);}
    if(mode==='engineHole')for(let i=0;i<4;i++){h.action(i);for(let j=0;j<8;j++){h.action(4);h.update(.2);}}
    if(mode==='balance'){s.value=0;for(let i=0;i<65&&s.phase==='play';i++){s.value=0;h.update(.05);}}
    if(mode==='patch')for(let i=0;i<s.holes.length;i++){h.action(i);h.action(i);h.update(1.3);h.action(i);}
    if(mode==='pressure'){for(let i=0;i<8;i++)h.action(1);h.action(2);}
    if(mode==='torque'){for(let i=0;i<20;i++)h.action(1);h.action(2);}
    if(mode==='align'){while(s.value<0)h.action(1);while(s.value>0)h.action(0);h.action(2);}
        if(mode==='bolts')for(let i=0;i<4;i++)h.action(s.order.indexOf(i));
    if(mode==='bearings')for(let i=0;i<3;i++){h.action(0);h.update(.16);h.render();}
    if(mode==='clean')for(let i=0;i<4;i++)for(let j=0;j<3;j++)h.action(i);
    if(mode==='wires')for(let i=0;i<4;i++){h.action(i);h.action(4+s.links.indexOf(i));}
    check(s.phase==='done',mode+' completion');
    h.render();
    check(h.kits===4&&h.faults[part][index]===100,mode+' repair consumes exactly one kit');
    h.action(2);check(h.kits===4,mode+' cannot consume twice');
  }
  {
    const h=create();h.start('motor',1);const service=h.service,before=h.view();
    h.down(100,22);h.cursor();check(h.window.drag&&h.cursorStyle==='grabbing','workshop title bar starts window drag');
    h.move(60,52);h.up(60,52);const moved=h.view();
    check(Math.abs(moved.x-before.x+40*.64)<1e-6&&Math.abs(moved.y-before.y-30*.64)<1e-6,'dragging title bar moves workshop');
    check(h.service===service&&!h.window.drag,'moving window preserves active repair');
    h.down(100,22);h.move(-1000,-1000);h.up(0,0);const clamped=h.view();
    check(clamped.x+13*clamped.scale>=3.999&&clamped.y+12*clamped.scale>=3.999,'dragging keeps workshop inside canvas');
    h.click(445,22);const full=h.view();
    check(h.window.full&&full.scale>moved.scale,'maximize button expands workshop');
    check(full.x+13*full.scale>=3.999&&full.x+467*full.scale<=476.001,'maximized workshop fits screen width');
    h.down(100,22);check(!h.window.drag,'maximized title bar does not move window');
    h.click(445,22);const restored=h.view();
    check(!h.window.full&&restored.x===clamped.x&&restored.y===clamped.y,'restore button returns to previous position');
    check(h.service===service,'maximizing preserves active repair');
    h.service.value=22;h.down(125,157);h.move(125,152);h.up(125,152);
    check(h.service.value===12,'repair gestures still match moved window');
    h.click(445,22);h.down(125,152);h.move(125,154);h.up(125,154);
    check(h.service.value===16,'repair gestures match maximized window');
  }
  {
    const h=create();h.render();h.click(50,242);
    check(h.service===null,'diagnostic footer no longer removes parts');
    h.cancel();h.click(300,120);
    check(h.service.index===0,'existing repair row launches minigame');
    h.click(50,240);check(h.service===null,'cancel button returns to diagnostic');
    h.start('frontTire',0);h.action(0);h.action(0);h.action(0);
    check(!h.service.done[0],'patch cannot skip glue drying');
    h.update(1.3);h.action(0);check(h.service.done[0],'patch seals after glue dries');
  }
  {
    const h=create();h.start('motor',0);h.service.clock=.5;
    for(let i=0;i<3;i++)h.action(2);
    check(h.service.phase==='failed'&&h.kits===5&&h.parts.motor===60,'failure is atomic');
    h.start('motor',0);h.action(2);h.cancel();
    check(h.parts.motor===60&&h.kits===5,'cancel is atomic');
    h.faults.motor.fill(100);h.parts.motor=100;
    // Practice follows the existing overall-health rule.
    h.start('motor',0);for(let i=0;i<3;i++){h.service.clock=i*Math.PI/2.2;h.action(2);}
    check(h.kits===4,'low overall health still requires a real repair');
  }
  {
    const h=create();h.resources(0,60);h.start('motor',0);
    check(h.service===null,'no resources blocks real repair');
    h.resources(0,100);h.parts.motor=100;h.faults.motor.fill(100);h.start('motor',0);
    h.action(2);h.action(2);check(h.service.progress===1,'ignition requires separate cycles');
    for(let i=1;i<3;i++){h.service.clock=i*Math.PI/2.2;h.action(2);}
    check(h.service.phase==='done'&&h.kits===0,'practice requires no resources');
  }
  {
    const h=create();h.start('frontTire',1);h.cursor();
    check(h.cursorStyle.includes('data:image/svg+xml'),'hand and tool cursor activates');
    check(h.cursorStyle.includes('48'),'cursor has explicit dimensions');
    h.down(340,126);h.move(340,151);h.move(340,155);
    check(h.service.value===18,'one downstroke pumps once');
    h.move(340,126);h.move(340,151);h.up(340,151);
    check(h.service.value===20&&!h.service.drag,'pump needs a return stroke');
    h.cancel();h.cursor();check(h.cursorStyle==='','cursor restores after cancellation');
    h.start('handlebar',2);h.down(280,153);h.move(240,193);h.up(240,193);
    check(h.service.value>0&&h.service.value<=1.01,'torque responds with reduced sensitivity');
    h.service.value=18;h.down(280,153);h.move(240,193);h.up(240,193);
    check(Math.abs(h.service.value-18.35)<1e-8,'torque uses finer adjustments near target');
    const fineValue=h.service.value;h.down(240,153);h.move(241,154);h.up(241,154);
    check(h.service.value===fineValue,'torque ignores tiny movements near pivot');
    h.start('frontTire',2);h.down(250,123);h.move(249,128);h.move(245,132);h.move(240,133);
    check(h.service.progress===0,'small wrench movement no longer seats a fastener');
    for(let i=9;i<=70;i++){const a=i*.2;h.move(240+Math.cos(a)*10,123+Math.sin(a)*10);}h.up(230,123);
    check(h.service.progress===1,'wrench turn seats the first fastener');
    h.start('handlebar',1);h.down(100,127);h.move(300,151);h.render();h.up(300,151);
    check(h.service.done[0]&&h.service.progress===1,'dragged wire connects to its matching terminal');
    h.start('handlebar',1);h.down(100,127);h.up(300,151,'pointercancel');
    check(h.service.progress===0,'cancelled pointer never connects a cable');
    h.start('frontTire',0);const [x,y]=h.service.holes[0];
    h.down(x,y);h.move(x+10,y);h.move(x-10,y);h.move(x+10,y);h.move(x-10,y);h.up(x,y);
    check(h.service.remaining[0]===2,'rubbing sands the puncture');
    h.down(x,y);h.up(x,y);h.update(1.3);
    h.down(x,y);h.update(.4);h.up(x,y);
    check(!h.service.done[0],'releasing patch early does not seal');
    h.down(x,y);h.update(.81);h.up(x,y);
    check(h.service.done[0],'sustained pressure seals patch');
    h.start('frontTire',3);h.down(80,155);h.move(80,155);
    check(h.service.remaining[0]===3,'stationary brush does not clean');
    h.move(110,155);h.move(75,155);h.move(110,155);h.move(75,155);h.up(75,155);
    check(h.service.remaining[0]<3,'moving brush removes dirt');
    h.start('handlebar',0);const before=h.service.value;h.down(240,145);h.move(260,145);h.up(260,145);
    check(h.service.value>before,'handlebar drag changes alignment');
    h.start('motor',1);h.service.value=22;
    h.down(200,157);check(!h.service.drag,'valve blade cannot be grabbed away from handle');
    h.down(125,157);check(h.service.drag?.kind==='feeler','valve tool can be grabbed by handle');
    h.move(160,157);check(h.service.value===22,'horizontal handle movement does not change valve clearance');
    h.move(160,152);check(h.service.value===12,'moving handle up reduces valve clearance');
    h.move(160,154);check(h.service.value===16,'moving handle down increases valve clearance');
    h.up(160,154);check(!h.service.drag,'releasing handle stops adjustment');
    h.down(125,154);check(h.service.drag?.kind==='feeler','handle can be grabbed again at its new position');
    h.move(125,-500);check(h.service.value===0,'valve handle stops at upper travel limit');
    h.move(125,900);check(h.service.value===35,'valve handle stops at lower travel limit');h.up(125,900);
    h.down(125,163.5);h.move(125,152);h.up(125,152);h.action(2);
    check(h.service.progress===1,'valve adjusted by vertical drag can be confirmed');
  }
  {
    const h=create(()=>.99);h.start('frontTire',0);
    const sand=(index)=>{
      const [x,y]=h.service.holes[index];
      h.down(x,y);h.move(x+10,y);h.move(x-10,y);h.move(x+10,y);h.move(x-10,y);h.up(x,y);
    };
    sand(0);let [x,y]=h.service.holes[0];h.down(x,y);h.up(x,y);
    check(h.service.cure[0]>0&&!h.service.drag,'glue releases tool immediately');
    sand(1);
    check(h.service.remaining[1]===2&&h.service.cure[0]>0,'another puncture can be sanded while glue dries');
    [x,y]=h.service.holes[1];h.down(x,y);h.up(x,y);h.update(.5);h.render();
    check(h.service.cure[0]>0&&h.service.cure[1]>0,'multiple punctures dry concurrently');
    [x,y]=h.service.holes[2];h.down(x,y);h.move(x+8,y);h.up(x+8,y);
    const partial=h.service.sandWork[2];h.down(x,y);h.move(x+8,y);h.up(x+8,y);
    check(h.service.sandWork[2]>partial,'partial sanding survives releasing the pointer');
    sand(2);
    check(h.service.remaining[2]===2&&h.kits===5,'preparation remains independent and consumes no kit');
    h.update(.8);h.render();
    check(h.service.cure[0]===0&&h.service.cure[1]===0,'all glue timers advance independently');
    [x,y]=h.service.holes[0];h.down(x,y);h.update(.81);h.up(x,y);h.render();
    check(h.service.done[0]&&h.service.remaining[2]===2,'sealing one puncture preserves other preparation');
    check(h.service.holes.every(([px,py])=>px>180&&px<300&&py>=116&&py<=212),'all punctures fit within gesture bounds');
  }
  for(const sample of [.01,.5,.99]) {
    const h=create(()=>sample);h.start('frontTire',0);const s=h.service,count=1+Math.floor(sample*3);
    check(s.holes.length===count,'random count supports '+count+' punctures');
    check(s.holes.every(([x,y])=>{const r=Math.hypot(x-240,(y-162)/.84);return r>=35-1e-9&&r<=42+1e-9&&y>=116&&y<=212;}),'punctures stay on reachable rubber');
    check(s.holes.every((p,i)=>s.holes.every((q,j)=>i===j||Math.hypot(p[0]-q[0],p[1]-q[1])>=28)),'punctures have separate hit areas');
    h.action(3);check(s.progress===0&&s.phase==='play','nonexistent puncture cannot be repaired');
    for(let i=0;i<count;i++){h.action(i);h.action(i);h.update(1.3);h.action(i);}
    check(s.phase==='done'&&h.kits===4,'repair completes after actual puncture count');
    h.render();
  }
  {
    const h=create();h.start('frontTire',3);h.down(80,155);
    for(let i=0;i<4;i++)for(let pass=0;pass<12;pass++)h.move(65+i*92+(pass%2)*55,155);
    check(h.service.phase==='done'&&h.service.remaining.every(v=>v===0),'one held brush gesture cleans all sections');
    check(h.kits===4,'continuous cleaning consumes one kit on completion');
    h.up(400,155);
  }
  {
    const h=create();h.start('motor',0);
    h.service.clock=Math.PI/4.4;h.action(2);
    check(h.service.progress===1,'right ignition mark accepts synchronization');
    h.service.clock=3*Math.PI/4.4;h.action(2);
    check(h.service.progress===2,'left ignition mark accepts synchronization');
  }
  for(const sample of [.1,.9]) {
    const h=create(()=>sample);h.start('motor',1);
    const expected=sample<.5?1:22;
    check(h.service.value===expected,'valve starts at exactly 0.01 or 0.22 mm');
    while(h.service.value>12)h.action(0);
    while(h.service.value<10)h.action(1);
    h.action(2);
    check(h.service.progress===1&&h.service.value===expected,'next valve also starts at an exact value');
  }
  {
    const h=create();h.start('frontTire',2);
    const x=240+35*Math.cos(.2),y=123+35*Math.sin(.2);
    h.down(x,y);check(h.service.drag?.kind==='bolt'&&h.service.drag.index===0,'fixation wrench can be grabbed by its handle');
    h.move(240+35*Math.cos(.4),123+35*Math.sin(.4));h.up(270,137);
    const work=h.service.boltWork[0],angle=h.service.boltAngles[0];
    check(work>0&&!h.service.drag,'partial tightening persists after release');
    h.down(240+35*Math.cos(angle),123+35*Math.sin(angle));
    check(h.service.drag?.work===work,'regrabbing handle resumes tightening');
    h.up(270,137);
    h.start('handlebar',2);
    h.down(240+50*Math.cos(.3),153+50*Math.sin(.3));
    check(h.service.drag?.kind==='turn','torque wrench handle starts rotation');
    h.move(240+50*Math.cos(.5),153+50*Math.sin(.5));h.up(280,175);
    const saved=h.service.toolAngle;
    check(h.service.value>0&&Math.abs(saved-.5)<1e-8,'torque handle follows rotation and retains its angle');
    h.down(240+50*Math.cos(saved),153+50*Math.sin(saved));
    check(h.service.drag?.kind==='turn','torque handle can be grabbed again at its retained angle');
  }
  {
    const h=create();h.start('handlebar',3);const s=h.service;
    check(s.bearingStage==='hammer'&&s.hits===0,'bearing repair starts ready to strike');
    h.update(.5);check(s.hits===0,'bearing repair waits for input');
    h.down(240,165);check(s.hits===1&&!s.drag,'clicking the bearing strikes without dragging');
    h.action(0);check(s.hits===1,'duplicate immediate strike is ignored');
    h.update(.16);h.click(240,203);
    check(s.hits===2&&h.kits===5,'button adds second strike without spending kit');
    h.update(.16);h.action(0);
    check(s.phase==='done'&&s.seated===1&&h.kits===4,'third strike completes repair and uses one kit');
    h.action(0);check(h.kits===4,'extra strike cannot consume another kit');
    const cancelled=create();cancelled.start('handlebar',3);cancelled.action(0);cancelled.cancel();
    check(cancelled.kits===5&&cancelled.parts.handlebar===60,'cancelling partial bearing repair preserves resources');
  }
  {
    const h=create();for(let i=0;i<600;i++)h.wear(1,150);
    check(h.parts.motor<59&&h.parts.motor>57,'ten minutes riding causes gradual wear');
    check(h.parts.rearTire<h.parts.motor&&h.parts.handlebar>h.parts.motor,'parts wear at different rates');
    const parked=create();parked.wear(600,0);
    check(parked.parts.motor>59.9,'parked deterioration is minimal');
    const smooth=create();for(let i=0;i<1200;i++)smooth.wear(.5,150);
    check(Math.abs(smooth.parts.motor-h.parts.motor)<1e-8,'wear is independent of frame rate');
  }
  {
    const h=create(()=>.5);const before=JSON.stringify(h.faults);
    check(!h.impact(5)&&JSON.stringify(h.faults)===before,'very gentle contact does not damage parts');
    check(h.impact(-100),'reverse collision can damage a part');
    check(Object.values(h.parts).filter(value=>value<60).length===1,'impact damages exactly one component');
    check(Object.values(h.faults).flat().filter(value=>value<60).length===1,'impact creates one repairable fault');
    check(Math.min(...Object.values(h.parts))>=57&&h.kits===5,'impact damage remains small and consumes no resources');
    const damaged=JSON.stringify(h.faults);
    check(!h.impact(150)&&JSON.stringify(h.faults)===damaged,'cooldown prevents repeated contact damage');
    h.wear(1.6,0);check(h.impact(150),'new impact can damage after cooldown');
    const light=create(()=>.5),fast=create(()=>.5);light.impact(20);fast.impact(150);
    check(fast.parts.frontTire<light.parts.frontTire,'stronger impacts cause greater damage');
  }
  {
    const blendSource=source.slice(source.indexOf('  function smoothBikeFacing('),source.indexOf('  function bikeGroundLayout('));
    const {blend,smooth}=new Function('const BIKE_DIRECTION_COUNT=128,BIKE_DIRECTION_STEP=Math.PI*2/128,VISUAL_DIRECTION_STRIDE=8,VISUAL_DIRECTION_STEP=BIKE_DIRECTION_STEP*8,bikeVisualFacings=new Map();'+blendSource+';return {blend:bikeSpritePose,smooth:smoothBikeFacing};')();
    const step=Math.PI*2/128;
    const before=blend(2*Math.PI-.000001),after=blend(.000001);
    check(before.direction===0&&after.direction===0,'rear pose stays intact across the full rotation wrap');
    for(const angle of [-.0001,0,step*.5,Math.PI,Math.PI*2,Math.PI*8+.2]){
      const p=blend(angle);
      check(p.direction>=0&&p.direction<128&&p.direction%8===0,'orientation uses one complete pose across angle wraps');
    }
    const a=blend(step-.00001),b=blend(step+.00001);
    check(a.direction===b.direction,'nearby headings reuse a stable silhouette');
    const initial=smooth(Math.PI/16-.01,0,'test').direction;
    for(let i=1;i<=20;i++)check(smooth(Math.PI/16+(i%2?.01:-.01),i/60,'test').direction===initial,'steering jitter does not flicker between poses');
  }
  {
    const transmission=source.slice(source.indexOf('  const BIKE_GEAR_LIMITS='),source.indexOf('  const player ='));
    const drive=source.slice(source.indexOf('      const motorFactor ='),source.indexOf('      if ((throttle || reverse)'));
    const createGearbox=new Function(`
      let state='drive',mounted=true,bikeEngineRunning=true,fuel=100,bikeLife=100,hunger=100,thirst=100;
      const bike={speed:0},bikeParts={motor:100,frontTire:100,rearTire:100},W=480,H=270;
      const bikeCanvasPointer=e=>({x:e.clientX,y:e.clientY});
      ${transmission}
      return {limit:bikeGearSpeedLimit,shift:shiftBikeGear,update:updateBikeGearbox,
        click:(x,y)=>handleBikeDashboardPointer({button:0,clientX:x,clientY:y}),
        drive(dt){const throttle=true,reverse=false;${drive}},
        off(){mounted=false;bike.speed=0},on(){mounted=true},engineOff(){bikeEngineRunning=false;bike.speed=0;},condition(){hunger=20;thirst=15;bikeParts.motor=45;bikeParts.frontTire=50;bikeParts.rearTire=45},get gear(){return bikeGear},get speed(){return bike.speed},get rpm(){return bikeRpm}};
    `);
    const h=createGearbox();
    for(const [gear,kmh] of [[1,30],[2,60],[3,90],[4,125]])check(Math.abs(h.limit(gear)*.52-kmh)<1e-9,'gear '+gear+' has correct speed limit');
    for(let gear=1;gear<=4;gear++){
      for(let i=0;i<1800;i++){h.update(1/60,h.speed,true);h.drive(1/60);}
      check(Math.abs(h.speed*.52-[0,30,60,90,125][gear])<.001,'riding reaches the selected gear limit');
      if(gear<4){check(h.shift(1),'upshift succeeds');check(!h.shift(1),'shift cooldown prevents skipped gears');}
    }
    check(!h.shift(1),'gearbox cannot exceed fourth gear');
    h.update(.3,h.speed,false);check(h.click(400,249)&&h.gear===3,'dashboard lower button shifts down');
    h.update(.3,h.speed,false);check(h.click(451,249)&&h.gear===4,'dashboard upper button shifts up');
    h.off();h.update(.3,0,false);check(!h.shift(-1),'cannot shift while walking');
    check(Number.isFinite(h.rpm)&&h.rpm>=0,'rpm indicator remains finite');
    h.condition();h.on();
    for(let i=0;i<3600;i++){h.update(1/60,h.speed,true);h.drive(1/60);}
    check(h.gear===4&&Math.abs(h.speed*.52-125)<.001,'remounting with wear and low needs still reaches displayed maximum');
    h.engineOff();for(let i=0;i<120;i++){h.update(1/60,h.speed,true);h.drive(1/60);}
    check(h.speed===0&&h.rpm<1,'stopped engine cannot accelerate and rpm falls to zero');
  }
  return `${assertions} maintenance checks passed`;
}
if(typeof module!=='undefined'&&typeof require==='function') {
  console.log(runBikeMaintenanceTests(require('fs').readFileSync(require('path').join(__dirname,'../game.js'),'utf8')));
}
