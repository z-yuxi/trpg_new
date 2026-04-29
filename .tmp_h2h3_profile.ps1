$root = "docs"
$files = Get-ChildItem $root -Recurse -File -Filter *.md
foreach ($f in $files) {
  $text = Get-Content $f.FullName -Encoding UTF8
  $h2 = ($text | Where-Object { $_ -match '^##\s+\d+\.\s+' }).Count
  $h3 = ($text | Where-Object { $_ -match '^###\s+\d+\.\d+\s+' }).Count
  if ($h3 -gt 0) {
    "{0} :: H2={1}, H3={2}" -f $f.FullName,$h2,$h3
  }
}
