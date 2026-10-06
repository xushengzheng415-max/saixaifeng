param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9-]+$')]
  [string]$EnvironmentId,
  [string]$OutputPath = (Join-Path $env:TEMP 'football-player-card-audit.json')
)

$ErrorActionPreference = 'Stop'
$salt = [Guid]::NewGuid().ToString('N')
$expectedCounts = @{}

function Invoke-ReadOnlyCommand($table, $commandType, $command) {
  $request = ConvertTo-Json -InputObject @(@{ TableName = $table; CommandType = $commandType; Command = $command }) -Compress -Depth 30
  $raw = tcb -e $EnvironmentId db nosql execute --command $request --json | Out-String
  if ($LASTEXITCODE -ne 0 -or $raw.IndexOf('{') -lt 0) { throw "CloudBase 只读查询失败：$table" }
  $response = $raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json -Depth 100
  if (-not $response.data.results) { throw "CloudBase 响应缺少结果：$table" }
  return ,$response.data.results[0]
}

function Read-Rows($table, $projection, $limit) {
  $countCommand = '{"count":"' + $table + '","query":{}}'
  $countResult = Invoke-ReadOnlyCommand $table 'COMMAND' $countCommand
  $count = [int]$countResult[0].n.'$numberInt'
  if ($count -gt $limit) { throw "集合超过只读审计上限：$table ($count > $limit)" }
  $script:expectedCounts[$table] = $count
  $query = [ordered]@{ find = $table; filter = @{}; projection = $projection; limit = $limit } | ConvertTo-Json -Compress -Depth 30
  $rows = Invoke-ReadOnlyCommand $table 'QUERY' $query
  if (@($rows).Count -ne $count) { throw "集合返回数量与总数不符：$table" }
  return $rows
}

function Hash-Name($value) {
  if ([string]::IsNullOrWhiteSpace([string]$value)) { return $value }
  $bytes = [System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($salt + '|' + ([string]$value).Trim()))
  return [Convert]::ToHexString($bytes)
}

$matchFields = @{ _id=1; status=1; tournamentId=1; divisionId=1; homeTeamId=1; awayTeamId=1; synthetic=1; isTest=1; originType=1; dataKind=1; resultReviewStatus=1; reviewStatus=1; refereeReviewStatus=1; eventRecordingStatus=1; totalMinutes=1; matchDuration=1; duration=1; matchMinutes=1; periodMode=1; 'lineups.home.players.id'=1; 'lineups.home.players.name'=1; 'lineups.home.players.number'=1; 'lineups.away.players.id'=1; 'lineups.away.players.name'=1; 'lineups.away.players.number'=1; 'lineups.home.substitutes.id'=1; 'lineups.home.substitutes.name'=1; 'lineups.home.substitutes.number'=1; 'lineups.away.substitutes.id'=1; 'lineups.away.substitutes.name'=1; 'lineups.away.substitutes.number'=1; 'homeLineup.starters.id'=1; 'homeLineup.starters.playerId'=1; 'homeLineup.starters.name'=1; 'awayLineup.starters.id'=1; 'awayLineup.starters.playerId'=1; 'awayLineup.starters.name'=1; 'events.eventId'=1; 'events.type'=1; 'events.eventType'=1; 'events.playerId'=1; 'events.playerName'=1; 'events.playerNumber'=1; 'events.assistName'=1; 'events.assistNumber'=1; 'events.inPlayerId'=1; 'events.outPlayerId'=1; 'events.assistPlayerId'=1; 'events.assistId'=1; 'events.teamId'=1; 'events.teamSide'=1; 'events.minute'=1; 'events.phase'=1; 'events.shootout'=1; 'events.deleted'=1; 'events.status'=1; 'events.revision'=1 }
$ruleFields = @{ _id=1; matchMinutes=1; periodMode=1; periodCount=1; singlePeriodCount=1; 'rulesSnapshot.matchMinutes'=1; 'rulesSnapshot.periodMode'=1; 'rulesSnapshot.periodCount'=1 }
$originFields = @{ _id=1; synthetic=1; syntheticDatasetId=1; syntheticKey=1; isTest=1; originType=1; dataKind=1; source=1 }

$matches = Read-Rows 'matches' $matchFields 500
$teams = Read-Rows 'teams' $originFields 500
$players = Read-Rows 'players' $originFields 2000
$divisions = Read-Rows 'divisions' $ruleFields 500
$tournaments = Read-Rows 'tournaments' $originFields 500

foreach ($match in $matches) {
  foreach ($side in @('home','away')) {
    $lineup = $match.lineups.$side
    if ($lineup) {
      foreach ($group in @('players','substitutes')) {
        foreach ($player in @($lineup.$group)) {
          if ($player -and $player.PSObject.Properties['name']) { $player.name = Hash-Name $player.name }
        }
      }
    }
    $direct = $match.($side + 'Lineup')
    if ($direct) {
      foreach ($group in @('starters','players','substitutes')) {
        foreach ($player in @($direct.$group)) {
          if ($player -and $player.PSObject.Properties['name']) { $player.name = Hash-Name $player.name }
        }
      }
    }
  }
  foreach ($event in @($match.events)) {
    if ($event) {
      foreach ($field in @('playerName','assistName')) {
        if ($event.PSObject.Properties[$field]) { $event.$field = Hash-Name $event.$field }
      }
    }
  }
}

$payload = ConvertTo-Json -InputObject @{ matches=@($matches); teams=@($teams); players=@($players); divisions=@($divisions); tournaments=@($tournaments) } -Compress -Depth 100
if ([regex]::IsMatch($payload,'"(phone|birthDate|avatarUrl|photoUrl|jerseyName)"\s*:','IgnoreCase')) { throw '审计快照包含个人资料字段' }
foreach ($pair in [regex]::Matches($payload,'"(?:name|playerName|assistName)"\s*:\s*"([^"]*)"')) {
  if ($pair.Groups[1].Value -and $pair.Groups[1].Value -notmatch '^[A-F0-9]{64}$') { throw '审计快照包含未哈希姓名' }
}
$saved = $payload | ConvertFrom-Json -Depth 100
foreach ($table in @('matches','teams','players','divisions','tournaments')) {
  if ($saved.$table.Count -ne $expectedCounts[$table]) { throw "脱敏后数量与总数不符：$table" }
}
[System.IO.File]::WriteAllText($OutputPath,$payload,[System.Text.UTF8Encoding]::new($false))
Write-Output "只读审计快照：比赛 $($saved.matches.Count) 场、球队 $($saved.teams.Count) 支、球员 $($saved.players.Count) 人；姓名已一次性加盐哈希。"
