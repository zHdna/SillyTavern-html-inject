/**
 * HTML Inject - SillyTavern 扩展（修复版）
 *
 * 功能：
 *   1. 检测 AI 输出的 <!-- theme:xxx --> 标记，自动注入完整 HTML 模板（含 CSS）
 *   2. 将 HTML 输出折叠为纯文本摘要，减少上下文 token 消耗
 *   3. 支持多主题切换（羊皮卷、深色模式）
 *   4. 支持无代码块包裹的原始 HTML 渲染
 *   5. 全局 JS 函数（toggleSection / sendChoice）通过 window.HtmlInject 暴露
 *
 * 修复记录：
 *   - 修正事件签名：CHARACTER_MESSAGE_RENDERED 传入 (messageId, type)，非 message 对象
 *   - 注入主题 CSS 到 DOM（原代码定义了但从未注入）
 *   - 删除无效的 <!-- disable-default-loading --> 注释
 *   - 删除 MESSAGE_RECEIVED 错误处理（修改 mes 会走 ST 管线被破坏）
 *   - 添加 CHAT_CHANGED 事件处理，支持聊天重载时重新注入
 *   - 将 toggleSection / sendChoice 暴露为全局函数供 onclick 调用
 */

import { eventSource, event_types, saveSettingsDebounced } from '/script.js';
import { getContext, extension_settings, renderExtensionTemplateAsync } from '/scripts/extensions.js';
import { POPUP_TYPE, callGenericPopup } from '/scripts/popup.js';

// ========== 主题模板库 ==========
const TEMPLATES = {
    "羊皮卷": {
        css: `.roleplay-container {
    --bg-gradient: linear-gradient(180deg, #f5f0e1 0%, #ede4cc 100%);
    --card-bg: rgba(255, 253, 248, 0.85);
    --card-bg-dark: rgba(139, 119, 90, 0.1);
    --border-color: #b8a080;
    --border-dark: #8b7352;
    --text-color: #000000;
    --text-light: #333333;
    --dialogue-color: #000000;
    --status-border: #8b7352;
    --choice-bg: linear-gradient(135deg, #faf5eb 0%, #f0e8d8 100%);
    --choice-hover: linear-gradient(135deg, #f5edd8 0%, #e8dcc0 100%);
    --choice-border: #c4a882;
    --choice-active: #8b6914;
    --label-bg: #8b7352;
    --shadow-color: rgba(100, 80, 50, 0.2);
    --accent-gold: #c9a959;
    width: 100%; max-width: 800px; margin: 0 auto;
    font-family: 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif;
    font-size: 16px; color: var(--text-color); background: var(--bg-gradient);
    display: flex; flex-direction: column; gap: 20px; padding: 20px; border-radius: 8px;
}
.story-text { line-height: 1.8; }
.story-text p { margin-bottom: 16px; text-indent: 2em; }
.story-text p:first-child { text-indent: 0; }
.dialogue { font-family: 'KaiTi', 'STKaiti', '楷体', serif; font-weight: bold; color: var(--dialogue-color); }
.important { font-family: 'SimHei', 'Heiti SC', 'Microsoft YaHei', sans-serif; font-weight: bold; }
.status-section { background: var(--card-bg); border: 2px solid var(--border-color);
    border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px var(--shadow-color); }
.status-header { padding: 10px 15px; background: var(--card-bg-dark);
    font-family: 'SimHei', 'Heiti SC', sans-serif; font-weight: bold;
    cursor: pointer; display: flex; justify-content: space-between;
    align-items: center; border-bottom: 2px solid var(--status-border); color: var(--border-dark); }
.status-content { display: block; padding: 12px 15px; }
.status-item { display: inline-block; margin-right: 20px; font-size: 14px; }
.status-value { font-family: 'SimHei', 'Heiti SC', sans-serif; font-weight: bold;
    color: var(--choice-active); background: var(--card-bg);
    padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border-color); }
.choices-section { background: var(--card-bg); border: 2px solid var(--border-color);
    border-radius: 8px; padding: 15px; display: flex; flex-direction: column;
    gap: 10px; box-shadow: 0 2px 6px var(--shadow-color); }
.choices-title { text-align: center; font-family: 'SimHei', 'Heiti SC', sans-serif;
    font-weight: bold; color: var(--border-dark); font-size: 14px; margin-bottom: 5px; }
.choice-btn { background: var(--choice-bg); border: 1px solid var(--choice-border);
    color: var(--text-color); padding: 12px 16px; border-radius: 6px;
    font-family: inherit; font-size: 15px; cursor: pointer; transition: all 0.2s ease;
    text-align: left; line-height: 1.6; box-shadow: 0 2px 4px var(--shadow-color); }
.choice-btn:hover { background: var(--choice-hover); border-color: var(--border-dark);
    transform: translateY(-2px); box-shadow: 0 4px 10px var(--shadow-color); }
.choice-btn:active { transform: translateY(0); box-shadow: 0 1px 2px var(--shadow-color); }
.choice-btn.selected { border-color: var(--choice-active) !important; border-width: 2px;
    box-shadow: 0 0 12px rgba(139, 105, 20, 0.25) !important; opacity: 1 !important; }
.choice-btn.disabled { opacity: 0.4; pointer-events: none; }
.choice-label { display: inline-block; background: var(--label-bg); color: #f5f0e1;
    font-family: 'SimHei', 'Heiti SC', sans-serif; font-weight: bold;
    padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px;
    min-width: 20px; text-align: center; }
.choice-feedback { text-align: center; font-family: 'SimHei', 'Heiti SC', sans-serif;
    font-weight: bold; color: var(--choice-active); font-size: 13px; margin-top: 8px; }
@media (max-width: 600px) { .roleplay-container { padding: 15px; }
    .story-text { font-size: 15px; } .choice-btn { padding: 10px 12px; font-size: 14px; } }`
    },
    "深色模式": {
        css: `.roleplay-container {
    --bg-gradient: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
    --card-bg: rgba(30, 30, 50, 0.85);
    --card-bg-dark: rgba(50, 50, 80, 0.5);
    --border-color: #4a4a6a;
    --border-dark: #6a6a8a;
    --text-color: #e0e0e0;
    --text-light: #b0b0c0;
    --dialogue-color: #c9a959;
    --status-border: #4a4a6a;
    --choice-bg: linear-gradient(135deg, #252540 0%, #1e1e38 100%);
    --choice-hover: linear-gradient(135deg, #2d2d4d 0%, #252545 100%);
    --choice-border: #5a5a7a;
    --choice-active: #c9a959;
    --label-bg: #4a4a6a;
    --shadow-color: rgba(0, 0, 0, 0.4);
    --accent-gold: #c9a959;
    width: 100%; max-width: 800px; margin: 0 auto;
    font-family: 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif;
    font-size: 16px; color: var(--text-color); background: var(--bg-gradient);
    display: flex; flex-direction: column; gap: 20px; padding: 20px; border-radius: 8px;
}
.story-text { line-height: 1.8; }
.story-text p { margin-bottom: 16px; text-indent: 2em; }
.story-text p:first-child { text-indent: 0; }
.dialogue { font-family: 'KaiTi', 'STKaiti', '楷体', serif; font-weight: bold; color: var(--dialogue-color); }
.important { font-family: 'SimHei', 'Heiti SC', 'Microsoft YaHei', sans-serif; font-weight: bold; color: var(--accent-gold); }
.status-section { background: var(--card-bg); border: 2px solid var(--border-color);
    border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px var(--shadow-color); }
.status-header { padding: 10px 15px; background: var(--card-bg-dark);
    font-family: 'SimHei', 'Heiti SC', sans-serif; font-weight: bold;
    cursor: pointer; display: flex; justify-content: space-between;
    align-items: center; border-bottom: 2px solid var(--status-border); color: var(--border-dark); }
.status-content { display: block; padding: 12px 15px; }
.status-item { display: inline-block; margin-right: 20px; font-size: 14px; }
.status-value { font-family: 'SimHei', 'Heiti SC', sans-serif; font-weight: bold;
    color: var(--choice-active); background: var(--card-bg);
    padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border-color); }
.choices-section { background: var(--card-bg); border: 2px solid var(--border-color);
    border-radius: 8px; padding: 15px; display: flex; flex-direction: column;
    gap: 10px; box-shadow: 0 2px 6px var(--shadow-color); }
.choices-title { text-align: center; font-family: 'SimHei', 'Heiti SC', sans-serif;
    font-weight: bold; color: var(--border-dark); font-size: 14px; margin-bottom: 5px; }
.choice-btn { background: var(--choice-bg); border: 1px solid var(--choice-border);
    color: var(--text-color); padding: 12px 16px; border-radius: 6px;
    font-family: inherit; font-size: 15px; cursor: pointer; transition: all 0.2s ease;
    text-align: left; line-height: 1.6; box-shadow: 0 2px 4px var(--shadow-color); }
.choice-btn:hover { background: var(--choice-hover); border-color: var(--border-dark);
    transform: translateY(-2px); box-shadow: 0 4px 10px var(--shadow-color); }
.choice-btn:active { transform: translateY(0); box-shadow: 0 1px 2px var(--shadow-color); }
.choice-btn.selected { border-color: var(--choice-active) !important; border-width: 2px;
    box-shadow: 0 0 12px rgba(201, 169, 89, 0.3) !important; opacity: 1 !important; }
.choice-btn.disabled { opacity: 0.4; pointer-events: none; }
.choice-label { display: inline-block; background: var(--label-bg); color: #e0e0e0;
    font-family: 'SimHei', 'Heiti SC', sans-serif; font-weight: bold;
    padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px;
    min-width: 20px; text-align: center; }
.choice-feedback { text-align: center; font-family: 'SimHei', 'Heiti SC', sans-serif;
    font-weight: bold; color: var(--choice-active); font-size: 13px; margin-top: 8px; }
@media (max-width: 600px) { .roleplay-container { padding: 15px; }
    .story-text { font-size: 15px; } .choice-btn { padding: 10px 12px; font-size: 14px; } }`
    }
};

