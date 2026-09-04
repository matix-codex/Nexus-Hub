$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$sensors = @(); $sources = @(); $engines = @(); $memory = @()
foreach ($provider in @('LibreHardwareMonitor', 'OpenHardwareMonitor')) {
  try {
    $values = @(Get-CimInstance -Namespace "root\$provider" -ClassName Sensor -OperationTimeoutSec 3 -ErrorAction Stop)
    foreach ($sensor in $values) { if ($null -ne $sensor.Value) { $sensors += @{ name = $sensor.Name; type = $sensor.SensorType; value = $sensor.Value; min = $sensor.Min; max = $sensor.Max; parent = $sensor.Parent; source = $provider } } }
    $sources += @{ name = $provider; available = $true; detail = "$($values.Count) sensoren" }
  } catch { $sources += @{ name = $provider; available = $false; detail = 'Start de sensorapp met WMI ingeschakeld voor extra temperaturen, fans en spanningen.' } }
}
try {
  $engines = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -OperationTimeoutSec 3 | Select-Object Name, UtilizationPercentage)
  $memory = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -OperationTimeoutSec 3 | Select-Object Name, DedicatedUsage, SharedUsage)
  $sources += @{ name = 'Windows GPU-tellers'; available = $true; detail = '3D, copy, video encode/decode en adaptergeheugen' }
} catch { $sources += @{ name = 'Windows GPU-tellers'; available = $false; detail = 'Deze driver publiceert geen GPU-tellers.' } }
@{ sensors = $sensors; sources = $sources; engines = $engines; memory = $memory } | ConvertTo-Json -Depth 6 -Compress
