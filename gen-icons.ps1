Add-Type -AssemblyName System.Drawing

$base = "c:\Users\Harshal Patel\Desktop\Put it right there\Glance"
New-Item -ItemType Directory -Force -Path "$base\icons" | Out-Null

$coral = [System.Drawing.Color]::FromArgb(255, 255, 107, 107)
$rose  = [System.Drawing.Color]::FromArgb(255, 255, 143, 171)
$void  = [System.Drawing.Color]::FromArgb(255, 8, 8, 9)

foreach ($sz in @(16, 32, 48, 128)) {
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode   = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear($void)

    $cx = [float]($sz / 2)
    $cy = [float]($sz / 2)
    $sc = [float]($sz / 128.0)

    if ($sz -eq 16) {
        # Simple coral-to-rose circle
        $d  = 10.0
        $ax = $cx - 5.0
        $ay = $cy - 5.0
        $gb = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            [System.Drawing.PointF]::new($ax, $ay),
            [System.Drawing.PointF]::new($ax + $d, $ay + $d),
            $coral, $rose)
        $g.FillEllipse($gb, $ax, $ay, $d, $d)
        $gb.Dispose()
        # specular
        $sb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 255, 248, 248))
        $g.FillEllipse($sb, $ax + 1.5, $ay + 1.5, 3.0, 3.0)
        $sb.Dispose()
    } else {
        # Eye / lens shape
        $eW = [float](108 * $sc)
        $eH = [float](52  * $sc)
        $eX = $cx - $eW / 2
        $eY = $cy - $eH / 2

        $lp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $lp.AddArc($eX, $eY, $eW, $eH, 180, 180)
        $lp.AddArc($eX, $eY, $eW, $eH, 0,   180)
        $lp.CloseFigure()

        $fb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(14, 255, 255, 255))
        $g.FillPath($fb, $lp)
        $fb.Dispose()

        $ep = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(150, 210, 200, 196), [float](1.6 * $sc))
        $g.DrawPath($ep, $lp)
        $ep.Dispose()
        $lp.Dispose()

        if ($sz -ge 48) {
            $ird = [float](32 * $sc)
            $irx = $cx - $ird / 2
            $iry = $cy - $ird / 2
            $irp = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(65, 255, 107, 107), [float](1.8 * $sc))
            $g.DrawEllipse($irp, $irx, $iry, $ird, $ird)
            $irp.Dispose()
        }

        # Coral-to-rose pupil
        $pd = [float](20 * $sc)
        $px = $cx - $pd / 2
        $py = $cy - $pd / 2
        $gb = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            [System.Drawing.PointF]::new($px, $py),
            [System.Drawing.PointF]::new($px + $pd, $py + $pd),
            $coral, $rose)
        $g.FillEllipse($gb, $px, $py, $pd, $pd)
        $gb.Dispose()

        # Specular highlight
        $sd = [float](5 * $sc)
        $sx = $px + [float](4 * $sc)
        $sy = $py + [float](4 * $sc)
        $sb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120, 255, 248, 248))
        $g.FillEllipse($sb, $sx, $sy, $sd, $sd)
        $sb.Dispose()
    }

    $g.Dispose()
    $outPath = "$base\icons\icon$sz.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Saved $outPath ($(([System.IO.FileInfo]$outPath).Length) bytes)"
}

Write-Host "All icons generated."
