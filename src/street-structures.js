/* Street furniture: artwork and collision share the same world footprints. */
(() => {
  'use strict';
  const K=Math.SQRT1_2;
  const TYPES=[
    {name:'Carro abandonado',width:60,depth:28,height:28},
    {name:'Poste',width:9,depth:9,height:65},
    {name:'Banco',width:46,depth:16,height:25},
    {name:'Lixeira',width:24,depth:22,height:28},
    {name:'Terminal de rede',width:48,depth:28,height:53}
  ];
  function footprint(prop){
    const type=TYPES[prop.kind];
    return [prop.x,prop.y,-type.width/2,-type.depth/2,type.width,type.depth,prop.angle||0];
  }
  function radius(kind){const t=TYPES[kind];return Math.hypot(t.width,t.depth)/2;}
  function projector(angle=0){
    const c=Math.cos(angle),s=Math.sin(angle);
    return (x,y,z=0)=>{const wx=x*c-y*s,wy=x*s+y*c;return {x:(wx-wy)*K,y:(wx+wy)*K*.5-z};};
  }
  function drawRaw(ctx,prop){
    const type=TYPES[prop.kind],p=projector(prop.angle),w=type.width,d=type.depth;
    const poly=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.closePath();ctx.fill();};
    const line=(points,color,width=1)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.stroke();};
    const box=(x,y,bw,bd,z,h,top='#697366',side='#39473e',front='#4b5749')=>{
      const c=Math.cos(prop.angle||0),s=Math.sin(prop.angle||0);
      const faces=[
        {visible:s-c>0,points:[p(x,y,z),p(x+bw,y,z),p(x+bw,y,z+h),p(x,y,z+h)],color:side},
        {visible:c+s>0,points:[p(x+bw,y,z),p(x+bw,y+bd,z),p(x+bw,y+bd,z+h),p(x+bw,y,z+h)],color:side},
        {visible:c-s>0,points:[p(x+bw,y+bd,z),p(x,y+bd,z),p(x,y+bd,z+h),p(x+bw,y+bd,z+h)],color:front},
        {visible:-c-s>0,points:[p(x,y+bd,z),p(x,y,z),p(x,y,z+h),p(x,y+bd,z+h)],color:front}
      ];
      for(const face of faces)if(face.visible)poly(face.points,face.color);
      poly([p(x,y,z+h),p(x+bw,y,z+h),p(x+bw,y+bd,z+h),p(x,y+bd,z+h)],top);
    };
    poly([p(-w/2-3,-d/2-2),p(w/2+4,-d/2-2),p(w/2+4,d/2+4),p(-w/2-3,d/2+4)],'#06110d66');
    if(prop.kind===0){
      const colors=[['#897461','#5c4b40','#71604d'],['#778984','#415e5b','#56716b'],['#929078','#5c604b','#75765b']][prop.tint%3||0];
      for(const x of [-23,16])for(const y of [-14,9])box(x,y,8,5,0,8,'#222a28','#0c1514','#17201c');
      box(-30,-13,60,26,5,11,...colors);
      box(-12,-12,28,24,16,10,...colors);
      // Recessed windows, metal pillars, cracked glass and roof rust.
      for(const y of [-12.1,12.1]){
        if(Math.sign(y)*(Math.cos(prop.angle||0)-Math.sin(prop.angle||0))<=0)continue;
        for(const x of [-9,4])poly([p(x,y,18),p(x+10,y,18),p(x+10,y,24),p(x,y,24)],'#193736');
        line([p(-7,y,24),p(-3,y,21),p(-6,y,18)],'#8eaaa0',.7);
        line([p(-25,y,9),p(-17,y,12),p(-21,y,14)],'#a47f56');
      }
      for(const y of [-8,6])box(-30.5,y,1,4,10,4,'#b5ae7d','#6b5b37','#a29162');
      for(const y of [-8,6])box(29.5,y,1,4,10,3,'#855646','#4d3028','#a06a4c');
      line([p(19,-10,16.2),p(19,10,16.2)],'#ada087',.7);
      poly([p(-6,-5,26.2),p(3,-3,26.2),p(5,1,26.2),p(-3,3,26.2)],'#725537');
      box(-31,-11,2,22,5,3,'#9b9b83','#56635a','#788373');
    }else if(prop.kind===1){
      box(-4.5,-4.5,9,9,0,4,'#89917c','#414f45','#626e5b');
      box(-1.5,-1.5,3,3,4,55,'#899488','#384a45','#5f7066');
      box(-2,-2,22,4,59,3,'#879184','#3b4a43','#627368');
      box(13,-4,12,8,56,3,'#879081','#303f36','#65705d');
      poly([p(15,-3,55.8),p(23,-3,55.8),p(23,3,55.8),p(15,3,55.8)],'#c9b779');
      line([p(-1,-1,9),p(1,-1,13),p(-1,-1,17)],'#b49c64',1.5);
    }else if(prop.kind===2){
      for(const x of [-20,17])for(const y of [-6,4])box(x,y,3,3,0,12,'#627366','#263b33','#405246');
      for(let y=-8;y<8;y+=4)box(-23,y,46,3,11,3,'#9c8964','#514b35','#766847');
      for(const x of [-21,18])box(x,5,3,3,14,10,'#6b7561','#35463b','#4b5d48');
      for(const z of [17,22])box(-23,6,46,2,z,3,'#a08c62','#574e35','#7c6d49');
      line([p(-12,-7,14.1),p(-4,-5,14.1),p(1,-7,14.1)],'#494934',.7);
    }else if(prop.kind===3){
      box(-12,-11,24,22,0,25,'#82907a','#334f42','#526e52');
      box(-13,-12,26,24,25,3,'#9a9e80','#485d49','#6f7d5c');
      poly([p(-8,-6,28.1),p(8,-6,28.1),p(8,4,28.1),p(-8,4,28.1)],'#172b23');
      for(let x=-8;x<=8;x+=4)line([p(x,11.1,3),p(x,11.1,21)],'#263f31');
      box(-5,11,10,1,14,5,'#c8c29b','#7e8665','#aeb58a');
      line([p(-9,11.2,8),p(-4,11.2,10),p(-7,11.2,12)],'#ac9465');
    }else{
      const color=prop.disabled?'#779889':'#8af1c4';
      box(-24,-14,48,28,0,5,'#64756c','#243b34','#3d5346');
      box(-21,-12,42,24,5,17,'#536b62','#243e37','#3c5649');
      box(-22,-12,44,12,22,29,'#6e8175','#263f39','#415d50');
      poly([p(-18,.1,29),p(12,.1,29),p(12,.1,46),p(-18,.1,46)],'#0c211d');
      for(let z=32;z<44;z+=4)line([p(-15,.2,z),p(z===40?3:9,.2,z)],color,1.2);
      for(let row=0;row<3;row++)for(let col=0;col<8;col++)box(-16+col*3.7,3+row*2.5,2.7,1.5,22,.5,'#9ba58c','#596e60','#73856f');
      for(let z=9;z<20;z+=3)line([p(-15,12.1,z),p(-1,12.1,z)],'#172f28');
      box(16,1,3,3,36,3,color,'#4e7560',color);
    }
  }
  const cache=new Map();let bytes=0;const BUDGET=12*1024*1024;
  function draw(ctx,prop,screen,scale=2){
    const angle=prop.angle||0,key=[prop.kind,prop.tint||0,angle,!!prop.disabled,scale].join(':');
    let sprite=cache.get(key);
    if(!sprite){
      const t=TYPES[prop.kind],r=radius(prop.kind),left=-Math.ceil(r*1.5+12),top=-Math.ceil(t.height+r+12);
      const width=-left*2,height=-top+Math.ceil(r+12);
      const layer=document.createElement('canvas');layer.width=Math.ceil(width*scale);layer.height=Math.ceil(height*scale);
      const painter=layer.getContext('2d');painter.scale(scale,scale);painter.translate(-left,-top);painter.imageSmoothingEnabled=false;
      drawRaw(painter,prop);sprite={layer,left,top,width,height,bytes:layer.width*layer.height*4};
      while(cache.size&&bytes+sprite.bytes>BUDGET){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).bytes;cache.delete(oldest);}
      cache.set(key,sprite);bytes+=sprite.bytes;
    }else{cache.delete(key);cache.set(key,sprite);}
    ctx.drawImage(sprite.layer,screen.x+sprite.left,screen.y+sprite.top,sprite.width,sprite.height);
  }
  function fenceParts(length){
    const parts=[];
    for(let x=0;x<length;x+=28){
      if((x/28)%4!==2)parts.push({x,y:-2,w:4,d:5,z:0,h:30});
      if((x/28)%3===1)continue;
      const w=Math.min(25,length-x);
      parts.push({x,y:-1,w,d:3,z:8,h:3},{x,y:-1,w,d:3,z:21,h:4});
    }
    return parts;
  }
  function drawFence(ctx,segment,project,onlyPart=null){
    const [x,y,length,angle]=segment,c=Math.cos(angle),s=Math.sin(angle);
    const p=(lx,ly,z)=>{const a=project(x+lx*c-ly*s,y+lx*s+ly*c);return {x:a.x,y:a.y-z};};
    const parts=onlyPart?[onlyPart]:fenceParts(length);
    parts.sort((a,b)=>(a.x*c-a.y*s+a.x*s+a.y*c)-(b.x*c-b.y*s+b.x*s+b.y*c));
    for(const part of parts){
      const {x:lx,y:ly,w,d,z,h}=part;
      const base=[p(lx,ly,z),p(lx+w,ly,z),p(lx+w,ly+d,z),p(lx,ly+d,z)];
      const roof=base.map(a=>({x:a.x,y:a.y-h}));
      const poly=(points,color)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.closePath();ctx.fill();};
      const facing=[s-c,c+s,c-s,-c-s];
      for(let i=0;i<4;i++)if(facing[i]>0)poly([base[i],base[(i+1)%4],roof[(i+1)%4],roof[i]],i%2?'#5b624b':'#394a3a');
      poly(roof,'#969577');
    }
  }
  const api={TYPES,footprint,radius,draw,drawRaw,fenceParts,drawFence};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.StreetStructures=api;
})();
