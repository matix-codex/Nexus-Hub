$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$assembly = Join-Path $PSScriptRoot 'bin\DesktopApps.dll'
if (Test-Path $assembly) { Add-Type -Path $assembly } else { Add-Type -Path (Join-Path $PSScriptRoot 'DesktopApps.cs') }
[Console]::WriteLine('{"ready":true}')
try {
  while ($null -ne ($line = [Console]::ReadLine())) {
    try {
      $request = $line | ConvertFrom-Json; $value = $request.value; $result = $true
      switch ($request.action) {
        'inventory' {
          $apps = @(Get-StartApps)
          $result = @{}
          foreach ($id in @('discord', 'whatsapp', 'spotify')) {
            $found = $apps | Where-Object { $_.Name -match "^$id" } | Select-Object -First 1
            $result[$id] = @{ installed = ($null -ne $found); appId = $found.AppID }
          }
        }
        'state' { $result = [DesktopApps]::State() }
        'attach' { $result = [DesktopApps]::Attach([string]$value.id, [long]$value.parent) }
        'bounds' { [DesktopApps]::Bounds([int]$value.x, [int]$value.y, [int]$value.width, [int]$value.height, [int]$value.parentWidth) }
        'hide' { [DesktopApps]::Hide() }
        'show' { [DesktopApps]::Show() }
        'release' { [DesktopApps]::Release([string]$value) }
        'release-all' { [DesktopApps]::ReleaseAll() }
        default { throw 'Onbekende Windows-appactie.' }
      }
      [Console]::WriteLine((@{ id = $request.id; result = $result } | ConvertTo-Json -Depth 8 -Compress))
    } catch { [Console]::WriteLine((@{ id = $request.id; error = $_.Exception.Message } | ConvertTo-Json -Compress)) }
  }
} finally { [DesktopApps]::ReleaseAll() }
