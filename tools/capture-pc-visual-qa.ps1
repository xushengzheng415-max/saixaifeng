param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$Width = 1440,
  [int]$Height = 1000,
  [int]$DelayMs = 8000,
  [int]$Port = 9333,
  [double]$DeviceScaleFactor = 1,
  [switch]$FullPage,
  [string]$ClickText = '',
  [string]$EvaluateExpression = ''
)

$ErrorActionPreference = 'Stop'
$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edgePath)) { throw "Microsoft Edge not found: $edgePath" }

$repoRoot = Split-Path -Parent $PSScriptRoot
$profileRoot = Join-Path $repoRoot ".tmp\pc-visual-qa-cdp-$Port"
$resolvedRepo = [IO.Path]::GetFullPath($repoRoot)
$resolvedProfile = [IO.Path]::GetFullPath($profileRoot)
if (-not $resolvedProfile.StartsWith($resolvedRepo, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe browser profile path.' }
if (-not (Test-Path -LiteralPath $profileRoot)) { New-Item -ItemType Directory -Path $profileRoot | Out-Null }

$outputDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($OutputPath))
if (-not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory | Out-Null }

$edgeProcess = $null
$socket = $null
$commandId = 0

function Send-CdpCommand {
  param([string]$Method, [hashtable]$Params = @{})
  $script:commandId += 1
  $payload = @{ id = $script:commandId; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 20
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $socket.SendAsync($segment, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null

  while ($true) {
    $stream = [IO.MemoryStream]::new()
    do {
      $buffer = New-Object byte[] 65536
      $receiveSegment = [ArraySegment[byte]]::new($buffer)
      $result = $socket.ReceiveAsync($receiveSegment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'CDP socket closed before a response was received.' }
      $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    if ($message.method -eq 'Runtime.exceptionThrown') {
      Write-Output "QA_EXCEPTION=$($message.params.exceptionDetails.text): $($message.params.exceptionDetails.exception.description)"
    }
    if ($message.method -eq 'Runtime.consoleAPICalled' -and $message.params.type -eq 'error') {
      Write-Output "QA_CONSOLE_ERROR=$($message.params.args | ForEach-Object { if ($_.value) { $_.value } else { $_.description } })"
    }
    if ($message.id -eq $script:commandId) {
      if ($message.error) { throw "CDP $Method failed: $($message.error.message)" }
      return $message.result
    }
  }
}

try {
  $arguments = @(
    '--headless=new',
    '--hide-scrollbars',
    '--no-first-run',
    '--disable-extensions',
    "--remote-debugging-port=$Port",
    "--user-data-dir=$profileRoot",
    'about:blank'
  )
  $edgeProcess = Start-Process -FilePath $edgePath -ArgumentList $arguments -PassThru -WindowStyle Hidden

  $targets = $null
  for ($attempt = 0; $attempt -lt 50 -and -not $targets; $attempt += 1) {
    try { $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 200 }
  }
  $page = @($targets) | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
  if (-not $page.webSocketDebuggerUrl) { throw 'Unable to obtain the Edge DevTools page target.' }

  $socket = [Net.WebSockets.ClientWebSocket]::new()
  $socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
  Send-CdpCommand -Method 'Page.enable' | Out-Null
  Send-CdpCommand -Method 'Runtime.enable' | Out-Null
  Send-CdpCommand -Method 'Page.bringToFront' | Out-Null
  Send-CdpCommand -Method 'Emulation.setDeviceMetricsOverride' -Params @{ width = $Width; height = $Height; deviceScaleFactor = $DeviceScaleFactor; mobile = $false } | Out-Null
  Send-CdpCommand -Method 'Page.navigate' -Params @{ url = $Url } | Out-Null
  # Hash-only Vue routes otherwise retain the previously mounted page instance in the shared CDP tab.
  # Reload after navigation so every visual-QA capture evaluates its current route and fixtures anew.
  Start-Sleep -Milliseconds 700
  Send-CdpCommand -Method 'Page.reload' -Params @{ ignoreCache = $true } | Out-Null
  Start-Sleep -Milliseconds $DelayMs
  Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "window.scrollTo(0,0);document.scrollingElement.scrollTop=0;document.querySelectorAll('*').forEach(e=>{const s=getComputedStyle(e);if(/(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight)e.scrollTop=0})"; returnByValue = $true } | Out-Null
  Start-Sleep -Milliseconds 150
  if ($ClickText) {
    $clickTextJson = $ClickText | ConvertTo-Json -Compress
    $clickDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const norm=v=>String(v||'').replace(/\\s+/g,' ').trim();const text=norm($clickTextJson);const controls=[...document.querySelectorAll('button,a,[role=button]')];const label=node=>norm(node.innerText||node.textContent||node.getAttribute('aria-label'));const element=controls.find(node=>label(node)===text)||controls.find(node=>label(node).includes(text));if(!element)return JSON.stringify({state:'not-found',text,labels:controls.map(label).filter(Boolean).slice(0,60)});element.scrollIntoView({block:'center',inline:'center'});const rect=element.getBoundingClientRect();return JSON.stringify({state:'found',disabled:Boolean(element.disabled),ariaDisabled:element.getAttribute('aria-disabled'),className:element.className,x:rect.left+rect.width/2,y:rect.top+rect.height/2})})()"; returnByValue = $true }
    $clickValue = $clickDiagnostic.result.value
    $clickTarget = $clickValue | ConvertFrom-Json
    if ($clickTarget.state -eq 'found') {
      Send-CdpCommand -Method 'Input.dispatchMouseEvent' -Params @{ type = 'mousePressed'; x = $clickTarget.x; y = $clickTarget.y; button = 'left'; clickCount = 1 } | Out-Null
      Send-CdpCommand -Method 'Input.dispatchMouseEvent' -Params @{ type = 'mouseReleased'; x = $clickTarget.x; y = $clickTarget.y; button = 'left'; clickCount = 1 } | Out-Null
      $clickValue = "clicked:$($clickValue)"
      Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const instance=document.querySelector('.referee-workbench')?.__vueParentComponent;instance?.proxy?.`$forceUpdate?.();return Boolean(instance)})()"; returnByValue = $true } | Out-Null
    }
    Write-Output "QA_CLICK=$clickValue"
    Start-Sleep -Milliseconds 1600
    if ($clickValue -like 'clicked:*') {
      $confirmDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const dialog=document.querySelector('.el-message-box');const button=dialog?.querySelector('.el-message-box__btns .el-button--primary');if(!button)return 'no-confirm';button.click();return 'confirmed'})()"; returnByValue = $true }
      Write-Output "QA_CONFIRM=$($confirmDiagnostic.result.value)"
      if ($confirmDiagnostic.result.value -eq 'confirmed') { Start-Sleep -Milliseconds 1600 }
    }
  }
  if ($EvaluateExpression) {
    $evaluation = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = $EvaluateExpression; awaitPromise = $true; returnByValue = $true }
    Write-Output "QA_EVALUATE=$($evaluation.result.value)"
    Start-Sleep -Milliseconds 1200
  }
  $dialogDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>JSON.stringify({dialogs:[...document.querySelectorAll('.el-dialog,.el-overlay,.el-dialog__wrapper')].map(node=>({className:node.className,text:node.innerText.slice(0,300),display:getComputedStyle(node).display,visible:node.offsetParent!==null})),workbench:document.querySelector('.referee-workbench')?.__vueParentComponent?.setupState?.assignDialog}))()"; returnByValue = $true }
  Write-Output "QA_DIALOG=$($dialogDiagnostic.result.value)"
  $diagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "JSON.stringify({href:location.href,session:sessionStorage.getItem('sxfVisualQa'),local:localStorage.getItem('sxfVisualQa'),snapshotId:window.__sxfVisualQaSnapshot?.tournament?._id||null,snapshotDraw:Boolean(window.__sxfVisualQaSnapshot?.tournament?.professionalDrawConfigs)})"; returnByValue = $true }
  Write-Output "QA_BROWSER=$($diagnostic.result.value)"
  $fixtureDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "import('/admin/src/utils/visualQaFixtures.js').then(m=>{const sample=m.handleVisualQaHttp('dbQuery',{collection:'tournaments',operation:'get',id:'qa-tournament-2026'});const snapshot=m.getVisualQaSnapshot();return JSON.stringify({active:m.visualQaActive(),sampleId:sample.result?.data?._id||null,drawConfig:Boolean(sample.result?.data?.professionalDrawConfigs),players:snapshot.players?.length||0})})"; awaitPromise = $true; returnByValue = $true }
  Write-Output "QA_FIXTURE=$($fixtureDiagnostic.result.value)"
  $cloudDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "import('/admin/src/utils/cloud.js').then(m=>m.queryById('tournaments','qa-tournament-2026')).then(value=>JSON.stringify({id:value?._id||null,drawConfig:Boolean(value?.professionalDrawConfigs)}))"; awaitPromise = $true; returnByValue = $true }
  Write-Output "QA_CLOUD=$($cloudDiagnostic.result.value)"
  $appRouteDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const route=document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.`$route;return JSON.stringify({params:route?.params||null,query:route?.query||null,path:route?.path||null})})()"; returnByValue = $true }
  Write-Output "QA_APP_ROUTE=$($appRouteDiagnostic.result.value)"
  $parallelDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "import('/admin/src/utils/cloud.js').then(m=>Promise.all([m.queryById('tournaments','qa-tournament-2026'),m.queryList('divisions',{where:{tournamentId:'qa-tournament-2026'}}),m.queryList('tournament_teams',{where:{tournamentId:'qa-tournament-2026'}})])).then(value=>JSON.stringify([value[0]?._id,value[1].length,value[2].length]))"; awaitPromise = $true; returnByValue = $true }
  Write-Output "QA_PARALLEL=$($parallelDiagnostic.result.value)"
  $networkDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "JSON.stringify(performance.getEntriesByType('resource').map(item=>item.name).filter(name=>name.includes('visualQaFixtures')||name.includes('ProfessionalDrawFlow')||name.includes('ProfessionalTournamentRoster')||name.includes('TournamentDraw')))"; returnByValue = $true }
  Write-Output "QA_NETWORK=$($networkDiagnostic.result.value)"
  $rosterDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const state=document.querySelector('.professional-roster')?.__vueParentComponent?.setupState;return JSON.stringify(state?{rows:state.rows?.length,team:state.team?.name,tournament:state.tournament?.name,division:state.divisionId,error:window.__sxfRosterQaError||null}:null)})()"; returnByValue = $true }
  Write-Output "QA_ROSTER=$($rosterDiagnostic.result.value)"
  $teamDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const state=document.querySelector('.tournament-teams-page')?.__vueParentComponent?.setupState;return JSON.stringify(state?{inviteOpen:state.showInviteDialog,available:state.availableTeamsToInvite?.length,slots:state.availableSlots}:null)})()"; returnByValue = $true }
  Write-Output "QA_TEAMS=$($teamDiagnostic.result.value)"
  $refereeDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const state=document.querySelector('.referee-workbench')?.__vueParentComponent?.setupState;return JSON.stringify(state?{tournaments:state.tournaments?.length,referees:state.referees?.length,matches:state.matches?.length,selectedTournamentId:state.selectedTournamentId,loading:state.loading}:null)})()"; returnByValue = $true }
  Write-Output "QA_REFEREE=$($refereeDiagnostic.result.value)"
  $refereeDomDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const root=document.querySelector('.referee-workbench');const state=root?.__vueParentComponent?.setupState;const get=v=>({kind:typeof v,isRef:Boolean(v?.__v_isRef),value:v?.value,length:v?.length,text:String(v?.value ?? v)});return JSON.stringify({html:root?.querySelector('.stats')?.innerText||null,referees:get(state?.referees),tournaments:get(state?.tournaments),available:get(state?.availableCount),tournament:get(state?.tournament)})})()"; returnByValue = $true }
  Write-Output "QA_REFEREE_DOM=$($refereeDomDiagnostic.result.value)"
  $refereeInstanceDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const root=document.querySelector('.referee-workbench');const i=root?.__vueParentComponent;const render=String(i?.render||'');const at=render.indexOf('referees');return JSON.stringify({file:i?.type?.__file,props:i?.props,ctxKeys:Object.keys(i?.ctx||{}),subTreeText:i?.subTree?.el?.innerText?.slice(0,240),renderSlice:render.slice(Math.max(0,at-250),at+1000)})})()"; returnByValue = $true }
  Write-Output "QA_REFEREE_INSTANCE=$($refereeInstanceDiagnostic.result.value)"
  $rosterTableDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const table=document.querySelector('.professional-roster .el-table');const row=table?.querySelector('tbody tr');const box=e=>e?{text:e.innerText,rect:e.getBoundingClientRect().toJSON(),display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity,height:getComputedStyle(e).height}:null;return JSON.stringify({table:box(table),row:box(row),html:row?.innerHTML.slice(0,500)||null})})()"; returnByValue = $true }
  Write-Output "QA_ROSTER_TABLE=$($rosterTableDiagnostic.result.value)"
  $domDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "JSON.stringify({pre:document.querySelector('pre')?.innerText||null,heading:document.querySelector('.tournament-context h1')?.innerText||null,tableRows:document.querySelectorAll('.el-table__body-wrapper tbody tr').length,tableHtml:document.querySelector('.teams-data-table')?.innerHTML.slice(0,1200)||null,overlays:[...document.querySelectorAll('.el-overlay')].map(node=>({display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility,text:node.innerText.slice(0,180)})),body:document.body.innerText.slice(-300)})"; returnByValue = $true }
  Write-Output "QA_DOM=$($domDiagnostic.result.value)"
  $layoutDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "(()=>{const section=document.querySelector('.overview-table')||document.querySelector('.table-card')||document.querySelector('.teams-table-panel');const q=s=>section?.querySelector(s);const table=q('.el-table');const body=q('.el-table__body-wrapper');const inner=q('.el-table__inner-wrapper');const header=q('.el-table__header-wrapper');const tbody=q('tbody');const row=q('tbody tr');const heading=document.querySelector('.teams-page-heading');const toolbar=document.querySelector('.division-toolbar');const tabs=document.querySelector('.team-work-tabs');const summary=document.querySelector('.team-summary-grid');const box=e=>e?{rect:e.getBoundingClientRect().toJSON(),height:getComputedStyle(e).height,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity,overflow:getComputedStyle(e).overflow,position:getComputedStyle(e).position,zIndex:getComputedStyle(e).zIndex,scrollHeight:e.scrollHeight}:null;return JSON.stringify({section:box(section),table:box(table),inner:box(inner),header:box(header),body:box(body),tbody:box(tbody),row:box(row),heading:box(heading),toolbar:box(toolbar),tabs:box(tabs),summary:box(summary)})})()"; returnByValue = $true }
  Write-Output "QA_LAYOUT=$($layoutDiagnostic.result.value)"
  $viewportDiagnostic = Send-CdpCommand -Method 'Runtime.evaluate' -Params @{ expression = "JSON.stringify({innerWidth:window.innerWidth,innerHeight:window.innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth})"; returnByValue = $true }
  Write-Output "QA_VIEWPORT=$($viewportDiagnostic.result.value)"
  Start-Sleep -Milliseconds 2000
  if ($FullPage) {
    $metrics = Send-CdpCommand -Method 'Page.getLayoutMetrics'
    $contentSize = $metrics.cssContentSize
    $capture = Send-CdpCommand -Method 'Page.captureScreenshot' -Params @{
      format = 'png'
      captureBeyondViewport = $true
      fromSurface = $true
      clip = @{ x = 0; y = 0; width = [double]$contentSize.width; height = [double]$contentSize.height; scale = 1 }
    }
  } else {
    $capture = Send-CdpCommand -Method 'Page.captureScreenshot' -Params @{ format = 'png'; captureBeyondViewport = $false; fromSurface = $true }
  }
  [IO.File]::WriteAllBytes([IO.Path]::GetFullPath($OutputPath), [Convert]::FromBase64String($capture.data))
  Get-Item -LiteralPath $OutputPath | Select-Object FullName, Length, LastWriteTime
} finally {
  if ($socket) {
    try { $socket.Dispose() } catch {}
  }
  if ($edgeProcess -and -not $edgeProcess.HasExited) {
    Stop-Process -Id $edgeProcess.Id -Force
  }
}
