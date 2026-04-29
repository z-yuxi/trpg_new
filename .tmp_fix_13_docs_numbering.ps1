$ErrorActionPreference = 'Stop'

$issuePath = "c:\Users\young\AppData\Roaming\Code\User\workspaceStorage\ebfa09a58fe142225c7920aba8b1bdba\GitHub.copilot-chat\chat-session-resources\bf1d46e2-a79b-4382-b86f-8f1c523171d2\call_VQMkgsA68v5WlAG073pXYJ1T__vscode-1777431592351\content.txt"
$issues = Get-Content $issuePath -Encoding UTF8

$profiles = @{}
Get-ChildItem docs -Recurse -File -Filter *.md | ForEach-Object {
  $text = Get-Content $_.FullName -Encoding UTF8
  $h2 = ($text | Where-Object { $_ -match '^##\s+\d+\.\s+' }).Count
  $profiles[$_.FullName] = $h2
}

$parsed = foreach ($l in $issues) {
  if ($l -match '^(.*?):(\d+): \[(.*?)\] (.*)$') {
    [pscustomobject]@{File=$Matches[1];Line=[int]$Matches[2];Type=$Matches[3];Msg=$Matches[4]}
  }
}

$targets = $parsed | Where-Object {
  $profiles.ContainsKey($_.File) -and $profiles[$_.File] -gt 0 -and $_.Type -ne 'H3_NO_H2'
} | Select-Object -ExpandProperty File -Unique

foreach ($file in $targets) {
  $lines = Get-Content -Path $file -Encoding UTF8
  $inFence = $false

  $newH2 = $null
  $lastH2Orig = $null
  $h3Counter = @{}

  for ($i=0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]

    if ($line -match '^```') {
      $inFence = -not $inFence
      continue
    }

    if ($inFence) { continue }

    if ($line -match '^(##\s+)(\d+)(\.\s+.*)$') {
      $prefix = $Matches[1]
      $orig = [int]$Matches[2]
      $suffix = $Matches[3]

      if ($newH2 -eq $null) {
        $newH2 = $orig
      } else {
        $newH2 = $newH2 + 1
      }

      $lastH2Orig = $orig
      if (-not $h3Counter.ContainsKey($newH2)) { $h3Counter[$newH2] = 0 }

      $lines[$i] = "$prefix$newH2$suffix"
      continue
    }

    if ($line -match '^(###\s+)(\d+)\.(\d+)(\s+.*)$') {
      $prefix = $Matches[1]
      $suffix = $Matches[4]

      if ($newH2 -ne $null) {
        if (-not $h3Counter.ContainsKey($newH2)) { $h3Counter[$newH2] = 0 }
        $h3Counter[$newH2] = [int]$h3Counter[$newH2] + 1
        $newH3 = [int]$h3Counter[$newH2]
        $lines[$i] = "$prefix$newH2.$newH3$suffix"
      }
    }
  }

  Set-Content -Path $file -Value $lines -Encoding UTF8
  Write-Output "FIXED: $file"
}
