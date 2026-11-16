const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let geometry=0;
class Path2D {
  constructor(){this.commands=[];}
  ellipse(...args){geometry++;this.commands.push(['ellipse',...args]);}
  moveTo(...args){geometry++;this.commands.push(['moveTo',...args]);}
  lineTo(...args){geometry++;this.commands.push(['lineTo',...args]);}
}
const box={module:{exports:{}},Path2D};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/forest.js'),'utf8'),box);
const forest=box.module.exports.create();
const options={width:12800,height:4800,seed:123,road:()=>false,blocked:()=>false};
forest.generate(options);
const camera={x:forest.region.x,y:forest.region.y};
function render(){
  const ops=[],ctx={fill(path){ops.push(['fill',this.fillStyle,path.commands]);},stroke(path){ops.push(['stroke',this.strokeStyle,this.lineWidth,this.lineCap,path.commands]);}};
  forest.ground(ctx,camera);return JSON.stringify(ops);
}
function reference(){
  const ops=[];
  for(const item of forest.query(camera.x,camera.y,700)){
    ops.push(['fill',item.dense?'#42543738':'#4d60432b',[['ellipse',item.x,item.y,42,32,item.variant,0,Math.PI*2]]]);
    if(item.dense&&item.kind==='grass')ops.push(['fill','#8c805b22',[['ellipse',item.x,item.y,35,24,0,0,Math.PI*2]]]);
  }
  const r=forest.region,commands=[];
  for(let x=r.x-r.rx;x<=r.x+r.rx;x+=30)commands.push([x===r.x-r.rx?'moveTo':'lineTo',x,forest.trail(x)]);
  ops.push(['stroke','#81765333',48,'round',commands],['stroke','#8f805433',24,'round',commands]);
  return JSON.stringify(ops);
}
assert.equal(render(),reference(),'Exact geometry, alpha, paint order and trail widths are preserved');
const cold=geometry;
for(let frame=0;frame<120;frame++)assert.equal(render(),reference());
assert.equal(geometry,cold,'Warm frames construct no vegetation or trail geometry');
camera.x+=93;camera.y+=47;assert.equal(render(),reference(),'Camera movement preserves edge patches and order');
forest.generate({...options,seed:456});assert.equal(render(),reference(),'New maps discard old terrain');
forest.clear();assert.equal(forest.query(camera.x,camera.y,700).length,0);
const source=fs.readFileSync(require.resolve('../src/game.js'),'utf8');
const cache=source.slice(source.indexOf('  const roadPathCache='),source.indexOf('  function drawGround('));
const road=new Function('Path2D',cache+';return roadPath;')(Path2D);
const points=[[0,0],[100,70],[150,300]],path=road(points),before=geometry;
for(let frame=0;frame<120;frame++)assert.equal(road(points),path);
assert.equal(geometry,before);assert.deepEqual(path.commands,[['moveTo',0,0],['lineTo',100,70],['lineTo',150,300]]);
assert.notEqual(road([[1,2],[3,4]]),path,'Regenerated roads build fresh geometry');
console.log('Terrain: '+cold+' vector commands on the first frame, zero rebuilt across 120 warm frames; exact paint order and map reset verified');
