$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$installed = Split-Path -Parent $env:MARKWRITER_BINARY
$dll = Join-Path $installed 'MarkWriterPreview.dll'
$expected = (Get-FileHash -LiteralPath "$root/src-tauri/windows/MarkWriterPreview.dll" -Algorithm SHA256).Hash
if ((Get-AuthenticodeSignature -LiteralPath $dll).Status -ne 'NotSigned') { throw 'Expected an unsigned bundled preview DLL.' }
$clsid = '{8360D352-56CE-4C43-A12E-A73CF9D10214}'
$server = (Get-Item "HKLM:\Software\Classes\CLSID\$clsid\InprocServer32").GetValue('')
if ($server -ine $dll) { throw 'Installed Preview CLSID does not point to the packaged DLL.' }
$result = Join-Path $root 'package-acceptance-results/explorer-preview.json'
& $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -File "$root/native/windows-preview/explorer-acceptance.ps1" `
    -Bundled -DllPath $dll -AppPath $env:MARKWRITER_BINARY -ExpectedSha256 $expected -ResultPath $result
if ($LASTEXITCODE) { throw 'Installed Explorer acceptance failed.' }
$report = Get-Content -Raw -LiteralPath $result | ConvertFrom-Json -AsHashtable
$version = (Get-Content -Raw "$root/src-tauri/tauri.conf.json" | ConvertFrom-Json).version
$installer = "$root/src-tauri/target/release/bundle/nsis/MarkWriter_${version}_x64-setup.exe"
$report.assetSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$report.installedSha256 = (Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash.ToLowerInvariant()
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $result -Encoding utf8
