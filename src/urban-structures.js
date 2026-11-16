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
    if(shape.cabin){
      ctx.save();
      const eave=42,ridge=62;
      poly([p(-.05,-.04),p(1.08,-.04),p(1.08,1.1),p(-.05,1.1)],'#101b1870');
      poly([p(1,0),p(1,1),p(1,1,eave),p(1,0,eave)],'#614b35','#b19464');
      poly([p(0,1),p(1,1),p(1,1,eave),p(0,1,eave)],'#896541','#c09a65');
      for(let z=4;z<eave;z+=6){
        line([p(0,1,z),p(1,1,z),p(1,0,z)],'#352e23',2);
        line([p(0,1,z+2),p(1,1,z+2),p(1,0,z+2)],'#ba945e',.6);
      }
      poly([p(0,1,eave),p(1,1,eave),p(.5,1,ridge)],'#99734a','#be9b68');
      poly([p(-.08,-.08,eave),p(.5,-.08,ridge),p(.5,1.08,ridge),p(-.08,1.08,eave)],'#65705a','#9a9c76');
      poly([p(.5,-.08,ridge),p(1.08,-.08,eave),p(1.08,1.08,eave),p(.5,1.08,ridge)],'#414b3c','#899173');
      for(let i=0;i<8;i++)line([p(-.08,i/7,eave),p(.5,i/7,ridge),p(1.08,i/7,eave)],'#26382b',1);
      box(.78,.18,.12,.13,43,23,'#8a8771');
      poly([p(.59,1,0),p(.81,1,0),p(.81,1,30),p(.59,1,30)],'#453928','#c8a56a');
      for(const u of [.64,.7,.76])line([p(u,1,2),p(u,1,29)],'#9c7c4c',.7);
      line([p(.77,1,13),p(.79,1,13)],'#e4c681',2);
      for(const [u,v,side] of [[.16,1,false],[1,.42,true]]){
        const a=(d,z)=>side?p(u,v+d,z):p(u+d,v,z);
        poly([a(0,15),a(.21,15),a(.21,32),a(0,32)],'#253e35','#c5a271');
        line([a(.105,15),a(.105,32)],'#b89c6b',1.5);
        line([a(0,23),a(.21,23)],'#b89c6b',1.5);
      }
      ctx.restore();return;
    }
    const pitched=type===1||type===4,eave=pitched?lift-17:lift,bottom=type===3?lift*.43:0;
    ctx.save();
    poly([p(-.04,-.02),p(1.07,-.02),p(1.07,1.07),p(-.04,1.07)],'#111c1880');
    if(type===3){
      for(const u of [.06,.48,.91])for(const v of [.1,.83])box(u,v,.07,.09,0,bottom,'#4b5147');
      box(0,0,1,1,bottom-5,5,'#555d50');
    }
    const materials=[['#354745','#59635a'],['#413e36','#716454'],['#34454a','#54676a'],['#394b48','#697367'],['#3b443a','#626452']][type];
    poly([p(1,0,bottom),p(1,1,bottom),p(1,1,eave),p(1,0,eave)],materials[0],'#738073');
    poly([p(1,1,bottom),p(0,1,bottom),p(0,1,eave),p(1,1,eave)],materials[1],'#8a907a');
    for(const z of [bottom+5,eave-5]){
      line([p(0,1,z),p(1,1,z)],'#283a32',3);
      line([p(1,0,z),p(1,1,z)],'#24332e',3);
      line([p(0,1,z+2),p(1,1,z+2),p(1,0,z+2)],'#8b917a',.7);
    }
    // Pilasters and exposed brick patches break up the large concrete faces.
    for(const u of [.04,.96]){
      poly([p(u,1,bottom+7),p(u+.025,1,bottom+7),p(u+.025,1,eave-7),p(u,1,eave-7)],'#818671');
      line([p(1,u,bottom+7),p(1,u,eave-7)],'#657567',1.5);
    }
    for(let row=0;row<3;row++)for(let col=0;col<3-row;col++){
      const u=.09+col*.045+(row%2)*.02,z=bottom+8+row*3.5;
      poly([p(u,1,z),p(u+.037,1,z),p(u+.037,1,z+2.5),p(u,1,z+2.5)],row%2?'#7e6b50':'#918064');
    }
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
        const ww=type===3?.17:.13,hh=type===3?15:12;
        poly([p(u-.014,1,z-2),p(u+ww+.014,1,z-2),p(u+ww+.014,1,z+hh+2),p(u-.014,1,z+hh+2)],'#343d34','#8b927c');
        poly([p(u,1,z),p(u+ww,1,z),p(u+ww,1,z+hh),p(u,1,z+hh)],color);
        poly([p(u+.01,1,z+hh-1),p(u+ww-.01,1,z+hh-1),p(u+.01,1,z+2)],light?'#d4b27a':'#365953');
        line([p(u+ww/2,1,z),p(u+ww/2,1,z+hh)],'#6e7b69',.8);
        box(u-.02,1,.17,.025,z-3,2,'#9a9d81');
        if((r+c+index)%5===2)line([p(u,1.002,z+2),p(u+ww,1.002,z+9)],'#a18b61',2.5);
      }
      poly([p(1,u,z),p(1,u+.12,z),p(1,u+.12,z+12),p(1,u,z+12)],light?'#b78c5a':'#162e2d','#76816c');
      line([p(1,u+.06,z),p(1,u+.06,z+12)],'#596c5f',.7);
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
      for(const v of [.28,.32,.36,.4])line([p(.19,v,lift+6.2),p(.33,v,lift+6.2)],'#273e35',1);
      box(.02,.02,.96,.025,lift,4,'#8b927a');
      box(.02,.02,.025,.96,lift,4,'#8b927a');
      line([p(.5,.16,lift+.3),p(.58,.24,lift+.3),p(.51,.35,lift+.3),p(.62,.43,lift+.3)],'#293d34',.8);
      poly([p(.66,.64,lift+.2),p(.89,.61,lift+.2),p(.91,.85,lift+.2),p(.75,.88,lift+.2)],'#3c5146');
    }
    // Door remains on the original entrance face, including elevated stations.
    if(type===3)box(.58,.88,.24,.12,0,bottom,'#56604e');
    const wide=type===1||type===4,u=wide?.42:.6,doorW=wide?.39:.18,doorH=wide?29:22;
    poly([p(u,1,0),p(u+doorW,1,0),p(u+doorW,1,doorH),p(u,1,doorH)],'#0d1c19','#7b7c61');
    if(wide){line([p(u+doorW/2,1,0),p(u+doorW/2,1,doorH)],'#66705c');line([p(u,1,0),p(u+doorW,1,doorH)],'#424e3f');}
    else {const a=p(u+.03,1,12);ctx.fillStyle='#c99e5c';ctx.fillRect(a.x,a.y,1.5,2);}
    // Entry canopy, threshold and a warm lamp make the usable doorway stand out.
    box(u-.025,1,doorW+.05,.045,0,2,'#969783');
    box(u-.045,.99,doorW+.09,.08,doorH+3,2,'#7e8e7b');
    const lamp=p(u+doorW/2,1.012,doorH+1);
    ctx.fillStyle='#e3bd79';ctx.fillRect(lamp.x-2,lamp.y-1,4,1.5);
    line([p(u+doorW+.05,1,4),p(u+doorW+.05,1,doorH+8)],'#253d33',1.5);
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
