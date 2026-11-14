const assert=require('node:assert/strict');
const {TYPES,draw}=require('../urban-structures.js');
assert.equal(TYPES.length,5);
assert.equal(new Set(TYPES.map(t=>t.name)).size,5);
for(const [index,type] of TYPES.entries()){
  let depth=0,paths=0;
  const ctx=new Proxy({}, {
    get(target,key){
      if(key==='save')return ()=>depth++;
      if(key==='restore')return ()=>depth--;
      return target[key]||((...args)=>{
        if(['moveTo','lineTo','translate','transform','fillRect','arc','ellipse'].includes(key)){
          args.forEach(value=>assert.ok(Number.isFinite(value),key+' coordinate'));paths++;
        }
      });
    },set(target,key,value){target[key]=value;return true;}
  });
  for(const width of [35,80,160])draw(ctx,{base:[{x:0,y:0},{x:width,y:width*.5},{x:width-70,y:(width+70)*.5},{x:-70,y:35}],lift:type.height},index);
  assert.equal(depth,0,'each building restores canvas state');
  assert.ok(paths>100,'each variant draws its architectural details');
}
console.log('Urban structure rendering checks passed');
