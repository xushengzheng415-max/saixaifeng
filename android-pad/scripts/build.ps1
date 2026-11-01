param([string]$ToolRoot=(Join-Path $env:LOCALAPPDATA 'SxfFootballBuild\android'))
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
[xml]$manifest=Get-Content (Join-Path $projectRoot 'AndroidManifest.xml') -Raw
$version=$manifest.manifest.GetAttribute('versionName','http://schemas.android.com/apk/res/android')
$jdk=(Get-ChildItem (Join-Path $ToolRoot 'jdk17') -Directory | Select-Object -First 1).FullName
$tools=(Get-ChildItem (Join-Path $ToolRoot 'build-tools-35.0.0') -Directory | Select-Object -First 1).FullName
$platform=(Get-ChildItem (Join-Path $ToolRoot 'platforms-android-35') -Directory | Select-Object -First 1).FullName
$androidJar=Join-Path $platform 'android.jar'
foreach($p in @($androidJar,(Join-Path $jdk 'bin/javac.exe'),(Join-Path $tools 'aapt2.exe'))){if(!(Test-Path $p)){throw "Missing build tool: $p"}}
$build=Join-Path $projectRoot 'build'
$release=Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Force -Path $build,$release,(Join-Path $build 'classes'),(Join-Path $build 'dex') | Out-Null
function Invoke-Checked([string]$Exe,[string[]]$Arguments){& $Exe @Arguments;if($LASTEXITCODE -ne 0){throw "Build step failed: $Exe"}}
Invoke-Checked (Join-Path $tools 'aapt2.exe') @('compile','--dir',(Join-Path $projectRoot 'res'),'-o',(Join-Path $build 'resources.zip'))
Invoke-Checked (Join-Path $tools 'aapt2.exe') @('link','-o',(Join-Path $build 'unsigned.apk'),'-I',$androidJar,'--manifest',(Join-Path $projectRoot 'AndroidManifest.xml'),'--auto-add-overlay','-R',(Join-Path $build 'resources.zip'))
$sources=@(Get-ChildItem (Join-Path $projectRoot 'src') -Filter '*.java' -Recurse | ForEach-Object FullName)
Invoke-Checked (Join-Path $jdk 'bin/javac.exe') (@('-encoding','UTF-8','--release','8','-classpath',$androidJar,'-d',(Join-Path $build 'classes'))+$sources)
$classes=@(Get-ChildItem (Join-Path $build 'classes') -Filter '*.class' -Recurse | ForEach-Object FullName)
Invoke-Checked (Join-Path $jdk 'bin/java.exe') (@('-cp',(Join-Path $tools 'lib/d8.jar'),'com.android.tools.r8.D8','--release','--lib',$androidJar,'--min-api','29','--output',(Join-Path $build 'dex'))+$classes)
Invoke-Checked (Join-Path $jdk 'bin/jar.exe') @('uf',(Join-Path $build 'unsigned.apk'),'-C',(Join-Path $build 'dex'),'classes.dex')
Invoke-Checked (Join-Path $tools 'zipalign.exe') @('-f','-p','4',(Join-Path $build 'unsigned.apk'),(Join-Path $build 'aligned.apk'))
# A stable private key outside the repository permits in-place updates. Password is DPAPI-protected.
$signing=Join-Path $env:LOCALAPPDATA 'SxfFootballBuild\signing'
New-Item -ItemType Directory -Force -Path $signing | Out-Null
$key=Join-Path $signing 'football-pad-preview.p12'
$passwordFile=Join-Path $signing 'football-pad-preview.dpapi'
if(!(Test-Path -LiteralPath $key) -or !(Test-Path -LiteralPath $passwordFile)){throw 'Existing Pad signing identity is required; restore its original key/password, never regenerate it for an existing package.'}
$secure=(Get-Content -LiteralPath $passwordFile -Raw).Trim() | ConvertTo-SecureString
$password=[Net.NetworkCredential]::new('',$secure).Password

try{
  $env:SXF_PAD_SIGN_PASSWORD=$password
  $apk=Join-Path $release "SxfFootball-Pad-$version-preview.apk"
  Invoke-Checked (Join-Path $jdk 'bin/java.exe') @('-jar',(Join-Path $tools 'lib/apksigner.jar'),'sign','--ks',$key,'--ks-key-alias','football-pad-preview','--ks-pass','env:SXF_PAD_SIGN_PASSWORD','--key-pass','env:SXF_PAD_SIGN_PASSWORD','--out',$apk,(Join-Path $build 'aligned.apk'))
  Invoke-Checked (Join-Path $jdk 'bin/java.exe') @('-jar',(Join-Path $tools 'lib/apksigner.jar'),'verify','--verbose','--print-certs',$apk)
  Invoke-Checked (Join-Path $tools 'aapt2.exe') @('dump','badging',$apk)
  $sha=(Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant()
  "$sha  $([IO.Path]::GetFileName($apk))" | Set-Content -LiteralPath (Join-Path $release 'SHA256SUMS.txt')
  Write-Output "APK: $apk"
}finally{Remove-Item Env:SXF_PAD_SIGN_PASSWORD -ErrorAction SilentlyContinue;$password=$null}
