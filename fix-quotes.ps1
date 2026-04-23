$filePath = "E:\Desktop\trpg_new\packages\server\src\services\ruleset-service.ts"
$bytes = [System.IO.File]::ReadAllBytes($filePath)

function Replace-Bytes {
    param($src, $find, $repl, [string]$label)
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
    Write-Host "  [$label] replaced $count occurrence(s)"
    return , $result.ToArray()
}

# Pattern A: ?', ' (in array, string ends with ?, followed by ', ')
# 3F 2C 20 27 => 3F 27 2C 20 27
Write-Host "Pattern A: missing ' before ', ' in arrays"
$bytes = Replace-Bytes $bytes @(0x3F, 0x2C, 0x20, 0x27) @(0x3F, 0x27, 0x2C, 0x20, 0x27) "A"

# Pattern B1: ?, at end of line (CRLF) - name fields
# 3F 2C 0D => 3F 27 2C 0D
Write-Host "Pattern B: missing ' before comma at end of line"
$bytes = Replace-Bytes $bytes @(0x3F, 0x2C, 0x0D) @(0x3F, 0x27, 0x2C, 0x0D) "B"

# Pattern C: ?] at end of array (before ],)
# 3F 5D 2C 0D => 3F 27 5D 2C 0D  
Write-Host "Pattern C: missing ' before ], at end of array"
$bytes = Replace-Bytes $bytes @(0x3F, 0x5D, 0x2C, 0x0D) @(0x3F, 0x27, 0x5D, 0x2C, 0x0D) "C"

# Pattern D: ?) at end of function arg in array format ?) }
# already done: 3F 29 20 7D 2C - check if any remain
# Also handle ?) at end of object with newline
Write-Host "Pattern D: remaining ?) }, patterns"
$bytes = Replace-Bytes $bytes @(0x3F, 0x29, 0x20, 0x7D, 0x2C) @(0x3F, 0x27, 0x29, 0x20, 0x7D, 0x2C) "D"

[System.IO.File]::WriteAllBytes($filePath, $bytes)
Write-Host "`nDone. Saved file."