// ========== 主题名 → CSS 类名映射（用于作用域隔离） ==========
const THEME_SCOPE_CLASS = {
    "羊皮卷": "html-inject-parchment",
    "深色模式": "html-inject-dark"
};

// ========== 角色卡状态栏检测 ==========

/**
 * 状态栏模式
 * - auto: 自动从角色卡检测
 * - manual: 使用手动指定的字段
 * - off: 不显示状态栏
 */
const STATUS_MODE = { AUTO: 'auto', MANUAL: 'manual', OFF: 'off' };

/**
 * 常见状态栏属性的关键词（中英文）
 * 用于自动检测角色卡中是否包含状态栏相关内容
 */
const STATUS_KEYWORDS = [
    // 通用
    '状态', '属性', '状态栏', '属性栏', '状态面板',
    // RPG 常见
    'HP', 'hp', '生命', '血量', '体力值',
    'MP', 'mp', '魔力', '魔法值', '法力', '蓝量',
    'EXP', 'exp', '经验', '经验值',
    '等级', 'Level', 'level', 'Lv',
    '金币', '金钱', 'Gold', 'gold', '货币', 'G',
    // 社交/恋爱模拟
    '好感度', '好感', '亲密度', '信赖度', '友好度',
    '心情', '情绪', '心态',
    '体力', '精力', '疲劳',
    // 战斗
    '攻击力', '防御力', '速度', '敏捷', '智力', '力量',
    'ATK', 'DEF', 'SPD', 'INT', 'STR',
    // 其他
    '饥饿', '口渴', '饱食度', '卫生', '清洁度',
    '声望', '名誉', '信誉',
    '金钱', '财产', '资产',
    '技能点', '天赋点',
    '阵营', '善恶值', '道德',
    // 修仙/武侠
    '修为', '修为阶段', '境界', '灵力', '灵气', '功法', '主修功法',
    '体质', '天赋', '进度条', '进度',
    '筑基', '炼体', '炼气', '金丹', '元婴', '化神',
    '门派', '所属',
    '灵石', '丹药', '法宝', '法器',
    '内力', '真气', '罡气',
    // 角色信息
    '角色档案', '角色状态', '角色信息',
    '姓名', '年龄', '名字',
];

/**
 * 从角色卡中检测状态栏配置
 * 扫描角色的 description、personality、scenario、first_mes、mes_example
 * 寻找状态栏相关内容，提取字段名
 * @returns {{ hasStatus: boolean, fields: string[], source: string }}
 */
function getCharStatusConfig() {
    const ctx = getContext();
    if (!ctx?.characters || ctx.characterId === undefined) {
        return { hasStatus: false, fields: [], source: '' };
    }

    const char = ctx.characters[ctx.characterId];
    if (!char) {
        return { hasStatus: false, fields: [], source: '' };
    }

    // 合并角色卡所有文本字段
    const allText = [
        char.description || '',
        char.personality || '',
        char.scenario || '',
        char.first_mes || '',
        char.mes_example || '',
    ].join('\n');

    if (!allText.trim()) {
        return { hasStatus: false, fields: [], source: '' };
    }

    // 检测策略 1：查找明确的"显示状态"指令
    const statusInstructionPatterns = [
        /(?:每轮|每次|在)(?:回复|对话|输出|消息)(?:末尾|结尾|最后|底部).*(?:显示|展示|输出|附带|附加|加上|包含).*(?:状态|属性|数值|面板|档案|信息)/,
        /(?:状态|属性|数值|面板|档案|信息).*(?:显示|展示|输出|附带).*(?:每轮|每次|回复|对话)/,
        /(?:always|each|every|at the end).*(?:show|display|include|append).*(?:status|stats|attributes|profile)/i,
        /(?:status|stats|attributes|profile).*(?:always|each|every|at the end).*(?:show|display|include|append)/i,
        /(?:回复|输出|消息).*(?:格式|模板|格式化).*(?:状态|属性|档案)/,
        /(?:角色|人物|玩家)(?:状态|属性|档案|信息|面板)/,
        /(?:追踪|跟踪|记录).*(?:状态|属性|数值|进度)/,
        /(?:末尾|结尾).*(?:附带|显示|输出).*(?:状态|属性|数值)/,
    ];

    const hasStatusInstruction = statusInstructionPatterns.some(p => p.test(allText));
    if (!hasStatusInstruction) {
        // 检测策略 2：查找密集的属性关键词（3个以上不同状态关键词出现在同一区域）
        const lines = allText.split('\n');
        let maxKeywordDensity = 0;
        let densestRegion = '';

        for (let i = 0; i < lines.length; i++) {
            const window = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
            const matchedKeywords = STATUS_KEYWORDS.filter(kw => window.includes(kw));
            if (matchedKeywords.length > maxKeywordDensity) {
                maxKeywordDensity = matchedKeywords.length;
                densestRegion = window;
            }
        }

        // 至少需要 3 个不同状态关键词才认为是"有状态栏"的角色卡
        if (maxKeywordDensity < 3) {
            return { hasStatus: false, fields: [], source: '' };
        }

        // 从密集区域提取字段
        const fields = extractStatusFields(densestRegion);
        return { hasStatus: true, fields, source: 'keyword' };
    }

    // 有明确的状态栏指令，从指令附近提取字段
    const fields = extractStatusFields(allText);
    return { hasStatus: true, fields, source: 'instruction' };
}

/**
 * 从文本中提取状态字段名
 * 支持格式：
 *   - "HP: 100" / "生命值：100" → "HP" / "生命值"
 *   - "状态：HP 100/100, MP 50/50" → "HP", "MP"
 *   - "【HP:100|MP:50|金币:30】" → "HP", "MP", "金币"
 *   - "<div class="status-item">心情：<span>微暖</span></div>" → "心情"
 * @param {string} text
 * @returns {string[]} 字段名数组
 */
