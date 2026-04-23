$filePath = "E:\Desktop\trpg_new\packages\server\src\services\ruleset-service.ts"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$splitLines = $text.Split("`n")
$line500 = $splitLines[499]
$lineBytes = [System.Text.Encoding]::UTF8.GetBytes($line500)
Write-Host "Line 500 content: $line500"
Write-Host "Hex: $(($lineBytes | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')"
