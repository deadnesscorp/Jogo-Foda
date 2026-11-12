param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
if(-not ('SpriteAtlasBounds' -as [type])) {
  $boundsSource=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'build-sprite-metadata.ps1') -Raw
  $classSource=[regex]::Match($boundsSource,"(?s)TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
  if(-not $classSource){throw 'Sprite bounds helper was not found.'}
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $classSource
}
$file='piloto-moto-angular.png'
$path=Join-Path $ProjectRoot "assets/sprites-128/$file"
if(-not ('MountedComponents' -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Collections.Generic;
public static class MountedComponents {
  public static int[][] Read(string path) {
    using(var image=new Bitmap(path)) {
      int w=image.Width,h=image.Height;
      var opaque=new bool[w*h];var visited=new bool[w*h];var queue=new int[w*h];
      for(int y=0;y<h;y++)for(int x=0;x<w;x++)opaque[y*w+x]=image.GetPixel(x,y).A>32;
      var result=new List<int[]>();
      for(int start=0;start<opaque.Length;start++) {
        if(!opaque[start]||visited[start])continue;
        int first=0,last=0,minX=w,minY=h,maxX=0,maxY=0;queue[last++]=start;visited[start]=true;
        while(first<last) {
          int p=queue[first++],x=p%w,y=p/w;
          minX=Math.Min(minX,x);maxX=Math.Max(maxX,x);minY=Math.Min(minY,y);maxY=Math.Max(maxY,y);
          for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
            int nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
            int n=ny*w+nx;if(opaque[n]&&!visited[n]){visited[n]=true;queue[last++]=n;}
          }
        }
        if(last>300)result.Add(new[]{minX,minY,maxX-minX+1,maxY-minY+1,last});
      }
      return result.ToArray();
    }
  }
}
'@
}
$components=[MountedComponents]::Read($path)
Write-Output "Found $($components.Count) connected sprites."
$frames=@(for($row=0;$row -lt 7;$row++) {
  $rowComponents=@($components | Where-Object { [Math]::Floor(($_[1]+$_[3]/2)/ (887/7)) -eq $row } | Sort-Object {$_[0]+$_[2]/2})
  Write-Host "Row $row : $($rowComponents.Count) sprites"
  if($rowComponents.Count -ne 16){throw "Expected 16 complete sprites in row $row"}
  foreach($component in $rowComponents){,@($component[0],$component[1],$component[2],$component[3])}
})
$image=[Drawing.Bitmap]::new($path)
try {
  if($image.GetPixel(0,0).A -ne 0){throw 'Mounted sheet needs transparency.'}
  $keys=@(0,10,23,40,56,72,80,95,112)
  # Screen headings calibrated against the front/rear tire baseline in the art.
  # The generated turntable is not uniform: source 40 is nearly lateral (100
  # degrees), despite the previous eight-sector mapping assigning 135 degrees.
  # Repeated rear views share a heading rather than creating false turn steps.
  $headingKeys=@(
    @(0,0),@(2,0),@(3,50),@(6,59),@(10,68),@(18,79),@(23,86),
    @(32,88),@(36,93),@(40,100),@(44,116),@(48,118),@(52,140),
    @(56,180),@(60,223),@(64,237),@(68,246),@(72,257),@(76,265),
    @(80,269),@(84,273),@(88,284),@(92,295),@(96,300),@(100,303),
    @(104,308),@(108,360),@(111,360)
  )
  $sourceHeadings=@(for($index=0;$index -lt 112;$index++) {
    $keyIndex=0
    while($keyIndex -lt $headingKeys.Count-2 -and $index -gt $headingKeys[$keyIndex+1][0]){$keyIndex++}
    $first=$headingKeys[$keyIndex];$next=$headingKeys[$keyIndex+1]
    $weight=($index-$first[0])/($next[0]-$first[0])
    ($first[1]+($next[1]-$first[1])*$weight)*[Math]::PI/180
  })
  $contacts=[Collections.Generic.List[object]]::new()
  $lamps=[Collections.Generic.List[object]]::new()
  for($index=0;$index -lt 112;$index++) {
    $segment=0
    while($segment -lt 7 -and $index -gt $keys[$segment+1]){$segment++}
    $angle=($segment+($index-$keys[$segment])/($keys[$segment+1]-$keys[$segment]))*[Math]::PI/4
    $spread=.29*[Math]::Abs([Math]::Sin($angle))
    $contacts.Add(@([SpriteAtlasBounds]::Contact($image,$frames[$index],(.5-$spread)),[SpriteAtlasBounds]::Contact($image,$frames[$index],(.5+$spread))))
    $lamps.Add([SpriteAtlasBounds]::Lamp($image,$frames[$index],$angle))
  }
  $data=[ordered]@{file=$file;width=$image.Width;height=$image.Height;columns=16;rows=7;sourceCount=112;directions=128;directionKeys=$keys;sourceHeadings=$sourceHeadings;frames=$frames;wheelContacts=$contacts.ToArray();headlightAnchors=$lamps.ToArray()}
  $json=ConvertTo-Json -InputObject $data -Depth 8 -Compress
  $encoding=[Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText((Join-Path $ProjectRoot 'assets/sprites-128/piloto-moto-unificado.json'),$json,$encoding)
  [IO.File]::WriteAllText((Join-Path $ProjectRoot 'assets/sprites-128/piloto-moto-unificado.js'),"globalThis.MOUNTED_BIKE_ART=$json;`n",$encoding)
  Write-Output 'Validated 112 unified source sprites, calibrated to 128 game headings.'
} finally {$image.Dispose()}
