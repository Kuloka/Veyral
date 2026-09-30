Add-Type -AssemblyName System.Drawing
$size = 256
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#111218'))
$accent = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#625af0'))
$light = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#b8bcc5'))
$round = [System.Drawing.Drawing2D.GraphicsPath]::new()
$round.AddArc(0, 0, 64, 64, 180, 90)
$round.AddArc(192, 0, 64, 64, 270, 90)
$round.AddArc(192, 192, 64, 64, 0, 90)
$round.AddArc(0, 192, 64, 64, 90, 90)
$round.CloseFigure()
$graphics.FillPath($background, $round)
$points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(54, 68),
    [System.Drawing.PointF]::new(90, 68),
    [System.Drawing.PointF]::new(128, 164),
    [System.Drawing.PointF]::new(166, 68),
    [System.Drawing.PointF]::new(202, 68),
    [System.Drawing.PointF]::new(144, 198),
    [System.Drawing.PointF]::new(112, 198)
)
$graphics.FillPolygon($accent, $points)
$inner = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(108, 68),
    [System.Drawing.PointF]::new(148, 68),
    [System.Drawing.PointF]::new(128, 118)
)
$graphics.FillPolygon($light, $inner)
$pngPath = Join-Path $PSScriptRoot '..\assets\icon.png'
$icoPath = Join-Path $PSScriptRoot '..\assets\icon.ico'
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$largeBitmap = [System.Drawing.Bitmap]::new(1024, 1024)
$largeGraphics = [System.Drawing.Graphics]::FromImage($largeBitmap)
$largeGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$largeGraphics.Clear([System.Drawing.Color]::Transparent)
$largeGraphics.ScaleTransform(4, 4)
$largeGraphics.FillPath($background, $round)
$largeGraphics.FillPolygon($accent, $points)
$largeGraphics.FillPolygon($light, $inner)
$largeBitmap.Save((Join-Path $PSScriptRoot '..\assets\icon-mac.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$largeGraphics.Dispose()
$largeBitmap.Dispose()
$bytes = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.File]::Create($icoPath)
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$bytes.Length)
$writer.Write([uint32]22)
$writer.Write($bytes)
$writer.Dispose()
$round.Dispose()
$background.Dispose()
$accent.Dispose()
$light.Dispose()
