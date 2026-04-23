$filePath = "E:\Desktop\trpg_new\packages\server\src\services\ruleset-service.ts"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$splitLines = $text.Split("`n")

# Show lines 731-740 with hex
for ($i = 730; $i -lt 740; $i++) {
    $line = $splitLines[$i]
    $lineBytes = [System.Text.Encoding]::UTF8.GetBytes($line)
    Write-Host "Line $($i+1): $line"
    Write-Host "  Hex: $(($lineBytes | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')"
    Write-Host ""
}
