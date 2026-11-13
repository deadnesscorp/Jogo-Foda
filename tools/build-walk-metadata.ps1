Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Collections.Generic;
public static class WalkRegistration {
  public static int[][] Measure(string path,int columns,int rows) {
    using(var image=new Bitmap(path)) {
      var frames=new List<int[]>();
      for(int row=0;row<rows;row++)for(int col=0;col<columns;col++) {
        int x0=(int)Math.Round(col*image.Width/(double)columns),x1=(int)Math.Round((col+1)*image.Width/(double)columns);
        int y0=(int)Math.Round(row*image.Height/(double)rows),y1=(int)Math.Round((row+1)*image.Height/(double)rows);
        int w=x1-x0,h=y1-y0;var seen=new bool[w*h];var best=new List<int>();
        for(int i=0;i<w*h;i++) {
          if(seen[i]||image.GetPixel(x0+i%w,y0+i/w).A<96)continue;
          var component=new List<int>();var queue=new Queue<int>();queue.Enqueue(i);seen[i]=true;
          while(queue.Count>0) {
            int p=queue.Dequeue();component.Add(p);int x=p%w,y=p/w;
            for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
              int nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
              int n=ny*w+nx;if(seen[n])continue;seen[n]=true;
              if(image.GetPixel(x0+nx,y0+ny).A>=96)queue.Enqueue(n);
            }
          }
          if(component.Count>best.Count)best=component;
        }
        if(best.Count<500)throw new Exception("Missing walk pose");
        int left=w,right=0,top=h,bottom=0;
        foreach(int p in best){left=Math.Min(left,p%w);right=Math.Max(right,p%w);top=Math.Min(top,p/w);bottom=Math.Max(bottom,p/w);}
        // Register to the helmet, not to a silhouette altered by swinging limbs.
        int headLeft=w,headRight=0;
        double headStart=columns==8?10:(bottom-top)*.07,headEnd=columns==8?32:(bottom-top)*.23;
        foreach(int p in best)if(p/w>=top+headStart&&p/w<=top+headEnd){headLeft=Math.Min(headLeft,p%w);headRight=Math.Max(headRight,p%w);}
        frames.Add(new[]{x0+left,y0+top,right-left+1,bottom-top+1,(headLeft+headRight)/2-left,136});
      }
      return frames.ToArray();
    }
  }
}
'@
$root=Split-Path $PSScriptRoot -Parent
$frames=[WalkRegistration]::Measure((Join-Path $root 'assets\sprites-128\sobrevivente-caminhada-8-v4.png'),8,8)
$json=ConvertTo-Json -InputObject $frames -Depth 5 -Compress
$output='const SURVIVOR_WALK_V2={file:"sobrevivente-caminhada-8-v4.png",height:140,frames:'+$json+'};'
$rightFrames=[WalkRegistration]::Measure((Join-Path $root 'assets\sprites-128\sobrevivente-caminhada-d-16.png'),4,4)
$rightHeight=($rightFrames | ForEach-Object { $_[3] } | Measure-Object -Maximum).Maximum
foreach($frame in $rightFrames){$frame[5]=[int]$rightHeight-4}
$rightJson=ConvertTo-Json -InputObject $rightFrames -Depth 5 -Compress
$output+="`n"+'const SURVIVOR_WALK_D={file:"sobrevivente-caminhada-d-16.png",height:'+$rightHeight+',frames:'+$rightJson+'};'
[IO.File]::WriteAllText((Join-Path $root 'assets\sprites-128\caminhada-8-v2.js'),$output,[Text.UTF8Encoding]::new($false))
Write-Output ('Registered '+$frames.Count+' walk frames to helmet anchors.')
