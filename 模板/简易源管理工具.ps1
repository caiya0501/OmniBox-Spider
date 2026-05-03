<#
=============================================
  简易源管理工具
  作者：OmniBox开发
  日期：2026-05-04
=============================================
#>

$CY_DIR = Join-Path $PSScriptRoot "../CY_影视"
$CSV_PATH = Join-Path $CY_DIR "api_test_results.csv"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  简易源管理工具" -ForegroundColor Cyan
Write-Host "=============================================`n" -ForegroundColor Cyan

# 1. 读取CSV
Write-Host "步骤1: 读取CSV文件..." -ForegroundColor Yellow
if (Test-Path $CSV_PATH) {
    $csvData = Import-Csv -Path $CSV_PATH -Encoding UTF8
    Write-Host "  读取到 $($csvData.Count) 条记录`n"
} else {
    Write-Host "  CSV文件不存在" -ForegroundColor Red
    exit
}

# 2. 获取当前目录文件
Write-Host "步骤2: 获取当前目录文件..." -ForegroundColor Yellow
$currentFiles = Get-ChildItem -Path $CY_DIR -Filter "*.js" | Where-Object { $_.Name -ne "api_test_results.csv" } | Select-Object -ExpandProperty Name
Write-Host "  当前目录有 $($currentFiles.Count) 个JS文件`n"

# 3. 根据CSV处理文件
Write-Host "步骤3: 处理源文件..." -ForegroundColor Yellow
$deletedCount = 0
$keptCount = 0

foreach ($row in $csvData) {
    $fileName = $row.FileName
    $status = $row.Status
    $filePath = Join-Path $CY_DIR $fileName
    
    if (-not (Test-Path $filePath)) {
        continue
    }
    
    if ($status -eq "Error") {
        try {
            Remove-Item -Path $filePath -Force
            Write-Host "  [删除] $fileName - CSV标记为失效" -ForegroundColor Red
            $deletedCount++
        } catch {
            Write-Host "  [错误] 删除失败 $fileName" -ForegroundColor Red
        }
    } else {
        Write-Host "  [保留] $fileName - CSV标记为有效" -ForegroundColor Green
        $keptCount++
    }
}

# 4. 检查当前目录中不在CSV的文件
Write-Host "`n步骤4: 检查额外文件..." -ForegroundColor Yellow
$extraFiles = @()
foreach ($file in $currentFiles) {
    $found = $false
    foreach ($row in $csvData) {
        if ($row.FileName -eq $file) {
            $found = $true
            break
        }
    }
    if (-not $found) {
        $extraFiles += $file
        Write-Host "  [额外] $file - CSV中无记录" -ForegroundColor Yellow
    }
}

# 5. 总结
Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "  执行完成" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  CSV总源数: $($csvData.Count)"
Write-Host "  删除源数: $deletedCount"
Write-Host "  保留源数: $keptCount"
Write-Host "  额外文件: $($extraFiles.Count)"
Write-Host "=============================================" -ForegroundColor Cyan
