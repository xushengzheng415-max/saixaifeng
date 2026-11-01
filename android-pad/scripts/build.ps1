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
if((Test-Path $key) -xor (Test-Path $passwordFile)){throw 'Incomplete signing identity; restore its matching key/password rather than regenerating it.'}
if(!(Test-Path $key)){
  $password=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  ConvertTo-SecureString $password -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile
}else{
  $secure=(Get-Content -LiteralPath $passwordFile -Raw).Trim() | ConvertTo-SecureString
  $password=[Net.NetworkCredential]::new('',$secure).Password
}
try{
  $env:SXF_PAD_SIGN_PASSWORD=$password
  if(!(Test-Path $key)){
    Invoke-Checked (Join-Path $jdk 'bin/keytool.exe') @('-genkeypair','-keystore',$key,'-storetype','PKCS12','-storepass:env','SXF_PAD_SIGN_PASSWORD','-keypass:env','SXF_PAD_SIGN_PASSWORD','-alias','football-pad-preview','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=SXF Football Pad Preview, O=SXF Football, C=CN')
  }
  $apk=Join-Path $release "SxfFootball-Pad-$version-preview.apk"
  Invoke-Checked (Join-Path $jdk 'bin/java.exe') @('-jar',(Join-Path $tools 'lib/apksigner.jar'),'sign','--ks',$key,'--ks-key-alias','football-pad-preview','--ks-pass','env:SXF_PAD_SIGN_PASSWORD','--key-pass','env:SXF_PAD_SIGN_PASSWORD','--out',$apk,(Join-Path $build 'aligned.apk'))
  Invoke-Checked (Join-Path $jdk 'bin/java.exe') @('-jar',(Join-Path $tools 'lib/apksigner.jar'),'verify','--verbose','--print-certs',$apk)
  Invoke-Checked (Join-Path $tools 'aapt2.exe') @('dump','badging',$apk)
  $sha=(Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant()
  "$sha  $([IO.Path]::GetFileName($apk))" | Set-Content -LiteralPath (Join-Path $release 'SHA256SUMS.txt')
  Write-Output "APK: $apk"
}finally{Remove-Item Env:SXF_PAD_SIGN_PASSWORD -ErrorAction SilentlyContinue;$password=$null}
