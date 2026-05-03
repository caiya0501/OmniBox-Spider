<#
=============================================
  源管理工具 - 源测试和管理 (PowerShell版)
  作者：OmniBox开发
  日期：2026-05-04
  版本：1.0
=============================================

功能说明：
1. 读取CSV测试结果
2. 测试源的API可用性
3. 更新CSV文件
4. 删除失效源
5. 确保有效源有完整的排序功能
=============================================
#>

$CY_DIR = Join-Path $PSScriptRoot "../CY_影视"
$CSV_PATH = Join-Path $CY_DIR "api_test_results.csv"

# ============== 工具函数 ==============

function Read-CSV {
    try {
        if (Test-Path $CSV_PATH) {
            $data = Import-Csv -Path $CSV_PATH -Encoding UTF8
            return $data
        }
        return @()
    } catch {
        Write-Host "读取CSV失败: $_" -ForegroundColor Red
        return @()
    }
}

function Write-CSV {
    param($Data)
    try {
        $Data | Export-Csv -Path $CSV_PATH -Encoding UTF8 -NoTypeInformation
        Write-Host "CSV已更新: $CSV_PATH" -ForegroundColor Green
    } catch {
        Write-Host "写入CSV失败: $_" -ForegroundColor Red
    }
}

function Extract-ApiUrl {
    param($FilePath)
    try {
        if (Test-Path $FilePath) {
            $content = Get-Content $FilePath -Raw -Encoding UTF8
            if ($content -match 'const\s+SITE_API\s*=\s*["'']([^"'']+)["'']') {
                return $matches[1]
            }
        }
        return $null
    } catch {
        return $null
    }
}

function Test-HasSortCode {
    param($FilePath)
    try {
        if (Test-Path $FilePath) {
            $content = Get-Content $FilePath -Raw -Encoding UTF8
            $hasPriority = $content -match 'MOVIE_PRIORITY'
            $hasSort = $content -match 'other\.sort' -or $content -match 'movieChildren\.sort'
            return $hasPriority -and $hasSort
        }
        return $false
    } catch {
        return $false
    }
}

function Test-ApiUrl {
    param($ApiUrl)
    if (-not $ApiUrl) {
        return @{ Status = "Error"; StatusCode = "No API URL found" }
    }

    try {
        $headers = @{
            "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        $response = Invoke-WebRequest -Uri $ApiUrl -Headers $headers -TimeoutSec 10 -Method Get -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            return @{ Status = "Valid"; StatusCode = $response.StatusCode.ToString() }
        } else {
            return @{ Status = "Error"; StatusCode = $response.StatusCode.ToString() }
        }
    } catch {
        $errorMsg = $_.Exception.Message
        if ($errorMsg.Length -gt 100) {
            $errorMsg = $errorMsg.Substring(0, 100)
        }
        return @{ Status = "Error"; StatusCode = $errorMsg }
    }
}

