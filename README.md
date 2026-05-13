#HTML 注入 — SillyTavern 扩展
**（注意：需要安装酒馆助手开启渲染功能）**
> 将 AI 输出的精简 HTML 自动渲染为带主题样式的交互式界面，支持状态栏、选项按钮、对白高亮，并自动折叠上下文以节省 token。

---

## 功能一览

| 功能 | 说明 |
|------|------|
| 🎨 多主题渲染 | 羊皮卷（暖色）/ 深色模式，通过 `<!-- theme:xxx -->` 标记切换 |
| 📊 智能状态栏 | 自动从角色卡检测 RPG 属性（HP/MP/好感度等），渲染为可折叠状态卡片 |
| 🎯 交互式选项 | 选择按钮点击后自动填入输入框并发送，防重复点击 |
| 💬 对白高亮 | 自动识别 `『』` `「」` 对白并加粗楷体渲染 |
| 📉 上下文折叠 | 发送给 AI 前将 HTML 折叠为纯文本，节省 token |
| 🔄 自动重注入 | MutationObserver 监控 DOM 变化，被其他扩展覆盖后自动恢复 |
| 🛡️ 鲁棒性设计 | 多策略 DOM 查找、重试机制、HTML 转义还原、DOMPurify custom- 前缀兼容 |

---

## 安装

将整个 `html-inject` 文件夹复制到 SillyTavern 的扩展目录：

```
SillyTavern/public/scripts/extensions/third-party/html-inject/
├── manifest.json      # 扩展清单
├── index.js           # 主逻辑
├── style.css          # 扩展自身样式
├── settings.html      # 设置面板模板
└── README.md          # 本文件
```

重启 SillyTavern 或刷新页面即可生效。扩展图标（🎨）出现在 ST 左侧 wand 菜单中。

---

## 工作原理

### 渲染管线

```
AI 输出原始文本（含 <!-- theme:xxx --> 标记）
    │
    ▼
SillyTavern 标准渲染管线
  substituteParams → regex → fixMarkdown → encode_tags
  → Showdown(markdown) → DOMPurify → decodeStyleTags → DOM 写入
    │
    ▼
CHARACTER_MESSAGE_RENDERED 事件触发
    │
    ▼
html-inject 读取 chat[id].mes 原始文本
    │
    ▼
pipeline() 判断文本类型（4条路径）
    │
    ▼
直接覆盖 .mes_text 的 innerHTML（绕过 ST 管线）
    │
    ▼
标记 data-html-injected 防止重复注入
```

### 4 条处理路径

| 路径 | 匹配条件 | 行为 |
|------|---------|------|
| 路径 1 | 含 `<!-- theme:xxx -->` 标记 | 注入对应主题模板（CSS + HTML） |
| 路径 2 | 含模板 class 但无主题标记 | 用默认主题包裹，注入样式 |
| 路径 3 | 含 `<style>` 标签 | 直接渲染完整 HTML |
| 路径 4 | 无 HTML | 原样返回，不处理 |

### 上下文折叠

发送给 AI 前自动将 HTML 折叠为纯文本：

```
GENERATE_BEFORE_COMBINE_PROMPTS → swapToContext()  → 用折叠版替换 chat[id].mes
GENERATE_AFTER_COMBINE_PROMPTS  → restoreToDisplay() → 恢复原始文本
```

折叠规则：提取剧情段落文本 → 状态栏压缩为 `[状态] HP:100 | MP:50` → 选项压缩为 `[选项]\nA.文本`

---

## 配置 AI Prompt

### 方式一：自动生成提示词

在设置面板中点击「复制提示词」，粘贴到角色卡的系统提示或 ST 的系统提示中。提示词会根据角色卡状态栏检测结果动态调整。

### 方式二：手动编写

在角色设定中加入以下规则：

```
【HTML 输出规则】
每轮回复时，用 ```html 代码块输出界面，格式如下：

第1行写主题标记：<!-- theme:羊皮卷 -->
然后只写动态内容（剧情、状态、选项），不写 CSS 和 JavaScript。