function extractStatusFields(text) {
    const fields = new Set();

    // 模式 1：键值对 "属性名：值" 或 "属性名: 值"（值不限于数字，也可是文本/emoji）
    const kvPattern = /([A-Za-z\u4e00-\u9fff]{1,8})\s*[:：]\s*\S/i;
    const kvMatches = text.match(new RegExp(kvPattern.source, 'g'));
    if (kvMatches) {
        kvMatches.forEach(m => {
            const name = m.replace(/\s*[:：].*$/, '').trim();
            if (name && STATUS_KEYWORDS.some(kw => name.includes(kw) || kw.includes(name))) {
                fields.add(name);
            }
        });
    }

    // 模式 2：status-item 类中的属性名
    const statusItemPattern = /status-item[^>]*>([^<]*(?:[:：])[^<]*)</g;
    let match;
    while ((match = statusItemPattern.exec(text)) !== null) {
        const name = match[1].replace(/\s*[:：].*$/, '').trim();
        if (name) fields.add(name);
    }

    // 模式 3：中括号/方括号包裹的状态块
    const bracketPattern = /[【\[]([^\]】]*(?:HP|MP|生命|魔力|金币|好感|体力|等级|经验|攻击|防御)[^\]】]*)[】\]]/gi;
    while ((match = bracketPattern.exec(text)) !== null) {
        const content = match[1];
        // 按 | 或 , 拆分
        content.split(/[|,，、]/).forEach(part => {
            const name = part.replace(/\s*[:：].*$/, '').replace(/[\d\/\\%]+$/, '').trim();
            if (name && name.length <= 8) fields.add(name);
        });
    }

    // 模式 4：直接匹配关键词在行首或独立出现
    STATUS_KEYWORDS.forEach(kw => {
        const pattern = new RegExp(`(?:^|\\n|\\s|[,，|、])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*[:：]|$|\\s)`, 'm');
        if (pattern.test(text)) {
            fields.add(kw);
        }
    });

    // 如果什么都没提取到，但检测到有状态栏指令，返回默认字段
    if (fields.size === 0) {
        return ['状态'];
    }

    return [...fields].slice(0, 12); // 最多 12 个字段
}

/**
 * 根据当前设置获取最终的状态字段配置
 * 综合考虑自动检测、手动配置和关闭设置
 * @returns {{ hasStatus: boolean, fields: string[] }}
 */
function getEffectiveStatusConfig() {
    const mode = extension_settings.html_inject?.status_mode || STATUS_MODE.AUTO;

    if (mode === STATUS_MODE.OFF) {
        return { hasStatus: false, fields: [] };
    }

    if (mode === STATUS_MODE.MANUAL) {
        const manualFields = extension_settings.html_inject?.status_fields || '';
        const fields = manualFields.split(/[,，、\n]/).map(s => s.trim()).filter(s => s.length > 0);
        return { hasStatus: fields.length > 0, fields };
    }

    // AUTO 模式：自动检测
    return getCharStatusConfig();
}

// ========== 后处理：对白包装 & 状态栏渲染 ==========

/**
 * 简单 HTML 转义 + Markdown 行内渲染
 * 先转义 HTML 实体防止注入，再渲染 **bold** 为 <strong>
 */
function safeHtmlText(str) {
    let s = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    // 转义后再渲染 markdown **bold**（此时 ** 未被破坏）
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    return s;
}

/**
 * 后处理入口：自动包装对白 + 检测并渲染状态栏
 * @param {string} content - 已清理主题标记的 HTML 内容
 * @returns {string} 处理后的内容
 */
function postProcessHtml(content) {
    content = wrapDialogue(content);
    content = renderStatusBlock(content);
    return content;
}

/**
 * 自动检测对白模式并包装为 .dialogue（楷体+加粗）
 * 支持：『...』、「...」 模式
 * 仅处理 .story-text 区域内的对白，避免影响选项按钮等
 */
function wrapDialogue(text) {
    // 如果已有 .dialogue 标记，不重复包装
    if (/<span\s+class="(?:custom-)?dialogue">/.test(text)) return text;

    // 在 .story-text 区域内包装对白
    // 先提取 story-text 内容
    const storyMatch = text.match(/(<div\s+class="story-text">)([\s\S]*?)(<\/div>)/);
    if (storyMatch) {
        let storyContent = storyMatch[2];
        // 包装 『...』 对白（限制长度防止误匹配）
        storyContent = storyContent.replace(/『([^』]{0,500}?)』/g, '<span class="dialogue">『$1』</span>');
        // 包装 「...」 对白
        storyContent = storyContent.replace(/「([^」]{0,500}?)」/g, '<span class="dialogue">「$1」</span>');
        text = storyMatch[1] + storyContent + storyMatch[3];
    } else {
        // 没有 story-text div 时，全局包装（仅在 <p> 标签内）
        text = text.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/g, function(_, open, body, close) {
            body = body.replace(/『([^』]{0,500}?)』/g, '<span class="dialogue">『$1』</span>');
            body = body.replace(/「([^」]{0,500}?)」/g, '<span class="dialogue">「$1」</span>');
            return open + body + close;
        });
    }

    return text;
}

/**
 * 检测 AI 输出中的状态信息并渲染为 HTML 状态栏
 *
 * 工作流程：
 * 1. 从内容中提取状态数据（角色档案注释、markdown表格、HTML表格、键值对）
 * 2. 根据角色卡设定决定是否显示状态栏：
 *    - 角色卡无状态需求 → 删除原始状态文本，不显示状态栏
 *    - 角色卡有状态需求 → 删除原始格式，用美化状态栏取代
 */
function renderStatusBlock(content) {
    // 如果已有 status-section，不需要再处理
    if (/<div\s+class="(?:custom-)?status-section"/.test(content)) return content;

    // 获取角色卡状态栏配置
    const config = getEffectiveStatusConfig();

    let profiles = [];
    let statusItems = [];
    let cleanedContent = content;

    // === 提取角色档案注释 ===
    // 支持两种格式：
    //   <!-- 角色档案：姓名|属性1|属性2|... -->
    //   <!-- 姓名|属性1|属性2|... -->  （AI 常用格式，至少含 | 分隔符和2个字段）
    const profilePattern = /<!--\s*(?:角色档案[：:])?\s*([^>]+?)\s*-->/g;
    let match;
    while ((match = profilePattern.exec(cleanedContent)) !== null) {
        const raw = match[1].trim();
        // 跳过 theme 标记
        if (/^theme:/i.test(raw)) continue;
        const parts = raw.split('|').map(s => s.trim()).filter(s => s);
        // 至少需要 姓名 + 1个属性
        if (parts.length >= 2) {
            profiles.push({ name: parts[0], attrs: parts.slice(1) });
        }
    }
    // 从显示内容中移除角色档案注释
    cleanedContent = cleanedContent.replace(/<!--\s*(?:角色档案[：:])?\s*[^>]*?\s*-->\s*\n?/g, function(m) {
        // 保留 theme 标记注释（pipeline 后续可能还需要）
        if (/<!--\s*theme:/i.test(m)) return m;
        return '';
    });

    // === 提取 markdown 表格（含状态关键词） ===
    cleanedContent = extractMarkdownTables(cleanedContent, statusItems);

    // === 提取 HTML <table> 表格（含状态关键词） ===
    cleanedContent = extractHtmlTables(cleanedContent, statusItems);

    // === 提取 <p> 标签中的状态数据（先于尾部文本提取，避免 <p> 内的 ; 被误分割） ===
    cleanedContent = extractStatusPTags(cleanedContent, statusItems);

    // === 提取尾部键值对状态文本 ===
    cleanedContent = extractTrailingStatus(cleanedContent, statusItems);

    // 如果没有提取到任何状态内容，返回原内容
    if (profiles.length === 0 && statusItems.length === 0) return content;

    // ★ 关键判定：角色卡没有状态栏需求 → 删除原始状态文本，不显示状态栏
    if (!config.hasStatus) {
        console.log('[HTML-Inject] 角色卡无状态栏需求，已移除原始状态文本');
        return cleanedContent;
    }

    // === 构建美化状态栏 ===
    let statusHtml = '<div class="status-section">';
    statusHtml += '<div class="status-header" onclick="HtmlInject.toggleSection(this)">';
    statusHtml += '<span>角色状态</span><span class="toggle-icon">▼</span>';
    statusHtml += '</div>';
    statusHtml += '<div class="status-content">';

    // 角色档案卡片
    for (const profile of profiles) {
        let attrsHtml = profile.attrs.map(a =>
            `<span class="status-value">${safeHtmlText(a)}</span>`
        ).join(' ');
        statusHtml += `<div class="status-item">👤 ${safeHtmlText(profile.name)}：${attrsHtml}</div>`;
    }

    // 键值对状态项
    for (const item of statusItems) {
        if (item.key) {
            statusHtml += `<div class="status-item">${safeHtmlText(item.key)}：<span class="status-value">${safeHtmlText(item.value)}</span></div>`;
        } else {
            statusHtml += `<div class="status-item"><span class="status-value">${safeHtmlText(item.value)}</span></div>`;
        }
    }

    statusHtml += '</div></div>';

    // 将状态栏插入到 choices-section 之前，如果没有选项则追加到末尾
    const choicesIdx = cleanedContent.indexOf('<div class="choices-section"');
    if (choicesIdx !== -1) {
        return cleanedContent.substring(0, choicesIdx) + statusHtml + '\n' + cleanedContent.substring(choicesIdx);
    }

    return cleanedContent + '\n' + statusHtml;
}

