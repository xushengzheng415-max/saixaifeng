[CmdletBinding()]
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$CloudLauncher = 'E:\Documents\sxf-basketball\tools\sxf-cloud.ps1'
)

$ErrorActionPreference = 'Stop'
$resolvedProject = [IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath (Join-Path $resolvedProject 'AGENTS.md'))) {
  throw "赛小蜂足球正式仓库无效：$resolvedProject"
}
if (-not (Test-Path -LiteralPath $CloudLauncher)) {
  throw "足球 CloudBase 安全启动器不存在：$CloudLauncher"
}

function Get-DomainStatus {
  param([Parameter(Mandatory = $true)][string]$Name)

  $cname = @()
  $addresses = @()
  try {
    $answers = @(Resolve-DnsName -Name $Name -Type CNAME -DnsOnly -ErrorAction Stop)
    $cname = @($answers | Where-Object Type -eq 'CNAME' | ForEach-Object NameHost | Where-Object { $_ })
  } catch {}
  try {
    $answers = @(Resolve-DnsName -Name $Name -Type A -DnsOnly -ErrorAction Stop)
    $addresses = @($answers | Where-Object Type -eq 'A' | ForEach-Object IPAddress | Where-Object { $_ })
  } catch {}

  $httpsStatus = 0
  $httpsError = ''
  try {
    $response = Invoke-WebRequest -Uri "https://$Name/" -Method Get -TimeoutSec 15
    $httpsStatus = [int]$response.StatusCode
  } catch {
    $httpsError = $_.Exception.Message
  }

  [pscustomobject]@{
    name = $Name
    cname = @($cname)
    addresses = @($addresses)
    httpsStatus = $httpsStatus
    httpsReady = $httpsStatus -eq 200
    error = $httpsError
  }
}

$domains = @(
  Get-DomainStatus -Name 'www.sxffootball.cn'
  Get-DomainStatus -Name 'sxffootball.cn'
  Get-DomainStatus -Name 'screen.sxffootball.cn'
)

$apiUrl = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
$probeBody = @{
  action = 'callFunction'
  functionName = 'setHeadReferee'
  functionParams = @{}
} | ConvertTo-Json -Depth 4
$probeResponse = Invoke-WebRequest -Uri $apiUrl -Method Post -ContentType 'application/json' -Body $probeBody -TimeoutSec 30
$probeResult = $probeResponse.Content | ConvertFrom-Json
$headRefereeGateReady = [int]$probeResponse.StatusCode -eq 200 -and $probeResult.code -eq 'AUTH_REQUIRED'

$cloudArgs = @(
  'fn', 'invoke', 'sendRefereeTemplateMessages',
  '--params', '{"action":"configurationStatus"}',
  '--json'
)
$cloudOutput = & $CloudLauncher -Project football -Action run -CloudBaseArgs $cloudArgs 2>&1 6>&1
if ($LASTEXITCODE -ne 0) {
  throw '裁判通知配置状态读取失败。'
}
$cloudText = ($cloudOutput | ForEach-Object { [string]$_ }) -join "`n"
$jsonMarker = "{`n  `"data`": {"
$jsonStart = $cloudText.LastIndexOf($jsonMarker, [StringComparison]::Ordinal)
if ($jsonStart -lt 0) {
  throw '无法解析裁判通知配置状态。'
}
$invokePayload = $cloudText.Substring($jsonStart).Trim() | ConvertFrom-Json
$configuration = ([string]$invokePayload.data.RetMsg) | ConvertFrom-Json

$www = $domains | Where-Object name -eq 'www.sxffootball.cn'
$apex = $domains | Where-Object name -eq 'sxffootball.cn'
$screen = $domains | Where-Object name -eq 'screen.sxffootball.cn'
$result = [pscustomobject]@{
  checkedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')
  environment = 'cloud1-7g8ckb3c7815a011'
  domains = $domains
  headRefereeProbe = [pscustomobject]@{
    httpStatus = [int]$probeResponse.StatusCode
    code = [string]$probeResult.code
    ready = $headRefereeGateReady
  }
  refereeNotification = [pscustomobject]@{
    configured = [bool]$configuration.configured
    missingConfig = @($configuration.missingConfig)
    resultCount = @($configuration.results).Count
  }
  readiness = [pscustomobject]@{
    coreWeb = [bool]($www.httpsReady -and $headRefereeGateReady)
    refereeNotification = [bool]$configuration.configured
    apexCompatibility = [bool]$apex.httpsReady
    screen = [bool]$screen.httpsReady
    full = [bool]($www.httpsReady -and $headRefereeGateReady -and $configuration.configured -and $apex.httpsReady -and $screen.httpsReady)
  }
}

$result | ConvertTo-Json -Depth 8
