/* Shelter activities and fatigue, independent of rendering. */
(() => {
  'use strict';
  const recipes={
    flare:{label:'Sinalizador',scrap:3,cloth:1,duration:5},
    bait:{label:'Isca sonora',scrap:2,cloth:0,duration:3},
    bandage:{label:'Bandagem',scrap:0,cloth:2,duration:3}
  };
  function create(){
    let fatigue=0,materials={scrap:4,cloth:4},activity=null;
    function reset(){fatigue=0;materials={scrap:4,cloth:4};activity=null;}
    function cancel(){activity=null;}
    function sleep(){activity={kind:'sleep',elapsed:0};}
    function craft(id){
      const recipe=recipes[id];
      if(!recipe||materials.scrap<recipe.scrap||materials.cloth<recipe.cloth)return false;
      activity={kind:'craft',id,elapsed:0,duration:recipe.duration};return true;
    }
    function update(dt,{safe=false,moving=false,running=false}={}){
      if(!Number.isFinite(dt)||dt<=0)return null;
      if(activity&&(!safe||moving))cancel();
      if(activity?.kind==='sleep'){
        fatigue=Math.max(0,fatigue-dt*5);activity.elapsed+=dt;
        if(fatigue===0){cancel();return 'rested';}
      }else fatigue=Math.min(100,fatigue+dt*(running?.65:.22));
      if(activity?.kind==='craft'){
        activity.elapsed+=dt;
        if(activity.elapsed>=activity.duration){
          const id=activity.id,r=recipes[id];cancel();
          if(materials.scrap<r.scrap||materials.cloth<r.cloth)return null;
          materials.scrap-=r.scrap;materials.cloth-=r.cloth;return id;
        }
      }
      return null;
    }
    return {reset,cancel,sleep,craft,update,recipes,
      get fatigue(){return fatigue;},get materials(){return materials;},get activity(){return activity;},
      get speed(){return 1-fatigue*.003;},get balanceWidth(){return .5-fatigue*.0025;}};
  }
  const api={create,recipes};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.ShelterSurvival=api;
})();
