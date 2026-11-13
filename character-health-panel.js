/* Character care window, using the workshop's muted purple and brass palette. */
function createCharacterHealthPanel({container,model,onOpen=()=>{},onClose=()=>{}}){
  const launcher=document.createElement('button');launcher.className='health-launcher';launcher.type='button';launcher.hidden=true;
  launcher.title='Saúde do personagem (H)';launcher.setAttribute('aria-controls','character-health-panel');
  const panel=document.createElement('section');panel.id='character-health-panel';panel.className='character-health-panel';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Saúde do personagem');
  panel.innerHTML=`<header class="health-titlebar"><span><b>+</b> PERSONAGEM <small>SAÚDE E PRIMEIROS SOCORROS</small></span><button type="button" data-close aria-label="Fechar saúde">×</button></header>
    <div class="health-summary">${[['health','Condição'],['blood','Sangue'],['pain','Dor']].map(([id,label])=>`<div class="health-stat"><small>${label}</small><strong data-stat="${id}"></strong><meter data-meter="${id}" min="0" max="100" value="100" aria-label="${label}"></meter></div>`).join('')}</div>
    <div class="health-content"><aside class="health-body"><div class="health-body-heading">MAPA CORPORAL <span>01—07</span></div><svg viewBox="0 0 120 200" aria-label="Selecione uma parte do corpo">
      <g stroke="#c4b5ca" stroke-width="1.3"><ellipse data-body="head" cx="60" cy="24" rx="15" ry="19"/>
      <path data-body="chest" d="M39 48 Q60 41 81 48 L77 85 L43 85Z"/>
      <path data-body="abdomen" d="M43 88 L77 88 L75 112 L45 112Z"/>
      <path data-body="rightArm" d="M32 49 L38 53 L34 103 L23 120 L16 115 L23 94 L24 57Z"/>
      <path data-body="leftArm" d="M88 49 L82 53 L86 103 L97 120 L104 115 L97 94 L96 57Z"/>
      <path data-body="rightLeg" d="M44 115 L58 115 L56 155 L53 185 L35 189 L33 180 L40 174 L39 149Z"/>
      <path data-body="leftLeg" d="M62 115 L76 115 L81 149 L80 174 L87 180 L85 189 L67 185 L64 155Z"/></g></svg>
      <small>Selecione a região</small><div class="health-part-list"></div><div class="health-legend"><span>● Saudável</span><span>● Ferido</span><span>● Tratado</span></div></aside>
    <section class="health-care"><div class="health-section-heading"><small>REGIÃO SELECIONADA</small><h2 data-part-title></h2></div>
      <div class="health-wound" aria-live="polite"><strong data-wound-name></strong><p data-wound-details></p></div>
      <div class="health-recovery"><span>RECUPERAÇÃO</span><strong data-recovery-label></strong><progress data-recovery max="100" value="100" aria-label="Recuperação do ferimento"></progress></div>
      <div class="health-effects"><div class="health-section-label">EFEITOS NO PERSONAGEM <span data-effect-count></span></div><div data-effects></div></div>
      <div class="health-section-label health-care-label">PRIMEIROS SOCORROS <span>Fique parado para tratar</span></div><div class="health-actions"></div><p class="health-action-hint"></p>
      <div class="health-treatment" hidden><div><span data-treatment-name></span><button type="button" data-cancel>Cancelar</button></div><progress max="1" value="0"></progress></div>
      <div class="health-inventory"><small>ESTOJO DE CAMPO</small><div data-materials></div></div>
    </section></div><footer><span data-overall></span><small>H fecha · Esc cancela · 1–7 selecionam · mover interrompe o cuidado</small></footer>`;
  container.append(launcher,panel);
  let selected='chest',context={moving:false},elapsed=0,available=false,drag=null;
  const partList=panel.querySelector('.health-part-list'),actionList=panel.querySelector('.health-actions');
  CharacterHealth.PARTS.forEach(([id,label],index)=>{
    const button=document.createElement('button');button.type='button';button.dataset.part=id;button.innerHTML='<kbd>'+(index+1)+'</kbd><span>'+label+'</span><i aria-hidden="true"></i>';partList.appendChild(button);
  });
  Object.entries(CharacterHealth.ACTIONS).forEach(([id,definition])=>{
    const button=document.createElement('button');button.type='button';button.dataset.action=id;button.innerHTML='<span>'+definition.label+'</span><small data-action-meta></small>';actionList.appendChild(button);
  });
  function render(){
    const status=model.status();launcher.textContent='✚ SAÚDE '+Math.round(status.health)+'% · H';
    launcher.classList.toggle('health-danger',status.bleeding>0||status.health<40);
    launcher.setAttribute('aria-expanded',String(!panel.hidden));
    if(panel.hidden)return;
    for(const id of ['health','blood','pain']){
      panel.querySelector('[data-stat="'+id+'"]').textContent=Math.round(status[id])+'%';
      panel.querySelector('[data-meter="'+id+'"]').value=status[id];
    }
    for(const [id] of CharacterHealth.PARTS){
      const wound=model.parts[id].wound,partButton=panel.querySelector('[data-part="'+id+'"]');
      partButton.setAttribute('aria-pressed',String(id===selected));
      partButton.dataset.condition=!wound?'healthy':wound.infected?'infected':wound.bandage||wound.splint?'treated':'injured';
      partButton.title=wound?CharacterHealth.WOUNDS[wound.type].name:'Sem ferimentos';
      const shape=panel.querySelector('[data-body="'+id+'"]');shape.dataset.condition=partButton.dataset.condition;
      shape.classList.toggle('selected',id===selected);
    }
    const wound=model.parts[selected].wound;
    panel.querySelector('[data-part-title]').textContent=CharacterHealth.PARTS.find(([id])=>id===selected)[1];
    panel.querySelector('[data-wound-name]').textContent=wound?CharacterHealth.WOUNDS[wound.type].name:'Sem ferimentos';
    const details=[];
    if(wound){
      if(wound.type!=='fracture'&&wound.type!=='bruise')details.push(wound.bandage?(wound.bandage.dirty?'Curativo sujo — precisa de troca.':'Bandagem limpa — sangramento controlado.'):'Ferida aberta — limpe e aplique uma bandagem.');
      if(wound.type==='fracture')details.push(wound.splint?'Tala aplicada. Recuperação lenta.':'Precisa de tala. A região perdeu parte da sua função.');
      if(wound.type==='bruise')details.push('Melhora com repouso e boas condições de fome e sede.');
      if(wound.infected)details.push('Infecção local. Retire o curativo e desinfete.');
      else if(wound.cleanTime>0)details.push('Região desinfetada.');
      details.push('Recuperação: '+Math.round((1-wound.remaining/wound.total)*100)+'%.');
    }else details.push('Nenhum cuidado necessário nesta região.');
    panel.querySelector('[data-wound-details]').textContent=details.join(' ');
    const recovery=wound?Math.round((1-wound.remaining/wound.total)*100):100;
    panel.querySelector('[data-recovery]').value=recovery;
    panel.querySelector('[data-recovery-label]').textContent=wound?recovery+'%':'Íntegro';
    panel.querySelector('[data-effect-count]').textContent=status.effects.length+' ATIVOS';
    const effects=panel.querySelector('[data-effects]');
    const visibleEffects=[...status.effects].sort((a,b)=>Number(b.part===selected)-Number(a.part===selected));
    const signature=JSON.stringify([selected,visibleEffects]);
    if(effects.dataset.signature!==signature){
      effects.dataset.signature=signature;effects.replaceChildren();
      for(const effect of visibleEffects){
        const row=document.createElement('div');row.className='health-effect';
        row.classList.toggle('health-effect-selected',effect.part===selected);
        const label=document.createElement('strong'),detail=document.createElement('p');
        label.textContent=effect.label;detail.textContent=effect.detail;row.append(label,detail);effects.append(row);
      }
      if(!status.effects.length){const empty=document.createElement('p');empty.className='health-no-effects';empty.textContent='Condição estável. Nenhuma penalidade ativa.';effects.append(empty);}
    }
    for(const button of actionList.querySelectorAll('button')){
      const allowed=model.eligibility(button.dataset.action,selected,context);button.disabled=!allowed.ok;
      const definition=CharacterHealth.ACTIONS[button.dataset.action];
      const duration=definition.duration/status.dexterity;
      button.title=allowed.reason||duration.toFixed(1)+' segundos';
      button.querySelector('[data-action-meta]').textContent=duration.toFixed(1)+' s'+(definition.item?' · '+model.items[definition.item]+' disponíveis':' · sem material');
    }
    panel.querySelector('.health-action-hint').textContent=context.moving?'Pare para iniciar um tratamento.':status.wounds?'Trate primeiro os sangramentos. A cura acontece aos poucos.':'Nenhum material é gasto em regiões saudáveis.';
    const treatment=panel.querySelector('.health-treatment'),action=model.action;
    treatment.hidden=!action;
    if(action){
      panel.querySelector('[data-treatment-name]').textContent=CharacterHealth.ACTIONS[action.kind].label+' · '+Math.max(0,action.duration-action.elapsed).toFixed(1)+' s';
      treatment.querySelector('progress').value=action.elapsed/action.duration;
    }
    const items=model.items;
    panel.querySelector('[data-materials]').innerHTML=[['bandages','Bandagens'],['antiseptic','Antisséptico'],['splints','Talas'],['painkillers','Analgésicos']].map(([id,label])=>'<span><b>'+items[id]+'</b>'+label+'</span>').join('');
    panel.querySelector('[data-overall]').textContent=status.description+' · '+(status.movement<.99?'Locomoção '+Math.round(status.movement*100)+'%':'Locomoção normal');
  }
  function setOpen(open){
    if(open&&!available)return;
    if(!open)model.cancel();
    panel.hidden=!open;launcher.setAttribute('aria-expanded',String(open));
    if(open){onOpen();render();panel.querySelector('[data-close]').focus({preventScroll:true});}
    else onClose();
  }
  function select(id){if(model.parts[id]){selected=id;render();}}
  launcher.onclick=()=>setOpen(panel.hidden);
  panel.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button?.hasAttribute('data-close'))setOpen(false);
    else if(button?.hasAttribute('data-cancel')){model.cancel();render();}
    else if(button?.dataset.part)select(button.dataset.part);
    else if(button?.dataset.action){model.start(button.dataset.action,selected,context);render();}
    const shape=event.target.closest('[data-body]');if(shape)select(shape.dataset.body);
  });
  panel.addEventListener('keydown',event=>{if(['Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.stopPropagation();});
  const titlebar=panel.querySelector('header');
  titlebar.addEventListener('pointerdown',event=>{
    if(event.target.closest('button')||event.button!==0)return;
    const rect=panel.getBoundingClientRect();
    drag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    panel.style.transform='none';panel.style.left=drag.left+'px';panel.style.top=drag.top+'px';titlebar.setPointerCapture(event.pointerId);
  });
  titlebar.addEventListener('pointermove',event=>{
    if(!drag)return;
    const left=Math.max(0,Math.min(window.innerWidth-panel.offsetWidth,drag.left+event.clientX-drag.x));
    const top=Math.max(0,Math.min(window.innerHeight-panel.offsetHeight,drag.top+event.clientY-drag.y));
    panel.style.left=left+'px';panel.style.top=top+'px';
  });
  titlebar.addEventListener('pointerup',()=>drag=null);titlebar.addEventListener('lostpointercapture',()=>drag=null);
  return {setOpen,select,get open(){return !panel.hidden;},
    key(key){
      if(panel.hidden)return false;
      if(key==='escape'){if(model.action)model.cancel();else setOpen(false);render();return true;}
      if(/^[1-7]$/.test(key)){select(CharacterHealth.PARTS[Number(key)-1][0]);return true;}
      return false;
    },
    update(dt,next){context=next;available=!!next.available;launcher.hidden=!available;
      if(!available&&!panel.hidden)setOpen(false);
      elapsed+=dt;if(elapsed>=.1){elapsed=0;render();}
    }
  };
}