function Add-SortCode {
    param($FilePath)
    try {
        if (-not (Test-Path $FilePath)) {
            return $false
        }

        $content = Get-Content $FilePath -Raw -Encoding UTF8
        $modified = $false

        # 添加MOVIE_PRIORITY常量
        if (-not ($content -match 'MOVIE_PRIORITY')) {
            if ($content -match '(const\s+SITE_API\s*=\s*[^;]+;\s*(const\s+BASE_DOMAIN\s*=\s*[^;]+;)?)') {
                $sortConstants = @"


// ============== 核心：定义需要优先排在前面的电影分类（可自行增删） ==============
const MOVIE_PRIORITY = process.env.MOVIE_PRIORITY || "动作片,惊悚片,科幻片,喜剧片,爱情片,恐怖片,悬疑片,冒险片,动画电影";
const MOVIE_PRIORITY_TYPES = MOVIE_PRIORITY.split(',');
"@
                $content = $content -replace [regex]::Escape($matches[0]), ($matches[0] + $sortConstants)
                $modified = $true
            }
        }

        # 添加排序逻辑
        if ($FilePath -match 'CY_ikun\.js|CY_PS_ikun\.js') {
            if (-not ($content -match 'movieChildren\.sort')) {
                if ($content -match '(const\s+movieChildren\s*=\s*[^;]+;)') {
                    $sortCode = @"
            // ============== 关键：给电影子分类排序（优先级分类靠前） ==============
            movieChildren.sort((a, b) => {
                const isAPriority = MOVIE_PRIORITY_TYPES.includes(a.type_name);
                const isBPriority = MOVIE_PRIORITY_TYPES.includes(b.type_name);
                if (isAPriority && !isBPriority) return -1;
                if (!isAPriority && isBPriority) return 1;
                return 0;
            });
"@
                    $content = $content -replace [regex]::Escape($matches[0]), ($matches[0] + $sortCode)
                    $modified = $true
                }
            }
        } else {
            if (-not ($content -match 'other\.sort')) {
                if ($content -match '(const\s+other\s*=\s*top\.filter\([^)]+\);?)') {
                    $sortCode = @"
        // ============== 关键：给 other 排序（电影分类靠前，其他靠后） ==============
        other.sort((a, b) => {
            const isAMovie = MOVIE_PRIORITY_TYPES.includes(a.type_name);
            const isBMovie = MOVIE_PRIORITY_TYPES.includes(b.type_name);
            if (isAMovie && !isBMovie) return -1;
            if (!isAMovie && isBMovie) return 1;
            return 0;
        });
"@
                    $content = $content -replace [regex]::Escape($matches[0]), ($matches[0] + $sortCode)
                    $modified = $true
                }
            }
        }

        if ($modified) {
            [System.IO.File]::WriteAllText($FilePath, $content, [System.Text.Encoding]::UTF8)
            return $true
        }
        return $false
    } catch {
        Write-Host "添加排序代码失败 $FilePath : $_" -ForegroundColor Red
        return $false
    }
}

# ============== 主函数 ==============

