/* Seeded woodland, spatial queries and compact reusable vegetation artwork. */
(() => {
  'use strict';
  function create(){
    const items=[],cells=new Map(),sprites=new Map();
    let region={x:0,y:0,rx:1,ry:1};
    let groundPaths=new WeakMap(),trailPath=null;
    function configure(width,height){trailPath=null;region={x:width*.28,y:height*.24,rx:width*.22,ry:height*.2};}
    function contains(x,y){return ((x-region.x)/region.rx)**2+((y-region.y)/region.ry)**2<=1;}
    function allowsBuilding(x,y,w,h,cabin=false){
      const left=x-48,top=y-48,right=x+w*1.65+48,bottom=y+h*1.65+80;
      if(cabin)return [[left,top],[right,top],[right,bottom],[left,bottom]].every(([a,b])=>contains(a,b));
      return !contains(Math.max(left,Math.min(right,region.x)),Math.max(top,Math.min(bottom,region.y)));
    }
    function clear(){items.length=0;cells.clear();groundPaths=new WeakMap();trailPath=null;}
    function trail(x,y){return region.y+Math.sin((x-region.x)/290)*105;}
    function generate({width,height,seed=1,blocked,road}){
      clear();configure(width,height);
      let state=seed>>>0;
      const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
      for(let gy=50;gy<height-50;gy+=76)for(let gx=50;gx<width-50;gx+=76){
        const x=gx+(random()-.5)*36,y=gy+(random()-.5)*36;
        const dense=((x-region.x)/region.rx)**2+((y-region.y)/region.ry)**2<1;
        const grove=Math.sin(x/410)+Math.cos(y/330)+Math.sin((x+y)/610)>1;
        if(random()>(dense?.91:grove?.55:.17))continue;
        if(road(x,y,115)||blocked(x,y,65))continue;
        // A continuous east-west walking trail and two connected clearings.
        const clearing=Math.hypot((x-region.x)/1.4,y-region.y)<135||Math.hypot(x-region.x-650,y-trail(x,y))<110;
        const onTrail=dense&&(Math.abs(y-trail(x,y))<42||clearing);
        const choice=random(),kind=onTrail?'grass':choice<.64?'tree':choice<.83?'bush':choice<.91?'rock':'grass';
        const item={x,y,kind,variant:Math.floor(random()*6),size:.8+random()*.5,dense};
        items.push(item);const key=Math.floor(x/256)+','+Math.floor(y/256);
        if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);
      }
    }
    function query(x,y,radius){
      const result=[];
      for(let a=Math.floor((x-radius)/256);a<=Math.floor((x+radius)/256);a++)for(let b=Math.floor((y-radius)/256);b<=Math.floor((y+radius)/256);b++){
        for(const item of cells.get(a+','+b)||[])if(Math.abs(item.x-x)<=radius&&Math.abs(item.y-y)<=radius)result.push(item);
      }
      return result;
    }
    function paint(ctx,item){
      const v=item.variant;
      const ellipse=(x,y,rx,ry,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();};
      const poly=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
      ellipse(3,3,item.kind==='tree'?21:15,6,'#091b1760');
      if(item.kind==='tree'){
        poly([[-8,1],[-5,-37],[5,-38],[9,1],[0,-2]],'#504b38');
        poly([[-2,0],[-1,-36],[2,-36],[4,0]],'#9a8354');
        poly([[-4,-19],[-17,-34],[-15,-35],[1,-24],[14,-43],[16,-42],[3,-14]],'#655b40');
        if(v%2===0){
          for(let i=0;i<5;i++){
            const y=-17-i*11,w=22-i*3;
            poly([[-w,y],[.1*w,y-4],[0,y-29],[.28*w,y-23],[w*.76,y-13],[w,y-9],[w*.71,y+2],[0,y-1]],['#294f43','#32634e','#407658','#558667','#496f4e'][i]);
            poly([[0,y-35],[-w,y],[-9,y-4]],'#70916b66');
          }
        }else{
          for(const [x,y,r] of [[-14,-37,16],[12,-39,18],[-3,-51,20],[-15,-58,13],[14,-60,14],[0,-70,13]]){
            ellipse(x+2,y+3,r,r*.71,'#243f35');
            poly([[x-r,y],[x-r*.84,y-r*.58],[x-r*.42,y-r*.88],[x-r*.13,y-r],[x+r*.38,y-r*.88],
              [x+r*.85,y-r*.56],[x+r,y-r*.12],[x+r*.85,y+r*.45],[x+r*.4,y+r*.67],[x-r*.4,y+r*.63]],['#365f46','#416d4e','#527c55'][v%3]);
            poly([[x-r*.74,y-r*.22],[x-r*.43,y-r*.73],[x-r*.1,y-r*.91],[x+r*.26,y-r*.77],
              [x-r*.06,y-r*.54],[x-r*.4,y-r*.49]],'#99ae7244');
          }
          for(let i=0;i<6;i++)ellipse(Math.sin(i*7)*15,-40-(i*11%28),1.4,.9,'#d4d28b70');
        }
        for(const dx of [-9,8])poly([[0,-3],[dx,3],[dx*.5,-5]],'#655d40');
      }else if(item.kind==='rock'){
        poly([[-14,0],[-11,-9],[1,-16],[14,-8],[17,1],[1,6]],'#59685b');
        poly([[-11,-9],[1,-16],[14,-8],[1,-5]],'#99a18a');
        poly([[1,-5],[14,-8],[17,1],[1,6]],'#46594e');
        ellipse(-6,-2,7,3,'#5b784e');
      }else{
        for(let i=0;i<9;i++){
          const x=Math.sin(i*8+v)*13,y=Math.cos(i*5)*4;
          if(item.kind==='bush')ellipse(x,y-7,7,6,['#456d49','#64824f','#365e46'][i%3]);
          else {ctx.strokeStyle=i%2?'#6d8653':'#42664b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y-5-i%4);ctx.lineTo(x+1,y-2);ctx.stroke();}
          if(v===3&&i%3===0)ellipse(x,y-10,1.3,1,'#c4aa75');
        }
      }
    }
    function draw(ctx,item,p,time,fade=false){
      const key=item.kind+item.variant;
      let art=sprites.get(key);
      if(!art){art=document.createElement('canvas');art.width=192;art.height=240;const c=art.getContext('2d');c.scale(2,2);c.translate(48,108);paint(c,item);sprites.set(key,art);}
      ctx.save();ctx.globalAlpha=fade?.32:1;
      const sway=item.kind==='tree'?Math.sin(time*.8+item.x)*.45:0;
      ctx.drawImage(art,p.x-48*item.size+sway,p.y-108*item.size,96*item.size,120*item.size);ctx.restore();
    }
    function ground(ctx,camera){
      for(const item of query(camera.x,camera.y,700)){
        let paths=groundPaths.get(item);
        if(!paths){
          const patch=new Path2D();patch.ellipse(item.x,item.y,42,32,item.variant,0,Math.PI*2);
          let clearing=null;
          if(item.dense&&item.kind==='grass'){clearing=new Path2D();clearing.ellipse(item.x,item.y,35,24,0,0,Math.PI*2);}
          paths={patch,clearing};groundPaths.set(item,paths);
        }
        // Keep the original order: overlapping translucent patches must not be merged.
        ctx.fillStyle=item.dense?'#42543738':'#4d60432b';ctx.fill(paths.patch);
        if(paths.clearing){ctx.fillStyle='#8c805b22';ctx.fill(paths.clearing);}
      }
      if(Math.abs(camera.y-region.y)<region.ry+700&&Math.abs(camera.x-region.x)<region.rx+700){
        if(!trailPath){
          trailPath=new Path2D();
          for(let x=region.x-region.rx;x<=region.x+region.rx;x+=30){const y=trail(x);if(x===region.x-region.rx)trailPath.moveTo(x,y);else trailPath.lineTo(x,y);}
        }
        ctx.lineWidth=48;ctx.strokeStyle='#81765333';ctx.lineCap='round';ctx.stroke(trailPath);
        ctx.lineWidth=24;ctx.strokeStyle='#8f805433';ctx.stroke(trailPath);
      }
    }
    return {items,generate,clear,query,draw,ground,configure,contains,allowsBuilding,get region(){return region;},trail};
  }
  const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.Forest=api;
})();
