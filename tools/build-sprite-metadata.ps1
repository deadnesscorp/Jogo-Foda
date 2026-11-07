param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('SpriteAtlasBounds' -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
public static class SpriteAtlasBounds {
  public static int[][] Read(string path) {
    using(var image = new Bitmap(path)) {
      var frames = new int[128][];
      for(int index=0; index<128; index++) {
        int left=(int)Math.Round((index%16)*image.Width/16.0,MidpointRounding.AwayFromZero);
        int right=(int)Math.Round((index%16+1)*image.Width/16.0,MidpointRounding.AwayFromZero);
        int top=(int)Math.Round((index/16)*image.Height/8.0,MidpointRounding.AwayFromZero);
        int bottom=(int)Math.Round((index/16+1)*image.Height/8.0,MidpointRounding.AwayFromZero);
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
$legacy = Get-Content -Raw -Encoding utf8 (Join-Path $ProjectRoot 'assets/moto/direcoes-64.json') | ConvertFrom-Json
$atlas = [ordered]@{directions=128;columns=16;rows=8;stepDegrees=2.8125}
$variants = [ordered]@{bike='moto-128.png';mounted='moto-piloto-128.png';survivor='sobrevivente-128.png'}
foreach ($kind in $variants.Keys) {
  $file = $variants[$kind]
  $path = Join-Path $ProjectRoot "assets/sprites-128/$file"
  $bitmap = [Drawing.Bitmap]::new($path)
  try { $width=$bitmap.Width; $height=$bitmap.Height; $corner=$bitmap.GetPixel(0,0).A } finally { $bitmap.Dispose() }
  if ($corner -ne 0) { throw "Atlas must have real transparency: $file" }
  $frames = [SpriteAtlasBounds]::Read($path)
  $contacts = [Collections.Generic.List[object]]::new()
  $lamps = [Collections.Generic.List[object]]::new()
  for ($direction=0; $direction -lt 128; $direction++) {
    $frame=$frames[$direction]; $sw=$frame[2]; $sh=$frame[3]
    if ($kind -eq 'survivor') {
      $footPoints=[Collections.Generic.List[object]]::new()
      $footPoints.Add(@([Math]::Round($sw/2,2),($sh-2)))
      $contacts.Add($footPoints.ToArray())
      $lamps.Add(@(0,0))
      continue
    }
    $oldIndex=([int][Math]::Round($direction/2))%64
    $oldFrame=$legacy.frames[$oldIndex]
    $points=[Collections.Generic.List[object]]::new()
    if ($kind -eq 'bike') {
      foreach($point in $legacy.wheelContacts[$oldIndex]) {
        $points.Add(@([Math]::Round($point[0]/$oldFrame[2]*$sw,2),[Math]::Round($point[1]/$oldFrame[3]*$sh,2)))
      }
      $oldLamp=$legacy.headlightAnchors[$oldIndex]
      $lamp=@([Math]::Round($oldLamp[0]/$oldFrame[2]*$sw,2),[Math]::Round($oldLamp[1]/$oldFrame[3]*$sh,2))
    } else {
      $bikeFrame=$atlas.bike.frames[$direction]
      $scale=[Math]::Max(.65,[Math]::Min(1.35,$sw/$bikeFrame[2]))
      foreach($point in $atlas.bike.wheelContacts[$direction]) {
        $points.Add(@([Math]::Round($point[0]/$bikeFrame[2]*$sw,2),[Math]::Round($sh-($bikeFrame[3]-$point[1])*$scale,2)))
      }
      $point=$atlas.bike.headlightAnchors[$direction]
      $lamp=@([Math]::Round($point[0]/$bikeFrame[2]*$sw,2),[Math]::Round($sh-($bikeFrame[3]-$point[1])*$scale,2))
    }
    $contacts.Add($points.ToArray());$lamps.Add($lamp)
  }
  $atlas[$kind]=[ordered]@{file=$file;width=$width;height=$height;frames=$frames;wheelContacts=$contacts.ToArray();headlightAnchors=$lamps.ToArray()}
}
$json=ConvertTo-Json -InputObject $atlas -Depth 12 -Compress
$encoding=[Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $ProjectRoot 'assets/sprites-128/atlas.json'),$json,$encoding)
[IO.File]::WriteAllText((Join-Path $ProjectRoot 'assets/sprites-128/atlas.js'),"globalThis.SURVIVOR_ATLAS_128=$json;`n",$encoding)
Write-Output 'Validated 384 nonempty sprite cells, transparent backgrounds, frames and ground/lamp anchors.'
