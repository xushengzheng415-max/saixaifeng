# 构建平台运营中心 Android 平板客户端（release APK）。
#
# 工具链默认位置（可用环境变量覆盖）：
#   SXF_ANDROID_JDK       JDK 17 根目录
#   SXF_ANDROID_SDK       Android SDK 根目录（含 platforms;android-34、build-tools;34.0.0）
#   SXF_ANDROID_GRADLE    Gradle 可执行文件（默认 <toolchain>\gradle\gradle-8.7\bin\gradle.bat）
#
# 签名材料放在仓库外：默认 %LOCALAPPDATA%\SxfAndroid\keystore 下的 platform-release.jks
# 与 platform-signing.dpapi（Windows DPAPI 加密口令）。口令只在本进程内解出并作为环境变量
# 传给 Gradle，不写入仓库、不打印、不落盘。丢失口令只能重建签名身份，不能覆盖安装。
param(
  [string]$Toolchain = "$env:LOCALAPPDATA\SxfAndroid",
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$jdk = $env:SXF_ANDROID_JDK
if (-not $jdk) {
  $candidate = Get-ChildItem -Path (Join-Path $Toolchain 'jdk') -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if ($candidate) { $jdk = $candidate.FullName }
}
if (-not $jdk -or -not (Test-Path (Join-Path $jdk 'bin\java.exe'))) {
  throw "未找到 JDK 17，请设置 SXF_ANDROID_JDK 或把 JDK 放到 $Toolchain\jdk"
}

$sdk = $env:SXF_ANDROID_SDK
if (-not $sdk) { $sdk = Join-Path $Toolchain 'sdk' }
if (-not (Test-Path (Join-Path $sdk 'platforms\android-34'))) {
  throw "未找到 Android SDK（需要 platforms;android-34），当前：$sdk"
}

$gradle = $env:SXF_ANDROID_GRADLE
if (-not $gradle) {
  $gradle = Get-ChildItem -Path (Join-Path $Toolchain 'gradle') -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'bin\gradle.bat') } |
    Sort-Object Name -Descending |
    Select-Object -First 1 |
    ForEach-Object { Join-Path $_.FullName 'bin\gradle.bat' }
}
if (-not $gradle -or -not (Test-Path $gradle)) {
  throw "未找到 Gradle，请设置 SXF_ANDROID_GRADLE"
}

# 签名身份：keystore 与 DPAPI 口令文件必须成对存在，缺一不可，禁止自动重建（会破坏覆盖安装）。
$keystoreDir = Join-Path $Toolchain 'keystore'
$keystorePath = Join-Path $keystoreDir 'platform-release.jks'
$passwordFile = Join-Path $keystoreDir 'platform-signing.dpapi'
$keyAlias = 'sxfplatform'
if ((Test-Path $keystorePath) -xor (Test-Path $passwordFile)) {
  throw "签名材料不完整：$keystoreDir 下必须同时有 platform-release.jks 与 platform-signing.dpapi，请恢复原签名身份而不是重建"
}
if (Test-Path $keystorePath) {
  $securePwd = (Get-Content -LiteralPath $passwordFile -Raw).Trim() | ConvertTo-SecureString
  $plainPwd = [System.Net.NetworkCredential]::new('', $securePwd).Password
  if (-not $plainPwd) { throw '签名口令解密为空，请检查 DPAPI 文件是否属于当前用户' }
  # PKCS12 keystore 只保存一份口令，keyPassword 与 storePassword 相同。
  $env:SXF_ANDROID_KEYSTORE = $keystorePath
  $env:SXF_ANDROID_KEYSTORE_PASSWORD = $plainPwd
  $env:SXF_ANDROID_KEY_ALIAS = $keyAlias
  $env:SXF_ANDROID_KEY_PASSWORD = $plainPwd
  $plainPwd = $null
  $securePwd = $null
  Write-Output "使用仓库外签名材料：$keystorePath（口令为 DPAPI 加密，仅本进程使用）"
} else {
  Write-Warning "未找到签名材料（$keystoreDir），将构建未签名包，不能用于正式分发"
}

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = (Join-Path $jdk 'bin') + ';' + $env:PATH

Push-Location $root
try {
  if (-not $SkipTests) {
    node (Join-Path $root 'test\config.test.cjs')
    if ($LASTEXITCODE -ne 0) { throw '配置检查未通过' }
  }
  & $gradle ':app:assembleRelease' --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Gradle 构建失败' }
}
finally {
  Pop-Location
  Remove-Item Env:SXF_ANDROID_KEYSTORE,Env:SXF_ANDROID_KEYSTORE_PASSWORD,Env:SXF_ANDROID_KEY_ALIAS,Env:SXF_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
}

$apk = Get-ChildItem -Path (Join-Path $root 'app\build\outputs\apk\release') -Filter '*.apk' | Select-Object -First 1
if (-not $apk) { throw '构建完成但未找到 APK 产物' }
$releaseDir = Join-Path $root 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Copy-Item $apk.FullName (Join-Path $releaseDir $apk.Name) -Force

$hash = (Get-FileHash (Join-Path $releaseDir $apk.Name) -Algorithm SHA256).Hash.ToLower()
Write-Output "APK：$(Join-Path $releaseDir $apk.Name)"
Write-Output "大小：$((Get-Item (Join-Path $releaseDir $apk.Name)).Length) 字节"
Write-Output "SHA-256：$hash"
