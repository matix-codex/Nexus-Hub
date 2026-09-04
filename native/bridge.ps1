$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -Path (Join-Path $PSScriptRoot 'Audio.cs')
$script:manager = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $script:asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
} catch { }
function Await-WinRT($operation, $type) {
  $task = $script:asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  if (-not $task.Wait(2500)) { throw 'Media request timed out.' }
  return $task.Result
}
function Get-Session([string]$source = 'windows') {
  if ($null -eq $script:manager) { $script:manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) }
  if ($source -eq 'spotify') { return @($script:manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'spotify' }) | Select-Object -First 1 }
  $session = $script:manager.GetCurrentSession()
  if ($null -ne $session -and $session.SourceAppUserModelId -notmatch 'nexus') { return $session }
  return @($script:manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -notmatch 'nexus' }) | Select-Object -First 1
}
function Get-Media([string]$source = 'windows') {
  try {
    if ($null -eq $script:manager) { $script:manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) }
    $session = Get-Session $source
    if ($null -eq $session) { return $null }
    $properties = Await-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $playback = $session.GetPlaybackInfo()
    $timeline = $session.GetTimelineProperties()
    return @{ title = $properties.Title; artist = $properties.Artist; album = $properties.AlbumTitle; source = $session.SourceAppUserModelId; playing = ($playback.PlaybackStatus.ToString() -eq 'Playing'); position = $timeline.Position.TotalSeconds; duration = $timeline.EndTime.TotalSeconds; canNext = $playback.Controls.IsNextEnabled; canPrevious = $playback.Controls.IsPreviousEnabled; canPlay = $playback.Controls.IsPlayPauseToggleEnabled }
  } catch { $script:manager = $null; return $null }
}
[Console]::WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::ReadLine())) {
  $request = $null
  try {
    $request = $line | ConvertFrom-Json
    $result = $true
    switch ($request.action) {
      'snapshot' { $result = @{ audio = [Nexus.Windows]::GetAudio($false); mic = [Nexus.Windows]::GetAudio($true); network = [Nexus.Windows]::Network(); media = Get-Media; spotify = Get-Media 'spotify' } }
      'volume' { [Nexus.Windows]::SetVolume($false, [double]$request.value) }
      'mute' { [Nexus.Windows]::SetMute($false, [bool]$request.value) }
      'mic' { [Nexus.Windows]::SetMute($true, [bool]$request.value) }
      'media' {
        if ($null -eq $script:manager) { $null = Get-Media }
        if ($null -eq $script:manager) { throw 'Open eerst Spotify of een andere mediaspeler.' }
        $session = Get-Session $request.value.source
        if ($null -eq $session) { throw 'Er is geen actieve mediasessie.' }
        switch ($request.value.action) {
          'toggle' { $op = $session.TryTogglePlayPauseAsync() }
          'next' { $op = $session.TrySkipNextAsync() }
          'previous' { $op = $session.TrySkipPreviousAsync() }
          'pause' { $op = $session.TryPauseAsync() }
          default { throw 'Unknown media command.' }
        }
        $result = Await-WinRT $op ([bool])
        if (-not $result) { throw 'Deze mediaspeler ondersteunt deze bediening niet.' }
      }
      default { throw 'Unknown command.' }
    }
    [Console]::WriteLine((@{ id = $request.id; result = $result } | ConvertTo-Json -Depth 6 -Compress))
  } catch { [Console]::WriteLine((@{ id = $request.id; error = $_.Exception.Message } | ConvertTo-Json -Compress)) }
}