function Main {
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  源管理工具 - 开始执行" -ForegroundColor Cyan
    Write-Host "=============================================`n" -ForegroundColor Cyan

    # 1. 读取CSV
    Write-Host "步骤1: 读取CSV文件..." -ForegroundColor Yellow
    $csvData = Read-CSV
    Write-Host "  读取到 $($csvData.Count) 条记录`n"

    # 2. 获取当前目录的JS文件
    Write-Host "步骤2: 获取当前目录文件..." -ForegroundColor Yellow
    $currentFiles = Get-ChildItem -Path $CY_DIR -Filter "*.js" | Where-Object { $_.Name -ne "api_test_results.csv" } | Select-Object -ExpandProperty Name
    Write-Host "  当前目录有 $($currentFiles.Count) 个JS文件`n"

    # 3. 合并CSV和当前文件
    Write-Host "步骤3: 合并源信息..." -ForegroundColor Yellow
    $fileMap = @{}

    # 添加CSV中的文件
    foreach ($row in $csvData) {
        if ($row.FileName) {
            $fileMap[$row.FileName] = @{
                FileName = $row.FileName
                APIUrl = $row.APIUrl
                Status = $row.Status
                StatusCode = $row.StatusCode
                exists = $currentFiles -contains $row.FileName
            }
        }
    }

    # 添加当前目录中不在CSV的文件
    foreach ($file in $currentFiles) {
        if (-not $fileMap.ContainsKey($file)) {
            $filePath = Join-Path $CY_DIR $file
            $apiUrl = Extract-ApiUrl $filePath
            $fileMap[$file] = @{
                FileName = $file
                APIUrl = if ($apiUrl) { $apiUrl } else { "" }
                Status = "Unknown"
                StatusCode = ""
                exists = $true
            }
        }
    }

    $allFiles = $fileMap.Values
    Write-Host "  共 $($allFiles.Count) 个源需要处理`n"

    # 4. 测试所有存在的源
    Write-Host "步骤4: 测试源的可用性..." -ForegroundColor Yellow
    $testResults = @()

    foreach ($file in $allFiles) {
        $filePath = Join-Path $CY_DIR $file.FileName

        if (-not $file.exists) {
            Write-Host "  [跳过] $($file.FileName) - 文件不存在" -ForegroundColor Gray
            $testResults += [PSCustomObject]@{
                FileName = $file.FileName
                APIUrl = $file.APIUrl
                Status = $file.Status
                StatusCode = $file.StatusCode
                HasSortCode = $false
            }
            continue
        }

        Write-Host "  [测试] $($file.FileName)..." -ForegroundColor White

        # 提取API URL
        $apiUrl = Extract-ApiUrl $filePath
        if (-not $apiUrl) { $apiUrl = $file.APIUrl }

        # 测试API
        $testResult = Test-ApiUrl -ApiUrl $apiUrl

        # 检查是否有排序代码
        $hasSort = Test-HasSortCode -FilePath $filePath

        $resultObj = [PSCustomObject]@{
            FileName = $file.FileName
            APIUrl = $apiUrl
            Status = $testResult.Status
            StatusCode = $testResult.StatusCode
            HasSortCode = $hasSort
        }
        $testResults += $resultObj

        Write-Host "    API: $($apiUrl -or 'N/A')" -ForegroundColor DarkGray
        if ($testResult.Status -eq "Valid") {
            Write-Host "    状态: $($testResult.Status) ($($testResult.StatusCode))" -ForegroundColor Green
        } else {
            Write-Host "    状态: $testResult.Status ($($testResult.StatusCode))" -ForegroundColor Red
        }
        if ($hasSort) {
            Write-Host "    排序代码: ✓ 有" -ForegroundColor Green
        } else {
            Write-Host "    排序代码: ✗ 无" -ForegroundColor Yellow
        }

        Start-Sleep -Milliseconds 300
    }

    # 5. 更新CSV
    Write-Host "`n步骤5: 更新CSV文件..." -ForegroundColor Yellow
    $csvUpdateData = $testResults | ForEach-Object {
        [PSCustomObject]@{
            FileName = $_.FileName
            APIUrl = $_.APIUrl
            Status = $_.Status
            StatusCode = $_.StatusCode
        }
    }
    Write-CSV -Data $csvUpdateData

    # 6. 处理文件 - 删除失效源，给有效源添加排序代码
    Write-Host "`n步骤6: 处理文件..." -ForegroundColor Yellow
    $deletedCount = 0
    $updatedCount = 0

    foreach ($result in $testResults) {
        $filePath = Join-Path $CY_DIR $result.FileName

        if (-not (Test-Path $filePath)) {
            continue
        }

        if ($result.Status -eq "Error") {
            # 删除失效源
            try {
                Remove-Item -Path $filePath -Force
                Write-Host "  [删除] $($result.FileName) - 源失效" -ForegroundColor Red
                $deletedCount++
            } catch {
                Write-Host "  [错误] 删除失败 $($result.FileName) : $_" -ForegroundColor Red
            }
        } elseif ($result.Status -eq "Valid" -and -not $result.HasSortCode) {
            # 给有效源添加排序代码
            Write-Host "  [更新] $($result.FileName) - 添加排序代码" -ForegroundColor Yellow
            if (Add-SortCode -FilePath $filePath) {
                $updatedCount++
                Write-Host "    ✓ 成功" -ForegroundColor Green
            }
        }
    }

    # 7. 总结
    Write-Host "`n=============================================" -ForegroundColor Cyan
    Write-Host "  执行完成总结" -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  总源数: $($allFiles.Count)"
    Write-Host "  有效源: $($($testResults | Where-Object { $_.Status -eq "Valid" }).Count)"
    Write-Host "  失效源: $($($testResults | Where-Object { $_.Status -eq "Error" }).Count)"
    Write-Host "  删除源: $deletedCount"
    Write-Host "  更新源: $updatedCount"
    Write-Host "=============================================" -ForegroundColor Cyan
}

Main
