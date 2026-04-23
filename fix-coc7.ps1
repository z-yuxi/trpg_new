$filePath = "E:\Desktop\trpg_new\packages\server\src\services\ruleset-service.ts"
$bytes = [System.IO.File]::ReadAllBytes($filePath)

function Replace-Bytes {
    param($src, $find, $repl)
    $result = New-Object System.Collections.Generic.List[byte]
    $i = 0
    $count = 0
    while ($i -lt $src.Length) {
        $match = $true
        if ($i -le ($src.Length - $find.Length)) {
            for ($j = 0; $j -lt $find.Length; $j++) {
                if ($src[$i + $j] -ne $find[$j]) { $match = $false; break }
            }
        } else { $match = $false }
        if ($match) {
            foreach ($b in $repl) { $result.Add($b) }
            $i += $find.Length
            $count++
        } else {
            $result.Add($src[$i])
            $i++
        }
    }
    Write-Host "  Pattern replaced $count time(s)"
    return , $result.ToArray()
}

# Fix 1: description strings - E9 94 9B 3F 2C (锛?,) => E9 94 9B 3F 27 2C (锛?',)
Write-Host "Fix 1: description closing quotes (锛?, -> 锛?',)"
$bytes = Replace-Bytes $bytes @(0xE9, 0x94, 0x9B, 0x3F, 0x2C) @(0xE9, 0x94, 0x9B, 0x3F, 0x27, 0x2C)

# Fix 2: skillCheckGraph/attrCheckGraph args - 3F 29 20 7D 2C (?) },) => 3F 27 29 20 7D 2C (?') },)
Write-Host "Fix 2: skillCheckGraph arg closing quotes (?) }, -> ?') },)"
$bytes = Replace-Bytes $bytes @(0x3F, 0x29, 0x20, 0x7D, 0x2C) @(0x3F, 0x27, 0x29, 0x20, 0x7D, 0x2C)

[System.IO.File]::WriteAllBytes($filePath, $bytes)
Write-Host "Done."

# Verify a few lines
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$lines = $text.Split("`n")
Write-Host ""
Write-Host "Verification of sample lines:"
Write-Host "Line 731: $($lines[730])"
Write-Host "Line 733: $($lines[732])"
Write-Host "Line 735: $($lines[734])"
