$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$registry = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
$programs = @(Get-ItemProperty -Path $registry | Where-Object { $_.DisplayName } | ForEach-Object {
  @{ name = $_.DisplayName; publisher = $_.Publisher; location = $_.InstallLocation; icon = $_.DisplayIcon; key = $_.PSChildName; uninstall = $_.UninstallString }
})
$steam = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam').SteamPath
$protocols = @{}
foreach ($protocolName in @('steam','com.epicgames.launcher','xbox','discord','whatsapp','spotify','rockstargames','uplay','origin2','goggalaxy','battlenet')) { $protocols[$protocolName] = (Test-Path -LiteralPath ('Registry::HKEY_CLASSES_ROOT\' + $protocolName)) }
$apps = @(Get-StartApps | ForEach-Object { @{ name = $_.Name; appId = $_.AppID } })
$gog = @(Get-ItemProperty -Path 'HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games\*', 'HKLM:\SOFTWARE\GOG.com\Games\*' | ForEach-Object { @{ name = $_.gameName; path = $_.path; exe = $_.exe; id = $_.gameID } })
$xbox = @(Get-AppxPackage | Where-Object { $_.SignatureKind -ne 'System' -and $_.InstallLocation } | ForEach-Object {
  $package = $_
  if (Test-Path -LiteralPath (Join-Path $package.InstallLocation 'MicrosoftGame.config')) {
    $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
    foreach ($application in $manifest.Package.Applications.Application) { @{ name = $package.Name; appId = ($package.PackageFamilyName + '!' + $application.Id); location = $package.InstallLocation } }
  }
})
@{ steam = $steam; programs = $programs; startApps = $apps; gog = $gog; xbox = $xbox; protocols = $protocols } | ConvertTo-Json -Depth 5 -Compress
