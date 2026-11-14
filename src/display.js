(function(root) {
  'use strict';
  function gameRenderResolution(width,height,pixelRatio=1,quality=1) {
    const scale=Math.max(2,Math.min(4,Math.max(width/480,height/270)*pixelRatio)*quality);
    const unit=Math.round(30*scale);
    return {width:16*unit,height:9*unit};
  }
  function createRenderBudget(onChange) {
    let quality=1,elapsed=0,samples=0,stable=0;
    function sampleFrame(ms){
      if(!Number.isFinite(ms)||ms<=0||ms>500){elapsed=0;samples=0;stable=0;return;}
      elapsed+=ms;samples++;
      if(elapsed<2000)return;
      const average=elapsed/samples;let next=quality;
      if(average>23){next=Math.max(.8,quality-.1);stable=0;}
      else if(average<18){stable+=elapsed;if(stable>=12000){next=Math.min(1,quality+.05);stable=0;}}
      else stable=0;
      elapsed=0;samples=0;
      if(Math.abs(next-quality)>.001){quality=next;onChange(quality);}
    }
    return {sampleFrame,get quality(){return quality;}};
  }
  function gameSceneViewport(state) {
    const fixed=['explore','chase','grapple','climb','hack'].includes(state);
    return fixed?{x:80,y:45,width:480,height:270}:{x:0,y:0,width:640,height:360};
  }
  function initGameDisplay({canvas,onResize}) {
    const frame=canvas.closest('.game-frame'),button=document.querySelector('#fullscreen-toggle');
    let expanded=false,pending=false,resizePending=false;
    const budget=createRenderBudget(()=>resize());
    function resize(){const bounds=canvas.getBoundingClientRect();onResize(gameRenderResolution(bounds.width,bounds.height,window.devicePixelRatio||1,budget.quality));}
    function scheduleResize(){
      if(resizePending)return;
      resizePending=true;
      window.requestAnimationFrame(()=>{resizePending=false;resize();});
    }
    function active(){return document.fullscreenElement===frame||expanded;}
    function sync(){
      document.body.classList.toggle('game-fullscreen',expanded);
      if(button){
        const label=active()?'Sair da tela cheia':'Tela cheia';
        button.setAttribute('aria-pressed',String(active()));button.setAttribute('aria-label',label+' (P)');button.title=label+' (P)';
        button.querySelector('span').textContent=active()?'SAIR':'TELA CHEIA';
      }
      resize();
    }
    async function toggle(){
      if(pending)return;
      pending=true;const entering=!active();
      try{
        if(!entering){expanded=false;if(document.fullscreenElement===frame)await document.exitFullscreen();}
        else if(frame.requestFullscreen)await frame.requestFullscreen();
        else expanded=true;
      }catch{if(entering)expanded=true;}
      finally{pending=false;sync();}
    }
    button?.addEventListener('click',toggle);
    document.addEventListener('fullscreenchange',sync);
    window.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&expanded){event.preventDefault();event.stopImmediatePropagation();expanded=false;sync();return;}
      if(event.key.toLowerCase()!=='p'||event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName||''))return;
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)return toggle();
    },true);
    window.addEventListener('resize',scheduleResize);
    window.visualViewport?.addEventListener('resize',scheduleResize);
    if(window.ResizeObserver)new window.ResizeObserver(scheduleResize).observe(canvas);
    sync();
    return {sampleFrame(ms){if(!document.hidden)budget.sampleFrame(ms);},get quality(){return budget.quality;}};
  }
  root.gameRenderResolution=gameRenderResolution;
  root.initGameDisplay=initGameDisplay;
  root.gameSceneViewport=gameSceneViewport;
  root.createRenderBudget=createRenderBudget;
  if(typeof module!=='undefined'&&module.exports)module.exports={gameRenderResolution,gameSceneViewport,createRenderBudget,initGameDisplay};
})(globalThis);
