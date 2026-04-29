import re

f = 'docs/design/附录 C：跑团房间交互设计.md'
c = open(f, encoding='utf-8').read()
lines = c.split('\n')
old = lines[213]
new = '**关于房间发现**：平台不设独立的"房间大厅"或"公开房间列表"。所有公开招募性质的团，均通过「**招募**」标签发布招募帖进行。玩家通过招募帖申请加入，成团后房间自动出现在双方「房间」标签中。「房间」标签仅为用户个人参与的房间管理后台。'
print(f"Old line: {repr(old[:80])}")
lines[213] = new
c2 = '\n'.join(lines)
open(f, 'w', encoding='utf-8').write(c2)

# Verify
txt = open(f, encoding='utf-8').read()
for t in ['社区-招募板', '我的团-我的房间']:
    if t in txt:
        for m in re.finditer(r'.{0,20}' + re.escape(t) + r'.{0,30}', txt):
            print(f'STILL [{t}]: {repr(m.group()[:80])}')
    else:
        print(f'Cleared: {t}')
