$filePath = "E:\Desktop\trpg_new\packages\server\src\services\ruleset-service.ts"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$splitLines = $text.Split("`n")

Write-Host "=== Lines 800-875 with hex ==="
for ($i = 799; $i -lt 875; $i++) {
    $line = $splitLines[$i]
    $lineBytes = [System.Text.Encoding]::UTF8.GetBytes($line)
    # Check for unmatched single quotes (odd count)
    $sqCount = ($lineBytes | Where-Object { $_ -eq 0x27 }).Count
    $marker = if ($sqCount % 2 -ne 0) { " <<< ODD QUOTES" } else { "" }
    Write-Host "Line $($i+1) [sq=$sqCount]$marker : $($line.Substring(0,[Math]::Min(120,$line.Length)))"
}
