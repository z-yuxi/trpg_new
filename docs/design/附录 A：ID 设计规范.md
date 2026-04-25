# 附录 A：ID 设计规范

## 文档信息
- 版本：v1.5
- 日期：2026-04-25
- 变更：补充与 2026-04-25 根目录设计准则的对齐说明；移除“公开房间大厅”旧口径

## 0.1 2026-04-25 对齐声明

本附录以以下 5 份根目录文档为绝对准则，本文只负责 ID 规范，不对其结论做反向覆盖：

1. `docs/规则配方系统技术方案.md`
2. `docs/附录 B：设计令牌（Design Tokens）.md`
3. `docs/附录 D：设计系统.md`
4. `docs/首页视觉修正_设计交付包_v1.0.md`
5. `docs/SVG设计图标.html`

补充约束：

- 平台不存在独立的公开房间大厅或公开房间列表；`room_code` 仅用于邀请、直接加入和分享链接。
- 所有对外可见房间入口均应与“我的团”、招募帖成团结果或邀请通知流程保持一致。

### 一、设计原则

1. **全局唯一**：所有 ID 在整个平台范围内唯一，不重复。
    
2. **类型可识别**：通过 ID 的格式或前缀能快速区分实体类型（便于调试和日志分析）。
    
3. **用户友好**：需要用户手动输入或分享的 ID（如房间号）采用短、易读的格式。
    
4. **安全防猜**：内部 ID 不暴露给用户，使用不可预测的格式（如 UUID）。
    
5. **性能友好**：支持数据库索引，长度适中。
    

### 二、ID 分类与格式

|实体类型|用户是否可见|格式|示例|用途|
|---|---|---|---|---|
|**用户 UID**|是（公开）|7 位数字，顺序分配|`1000100`|个人主页 URL、@提及、对外展示|
|**用户内部 ID**|否|UUID v4（36 字符）|`550e8400-e29b-41d4-a716-446655440000`|数据库主键、关联查询|
|**团（房间）ID**|是（房间号）|6 位大写字母+数字（排除易混淆字符）|`A3B9K2`|用户加入房间时输入；分享链接|
|**团内部 ID**|否|UUID v4|`camp_550e8400-...`|数据库主键|
|**场 ID**|否|UUID v4|`scene_550e8400-...`|数据库主键|
|**角色卡 ID**|是（可选）|8 位十六进制数字|`A3F9C2E1`|用户识别、分享（如“使用角色卡 ABC123”）|
|**角色卡内部 ID**|否|UUID v4|`char_550e8400-...`|数据库主键|
|**模组 ID**|是（URL）|8 位字母数字|`mod_AbC3dEf9`|详情页 URL、引用|
|**模组内部 ID**|否|UUID v4|`module_550e8400-...`|数据库主键|
|**规则包 ID**|是（URL）|8 位字母数字|`rule_XyZ9wQ2`|详情页 URL、引用|
|**规则包内部 ID**|否|UUID v4|`ruleset_550e8400-...`|数据库主键|
|**预约移动 ID**|否|UUID v4|`move_550e8400-...`|数据库主键|
|**消息 ID**|否|雪花算法 ID（19 位数字）|`1234567890123456789`|消息排序、分页|

### 三、各实体 ID 详细说明

#### 1. 用户 UID 与内部 ID

- **UID**：7 位数字，从 `1000000` 开始顺序递增。用于个人主页（`/u/1000100`）、@提及（`@1000100`）、对外展示。
    
- **内部 ID**：UUID v4，存储为 `CHAR(36)`，作为 `users` 表主键。用于内部关联，不暴露给前端。
    

#### 2. 团（房间）ID

- **用户可见的房间号**：6 位字符，由大写字母（排除 I、O、Z）和数字（排除 0、1）组成，共 32 个字符，组合数约 10 亿，足够使用。
    
    - 排除字符：`I O Z 0 1`（避免与数字混淆，如 `1` 和 `I`）。
        
    - 生成算法：随机生成，碰撞重试。
        
    - 示例：`A3B9K2`、`C7D4E8`。
        