/**
 * 提取 markdown 表格中的状态数据
 * 检测 | key | value | 格式的表格，如果包含状态关键词则提取并移除
 * @param {string} content - HTML 内容
 * @param {Array} items - 状态项收集数组（就地修改）
 * @returns {string} 清理后的内容
 */
function extractMarkdownTables(content, items) {
    // 匹配 markdown 表格：表头行 + 分隔行 + 数据行（至少1行数据）
    const tablePattern = /^(\|.+\|)\s*\n(\|[\s:|-]+)\s*\n((?:\|.+\|\s*\n?)+)/gm;

    let result = content;
    result = result.replace(tablePattern, (fullMatch, headerRow, sepRow, dataRows) => {
        const fullText = fullMatch;

        // 检查是否包含状态关键词
        const hasStatusKw = STATUS_KEYWORDS.some(kw => fullText.includes(kw));
        if (!hasStatusKw) return fullMatch; // 不是状态表格，保留

        // 解析表头
        const headers = headerRow.split('|').map(c => c.trim()).filter(c => c);

        // 解析数据行
        const rows = dataRows.trim().split('\n');
        for (const row of rows) {
            const cells = row.split('|').map(c => c.trim()).filter(c => c);
            if (cells.length >= 2) {
                items.push({ key: cells[0], value: cells.slice(1).join(' | ') });
            } else if (cells.length === 1) {
                items.push({ key: '', value: cells[0] });
            }
        }

        return ''; // 移除表格
    });

    return result.replace(/\n{3,}/g, '\n\n');
}

/**
 * 提取 HTML <table> 中的状态数据
 * 检测含状态关键词的 HTML 表格，提取并移除
 * @param {string} content - HTML 内容
 * @param {Array} items - 状态项收集数组（就地修改）
 * @returns {string} 清理后的内容
 */
function extractHtmlTables(content, items) {
    const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;

    let result = content;
    result = result.replace(tablePattern, (fullMatch, body) => {
        // 检查是否包含状态关键词
        const hasStatusKw = STATUS_KEYWORDS.some(kw => fullMatch.includes(kw));
        if (!hasStatusKw) return fullMatch;

        // 提取表格行
        const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = rowPattern.exec(body)) !== null) {
            const cells = [];
            const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
            let cellMatch;
            while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
                cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
            }
            if (cells.length >= 2) {
                items.push({ key: cells[0], value: cells.slice(1).join(' | ') });
            }
        }

        return ''; // 移除表格
    });

    return result.replace(/\n{3,}/g, '\n\n');
}

/**
 * 提取尾部键值对状态文本
 * 检测最后一个 HTML 块之后的状态键值对，提取并移除
 * 支持：key：value / [key：value] / <p> 包裹的状态文本
 * @param {string} content - HTML 内容
 * @param {Array} items - 状态项收集数组（就地修改）
 * @returns {string} 清理后的内容
 */
function extractTrailingStatus(content, items) {
    // 找到最后一个 </div> 之后的内容
    const lastDivEnd = content.lastIndexOf('</div>');
    if (lastDivEnd === -1) return content;

    const htmlPart = content.substring(0, lastDivEnd + 6);
    const trailingText = content.substring(lastDivEnd + 6).trim();

    if (!trailingText) return content;

    // 检查是否包含状态关键词
    const hasStatusKw = STATUS_KEYWORDS.some(kw => trailingText.includes(kw)) ||
                        /角色档案/.test(trailingText);
    if (!hasStatusKw) return content;

    // 按中文分号、英文分号或换行拆分
    const segments = trailingText.split(/[；;\n]/).map(s => s.trim()).filter(s => s.length > 0);

    let hasAnyKv = false;
    for (let seg of segments) {
        // 先剥离段落内的 HTML 标签（如 <p style="...">text</p> 残留）
        const plainSeg = seg.replace(/<[^>]+>/g, '').trim();
        if (!plainSeg) continue;

        // 优先匹配 [key：value] 方括号格式（进度条等）
        const bracketKvMatch = plainSeg.match(/^\[([^：:\]]+?)\s*[：:]\s*(.+)\]$/);
        if (bracketKvMatch) {
            items.push({ key: bracketKvMatch[1].trim(), value: bracketKvMatch[2].trim() });
            hasAnyKv = true;
            continue;
        }

        // 普通键值对
        const kvMatch = plainSeg.match(/^([^:：]{1,12}?)\s*[:：]\s*(.+)$/);
        if (kvMatch) {
            items.push({ key: kvMatch[1].trim(), value: kvMatch[2].trim() });
            hasAnyKv = true;
        } else if (plainSeg.length > 0 && plainSeg.length < 100) {
            items.push({ key: '', value: plainSeg });
            hasAnyKv = true;
        }
    }

    // 如果提取到了键值对，移除尾部文本（用美化状态栏取代）
    if (hasAnyKv) {
        return htmlPart;
    }

    return content;
}

/**
 * 提取 <p> 标签中的状态数据
 * 扫描内容中所有 <p> 标签，如果包含状态关键词则提取并移除
 * 处理 AI 输出中 <p style="...">[练体进度：12/100]</p> 这类格式
 *
 * 精确匹配策略：避免误提取 story-text 内的剧情 <p> 标签
 * - [key：value] 方括号格式：key 必须包含/被包含于状态关键词
 * - key：value 格式：key 本身必须是状态关键词
 * - 这样 <p>他说：你的修为还不够</p> 不会被误提取（"他说"不是状态关键词）
 * @param {string} content - HTML 内容
 * @param {Array} items - 状态项收集数组（就地修改）
 * @returns {string} 清理后的内容
 */
function extractStatusPTags(content, items) {
    const pTagPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;

    let result = content;
    result = result.replace(pTagPattern, (fullMatch, innerHtml) => {
        // 提取纯文本（去除内部 HTML 标签）
        const plainText = innerHtml.replace(/<[^>]+>/g, '').trim();
        if (!plainText) return fullMatch;

        // 策略1: [key：value] 方括号格式（进度条等），key 须关联状态关键词
        const bracketKvMatch = plainText.match(/^\[([^：:\]]+?)\s*[：:]\s*(.+)\]$/);
        if (bracketKvMatch) {
            const key = bracketKvMatch[1].trim();
            const isStatusKey = STATUS_KEYWORDS.some(kw => key === kw || key.includes(kw) || kw.includes(key));
            if (isStatusKey) {
                items.push({ key, value: bracketKvMatch[2].trim() });
                return ''; // 移除 <p> 标签
            }
            // 方括号格式但不关联状态关键词 → 保留
            return fullMatch;
        }

        // 策略2: key：value 格式，key 本身必须是状态关键词
        const kvMatch = plainText.match(/^([^:：]{1,12}?)\s*[:：]\s*(.+)$/);
        if (kvMatch) {
            const key = kvMatch[1].trim();
            const isStatusKey = STATUS_KEYWORDS.some(kw => key === kw || key.includes(kw) || kw.includes(key));
            if (isStatusKey) {
                items.push({ key, value: kvMatch[2].trim() });
                return ''; // 移除 <p> 标签
            }
        }

        return fullMatch; // 不是状态相关，保留
    });

    return result.replace(/\n{3,}/g, '\n\n');
}