剧情文本：
<div class="story-text">
<p>段落1</p>
<p><span class="dialogue">"对白内容"</span></p>
</div>

状态栏（根据角色设定跟踪以下属性）：
<div class="status-section">
<div class="status-header" onclick="HtmlInject.toggleSection(this)">
<span>角色状态</span><span class="toggle-icon">▼</span>
</div>
<div class="status-content">
<div class="status-item">HP：<span class="status-value">100</span></div>
</div>
</div>

选项按钮：
<div class="choices-section">
<div class="choices-title">—— 请选择你的行动 ——</div>
<button class="choice-btn" data-choice="选项文本">
<span class="choice-label">A</span>选项文本
</button>
</div>

注意：
- 选项按钮用 data-choice="选项文本" 存储选项文本
- 只输出上述内容，不要输出 <style> 和 <script>
```

---

## 主题

### 羊皮卷（默认）

暖色调仿古卷轴风格，黄褐色渐变背景，适合中世纪/魔幻题材。

```
<!-- theme:羊皮卷 -->
```

### 深色模式

深蓝紫暗色风格，适合现代/科幻题材。

```
<!-- theme:深色模式 -->
```

### 自定义主题

通过 API 添加自定义主题：

```javascript
HtmlInject.addTheme('赛博朋克', `
  .roleplay-container {
    background: linear-gradient(180deg, #0a0a1a 0%, #1a0a2e 100%);
    color: #00ffcc;
    font-family: 'Noto Sans SC', sans-serif;
    /* ... 更多样式 */
  }
  /* ... 其他选择器 */
`);
```

### CSS 作用域隔离

每条消息的样式通过 `scopeCssSelectors()` 自动添加唯一前缀类名，防止不同主题消息间样式冲突：

- 羊皮卷 → `.html-inject-parchment .story-text { ... }`
- 深色模式 → `.html-inject-dark .story-text { ... }`

---

## 状态栏系统

### 自动检测

扩展会扫描角色卡的 description、personality、scenario、first_mes、mes_example，自动检测是否需要状态栏：

- **策略 1**：查找明确的"显示状态"指令（如"每轮回复末尾显示状态"）
- **策略 2**：检测关键词密度（5行窗口内出现3+个状态关键词）

### 支持的状态关键词

| 类别 | 关键词 |
|------|--------|
| 通用 | 状态、属性、HP、MP、EXP、等级 |
| 社交 | 好感度、亲密度、心情、体力 |
| 战斗 | 攻击力、防御力、ATK、DEF |
| 修仙 | 修为、境界、灵力、功法、炼体 |
| 角色 | 角色档案、姓名、年龄 |

完整列表见 `STATUS_KEYWORDS` 数组。

### 状态数据提取

AI 输出中的状态数据会从多种格式中被提取并渲染为美化状态栏：

| 格式 | 示例 | 提取函数 |
|------|------|---------|
| 角色档案注释 | `<!-- 角色档案：张三\|HP 100\|MP 50 -->` | `renderStatusBlock()` |
| Markdown 表格 | `\| HP \| 100 \|` | `extractMarkdownTables()` |
| HTML 表格 | `<table>...</table>` | `extractHtmlTables()` |
| `<p>` 标签 | `<p>[练体进度：12/100]</p>` | `extractStatusPTags()` |
| 尾部键值对 | `HP：100；MP：50` | `extractTrailingStatus()` |

> **重要**：如果角色卡没有状态栏需求（检测不到状态关键词或指令），原始状态文本会被直接移除，避免冗余显示。

### 手动配置

在设置面板中切换「状态栏模式」：

- **自动检测**（默认）：从角色卡自动读取
- **手动指定**：输入逗号分隔的字段名（如 `HP,MP,金币,好感度`）
- **关闭**：不显示状态栏

---

## 交互系统

### 选项按钮

三层点击机制确保按钮在各种情况下都能正常工作：

1. **window 全局函数**：`onclick="sendChoice('选项')"` 直接调用
2. **事件委托**：`document.click → .choice-btn` 兜底捕获
3. **data-choice 属性**：优先读取 `data-choice`，其次解析 `onclick`，最后用按钮文本

按钮被点击后：
- 所有同组按钮添加 `.disabled` 类（阻止重复点击）
- 被选按钮添加 `.selected` 类（高亮）
- 显示「已选择：xxx」反馈文本
- 自动填入输入框并发送

### 状态栏折叠

点击状态栏头部可折叠/展开：

```html
<div class="status-header" onclick="HtmlInject.toggleSection(this)">
```

---

## 设置面板

通过 ST 左侧 wand 菜单 → 🎨 HTML Inject 打开：

| 设置项 | 说明 |
|--------|------|
| 启用 HTML 模板注入 | 总开关 |
| 折叠 HTML 为纯文本进上下文 | 开启后发送给 AI 时自动折叠 |
| 当前主题 | 选择默认主题 |
| 状态栏模式 | 自动检测/手动指定/关闭 |
| 状态字段 | 手动模式下的字段列表 |
| AI 提示词 | 动态生成的提示词，可一键复制 |
| 重新注入所有消息 | 手动触发全量重注入 |

---

## API 参考

### 全局 API（window.HtmlInject）

```javascript
// 核心处理
HtmlInject.pipeline(text)           // → { display, context } 处理文本
HtmlInject.inject(text)              // → { display, context } | null 主题注入
HtmlInject.reInject()                // 重新注入所有消息
HtmlInject.injectOne(messageId)      // 注入单条消息

