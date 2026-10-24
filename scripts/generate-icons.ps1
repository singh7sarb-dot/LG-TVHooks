Add-Type -AssemblyName System.Drawing

function Generate-AppIcon {
    param(
        [int]$Size,
        [string]$OutPath
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $g.Clear([System.Drawing.Color]::Transparent)

    # 1. Outer Dark Rounded Card
    $margin = [float]($Size * 0.05)
    $cardSize = [float]($Size - ($margin * 2))
    $radius = [float]($Size * 0.22)
    $diameter = [float]($radius * 2)

    $gPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gPath.AddArc($margin, $margin, $diameter, $diameter, 180, 90)
    $gPath.AddArc([float]($margin + $cardSize - $diameter), $margin, $diameter, $diameter, 270, 90)
    $gPath.AddArc([float]($margin + $cardSize - $diameter), [float]($margin + $cardSize - $diameter), $diameter, $diameter, 0, 90)
    $gPath.AddArc($margin, [float]($margin + $cardSize - $diameter), $diameter, $diameter, 90, 90)
    $gPath.CloseFigure()

    # Deep Space Metallic Gradient
    $cardRect = New-Object System.Drawing.RectangleF($margin, $margin, $cardSize, $cardSize)
    $cardBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $cardRect,
        [System.Drawing.Color]::FromArgb(255, 30, 27, 75),  # Deep violet
        [System.Drawing.Color]::FromArgb(255, 8, 10, 20),   # Pitch OLED black
        90.0
    )
    $g.FillPath($cardBrush, $gPath)

    # Neon Violet Bevel Border
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 99, 102, 241), [float]([Math]::Max(1.5, $Size * 0.025)))
    $g.DrawPath($borderPen, $gPath)

    # 2. Central Glowing Orb
    $center = [float]($Size / 2)
    $orbRadius = [float]($Size * 0.24)
    $orbRect = New-Object System.Drawing.RectangleF([float]($center - $orbRadius), [float]($center - $orbRadius), [float]($orbRadius * 2), [float]($orbRadius * 2))
    $orbBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $orbRect,
        [System.Drawing.Color]::FromArgb(255, 99, 102, 241),  # Indigo
        [System.Drawing.Color]::FromArgb(255, 168, 85, 247),  # Electric Purple
        45.0
    )
    $g.FillEllipse($orbBrush, $orbRect)

    # 3. Hook Symbol (White thick link curve)
    $hookPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float]([Math]::Max(2.5, $Size * 0.08)))
    $hookPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $hookPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $s = [float]($Size / 100.0)
    # Loop 1
    $g.DrawArc($hookPen, [float](36 * $s), [float](36 * $s), [float](28 * $s), [float](28 * $s), -45, 220)
    # Connecting diagonal
    $g.DrawLine($hookPen, [float](42 * $s), [float](42 * $s), [float](58 * $s), [float](58 * $s))

    # 4. Emerald Pulse Indicator Dot (Top Right)
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
    $dotSize = [float]([Math]::Max(4.0, $Size * 0.1))
    $g.FillEllipse($dotBrush, [float]($Size * 0.72), [float]($Size * 0.18), $dotSize, $dotSize)

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated crisp icon: $OutPath ($Size x $Size)"
}

Generate-AppIcon -Size 80 -OutPath "D:\Development\Projects\LG-TVHooks\app\icon.png"
Generate-AppIcon -Size 130 -OutPath "D:\Development\Projects\LG-TVHooks\app\largeIcon.png"
