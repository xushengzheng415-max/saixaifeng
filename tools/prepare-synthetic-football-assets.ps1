[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$U8Sheet,
    [Parameter(Mandatory = $true)][string]$U10Sheet,
    [Parameter(Mandatory = $true)][string]$U12Sheet
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'assets\synthetic-fixtures'))
if (-not $outputRoot.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Synthetic asset output must stay inside the football repository.'
}

function Export-ContactSheetCells {
    param([string]$Source, [string]$AgeCode)
    if (-not (Test-Path -LiteralPath $Source)) { throw "Missing contact sheet: $Source" }
    $targetDir = Join-Path $outputRoot "players\$AgeCode"
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    $sheet = [System.Drawing.Bitmap]::FromFile($Source)
    try {
        for ($index = 0; $index -lt 15; $index++) {
            $column = $index % 5
            $row = [Math]::Floor($index / 5)
            $left = [Math]::Round($column * $sheet.Width / 5)
            $right = [Math]::Round(($column + 1) * $sheet.Width / 5)
            $top = [Math]::Round($row * $sheet.Height / 3)
            $bottom = [Math]::Round(($row + 1) * $sheet.Height / 3)
            $padding = 5
            $sourceRect = [System.Drawing.Rectangle]::new($left + $padding, $top + $padding, ($right - $left) - 2 * $padding, ($bottom - $top) - 2 * $padding)
            $avatar = [System.Drawing.Bitmap]::new(256, 256)
            try {
                $graphics = [System.Drawing.Graphics]::FromImage($avatar)
                try {
                    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $graphics.DrawImage($sheet, [System.Drawing.Rectangle]::new(0, 0, 256, 256), $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
                } finally { $graphics.Dispose() }
                $avatar.Save((Join-Path $targetDir ('player-{0:D2}.jpg' -f ($index + 1))), [System.Drawing.Imaging.ImageFormat]::Jpeg)
            } finally { $avatar.Dispose() }
        }
    } finally { $sheet.Dispose() }
}

function Write-TeamCrests {
    $targetDir = Join-Path $outputRoot 'team-crests'
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    $palettes = @(
        @('#0B6B3A','#F4D35E'), @('#154C79','#9FE7F5'), @('#8B1E2D','#FFD166'), @('#512B81','#A7F3D0'),
        @('#C2410C','#FFF7ED'), @('#0F766E','#FDE68A'), @('#1D4ED8','#F8FAFC'), @('#7C2D12','#FDBA74'),
        @('#166534','#DCFCE7'), @('#9F1239','#FCE7F3'), @('#334155','#67E8F9'), @('#6D28D9','#DDD6FE')
    )
    for ($index = 0; $index -lt 48; $index++) {
        $palette = $palettes[$index % $palettes.Count]
        $code = 'SXF{0:D2}' -f ($index + 1)
        $variant = $index % 4
        $symbol = @('◆','●','▲','★')[$variant]
        $svg = @"
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <path d="M128 12 L224 48 V124 C224 184 184 226 128 244 C72 226 32 184 32 124 V48 Z" fill="$($palette[0])" stroke="$($palette[1])" stroke-width="10"/>
  <circle cx="128" cy="112" r="58" fill="none" stroke="$($palette[1])" stroke-width="8"/>
  <text x="128" y="132" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" font-weight="700" fill="$($palette[1])">$symbol</text>
  <path d="M70 183 H186" stroke="$($palette[1])" stroke-width="7" stroke-linecap="round"/>
  <text x="128" y="211" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="$($palette[1])">$code</text>
</svg>
"@
        [System.IO.File]::WriteAllText((Join-Path $targetDir ("team-{0:D2}.svg" -f ($index + 1))), $svg, [System.Text.UTF8Encoding]::new($false))
    }
}

Export-ContactSheetCells -Source $U8Sheet -AgeCode 'u8'
Export-ContactSheetCells -Source $U10Sheet -AgeCode 'u10'
Export-ContactSheetCells -Source $U12Sheet -AgeCode 'u12'
Write-TeamCrests
Write-Host "Prepared synthetic assets at $outputRoot"