// 主题
HtmlInject.listThemes()              // → ["羊皮卷", "深色模式"]
HtmlInject.addTheme(name, css, js)  // 添加自定义主题

// 交互
HtmlInject.toggleSection(headerEl)   // 折叠/展开状态栏
HtmlInject.onChoice(btnEl, text)     // 处理选项点击
HtmlInject.sendChoice(text)          // 发送选项到输入框

// 状态栏检测
HtmlInject.detectStatus()            // → { hasStatus, fields, source }
HtmlInject.getEffectiveStatus()      // → { hasStatus, fields }
HtmlInject.buildPrompt()             // → string 生成提示词

// 后处理
HtmlInject.postProcess(html)         // 对白包装 + 状态栏渲染
HtmlInject.wrapDialogue(html)        // 自动包装对白
HtmlInject.renderStatus(html)        // 检测并渲染状态栏
HtmlInject.extractMdTable(html, [])  // 提取 Markdown 表格
HtmlInject.extractHtmlTable(html, [])// 提取 HTML 表格
HtmlInject.extractTrailing(html, []) // 提取尾部键值对
HtmlInject.extractPTags(html, [])    // 提取 <p> 标签状态

// 折叠
HtmlInject.fold(text)                // 折叠为纯文本
HtmlInject.foldHtml(text)            // 折叠含 <style> 的 HTML

// 调试
HtmlInject.debug()                   // 输出诊断信息到控制台
HtmlInject.findEl(messageId)         // 查找 .mes_text DOM 元素
HtmlInject.settings                  // 当前设置对象
```

### 全局函数（window 级别）

AI 输出中的 `onclick` 可以直接调用：

```javascript
toggleSection(headerEl)    // 折叠/展开状态栏
sendChoice(text)           // 发送选项
onChoice(btnEl, text)      // 处理选项点击
```

---

## 鲁棒性机制

### 多策略 DOM 查找

`findMesTextEl()` 使用 4 种策略查找 `.mes_text` 元素：

1. `#chat .mes[mesid="N"] .mes_text` — 标准 ST 选择器
2. `.mes[mesid="N"] .mes_text` — 不带 #chat 前缀
3. jQuery `$('#chat').find(...)` — ST 常用方式
4. 遍历所有 `#chat .mes` 手动匹配 — 最终兜底

### 重试机制

首次找不到 DOM 元素时自动延迟重试（200ms + 800ms），适应 ST 异步渲染。

### MutationObserver

