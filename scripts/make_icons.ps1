# Genera le icone PWA (System.Drawing): sfondo blu notte, onda, vela bianca.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "icons"
New-Item -ItemType Directory -Force $outDir | Out-Null

function New-Icon([int]$size, [string]$path, [bool]$maskable) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"

    $bg = [System.Drawing.ColorTranslator]::FromHtml("#0b1220")
    $wave = [System.Drawing.ColorTranslator]::FromHtml("#38bdf8")
    $sail = [System.Drawing.ColorTranslator]::FromHtml("#e2e8f0")

    $g.Clear($bg)

    # margine extra per la safe-zone maskable
    $m = if ($maskable) { [int]($size * 0.12) } else { 0 }
    $s = $size - 2 * $m

    # vela/wing: triangolo curvo bianco
    $sailBrush = New-Object System.Drawing.SolidBrush($sail)
    $p1 = New-Object System.Drawing.PointF(($m + $s * 0.30), ($m + $s * 0.72))
    $p2 = New-Object System.Drawing.PointF(($m + $s * 0.52), ($m + $s * 0.14))
    $p3 = New-Object System.Drawing.PointF(($m + $s * 0.76), ($m + $s * 0.72))
    $path1 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path1.AddCurve(@($p1, $p2, $p3), 0.35)
    $path1.CloseFigure()
    $g.FillPath($sailBrush, $path1)

    # boma
    $pen = New-Object System.Drawing.Pen($sail, [Math]::Max(2, $s * 0.025))
    $g.DrawLine($pen, ($m + $s * 0.30), ($m + $s * 0.72), ($m + $s * 0.76), ($m + $s * 0.72))

    # onde: due archi azzurri
    $wavePen = New-Object System.Drawing.Pen($wave, [Math]::Max(3, $s * 0.06))
    $wavePen.StartCap = "Round"; $wavePen.EndCap = "Round"
    $g.DrawArc($wavePen, ($m + $s * 0.08), ($m + $s * 0.70), ($s * 0.38), ($s * 0.22), 200, 140)
    $g.DrawArc($wavePen, ($m + $s * 0.50), ($m + $s * 0.70), ($s * 0.38), ($s * 0.22), 200, 140)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "creato $path"
}

New-Icon 192 (Join-Path $outDir "icon-192.png") $false
New-Icon 512 (Join-Path $outDir "icon-512.png") $false
New-Icon 512 (Join-Path $outDir "maskable-512.png") $true
