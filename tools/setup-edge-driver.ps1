$ErrorActionPreference = 'Stop'
# Match the actual WebView2 runtime, not merely the separately installed Edge browser.
# https://learn.microsoft.com/en-us/microsoft-edge/webdriver/#download-microsoft-edge-webdriver
$roots = @(${env:ProgramFiles(x86)}, $env:ProgramFiles)
$runtime = $roots | ForEach-Object {
    Get-ChildItem "$_/Microsoft/EdgeWebView/Application/*/msedgewebview2.exe" -ErrorAction SilentlyContinue
} | Sort-Object { [version]$_.VersionInfo.ProductVersion } -Descending | Select-Object -First 1
if (!$runtime) { throw 'WebView2 runtime executable not found on this runner' }
$version = $runtime.VersionInfo.ProductVersion
$build = ($version.Split('.')[0..2] -join '.')
Write-Host "WebView2 runtime: $version"
$destination = Join-Path $env:RUNNER_TEMP 'markwriter-edge-driver'
New-Item -ItemType Directory -Force $destination | Out-Null
$archive = Join-Path $destination 'driver.zip'
try {
    Invoke-WebRequest "https://msedgedriver.microsoft.com/$version/edgedriver_win64.zip" -OutFile $archive
} catch {
    # Microsoft sometimes publishes a different fourth version component.
    $metadata = Join-Path $destination 'version.txt'
    Invoke-WebRequest "https://msedgedriver.microsoft.com/LATEST_RELEASE_$($version.Split('.')[0])_WINDOWS" -OutFile $metadata
    $available = [IO.File]::ReadAllText($metadata).Trim()
    if ($available -notmatch '^\d+\.\d+\.\d+\.\d+$' -or ($available.Split('.')[0..2] -join '.') -ne $build) {
        throw "No matching Edge driver for runtime $version; available version is $available"
    }
    Invoke-WebRequest "https://msedgedriver.microsoft.com/$available/edgedriver_win64.zip" -OutFile $archive
}
Expand-Archive $archive -DestinationPath $destination -Force
$driver = Join-Path $destination 'msedgedriver.exe'
$reported = & $driver --version
if ($reported -notmatch '(\d+\.\d+\.\d+)\.\d+' -or $Matches[1] -ne $build) {
    throw "Driver/runtime build mismatch: $reported vs $version"
}
Write-Host $reported
"MARKWRITER_NATIVE_DRIVER=$driver" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
