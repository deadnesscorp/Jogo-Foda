// Run with: node tests/render-cache.test.js
function runRenderCacheTests(source) {
  let assertions=0,created=0;
  const check=(condition,message)=>{assertions++;if(!condition)throw Error(message);};
  const document={createElement(){
    created++;const commands=[],painter={fillStyle:'',fillRect(x,y,w,h){commands.push({x,y,w,h,color:this.fillStyle});}};
    return {getContext:()=>painter,pixel(x,y){for(let i=commands.length-1;i>=0;i--){const r=commands[i];if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)return r.color;}}};
  }};
  const cache=source.slice(source.indexOf('  const GROUND_CHUNK_SIZE='),source.indexOf('  function drawGround('));
  const visibility=source.slice(source.indexOf('  function isoBuildingVisible('),source.indexOf('  function drawIsoBuilding('));
  const api=new Function('document',`const W=640,H=360;${cache}\n${visibility};return {tile:groundTextureChunk,visible:isoBuildingVisible,get size(){return groundTextureCache.size;}};`)(document);
  const first=api.tile(0,0),count=created;
  check(api.tile(0,0)===first&&created===count,'cached floor is reused without redrawing');
  for(const [cx,cy] of [[0,0],[256,512],[768,1024],[5376,3328]]){
    const tile=api.tile(cx,cy);
    for(let i=0;i<32;i++){
      const x=(i*37)%256,y=(i*53)%256,wx=cx+Math.floor(x/16)*16,wy=cy+Math.floor(y/16)*16;
      const shade=((Math.imul(wx/16,374761393)^Math.imul(wy/16,668265263))>>>0)%5;
      const speck=(wx*7+wy*3)%11===0&&x%16>=4&&x%16<6&&y%16>=5&&y%16<7;
      const expected=speck?'#343b38':shade===0?'#37433b':shade===1?'#354139':'#344038';
      check(tile.pixel(x,y)===expected,'cached floor preserves original texture at world coordinates');
    }
  }
  for(let i=0;i<80;i++)api.tile(i*256,256);
  check(api.size===48,'floor cache has bounded memory');
  check(api.tile(0,0)!==first,'evicted textures can be recreated');
  const shape=(x,y,height=80)=>({base:[{x,y},{x:x+40,y},{x:x+40,y:y+30},{x,y:y+30}],roof:[{x,y:y-height},{x:x+40,y:y-height},{x:x+40,y:y+30-height},{x,y:y+30-height}]});
  check(api.visible(shape(100,100)),'visible buildings remain drawn');
  check(!api.visible(shape(-1000,100))&&!api.visible(shape(1000,100)),'distant buildings on either side are skipped');
  check(!api.visible(shape(100,-200))&&!api.visible(shape(100,1000)),'buildings beyond vertical limits are skipped');
  check(api.visible(shape(100,500,200)),'tall building remains visible when its base is below screen');
  check(api.visible(shape(100,550,100)),'smoke and roof details retain a conservative margin');
  const bikeDrawing=source.slice(source.indexOf('  function drawBike(x,'),source.indexOf('  function drawBikeFallback('));
  const blended=new Function(`
    let RENDER_SCALE=2,bikeBlendStamp='',blends=0,clears=0,mounted=false;
    const positions=[],ctx={save(){},restore(){},drawImage(image,x,y){positions.push([x,y]);}};
    const bikeBlendLayer={width:320,height:320},bikeBlendContext={setTransform(){},clearRect(){clears++;},drawImage(){blends++;}};
    const bikeSpritesReady=()=>true,smoothBikeFacing=angle=>({angle,direction:0}),bikeSpritePose=()=>({direction:0,frame:0});
    const bikeDirectionBlend=angle=>({direction:Math.floor(angle),next:Math.floor(angle)+1,weight:.5});
    const bikeGroundLayout=(x,y)=>({sx:0,sy:0,sw:20,sh:20,left:x-10,top:y-20,width:20,height:20,contacts:[[x,y],[x+2,y]],riderOffsetX:0,riderOffsetY:0});
    const bikeSpriteSource=()=>({}),drawBikeContactShadow=()=>{},drawBikeGroundShadow=()=>{};
    ${bikeDrawing}
    return {draw:drawBike,positions,get blends(){return blends;},get clears(){return clears;},resize(){bikeBlendStamp='';},mount(){mounted=true;}};
  `)();
  blended.draw(100,100,0,0,0);const draws=blended.blends;
  blended.draw(200,200,0,100,1);
  check(blended.blends===draws&&blended.clears===1,'unchanged bike orientation reuses blended sprite');
  check(blended.positions[1][0]===120&&blended.positions[1][1]===120,'cached sprite still follows bike position');
  blended.draw(200,200,1,100,2);check(blended.blends>draws,'turning refreshes blended sprite');
  const beforeResize=blended.blends;blended.resize();blended.draw(200,200,1,0,3);
  check(blended.blends>beforeResize,'resizing invalidates cached sprite');
  const beforeMount=blended.blends;blended.mount();const rider=blended.draw(200,200,1,0,4);
  check(blended.blends>beforeMount&&rider.integrated,'mounting refreshes sprite and embeds rider in motorcycle');
  return assertions+' render cache checks passed';
}
if(typeof module!=='undefined'&&typeof require==='function') {
  console.log(runRenderCacheTests(require('fs').readFileSync(require('path').join(__dirname,'../game.js'),'utf8')));
}
