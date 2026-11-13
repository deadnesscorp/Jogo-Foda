Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
# Reuse the connected-component scanner without rebuilding player assets.
$helper=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'build-walk-metadata.ps1'))
$start=$helper.IndexOf('using System;');$end=$helper.IndexOf("'@",$start)
if($start -lt 0 -or $end -le $start){throw 'Sprite scanner not found'}
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $helper.Substring($start,$end-$start)
$types=@()
foreach($name in @('encoberto','rastejante','coroa')){
  $path=Join-Path $root ('assets\creatures\'+$name+'.png')
  $bitmap=[Drawing.Bitmap]::FromFile($path)
  $width=$bitmap.Width;$height=$bitmap.Height;$bitmap.Dispose()
  $frames=[WalkRegistration]::Measure($path,4,4)
  foreach($frame in $frames){$frame[4]=[int]($frame[2]/2);$frame[5]=$frame[3]-1}
  $bodyHeight=($frames | ForEach-Object {$_[3]} | Measure-Object -Maximum).Maximum
  $types+=@{file=$name+'.png';width=$width;height=[int]$bodyHeight;sheetHeight=$height;frames=$frames}
}
$json=ConvertTo-Json -InputObject @{types=$types} -Depth 7 -Compress
[IO.File]::WriteAllText((Join-Path $root 'assets\creatures\atlas.js'),('const MOSS_CREATURE_ATLAS='+$json+';'),[Text.UTF8Encoding]::new($false))
Write-Output 'Built three moss-creature atlases, 16 poses each.'