// ========== 核心注入函数 ==========

/**
 * 检测文本中的主题标记，构建完整的 HTML + CSS
 * @param {string} text - AI 原始输出文本
 * @returns {{ display: string, context: string } | null} 注入结果，或 null
 */
function injectHtml(text) {
    // 1. 检测主题标记
    const themeMatch = text.match(/<!--\s*theme:(\S+)\s*-->/);
    if (!themeMatch) return null;

    const theme = themeMatch[1];
    const template = TEMPLATES[theme];
    if (!template) return null;

    // 2. 清理：移除代码块标记和主题标记
    let content = text
        .replace(/```html\s*\n?/g, '')
        .replace(/```\s*$/gm, '')
        .replace(/<!--\s*theme:\S+\s*-->\s*\n?/g, '')
        .trim();

    // 2.5 后处理：自动包装对白（楷体加粗）+ 检测并渲染状态栏
    content = postProcessHtml(content);

    // 3. 构建完整 HTML：style + 作用域包裹 + 结构
    const scopeClass = THEME_SCOPE_CLASS[theme] || `html-inject-${theme}`;
    const scopedCss = scopeCssSelectors(template.css, `.${scopeClass}`);

    const display =
        `<style>${scopedCss}</style>` +
        `<div class="${scopeClass}">` +
        `<div class="roleplay-container">${content}</div>` +
        `</div>`;

    return { display, context: foldCompact(text) };
}

/**
 * CSS 作用域处理：为选择器添加作用域前缀
 * 防止多消息使用不同主题时样式冲突
 * @param {string} css - 原始 CSS
 * @param {string} scopeSelector - 作用域选择器，如 .html-inject-parchment
 * @returns {string} 加了前缀的 CSS
 */
function scopeCssSelectors(css, scopeSelector) {
    // 处理 @media 块：先提取，处理内部，再拼回
    const mediaBlocks = [];
    let processed = css.replace(/@media\s*([^{]+)\{([\s\S]*?)\}\s*$/gm, (match, condition, body) => {
        const placeholder = `__MEDIA_${mediaBlocks.length}__`;
        const scopedBody = scopeSimpleSelectors(body, scopeSelector);
        mediaBlocks.push(`@media ${condition}{${scopedBody}}`);
        return placeholder;
    });

    // 处理非 @media 的选择器
    processed = scopeSimpleSelectors(processed, scopeSelector);

    // 恢复 @media 块
    mediaBlocks.forEach((block, idx) => {
        processed = processed.replace(`__MEDIA_${idx}__`, block);
    });

    return processed;
}

/**
 * 为简单选择器（非 @media）添加作用域前缀
 */
function scopeSimpleSelectors(css, scopeSelector) {
    // 匹配 CSS 选择器（在 { 之前的文本）
    return css.replace(/([^{}]+)\{/g, (match, selectors) => {
        const trimmed = selectors.trim();
        // 跳过空、@规则、占位符
        if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('__MEDIA_')) return match;
        const prefixed = trimmed.split(',').map(s => {
            s = s.trim();
            if (!s) return s;
            return scopeSelector + ' ' + s;
        }).join(', ');
        return prefixed + '{';
    });
}

// ========== 折叠函数 ==========

/**
 * 将含主题标记的 HTML 折叠为纯文本（用于上下文/提示词）
 */
function foldCompact(text) {
    let result = text;
    result = result.replace(/<!--\s*theme:\S+\s*-->/g, '');
    result = result.replace(/```html/g, '');
    result = result.replace(/```/g, '');

    // 提取剧情文本
    const storyMatch = result.match(/<div class="story-text">([\s\S]*?)<\/div>/);
    if (storyMatch) {
        const paragraphs = storyMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/g);
        if (paragraphs) {
            const plainParagraphs = paragraphs.map(p => {
                let t = p.replace(/<span class="dialogue">([\s\S]*?)<\/span>/g, '"$1"');
                t = t.replace(/<span class="important">([\s\S]*?)<\/span>/g, '【$1】');
                t = t.replace(/<[^>]+>/g, '').trim();
                return t;
            }).filter(p => p.length > 0);
            result = result.replace(storyMatch[0], plainParagraphs.join('\n'));
        }
    }

    // 提取状态栏
    const statusItems = result.match(/<div class="status-item">([\s\S]*?)<\/div>/g);
    if (statusItems) {
        const statusText = statusItems.map(item => {
            let t = item.replace(/<span class="status-value">/g, ':');
            t = t.replace(/<\/span>/g, '');
            t = t.replace(/<[^>]+>/g, '').trim();
            return t;
        }).join(' | ');
        result = result.replace(/<div class="status-section">[\s\S]*?<\/div>/, '\n[状态] ' + statusText);
    }

    // 提取选项按钮
    const buttons = result.match(/<button class="choice-btn"[^>]*>([\s\S]*?)<\/button>/g);
    if (buttons) {
        const choiceText = buttons.map(btn => {
            let t = btn.replace(/<span class="choice-label">([\s\S]*?)<\/span>/g, '[$1] ');
            t = t.replace(/<[^>]+>/g, '').trim();
            return t;
        }).join('\n');
        result = result.replace(/<div class="choices-section">[\s\S]*?<\/div>/, '\n[选项]\n' + choiceText);
    }

    result = result.replace(/<\/?div[^>]*>/g, '');
    result = result.replace(/\n{3,}/g, '\n\n');
    return result.trim();
}

/**
 * 折叠含 <style>/<script> 的完整 HTML
 */
function foldHtml(text) {
    let result = text;
    result = result.replace(/<style>[\s\S]*?<\/style>/g, '');
    result = result.replace(/<script>[\s\S]*?<\/script>/g, '');
    return foldCompact(result);
}

// ========== 主处理管道 ==========

/**
 * 判断文本类型，返回 { display, context }
 * @param {string} text - AI 原始输出文本
 * @returns {{ display: string, context: string }}
 */
function pipeline(text) {
    // 1. 含主题标记 → 注入模板（含 CSS）
    const hasTheme = /<!--\s*theme:\S+\s*-->/.test(text);
    if (hasTheme) {
        const result = injectHtml(text);
        if (result) {
            console.log('[HTML-Inject] pipeline: 路径1（主题标记）');
            return result;
        }
    }

    // 2. 无代码块包裹的原始 HTML（检测模板 class 名）
    // 同时检测 DOMPurify 添加的 custom- 前缀（防御性）
    const hasTemplateClasses = /class="(?:custom-)?(?:story-text|status-section|choices-section|roleplay-container|choice-btn)"/.test(text);
    if (hasTemplateClasses && !hasTheme) {
        const theme = extension_settings.html_inject?.theme || '羊皮卷';
        const template = TEMPLATES[theme];
        if (template) {
            console.log(`[HTML-Inject] pipeline: 路径2（原始HTML → 主题: ${theme}）`);
            let content = text
                .replace(/```html\s*\n?/g, '')
                .replace(/```\s*$/gm, '')
                .trim();
            // 后处理：自动包装对白 + 检测状态栏
            content = postProcessHtml(content);
            // 如果已有 roleplay-container 包裹，不再重复包裹
            if (!/<div class="roleplay-container">/.test(content)) {
                content = `<div class="roleplay-container">${content}</div>`;
            }
            const scopeClass = THEME_SCOPE_CLASS[theme] || `html-inject-${theme}`;
            const scopedCss = scopeCssSelectors(template.css, `.${scopeClass}`);
            const display =
                `<style>${scopedCss}</style>` +
                `<div class="${scopeClass}">${content}</div>`;
            return { display, context: foldCompact(text) };
        }
    }

    // 3. 含 <style> 的完整 HTML → 直接渲染
    if (/<style>/.test(text)) {
        console.log('[HTML-Inject] pipeline: 路径3（含<style>完整HTML）');
        return { display: text, context: foldHtml(text) };
    }

    // 4. 无 HTML → 原样返回
    return { display: text, context: text };
}

