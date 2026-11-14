(function (root) {
  'use strict';
  const keychainPortraits={};
  if(typeof root.Image==='function'){
    const scriptUrl=typeof document!=='undefined'?document.currentScript?.src:null;
    const base=scriptUrl?new URL('../assets/keychain/',scriptUrl).href:'assets/keychain/';
    for(const kind of ['yuuri','chito','nuko']){
      const image=new root.Image();image.src=base+kind+(kind==='nuko'?'.webp':'.png');
      keychainPortraits[kind]=image;
    }
  }
  function createBikeIgnition({canvas,ctx,width:W,height:H,onStart,onCancel,onFail=()=>{},random=Math.random,getCondition=()=>100}) {
    const LOCK={x:318,y:131},HOME={x:214,y:156},TURN=Math.PI/2;
    let session=null,failures=0;
    const viewport=()=>({x:W/2-LOCK.x*.72,y:H/2-LOCK.y*.72,scale:.72});
    const pointer=event=>{
      const bounds=canvas.getBoundingClientRect();
      const view=viewport();
      return {x:((event.clientX-bounds.left)*W/bounds.width-view.x)/view.scale,y:((event.clientY-bounds.top)*H/bounds.height-view.y)/view.scale};
    };
    function open() {
      session={phase:'place',x:HOME.x,y:HOME.y,angle:0,time:0,drag:null,success:0,
        chainBase:{x:HOME.x,y:HOME.y+10,angle:0},
        pendants:[-.95,0,.95].map((rest,i)=>({rest,angle:rest,velocity:0,tilt:0,spin:0,length:[40,35,42][i]})),
        message:'Pegue a chave pelo cabo e leve a ponta até a fechadura.'};
      canvas.style.touchAction='none';canvas.style.cursor='grab';
    }
    function close(started) {
      if(!session)return;
      // Once the key has successfully turned, leaving the animation cannot
      // cancel the engine start (including dismounting with F).
      started=started||session.phase==='success';
      const drag=session.drag;session=null;
      if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);
      canvas.style.touchAction='';canvas.style.cursor='';
      if(started)onStart();else onCancel();
    }
    function insert() {
      const drag=session.drag;session.drag=null;
      if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);
      session.phase='turn';session.x=LOCK.x;session.y=LOCK.y;session.angle=0;
      session.message='Chave encaixada! Pegue o cabo e gire para a direita.';
      canvas.style.cursor='grab';
    }
    function start() {
      if(session.phase!=='turn'||session.angle<TURN)return;
      const drag=session.drag;
      const condition=Math.max(0,Math.min(100,getCondition()));
      // A well-maintained bike starts reliably; meaningful wear raises the risk.
      const wear=Math.max(0,(90-condition)/90);
      const failureChance=.8*wear*wear;
      if(failures<5&&random()<failureChance) {
        failures++;session.phase='failed';session.success=.65;session.drag=null;
        session.message='O motor falhou. Gire a chave novamente.';
        if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);
        canvas.style.cursor='default';onFail(failures);return;
      }
      failures=0;
      session.phase='success';session.success=.8;session.drag=null;
      if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);
      session.message='Motor ligado. Boa viagem!';canvas.style.cursor='default';
    }
    function down(event) {
      if(!session||event.button!==0)return;
      const p=pointer(event),s=session;
      if(s.phase==='success'||s.phase==='failed')return;
      const hit=s.phase==='place'?Math.abs(p.x-s.x)<23&&Math.abs(p.y-s.y)<17:Math.hypot(p.x-LOCK.x,p.y-LOCK.y)<28;
      if(!hit)return;
      event.preventDefault();
      s.drag={id:event.pointerId,dx:p.x-s.x,dy:p.y-s.y,last:Math.atan2(p.y-LOCK.y,p.x-LOCK.x)};
      canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';
    }
    function move(event) {
      if(!session?.drag||session.drag.id!==event.pointerId)return;
      const p=pointer(event),s=session,d=s.drag;
      if(s.phase==='place') {
        s.x=Math.max(46,Math.min(W-46,p.x-d.dx));s.y=Math.max(90,Math.min(H-42,p.y-d.dy));
      } else if(s.phase==='turn') {
        if(Math.hypot(p.x-LOCK.x,p.y-LOCK.y)<8)return;
        const a=Math.atan2(p.y-LOCK.y,p.x-LOCK.x),delta=Math.atan2(Math.sin(a-d.last),Math.cos(a-d.last));
        s.angle=Math.max(0,Math.min(TURN,s.angle+delta));d.last=a;
        if(s.angle>=TURN-.001){s.angle=TURN;start();}
      }
    }
    function up(event) {
      const s=session,d=s?.drag;if(!d||d.id!==event.pointerId)return;
      if(event.type==='pointerup'&&event.button!==0)return;
      s.drag=null;
      if(canvas.hasPointerCapture(d.id))canvas.releasePointerCapture(d.id);
      canvas.style.cursor='grab';
      if(event.type==='pointercancel'||event.type==='lostpointercapture') {
        if(s.phase==='place'){s.x=HOME.x;s.y=HOME.y;}else s.angle=0;
        return;
      }
      if(s.phase==='place') {
        const p=pointer(event);
        if(Math.hypot(p.x-LOCK.x,p.y-LOCK.y)<=34)insert();
        else {s.x=HOME.x;s.y=HOME.y;s.message='Quase! Leve a ponta prateada até o centro da fechadura.';}
      }
    }
    function key(event) {
      if(!session)return;
      event.preventDefault();if(event.repeat)return;
      const k=event.key.toLowerCase();
      if(k==='escape'){close(false);return;}
      if(session.phase==='success'||session.phase==='failed')return;
      if(['e','enter',' '].includes(k)) {
        if(session.phase==='turn'){session.angle=TURN;start();}
      } else if(k==='arrowright'||k==='d') {
        if(session.phase==='turn'){session.angle=Math.min(TURN,session.angle+.3);start();}
      } else if((k==='arrowleft'||k==='a')&&session.phase==='turn')session.angle=Math.max(0,session.angle-.3);
    }
    function update(dt) {
      if(!session)return;
      session.time+=dt;
      updateKeychain(session,dt);
      if(session.phase==='failed') {
        session.success-=dt;session.angle=TURN*Math.max(0,session.success/.65);
        if(session.success<=0){session.phase='turn';session.angle=0;canvas.style.cursor='grab';}
      }
      if(session.phase==='success'){session.success-=dt;if(session.success<=0)close(true);}
    }
    function updateKeychain(s,dt) {
      if(dt<=0)return;
      const base={x:s.x-Math.sin(s.angle)*9,y:s.y+Math.cos(s.angle)*10,angle:s.angle};
      const dx=base.x-s.chainBase.x,dy=base.y-s.chainBase.y,turn=base.angle-s.chainBase.angle;
      s.chainBase=base;
      for(const p of s.pendants){
        // Moving the support leaves each pendant behind, then gravity pulls it back.
        p.angle-=Math.max(-.8,Math.min(.8,dx/p.length))*.65*Math.cos(p.angle);
        p.velocity+=-dx/p.length*3.2+dy/p.length*Math.sin(p.angle)*1.8-turn*1.6;
        p.velocity=Math.max(-7,Math.min(7,p.velocity));
      }
      let remaining=Math.min(dt,.25);
      while(remaining>1e-8){
        const step=Math.min(1/120,remaining);remaining-=step;
        for(const [i,p] of s.pendants.entries()){
          p.velocity-=(16+i*.8)*Math.sin(p.angle-p.rest)*step;
          p.velocity*=Math.exp(-1.25*step);p.angle+=p.velocity*step;
          if(Math.abs(p.angle)>1.48){p.angle=Math.sign(p.angle)*1.48;p.velocity*=-.25;}
          p.spin+=((p.angle-p.rest)*.55-p.tilt)*22*step;
          p.spin*=Math.exp(-2.2*step);p.tilt=Math.max(-.7,Math.min(.7,p.tilt+p.spin*step));
        }
      }
    }
    function charm(kind,x,y,scale=1,angle=0) {
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
      const accent=kind==='yuuri'?'#c9a260':kind==='chito'?'#7a99aa':'#a6b794';
      const acrylic=ctx.createLinearGradient(-20,-22,22,38);
      acrylic.addColorStop(0,'#fff8e9');acrylic.addColorStop(.45,kind==='yuuri'?'#e8dac0':kind==='chito'?'#d1dde1':'#e4e8da');acrylic.addColorStop(1,'#bfcac5');
      ctx.shadowColor='#070b1080';ctx.shadowBlur=3;ctx.shadowOffsetY=2;
      ctx.fillStyle=acrylic;ctx.strokeStyle='#f7f6e9';ctx.lineWidth=2.8;
      ctx.beginPath();ctx.roundRect(-21,-22,42,60,9);ctx.fill();ctx.stroke();
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.strokeStyle=accent;ctx.lineWidth=.8;ctx.beginPath();ctx.roundRect(-19.5,-20.5,39,57,8);ctx.stroke();
      ctx.fillStyle=accent;ctx.beginPath();ctx.roundRect(-15,30,30,5,2);ctx.fill();
      ctx.fillStyle='#fdf8e9';ctx.font='bold 4px sans-serif';ctx.textAlign='center';
      ctx.fillText(kind==='yuuri'?'YUURI':kind==='chito'?'CHITO':'NUKO',0,34);
      ctx.strokeStyle='#2d292f';ctx.lineWidth=1;
      const portrait=keychainPortraits[kind];
      if(portrait?.complete&&portrait.naturalWidth){
        ctx.save();ctx.beginPath();ctx.roundRect(-17,-17,34,45,5);ctx.clip();
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        const fit=Math.max(34/portrait.naturalWidth,45/portrait.naturalHeight);
        const width=portrait.naturalWidth*fit,height=portrait.naturalHeight*fit;
        ctx.drawImage(portrait,-17+(34-width)/2,-17+(45-height)/2,width,height);
        ctx.restore();
      }else if(kind==='nuko') {
        ctx.fillStyle='#e9e8dc';ctx.beginPath();ctx.moveTo(-12,5);ctx.quadraticCurveTo(-17,-1,-19,-13);ctx.quadraticCurveTo(-9,-12,-5,-7);
        ctx.quadraticCurveTo(0,-9,5,-7);ctx.quadraticCurveTo(9,-12,19,-13);ctx.quadraticCurveTo(17,-1,12,5);
        ctx.lineTo(10,23);ctx.quadraticCurveTo(0,29,-10,23);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#27262b';for(const ex of [-7,7]){ctx.beginPath();ctx.arc(ex,2,2.2,0,Math.PI*2);ctx.fill();}
        ctx.beginPath();ctx.moveTo(-2,8);ctx.lineTo(0,10);ctx.lineTo(2,8);ctx.stroke();
        ctx.strokeStyle='#a6a69c';ctx.beginPath();ctx.moveTo(-7,19);ctx.lineTo(-7,24);ctx.moveTo(7,19);ctx.lineTo(7,24);ctx.stroke();
      } else {
        const yuuri=kind==='yuuri';
        ctx.fillStyle=yuuri?'#c4af79':'#292832';ctx.beginPath();ctx.roundRect(-14,-7,28,31,9);ctx.fill();ctx.stroke();
        if(!yuuri)for(const side of [-1,1]){ctx.fillStyle='#25252b';for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(side*(12+i),13+i*4,3,4,side*.2,0,Math.PI*2);ctx.fill();}}
        ctx.fillStyle='#68725d';ctx.beginPath();ctx.roundRect(-11,13,22,17,5);ctx.fill();ctx.stroke();
        ctx.fillStyle='#dec8a5';ctx.beginPath();ctx.ellipse(0,4,12,12,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle=yuuri?'#d9c084':'#282630';
        ctx.beginPath();ctx.moveTo(-12,-4);ctx.lineTo(12,-4);ctx.lineTo(12,6);ctx.lineTo(6,-1);ctx.lineTo(3,4);ctx.lineTo(-1,-1);ctx.lineTo(-7,4);ctx.lineTo(-12,1);ctx.closePath();ctx.fill();
        ctx.fillStyle=yuuri?'#7b8063':'#626b57';ctx.beginPath();ctx.ellipse(0,-7,16,9,0,Math.PI,Math.PI*2);ctx.lineTo(16,-5);ctx.quadraticCurveTo(0,-2,-16,-5);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.strokeStyle='#a2a38a';ctx.beginPath();ctx.moveTo(-10,-9);ctx.quadraticCurveTo(0,-15,9,-10);ctx.stroke();
        ctx.fillStyle='#28252a';for(const ex of [-5,5]){ctx.beginPath();ctx.ellipse(ex,6,1.4,yuuri?1:2,0,0,Math.PI*2);ctx.fill();}
        ctx.beginPath();ctx.moveTo(-2,11);ctx.lineTo(2,11);ctx.stroke();
        ctx.strokeStyle='#b4b59b';ctx.beginPath();ctx.moveTo(0,18);ctx.lineTo(0,28);ctx.moveTo(-8,20);ctx.lineTo(-3,20);ctx.stroke();
        ctx.fillStyle='#353c34';ctx.beginPath();ctx.moveTo(-8,14);ctx.lineTo(-2,19);ctx.lineTo(0,15);ctx.lineTo(2,19);ctx.lineTo(8,14);ctx.closePath();ctx.fill();
        ctx.fillStyle='#cfb681';for(const by of [21,25]){ctx.beginPath();ctx.arc(1,by,.7,0,Math.PI*2);ctx.fill();}
        ctx.strokeStyle='#434b3e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-8,19);ctx.lineTo(-9,25);ctx.moveTo(8,19);ctx.lineTo(9,25);ctx.stroke();
        ctx.fillStyle='#b48a79';ctx.globalAlpha=.38;for(const ex of [-8,8]){ctx.beginPath();ctx.ellipse(ex,9,2,1,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
        ctx.fillStyle='#c4b391';ctx.fillRect(-11,26,22,3);
      }
      // Resin bevel and a reinforced metal eyelet, above the illustration.
      ctx.strokeStyle='#ffffffb0';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-17,17);ctx.lineTo(-17,-12);ctx.quadraticCurveTo(-17,-17,-12,-17);ctx.stroke();
      ctx.strokeStyle='#ffffff80';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(12,34);ctx.quadraticCurveTo(17,34,17,28);ctx.lineTo(17,22);ctx.stroke();
      ctx.fillStyle='#737e83';ctx.beginPath();ctx.arc(0,-22,4.2,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#eef0e5';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-22,3.3,Math.PI*.9,Math.PI*1.95);ctx.stroke();
      ctx.fillStyle='#27323a';ctx.beginPath();ctx.arc(0,-22,2,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    function draw(time) {
      const s=session;if(!s)return;
      const inserted=s.phase!=='place',success=s.phase==='success';
      const view=viewport();ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
      ctx.lineWidth=.7;
      // Cast metal steering clamp with a round black ignition switch.
      const clamp=ctx.createLinearGradient(0,88,0,187);clamp.addColorStop(0,'#44464e');clamp.addColorStop(.4,'#252a33');clamp.addColorStop(1,'#111720');
      ctx.shadowColor='#0009';ctx.shadowBlur=7;ctx.shadowOffsetY=3;
      ctx.fillStyle=clamp;ctx.strokeStyle='#6d6e77';ctx.beginPath();ctx.moveTo(244,94);ctx.lineTo(391,94);ctx.lineTo(411,172);ctx.lineTo(389,190);ctx.lineTo(249,190);ctx.lineTo(227,172);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.strokeStyle='#a6b3bd18';ctx.lineWidth=.5;
      for(let line=0;line<17;line++){const y=101+line*4;ctx.beginPath();ctx.moveTo(248,y);ctx.lineTo(386,y);ctx.stroke();}
      ctx.strokeStyle='#cad2d855';ctx.beginPath();ctx.moveTo(246,96);ctx.lineTo(389,96);ctx.lineTo(406,170);ctx.stroke();
      for(const bx of [250,386]){
        ctx.fillStyle='#10161d';ctx.beginPath();ctx.arc(bx,109,7,0,Math.PI*2);ctx.fill();
        const bolt=ctx.createLinearGradient(bx-4,104,bx+4,113);bolt.addColorStop(0,'#c0cacb');bolt.addColorStop(.5,'#6d7c86');bolt.addColorStop(1,'#343f4b');ctx.fillStyle=bolt;
        ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3,px=bx+Math.cos(a)*4.5,py=109+Math.sin(a)*4.5;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();
        ctx.fillStyle='#202934';ctx.beginPath();ctx.arc(bx,109,1.7,0,Math.PI*2);ctx.fill();
      }
      ctx.strokeStyle='#7b538d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(233,173);ctx.lineTo(251,184);ctx.lineTo(387,184);ctx.lineTo(403,173);ctx.stroke();
      const rim=ctx.createLinearGradient(LOCK.x-40,90,LOCK.x+40,166);rim.addColorStop(0,'#c4c8c4');rim.addColorStop(.4,'#4c545f');rim.addColorStop(.7,'#a3a7a7');rim.addColorStop(1,'#3a424c');
      ctx.fillStyle=rim;ctx.beginPath();ctx.arc(LOCK.x,LOCK.y,39,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#10141d';ctx.beginPath();ctx.arc(LOCK.x,LOCK.y,34,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#d2dbe145';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(LOCK.x,LOCK.y,37,-Math.PI*.95,-Math.PI*.05);ctx.stroke();
      ctx.fillStyle='#080c12';ctx.beginPath();ctx.arc(365,157,5,0,Math.PI*2);ctx.fill();
      if(success){ctx.shadowColor='#b6ef91';ctx.shadowBlur=9;}
      ctx.fillStyle=success?'#c2ef9f':s.phase==='failed'?'#ef795e':'#5c513d';ctx.beginPath();ctx.arc(365,157,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      const cylinder=ctx.createLinearGradient(LOCK.x-17,LOCK.y-17,LOCK.x+17,LOCK.y+17);
      cylinder.addColorStop(0,'#c7d1d0');cylinder.addColorStop(.3,'#7c8b98');cylinder.addColorStop(.5,'#b2bfc3');cylinder.addColorStop(1,'#4b5b69');
      ctx.fillStyle='#050a12';ctx.beginPath();ctx.arc(LOCK.x,LOCK.y,19,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=cylinder;ctx.beginPath();ctx.arc(LOCK.x,LOCK.y,17,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.translate(LOCK.x,LOCK.y);ctx.rotate(s.angle);
      ctx.fillStyle='#03070d';ctx.beginPath();ctx.roundRect(-3,-11,6,22,2);ctx.fill();
      ctx.strokeStyle='#d3dbd89c';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-4,-10);ctx.lineTo(-4,10);ctx.stroke();ctx.restore();
      const near=!inserted&&s.drag&&Math.hypot(s.x+s.drag.dx-LOCK.x,s.y+s.drag.dy-LOCK.y)<=34;
      if(!inserted&&near){ctx.strokeStyle='#bce6a3';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(LOCK.x,LOCK.y,35,0,Math.PI*2);ctx.stroke();}
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);
      if(!inserted){
        const blade=ctx.createLinearGradient(-5,0,7,0);blade.addColorStop(0,'#6c7f89');blade.addColorStop(.4,'#e6ece4');blade.addColorStop(1,'#82929c');ctx.fillStyle=blade;ctx.strokeStyle='#596774';ctx.lineWidth=.6;
        ctx.beginPath();ctx.moveTo(-5,-9);ctx.lineTo(-5,-46);ctx.lineTo(-2,-50);ctx.lineTo(5,-50);ctx.lineTo(5,-41);ctx.lineTo(2,-38);ctx.lineTo(5,-35);ctx.lineTo(2,-31);ctx.lineTo(5,-27);ctx.lineTo(5,-9);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.strokeStyle='#798c95';ctx.beginPath();ctx.moveTo(-2,-12);ctx.lineTo(-2,-43);ctx.stroke();
      }
      const rubber=ctx.createLinearGradient(0,-14,0,13);rubber.addColorStop(0,'#45434d');rubber.addColorStop(1,'#141721');ctx.fillStyle=rubber;ctx.strokeStyle='#a49baa';ctx.lineWidth=1;
      ctx.beginPath();ctx.roundRect(-22,-14,44,28,7);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#73727d';ctx.lineWidth=.6;ctx.beginPath();ctx.roundRect(-19,-11,38,22,5);ctx.stroke();
      ctx.fillStyle='#262632';ctx.beginPath();ctx.roundRect(-10,-5,20,8,2);ctx.fill();
      ctx.strokeStyle='#aaa8b1';ctx.beginPath();ctx.moveTo(-4,-1);ctx.lineTo(0,-4);ctx.lineTo(4,-1);ctx.lineTo(0,2);ctx.closePath();ctx.stroke();
      ctx.strokeStyle='#090b12';ctx.lineWidth=1.2;
      for(const side of [-1,1])for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(side*14,-3+j*3);ctx.lineTo(side*18,-3+j*3);ctx.stroke();}
      ctx.strokeStyle='#9869bc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-16,-8);ctx.lineTo(16,-8);ctx.stroke();
      ctx.fillStyle='#b7b6b0';ctx.beginPath();ctx.ellipse(0,7,8,2,0,0,Math.PI*2);ctx.fill();
      ctx.restore();
      // Charms hang from the key ring and sway with the hand and the turn.
      const ringX=s.x-Math.sin(s.angle)*9,ringY=s.y+Math.cos(s.angle)*10;
      ctx.strokeStyle='#26313a';ctx.lineWidth=3.5;ctx.beginPath();ctx.ellipse(ringX,ringY+8,9,11,-.12,0,Math.PI*2);ctx.stroke();
      const ringMetal=ctx.createLinearGradient(ringX-9,ringY,ringX+9,ringY+19);
      ringMetal.addColorStop(0,'#f0ead2');ringMetal.addColorStop(.35,'#a3b0b3');ringMetal.addColorStop(.65,'#536572');ringMetal.addColorStop(1,'#d5d9ce');
      ctx.strokeStyle=ringMetal;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(ringX,ringY+8,9,11,-.12,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#f3f1df';ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(ringX,ringY+8,8.6,10.5,-.12,Math.PI,Math.PI*1.65);ctx.stroke();
      for(const [i,kind] of ['yuuri','chito','nuko'].entries()){
        const p=s.pendants[i],scale=.74,tilt=p.tilt;
        const cx=Math.max(24,Math.min(W-24,ringX+Math.sin(p.angle)*p.length-Math.sin(tilt)*22*scale));
        const cy=Math.min(H-62,ringY+17+Math.cos(p.angle)*p.length+Math.cos(tilt)*22*scale);
        const hookX=cx+Math.sin(tilt)*22*scale,hookY=cy-Math.cos(tilt)*22*scale;
        const startY=ringY+17,controlX=(ringX+hookX)/2-p.velocity*2.2;
        const controlY=(startY+hookY)/2+5+Math.min(5,Math.abs(p.velocity));
        for(let link=0;link<14;link++){
          const t=link/13,u=1-t;
          const px=u*u*ringX+2*u*t*controlX+t*t*hookX,py=u*u*startY+2*u*t*controlY+t*t*hookY;
          const chainAngle=Math.atan2(2*u*(controlY-startY)+2*t*(hookY-controlY),2*u*(controlX-ringX)+2*t*(hookX-controlX))-Math.PI/2;
          ctx.strokeStyle=link%2?'#bfc8c4':'#687e89';ctx.lineWidth=1;
          ctx.beginPath();ctx.ellipse(px,py,link%2?1.1:1.6,2.1,chainAngle,0,Math.PI*2);ctx.stroke();
          ctx.strokeStyle='#e7e8d6';ctx.lineWidth=.4;ctx.beginPath();ctx.ellipse(px-.3,py-.4,1,1.5,chainAngle,Math.PI,Math.PI*1.65);ctx.stroke();
        }
        charm(kind,cx,cy,scale,tilt);
      }
      ctx.textAlign='center';ctx.font='7px monospace';ctx.fillStyle='#c6b9cc';
      ctx.fillText(success?'MOTOR LIGADO':s.phase==='failed'?'TENTE GIRAR NOVAMENTE':inserted?'ARRASTE EM SENTIDO HORÁRIO':'ARRASTE A CHAVE ATÉ A FECHADURA',296,280);
      ctx.restore();
    }
    return {open,close,down,move,up,key,update,draw,
      reset(){failures=0;},
      cancelDrag(){if(session?.drag)up({pointerId:session.drag.id,type:'pointercancel'});},
      get active(){return session!==null;},
      get viewport(){return viewport();},
      get snapshot(){return session?{phase:session.phase,x:session.x,y:session.y,angle:session.angle,dragging:!!session.drag,
        keychain:session.pendants.map(p=>({angle:p.angle,velocity:p.velocity,tilt:p.tilt}))}:null;}};
  }
  root.createBikeIgnition=createBikeIgnition;
  if(typeof module!=='undefined'&&module.exports)module.exports=createBikeIgnition;
})(globalThis);