- **用途**：
    
    - 用户在“我的团”页面、邀请通知或直接加入入口输入房间号加入。
        
    - 分享链接：`https://trpg.com/room/A3B9K2`。
        
- **内部 ID**：UUID v4，作为 `campaigns` 表主键。
    

#### 3. 角色卡 ID

- **用户可见的角色卡码**：8 位十六进制数字（0-9A-F），不区分大小写，如 `A3F9C2E1`。
    
    - 生成算法：随机生成，碰撞重试。
        
    - 用途：用户分享角色卡（“我的角色卡码是 A3F9C2E1”），GM 可通过该码快速导入。
        
- **内部 ID**：UUID v4，作为 `character_sheets` 表主键。
    

#### 4. 场 ID

- 场 ID 不对外公开，全部使用 UUID v4 作为内部主键。前端 URL 或 API 中不直接传递场 ID，而是通过团 ID + 场名称或场类型定位。
    

#### 5. 模组 ID 与规则包 ID

- 对外 URL 使用 **8 位字母数字**（区分大小写），如 `mod_AbC3dEf9`、`rule_XyZ9wQ2`。
    
- 内部主键使用 UUID v4。
    

#### 6. 消息 ID：使用**雪花算法（Snowflake）** 
生成 19 位无符号整数（0-2^64-1），天然有序，便于分页查询。
数据库层使用 `BIGINT UNSIGNED` 存储以优化索引性能。不对外暴露，仅用于后端排序和去重。

### 四、数据库表主键与索引设计

|表名|主键字段|主键类型|额外唯一索引|
|---|---|---|---|
|`users`|`id`|UUID v4|`uid` (UNIQUE)|
|`campaigns`|`id`|UUID v4|`room_code` (UNIQUE)|
|`scenes`|`id`|UUID v4|(`campaign_id`, `name`)|
|`character_sheets`|`id`|UUID v4|`character_code` (UNIQUE)|
|`modules`|`id`|UUID v4|`module_code` (UNIQUE)|
|`rulesets`|`id`|UUID v4|`ruleset_code` (UNIQUE)|
|`scheduled_moves`|`id`|UUID v4|-|
|`position_history`|`id`|UUID v4|-|
|`chat_messages`|`id`|BIGINT (雪花)|(`campaign_id`, `created_at`)|

### 五、前端交互示例

- **加入房间**：用户输入 `A3B9K2` → 前端请求 `POST /api/v1/campaigns/join`，body `{ roomCode: "A3B9K2" }` → 后端根据 `campaigns` 表的 `room_code` 查找内部 `id`。
    
- **分享角色卡**：用户复制链接 `https://trpg.com/character/A3F9C2E1` → 后端根据 `character_code` 返回角色卡公开信息（仅所有者可编辑）。
    
- **个人主页**：`/u/1000100` → 后端根据 `uid` 查询用户公开信息。
    

### 六、ID 生成服务（伪代码）

python

import uuid
import random
import string
class IDService:
    @staticmethod
    def generate_uuid():
        return str(uuid.uuid4())
    
    @staticmethod
    def generate_uid(current_max):
        # current_max 从数据库获取当前最大 UID
        return current_max + 1
    
    @staticmethod
    def generate_room_code():
        # 排除 I, O, Z, 0, 1
        chars = 'ABCDEFGHJKLMNPQRSTUVWXY23456789'
        while True:
            code = ''.join(random.choices(chars, k=6))
            # 检查数据库是否已存在，若存在则重新生成
            if not Campaign.exists(room_code=code):
                return code
    
    @staticmethod
    def generate_character_code():
        # 8 位十六进制
        code = ''.join(random.choices('0123456789ABCDEF', k=8))
        # 检查唯一性
        if not CharacterSheet.exists(character_code=code):
            return code
        return IDService.generate_character_code()  # 递归重试