// ========== 上下文折叠 ==========

const originalTextMap = new Map();  // messageId → 原始文本
const contextMap = new Map();       // messageId → 折叠后文本

/**
 * 发送给 AI 前替换为折叠文本
 */
function swapToContext() {
    const ctx = getContext();
    if (!ctx?.chat) return;
    for (const [id, folded] of contextMap.entries()) {
        if (ctx.chat[id]) {
            ctx.chat[id].mes = folded;
        }
    }
}

/**
 * 发送后恢复原始文本
 */
function restoreToDisplay() {
    const ctx = getContext();
    if (!ctx?.chat) return;
    for (const [id, original] of originalTextMap.entries()) {
        if (ctx.chat[id]) {
            ctx.chat[id].mes = original;
        }
    }
}

// ========== 注入消息到 DOM ==========

/**
 * 查找消息的 .mes_text DOM 元素
 * 使用多种选择器策略确保兼容性
 * @param {number|string} messageId
 * @returns {HTMLElement|null}
 */
function findMesTextEl(messageId) {
    const id = Number(messageId);
    if (isNaN(id)) return null;

    // 策略1：标准选择器（#chat 限定范围更精确）
    let el = document.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);
    if (el) return el;

    // 策略2：不带 #chat 前缀
    el = document.querySelector(`.mes[mesid="${id}"] .mes_text`);
    if (el) return el;

    // 策略3：jQuery 方式（ST 常用）
    try {
        const $el = $('#chat').find(`.mes[mesid="${id}"] .mes_text`);
        if ($el.length) return $el[0];
    } catch (e) { /* jQuery 不可用时忽略 */ }

    // 策略4：遍历所有 .mes 查找匹配 mesid
    const allMes = document.querySelectorAll('#chat .mes');
    for (const mes of allMes) {
        if (mes.getAttribute('mesid') === String(id)) {
            const textEl = mes.querySelector('.mes_text');
            if (textEl) return textEl;
        }
    }

    return null;
}

/**
 * 对单条消息执行 HTML 注入
 * @param {number|string} messageId - 消息 ID
 * @param {{ retry?: boolean }} options - 选项
 * @returns {boolean} 是否成功注入
 */
function injectMessage(messageId, options = {}) {
    try {
    const id = Number(messageId);
    if (isNaN(id)) {
        console.warn('[HTML-Inject] injectMessage: messageId 不是有效数字:', messageId);
        return false;
    }

    if (!extension_settings.html_inject?.enabled) {
        console.log('[HTML-Inject] injectMessage: 扩展已禁用，跳过消息 #' + id);
        return false;
    }

    const ctx = getContext();
    const message = ctx.chat?.[id];
    if (!message) {
        console.warn('[HTML-Inject] injectMessage: 找不到消息 #' + id);
        return false;
    }
    if (message.is_user || message.is_system) {
        return false; // 用户/系统消息不需要注入
    }

    let text = message.mes || '';
    if (!text.trim()) {
        console.log('[HTML-Inject] injectMessage: 消息 #' + id + ' 内容为空');
        return false;
    }

    // 防御：如果 mes 中 HTML 已被转义（encode_tags 写回了 mes），先反转义
    if (text.includes('&lt;') && text.includes('&gt;') && /class\s*=\s*["']/.test(text) === false) {
        // 看起来是转义后的 HTML，尝试还原
        const unescaped = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        if (/class="(story-text|status-section|choices-section|roleplay-container|choice-btn)"/.test(unescaped)) {
            console.log('[HTML-Inject] injectMessage: 检测到转义 HTML，已还原（消息 #' + id + '）');
            text = unescaped;
        }
    }

    const result = pipeline(text);
    if (!result) {
        console.log('[HTML-Inject] injectMessage: pipeline 返回 null（消息 #' + id + '）');
        return false;
    }
    if (result.display === text) {
        console.log('[HTML-Inject] injectMessage: pipeline 未产生变化，跳过（消息 #' + id + '）');
        return false;
    }

    // 保存原始文本和折叠文本
    originalTextMap.set(id, text);
    contextMap.set(id, result.context);

    // 查找 DOM 元素
    const mesTextEl = findMesTextEl(id);
    if (!mesTextEl) {
        if (!options.retry) {
            console.warn('[HTML-Inject] injectMessage: 找不到 .mes_text 元素（消息 #' + id + '），将延迟重试');
            // 延迟重试：DOM 可能还未就绪
            setTimeout(() => injectMessage(id, { retry: true }), 200);
            setTimeout(() => injectMessage(id, { retry: true }), 800);
        } else {
            console.warn('[HTML-Inject] injectMessage: 重试仍找不到 .mes_text（消息 #' + id + '）');
        }
        return false;
    }

    // 直接替换 DOM（绕过 ST 渲染管线）
    mesTextEl.innerHTML = result.display;

    // 标记已注入，防止 MutationObserver 误重注入
    mesTextEl.setAttribute('data-html-injected', String(id));

    console.log(`[HTML-Inject] 消息 #${id} 已注入 | 文本长度: ${text.length} → 显示: ${result.display.length}`);
    return true;

    } catch (err) {
        console.error('[HTML-Inject] injectMessage 异常:', err);
        return false;
    }
}

/**
 * 扫描当前聊天所有消息，重新注入
 */
function reInjectAllMessages() {
    if (!extension_settings.html_inject?.enabled) return;

    const ctx = getContext();
    if (!ctx?.chat) return;

    let count = 0;
    let skipped = 0;
    for (let i = 0; i < ctx.chat.length; i++) {
        if (injectMessage(i)) {
            count++;
        } else {
            const msg = ctx.chat[i];
            if (msg && !msg.is_user && !msg.is_system && msg.mes) {
                skipped++;
            }
        }
    }
    console.log(`[HTML-Inject] 聊天重载：注入 ${count} 条，跳过 ${skipped} 条`);
}

/**
 * 启动 MutationObserver：监控 .mes_text 的变化，自动重新注入
 * 当其他扩展（如翻译）覆盖我们的注入内容时，自动恢复
 */
function startMesTextObserver() {
    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
            if (!(mutation.target instanceof HTMLElement)) continue;
            if (!mutation.target.classList.contains('mes_text')) continue;

            // 检查是否是被我们注入的元素被外部修改
            const injectedId = mutation.target.getAttribute('data-html-injected');
            if (!injectedId) continue; // 不是我们注入的，跳过

            // 检查内容是否仍包含我们的注入标记
            const hasOurContent = mutation.target.querySelector('.roleplay-container, .choices-section, .status-section, .html-inject-parchment, .html-inject-dark');
            if (hasOurContent) continue; // 内容仍在，不需要重注入

            // 内容被覆盖，重新注入
            const id = Number(injectedId);
            if (!isNaN(id)) {
                console.log(`[HTML-Inject] MutationObserver: 检测到消息 #${id} 内容被覆盖，重新注入`);
                // 清除标记以避免无限循环
                mutation.target.removeAttribute('data-html-injected');
                injectMessage(id);
            }
        }
    });

    observer.observe(document.getElementById('chat') || document.body, {
        childList: true,
        subtree: true,
    });
    console.log('[HTML-Inject] MutationObserver 已启动');
}

// ========== 提示词模板 ==========

/**
 * 动态生成提示词模板
 * 根据当前角色卡的状态栏检测结果，决定是否包含状态栏段落及具体字段
 * @returns {string} 提示词文本
 */
