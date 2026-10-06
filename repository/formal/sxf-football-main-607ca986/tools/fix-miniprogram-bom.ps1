param(
  [string]$Root = (Join-Path $PSScriptRoot '..\miniprogram')
)

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$fixed = @()

Get-ChildItem -LiteralPath $resolvedRoot -Recurse -File -Include *.json,*.wxss,*.wxml,*.js | ForEach-Object {
  $path = $_.FullName
  $bytes = [System.IO.File]::ReadAllBytes($path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
    $text = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    [System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
    $fixed += $path
  }
}

if ($fixed.Count -eq 0) {
  Write-Output 'No BOM files found.'
} else {
  Write-Output ('Removed BOM from {0} file(s):' -f $fixed.Count)
  $fixed | ForEach-Object { Write-Output $_ }
}