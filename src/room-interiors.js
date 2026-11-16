/* Three furnished cutaway interiors in the game's existing room coordinates. */
(() => {
  'use strict';
  const TYPES = [
    {name:'CASA RÚSTICA',wall:'#85745c',side:'#655f4e',floor:['#65513d','#705b43','#796047'],wood:'#99734a',fabric:'#8c5543',trim:'#bd9d6b'},
    {name:'APARTAMENTO AZUL',wall:'#738b89',side:'#506969',floor:['#596969','#667572','#79847b'],wood:'#85938b',fabric:'#417d83',trim:'#c3c4a4'},
    {name:'CASA OFICINA',wall:'#7b7c69',side:'#5b655b',floor:['#505850','#5a6056','#656b5e'],wood:'#8b7955',fabric:'#697b51',trim:'#c2a56a'},
    {name:'CABANA DA FLORESTA',wall:'#856345',side:'#604a36',floor:['#755337','#816040','#8b6948'],wood:'#a17b4f',fabric:'#68764a',trim:'#c4a374'}
  ];
  // Shift each block of six so safe houses (every sixth building) also vary.
  const variant = index => ((index + Math.floor(index / 6)) % 3 + 3) % 3;
  // Inverse of the floor projection used below. Insets are measured in screen
  // pixels perpendicular to each edge, so the actor's feet stay on the floor.
  function floorPosition(x,y,radius=0){
    const dx=x-65,dy=y-186,det=32490;
    return {u:(98*dx-170*dy)/det,v:(96*dx+165*dy)/det,
      insetU:radius*Math.hypot(98,170)/det,insetV:radius*Math.hypot(96,165)/det};
  }
  function contains(x,y,radius=0){
    const {u,v,insetU,insetV}=floorPosition(x,y,radius);
    return u>=insetU-1e-9&&u<=1-insetU+1e-9&&v>=insetV-1e-9&&v<=1-insetV+1e-9;
  }
  function constrain(x,y,radius=0){
    const f=floorPosition(x,y,radius);
    const u=Math.max(f.insetU,Math.min(1-f.insetU,f.u));
    const v=Math.max(f.insetV,Math.min(1-f.insetV,f.v));
    return {x:65+165*u+170*v,y:186-96*u+98*v};
  }
  function draw(ctx,index,{shelter=false,cabin=false}={}) {
    const type=cabin?3:variant(index),t=TYPES[type];
    const p=(u,v,z=0)=>({x:65+165*u+170*v,y:186-96*u+98*v-z});
    const poly=(points,color,edge)=>{
      ctx.fillStyle=color;ctx.beginPath();points.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.closePath();ctx.fill();
      if(edge){ctx.strokeStyle=edge;ctx.lineWidth=.55;ctx.stroke();}
    };
    const line=(points,color=t.trim,width=.7)=>{
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.stroke();
    };
    const tile=(u,v,w,h,z,color,edge)=>poly([p(u,v,z),p(u+w,v,z),p(u+w,v+h,z),p(u,v+h,z)],color,edge);
    const box=(u,v,w,h,z,height,top=t.wood,front='#544938',side='#3c3d32')=>{
      poly([p(u,v,z),p(u,v+h,z),p(u,v+h,z+height),p(u,v,z+height)],front);
      poly([p(u,v+h,z),p(u+w,v+h,z),p(u+w,v+h,z+height),p(u,v+h,z+height)],side);
      tile(u,v,w,h,z+height,top,'#b9b49855');
    };
    const shadow=(u,v,w,h)=>tile(u-.02,v-.01,w+.045,h+.05,0,'#0b141440');
    const table=(u,v,w,h,height=19)=>{
      shadow(u,v,w,h);
      for(const a of [u+.025,u+w-.035])for(const b of [v+.025,v+h-.035])box(a,b,.018,.018,0,height-2,'#6e5f47','#514737','#383c34');
      box(u,v,w,h,height-2,3,t.wood);
      tile(u+.012,v+.012,w-.024,h-.024,height+1.2,'#ffffff06',t.trim);
    };
    const pot=(u,v,z=0)=>{
      box(u,v,.045,.045,z,6,'#b28b61','#795c43','#574c39');
      const q=p(u+.022,v+.022,z+6);
      for(const [dx,dy] of [[-5,-6],[4,-8],[-2,-11],[6,-3],[-6,-2]]){
        line([q,{x:q.x+dx,y:q.y+dy}],'#66836a',1.4);
        ctx.fillStyle=dy<-6?'#9eae7b':'#6f906a';ctx.beginPath();ctx.ellipse(q.x+dx,q.y+dy,2.5,1.3,dx*.15,0,Math.PI*2);ctx.fill();
      }
    };
    const books=(u,v,z)=>{
      for(let i=0;i<5;i++)box(u+i*.021,v,.017,.045,z,7+i%3,['#a76c4e','#b9aa7b','#5a8581','#687556','#ba9461'][i]);
    };
    const rug=(u,v,w,h)=>{
      tile(u,v,w,h,0,'#252d28');tile(u+.012,v+.012,w-.024,h-.024,.1,t.fabric);
      tile(u+.03,v+.03,w-.06,h-.06,.2,'#ffffff09',t.trim);
      for(let i=0;i<9;i++){
        const a=u+.025+(w-.05)*i/8;
        line([p(a,v-.012),p(a,v+.01)],t.trim,.6);line([p(a,v+h-.01),p(a,v+h+.012)],t.trim,.6);
      }
      for(let i=0;i<4;i++){
        const a=u+.065+i*(w-.13)/3,b=v+h/2;
        poly([p(a-.024,b),p(a,b-.035),p(a+.024,b),p(a,b+.035)],t.trim);
      }
    };
    const window=(u,width)=>{
      const face=(a,z)=>p(a,0,z);
      poly([face(u,24),face(u+width,24),face(u+width,54),face(u,54)],'#333c36',t.trim);
      poly([face(u+.016,26),face(u+width-.016,26),face(u+width-.016,52),face(u+.016,52)],type===0?'#ae9970':'#718f8b');
      for(let i=1;i<4;i++)line([face(u+width*i/4,26),face(u+width*i/4,52)],'#394e4a',1.2);
      line([face(u,39),face(u+width,39)],t.trim,1.5);
      box(u-.018,0,width+.036,.035,23,2,t.trim);
      // Angled curtains stay on the wall plane instead of floating over the room.
      for(const a of [u-.024,u+width-.035]){
        poly([face(a,55),face(a+.055,55),face(a+.043,26),face(a-.007,25)],type===0?'#a38c63':'#a5b0a0');
        line([face(a+.015,52),face(a+.011,29)],'#e0d0a766');
      }
      poly([p(u,.04),p(u+width,.04),p(u+width-.08,.49),p(Math.max(.02,u-.1),.49)],'#e8cf8b16');
      for(let i=1;i<4;i++)line([p(u+width*i/4,.04),p(u+width*i/4-.09,.49)],'#d5d4ac1c',1.6);
    };
    const frame=(v,w,z=40)=>{
      poly([p(1,v,z),p(1,v+w,z),p(1,v+w,z+17),p(1,v,z+17)],'#3e4b43',t.trim);
      poly([p(1,v+.015,z+2),p(1,v+w-.015,z+2),p(1,v+w-.015,z+15),p(1,v+.015,z+15)],'#a9a787');
      poly([p(1,v+.02,z+3),p(1,v+w*.45,z+11),p(1,v+w*.65,z+6),p(1,v+w-.02,z+9),p(1,v+w-.02,z+3)],'#577265');
    };
    const kitchen=(u,v,w)=>{
      shadow(u,v,w,.16);box(u,v,w,.16,0,22,type===1?'#b0b3a0':'#a1977d',type===1?'#557b7c':'#71694f','#44594f');
      for(let i=0;i<3;i++){
        const a=u+.015+i*w/3;
        poly([p(a,v+.162,3),p(a+w/3-.025,v+.162,3),p(a+w/3-.025,v+.162,19),p(a,v+.162,19)],type===1?'#648e8d':'#817555','#c4b58e55');
        line([p(a+.025,v+.164,16),p(a+.055,v+.164,16)],'#d8ccaa',1.2);
      }
      tile(u+.025,v+.03,.095,.09,22.1,'#505d56','#d5c6a1');tile(u+.037,v+.043,.07,.064,22.2,'#263e3c');
      line([p(u+.065,v+.025,23),p(u+.065,v+.025,30),p(u+.065,v+.055,30)],'#c6c6af',1.2);
      tile(u+w-.11,v+.025,.09,.11,22.1,'#303c39');
      for(const a of [u+w-.085,u+w-.04])for(const b of [v+.05,v+.105]){
        const q=p(a,b,23);ctx.strokeStyle='#b0a98b';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(q.x,q.y,3,1.7,-.52,0,Math.PI*2);ctx.stroke();
      }
    };
    const sofa=(u,v)=>{
      shadow(u,v,.3,.15);box(u,v,.3,.15,2,10,t.fabric,'#4c5144','#3b514c');
      box(u,v,.3,.035,10,13,t.fabric);box(u,v,.035,.15,10,7,t.fabric);box(u+.265,v,.035,.15,10,7,t.fabric);
      for(let i=0;i<2;i++)box(u+.045+i*.108,v+.044,.1,.095,12,2,type===1?'#6c9b99':'#b38e66');
      box(u+.057,v+.045,.05,.045,15,4,'#d3b783');
    };
    ctx.save();
    ctx.fillStyle='#101b1d';ctx.fillRect(0,0,430,320);
    const glow=ctx.createRadialGradient(236,192,25,236,192,208);glow.addColorStop(0,'#50655540');glow.addColorStop(1,'#101b1d00');
    ctx.fillStyle=glow;ctx.fillRect(0,0,430,320);
    ctx.fillStyle='#060e1099';ctx.beginPath();ctx.ellipse(236,269,182,30,0,0,Math.PI*2);ctx.fill();
    box(-.025,-.025,1.05,1.05,-9,9,'#263c36','#273d37','#1e3030');
    // Both full-height walls meet at the back corner; the foreground is cut away.
    poly([p(0,0),p(1,0),p(1,0,66),p(0,0,66)],t.wall);
    poly([p(1,0),p(1,1),p(1,1,66),p(1,0,66)],t.side);
    line([p(0,0,66),p(1,0,66),p(1,1,66)],'#b3b298',2.3);
    line([p(0,0,2),p(1,0,2),p(1,1,2)],'#a29e80',3);
    line([p(1,0,3),p(1,0,64)],'#243d3766',2);
    if(type===0||cabin){
      for(let row=0;row<12;row++)for(let col=0;col<4;col++){
        const u=col/4,v=row/12;
        tile(u,v,.25-.003,1/12-.004,0,t.floor[(row*7+col*3)%3]);
        line([p(u+.02,v+.025),p(u+.2,v+.025)],'#b08b562b',.5);
        line([p(u+.04,v+.055),p(u+.23,v+.055)],'#201f192a',.5);
      }
      for(let i=0;i<12;i++)line([p(i/12,0,3),p(i/12,0,20)],'#4b503f',.8);
      line([p(0,0,21),p(1,0,21)],t.trim,1.5);
    }else{
      for(let row=0;row<9;row++)for(let col=0;col<9;col++)tile(col/9,row/9,1/9-.005,1/9-.005,0,t.floor[type===1?(row+col)%2:(row*7+col*5)%3]);
      if(type===2)for(let i=0;i<4;i++)line([p(.12+i*.2,.18),p(.16+i*.2,.22),p(.14+i*.2,.28)],'#333e35',.6);
    }
    // Wall wear is deliberate and restrained, keeping the furniture readable.
    for(let i=0;i<8;i++)line([p(1,.07+i*.12,18+i%3*8),p(1,.085+i*.12,12+i%3*8)],'#c3bc8f22',2);
    if(cabin){
      for(let z=8;z<66;z+=8){
        line([p(0,0,z),p(1,0,z),p(1,1,z)],'#3b3027',2);
        line([p(0,0,z+2),p(1,0,z+2),p(1,1,z+2)],'#b28a5755',1);
      }
    }
    window(type===2?.16:.21,type===2?.23:.32);
    rug(.22,.36,.4,.35);
    if(cabin){
      frame(.67,.2,34);
      table(.57,.035,.35,.16,22);books(.6,.06,23);pot(.87,.07,23);
      // Cast-iron stove, flue and split firewood.
      box(.82,.38,.15,.18,0,26,'#50514a','#343a34','#252d29');
      box(.91,.4,.035,.035,26,38,'#50554a','#343b33','#242d29');
      poly([p(.84,.561,6),p(.94,.561,6),p(.94,.561,19),p(.84,.561,19)],'#171d19',t.trim);
      for(let i=0;i<3;i++)box(.83,.64+i*.04,.12,.035,0,5,'#b18b56','#775536');
      box(.4,.07,.13,.035,9,14,t.wood);box(.4,.07,.13,.12,0,9,t.wood);
      box(.3,.73,.17,.12,0,12,'#8a6942');
      line([p(.32,.85,6),p(.45,.85,6)],t.trim);
    }else if(type===0){
      frame(.55,.16);frame(.76,.11,35);
      // Timber hutch with open shelves, crockery and books.
      box(.69,.025,.27,.12,0,29,'#8c714e','#72583d','#524b38');
      box(.69,.025,.27,.025,29,26,'#866944');
      for(const z of [30,43,55]){box(.69,.025,.27,.13,z,1.5,'#ad8c5d');if(z===43)books(.72,.06,z+2);}
      for(let i=0;i<3;i++)box(.73+i*.063,.055,.035,.04,31,7,'#d0c6a1','#9b9c80','#757f6b');
      kitchen(.77,.29,.2);
      sofa(.44,.055);pot(.93,.7);
      // Reading chair and a small round lamp beside the rug.
      box(.18,.69,.13,.12,0,9,'#a78053');box(.18,.78,.13,.035,9,13,'#986f4c');
      table(.34,.72,.12,.11,17);
      const q=p(.4,.78,18);line([q,{x:q.x,y:q.y-16}],t.trim,1.4);
      poly([{x:q.x-6,y:q.y-16},{x:q.x+6,y:q.y-16},{x:q.x+4,y:q.y-23},{x:q.x-4,y:q.y-23}],'#d9be7d');
    }else if(type===1){
      // L-shaped fitted kitchen and a tall refrigerator at the back.
      kitchen(.59,.035,.36);box(.88,.2,.095,.3,0,22,'#b0b3a0','#658886','#496964');
      box(.88,.55,.1,.12,0,43,'#b4beb0','#8a9c93','#607f78');
      line([p(.89,.67,28),p(.97,.67,28)],'#3b5957');line([p(.9,.672,23),p(.9,.672,16)],'#dce0c7',1.2);
      frame(.74,.16,38);
      sofa(.28,.08);table(.36,.34,.19,.13,12);books(.4,.36,13);
      // Sideboard, small radio, records and a leafy plant.
      box(.22,.74,.32,.11,0,18,'#9c9e85','#6c7f72','#52675f');
      box(.29,.76,.08,.055,18,7,'#384d4d','#293f40','#223938');
      const radio=p(.3,.815,22);ctx.fillStyle='#c8b67b';ctx.fillRect(radio.x,radio.y,7,1);
      books(.4,.76,19);pot(.94,.83);pot(.54,.065);
    }else{
      // Pegboard with hanging tools and an industrial workbench.
      poly([p(.61,0,27),p(.97,0,27),p(.97,0,57),p(.61,0,57)],'#756b4c',t.trim);
      for(let a=0;a<9;a++)for(let b=0;b<5;b++){const q=p(.63+a*.038,0,31+b*5);ctx.fillStyle='#394d42';ctx.fillRect(q.x,q.y,1,1);}
      for(let i=0;i<5;i++){
        const a=.65+i*.06;line([p(a,.005,47),p(a,.005,34)],i%2?'#b7b89b':'#ba9760',2);
        line([p(a-.018,.005,48),p(a+.018,.005,48)],'#bac2a6',2);
      }
      table(.59,.025,.38,.17,23);box(.69,.065,.1,.08,24,6,'#ae8150','#6d6041');
      box(.89,.28,.09,.34,0,41,'#77836c','#62735f','#3f574b');
      for(const z of [10,23,36]){
        line([p(.89,.3,z),p(.89,.59,z)],'#b2b396');
        for(let i=0;i<3;i++)box(.88,.31+i*.087,.055,.06,z+1,6,['#a99963','#7e986f','#a8774c'][i]);
      }
      frame(.72,.19,34);box(.39,.065,.13,.1,0,19,'#939d87','#5a705e','#3b5549');
      poly([p(.39,.166,7),p(.52,.166,7),p(.52,.166,15),p(.39,.166,15)],'#9d9a7b');
      const medical=p(.45,.167,11);ctx.fillStyle='#985f4a';ctx.fillRect(medical.x-1,medical.y-3,2,6);ctx.fillRect(medical.x-3,medical.y-1,6,2);
      box(.22,.73,.23,.13,0,13,'#877c53','#5c6044','#43563e');
      for(const a of [.25,.4])line([p(a,.73,14),p(a,.86,14),p(a,.86,2)],'#b1a570',2);
      table(.55,.56,.1,.1,10);pot(.95,.81);
    }
    // Keep the established sleep interaction at (153,200) in every safe house.
    if(shelter){
      shadow(.13,.17,.23,.27);box(.13,.17,.23,.27,0,8,'#a69572');
      box(.13,.17,.23,.035,8,15,t.wood);box(.14,.19,.21,.24,8,5,'#d2cbb0','#b2ae95','#8b9885');
      box(.155,.195,.18,.065,13,3,'#e5dec5','#c6c8af','#a9b5a0');
      box(.14,.29,.21,.14,13,1.5,t.fabric);
      for(let i=0;i<4;i++)line([p(.15+i*.06,.3,15),p(.15+i*.06,.42,15)],'#ddc99088');
      const q=p(.24,.15,24);ctx.fillStyle='#d8c99e';ctx.font='5px monospace';ctx.textAlign='center';ctx.fillText('CAMA',q.x,q.y);
    }else{
      // A low chest leaves the entrance and the middle of the room open.
      box(.15,.2,.17,.1,0,12,t.wood);line([p(.17,.3,7),p(.3,.3,7)],t.trim);books(.18,.22,13);
    }
    // Shared supply position remains (322,211), on a different table finish per home.
    table(.54,.81,.23,.17,18);
    tile(.66,.835,.06,.07,19.4,'#c6c0a1');
    for(let i=0;i<3;i++)line([p(.67,.85+i*.013,19.6),p(.705,.85+i*.013,19.6)],'#6c7b68',.5);
    box(.56,.85,.025,.027,19.4,4,type===1?'#bfd0bb':'#b79b70');
    // Low front edges and a recessed, unobstructed doorway at the existing exit.
    line([p(0,.2),p(0,1),p(1,1)],'#98a38b',1.4);
    tile(0,.015,.12,.08,.2,'#ab9768','#d7c393');
    poly([{x:62,y:184},{x:76,y:192},{x:76,y:211},{x:62,y:203}],'#243a37');
    line([{x:63,y:203},{x:78,y:213},{x:95,y:203}],'#d2b97f',2);
    ctx.fillStyle='#d2c69f';ctx.font='5px monospace';ctx.textAlign='center';ctx.fillText('SAÍDA',78,222);
    // Warm local light without outdoor rain leaking through the roof.
    const lamp=p(.98,.4,48);
    const light=ctx.createRadialGradient(lamp.x,lamp.y,1,lamp.x,lamp.y,43);
    light.addColorStop(0,'#ffe0a02b');light.addColorStop(1,'#ffe0a000');ctx.fillStyle=light;ctx.fillRect(lamp.x-43,lamp.y-43,86,86);
    ctx.fillStyle='#e5ca8d';ctx.fillRect(lamp.x-2,lamp.y-3,4,5);
    ctx.restore();
  }
  const api={TYPES,variant,draw,contains,constrain};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.RoomInteriors=api;
})();