function buildPromptTemplate() {
    const config = getEffectiveStatusConfig();
    const theme = extension_settings.html_inject?.theme || '羊皮卷';

    let template = `【HTML 输出规则】
每轮回复时，用 \`\`\`html 代码块输出界面，格式如下：

第1行写主题标记：<!-- theme:${theme} -->
然后只写动态内容（剧情${config.hasStatus ? '、状态' : ''}、选项），不写 CSS 和 JavaScript。

剧情文本：
<div class="story-text">
<p>段落1</p>
<p><span class="dialogue">"对白内容"</span></p>
</div>
`;

    // 根据检测结果决定是否包含状态栏
    if (config.hasStatus && config.fields.length > 0) {
        const fieldItems = config.fields.map(field =>
            `<div class="status-item">${field}：<span class="status-value">当前值</span></div>`
        ).join('\n');

        template += `
状态栏（根据角色设定跟踪以下属性）：
<div class="status-section">
<div class="status-header" onclick="HtmlInject.toggleSection(this)">
<span>角色状态</span><span class="toggle-icon">▼</span>
</div>
<div class="status-content">
${fieldItems}
</div>
</div>
`;
    }

    template += `
选项按钮：
<div class="choices-section">
<div class="choices-title">—— 请选择你的行动 ——</div>
<button class="choice-btn" data-choice="选项文本">
<span class="choice-label">A</span>选项文本
</button>
</div>

注意：
- 选项按钮用 data-choice="选项文本" 存储选项文本（也支持 onclick="sendChoice('选项文本')" 兼容格式）
- 选项文本中的单引号用 %27 转义
- 只输出上述内容，不要输出 <style> 和 <script>`;

    return template;
}

// ========== 设置弹窗 ==========

async function showSettingsPopup() {
    const html = await renderExtensionTemplateAsync('third-party/html-inject', 'settings');
    const dialog = $(html);

    // 基础设置
    dialog.find('#html_inject_enabled').prop('checked', extension_settings.html_inject.enabled);
    dialog.find('#html_inject_fold_context').prop('checked', extension_settings.html_inject.fold_context);
    dialog.find('#html_inject_theme').val(extension_settings.html_inject.theme);
    dialog.find('#html_inject_theme_list').text('可用主题：' + Object.keys(TEMPLATES).join('、'));

    // 状态栏模式设置
    const statusMode = extension_settings.html_inject.status_mode || STATUS_MODE.AUTO;
    dialog.find('#html_inject_status_mode').val(statusMode);
    dialog.find('#html_inject_status_fields').val(extension_settings.html_inject.status_fields || '');

    // 根据模式显示/隐藏手动字段输入框
    function updateStatusUI() {
        const mode = dialog.find('#html_inject_status_mode').val();
        dialog.find('#html_inject_manual_fields_row').toggle(mode === STATUS_MODE.MANUAL);

        // 更新检测提示
        if (mode === STATUS_MODE.AUTO) {
            const config = getCharStatusConfig();
            if (config.hasStatus) {
                dialog.find('#html_inject_status_detected')
                    .text('✓ 已检测到状态属性：' + config.fields.join('、'))
                    .css('color', '#4caf50');
            } else {
                dialog.find('#html_inject_status_detected')
                    .text('✗ 当前角色卡未检测到状态栏相关内容')
                    .css('color', '#ff9800');
            }
        } else if (mode === STATUS_MODE.MANUAL) {
            const fields = (dialog.find('#html_inject_status_fields').val() || '')
                .split(/[,，、\n]/).map(s => s.trim()).filter(s => s.length > 0);
            if (fields.length > 0) {
                dialog.find('#html_inject_status_detected')
                    .text('手动指定字段：' + fields.join('、'))
                    .css('color', '#2196f3');
            } else {
                dialog.find('#html_inject_status_detected')
                    .text('请输入状态字段，用逗号分隔')
                    .css('color', '#ff9800');
            }
        } else {
            dialog.find('#html_inject_status_detected')
                .text('状态栏已关闭')
                .css('color', '#999');
        }

        // 更新提示词预览
        dialog.find('#html_inject_prompt_template').val(buildPromptTemplate());
    }

    updateStatusUI();

    // 事件绑定
    dialog.find('#html_inject_enabled').on('change', function () {
        extension_settings.html_inject.enabled = $(this).prop('checked');
        saveSettingsDebounced();
    });
    dialog.find('#html_inject_fold_context').on('change', function () {
        extension_settings.html_inject.fold_context = $(this).prop('checked');
        saveSettingsDebounced();
    });
    dialog.find('#html_inject_theme').on('change', function () {
        extension_settings.html_inject.theme = $(this).val();
        saveSettingsDebounced();
        updateStatusUI();
    });
    dialog.find('#html_inject_status_mode').on('change', function () {
        extension_settings.html_inject.status_mode = $(this).val();
        saveSettingsDebounced();
        updateStatusUI();
    });
    dialog.find('#html_inject_status_fields').on('input', function () {
        extension_settings.html_inject.status_fields = $(this).val();
        saveSettingsDebounced();
        updateStatusUI();
    });
    dialog.find('#html_inject_copy_prompt').on('click', function () {
        const textarea = dialog.find('#html_inject_prompt_template')[0];
        textarea.select();
        navigator.clipboard.writeText(textarea.value).then(() => {
            toastr.success('提示词已复制到剪贴板');
        });
    });
    dialog.find('#html_inject_reinject').on('click', function () {
        originalTextMap.clear();
        contextMap.clear();
        reInjectAllMessages();
        toastr.success('已重新注入所有消息');
    });

    callGenericPopup(dialog, POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true });
}

// ========== 初始化 ==========

