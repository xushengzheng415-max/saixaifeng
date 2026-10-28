# 从平台 PWA 图标生成 Android 各密度启动图标，保持与网页/独立窗口同一徽标。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root '..\platform-admin-vue\public\pwa-512.png'
$source = [System.IO.Path]::GetFullPath($source)
if (-not (Test-Path $source)) { throw "找不到图标源文件：$source" }

$densities = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
$image = [System.Drawing.Image]::FromFile($source)
try {
  foreach ($name in $densities.Keys) {
    $size = $densities[$name]
    $dir = Join-Path $root "app\src\main\res\mipmap-$name"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.DrawImage($image, 0, 0, $size, $size)
    $target = Join-Path $dir 'ic_launcher.png'
    $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Output "生成 $target ($size x $size)"
  }
}
finally {
  $image.Dispose()
}
