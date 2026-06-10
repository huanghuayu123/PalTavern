$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$resRoot = Join-Path $root 'android\app\src\main\res'
$assetRoot = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null

$densities = @(
  @{ Name = 'mipmap-mdpi'; Size = 48; Foreground = 108 },
  @{ Name = 'mipmap-hdpi'; Size = 72; Foreground = 162 },
  @{ Name = 'mipmap-xhdpi'; Size = 96; Foreground = 216 },
  @{ Name = 'mipmap-xxhdpi'; Size = 144; Foreground = 324 },
  @{ Name = 'mipmap-xxxhdpi'; Size = 192; Foreground = 432 }
)

function New-GraphicsPath {
  param([float[]]$Points)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.StartFigure()
  for ($i = 0; $i -lt $Points.Length; $i += 2) {
    if ($i -eq 0) {
      $path.AddLine($Points[$i], $Points[$i + 1], $Points[$i], $Points[$i + 1])
    } else {
      $path.AddLine($Points[$i - 2], $Points[$i - 1], $Points[$i], $Points[$i + 1])
    }
  }
  $path.CloseFigure()
  return $path
}

function Add-RoundedRectangle {
  param(
    [System.Drawing.Drawing2D.GraphicsPath]$Path,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $d = $Radius * 2
  $Path.AddArc($X, $Y, $d, $d, 180, 90)
  $Path.AddArc($X + $Width - $d, $Y, $d, $d, 270, 90)
  $Path.AddArc($X + $Width - $d, $Y + $Height - $d, $d, $d, 0, 90)
  $Path.AddArc($X, $Y + $Height - $d, $d, $d, 90, 90)
  $Path.CloseFigure()
}

function New-IconBitmap {
  param(
    [int]$Size,
    [switch]$TransparentBackground,
    [switch]$RoundMask
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 1024.0
  $dark = [System.Drawing.Color]::FromArgb(255, 43, 67, 72)
  $green = [System.Drawing.Color]::FromArgb(255, 166, 226, 197)
  $greenLight = [System.Drawing.Color]::FromArgb(255, 217, 248, 226)
  $paper = [System.Drawing.Color]::FromArgb(255, 248, 255, 249)
  $paper2 = [System.Drawing.Color]::FromArgb(255, 255, 252, 246)
  $red = [System.Drawing.Color]::FromArgb(255, 245, 101, 75)
  $shadow = [System.Drawing.Color]::FromArgb(28, 31, 33, 34)

  if (-not $TransparentBackground) {
    $graphics.Clear($paper)
    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($RoundMask) {
      $bgPath.AddEllipse(40 * $scale, 40 * $scale, 944 * $scale, 944 * $scale)
    } else {
      Add-RoundedRectangle $bgPath (18 * $scale) (18 * $scale) (988 * $scale) (988 * $scale) (204 * $scale)
    }
    $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.RectangleF]::new(0, 0, $Size, $Size),
      $paper2,
      $paper,
      45
    )
    $graphics.FillPath($bgBrush, $bgPath)
    $bgBrush.Dispose()
    $bgPath.Dispose()
  }

  $artState = $graphics.Save()
  $artScale = 1.08
  $artOffsetX = -14
  $artOffsetY = 6
  if ($TransparentBackground) {
    $artScale = 1.0
    $artOffsetX = -12
    $artOffsetY = 8
  }
  $graphics.TranslateTransform($artOffsetX * $scale, $artOffsetY * $scale)
  $graphics.TranslateTransform($Size / 2, $Size / 2)
  $graphics.ScaleTransform($artScale, $artScale)
  $graphics.TranslateTransform(-$Size / 2, -$Size / 2)

  $bubble = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bubble.StartFigure()
  $bubble.AddBezier(344 * $scale, 270 * $scale, 286 * $scale, 270 * $scale, 246 * $scale, 312 * $scale, 246 * $scale, 376 * $scale)
  $bubble.AddLine(246 * $scale, 376 * $scale, 246 * $scale, 588 * $scale)
  $bubble.AddBezier(246 * $scale, 588 * $scale, 246 * $scale, 674 * $scale, 320 * $scale, 718 * $scale, 404 * $scale, 718 * $scale)
  $bubble.AddLine(404 * $scale, 718 * $scale, 430 * $scale, 718 * $scale)
  $bubble.AddLine(430 * $scale, 718 * $scale, 430 * $scale, 786 * $scale)
  $bubble.AddBezier(430 * $scale, 786 * $scale, 430 * $scale, 824 * $scale, 462 * $scale, 834 * $scale, 490 * $scale, 808 * $scale)
  $bubble.AddLine(490 * $scale, 808 * $scale, 588 * $scale, 718 * $scale)
  $bubble.AddLine(588 * $scale, 718 * $scale, 724 * $scale, 718 * $scale)
  $bubble.AddBezier(724 * $scale, 718 * $scale, 812 * $scale, 718 * $scale, 852 * $scale, 676 * $scale, 852 * $scale, 604 * $scale)
  $bubble.AddLine(852 * $scale, 604 * $scale, 852 * $scale, 482 * $scale)
  $bubble.AddBezier(852 * $scale, 482 * $scale, 852 * $scale, 452 * $scale, 842 * $scale, 430 * $scale, 820 * $scale, 408 * $scale)
  $bubble.AddLine(820 * $scale, 408 * $scale, 720 * $scale, 308 * $scale)
  $bubble.AddBezier(720 * $scale, 308 * $scale, 696 * $scale, 284 * $scale, 674 * $scale, 274 * $scale, 638 * $scale, 274 * $scale)
  $bubble.AddLine(638 * $scale, 274 * $scale, 344 * $scale, 270 * $scale)
  $bubble.CloseFigure()

  $shadowMatrix = New-Object System.Drawing.Drawing2D.Matrix
  $shadowMatrix.Translate(0, 12 * $scale)
  $bubbleShadow = $bubble.Clone()
  $bubbleShadow.Transform($shadowMatrix)
  $shadowBrush = [System.Drawing.SolidBrush]::new($shadow)
  $graphics.FillPath($shadowBrush, $bubbleShadow)
  $shadowBrush.Dispose()
  $bubbleShadow.Dispose()
  $shadowMatrix.Dispose()

  $bubbleBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new(220 * $scale, 210 * $scale, 670 * $scale, 630 * $scale),
    $greenLight,
    $green,
    145
  )
  $graphics.FillPath($bubbleBrush, $bubble)
  $bubbleBrush.Dispose()

  $fold = New-GraphicsPath @(
    (668 * $scale), (290 * $scale),
    (668 * $scale), (430 * $scale),
    (796 * $scale), (430 * $scale)
  )
  $foldBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new(666 * $scale, 262 * $scale, 180 * $scale, 210 * $scale),
    [System.Drawing.Color]::FromArgb(255, 226, 250, 231),
    [System.Drawing.Color]::FromArgb(255, 246, 253, 241),
    35
  )
  $graphics.FillPath($foldBrush, $fold)
  $foldBrush.Dispose()

  $strokeWidth = [Math]::Max(3, 28 * $scale)
  $stroke = New-Object System.Drawing.Pen $dark, $strokeWidth
  $stroke.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $stroke.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $stroke.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawPath($stroke, $bubble)
  $graphics.DrawLine($stroke, 668 * $scale, 290 * $scale, 668 * $scale, 430 * $scale)
  $graphics.DrawLine($stroke, 668 * $scale, 430 * $scale, 796 * $scale, 430 * $scale)
  $stroke.Dispose()
  $fold.Dispose()

  $redBrush = [System.Drawing.SolidBrush]::new($red)
  $graphics.FillEllipse($redBrush, 762 * $scale, 282 * $scale, 74 * $scale, 74 * $scale)
  $redBrush.Dispose()

  $bubble.Dispose()
  $graphics.Restore($artState)
  $graphics.Dispose()
  return $bitmap
}

function Save-Png {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$Path
  )
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Force
  }
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$preview = New-IconBitmap -Size 1024
Save-Png $preview (Join-Path $assetRoot 'tavern-social-app-icon.png')
$preview.Dispose()

foreach ($density in $densities) {
  $folder = Join-Path $resRoot $density.Name

  $full = New-IconBitmap -Size $density.Size
  Save-Png $full (Join-Path $folder 'ic_launcher.png')
  $full.Dispose()

  $round = New-IconBitmap -Size $density.Size -RoundMask
  Save-Png $round (Join-Path $folder 'ic_launcher_round.png')
  $round.Dispose()

  $foreground = New-IconBitmap -Size $density.Foreground -TransparentBackground
  Save-Png $foreground (Join-Path $folder 'ic_launcher_foreground.png')
  $foreground.Dispose()
}

Write-Host 'Generated Tavern Social Android launcher icons.'
