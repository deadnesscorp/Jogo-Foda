param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('SpriteAtlasBounds' -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
public static class SpriteAtlasBounds {
  public static int[][] Forearms(Bitmap image,int[] frame) {
    int w=frame[2],h=frame[3];var mask=new bool[w*h];var seen=new bool[w*h];var queue=new int[w*h];
    var hands=new System.Collections.Generic.List<int[]>();
    for(int y=(int)(h*.65);y<h*.78;y++)for(int x=0;x<w;x++){
      var p=image.GetPixel(frame[0]+x,frame[1]+y);
      mask[y*w+x]=p.A>180&&p.R>205&&p.G>165&&p.B>140&&p.R>p.G*1.02;
    }
    for(int start=0;start<mask.Length;start++){
      if(!mask[start]||seen[start])continue;
      int first=0,last=0,minX=w,minY=h,maxX=0,maxY=0;queue[last++]=start;seen[start]=true;
      while(first<last){
        int p=queue[first++],x=p%w,y=p/w;minX=Math.Min(minX,x);maxX=Math.Max(maxX,x);minY=Math.Min(minY,y);maxY=Math.Max(maxY,y);
        for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
          int nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;int n=ny*w+nx;
          if(mask[n]&&!seen[n]){seen[n]=true;queue[last++]=n;}
        }
      }
      if(last>=8&&maxY-minY>=3)hands.Add(new[]{minX,minY,maxX,maxY,last});
    }
    hands.Sort((a,b)=>b[4].CompareTo(a[4]));
    var result=new System.Collections.Generic.List<int[]>();
    foreach(var hand in hands){
      bool duplicate=false;foreach(var other in result)if(hand[0]<=other[0]+other[2]+3&&hand[2]>=other[0]-3)duplicate=true;
      if(duplicate||result.Count==2)continue;
      int x=Math.Max(0,hand[0]-2),y=Math.Max(0,hand[1]-(int)(h*.10));
      int right=Math.Min(w,hand[2]+3),bottom=Math.Min(h,hand[3]+3);
      result.Add(new[]{x,y,right-x,bottom-y});
    }
    result.Sort((a,b)=>a[0].CompareTo(b[0]));return result.ToArray();
  }
  public static int[][] ReadConnected(string path,int columns,int rows) {
    using(var image=new Bitmap(path)) {
      int w=image.Width,h=image.Height;
      var opaque=new bool[w*h];var seen=new bool[w*h];var queue=new int[w*h];
      var frames=new System.Collections.Generic.List<int[]>();
      for(int y=0;y<h;y++)for(int x=0;x<w;x++)opaque[y*w+x]=image.GetPixel(x,y).A>32;
      for(int start=0;start<opaque.Length;start++){
        if(!opaque[start]||seen[start])continue;
        int first=0,last=0,minX=w,minY=h,maxX=0,maxY=0;queue[last++]=start;seen[start]=true;
        while(first<last){
          int p=queue[first++],x=p%w,y=p/w;
          minX=Math.Min(minX,x);maxX=Math.Max(maxX,x);minY=Math.Min(minY,y);maxY=Math.Max(maxY,y);
          for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
            int nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
            int n=ny*w+nx;if(opaque[n]&&!seen[n]){seen[n]=true;queue[last++]=n;}
          }
        }
        if(last>300)frames.Add(new[]{minX,minY,maxX-minX+1,maxY-minY+1});
      }
      if(frames.Count!=columns*rows)throw new Exception("Expected one complete silhouette per standing pose");
      frames.Sort((a,b)=>{
        int ar=(int)((a[1]+a[3]/2.0)*rows/h),br=(int)((b[1]+b[3]/2.0)*rows/h);
        return ar!=br?ar.CompareTo(br):(a[0]+a[2]/2.0).CompareTo(b[0]+b[2]/2.0);
      });
      return frames.ToArray();
    }
  }
  public static double HeadCenter(Bitmap image,int[] frame) {
    double sum=0,count=0;
    for(int y=(int)(frame[3]*.05);y<frame[3]*.23;y++) for(int x=0;x<frame[2];x++) {
      if(image.GetPixel(frame[0]+x,frame[1]+y).A<180) continue;
      sum+=x;count++;
    }
    return count>0?Math.Round(sum/count,2):frame[2]/2.0;
  }
  public static double[] Contact(Bitmap image,int[] frame,double fraction) {
    int cx=(int)Math.Round(frame[2]*fraction),radius=Math.Max(2,frame[2]/12);
    int bottom=0; double sum=0,count=0;
    for(int y=frame[3]-1;y>=frame[3]*.55;y--) {
      for(int x=Math.Max(1,cx-radius);x<Math.Min(frame[2]-1,cx+radius+1);x++) {
        Color p=image.GetPixel(frame[0]+x,frame[1]+y);
        if(p.A<180 || Math.Max(p.R,Math.Max(p.G,p.B))>115) continue;
        if(bottom==0) bottom=y;
        if(y>=bottom-1) {sum+=x;count++;}
      }
      if(bottom>0 && y<bottom-1) break;
    }
    return new[]{count>0?Math.Round(sum/count,2):cx,(double)(bottom>0?bottom:frame[3]-2)};
  }
  public static double[] Lamp(Bitmap image,int[] frame,double angle) {
    double xsum=0,ysum=0,count=0;
    for(int y=0;y<frame[3]*.8;y++) for(int x=0;x<frame[2];x++) {
      Color p=image.GetPixel(frame[0]+x,frame[1]+y);
      if(p.A>180 && p.R>185 && p.G>115 && p.G<p.R*.94 && p.B<p.G*.72) {
        xsum+=x;ysum+=y;count++;
      }
    }
    return count>0?new[]{Math.Round(xsum/count,2),Math.Round(ysum/count,2)}:
      new[]{Math.Round(frame[2]*(.5+.34*Math.Sin(angle)),2),Math.Round(frame[3]*.4,2)};
  }
  public static int[][] Read(string path,int columns,int rows) {
    using(var image = new Bitmap(path)) {
      var frames = new int[columns*rows][];
      for(int index=0; index<frames.Length; index++) {
        int left=(int)Math.Round((index%columns)*image.Width/(double)columns,MidpointRounding.AwayFromZero);
        int right=(int)Math.Round((index%columns+1)*image.Width/(double)columns,MidpointRounding.AwayFromZero);
        int top=(int)Math.Round((index/columns)*image.Height/(double)rows,MidpointRounding.AwayFromZero);
        int bottom=(int)Math.Round((index/columns+1)*image.Height/(double)rows,MidpointRounding.AwayFromZero);
        int minX=right,minY=bottom,maxX=left-1,maxY=top-1;
        for(int y=top;y<bottom;y++) for(int x=left;x<right;x++) {
          if(image.GetPixel(x,y).A<32) continue;
          minX=Math.Min(minX,x);maxX=Math.Max(maxX,x);
          minY=Math.Min(minY,y);maxY=Math.Max(maxY,y);
        }
        if(maxX<minX) throw new Exception("Empty sprite cell: "+index+" in "+path);
        minX=Math.Max(left,minX-1);minY=Math.Max(top,minY-1);
        maxX=Math.Min(right-1,maxX+1);maxY=Math.Min(bottom-1,maxY+1);
        frames[index]=new[]{minX,minY,maxX-minX+1,maxY-minY+1};
      }
      return frames;
    }
  }
}
'@
}
# Actual cardinal/intercardinal views in the generated sheets, verified visually.
# These sheets do not advance by a uniform angle and contain repeated rear views.
$directionKeys = @{
  bike=@(0,12,30,45,57,72,88,101,110)
  survivor=@(0,12,20,40,64,72,80,96,128)
}
$atlas = [ordered]@{directions=128;columns=16;rows=8;stepDegrees=2.8125}
$variants = [ordered]@{bike='moto-128.png';survivor='sobrevivente-parado-128.png'}
foreach ($kind in $variants.Keys) {
  $file = $variants[$kind]
  $path = Join-Path $ProjectRoot "assets/sprites-128/$file"
  $bitmap = [Drawing.Bitmap]::new($path)
  try { $width=$bitmap.Width; $height=$bitmap.Height; $corner=$bitmap.GetPixel(0,0).A } finally { $bitmap.Dispose() }
  if ($corner -ge 32) { throw "Atlas must have real transparency: $file" }
  $columns=16;$rows=8

  $frames = if($kind -eq 'survivor') {
    [SpriteAtlasBounds]::ReadConnected($path,$columns,$rows)
  } else {
    [SpriteAtlasBounds]::Read($path,$columns,$rows)
  }
  $contacts = [Collections.Generic.List[object]]::new()
  $lamps = [Collections.Generic.List[object]]::new()
  $forearms = [Collections.Generic.List[object]]::new()
  $bitmap = [Drawing.Bitmap]::new($path)
  try {
  for ($direction=0; $direction -lt $frames.Length; $direction++) {
    $frame=$frames[$direction]; $sw=$frame[2]; $sh=$frame[3]
    if ($kind -eq 'survivor') {
      $footPoints=[Collections.Generic.List[object]]::new()
      $footPoints.Add(@([Math]::Round($sw/2,2),($sh-2)))
      $contacts.Add($footPoints.ToArray())
      $lamps.Add(@(0,0))
      $forearms.Add([SpriteAtlasBounds]::Forearms($bitmap,$frame))
      continue
    }
    $keys=$directionKeys[$kind];$segment=0
    while($segment -lt 7 -and $direction -gt $keys[$segment+1]) { $segment++ }
    $phase=[Math]::Min(1,($direction-$keys[$segment])/($keys[$segment+1]-$keys[$segment]))
    $angle=($segment+$phase)*[Math]::PI/4
    $points=[Collections.Generic.List[object]]::new()
    if([Math]::Abs([Math]::Sin($angle)) -lt .22) {
      $points.Add([SpriteAtlasBounds]::Contact($bitmap,$frame,.5))
    } else {
      $points.Add([SpriteAtlasBounds]::Contact($bitmap,$frame,(.5-.35*[Math]::Sin($angle))))
      $points.Add([SpriteAtlasBounds]::Contact($bitmap,$frame,(.5+.35*[Math]::Sin($angle))))
    }
    $lamp=[SpriteAtlasBounds]::Lamp($bitmap,$frame,$angle)
    $contacts.Add($points.ToArray());$lamps.Add($lamp)
  }
  } finally { $bitmap.Dispose() }
  $sources=@(for($direction=0;$direction -lt 128;$direction++) {
    $segment=[int][Math]::Floor($direction/16);$weight=($direction%16)/16
    $keys=$directionKeys[$kind]
    $source=[int][Math]::Round($keys[$segment]+($keys[$segment+1]-$keys[$segment])*$weight)
    if($kind -eq 'survivor'){$source%128}else{$source}
  })
  $atlas[$kind]=[ordered]@{file=$file;width=$width;height=$height;columns=$columns;rows=$rows;sourceDirections=$sources;
    frames=@($sources | ForEach-Object { ,$frames[$_] });
    wheelContacts=@($sources | ForEach-Object { ,$contacts[$_] });
    headlightAnchors=@($sources | ForEach-Object { ,$lamps[$_] })}
  if($kind -eq 'survivor') { $atlas[$kind]['forearms']=@($sources | ForEach-Object { ,$forearms[$_] }); $atlas[$kind]['idleDirections']=128; $atlas[$kind]['palette']=[ordered]@{sleeve='#3d4037';trousers='#30322e';boot='#20221f';glove='#302a22';tape='#a7977b';patch='#77705e'} }
}
$atlas.survivor['walk']=ConvertFrom-Json -InputObject '{"directions":8,"frameCount":24,"fps":30,"playbackFps":9.0909090909090917,"pingPong":false,"walkFrames":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23],"walkOrder":[[0,1,2,3,5,4,6,7,8,9,10,11,12,13,14,15,17,16,18,19,20,21,23,22],[0,1,2,3,4,5,6,7,8,9,10,11,12,14,13,15,17,16,18,20,19,21,23,22],[0,1,2,3,5,4,6,8,7,9,11,10,12,13,14,15,16,17,18,20,19,21,22,23],[0,1,2,3,4,5,6,8,7,9,10,11,12,13,14,15,17,16,18,20,19,21,23,22],[0,1,2,3,4,5,6,8,7,9,10,11,12,14,13,15,16,17,18,20,19,21,22,23],[0,1,2,3,4,5,6,8,7,9,11,10,12,13,14,15,16,17,18,20,19,21,23,22],[0,1,2,3,5,4,6,8,7,9,11,10,12,13,14,15,16,17,18,20,19,21,23,22],[0,1,2,3,4,5,6,8,7,9,10,11,12,14,13,15,17,16,18,20,19,21,23,22]],"runFrames":[0,2,3,5,6,8,9,11,12,14,15,17,18,20,21,23]}'
$json=ConvertTo-Json -InputObject $atlas -Depth 12 -Compress
$encoding=[Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $ProjectRoot 'assets/sprites-128/atlas.json'),$json,$encoding)
[IO.File]::WriteAllText((Join-Path $ProjectRoot 'assets/sprites-128/atlas.js'),"globalThis.SURVIVOR_ATLAS_128=$json;`n",$encoding)
Write-Output 'Validated motorcycle and standing character sprites.'
