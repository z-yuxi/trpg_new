$filePath = "E:\Desktop\trpg_new\packages\server\src\services\ruleset-service.ts"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

# Fix 1: Object string keys missing closing quote: 'skill?:  { => 'skill?': {
# Pattern: opening ', non-quote chars, ?, then : + spaces + {
$before1 = ($text | Select-String -Pattern "'[^'\n]+?\?:\s+\{" -AllMatches).Matches.Count
$text = $text -replace "('[^'\n]+?\?)(\:\s+\{)", '$1''$2'
$after1 = ($text | Select-String -Pattern "'[^'\n]+?\?:\s+\{" -AllMatches).Matches.Count
Write-Host "Fix 1 (object keys): $before1 -> $after1 remaining"

# Fix 2: Label values missing closing quote: 'skill?,  base => 'skill?',  base
# Pattern: opening ', non-quote-non-comma chars, ?, then , + spaces (multiple) + base/label
$before2 = ($text | Select-String -Pattern "'[^'\n,]+?\?,\s{2}" -AllMatches).Matches.Count
$text = $text -replace "('[^'\n,]+?\?)(,\s{2,})", '$1''$2'
$after2 = ($text | Select-String -Pattern "'[^'\n,]+?\?,\s{2}" -AllMatches).Matches.Count
Write-Host "Fix 2 (label values): $before2 -> $after2 remaining"

# Write back as UTF-8
$newBytes = [System.Text.Encoding]::UTF8.GetBytes($text)
[System.IO.File]::WriteAllBytes($filePath, $newBytes)
Write-Host "Done."

# Verify a few sample lines
$lines = $text.Split("`n")
Write-Host "`nSample fixed lines:"
for ($i = 880; $i -lt 900; $i++) {
    $l = $lines[$i]
    if ($l -match "^\s+'[^']*\?") {
        Write-Host "Line $($i+1): $l"
    }
}
