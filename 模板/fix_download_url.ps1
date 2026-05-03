$CY_DIR = Join-Path $PSScriptRoot "../CY_影视"

function Encode-PathComponent {
    param($Part)
    [System.Uri]::EscapeDataString($Part)
}

function Get-ExpectedDownloadUrl {
    param($FileName)
    $encodedFileName = $FileName.Split('/\\') | ForEach-Object { Encode-PathComponent $_ }
    $encodedFileName = $encodedFileName -join '/'
    return "https://raw.githubusercontent.com/caiya0501/OmniBox-Spider/refs/heads/main/CY_%E5%BD%B1%E8%A7%86/${encodedFileName}"
}

function Extract-DownloadUrl {
    param($FilePath)
    try {
        $content = Get-Content $FilePath -Raw -Encoding UTF8
        if ($content -match '@downloadURL\s+(.+)') {
            return $matches[1].Trim()
        }
        return $null
    } catch {
        return $null
    }
}

function Check-AndFixFile {
    param($FilePath, $FileName)

    $currentUrl = Extract-DownloadUrl -FilePath $FilePath
    if (-not $currentUrl) {
        Write-Host "  [无@downloadURL] $FileName" -ForegroundColor Yellow
        return $false
    }

    $expectedUrl = Get-ExpectedDownloadUrl -FileName $FileName

    if ($currentUrl -ne $expectedUrl) {
        Write-Host "  [需要修复] $FileName" -ForegroundColor Red
        Write-Host "    当前: $currentUrl" -ForegroundColor Gray
        Write-Host "    期望: $expectedUrl" -ForegroundColor Gray

        try {
            $content = Get-Content $FilePath -Raw -Encoding UTF8
            $content = $content -replace '@downloadURL\s+.+', "@downloadURL $expectedUrl"
            [System.IO.File]::WriteAllText($FilePath, $content, [System.Text.Encoding]::UTF8)
            Write-Host "    ✓ 已修复" -ForegroundColor Green
            return $true
        } catch {
            Write-Host "    ✗ 修复失败: $_" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "  [正确] $FileName" -ForegroundColor Green
        return $false
    }
}

Write-Host "开始检查 @downloadURL...`n" -ForegroundColor Cyan

$jsFiles = Get-ChildItem -Path $CY_DIR -Filter "*.js" | Where-Object { $_.Name -ne "api_test_results.csv" }
$fixedCount = 0

foreach ($file in $jsFiles) {
    $filePath = $file.FullName
    $fileName = $file.Name
    if (Check-AndFixFile -FilePath $filePath -FileName $fileName) {
        $fixedCount++
    }
}

Write-Host "`n检查完成，共修复 $fixedCount 个文件" -ForegroundColor Cyan
