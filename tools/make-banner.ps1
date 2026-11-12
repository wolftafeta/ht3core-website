# Crops assets/hub.png (the raw in-game screenshot) into assets/hub-banner.jpg, leaving out the HUD.
# Usage: powershell -File tools\make-banner.ps1 [-X 480 -Y 150 -W 1210 -H 825]   (pixels of the source image)
param([int]$X = 480, [int]$Y = 150, [int]$W = 1210, [int]$H = 825)
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$src = [Drawing.Image]::FromFile((Join-Path $root 'assets\hub.png'))
$bmp = New-Object Drawing.Bitmap $W, $H
$g = [Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src, (New-Object Drawing.Rectangle 0, 0, $W, $H), (New-Object Drawing.Rectangle $X, $Y, $W, $H), [Drawing.GraphicsUnit]::Pixel)
$enc = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$p = New-Object Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 86L
$bmp.Save((Join-Path $root 'assets\hub-banner.jpg'), $enc, $p)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
