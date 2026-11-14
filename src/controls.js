'use strict';

const controlsPanel=document.querySelector('#controls-panel');
const controlsButton=document.querySelector('#show-controls');
function setControlsOpen(open){controlsPanel.hidden=!open;controlsButton.setAttribute('aria-expanded',String(open));}
controlsButton.addEventListener('click',()=>setControlsOpen(controlsPanel.hidden));
document.querySelector('#close-controls').addEventListener('click',()=>{setControlsOpen(false);controlsButton.focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!controlsPanel.hidden)setControlsOpen(false);});
