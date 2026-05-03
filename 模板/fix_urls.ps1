$CY_DIR = "d:\Backup\Desktop\AI TEST\OmniBox-Spider-PS\CY_影视"

function Get-UrlEncodedFileName {
    param($FileName)
    $encoded = [System.Uri]::EscapeDataString($FileName)
    return $encoded
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

function Get-FileNameFromUrl {
    param($Url)
    $decoded = [System.Uri]::UnescapeDataString($Url)
    $fileName = $decoded -replace '.*/', ''
    return $fileName
}

Write-Host "Checking @downloadURL for all files...`n" -ForegroundColor Cyan

$jsFiles = Get-ChildItem -Path $CY_DIR -Filter "*.js" | Where-Object { $_.Name -ne "api_test_results.csv" }
$issues = @()

foreach ($file in $jsFiles) {
    $filePath = $file.FullName
    $fileName = $file.Name

    $currentUrl = Extract-DownloadUrl -FilePath $filePath
    if (-not $currentUrl) {
        continue
    }

    $urlFileName = Get-FileNameFromUrl -Url $currentUrl
    $expectedUrlFileName = $fileName

    if ($urlFileName -ne $expectedUrlFileName) {
        Write-Host "[MISMATCH] $fileName" -ForegroundColor Red
        Write-Host "  URL has: $urlFileName" -ForegroundColor Yellow
        Write-Host "  Expected: $expectedUrlFileName" -ForegroundColor Yellow
        $issues += [PSCustomObject]@{
            FileName = $fileName
            FilePath = $filePath
            CurrentUrl = $currentUrl
            UrlFileName = $urlFileName
        }
    }
}

if ($issues.Count -eq 0) {
    Write-Host "`nAll @downloadURL are correct!" -ForegroundColor Green
} else {
    Write-Host "`nFound $($issues.Count) files with @downloadURL issues" -ForegroundColor Yellow
}
