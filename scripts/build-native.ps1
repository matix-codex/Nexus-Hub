$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$target = Join-Path $taskRoot 'native\bin'
New-Item -ItemType Directory -Force $target | Out-Null
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
foreach ($name in @('DesktopApps', 'RgbSdk')) {
  & $compiler /nologo /target:library /platform:x64 /optimize+ "/out:$target\$name.dll" "$taskRoot\native\$name.cs"
  if ($LASTEXITCODE -ne 0) { throw "$name compileren mislukt." }
}
Write-Output 'Windows-appbeheer en RGB-bridge gebouwd.'
