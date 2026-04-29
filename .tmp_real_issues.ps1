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

$real = $parsed | Where-Object {
  $profiles.ContainsKey($_.File) -and $profiles[$_.File] -gt 0 -and $_.Type -ne 'H3_NO_H2'
}

"REAL_ISSUES=" + $real.Count
"REAL_FILES=" + (($real | Select-Object -ExpandProperty File -Unique).Count)
""
$real | Group-Object File | Sort-Object Count -Descending | ForEach-Object {
  "{0} :: {1}" -f $_.Name, $_.Count
}
