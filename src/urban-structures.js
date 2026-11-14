/* Isometric urban buildings inspired by the supplied architecture catalogue. */
(() => {
  'use strict';
  const TYPES=[
    {name:'Bloco residencial',code:'A',height:116},
    {name:'Fábrica desativada',code:'F',height:87},
    {name:'Torre de comunicação',code:'C',height:143},
    {name:'Estação elevada',code:'E',height:90},
    {name:'Armazém',code:'B',height:68}
  ];
  function draw(ctx,shape,index){
    const type=index%5,{base,lift}=shape;
    const p=(u,v,z=0)=>({x:base[0].x+(base[1].x-base[0].x)*u+(base[3].x-base[0].x)*v,
      y:base[0].y+(base[1].y-base[0].y)*u+(base[3].y-base[0].y)*v-z});
    const poly=(points,color,edge)=>{
      ctx.fillStyle=color;ctx.beginPath();points.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.closePath();ctx.fill();
      if(edge){ctx.strokeStyle=edge;ctx.lineWidth=.65;ctx.stroke();}
    };
    const line=(points,color='#62655b',width=1)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.stroke();};
    const box=(u,v,w,h,z,t,color='#424a43')=>{
      poly([p(u+w,v,z),p(u+w,v+h,z),p(u+w,v+h,z+t),p(u+w,v,z+t)],'#282f2d','#4e554c');
      poly([p(u+w,v+h,z),p(u,v+h,z),p(u,v+h,z+t),p(u+w,v+h,z+t)],'#343c36','#50594e');
      poly([p(u,v,z+t),p(u+w,v,z+t),p(u+w,v+h,z+t),p(u,v+h,z+t)],color,'#64695d');
    };
    const rail=(a,b,z)=>{
      line([p(...a,z+9),p(...b,z+9)],'#77796a');line([p(...a,z+4),p(...b,z+4)],'#585e52');
      for(let i=0;i<=3;i++){const t=i/3,u=a[0]+(b[0]-a[0])*t,v=a[1]+(b[1]-a[1])*t;line([p(u,v,z),p(u,v,z+10)],'#686e5e',.7);}
    };
    const pitched=type===1||type===4,eave=pitched?lift-17:lift,bottom=type===3?lift*.43:0;
    ctx.save();
    poly([p(-.04,-.02),p(1.07,-.02),p(1.07,1.07),p(-.04,1.07)],'#111c1880');
    if(type===3){
      for(const u of [.06,.48,.91])for(const v of [.1,.83])box(u,v,.07,.09,0,bottom,'#4b5147');
      box(0,0,1,1,bottom-5,5,'#555d50');
    }
    poly([p(1,0,bottom),p(1,1,bottom),p(1,1,eave),p(1,0,eave)],'#303936','#555d52');
    poly([p(1,1,bottom),p(0,1,bottom),p(0,1,eave),p(1,1,eave)],'#41483f','#61675b');
    // Concrete joints, damp streaks and chipped bases on both exposed walls.
    for(let z=bottom+24;z<eave;z+=32){line([p(1,0,z),p(1,1,z)],'#222e2a',.55);line([p(0,1,z),p(1,1,z)],'#323d34',.55);}
    for(let i=0;i<5;i++){
      const u=(i+.4)/9,z=bottom+((i*17+index*7)%Math.max(1,eave-bottom-8));
      line([p(u,1,z),p(u,1,Math.max(bottom,z-7-i%3*4))],'#26332b',1+i%2);
      if(i%2===0)poly([p(u,1,bottom),p(u+.035,1,bottom),p(u+.025,1,bottom+7)],'#707461');
    }
    const rows=type===0?3:type===2?4:type===3?1:2,columns=type===4?2:3;
    for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
      const u=.1+c*.8/columns,z=bottom+12+r*(eave-bottom-21)/rows;
      const light=(r*7+c*3+index)%13===0,color=light?'#b28c59':'#172723';
      if(!(type===4&&c===1)){
        poly([p(u,1,z),p(u+.065,1,z),p(u+.065,1,z+7),p(u,1,z+7)],color,'#626955');
      }
      poly([p(1,u,z),p(1,u+.055,z),p(1,u+.055,z+7),p(1,u,z+7)],light?'#b78c5a':'#172420','#4c574a');
    }
    if(pitched){
      poly([p(0,0,eave),p(1,0,eave),p(.5,0,lift)],'#343e37','#656c5d');
      poly([p(0,1,eave),p(1,1,eave),p(.5,1,lift)],'#444d41','#737663');
      poly([p(0,0,eave),p(.5,0,lift),p(.5,1,lift),p(0,1,eave)],'#4b5147','#777c6b');
      poly([p(.5,0,lift),p(1,0,eave),p(1,1,eave),p(.5,1,lift)],'#39433c','#626d5c');
      for(let i=1;i<6;i++){const v=i/6;line([p(0,v,eave),p(.5,v,lift),p(1,v,eave)],'#68705f',.65);}
      for(const v of [.27,.58])poly([p(.56,v,lift-2),p(.79,v,lift-10),p(.79,v+.08,lift-10),p(.56,v+.08,lift-2)],'#182723','#6e735d');
    }else{
      poly([p(0,0,lift),p(1,0,lift),p(1,1,lift),p(0,1,lift)],'#51584c','#7b806c');
      for(let i=1;i<4;i++){line([p(i/4,0,lift),p(i/4,1,lift)],'#424b3e',.6);}
      box(.17,.25,.18,.19,lift,6,'#676d5a');
    }
    // Door remains on the original entrance face, including elevated stations.
    if(type===3)box(.58,.88,.24,.12,0,bottom,'#56604e');
    const wide=type===1||type===4,u=wide?.42:.6,doorW=wide?.39:.18,doorH=wide?29:22;
    poly([p(u,1,0),p(u+doorW,1,0),p(u+doorW,1,doorH),p(u,1,doorH)],'#0d1c19','#7b7c61');
    if(wide){line([p(u+doorW/2,1,0),p(u+doorW/2,1,doorH)],'#66705c');line([p(u,1,0),p(u+doorW,1,doorH)],'#424e3f');}
    else {const a=p(u+.03,1,12);ctx.fillStyle='#c99e5c';ctx.fillRect(a.x,a.y,1.5,2);}
    const sign=p(.15,1,eave*.48);ctx.save();ctx.translate(sign.x,sign.y);ctx.transform(1,.5,0,1,0,0);
    ctx.fillStyle='#8c9078';ctx.font='bold 9px monospace';ctx.textAlign='left';ctx.fillText(TYPES[type].code+'-'+String(index+1).padStart(2,'0'),0,0);ctx.restore();
    if(type===0){
      line([p(.85,1,lift+5),p(.85,1,20),p(.98,1,20),p(.98,1,0)],'#707361',2);
      for(const u of [.2,.72]){line([p(u,.4,lift),p(u,.4,lift+22)],'#858572');line([p(u-.08,.4,lift+17),p(u+.08,.4,lift+17)],'#858572');}
    }
    if(type===1){
      box(.76,.16,.13,.16,lift-12,48,'#606452');
      for(const v of [.12,.39]){box(.05,v,.16,.17,eave-5,22,'#555f50');rail([.05,v],[.21,v],eave+17);}
      line([p(.9,1,0),p(.9,1,37),p(.72,1,37)],'#7c806a',2);
    }
    if(type===2){
      rail([0,1],[1,1],lift);rail([1,0],[1,1],lift);
      box(.15,.2,.5,.4,lift,7,'#666e59');
      for(const [u,v,h] of [[.25,.35,44],[.55,.4,32],[.7,.65,51]]){
        line([p(u,v,lift),p(u,v,lift+h)],'#a1a18a',1.2);
        for(let j=1;j<4;j++)line([p(u-.07,v,lift+j*9),p(u+.07,v,lift+j*9)],'#7f8a74');
      }
      for(const u of [.2,.8]){const a=p(u,.7,lift+20);ctx.fillStyle='#858a77';ctx.beginPath();ctx.ellipse(a.x,a.y,6,9,-.4,0,Math.PI*2);ctx.fill();line([a,{x:a.x+6,y:a.y-2}],'#bdbaa0');}
    }
    if(type===3){
      box(0,1,.96,.13,bottom,3,'#5a6554');rail([0,1.13],[.96,1.13],bottom+3);
      // Stair flight and handrail descend toward the entrance.
      for(let i=0;i<9;i++)box(.62,1.05+i*.025,.2,.035,0,(9-i)*bottom/9,'#59634f');
      line([p(.62,1.05,bottom+10),p(.62,1.27,9)],'#989b7c');
    }
    if(type===4){
      for(const [u,v] of [[1.01,.2],[1.01,.58],[.12,1.04]]){box(u,v,.14,.17,0,13,'#5c6451');for(let i=1;i<4;i++)line([p(u+i*.035,v+.17),p(u+i*.035,v+.17,12)],'#333f32');}
      line([p(1,.12,0),p(1,.12,lift+9)],'#7b7d66',2);
    }
    ctx.restore();
  }
  const api={TYPES,draw};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.UrbanStructures=api;
})();
