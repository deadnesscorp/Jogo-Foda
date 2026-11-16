const assert=require('node:assert/strict');
const forest=require('../src/forest.js').create();
const options={width:12800,height:4800,seed:123,road:(x,y,r)=>Math.abs(y-3300)<r,blocked:(x,y,r)=>Math.hypot(x-4000,y-1200)<180+r};
forest.generate(options);
assert(forest.items.length>1000,'Vegetation fills the wider map');
assert(new Set(forest.items.map(i=>i.kind)).size===4);
for(const item of forest.items){
  assert(!options.road(item.x,item.y,115));assert(!options.blocked(item.x,item.y,65));
  if(item.dense&&Math.abs(item.y-forest.trail(item.x))<42)assert.equal(item.kind,'grass','Trail remains walkable');
}
for(const [x,y] of [[100,100],[3500,1100],[8000,3000]]){
  const expected=forest.items.filter(p=>Math.abs(p.x-x)<=600&&Math.abs(p.y-y)<=600);
  assert.deepEqual(new Set(forest.query(x,y,600)),new Set(expected));
}
const first=JSON.stringify(forest.items);forest.generate(options);assert.equal(JSON.stringify(forest.items),first);
forest.clear();assert.equal(forest.query(3500,1100,10000).length,0);
console.log('Forest generation, road clearance, obstacle clearance, trails, spatial queries and reset passed');
