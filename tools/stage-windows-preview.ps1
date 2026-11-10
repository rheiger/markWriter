$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$build = Join-Path $env:RUNNER_TEMP 'markwriter-bundled-preview'
cmake -S "$root/native/windows-preview" -B $build -A x64 -DMARKWRITER_BUNDLED=ON
if ($LASTEXITCODE) { throw 'Bundled Explorer handler configuration failed.' }
cmake --build $build --config Release
if ($LASTEXITCODE) { throw 'Bundled Explorer handler build failed.' }
ctest --test-dir $build -C Release --output-on-failure
if ($LASTEXITCODE) { throw 'Bundled Explorer handler renderer tests failed.' }
Copy-Item -LiteralPath "$build/Release/MarkWriterPreview.dll" -Destination "$root/src-tauri/windows/MarkWriterPreview.dll"
