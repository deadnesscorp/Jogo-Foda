// Run with: node tests/bike-maintenance.test.js
function runBikeMaintenanceTests(source) {
  new Function(source); // Check the complete game's syntax as well as the extracted logic.
  const jobs=source.slice(source.indexOf('  const bikeJobs ='),source.indexOf('  const bikePartNames ='));
  const logic=source.slice(source.indexOf('  function damageBikePart('),source.indexOf('  function handleBikeInspectPointer('));
  const interaction=source.slice(source.indexOf('  function handleBikeInspectPointer('),source.indexOf('  function drawBikeInspectMenu('));
  const create=new Function('random',`
    const Math=Object.create(globalThis.Math);Math.random=random||globalThis.Math.random;
    let bikeService=null,repairKits=5,bikeLife=60,bikeInspectTab='Motor',bikeTireSelected='frontTire';
    let bikeWearClock=0,bikeCrashCooldown=0;
    let bikeInspectOpen=true;
    const W=480,H=270,canvas={getBoundingClientRect:()=>({left:0,top:0,width:480,height:270}),dataset:{},style:{},setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){}};
    const bikeToolCursors=new Map();
    const gradient={addColorStop(){}},ctx=new Proxy({}, {get:(target,key)=>target[key]??((key==='createLinearGradient'||key==='createRadialGradient')?()=>gradient:()=>{}),set:(target,key,value)=>(target[key]=value,true)});
    const bikePartNames={motor:'Motor',handlebar:'Guidão',frontTire:'Dianteiro',rearTire:'Traseiro'},bikePartColor=()=>'#fff';
    const bikeParts={motor:60,handlebar:60,frontTire:60,rearTire:60};
    const bikeFaults=Object.fromEntries(Object.keys(bikeParts).map(p=>[p,[60,60,60,60]]));
    const setToast=()=>{};
    ${jobs}\n${logic}\n${interaction}
    return {start:startBikeService,action:bikeServiceAction,update:updateBikeService,damage:damageBikePart,
      wear:updateBikeCondition,impact:applyBikeImpact,
      render:drawBikeServiceContent,click:(x,y)=>handleBikeInspectPointer({button:0,clientX:x,clientY:y}),
      down:(x,y)=>handleBikeInspectPointer({button:0,pointerId:1,clientX:x,clientY:y,preventDefault(){}}),
      move:(x,y)=>moveBikeServiceGesture({pointerId:1,clientX:x,clientY:y,buttons:1}),
      up:(x,y,type='pointerup')=>endBikeServiceGesture({pointerId:1,clientX:x,clientY:y,type}),
      cursor:syncBikeServiceCursor,get cursorStyle(){return canvas.style.cursor},
      cancel(){bikeService=null},get service(){return bikeService},get kits(){return repairKits},
      resources(kits,life){repairKits=kits;bikeLife=life},
      get life(){return bikeLife},parts:bikeParts,faults:bikeFaults};
  `);
  let assertions=0;
  const check=(condition,message)=>{assertions++;if(!condition)throw Error(message);};
  for(const part of ['motor','handlebar','frontTire'])for(let index=0;index<4;index++) {
    const h=create();h.start(part,index);const s=h.service,mode=s.job[2];
    h.render();
    if(mode==='timing')for(let i=0;i<3;i++){s.clock=i*Math.PI/2.2;h.action(2);}
    if(mode==='sequence')for(let i=0;i<4;i++){while(s.value>12)h.action(0);while(s.value<10)h.action(1);h.action(2);}
    if(mode==='route'){s.cells=[1,1,1,1];for(let i=0;i<4;i++)h.action(i);}
    if(mode==='balance'){s.value=0;for(let i=0;i<65&&s.phase==='play';i++){s.value=0;h.update(.05);}}
    if(mode==='patch')for(let i=0;i<s.holes.length;i++){h.action(i);h.action(i);h.update(1.3);h.action(i);}
    if(mode==='pressure'){for(let i=0;i<8;i++)h.action(1);h.action(2);}
    if(mode==='torque'){for(let i=0;i<20;i++)h.action(1);h.action(2);}
    if(mode==='align'){while(s.value<0)h.action(1);while(s.value>0)h.action(0);h.action(2);}
        if(mode==='bolts')for(let i=0;i<4;i++)h.action(s.order.indexOf(i));
    if(mode==='bearings')for(let i=0;i<4;i++) {
      h.action(s.order.indexOf(i));
      while(s.value>0)h.action(0);while(s.value<0)h.action(1);h.action(2);
      for(let hit=0;hit<8;hit++){h.update(.25);h.action([0,2,1,3][hit%4]);h.render();}
    }
    if(mode==='clean')for(let i=0;i<4;i++)for(let j=0;j<3;j++)h.action(i);
    if(mode==='wires')for(let i=0;i<4;i++){h.action(i);h.action(4+s.links.indexOf(i));}
    check(s.phase==='done',mode+' completion');
    h.render();
    check(h.kits===4&&h.faults[part][index]===100,mode+' repair consumes exactly one kit');
    h.action(2);check(h.kits===4,mode+' cannot consume twice');
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
    h.start('motor',1);const initialGap=h.service.value;h.down(200,150);h.move(180,150);h.up(180,150);
    check(h.service.value<initialGap,'feeler drag adjusts valve clearance');
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
    const h=create();h.start('handlebar',3);const s=h.service,index=s.order.indexOf(0);
    const x=82+(index%2)*52,y=145+Math.floor(index/2)*40;
    h.down(x,y);h.move(242,153);h.up(242,153);
    check(s.bearingStage==='align'&&s.progress===0,'dragging a bearing starts alignment instead of completing it');
    h.action(2);check(s.bearingStage==='align','misaligned bearing cannot be hammered');
    while(s.value>0)h.action(0);while(s.value<0)h.action(1);h.action(2);
    check(s.bearingStage==='hammer','centered bearing enables hammer');
    h.update(.5);check(s.seated===0,'bearing does not seat without strikes');
    h.action(0);const hits=s.hits;h.action(2);
    check(s.hits===hits,'rapid strikes must wait for hammer recovery');
    h.update(.25);h.action(1);
    check(s.mistakes===1&&s.hits===1&&h.kits===5,'wrong side does not seat bearing or spend resources');
    h.action(2);h.update(.25);h.action(1);h.update(.25);h.action(3);
    check(s.hits===4&&s.seated===.5,'opposite alternating strikes seat the bearing evenly');
    h.cancel();check(h.kits===5&&h.parts.handlebar===60,'cancelled bearing assembly preserves resources and condition');
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
    const blendSource=source.slice(source.indexOf('  function bikeDirectionBlend('),source.indexOf('  function smoothBikeFacing('));
    const blend=new Function('const BIKE_DIRECTION_COUNT=64,BIKE_DIRECTION_STEP=Math.PI*2/64;'+blendSource+';return bikeDirectionBlend;')();
    const step=Math.PI*2/64;
    const before=blend(2*Math.PI-.000001),after=blend(.000001);
    check(before.direction===63&&before.next===0&&after.direction===0,'sprite blend crosses full rotation without wrapping backwards');
    for(const angle of [-.0001,0,step*.5,Math.PI,Math.PI*2,Math.PI*8+.2]){
      const p=blend(angle);
      check(p.direction>=0&&p.direction<64&&p.next>=0&&p.next<64&&p.weight>=0&&p.weight<1,'orientation blend remains valid across angle wraps');
    }
    const a=blend(step-.00001),b=blend(step+.00001);
    check(a.next===b.direction&&a.weight>.999&&b.weight<.001,'neighboring sprites meet continuously at orientation boundary');
  }
  {
    const transmission=source.slice(source.indexOf('  const BIKE_GEAR_LIMITS='),source.indexOf('  const player ='));
    const drive=source.slice(source.indexOf('      const motorFactor ='),source.indexOf('      if ((throttle || reverse)'));
    const createGearbox=new Function(`
      let state='drive',mounted=true,fuel=100,bikeLife=100,hunger=100,thirst=100;
      const bike={speed:0},bikeParts={motor:100,frontTire:100,rearTire:100},W=480,H=270;
      const bikeServicePointer=e=>({x:e.clientX,y:e.clientY});
      ${transmission}
      return {limit:bikeGearSpeedLimit,shift:shiftBikeGear,update:updateBikeGearbox,
        click:(x,y)=>handleBikeDashboardPointer({button:0,clientX:x,clientY:y}),
        drive(dt){const throttle=true,reverse=false;${drive}},
        off(){mounted=false;bike.speed=0},on(){mounted=true},condition(){hunger=20;thirst=15;bikeParts.motor=45;bikeParts.frontTire=50;bikeParts.rearTire=45},get gear(){return bikeGear},get speed(){return bike.speed},get rpm(){return bikeRpm}};
    `);
    const h=createGearbox();
    for(const [gear,kmh] of [[1,25],[2,60],[3,90],[4,125]])check(Math.abs(h.limit(gear)*.52-kmh)<1e-9,'gear '+gear+' has correct speed limit');
    for(let gear=1;gear<=4;gear++){
      for(let i=0;i<1800;i++){h.update(1/60,h.speed,true);h.drive(1/60);}
      check(Math.abs(h.speed*.52-[0,25,60,90,125][gear])<.001,'riding reaches the selected gear limit');
      if(gear<4){check(h.shift(1),'upshift succeeds');check(!h.shift(1),'shift cooldown prevents skipped gears');}
    }
    check(!h.shift(1),'gearbox cannot exceed fourth gear');
    h.update(.3,h.speed,false);check(h.click(395,240)&&h.gear===3,'dashboard lower button shifts down');
    h.update(.3,h.speed,false);check(h.click(440,240)&&h.gear===4,'dashboard upper button shifts up');
    h.off();h.update(.3,0,false);check(!h.shift(-1),'cannot shift while walking');
    check(Number.isFinite(h.rpm)&&h.rpm>=0,'rpm indicator remains finite');
    h.condition();h.on();
    for(let i=0;i<3600;i++){h.update(1/60,h.speed,true);h.drive(1/60);}
    check(h.gear===4&&Math.abs(h.speed*.52-125)<.001,'remounting with wear and low needs still reaches displayed maximum');
  }
  return `${assertions} maintenance checks passed`;
}
if(typeof module!=='undefined'&&typeof require==='function') {
  console.log(runBikeMaintenanceTests(require('fs').readFileSync(require('path').join(__dirname,'../game.js'),'utf8')));
}
