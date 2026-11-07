(function(root) {
  'use strict';
  function gameRenderResolution(width,height,pixelRatio=1,quality=1) {
    const scale=Math.max(2,Math.min(4,Math.max(width/480,height/270)*pixelRatio)*quality);
    return {width:Math.round(480*scale),height:Math.round(270*scale)};
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
    let expanded=true;
    document.body.classList.add('game-expanded');
    const budget=createRenderBudget(()=>resize());
    function resize(){const bounds=canvas.getBoundingClientRect();onResize(gameRenderResolution(bounds.width,bounds.height,window.devicePixelRatio||1,budget.quality));}
    function sync(){
      const active=document.fullscreenElement===frame||expanded;
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',active?'Minimizar jogo':'Expandir jogo');
      button.title=active?'Modo compacto (Alt + Enter)':'Expandir jogo (Alt + Enter)';
      button.querySelector('span').textContent=active?'MINIMIZAR':'EXPANDIR';
      requestAnimationFrame(resize);
    }
    async function toggle(){
      try {
        if(document.fullscreenElement===frame){expanded=false;document.body.classList.remove('game-expanded');await document.exitFullscreen();}
        else if(expanded){expanded=false;document.body.classList.remove('game-expanded');}
        else {expanded=true;document.body.classList.add('game-expanded');if(frame.requestFullscreen)await frame.requestFullscreen();}
      } catch {
        document.body.classList.toggle('game-expanded',expanded);
      }
      sync();
    }
    button.addEventListener('click',toggle);
    document.addEventListener('fullscreenchange',sync);
    window.addEventListener('resize',resize);
    window.addEventListener('keydown',event=>{
      if(event.altKey&&event.key==='Enter'){
        event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)toggle();
      }
    },true);
    document.querySelector('#start-game')?.addEventListener('click',()=>{
      if(expanded&&!document.fullscreenElement&&frame.requestFullscreen)frame.requestFullscreen().catch(()=>{});
    });
    if(window.ResizeObserver)new window.ResizeObserver(resize).observe(canvas);
    sync();
    return {sampleFrame(ms){if(!document.hidden)budget.sampleFrame(ms);},get quality(){return budget.quality;}};
  }
  root.gameRenderResolution=gameRenderResolution;
  root.initGameDisplay=initGameDisplay;
  root.gameSceneViewport=gameSceneViewport;
  root.createRenderBudget=createRenderBudget;
  if(typeof module!=='undefined'&&module.exports)module.exports={gameRenderResolution,gameSceneViewport,createRenderBudget,initGameDisplay};
})(globalThis);
