# 生成平台运营中心的 PWA / 应用图标。
# 来源：public/logo.png 左侧“蜂 + 足球”徽标，裁掉右侧文字后居中合成方形图标。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-pwa-icons.ps1
Add-Type -AssemblyName System.Drawing

$publicDir = Join-Path $PSScriptRoot '..\public'
$source = [System.Drawing.Bitmap]::FromFile((Join-Path $publicDir 'logo.png'))

$cropWidth = 198
$cropHeight = 172
$emblem = New-Object System.Drawing.Bitmap $cropWidth, $cropHeight
$emblemGraphics = [System.Drawing.Graphics]::FromImage($emblem)
$emblemGraphics.DrawImage(
  $source,
  (New-Object System.Drawing.Rectangle 0, 0, $cropWidth, $cropHeight),
  (New-Object System.Drawing.Rectangle 0, 0, $cropWidth, $cropHeight),
  [System.Drawing.GraphicsUnit]::Pixel
)
$emblemGraphics.Dispose()
$source.Dispose()

function New-AppIcon {
  param([int]$Size, [double]$FillRatio, [string]$Path)
  $icon = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($icon)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::White)
  $drawWidth = [int]($Size * $FillRatio)
  $drawHeight = [int]($drawWidth * $cropHeight / $cropWidth)
  $destination = New-Object System.Drawing.Rectangle ([int](($Size - $drawWidth) / 2)), ([int](($Size - $drawHeight) / 2)), $drawWidth, $drawHeight
  $graphics.DrawImage(
    $emblem,
    $destination,
    (New-Object System.Drawing.Rectangle 0, 0, $cropWidth, $cropHeight),
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $graphics.Dispose()
  $icon.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $icon.Dispose()
  Write-Output "$(Split-Path $Path -Leaf)  $Size x $Size  fill=$FillRatio"
}

New-AppIcon -Size 192 -FillRatio 0.72 -Path (Join-Path $publicDir 'pwa-192.png')
New-AppIcon -Size 512 -FillRatio 0.72 -Path (Join-Path $publicDir 'pwa-512.png')
New-AppIcon -Size 512 -FillRatio 0.58 -Path (Join-Path $publicDir 'pwa-maskable-512.png')
New-AppIcon -Size 180 -FillRatio 0.72 -Path (Join-Path $publicDir 'apple-touch-icon.png')

$emblem.Dispose()
