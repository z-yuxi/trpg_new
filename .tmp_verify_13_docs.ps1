$ErrorActionPreference = 'Stop'

$targets = @(
  "E:\Desktop\trpg_new\docs\design\产品设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 A03：技术约定.md",
  "E:\Desktop\trpg_new\docs\design\附录 C：跑团房间交互设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 D：规则编辑器.md",
  "E:\Desktop\trpg_new\docs\design\附录 D01：规则引擎核心设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 E：模组编辑器.md",
  "E:\Desktop\trpg_new\docs\design\附录 H02：市场与创作者经济产品设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 H03：货币系统产品设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 H04：商业化与支付系统产品设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 I01：AI功能产品设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 I02：账号与基础设施产品设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 I03：法律与合规产品设计.md",
  "E:\Desktop\trpg_new\docs\design\附录 I04：业务安全与核心信誉保障产品设计.md"
)

$issues = New-Object System.Collections.Generic.List[object]

foreach ($file in $targets) {
  $lines = Get-Content -Path $file -Encoding UTF8
  $inFence = $false
  $h2Last = $null
  $h3Last = $null

  for ($i=0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNo = $i + 1

    if ($line -match '^```') { $inFence = -not $inFence; continue }
    if ($inFence) { continue }

    if ($line -match '^##\s+(\d+)\.\s+') {
      $n = [int]$Matches[1]
      if ($h2Last -ne $null -and $n -ne ($h2Last + 1)) {
        $issues.Add([pscustomobject]@{File=$file;Line=$lineNo;Type='H2_SEQ';Msg="expected $($h2Last+1), got $n";Text=$line.Trim()})
      }
      $h2Last = $n
      $h3Last = $null
      continue
    }

    if ($line -match '^###\s+(\d+)\.(\d+)\s+') {
      $p = [int]$Matches[1]; $c=[int]$Matches[2]
      if ($h2Last -eq $null) {
        $issues.Add([pscustomobject]@{File=$file;Line=$lineNo;Type='H3_NO_H2';Msg='H3 before H2';Text=$line.Trim()})
      } else {
        if ($p -ne $h2Last) {
          $issues.Add([pscustomobject]@{File=$file;Line=$lineNo;Type='H3_PARENT';Msg="parent $p != h2 $h2Last";Text=$line.Trim()})
        }
        if ($h3Last -eq $null) {
          if ($c -ne 1) {
            $issues.Add([pscustomobject]@{File=$file;Line=$lineNo;Type='H3_START';Msg="first expected 1 got $c";Text=$line.Trim()})
          }
        } else {
          if ($c -ne ($h3Last + 1)) {
            $issues.Add([pscustomobject]@{File=$file;Line=$lineNo;Type='H3_SEQ';Msg="expected $($h3Last+1) got $c";Text=$line.Trim()})
          }
        }
      }
      $h3Last = $c
    }
  }
}

if ($issues.Count -eq 0) {
  'TARGETS_NO_ISSUES'
} else {
  $issues | ForEach-Object { "{0}:{1}: [{2}] {3} || {4}" -f $_.File,$_.Line,$_.Type,$_.Msg,$_.Text }
}
