$issuePath = "c:\Users\young\AppData\Roaming\Code\User\workspaceStorage\ebfa09a58fe142225c7920aba8b1bdba\GitHub.copilot-chat\chat-session-resources\bf1d46e2-a79b-4382-b86f-8f1c523171d2\call_VQMkgsA68v5WlAG073pXYJ1T__vscode-1777431592351\content.txt"
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
  $inFence=$false; $h2Last=$null; $h3Map=@{}
  for($i=0;$i -lt $lines.Count;$i++){
    $line=$lines[$i];$ln=$i+1
    if($line -match '^```'){ $inFence = -not $inFence; continue }
    if($inFence){ continue }
    if($line -match '^##\s+(\d+)\.\s+'){
      $n=[int]$Matches[1]
      if($h2Last -ne $null -and $n -ne ($h2Last+1)){ $issues.Add([pscustomobject]@{File=$file;Line=$ln;Type='H2_SEQ'}) }
      $h2Last=$n
      if(-not $h3Map.ContainsKey($n)){ $h3Map[$n]=$null }
      continue
    }
    if($line -match '^###\s+(\d+)\.(\d+)\s+'){
      $p=[int]$Matches[1];$c=[int]$Matches[2]
      if($h2Last -ne $null){
        if($p -ne $h2Last){ $issues.Add([pscustomobject]@{File=$file;Line=$ln;Type='H3_PARENT'}) }
        if($h3Map[$h2Last] -eq $null){ if($c -ne 1){ $issues.Add([pscustomobject]@{File=$file;Line=$ln;Type='H3_START'}) }; $h3Map[$h2Last]=$c }
        else { if($c -ne ($h3Map[$h2Last]+1)){ $issues.Add([pscustomobject]@{File=$file;Line=$ln;Type='H3_SEQ'}) }; $h3Map[$h2Last]=$c }
      }
    }
  }
}

"NON_H3_NO_H2_ISSUES=" + $issues.Count
if($issues.Count -gt 0){ $issues | Group-Object File | Sort-Object Count -Descending | ForEach-Object {"{0} :: {1}" -f $_.Name,$_.Count} }
