$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$source = Join-Path $root 'native/windows-preview'
$build = Join-Path $env:RUNNER_TEMP 'markwriter-explorer-release'
$staging = Join-Path $env:RUNNER_TEMP 'markwriter-explorer-archive'
$installed = Join-Path $env:RUNNER_TEMP 'markwriter-explorer-installed'
$version = (Get-Content -Raw "$root/src-tauri/tauri.conf.json" | ConvertFrom-Json).version
$assets = Join-Path $root 'release-assets'
$results = Join-Path $root 'package-acceptance-results'
$archive = Join-Path $assets "MarkWriter-$version-windows-x64-explorer-preview.zip"
$result = Join-Path $results 'explorer-preview.json'
if (!(Test-Path -LiteralPath $env:MARKWRITER_BINARY -PathType Leaf)) {
    throw 'Install the exact MarkWriter NSIS package before the Explorer test.'
}

cmake -S $source -B $build -A x64
if ($LASTEXITCODE) { throw 'Explorer handler configuration failed.' }
cmake --build $build --config Release
if ($LASTEXITCODE) { throw 'Explorer handler build failed.' }
ctest --test-dir $build -C Release --output-on-failure
if ($LASTEXITCODE) { throw 'Explorer handler tests failed.' }

New-Item -ItemType Directory -Path $staging, $installed | Out-Null
New-Item -ItemType Directory -Force -Path $assets, $results | Out-Null
Copy-Item -LiteralPath "$build/Release/MarkWriterPreview.dll", "$source/install.ps1", "$root/LICENSE" -Destination $staging
$expected = (Get-FileHash -LiteralPath "$staging/MarkWriterPreview.dll" -Algorithm SHA256).Hash
if ((Get-AuthenticodeSignature -LiteralPath "$staging/MarkWriterPreview.dll").Status -ne 'NotSigned') {
    throw 'Expected an unsigned preview DLL from the current CI build.'
}
Compress-Archive -LiteralPath "$staging/MarkWriterPreview.dll", "$staging/install.ps1", "$staging/LICENSE" -DestinationPath $archive
$archiveDigest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Expand-Archive -LiteralPath $archive -DestinationPath $installed
$installer = Join-Path $installed 'install.ps1'
if ((Get-FileHash -LiteralPath $installer).Hash -ne (Get-FileHash -LiteralPath "$source/install.ps1").Hash) {
    throw 'Extracted registration script differs from source.'
}
$dll = Join-Path $installed 'MarkWriterPreview.dll'
& $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -File "$source/explorer-acceptance.ps1" `
    -DllPath $dll -InstallerPath $installer -AppPath $env:MARKWRITER_BINARY -ExpectedSha256 $expected -ResultPath $result
if ($LASTEXITCODE) { throw 'Installed Explorer acceptance failed.' }
$report = Get-Content -Raw -LiteralPath $result | ConvertFrom-Json -AsHashtable
$report.assetSha256 = $archiveDigest
$report.installedSha256 = (Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash.ToLowerInvariant()
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $result -Encoding utf8
node "$root/tools/shell-preview-assets.mjs" explorer $assets $result
if ($LASTEXITCODE) { throw 'Could not record tested Explorer asset provenance.' }
