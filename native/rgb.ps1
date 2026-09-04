param([ValidateSet('msi','icue')][string]$Provider = 'icue', [string]$SdkPath = '')
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$assembly = Join-Path $PSScriptRoot 'bin\RgbSdk.dll'
if (Test-Path $assembly) { Add-Type -Path $assembly } else { Add-Type -Path (Join-Path $PSScriptRoot 'RgbSdk.cs') }
[Console]::WriteLine('{"ready":true}')
try {
  while ($null -ne ($line = [Console]::ReadLine())) {
    try {
      $request = $line | ConvertFrom-Json; $value = $request.value; $result = $true
      switch ($request.action) {
        'status' { $result = [RgbSdk]::Status($Provider, $SdkPath) }
        'apply' { [RgbSdk]::Apply([string]$value.id, [int]$value.r, [int]$value.g, [int]$value.b) }
        default { throw 'Onbekende RGB-actie.' }
      }
      [Console]::WriteLine((@{ id = $request.id; result = $result } | ConvertTo-Json -Depth 8 -Compress))
    } catch { [Console]::WriteLine((@{ id = $request.id; error = $_.Exception.Message } | ConvertTo-Json -Compress)) }
  }
} finally { [RgbSdk]::Stop() }
