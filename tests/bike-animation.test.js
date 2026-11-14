// Run: node tests/bike-animation.test.js
function runBikeAnimationTests(source,mountedSource,art){
  let checks=0;
  const check=(ok,message)=>{checks++;if(!ok)throw Error(message);};
  const constants=source.slice(source.indexOf('  const BIKE_DIRECTION_COUNT='),source.indexOf('  const bikeSpriteBounds='));
  const facingSource=source.slice(source.indexOf('  function smoothBikeFacing('),source.indexOf('  function bikeGroundLayout('));
  const facing=new Function(`${constants};const bikeVisualFacings=new Map();${facingSource};return smoothBikeFacing;`)();
  for(const fps of [30,60,144]){
    for(let i=0;i<fps*2;i++){
      const angle=i/fps*1.2,pose=facing(angle,i/fps,'test'+fps);
      check(Math.abs(Math.atan2(Math.sin(pose.angle-angle),Math.cos(pose.angle-angle)))<1e-10,'visual heading tracks travel without lag');
      const delta=Math.atan2(Math.sin(angle-pose.direction*Math.PI/64),Math.cos(angle-pose.direction*Math.PI/64));
      check(Math.abs(delta)<=Math.PI/64*.61,'direction quantization stays within its deadband');
    }
  }
  const context={save(){},restore(){},beginPath(){},rect(){},clip(){},translate(){},scale(){},transform(){},drawImage(){}};
  const document={createElement:()=>({getContext:()=>context})};
  const create=new Function('document','MOUNTED_BIKE_ART',mountedSource+';return createMountedRiderAtlas;')(document,art);
  const {metadata}=create({rider:{}});
  for(let i=0;i<128;i++){
    const pose=metadata.poses[i],sourceIndex=metadata.sourceDirections[i];
    if(art.sourceHeadings){
      const target=i*Math.PI*2/128;
      const distance=heading=>Math.abs(Math.atan2(Math.sin(heading-target),Math.cos(heading-target)));
      const selected=distance(art.sourceHeadings[sourceIndex]);
      check(art.sourceHeadings.every(heading=>distance(heading)>=selected-1e-10),'mounted pose matches the nearest calibrated screen heading');
    }
    check(pose.crop===art.frames[sourceIndex],'pose uses a single complete source sprite');
    check([pose.left,pose.top,pose.width,pose.height].every(Number.isFinite),'pose geometry stays finite');
    const contacts=metadata.wheelContacts[i];
    const x=contacts.reduce((s,p)=>s+p[0],0)/contacts.length;
    const y=contacts.reduce((s,p)=>s+p[1],0)/contacts.length;
    check(Math.abs(x-64)<1e-8&&Math.abs(y-100)<1e-8,'tires stay anchored while switching direction');
    const next=metadata.poses[(i+1)%128];
    const scale=pose.height/pose.crop[3],nextScale=next.height/next.crop[3];
    check(Math.abs(nextScale/scale-1)<.08,'neighboring directions avoid abrupt scale changes');
  }
  const drawing=source.slice(source.indexOf('  function drawBike(x,'),source.indexOf('  function drawBikeFallback('));
  check(!drawing.includes("'lighter'")&&!drawing.includes('poses[next]'),'turns never superimpose different rider silhouettes');
  check(drawing.includes("view==='world'?bike.wheel"),'wheel animation follows actual traveled distance');
  check(source.includes('Math.sign(travelSpeed)*riddenDistance/9'),'wheel rotation reverses and stops against obstacles');
  return checks+' bike animation checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function'){
  const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
  console.log(runBikeAnimationTests(fs.readFileSync(path.join(root,'src/game.js'),'utf8'),fs.readFileSync(path.join(root,'src/mounted-rider.js'),'utf8'),JSON.parse(fs.readFileSync(path.join(root,'assets/sprites-128/piloto-moto-unificado.json'),'utf8'))));
}
