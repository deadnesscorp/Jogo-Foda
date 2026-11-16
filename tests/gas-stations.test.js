const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/game.js'),'utf8');
const logic=source.slice(source.indexOf('  function nearbyStation('),source.indexOf('  function interact('));
function create(uses){return new Function('uses',`
const buildings=[[0,0,100,78,'station'],[3000,0,100,78,'station']];
const supplies=[0,1].map(()=>({fuelUses:uses,stock:{toolkit:1,water:1,ration:1}}));
const bike={x:0,y:0,speed:0},player={x:0,y:0};let mounted=true,fuel=40,thirst=10,hunger=10,boxes=0;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),isGasStation=()=>true,buildingDoor=i=>({x:i*3000,y:0});
const setToast=()=>{},addToolbox=()=>boxes++;
${logic}
return {refuel:refuelAtStation,collect:type=>collectStationSupply(supplies[0],type),bike,player,supplies,
setFuel(n){fuel=n;},onFoot(){mounted=false;},get fuel(){return fuel;},get resources(){return {boxes,thirst,hunger};}};
`)(uses);}
for(let uses=1;uses<=5;uses++){
  const game=create(uses);
  for(let i=0;i<uses;i++){
    game.setFuel(20);game.refuel();assert.equal(game.fuel,100);assert.equal(game.supplies[0].fuelUses,uses-i-1);
    game.refuel();assert.equal(game.supplies[0].fuelUses,uses-i-1,'Full tank consumes nothing');
  }
  game.setFuel(20);game.refuel();assert.equal(game.fuel,20,'Empty stations cannot refuel');
  assert.equal(game.supplies[1].fuelUses,uses,'Stocks are independent');
  for(const type of ['toolkit','water','ration']){assert(game.collect(type));assert(!game.collect(type));}
  assert.deepEqual(game.resources,{boxes:1,thirst:48,hunger:52});
}
const game=create(5);game.bike.speed=10;game.refuel();assert.equal(game.fuel,40);
game.bike.speed=0;game.bike.x=200;game.refuel();assert.equal(game.fuel,40);
game.onFoot();game.refuel();assert.equal(game.fuel,40,'A distant bike cannot refuel remotely');
assert.equal(game.supplies[0].fuelUses,5);
console.log('Stations: 1?5 full refuels, depletion, full tanks, independent stocks, stopped/nearby bike and one-time supplies passed');
