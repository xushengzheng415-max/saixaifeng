param([string]$ToolRoot=(Join-Path $env:LOCALAPPDATA 'SxfFootballBuild\android'))
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$jdk=(Get-ChildItem (Join-Path $ToolRoot 'jdk17') -Directory | Select-Object -First 1).FullName
$out=Join-Path $projectRoot 'build/policy-test'
New-Item -ItemType Directory -Force -Path $out | Out-Null
& (Join-Path $jdk 'bin/javac.exe') -encoding UTF-8 --release 8 -d $out (Join-Path $projectRoot 'src/cn/sxffootball/pad/ClientPolicy.java') (Join-Path $PSScriptRoot 'ClientPolicyTest.java')
if($LASTEXITCODE -ne 0){throw 'Policy test compilation failed'}
& (Join-Path $jdk 'bin/java.exe') -cp $out ClientPolicyTest
if($LASTEXITCODE -ne 0){throw 'Policy tests failed'}
