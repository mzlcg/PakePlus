$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$ProjectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$DatasetRoot = Resolve-Path -LiteralPath (Join-Path $ProjectRoot "..\数据集")
$OutputPath = Join-Path $ProjectRoot "assets\data.js"

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
    [int]$Digits = 2
  )

  return [math]::Round($Value, $Digits)
}

function ConvertFrom-CsvLine {
  param([string]$Line)

  $values = New-Object System.Collections.Generic.List[string]
  $current = New-Object System.Text.StringBuilder
  $inQuotes = $false
  for ($i = 0; $i -lt $Line.Length; $i++) {
    $char = $Line[$i]
    if ([int][char]$char -eq 34) {
      if ($inQuotes -and $i + 1 -lt $Line.Length -and [int][char]$Line[$i + 1] -eq 34) {
        [void]$current.Append([char]34)
        $i++
      } else {
        $inQuotes = -not $inQuotes
      }
    } elseif ($char -eq "," -and -not $inQuotes) {
      $values.Add($current.ToString())
      [void]$current.Clear()
    } else {
      [void]$current.Append($char)
    }
  }
  $values.Add($current.ToString())
  return $values.ToArray()
}

function New-Accumulator {
  return [ordered]@{
    count = 0
    priceSum = 0.0
    imbalanceSum = 0.0
    windSum = 0.0
    solarSum = 0.0
    thermalSum = 0.0
    priceMax = [double]::MinValue
    priceMin = [double]::MaxValue
    windMax = 0.0
    solarMax = 0.0
    netRevenue = 0.0
  }
}

function Add-Accumulator {
  param(
    [System.Collections.IDictionary]$Accumulator,
    [double]$Price,
    [double]$Imbalance,
    [double]$Wind,
    [double]$Solar,
    [double]$Thermal
  )

  $generation = $Wind + $Solar + $Thermal
  $Accumulator.count++
  $Accumulator.priceSum += $Price
  $Accumulator.imbalanceSum += $Imbalance
  $Accumulator.windSum += $Wind
  $Accumulator.solarSum += $Solar
  $Accumulator.thermalSum += $Thermal
  $Accumulator.windMax = [math]::Max($Accumulator.windMax, $Wind)
  $Accumulator.solarMax = [math]::Max($Accumulator.solarMax, $Solar)
  if ($Price -gt $Accumulator.priceMax) { $Accumulator.priceMax = $Price }
  if ($Price -lt $Accumulator.priceMin) { $Accumulator.priceMin = $Price }
  $Accumulator.netRevenue += $generation * $Price * 0.25
}

function Complete-Accumulator {
  param([System.Collections.IDictionary]$Accumulator)

  $count = [math]::Max(1, $Accumulator.count)
  return [ordered]@{
    count = $Accumulator.count
    avgPrice = Round-Number ($Accumulator.priceSum / $count) 2
    avgImbalancePrice = Round-Number ($Accumulator.imbalanceSum / $count) 2
    avgWind = Round-Number ($Accumulator.windSum / $count) 2
    avgSolar = Round-Number ($Accumulator.solarSum / $count) 2
    avgThermal = Round-Number ($Accumulator.thermalSum / $count) 2
    avgRenewable = Round-Number (($Accumulator.windSum + $Accumulator.solarSum) / $count) 2
    avgGeneration = Round-Number (($Accumulator.windSum + $Accumulator.solarSum + $Accumulator.thermalSum) / $count) 2
    maxPrice = Round-Number $Accumulator.priceMax 2
    minPrice = Round-Number $Accumulator.priceMin 2
    maxWind = Round-Number $Accumulator.windMax 2
    maxSolar = Round-Number $Accumulator.solarMax 2
    revenueWan = Round-Number ($Accumulator.netRevenue / 10000) 2
  }
}

