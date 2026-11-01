param([string]$ToolRoot=(Join-Path $env:LOCALAPPDATA 'SxfFootballBuild\android'))
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path $ToolRoot | Out-Null
$items=Get-Content (Join-Path $PSScriptRoot 'toolchain.json') -Raw | ConvertFrom-Json
foreach($item in $items){
  $zip=Join-Path $ToolRoot ($item.slug+'.zip')
  if(!(Test-Path $zip)){
    & curl.exe -fL --retry 3 --silent --show-error $item.url -o ($zip+'.partial')
    if($LASTEXITCODE -ne 0){throw "Download failed: $($item.package)"}
    Move-Item -LiteralPath ($zip+'.partial') -Destination $zip
  }
  if((Get-FileHash $zip -Algorithm SHA256).Hash -ne $item.sha256){throw "Toolchain checksum mismatch: $($item.package)"}
  $dest=Join-Path $ToolRoot $item.slug
  $marker=Join-Path $dest '.sxf-extraction-complete'
  if(!(Test-Path $marker)){
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    & tar.exe -xf $zip -C $dest
    if($LASTEXITCODE -ne 0){throw "Extraction failed: $($item.package)"}
    Set-Content -LiteralPath $marker -Value $item.sha256
  }
  Write-Output "Ready: $($item.package)"
}
