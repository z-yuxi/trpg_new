$path = "c:\Users\young\AppData\Roaming\Code\User\workspaceStorage\ebfa09a58fe142225c7920aba8b1bdba\GitHub.copilot-chat\chat-session-resources\bf1d46e2-a79b-4382-b86f-8f1c523171d2\call_VQMkgsA68v5WlAG073pXYJ1T__vscode-1777431592351\content.txt"
$lines = Get-Content -Path $path -Encoding UTF8

$items = foreach ($l in $lines) {
  if ($l -match '^(.*?):(\d+): \[(.*?)\] ') {
    [pscustomobject]@{ File=$Matches[1]; Line=[int]$Matches[2]; Type=$Matches[3] }
  }
}

"TOTAL_ISSUES=" + $items.Count
"FILES_WITH_ISSUES=" + (($items | Select-Object -ExpandProperty File -Unique).Count)
""
"TOP_FILES:"
$items | Group-Object File | Sort-Object Count -Descending | Select-Object -First 12 | ForEach-Object {
  "{0} :: {1}" -f $_.Name, $_.Count
}
""
"TYPE_DISTRIBUTION:"
$items | Group-Object Type | Sort-Object Count -Descending | ForEach-Object {
  "{0} :: {1}" -f $_.Name, $_.Count
}