function Get-RenewableYearRows {
  param(
    [string]$FilePath,
    [int]$Year
  )

  $rows = @{}
  $stream = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
  try {
    [void]$reader.ReadLine()
    while (-not $reader.EndOfStream) {
      $line = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      $cols = ConvertFrom-CsvLine $line
      if ($cols.Count -lt 2) { continue }
      $time = [datetime]::ParseExact($cols[0], "dd/MM/yyyy HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)
      if ($time.Year -ne $Year) { continue }
      $rows[$time.ToString("yyyy-MM-dd HH:mm")] = ConvertTo-Number $cols[1]
    }
  } finally {
    $reader.Dispose()
    $stream.Dispose()
  }
  return $rows
}

function Get-ZipText {
  param($Zip, [string]$Name)

  $entry = $Zip.GetEntry($Name)
  if (-not $entry) { return $null }
  $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-CellText {
  param($Cell, [string[]]$Shared)

  if ($Cell.t -eq "inlineStr") {
    $parts = @()
    foreach ($t in $Cell.SelectNodes(".//m:t", $script:SheetNamespace)) { $parts += $t.InnerText }
    return ($parts -join "")
  }

  $value = $Cell.v
  if ($null -eq $value) { return "" }
  $text = [string]$value
  if ($Cell.t -eq "s" -and $text -ne "") { return $Shared[[int]$text] }
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
    [int]$SheetIndex
  )

  $fs = [System.IO.File]::Open((Resolve-Path -LiteralPath $Path), [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Read, $false)
    try {
      [xml]$sharedXml = Get-ZipText $zip "xl/sharedStrings.xml"
      $sharedNs = New-Object System.Xml.XmlNamespaceManager($sharedXml.NameTable)
      $sharedNs.AddNamespace("m", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
      $shared = @()
      foreach ($si in $sharedXml.SelectNodes("//m:si", $sharedNs)) {
        $parts = @()
        foreach ($t in $si.SelectNodes(".//m:t", $sharedNs)) { $parts += $t.InnerText }
        $shared += ($parts -join "")
      }

      [xml]$sheet = Get-ZipText $zip "xl/worksheets/sheet$SheetIndex.xml"
      $sheetNs = New-Object System.Xml.XmlNamespaceManager($sheet.NameTable)
      $sheetNs.AddNamespace("m", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
      $script:SheetNamespace = $sheetNs
      $result = New-Object System.Collections.Generic.List[object]
      foreach ($row in $sheet.SelectNodes("//m:sheetData/m:row", $sheetNs)) {
        $values = New-Object System.Collections.Generic.List[string]
        foreach ($cell in $row.SelectNodes("m:c", $sheetNs)) {
          $columnIndex = Get-ColumnIndex $cell.r
          while ($values.Count -le $columnIndex) { $values.Add("") }
          $values[$columnIndex] = (Get-CellText $cell $shared)
        }
        $rowIndex = [math]::Max(0, [int]$row.r - 1)
        while ($result.Count -le $rowIndex) { $result.Add(@()) }
        $result[$rowIndex] = $values.ToArray()
      }
      return $result.ToArray()
    } finally {
      $zip.Dispose()
    }
  } finally {
    $fs.Dispose()
  }
}

function Get-FirstNumericByLabel {
  param(
    [object[]]$Rows,
    [string]$Label
  )

  foreach ($row in $Rows) {
    if ($row.Count -ge 2 -and [string]$row[0] -eq $Label) {
      return ConvertTo-Number $row[1]
    }
  }
  return 0.0
}

function Get-FirstTextByLabel {
  param(
    [object[]]$Rows,
    [string]$Label
  )

  foreach ($row in $Rows) {
    if ($row.Count -ge 2 -and [string]$row[0] -eq $Label) {
      return [string]$row[1]
    }
  }
  return ""
}

function Get-VppParams {
  $files = @(
    @{ id = "VPP1"; file = "VPP1_光伏储能_机组参数.xlsx"; name = "VPP1 光伏储能"; source = "光伏"; color = "#fbbf24" },
    @{ id = "VPP2"; file = "VPP2_风电储能_机组参数.xlsx"; name = "VPP2 风电储能"; source = "风电"; color = "#14b8a6" },
    @{ id = "VPP3"; file = "VPP3_光伏火电储能_机组参数.xlsx"; name = "VPP3 光伏火电储能"; source = "光伏+火电"; color = "#3b82f6" }
  )

  $items = @()
  foreach ($item in $files) {
    $path = Join-Path $DatasetRoot $item.file
    $sheetRows = Read-XlsxSheet $path 2
    $coverRows = Read-XlsxSheet $path 1
    $capacity = 0.0
    if ($item.id -eq "VPP1") { $capacity = Get-FirstNumericByLabel $coverRows "光伏发电容量" }
    if ($item.id -eq "VPP2") { $capacity = Get-FirstNumericByLabel $coverRows "风力发电容量" }
    if ($item.id -eq "VPP3") { $capacity = Get-FirstNumericByLabel $coverRows "总发电容量" }

    $items += [ordered]@{
      id = $item.id
      name = $item.name
      source = $item.source
      color = $item.color
      capacityMw = Round-Number $capacity 2
      ratedCapacityMw = Round-Number (Get-FirstNumericByLabel $sheetRows "额定装机容量") 2
      storageMwh = Round-Number (Get-FirstNumericByLabel $sheetRows "储能实际容量 (E_max)") 3
      storageMw = Round-Number (Get-FirstNumericByLabel $sheetRows "储能最大功率 (P_max)") 3
      socRange = "10% ~ 90%"
      algorithm = Get-FirstTextByLabel $sheetRows "算法"
      network = Get-FirstTextByLabel $sheetRows "网络结构"
      inputSize = [int](Get-FirstNumericByLabel $sheetRows "输入维度 (in_size)")
      hiddenSize = [int](Get-FirstNumericByLabel $sheetRows "隐藏层维度 (hidden_size)")
      outputSize = [int](Get-FirstNumericByLabel $sheetRows "输出维度 (out_size)")
      horizon = [int](Get-FirstNumericByLabel $sheetRows "时间步长 (T_horizon)")
      learningRate = Get-FirstNumericByLabel $sheetRows "学习率"
      gamma = Get-FirstNumericByLabel $sheetRows "折扣因子 (gamma)"
      lambda = Get-FirstNumericByLabel $sheetRows "GAE参数 (lambda)"
      epsClip = Get-FirstNumericByLabel $sheetRows "裁剪系数 (eps_clip)"
      totalEpisode = [int](Get-FirstNumericByLabel $sheetRows "训练轮数 (total_episode)")
      gradClip = Get-FirstNumericByLabel $sheetRows "梯度裁剪 (max_grad_norm)"
    }
  }
  return $items
}

function Normalize-Text {
  param([object]$Value)

  if ($null -eq $Value) { return "" }
  return (([string]$Value) -replace "\s+", " ").Trim()
}

function Get-RowCell {
  param(
    [object[]]$Rows,
    [int]$RowIndex,
    [int]$ColumnIndex
  )

  if ($RowIndex -lt 0 -or $RowIndex -ge $Rows.Count) { return "" }
  $row = $Rows[$RowIndex]
  if ($ColumnIndex -lt 0 -or $ColumnIndex -ge $row.Count) { return "" }
  return Normalize-Text $row[$ColumnIndex]
}

function Get-AlgorithmId {
  param([string]$Name)

  $key = (Normalize-Text $Name).Split(" ")[0].Split("(")[0]
  switch ($key.ToLowerInvariant()) {
    "deepbid" { return "deepBid" }
    "arbitrage" { return "arbitrage" }
    "deepcomp" { return "deepComp" }
    "fb" { return "fb" }
    "so" { return "so" }
    default { return ($key -replace "[^A-Za-z0-9]", "").ToLowerInvariant() }
  }
}

function Get-AlgorithmDisplay {
  param([string]$DisplayName)

  $display = Normalize-Text $DisplayName
  $name = $display
  $role = ""
  if ($display -match "^(.*?)\s*\((.*?)\)$") {
    $name = $Matches[1].Trim()
    $role = $Matches[2].Trim()
  }
  return [ordered]@{
    id = Get-AlgorithmId $name
    name = $name
    role = $role
    displayName = $display
  }
}

function Add-AlgorithmParameter {
  param(
    [System.Collections.Generic.List[object]]$Parameters,
    [string]$Label,
    [string]$Value,
    [string]$Description = ""
  )

  $cleanLabel = Normalize-Text $Label
  $cleanValue = Normalize-Text $Value
  if ($cleanLabel -eq "" -or $cleanValue -eq "") { return }
  if ($cleanLabel -match "^[一二三四五六七八九十]+、") { return }
  $Parameters.Add([ordered]@{
    label = $cleanLabel
    value = $cleanValue
    description = Normalize-Text $Description
  })
}

function Add-AlgorithmDetailSection {
  param(
    [System.Collections.IDictionary]$AlgorithmMap,
    [object[]]$Rows,
    [int]$HeaderRowIndex,
    [int]$LabelColumn,
    [int]$ValueColumn,
    [int]$DescriptionColumn,
    [int]$EndRowIndex
  )

  $header = Get-RowCell $Rows $HeaderRowIndex $LabelColumn
  if ($header -eq "") { return }

  $name = $header
  if ($header -match "【(.+?)】") { $name = $Matches[1] }
  $id = Get-AlgorithmId $name
  if (-not $AlgorithmMap.Contains($id)) {
    $display = Get-AlgorithmDisplay $name
    $AlgorithmMap[$id] = [ordered]@{
      id = $display.id
      name = $display.name
      role = $display.role
      displayName = $display.displayName
      category = ""
      coreFunction = ""
      actionDefinition = ""
      objective = ""
      trainingBudget = ""
      parameters = New-Object System.Collections.Generic.List[object]
    }
  }

  $algorithm = $AlgorithmMap[$id]
  if (-not $algorithm.Contains("sectionTitle")) { $algorithm.sectionTitle = $header }

  for ($i = $HeaderRowIndex + 1; $i -lt $EndRowIndex; $i++) {
    Add-AlgorithmParameter `
      $algorithm.parameters `
      (Get-RowCell $Rows $i $LabelColumn) `
      (Get-RowCell $Rows $i $ValueColumn) `
      (Get-RowCell $Rows $i $DescriptionColumn)
  }
}

function Get-AlgorithmConfig {
  $path = Join-Path $DatasetRoot "算法配置.xlsx"
  $rows = Read-XlsxSheet $path 1
  $map = [ordered]@{}
  $overview = New-Object System.Collections.Generic.List[object]

  for ($column = 1; $column -le 5; $column++) {
    $display = Get-AlgorithmDisplay (Get-RowCell $rows 0 $column)
    if ($display.name -eq "") { continue }
    $item = [ordered]@{
      id = $display.id
      name = $display.name
      role = $display.role
      displayName = $display.displayName
      category = Get-RowCell $rows 1 $column
      coreFunction = Get-RowCell $rows 2 $column
      actionDefinition = Get-RowCell $rows 3 $column
      objective = Get-RowCell $rows 4 $column
      trainingBudget = Get-RowCell $rows 5 $column
      parameters = New-Object System.Collections.Generic.List[object]
    }
    $map[$item.id] = $item
    $overview.Add([ordered]@{
      id = $item.id
      displayName = $item.displayName
      category = $item.category
      coreFunction = $item.coreFunction
      actionDefinition = $item.actionDefinition
      objective = $item.objective
      trainingBudget = $item.trainingBudget
    })
  }

  for ($i = 7; $i -lt [math]::Min(37, $rows.Count); $i++) {
    Add-AlgorithmParameter `
      $map["deepBid"].parameters `
      (Get-RowCell $rows $i 0) `
      (Get-RowCell $rows $i 1) `
      (Get-RowCell $rows $i 2)
  }

  Add-AlgorithmDetailSection $map $rows 3 10 11 12 24
  Add-AlgorithmDetailSection $map $rows 24 10 11 12 45
  Add-AlgorithmDetailSection $map $rows 45 10 11 12 $rows.Count
  Add-AlgorithmDetailSection $map $rows 3 16 17 18 $rows.Count

  $algorithms = @()
  foreach ($key in $map.Keys) {
    $algorithm = $map[$key]
    $algorithm.parameters = $algorithm.parameters.ToArray()
    $algorithms += $algorithm
  }

  return [ordered]@{
    sourceFile = "../数据集/算法配置.xlsx"
    sourceSheet = "Sheet1"
    sourceRanges = [ordered]@{
      overview = "A1:F6"
      deepBid = "A8:C37"
      arbitrage = "K4:M22"
      deepComp = "K25:M43"
      fb = "K46:M65"
      so = "Q4:S18"
    }
    lastModified = (Get-Item -LiteralPath $path).LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
    overview = $overview.ToArray()
    algorithms = $algorithms
  }
}

function Get-ThermalOutput {
  param([int]$Hour)

  $morning = 0.25 * [math]::Exp(-1 * [math]::Pow($Hour - 10, 2) / 4)
  $evening = 0.20 * [math]::Exp(-1 * [math]::Pow($Hour - 19, 2) / 4)
  $thermalPu = 0.55 + $morning + $evening
  $thermalPu = [math]::Min(0.95, [math]::Max(0.4, $thermalPu))
  return $thermalPu * 50.0
}

$years = @(2016, 2017, 2018, 2019)
$yearData = [ordered]@{}
$dates = New-Object System.Collections.Generic.List[string]
$dailySeries = [ordered]@{}
$overall = New-Accumulator

foreach ($year in $years) {
  Write-Host "Aggregating $year ..."
  $windPath = Join-Path $DatasetRoot ("{0}年风电数据.csv" -f ($year - 2000))
  $solarPath = Join-Path $DatasetRoot ("{0}年光伏数据.csv" -f ($year - 2000))
  $pricePath = Join-Path $DatasetRoot "16-19年电价数据.csv"

  $windRows = Get-RenewableYearRows $windPath $year
  $solarRows = Get-RenewableYearRows $solarPath $year
  $monthly = @{}
  $hourly = @{}
  $daily = @{}
  $yearAccumulator = New-Accumulator

  for ($m = 1; $m -le 12; $m++) { $monthly[$m] = New-Accumulator }
  for ($h = 0; $h -lt 24; $h++) { $hourly[$h] = New-Accumulator }

  $priceStream = [System.IO.File]::Open($pricePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  $reader = New-Object System.IO.StreamReader($priceStream, [System.Text.Encoding]::UTF8)
  try {
    [void]$reader.ReadLine()
    while (-not $reader.EndOfStream) {
      $line = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      $cols = ConvertFrom-CsvLine $line
      if ($cols.Count -lt 5) { continue }
      $time = [datetime]::ParseExact($cols[0], "dd/MM/yyyy HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)
      if ($time.Year -ne $year) { continue }
      $key = $time.ToString("yyyy-MM-dd HH:mm")
      if (-not $windRows.ContainsKey($key) -or -not $solarRows.ContainsKey($key)) { continue }

      $price = ConvertTo-Number $cols[3]
      $imbalance = ConvertTo-Number $cols[4]
      $wind = [double]$windRows[$key]
      $solar = [double]$solarRows[$key]
      $thermal = Get-ThermalOutput $time.Hour
      $dateKey = $time.ToString("yyyy-MM-dd")

      Add-Accumulator $yearAccumulator $price $imbalance $wind $solar $thermal
      Add-Accumulator $monthly[$time.Month] $price $imbalance $wind $solar $thermal
      Add-Accumulator $hourly[$time.Hour] $price $imbalance $wind $solar $thermal
      Add-Accumulator $overall $price $imbalance $wind $solar $thermal

      $dayKey = $time.ToString("MM-dd")
      if (-not $daily.ContainsKey($dayKey)) { $daily[$dayKey] = New-Accumulator }
      Add-Accumulator $daily[$dayKey] $price $imbalance $wind $solar $thermal

      if (-not $dailySeries.Contains($dateKey)) {
        $dailySeries[$dateKey] = @()
        $dates.Add($dateKey)
      }
      $dailySeries[$dateKey] += [ordered]@{
        time = $time.ToString("HH:mm")
        price = Round-Number $price 2
        wind = Round-Number $wind 2
        solar = Round-Number $solar 2
        thermal = Round-Number $thermal 2
      }
    }
  } finally {
    $reader.Dispose()
    $priceStream.Dispose()
  }

  $monthItems = @()
  for ($m = 1; $m -le 12; $m++) {
    $summary = Complete-Accumulator $monthly[$m]
    $summary.month = "{0}月" -f $m
    $monthItems += $summary
  }

  $hourItems = @()
  for ($h = 0; $h -lt 24; $h++) {
    $summary = Complete-Accumulator $hourly[$h]
    $summary.hour = "{0}:00" -f $h
    $hourItems += $summary
  }

  $dailyItems = @()
  foreach ($day in ($daily.Keys | Sort-Object)) {
    $summary = Complete-Accumulator $daily[$day]
    $summary.day = $day
    $dailyItems += $summary
  }

  $summaryYear = Complete-Accumulator $yearAccumulator
  $summaryYear.year = $year
  $summaryYear.totalWindGwh = Round-Number ($yearAccumulator.windSum * 0.25 / 1000) 2
  $summaryYear.totalSolarGwh = Round-Number ($yearAccumulator.solarSum * 0.25 / 1000) 2
  $summaryYear.totalThermalGwh = Round-Number ($yearAccumulator.thermalSum * 0.25 / 1000) 2
  $summaryYear.totalRenewableGwh = Round-Number (($yearAccumulator.windSum + $yearAccumulator.solarSum) * 0.25 / 1000) 2
  $summaryYear.totalGenerationGwh = Round-Number (($yearAccumulator.windSum + $yearAccumulator.solarSum + $yearAccumulator.thermalSum) * 0.25 / 1000) 2
  $summaryYear.renewableShare = Round-Number ((($yearAccumulator.windSum + $yearAccumulator.solarSum) / [math]::Max(1, ($yearAccumulator.windSum + $yearAccumulator.solarSum + $yearAccumulator.thermalSum))) * 100) 1

  $yearData[[string]$year] = [ordered]@{
    summary = $summaryYear
    monthly = $monthItems
    hourly = $hourItems
    daily = $dailyItems
  }
}

$vpps = Get-VppParams
$algorithmConfig = Get-AlgorithmConfig

$overallSummary = Complete-Accumulator $overall
$overallSummary.totalWindGwh = Round-Number ($overall.windSum * 0.25 / 1000) 2
$overallSummary.totalSolarGwh = Round-Number ($overall.solarSum * 0.25 / 1000) 2
$overallSummary.totalThermalGwh = Round-Number ($overall.thermalSum * 0.25 / 1000) 2
$overallSummary.totalGenerationGwh = Round-Number (($overall.windSum + $overall.solarSum + $overall.thermalSum) * 0.25 / 1000) 2
$overallSummary.renewableShare = Round-Number ((($overall.windSum + $overall.solarSum) / [math]::Max(1, ($overall.windSum + $overall.solarSum + $overall.thermalSum))) * 100) 1

$dataset = [ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  source = "数据集"
  years = $years
  dates = $dates.ToArray()
  vpps = $vpps
  algorithmConfig = $algorithmConfig
  summary = $overallSummary
  yearData = $yearData
  dailySeries = $dailySeries
}

$json = $dataset | ConvertTo-Json -Depth 12 -Compress
$js = @"
window.VPP_MARKET_DATA = $json;
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $js, $utf8NoBom)
Write-Host "Wrote $OutputPath"
