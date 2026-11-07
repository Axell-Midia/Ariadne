Add-Type -AssemblyName System.Drawing

function New-Icon($size, $path, $maskable) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    if ($maskable) {
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 22, 163, 74))
    } else {
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.Point(0, 0)),
            (New-Object System.Drawing.Point($size, $size)),
            ([System.Drawing.Color]::FromArgb(255, 34, 197, 94)),
            ([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
        )
    }
    $g.FillRectangle($brush, 0, 0, $size, $size)

    # Plato (círculo)
    $plateR = [int]($size * 0.34)
    $cx = [int]($size * 0.5)
    $cy = [int]($size * 0.44)
    $plateBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255))
    $g.FillEllipse($plateBrush, $cx - $plateR, $cy - $plateR, $plateR * 2, $plateR * 2)
    $plateEdge = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 4, 120, 87))
    $g.DrawEllipse((New-Object System.Drawing.Pen($plateEdge, [int]($size * 0.025))), $cx - $plateR, $cy - $plateR, $plateR * 2, $plateR * 2)

    # Tenedor + cuchillo (dos rectángulos cruzados)
    $forkW = [int]($size * 0.055)
    $forkH = [int]($size * 0.42)
    $forkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255))
    $f1x = $cx - [int]($size * 0.16)
    $g.FillRectangle($forkBrush, $f1x, $cy - [int]($size * 0.30), $forkW, $forkH)
    $g.FillRectangle($forkBrush, $cx + [int]($size * 0.11), $cy - [int]($size * 0.30), $forkW, $forkH)

    # Dientes del tenedor
    $tineGap = [int]($size * 0.012)
    $tineW = $forkW
    $tineH = [int]($size * 0.05)
    $tineStartX = $cx - [int]($size * 0.16)
    $tineEndY = $cy - [int]($size * 0.30) - $tineH
    for ($i = 0; $i -lt 3; $i++) {
        $g.FillRectangle($forkBrush, $tineStartX, $tineEndY, $tineW, $tineH)
        $tineStartX += $forkW + $tineGap
    }

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generado: $path"
}

$pub = Join-Path $PSScriptRoot '..\public'
if (-not (Test-Path $pub)) { New-Item -ItemType Directory -Path $pub -Force | Out-Null }

New-Icon 192 (Join-Path $pub 'icon-192.png') $false
New-Icon 512 (Join-Path $pub 'icon-512.png') $false
New-Icon 512 (Join-Path $pub 'icon-maskable-512.png') $true