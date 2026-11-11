/* The mounted pose is one painted sprite, with limb occlusion baked into the art. */
function drawMountedRiderPose(painter, art, pose, scale, lean) {
  const {crop,left,top,width,height}=pose;
  painter.save();
  painter.transform(1,0,lean,1,0,0);
  painter.drawImage(art,...crop,left*scale,top*scale,width*scale,height*scale);
  painter.restore();
}

function createMountedRiderAtlas({rider:art,bike,atlas,layout}) {
  const cell=128,unit=2,originX=64,originY=90,data=MOUNTED_BIKE_ART;
  const sheet=document.createElement('canvas');sheet.width=cell*16;sheet.height=cell*8*9;
  const painter=sheet.getContext('2d');painter.imageSmoothingEnabled=false;
  const metadata={file:'unified-mounted-art',width:sheet.width,height:sheet.height,pixelsPerUnit:unit,
    frames:[],wheelContacts:[],headlightAnchors:[],riderAnchors:[],sourceDirections:[],poses:[]};
  for(let direction=0;direction<128;direction++){
    const angle=direction*Math.PI*2/128,segment=Math.floor(direction/16),weight=(direction%16)/16;
    const source=Math.round(data.directionKeys[segment]+(data.directionKeys[segment+1]-data.directionKeys[segment])*weight)%data.sourceCount;
    const [,,sw,sh]=data.frames[source];
    const sourceContacts=data.wheelContacts[source];
    const anchorX=sourceContacts.reduce((sum,p)=>sum+p[0],0)/sourceContacts.length;
    const anchorY=sourceContacts.reduce((sum,p)=>sum+p[1],0)/sourceContacts.length;
    // Keep the whole painted pose at a stable size while changing heading.
    // Matching crop widths made narrow profile sprites jump in scale.
    const scale=36/sh,width=sw*scale,height=sh*scale;
    const left=-anchorX*scale,top=5-anchorY*scale;
    const pose={crop:data.frames[source],left,top:top-5,width,height};
    metadata.poses[direction]=pose;
    const col=(direction%16)*cell,dirRow=Math.floor(direction/16);
    for(let bankPose=0;bankPose<9;bankPose++){
      const row=(bankPose*8+dirRow)*cell,lean=(bankPose-4)*.012*Math.cos(angle);
      painter.save();painter.beginPath();painter.rect(col,row,cell,cell);painter.clip();
      painter.translate(col+originX,row+originY);painter.scale(unit,unit);
      painter.translate(0,5);
      drawMountedRiderPose(painter,art,pose,1,lean);
      painter.restore();
    }
    metadata.frames[direction]=[col,(4*8+dirRow)*cell,cell,cell];
    const point=([x,y])=>[originX+x*unit,originY+y*unit];
    // Contact shadows must touch the tires of this artwork at its current
    // reduced scale, rather than the larger, unmounted motorcycle's anchors.
    metadata.wheelContacts[direction]=sourceContacts.map(([x,y])=>point([left+x*scale,top+y*scale]));
    const [lampX,lampY]=data.headlightAnchors[source];
    metadata.headlightAnchors[direction]=point([left+lampX*scale,top+lampY*scale]);
    metadata.riderAnchors[direction]={hip:point([left+width*.5,top+height*.56]),height:24*unit,rearOffset:3.375*unit};
    metadata.sourceDirections[direction]=source;
  }
  return {sheet,metadata};
}
