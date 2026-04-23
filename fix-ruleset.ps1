$filePath = "E:\Desktop\trpg_new\packages\server\src\services\ruleset-service.ts"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

# Fix 1: Line 500 - missing closing backtick in name field
# Replace garbled text + missing backtick: `${source.name}锛团ork锛塦,
# Target bytes: E9 94 9B E5 9C 98 6F 72 6B E9 94 9B E5 A1 A6 2C  => 20 28 46 6F 72 6B 29 60 2C (space)(F)(o)(r)(k)()`)(backtick)(,)
$search1  = [byte[]]@(0xE9, 0x94, 0x9B, 0xE5, 0x9C, 0x98, 0x6F, 0x72, 0x6B, 0xE9, 0x94, 0x9B, 0xE5, 0xA1, 0xA6, 0x2C)
$replace1 = [byte[]]@(0x20, 0x28, 0x46, 0x6F, 0x72, 0x6B, 0x29, 0x60, 0x2C)  # ' (Fork)`,'

# Fix 2: Lines 267 and 268 - missing $ before {o['total']} and {o['value']}
# The pattern is: (mojibake bytes for 锛?) + 3F 7B  => ... + 24 7B  (add $ = 0x24)
# Specifically looking for: E9 94 9B 3F 7B   (锛?{)  => E9 94 9B 24 7B  (锛?${)
$search2  = [byte[]]@(0xE9, 0x94, 0x9B, 0x3F, 0x7B)
$replace2 = [byte[]]@(0xE9, 0x94, 0x9B, 0x24, 0x7B)

function Replace-ByteSequence {
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
    Write-Host "  Replaced $count occurrence(s)"
    return , $result.ToArray()
}

Write-Host "Fix 1: line 500 unclosed backtick + garbled text"
$bytes = Replace-ByteSequence $bytes $search1 $replace1

Write-Host "Fix 2: lines 267-268 missing dollar sign"  
$bytes = Replace-ByteSequence $bytes $search2 $replace2

[System.IO.File]::WriteAllBytes($filePath, $bytes)
Write-Host "Done. Verifying fixed lines..."

$text2 = [System.Text.Encoding]::UTF8.GetString($bytes)
$lines = $text2.Split("`n")
Write-Host "Line 267: $($lines[266])"
Write-Host "Line 268: $($lines[267])"
Write-Host "Line 500: $($lines[499])"
