/* Simplified survival-game medicine. No browser dependencies in the simulation. */
(() => {
  'use strict';
  const PARTS=[['head','Cabeça'],['chest','Tórax'],['abdomen','Abdômen'],['leftArm','Braço esquerdo'],
    ['rightArm','Braço direito'],['leftLeg','Perna esquerda'],['rightLeg','Perna direita']];
  const WOUNDS={
    bruise:{name:'Contusão',bleeding:0,healing:18,pain:12},
    scratch:{name:'Arranhão',bleeding:.06,healing:16,pain:8},
    cut:{name:'Corte',bleeding:.18,healing:32,pain:18},
    deep:{name:'Ferida profunda',bleeding:.32,healing:50,pain:28},
    fracture:{name:'Fratura',bleeding:0,healing:95,pain:40}
  };
  const ACTIONS={
    clean:{label:'Desinfetar',duration:3,item:'antiseptic'},
    bandage:{label:'Aplicar bandagem',duration:4,item:'bandages'},
    remove:{label:'Retirar bandagem',duration:2},
    splint:{label:'Imobilizar',duration:7,item:'splints'},
    painkiller:{label:'Tomar analgésico',duration:2,item:'painkillers'}
  };
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function create({random=Math.random,onNotice=()=>{}}={}){
    let parts,items,blood,vitality,medicine,action,clock;
    function reset(){
      parts=Object.fromEntries(PARTS.map(([id])=>[id,{wound:null}]));
      items={bandages:6,antiseptic:3,splints:1,painkillers:2};
      blood=100;vitality=100;medicine=0;action=null;clock=0;
    }
    function bleed(wound){
      if(!wound)return 0;
      const protection=wound.bandage?(wound.bandage.dirty ? .16 : 0):1;
      return WOUNDS[wound.type].bleeding*wound.severity*protection;
    }
    function status(){
      const wounds=Object.values(parts).map(p=>p.wound).filter(Boolean);
      const bleeding=wounds.reduce((sum,w)=>sum+bleed(w),0);
      const rawPain=wounds.reduce((sum,w)=>sum+WOUNDS[w.type].pain*w.severity*(w.remaining/w.total)*(w.splint?.55:1)+(w.infected?8:0),0);
      const pain=clamp(rawPain-(medicine>0?35:0),0,100);
      const health=clamp(Math.min(vitality,blood*.85+15),0,100);
      let legs=0,arms=0,chest=0,head=0,abdomen=0;
      const effects=[];
      for(const [id,label] of PARTS){
        const wound=parts[id].wound;if(!wound)continue;
        const damage=wound.severity*(wound.remaining/wound.total)*(wound.type==='fracture'?(wound.splint?.5:1):wound.type==='deep'?.85:wound.type==='cut'?.6:wound.type==='bruise'?.45:.25);
        let detail;
        if(id.endsWith('Leg')){legs+=damage*.32;detail='Passos mais lentos; a corrida também perde velocidade.';}
        else if(id.endsWith('Arm')){arms+=damage*.25;detail='Menos controle da moto e tratamentos mais demorados.';}
        else if(id==='chest'){chest+=damage*.35;detail='Fôlego reduzido: menor velocidade ao correr.';}
        else if(id==='head'){head+=damage*.3;detail='Menor precisão no rapel e menos tempo útil no terminal.';}
        else {abdomen+=damage*.6;detail='Fome e sede aumentam mais rápido.';}
        effects.push({id,part:id,label:WOUNDS[wound.type].name+' · '+label,detail});
      }
      const weakness=clamp((65-blood)/100,0,.4);
      if(bleeding>0)effects.push({id:'bleeding',label:'Sangramento',detail:'Perda contínua de sangue e condição. Abaixo de 65% de sangue, andar e correr ficam mais lentos.'});
      if(pain>0)effects.push({id:'pain',label:'Dor',detail:'Reduz a velocidade de movimento. Analgésicos aliviam esse efeito temporariamente.'});
      if(wounds.some(w=>w.infected))effects.push({id:'infection',label:'Infecção',detail:'Perda gradual de condição e cicatrização mais lenta. Retire o curativo e desinfete.'});
      if(weakness>0)effects.push({id:'weakness',label:'Fraqueza',detail:'Pouco sangue: movimento e corrida prejudicados.'});
      return {health,blood,pain,bleeding,wounds:wounds.length,infected:wounds.some(w=>w.infected),
        movement:clamp(1-legs-pain*.002-weakness,.35,1),sprint:clamp(1-chest-weakness,.45,1),
        handling:clamp(1-arms,.5,1),dexterity:clamp(1-arms,.45,1),focus:clamp(1-head,.5,1),
        metabolism:1+Math.min(1.2,abdomen),effects,critical:health<=12||blood<=18,
        description:bleeding>.01?'Sangramento ativo':wounds.some(w=>w.infected)?'Infecção local':wounds.length?'Em recuperação':'Sem ferimentos'};
    }
    function injure(part,type='scratch',severity=1){
      if(!parts[part]||!WOUNDS[type])return false;
      if(action)cancel('Tratamento interrompido pelo ferimento.');
      severity=clamp(severity,.5,2);
      const current=parts[part].wound;
      if(current){
        if(WOUNDS[type].healing>WOUNDS[current.type].healing)current.type=type;
        current.severity=clamp(current.severity+severity*.25,.5,2);
        current.remaining=Math.min(160,current.remaining+WOUNDS[type].healing*.4);
        current.total=Math.max(current.total,current.remaining);
        current.cleanTime=0;if(current.bandage)current.bandage.dirty=true;
      }else{
        const total=WOUNDS[type].healing*severity;
        parts[part].wound={type,severity,total,remaining:total,contamination:type==='bruise'||type==='fracture'?0:12,
          infected:false,cleanTime:0,bandage:null,splint:false};
      }
      vitality=clamp(vitality-(type==='fracture'?13:type==='deep'?11:type==='cut'?7:4)*severity,0,100);
      onNotice(WOUNDS[type].name+' · '+PARTS.find(p=>p[0]===part)[1]+' — H para cuidar.');
      return true;
    }
    function eligibility(kind,part,context={}){
      const job=ACTIONS[kind],wound=parts[part]?.wound;
      if(!job)return {ok:false,reason:'Tratamento desconhecido.'};
      if(action)return {ok:false,reason:'Conclua ou cancele o tratamento atual.'};
      if(context.moving)return {ok:false,reason:'Pare de se mover para cuidar do ferimento.'};
      if(kind==='painkiller'){
        if(status().pain<1)return {ok:false,reason:'Você não está sentindo dor.'};
        if(medicine>0)return {ok:false,reason:'O analgésico ainda está fazendo efeito.'};
      }else if(!wound)return {ok:false,reason:'Essa região não está ferida.'};
      if(kind==='clean'&&(wound.type==='bruise'||wound.type==='fracture'))return {ok:false,reason:'Esse ferimento não precisa de desinfecção.'};
      if(kind==='clean'&&wound.bandage)return {ok:false,reason:'Retire a bandagem antes de limpar.'};
      if(kind==='clean'&&wound.cleanTime>0&&!wound.infected)return {ok:false,reason:'A região já está desinfetada.'};
      if(kind==='bandage'&&(wound.type==='bruise'||wound.type==='fracture'))return {ok:false,reason:'Use imobilização para fraturas; contusões melhoram com repouso.'};
      if(kind==='bandage'&&wound.bandage)return {ok:false,reason:'Retire o curativo usado antes de colocar outro.'};
      if(kind==='remove'&&!wound.bandage)return {ok:false,reason:'Não há bandagem nessa região.'};
      if(kind==='splint'&&(wound.type!=='fracture'||wound.splint))return {ok:false,reason:'Imobilização é usada em fraturas ainda sem tala.'};
      if(job.item&&items[job.item]<=0)return {ok:false,reason:'Sem material para esse tratamento.'};
      return {ok:true,reason:''};
    }
    function start(kind,part,context={}){
      const allowed=eligibility(kind,part,context);if(!allowed.ok){onNotice(allowed.reason);return false;}
      const job=ACTIONS[kind];action={kind,part,elapsed:0,duration:job.duration/status().dexterity};return true;
    }
    function cancel(message='Tratamento cancelado. Nenhum material consumido.'){
      if(!action)return false;action=null;onNotice(message);return true;
    }
    function complete(){
      const current=action;action=null;
      if(!current)return;
      const job=ACTIONS[current.kind],wound=parts[current.part]?.wound;
      if((job.item&&items[job.item]<=0)||(current.kind!=='painkiller'&&!wound))return;
      if(job.item)items[job.item]--;
      if(current.kind==='clean'){wound.contamination=0;wound.infected=false;wound.cleanTime=100;}
      if(current.kind==='bandage')wound.bandage={age:0,dirty:false};
      if(current.kind==='remove')wound.bandage=null;
      if(current.kind==='splint')wound.splint=true;
      if(current.kind==='painkiller')medicine=65;
      onNotice(job.label+' — concluído.');
    }
    function update(dt,{moving=false,running=false,hunger=100,thirst=100}={}){
      if(!Number.isFinite(dt)||dt<=0)return;
      // Bounded substeps keep treatment completion and bleeding consistent at every frame rate.
      while(dt>1e-9){
        const step=Math.min(dt,.05);dt-=step;clock+=step;
        if(action&&moving)cancel('Você se moveu. Tratamento interrompido, sem gastar material.');
        if(action){action.elapsed+=step;if(action.elapsed+1e-8>=action.duration)complete();}
        medicine=Math.max(0,medicine-step);
        let activeBleeding=0,hasWounds=false;
        for(const part of Object.values(parts)){
          const wound=part.wound;if(!wound)continue;hasWounds=true;
          wound.cleanTime=Math.max(0,wound.cleanTime-step);
          if(wound.bandage){wound.bandage.age+=step;if(wound.bandage.age>=90)wound.bandage.dirty=true;}
          activeBleeding+=bleed(wound);
          const open=wound.type!=='bruise'&&wound.type!=='fracture';
          if(open){
            const dirt=wound.bandage?.dirty ? .30 : !wound.bandage ? .07 : 0;
            wound.contamination=clamp(wound.contamination+(wound.cleanTime>0?-.25:dirt)*step,0,100);
            if(wound.contamination>=45)wound.infected=true;
          }
          const canHeal=wound.type==='bruise'||(wound.type==='fracture'?wound.splint:!!wound.bandage);
          const fed=hunger>30&&thirst>30;
          const rate=canHeal&&fed?(moving?.045:.10)*(wound.infected?.15:1)*(wound.bandage?.dirty?.3:1):.004;
          wound.remaining=Math.max(0,wound.remaining-rate*step);
          if(wound.remaining===0){part.wound=null;onNotice('Ferimento recuperado.');}
          if(running&&wound.type==='fracture'&&!wound.splint)wound.remaining=Math.min(wound.total,wound.remaining+step*.025);
        }
        blood=clamp(blood-activeBleeding*step+(activeBleeding===0&&hunger>30&&thirst>30?.045*step:0),0,100);
        if(activeBleeding>0)vitality=clamp(vitality-activeBleeding*.12*step,0,100);
        else if(hunger>30&&thirst>30)vitality=clamp(vitality+(hasWounds?.025:.07)*(moving?.45:1)*step,0,100);
        if(Object.values(parts).some(p=>p.wound?.infected))vitality=clamp(vitality-.015*step,0,100);
      }
    }
    function restock(){items.bandages+=3;items.antiseptic+=2;items.painkillers++;if(random()<.4)items.splints++;onNotice('Primeiros socorros: +3 bandagens, +2 antissépticos e +1 analgésico.');}
    function stabilize(){
      cancel();blood=Math.max(55,blood);vitality=Math.max(45,vitality);
      for(const part of Object.values(parts))if(part.wound){
        if(WOUNDS[part.wound.type].bleeding>0)part.wound.bandage={age:0,dirty:false};
        if(part.wound.type==='fracture')part.wound.splint=true;
      }
    }
    reset();
    return {reset,status,injure,start,cancel,eligibility,update,restock,stabilize,
      get parts(){return parts;},get items(){return items;},get action(){return action;},get clock(){return clock;}};
  }
  const api={PARTS,WOUNDS,ACTIONS,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.CharacterHealth=api;
})();
