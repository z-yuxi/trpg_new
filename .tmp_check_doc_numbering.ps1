$ErrorActionPreference = "Stop"

$files = Get-ChildItem -Path "docs" -Recurse -File -Filter *.md
$issues = New-Object System.Collections.Generic.List[object]

foreach ($file in $files) {
  $lines = Get-Content -Path $file.FullName -Encoding UTF8

  $h2Last = $null
  $h3Map = @{}

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNo = $i + 1

    if ($line -match '^##\s+(\d+)\.\s+') {
      $n = [int]$Matches[1]
      if ($h2Last -ne $null -and $n -ne ($h2Last + 1)) {
        $issues.Add([pscustomobject]@{
          File = $file.FullName
          Line = $lineNo
          Type = "H2_SEQ"
          Detail = "H2 expected $($h2Last + 1), got $n"
          Text = $line.Trim()
        })
      }
      $h2Last = $n
      if (-not $h3Map.ContainsKey($n)) { $h3Map[$n] = $null }
      continue
    }

    if ($line -match '^###\s+(\d+)\.(\d+)\s+') {
      $p = [int]$Matches[1]
      $c = [int]$Matches[2]

      if ($h2Last -eq $null) {
        $issues.Add([pscustomobject]@{
          File = $file.FullName
          Line = $lineNo
          Type = "H3_NO_H2"
          Detail = "H3 appears before any H2"
          Text = $line.Trim()
        })
      } elseif ($p -ne $h2Last) {
        $issues.Add([pscustomobject]@{
          File = $file.FullName
          Line = $lineNo
          Type = "H3_PARENT"
          Detail = "H3 parent $p mismatches current H2 $h2Last"
          Text = $line.Trim()
        })
      }

      if (-not $h3Map.ContainsKey($p) -or $h3Map[$p] -eq $null) {
        if ($c -ne 1) {
          $issues.Add([pscustomobject]@{
            File = $file.FullName
            Line = $lineNo
            Type = "H3_START"
            Detail = "First H3 under $p should start at 1, got $c"
            Text = $line.Trim()
          })
        }
        $h3Map[$p] = $c
      } else {
        $expected = [int]$h3Map[$p] + 1
        if ($c -ne $expected) {
          $issues.Add([pscustomobject]@{
            File = $file.FullName
            Line = $lineNo
            Type = "H3_SEQ"
            Detail = "H3 under $p expected $expected, got $c"
            Text = $line.Trim()
          })
        }
        $h3Map[$p] = $c
      }
    }
  }
}

if ($issues.Count -eq 0) {
  "NO_ISSUES"
} else {
  $issues | Sort-Object File, Line | ForEach-Object {
    "{0}:{1}: [{2}] {3} || {4}" -f $_.File, $_.Line, $_.Type, $_.Detail, $_.Text
  }
}
