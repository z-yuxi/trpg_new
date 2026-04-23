$filePath = "E:\Desktop\trpg_new\packages\server\src\services\ruleset-service.ts"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$splitLines = $text.Split("`n")

Write-Host "Total lines: $($splitLines.Count)"

# Track running backtick parity to find where template is opened but not closed
$parity = 0
for ($i = 0; $i -lt [Math]::Min(580, $splitLines.Count); $i++) {
    $line = $splitLines[$i]
    $lineBytes = [System.Text.Encoding]::UTF8.GetBytes($line)
    $cnt = 0
    foreach ($b in $lineBytes) { if ($b -eq 0x60) { $cnt++ } }
    if ($cnt -gt 0) {
        $parity = ($parity + $cnt) % 2
        Write-Host "Line $($i+1): backticks=$cnt, running_parity=$parity | $($line.Substring(0,[Math]::Min(80,$line.Length)))"
    }
}
Write-Host "Final parity at line 580: $parity (0=balanced, 1=unmatched)"
