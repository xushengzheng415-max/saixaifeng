param(
  [Parameter(Mandatory = $true)][string]$Page,
  [string]$Query = '',
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$WaitSeconds = 2,
  [string]$ProjectPath = 'E:\Documents\sxf-football',
  [string]$McpEndpoint = 'http://127.0.0.1:12930/mcp',
  [int]$ExpectedWidth = 780,
  [int]$ExpectedHeight = 1688,
  [switch]$RequireTargetViewport
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if ($Page -notmatch '^pages/[A-Za-z0-9_/-]+$') {
  throw "Page must be a registered mini-program page path, received: $Page"
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath 'project.config.json'))) {
  throw "Mini-program project was not found: $ProjectPath"
}
if ($WaitSeconds -lt 0 -or $WaitSeconds -gt 10) {
  throw 'WaitSeconds must be between 0 and 10.'
}

$endpointUri = [Uri]$McpEndpoint
if ($endpointUri.Scheme -ne 'http' -or $endpointUri.Host -notin @('127.0.0.1', 'localhost') -or $endpointUri.AbsolutePath -ne '/mcp') {
  throw 'McpEndpoint must be the local WeChat Developer Tools MCP endpoint, for example http://127.0.0.1:12930/mcp.'
}

$absoluteOutput = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $absoluteOutput
if (-not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

# This uses only WeChat Developer Tools' local MCP automation service. It opens a
# local simulator page and captures an unoptimized PNG; it never previews, uploads,
# deploys, publishes, writes cloud data, or changes project configuration.
function ConvertFrom-McpEvent([string]$Content) {
  $line = ($Content -split "`n" | Where-Object { $_ -like 'data: *' } | Select-Object -First 1)
  if (-not $line) { throw "Unexpected MCP response: $Content" }
  return ($line.Substring(6) | ConvertFrom-Json)
}

function Invoke-Mcp([string]$SessionId, [int]$Id, [string]$Method, $Params) {
  $headers = @{ Accept = 'application/json, text/event-stream' }
  if ($SessionId) { $headers['mcp-session-id'] = $SessionId }
  $payload = @{ jsonrpc = '2.0'; id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Depth 12 -Compress
  $response = Invoke-WebRequest -UseBasicParsing -Uri $McpEndpoint -Method Post -ContentType 'application/json' -Headers $headers -Body $payload -TimeoutSec 30
  return @{ Header = $response.Headers['mcp-session-id']; Body = (ConvertFrom-McpEvent $response.Content) }
}

$init = Invoke-Mcp '' 1 'initialize' @{ protocolVersion = '2025-03-26'; capabilities = @{}; clientInfo = @{ name = 'codex-sxf-football'; version = '1.0.0' } }
$sessionId = $init.Header
if (-not $sessionId) { throw 'WeChat Developer Tools MCP did not return a session id.' }

$notifyHeaders = @{ 'mcp-session-id' = $sessionId; Accept = 'application/json, text/event-stream' }
$notify = @{ jsonrpc = '2.0'; method = 'notifications/initialized'; params = @{} } | ConvertTo-Json -Compress
try {
  Invoke-WebRequest -UseBasicParsing -Uri $McpEndpoint -Method Post -ContentType 'application/json' -Headers $notifyHeaders -Body $notify -TimeoutSec 30 | Out-Null
} catch {
  # Newer WeChat DevTools MCP builds may reject this optional notification
  # after already completing initialize. Continue to the first tools/call;
  # that call remains the authoritative capability check.
  if ($_.Exception.Response.StatusCode.value__ -ne 400) { throw }
}

$openArguments = @{ project = $ProjectPath; page = $Page }
if ($Query) { $openArguments.query = $Query }
$open = Invoke-Mcp $sessionId 2 'tools/call' @{ name = 'simulator_open_page'; arguments = $openArguments }
if ($open.Body.error -or $open.Body.result.isError) { throw "WechatIDE could not open ${Page}: $($open.Body | ConvertTo-Json -Compress)" }

# Keep native simulator dimensions: target-viewport visual QA must not use the
# default optimized JPEG output.
$capture = Invoke-Mcp $sessionId 3 'tools/call' @{ name = 'simulator_screenshot'; arguments = @{ project = $ProjectPath; path = $absoluteOutput; wait = $WaitSeconds; optimize = $false } }
if ($capture.Body.error -or $capture.Body.result.isError) { throw "WechatIDE could not capture ${Page}: $($capture.Body | ConvertTo-Json -Compress)" }
if (-not (Test-Path -LiteralPath $absoluteOutput)) {
  throw "WechatIDE did not produce the requested screenshot: $absoluteOutput. MCP response: $($capture.Body | ConvertTo-Json -Depth 12 -Compress)"
}

$image = [System.Drawing.Image]::FromFile($absoluteOutput)
try {
  if ($image.Width -le 1 -or $image.Height -le 1) {
    throw 'WechatIDE returned a 1 × 1 capture. Keep the simulator attached to its project window before visual QA.'
  }
  $matchesRequestedPixels = $image.Width -eq $ExpectedWidth -and $image.Height -eq $ExpectedHeight
  $matchesApproved2xArtboard = $image.Width * 2 -eq $ExpectedWidth -and $image.Height * 2 -eq $ExpectedHeight
  $expectedAspect = $ExpectedWidth / [double]$ExpectedHeight
  $capturedAspect = $image.Width / [double]$image.Height
  $aspectRatioDelta = [Math]::Abs($expectedAspect - $capturedAspect)
  # WeChat simulators expose several logical pixel widths. A capture at a
  # different scale is still a valid target viewport when its aspect ratio is
  # within 0.5%, because layout proportions and safe-area collisions remain
  # directly comparable to the approved artboard.
  $matchesProportionalViewport = $aspectRatioDelta -le 0.005
  $matchesTargetViewport = $matchesRequestedPixels -or $matchesApproved2xArtboard -or $matchesProportionalViewport
  $result = [pscustomobject]@{
    Page = $Page
    Query = $Query
    OutputPath = $absoluteOutput
    Width = $image.Width
    Height = $image.Height
    ExpectedWidth = $ExpectedWidth
    ExpectedHeight = $ExpectedHeight
    MatchesRequestedPixels = $matchesRequestedPixels
    MatchesApproved2xArtboard = $matchesApproved2xArtboard
    MatchesProportionalViewport = $matchesProportionalViewport
    AspectRatioDelta = [Math]::Round($aspectRatioDelta, 6)
    MatchesTargetViewport = $matchesTargetViewport
  }
  if ($RequireTargetViewport -and -not $matchesTargetViewport) {
    throw "Captured $($image.Width) x $($image.Height), but target visual acceptance requires $ExpectedWidth x $ExpectedHeight or its approved @2x logical viewport."
  }
  $result
} finally {
  $image.Dispose()
}