监控 `.mes_text` 变化，当其他扩展（如翻译插件）覆盖注入内容时自动恢复。

### HTML 转义还原

检测 `chat[id].mes` 中的 `&lt;` `&gt;` 转义，如果确认是 HTML 被转义则自动还原。

### DOMPurify 兼容

ST 的 DOMPurify 会给 CSS class 添加 `custom-` 前缀，pipeline() 同时检测带/不带前缀的 class 名。

---

## 开发历史与修复记录

### 致命 Bug 修复

| # | Bug | 根因 | 修复 |
|---|-----|------|------|
| 1 | 事件签名不匹配 | `CHARACTER_MESSAGE_RENDERED` 传入 `(messageId, type)`，扩展按 message 对象读取 `.id`/`.m` | 使用 `Number(messageId)` + `getContext().chat[id]` |
| 2 | CSS/JS 未注入 | `injectHtml()` 定义了样式但从未写入 DOM | 构建完整 `<style>` + `<div>` 注入 |
| 3 | 无效注释标记 | `<!-- disable-default-loading -->` 不是 ST 真实功能 | 移除 |
| 4 | 流式消息处理错误 | `MESSAGE_RECEIVED` 修改 `mes` 会走 ST 管线被 DOMPurify 破坏 | 仅用 `CHARACTER_MESSAGE_RENDERED`，绕过管线直接操作 DOM |
| 5 | 用户/系统消息误处理 | 对用户消息也执行了注入 | 添加 `is_user` / `is_system` 检查 |

### 功能迭代

| 版本 | 新增功能 |
|------|---------|
| v1.0 | 基础主题注入 + CSS 作用域隔离 |
| v1.1 | 动态状态栏检测（角色卡扫描 + 关键词密度） |
| v1.2 | 后处理管线：对白包装（`『』`/`「」`）+ 状态栏渲染 |
| v1.3 | Markdown/HTML 表格提取 + `<p>` 标签状态提取 |
| v1.4 | onclick 全局函数暴露 + 事件委托兜底 |
| v1.5 | 鲁棒性大修：多策略 DOM 查找、重试、MutationObserver、转义还原、调试 API |

---

## 调试

在浏览器控制台运行：

```javascript
// 查看完整诊断信息
HtmlInject.debug()

// 手动注入单条消息
HtmlInject.injectOne(5)  // 注入消息 #5

// 测试 pipeline
HtmlInject.pipeline('<!-- theme:羊皮卷 --><div class="story-text"><p>测试</p></div>')

// 查看状态栏检测结果
HtmlInject.detectStatus()
```

控制台日志以 `[HTML-Inject]` 前缀标记，包含详细的处理路径、DOM 查找结果和注入状态。

---

## 技术要点

- **绕过 ST 渲染管线**：在 `CHARACTER_MESSAGE_RENDERED` 后用 `innerHTML` 直接覆盖 `.mes_text`，避免 DOMPurify 对 class 添加 `custom-` 前缀和 `encode_tags` 转义 `<>`
- **读取原始文本**：从 `chat[messageId].mes` 获取未经 `encode_tags`/`DOMPurify` 处理的原始文本
- **CSS 作用域隔离**：`scopeCssSelectors()` 为每条消息的 CSS 选择器添加唯一前缀类名
- **上下文折叠**：`GENERATE_BEFORE_COMBINE_PROMPTS` 替换为纯文本，`AFTER` 恢复
- **后处理管线**：`postProcessHtml()` → `wrapDialogue()` + `renderStatusBlock()`

---

## 文件结构

```
html-inject/
├── manifest.json          # 扩展清单（loading_order: 1）
├── index.js               # 主逻辑（~1550行）
├── style.css              # 扩展自身样式（调试面板）
├── settings.html          # 设置面板模板
└── README.md              # 本文件
```

---

## 兼容性

- SillyTavern 1.12+
- 需要浏览器支持 ES6+、MutationObserver
- 与翻译插件等可能修改 `.mes_text` 的扩展兼容（MutationObserver 自动恢复）

---

## 许可证

MIT