$(function () {
    console.log('[HTML-Inject] 已加载 | 主题:', Object.keys(TEMPLATES).join(', '));

    // 验证关键依赖
    if (typeof eventSource === 'undefined' || !eventSource) {
        console.error('[HTML-Inject] eventSource 未定义！扩展无法工作');
        return;
    }
    if (!event_types || !event_types.CHARACTER_MESSAGE_RENDERED) {
        console.error('[HTML-Inject] event_types 不完整！CHARACTER_MESSAGE_RENDERED:', event_types?.CHARACTER_MESSAGE_RENDERED);
        return;
    }
    console.log('[HTML-Inject] 事件验证通过: CHARACTER_MESSAGE_RENDERED =', event_types.CHARACTER_MESSAGE_RENDERED);

    // 初始化设置
    extension_settings.html_inject = extension_settings.html_inject || {};
    extension_settings.html_inject.enabled = extension_settings.html_inject.enabled ?? true;
    extension_settings.html_inject.fold_context = extension_settings.html_inject.fold_context ?? true;
    extension_settings.html_inject.theme = extension_settings.html_inject.theme || '羊皮卷';
    extension_settings.html_inject.status_mode = extension_settings.html_inject.status_mode || STATUS_MODE.AUTO;
    extension_settings.html_inject.status_fields = extension_settings.html_inject.status_fields || '';

    // ===== 添加 wand 菜单按钮 =====
    const buttonHtml = `
        <div id="html_inject_button" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-palette extensionsMenuExtensionButton"></div>HTML Inject
        </div>`;

    function addButton() {
        if ($('#extensionsMenu').length && !$('#html_inject_button').length) {
            $('#extensionsMenu').append(buttonHtml);
            $('#html_inject_button').on('click', showSettingsPopup);
            console.log('[HTML-Inject] 按钮已添加到 wand 菜单');
        } else {
            setTimeout(addButton, 200);
        }
    }
    addButton();

    // ===== 核心：消息渲染完成后注入 HTML =====
    // 事件签名：CHARACTER_MESSAGE_RENDERED 传入 (messageId, type)
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId, type) => {
        const id = Number(messageId);
        if (isNaN(id)) {
            console.warn('[HTML-Inject] CHARACTER_MESSAGE_RENDERED: messageId 无效:', messageId);
            return;
        }
        console.log(`[HTML-Inject] CHARACTER_MESSAGE_RENDERED: 消息 #${id}, 类型: ${type}`);
        injectMessage(id);
    });

    // ===== 聊天切换时重新注入所有消息 =====
    eventSource.on(event_types.CHAT_CHANGED, () => {
        // 清空旧映射
        originalTextMap.clear();
        contextMap.clear();
        // 延迟执行，确保 DOM 已渲染完成
        setTimeout(reInjectAllMessages, 300);
        setTimeout(reInjectAllMessages, 1000); // 二次扫描兜底
    });

    // ===== 上下文折叠：发送给 AI 前替换为纯文本 =====
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
        if (!extension_settings.html_inject.fold_context) return;
        swapToContext();
        console.log('[HTML-Inject] 上下文已折叠为纯文本');
    });

    // ===== 上下文恢复：发送后恢复原始文本 =====
    eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, () => {
        if (!extension_settings.html_inject.fold_context) return;
        restoreToDisplay();
        console.log('[HTML-Inject] 上下文已恢复为展示版');
    });

    // ===== 暴露全局 API =====

    // 核心交互函数（提前定义，避免 this 上下文问题）
    function toggleSection(header) {
        var content = header.nextElementSibling;
        var icon = header.querySelector('.toggle-icon');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
        }
    }

    function sendChoice(text) {
        var ta = document.getElementById('send_textarea');
        if (ta) {
            ta.value = text;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            var sendBtn = document.getElementById('send_but') || document.querySelector('.send_button');
            if (sendBtn) {
                sendBtn.click();
                return;
            }
        }
        // 后备：复制到剪贴板
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            if (typeof toastr !== 'undefined') {
                toastr.info('已复制到剪贴板：' + text);
            }
        } else {
            console.log('[HTML-Inject] Selected:', text);
        }
    }

    function onChoice(btn, text) {
        // 防止重复处理（事件委托和 onclick 可能同时触发）
        if (btn.classList.contains('selected') || btn.classList.contains('disabled')) return;

        var container = btn.closest('.choices-section');
        if (container) {
            container.querySelectorAll('.choice-btn').forEach(function (b) {
                b.classList.add('disabled');
            });
        }
        btn.classList.remove('disabled');
        btn.classList.add('selected');

        var feedback = document.createElement('div');
        feedback.className = 'choice-feedback';
        feedback.textContent = '已选择：' + text;
        btn.parentElement.appendChild(feedback);

        sendChoice(text);
    }

    // 暴露为全局函数（AI 输出 onclick="sendChoice('...')" 和 onclick="toggleSection(this)" 需要全局可访问）
    window.toggleSection = toggleSection;
    window.sendChoice = sendChoice;
    window.onChoice = onChoice;

    // 事件委托：即使 onclick 被剥离也能捕获点击
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.choice-btn');
        if (!btn) return;

        // 如果按钮已有 onclick 且浏览器已执行（有 selected 类），跳过
        if (btn.classList.contains('selected')) return;

        // 提取选项文本：优先 data-choice → onclick 属性解析 → 按钮文本
        var text = btn.getAttribute('data-choice');
        if (!text) {
            // 尝试从 onclick 属性中提取参数
            var onclickAttr = btn.getAttribute('onclick') || '';
            var onclickMatch = onclickAttr.match(/(?:sendChoice|onChoice)\s*\(\s*(?:this\s*,\s*)?['"](.+?)['"]\s*\)/);
            if (onclickMatch) {
                text = onclickMatch[1];
            }
        }
        if (!text) {
            // 从按钮文本中提取（去掉标签 span）
            var clone = btn.cloneNode(true);
            clone.querySelectorAll('.choice-label').forEach(function (l) { l.remove(); });
            text = clone.textContent.trim();
        }
        if (!text) return;

        onChoice(btn, text);
    });

    window.HtmlInject = {
        toggleSection: toggleSection,
        onChoice: onChoice,
        sendChoice: sendChoice,

        // 公开 API
        inject: injectHtml,
        fold: foldCompact,
        foldHtml: foldHtml,
        pipeline: pipeline,
        templates: TEMPLATES,
        settings: extension_settings.html_inject,
        addTheme: function (name, css, js) {
            TEMPLATES[name] = { css, js };
            THEME_SCOPE_CLASS[name] = `html-inject-${name}`;
            console.log('[HTML-Inject] 已添加主题:', name);
        },
        listThemes: function () {
            return Object.keys(TEMPLATES);
        },
        // 手动重新注入所有消息
        reInject: reInjectAllMessages,
        // 对单条消息执行注入
        injectOne: injectMessage,
        // 查找 DOM 元素
        findEl: findMesTextEl,
        // 状态栏检测
        detectStatus: getCharStatusConfig,
        getEffectiveStatus: getEffectiveStatusConfig,
        buildPrompt: buildPromptTemplate,
        // 后处理
        postProcess: postProcessHtml,
        wrapDialogue: wrapDialogue,
        renderStatus: renderStatusBlock,
        extractMdTable: extractMarkdownTables,
        extractHtmlTable: extractHtmlTables,
        extractTrailing: extractTrailingStatus,
        extractPTags: extractStatusPTags,
        // ★ 调试命令：在控制台运行 HtmlInject.debug() 诊断问题
        debug: function () {
            const ctx = getContext();
            const chat = ctx?.chat;
            console.group('[HTML-Inject] 调试信息');
            console.log('扩展启用:', extension_settings.html_inject?.enabled);
            console.log('当前主题:', extension_settings.html_inject?.theme);
            console.log('状态栏模式:', extension_settings.html_inject?.status_mode);
            console.log('聊天消息数:', chat?.length ?? 0);
            console.log('原始文本映射:', originalTextMap.size, '条');
            console.log('上下文映射:', contextMap.size, '条');

            if (chat) {
                for (let i = 0; i < chat.length; i++) {
                    const msg = chat[i];
                    if (msg.is_user || msg.is_system) continue;
                    const text = msg.mes || '';
                    const hasTheme = /<!--\s*theme:\S+\s*-->/.test(text);
                    const hasClasses = /class="(?:custom-)?(?:story-text|status-section|choices-section|roleplay-container|choice-btn)"/.test(text);
                    const hasEscaped = text.includes('&lt;') && text.includes('&gt;');
                    const el = findMesTextEl(i);
                    const injected = el?.getAttribute('data-html-injected');
                    console.log(`消息 #${i}: 长度=${text.length}, 主题=${hasTheme}, 模板类=${hasClasses}, 转义=${hasEscaped}, DOM=${!!el}, 已注入=${injected}`);
                    if (hasClasses && !el) {
                        console.warn(`  → 有模板类但找不到 DOM 元素！`);
                    }
                }
            }

            // 测试 pipeline
            if (chat) {
                const lastAi = [...chat].reverse().find(m => !m.is_user && !m.is_system);
                if (lastAi) {
                    const text = lastAi.mes || '';
                    const result = pipeline(text);
                    console.log('最后AI消息 pipeline 测试:');
                    console.log('  输入前100字:', text.substring(0, 100));
                    console.log('  输出前100字:', result?.display?.substring(0, 100));
                    console.log('  变化:', result?.display !== text);
                }
            }

            console.groupEnd();
            return '调试信息已输出到控制台。有问题请截图 [HTML-Inject] 开头的日志。';
        }
    };

    console.log('[HTML-Inject] API: window.HtmlInject.pipeline(text) → { display, context }');
    console.log('[HTML-Inject] 状态栏: HtmlInject.detectStatus() → { hasStatus, fields, source }');
    console.log('[HTML-Inject] 后处理: HtmlInject.wrapDialogue(text), HtmlInject.renderStatus(text)');
    console.log('[HTML-Inject] 全局函数: HtmlInject.toggleSection(el), HtmlInject.onChoice(btn, text), HtmlInject.sendChoice(text)');

    // ===== 启动 MutationObserver 监控 =====
    startMesTextObserver();

    // ===== 初始扫描：页面加载后检查当前聊天 =====
    setTimeout(reInjectAllMessages, 1500);
});
