$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$ProjectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$SourceRoot = Join-Path $ProjectRoot "part4 可视化"
$OutputPath = Join-Path $ProjectRoot "assets\visual-data.js"

function ConvertTo-Number {
  param([object]$Value)

  if ($null -eq $Value) { return 0.0 }
  $text = ([string]$Value).Trim() -replace ",", ""
  if ($text -eq "") { return 0.0 }

  $number = 0.0
  if ([double]::TryParse($text, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return [double]$number
  }
  return 0.0
}

function Round-Number {
  param(
    [double]$Value,
    [int]$Digits = 6
  )

  return [math]::Round($Value, $Digits)
}

function Get-ZipText {
  param(
    [System.IO.Compression.ZipArchive]$Zip,
    [string]$Name
  )

  $entry = $Zip.GetEntry($Name)
  if (-not $entry) { return $null }
  $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
}

function Get-CellText {
  param(
    $Cell,
    [string[]]$SharedStrings,
    $Namespace
  )

  if ($Cell.t -eq "inlineStr") {
    $parts = @()
    foreach ($t in $Cell.SelectNodes(".//m:t", $Namespace)) {
      $parts += $t.InnerText
    }
    return ($parts -join "")
  }

  $value = $Cell.v
  if ($null -eq $value) { return "" }
  $text = [string]$value
  if ($Cell.t -eq "s" -and $text -ne "") {
    return $SharedStrings[[int]$text]
  }
  return $text
}

function Get-ColumnIndex {
  param([string]$CellRef)

  $letters = ($CellRef -replace "[0-9]", "").ToUpperInvariant()
  $index = 0
  foreach ($char in $letters.ToCharArray()) {
    $index = ($index * 26) + ([int][char]$char - [int][char]"A" + 1)
  }
  return [math]::Max(0, $index - 1)
}

function Read-XlsxSheet {
  param(
    [string]$Path,
    [int]$SheetIndex = 1
  )

  $resolvedPath = Resolve-Path -LiteralPath $Path
  $fs = [System.IO.File]::Open($resolvedPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Read, $false)
    try {
      $sharedStrings = @()
      $sharedXmlText = Get-ZipText $zip "xl/sharedStrings.xml"
      if ($sharedXmlText) {
        [xml]$sharedXml = $sharedXmlText
        $sharedNs = New-Object System.Xml.XmlNamespaceManager($sharedXml.NameTable)
        $sharedNs.AddNamespace("m", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
        foreach ($si in $sharedXml.SelectNodes("//m:si", $sharedNs)) {
          $parts = @()
          foreach ($t in $si.SelectNodes(".//m:t", $sharedNs)) {
            $parts += $t.InnerText
          }
          $sharedStrings += ($parts -join "")
        }
      }

      [xml]$sheet = Get-ZipText $zip ("xl/worksheets/sheet{0}.xml" -f $SheetIndex)
      $sheetNs = New-Object System.Xml.XmlNamespaceManager($sheet.NameTable)
      $sheetNs.AddNamespace("m", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

      $rows = New-Object System.Collections.Generic.List[object]
      foreach ($row in $sheet.SelectNodes("//m:sheetData/m:row", $sheetNs)) {
        $values = New-Object System.Collections.Generic.List[string]
        foreach ($cell in $row.SelectNodes("m:c", $sheetNs)) {
          $columnIndex = Get-ColumnIndex $cell.r
          while ($values.Count -le $columnIndex) {
            $values.Add("")
          }
          $values[$columnIndex] = Get-CellText $cell $sharedStrings $sheetNs
        }

        $rowIndex = [math]::Max(0, [int]$row.r - 1)
        while ($rows.Count -le $rowIndex) {
          $rows.Add(@())
        }
        $rows[$rowIndex] = $values.ToArray()
      }

      return $rows.ToArray()
    } finally {
      $zip.Dispose()
    }
  } finally {
    $fs.Dispose()
  }
}

function Convert-ExcelTime {
  param([object]$Value)

  if ($null -eq $Value) { return $null }
  $text = ([string]$Value).Trim()
  if ($text -eq "") { return $null }

  $number = 0.0
  if ([double]::TryParse($text, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    if ($number -gt 20000) {
      return [datetime]::FromOADate($number)
    }
  }

  $formats = @(
    "dd/MM/yyyy HH:mm",
    "d/M/yyyy HH:mm",
    "dd/MM/yyyy H:mm",
    "d/M/yyyy H:mm",
    "yyyy-MM-dd HH:mm",
    "yyyy-MM-dd H:mm"
  )
  foreach ($format in $formats) {
    $parsed = [datetime]::MinValue
    if ([datetime]::TryParseExact($text, $format, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$parsed)) {
      return $parsed
    }
  }

  $fallback = [datetime]::MinValue
  if ([datetime]::TryParse($text, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$fallback)) {
    return $fallback
  }

  return $null
}

function Import-VisualSeries {
  param(
    [string]$Path,
    [string]$Id,
    [string]$Name
  )

  $rows = Read-XlsxSheet -Path $Path -SheetIndex 1
  if ($rows.Count -lt 2) {
    throw "No data rows found in $Path"
  }

  $headers = @($rows[0])
  $valueColumns = @($headers[1..($headers.Count - 1)] | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $rowCount = 0
  $dateKeys = New-Object System.Collections.Generic.List[string]
  $seriesByDate = [ordered]@{}
  $firstTime = $null
  $lastTime = $null

  for ($rowIndex = 1; $rowIndex -lt $rows.Count; $rowIndex++) {
    $row = $rows[$rowIndex]
    if ($row.Count -eq 0) { continue }

    $timestamp = Convert-ExcelTime $row[0]
    if ($null -eq $timestamp) { continue }

    if ($null -eq $firstTime) { $firstTime = $timestamp }
    $lastTime = $timestamp

    $dateKey = $timestamp.ToString("yyyy-MM-dd")
    if (-not $seriesByDate.Contains($dateKey)) {
      $seriesByDate[$dateKey] = New-Object System.Collections.Generic.List[object]
      $dateKeys.Add($dateKey)
    }

    $point = [ordered]@{
      time = $timestamp.ToString("HH:mm")
    }

    for ($i = 1; $i -lt $headers.Count; $i++) {
      $header = [string]$headers[$i]
      if ([string]::IsNullOrWhiteSpace($header)) { continue }
      $rawValue = if ($i -lt $row.Count) { $row[$i] } else { "" }
      $point[$header] = Round-Number (ConvertTo-Number $rawValue) 6
    }

    $seriesByDate[$dateKey].Add($point)
    $rowCount++
  }

  $minPoints = 0
  $maxPoints = 0
  if ($dateKeys.Count -gt 0) {
    $dayCounts = foreach ($dateKey in $dateKeys) { $seriesByDate[$dateKey].Count }
    $minPoints = ($dayCounts | Measure-Object -Minimum).Minimum
    $maxPoints = ($dayCounts | Measure-Object -Maximum).Maximum
  }

  $normalizedSeries = [ordered]@{}
  foreach ($dateKey in $dateKeys) {
    $normalizedSeries[$dateKey] = $seriesByDate[$dateKey].ToArray()
  }

  return [ordered]@{
    id = $Id
    name = $Name
    sourceFile = "part4 可视化/$([System.IO.Path]::GetFileName((Resolve-Path -LiteralPath $Path)))"
    sheet = "Sheet1"
    columns = @("time") + $valueColumns
    metrics = $valueColumns
    rowCount = $rowCount
    dayCount = $dateKeys.Count
    minPointsPerDay = $minPoints
    maxPointsPerDay = $maxPoints
    startDateTime = if ($firstTime) { $firstTime.ToString("yyyy-MM-dd HH:mm") } else { "" }
    endDateTime = if ($lastTime) { $lastTime.ToString("yyyy-MM-dd HH:mm") } else { "" }
    dates = $dateKeys.ToArray()
    seriesByDate = $normalizedSeries
  }
}

$configs = @(
  @{ id = "VPP1"; name = "VPP1 风储运行"; file = "VPP1_风储运行数据记录.xlsx" },
  @{ id = "VPP2"; name = "VPP2 光储运行"; file = "VPP2_光储运行数据记录.xlsx" },
  @{ id = "VPP3"; name = "VPP3 光伏火电储能运行"; file = "VPP3_光伏火电储能画图数据.xlsx" }
)

$datasets = [ordered]@{}
foreach ($config in $configs) {
  $path = Join-Path $SourceRoot $config.file
  Write-Host "Importing $($config.id) from $($config.file) ..."
  $datasets[$config.id] = Import-VisualSeries -Path $path -Id $config.id -Name $config.name
}

$payload = [ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  source = "part4 可视化"
  datasets = $datasets
}

$json = $payload | ConvertTo-Json -Depth 12 -Compress
$content = @"
window.VPP_VISUAL_DATA = $json;
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $content, $utf8NoBom)
Write-Host "Wrote $OutputPath"
