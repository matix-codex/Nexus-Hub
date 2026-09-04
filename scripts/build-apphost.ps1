$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskSdk = Join-Path $taskRoot '.build\webview2'
$version = '1.0.4191.47'
if (!(Test-Path (Join-Path $taskSdk 'sdk\lib\net462\Microsoft.Web.WebView2.Core.dll'))) {
    New-Item -ItemType Directory -Force $taskSdk | Out-Null
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile (Join-Path $taskSdk 'sdk.zip')
    Expand-Archive -LiteralPath (Join-Path $taskSdk 'sdk.zip') -DestinationPath (Join-Path $taskSdk 'sdk') -Force
}
$target = Join-Path $taskRoot 'native\webview2'
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -LiteralPath (Join-Path $taskSdk 'sdk\lib\net462\Microsoft.Web.WebView2.Core.dll'), (Join-Path $taskSdk 'sdk\lib\net462\Microsoft.Web.WebView2.WinForms.dll'), (Join-Path $taskSdk 'sdk\runtimes\win-x64\native\WebView2Loader.dll'), (Join-Path $taskSdk 'sdk\LICENSE.txt') -Destination $target -Force
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe /platform:x64 /optimize+ "/out:$target\Nexus.AppHost.exe" "/win32manifest:$taskRoot\native\AppHost.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/reference:$target\Microsoft.Web.WebView2.Core.dll" "/reference:$target\Microsoft.Web.WebView2.WinForms.dll" "$taskRoot\native\AppHost.cs"
if ($LASTEXITCODE -ne 0) { throw 'AppHost compileren mislukt.' }
Set-Content -LiteralPath (Join-Path $target 'Nexus.AppHost.exe.config') -Encoding utf8 -Value '<?xml version="1.0"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup></configuration>'
Write-Output "Windows-apphost gebouwd met WebView2 SDK $version."
$bootstrap = Join-Path $target 'MicrosoftEdgeWebview2Setup.exe'
if (!(Test-Path $bootstrap)) { Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrap }
$signature = Get-AuthenticodeSignature -LiteralPath $bootstrap
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'WebView2-installer heeft geen geldige Microsoft-handtekening.' }
