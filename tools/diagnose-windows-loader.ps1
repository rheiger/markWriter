# Report missing direct imports when a native test exits before its harness starts.
$ErrorActionPreference = 'Continue'
$vs = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property installationPath
$dumpbin = Get-ChildItem "$vs\VC\Tools\MSVC\*\bin\Hostx64\x64\dumpbin.exe" | Sort-Object FullName | Select-Object -Last 1
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class NativeLoader {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr LoadLibrary(string name);
  [DllImport("kernel32.dll", CharSet=CharSet.Ansi, ExactSpelling=true, SetLastError=true)]
  public static extern IntPtr GetProcAddress(IntPtr module, string name);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
  public static extern uint GetModuleFileName(IntPtr module, StringBuilder name, int size);
}
'@
foreach ($exe in Get-ChildItem 'src-tauri/target/debug/deps/markwriter-*.exe') {
  Write-Output "Checking imports: $($exe.FullName)"
  $module = [IntPtr]::Zero
  foreach ($line in (& $dumpbin.FullName /imports $exe.FullName)) {
    if ($line -match '^\s+([\w.-]+\.dll)\s*$') {
      $dll = $Matches[1]
      $module = [NativeLoader]::LoadLibrary($dll)
      if ($module -eq [IntPtr]::Zero) {
        Write-Output "LOAD FAILED: $dll Win32=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
      } else {
        $path = [Text.StringBuilder]::new(4096)
        [void][NativeLoader]::GetModuleFileName($module, $path, $path.Capacity)
        Write-Output "Loaded $dll from $path"
      }
    } elseif ($module -ne [IntPtr]::Zero -and $line -match '^\s+[0-9A-F]+\s+([?A-Za-z_][^\s]+)\s*$') {
      $name = $Matches[1]
      if ([NativeLoader]::GetProcAddress($module, $name) -eq [IntPtr]::Zero) {
        Write-Output "MISSING EXPORT: $dll!$name"
      }
    }
  }
}
Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Application Popup'; StartTime=(Get-Date).AddMinutes(-15)} -ErrorAction SilentlyContinue | Select-Object -First 5 -ExpandProperty Message
exit 0
