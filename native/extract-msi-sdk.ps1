param([string]$Archive, [string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $entry = $zip.GetEntry('Mystic_light_SDK_1.0.0.08/MysticLight_SDK_x64.dll')
  if ($null -eq $entry) { throw 'MSI-download heeft een onverwachte indeling.' }
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $Destination, $true)
} finally { $zip.Dispose() }
