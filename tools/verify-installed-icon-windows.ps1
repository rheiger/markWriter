param(
 [Parameter(Mandatory=$true)][string]$Binary,
 [Parameter(Mandatory=$true)][string]$Reference,
 [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
# Windows extracts the executable's native associated icon, as used by Explorer.
# Compare opaque pixels with the generated 32px source. Small rounding tolerance
# accounts for Windows alpha conversion; the transparent margin is not compared.
$icon=[System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path -LiteralPath $Binary).Path)
if(-not $icon){throw 'Native executable associated icon is absent'}
$actual=$icon.ToBitmap()
$expected=[System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Reference).Path)
try {
 if($actual.Width -ne 32 -or $actual.Height -ne 32){throw 'Expected native 32px associated icon'}
 if($expected.Width -ne 32 -or $expected.Height -ne 32){throw 'Expected 32px source reference'}
 $compared=0
 for($y=0;$y -lt 32;$y++){
  for($x=0;$x -lt 32;$x++){
   $e=$expected.GetPixel($x,$y)
   if($e.A -lt 250){continue}
   $a=$actual.GetPixel($x,$y)
   if($a.A -lt 250 -or [Math]::Abs([int]$a.R-$e.R) -gt 3 -or [Math]::Abs([int]$a.G-$e.G) -gt 3 -or [Math]::Abs([int]$a.B-$e.B) -gt 3){throw "Native associated icon differs from MarkWriter reference at $x,$y"}
   $compared++
  }
 }
 if($compared -lt 500){throw 'Insufficient opaque icon pixels compared'}
 $actual.Save([System.IO.Path]::GetFullPath($Output),[System.Drawing.Imaging.ImageFormat]::Png)
 @{verified=$true;method='Windows native ExtractAssociatedIcon';pixelsCompared=$compared;width=$actual.Width;height=$actual.Height;preview=[System.IO.Path]::GetFullPath($Output)} | ConvertTo-Json -Compress
} finally {
 $actual.Dispose();$expected.Dispose();$icon.Dispose()
}
