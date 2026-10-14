---
name: book-to-webpage
description: 把书（PDF/Markdown等）拆解成本地知识库，再据用户请求（全书概述/某主题/某章）生成可交互的HTML学习页。页面全程可点可探索。当用户想让一本书的某个主题以美观交互网页呈现、或做全书概览页时使用。
---

# book-to-webpage

把书变成可交互的学习页。**两阶段**：先拆全书成本地知识库（`<书名>.kb/`），再据请求生成单页 HTML。

## 哲学

- **展示层是核心差异化**：不是读书摘要，是把书中某主题做成可点击、可探索的页面。组件可交互，内容成叙事。
- **拆解逻辑复用 book-to-skill**：提取器和拆解流程整体复制，不重新发明；但产出本地知识库（`<书名>.kb/`），**不生成 skill、不安装到 ~/.claude/skills/**。
- **散布内容要全面聚合**：某主题散布全书时，用 Topic Index 定位所有相关章，全部纳入，不遗漏。

## 两种运行入口

1. **首次处理一本书**：跑阶段 1，生成 `<书名>.kb/` 知识库。
2. **已有知识库后生成网页**：跑阶段 2，按请求产出单页 HTML。

---

## 文件结构

本 skill 附带以下预制资产，Agent 在渲染时引用：

| 文件 | 作用 | 用法 |
|------|------|------|
| `templates/base.html` | ①骨架层：页面壳、CSS 变量、布局、移动端断点、所有组件基础样式 | 抄，替换 `{{...}}` 槽位（含 `{{theme_style}}`/`{{theme_name}}`） |
| `templates/components.md` | ②组件层：每个组件的 HTML/CSS/JS 范式 + 数据槽位 | 按 signature 挑范式，抄+填数据 |
| `templates/themes/` | ③主题层：4 个 `.css`（暖纸典藏/极简学术/夜读深空/东方水墨）+ `README.md` 目录 | 选一个，整段注入 `{{theme_style}}` |
| `scripts/extract.py` | 提取器入口（复制自 book-to-skill） | 阶段 1 跑 |
| `scripts/extractor/` | 提取器包（复制自 book-to-skill） | 阶段 1 用 |

---

## 阶段 1：全书拆解（复制 book-to-skill 流程，改产出物）

**前提：** 用户提供了书文件（PDF/Markdown/EPUB等）。

### Step 1.0 校验输入

支持格式同 book-to-skill：`.pdf`、`.epub`、`.docx`、`.txt`、`.md`、`.html`、`.rtf`、`.mobi`、`.azw`。

无输入则提示：`book-to-webpage 需要一本书的文件路径。`

### Step 1.1 提取全文

```bash
SCRIPT="$HOME/.claude/skills/book-to-webpage/scripts/extract.py"
python3 "$SCRIPT" <书文件路径> --mode text
```

产出 `<workdir>/book_skill_work/full_text.txt` + `metadata.json`。读 `metadata.json` 确认页数、字数、token、章节数。

如果提取失败，跑 `python3 "$SCRIPT" --check` 诊断依赖，给安装建议。

### Step 1.2 成本预估并确认

报页数/字数/预估 token 与价格，**等用户确认**再继续。

### Step 1.3 分析结构（复制 book-to-skill Step 3）

读 full_text 前 8000 字 + metadata 章节检测，识别：
- 书名、作者
- 章节结构（中文"第X章"或英文"Chapter N"、ToC）
- 核心领域

### Step 1.4 REPL 式切片拆解

**全书 >50k token 时禁止整体读入。** 用 grep 定位章节边界，sed 只切当前要写的那章：

```bash
grep -n -E "^\s*(第[一二三四五六七八九十百零0-9]+[章节回]|Chapter [0-9]+)" full_text.txt | head -60
sed -n '<start>,<end>p' full_text.txt
```

### Step 1.5 生成章节摘要（复制 book-to-skill Step 7 模板）

每章生成 `<书名>.kb/chapters/ch<NN>-<slug>.md`，字段：
- **Core Idea**（1-2 句）
- **Frameworks Introduced**（命名框架 + 何时用 + 怎么用，**保留作者精确命名**）
- **Key Concepts**（5-10 个术语，各一句定义）
- **Mental Models**（"用 X 当 Y"）
- **Anti-patterns**（要避免什么 + 为什么失败）
- **Worked Example**（重现作者亲算的一个例子）
- **Key Takeaways**（3-7 条）
- **Connects To**（关联其他章/外部概念）

自适应深度（默认中文社科书 = text + study = 1000-1800 token/章）：

| | reference | study |
|---|---|---|
| text | 800-1200 | 1000-1800 |
| technical | 1200-1800 | 2000-3000 |

### Step 1.6 生成支撑文件（复制 book-to-skill Step 8 规范）

- `glossary.md`：全部术语序排，`**术语** — 定义（第N章）`，≤1500 token
- `patterns.md`：全部技术/模式，`## 模式名 / 何时用 / 怎么做 / 权衡`，≤2000 token
- `cheatsheet.md`：**决策层**——决策规则（当X做Y因为Z）、决策树、权衡矩阵、阈值，≤1200 token

### Step 1.7 生成 INDEX.md（取代 book-to-skill 的 SKILL.md，不注册为 skill）

**关键改动**：book-to-skill 这里生成 SKILL.md；我们生成 `INDEX.md`（知识库导航）。含：
- 书名/作者/页数/章数/生成日期
- **Core Frameworks**（~2000 token：最重要命名框架）
- **Chapter Index**（表：章号→标题→关键框架）
- **Topic Index**（序排：术语/框架 → 出现在哪几章）★阶段 2 关键
- 支撑文件链接

### Step 1.8 质量规则

提取结构非摘要；保留作者精确命名；密度优先于完整度；从业者口吻（"用 X 当 Y"）；前置重要内容；章节按需加载；绝不照抄原文。

### 产物结构

```
<书名>.kb/
  INDEX.md          ← 知识库导航（常驻核心 ~4K）
  chapters/ch<NN>-*.md  ← 章节摘要
  glossary.md  patterns.md  cheatsheet.md
  full_text.md     ← 原文（供阶段 2 grep）
  metadata.json
```

**这是本地知识库，不写到 ~/.claude/skills/，不生成 SKILL.md。**

---

## 阶段 2：请求 → 网页

### 前提

阶段 1 已生成 `<书名>.kb/`。如果不存在，先跑阶段 1。

### 运行模式：常驻核心 + 按需深挖

INDEX.md 是常驻小核心（~4K），含 Core Frameworks + 章节索引 + 主题索引。章节文件按需加载，不全读。这与 book-to-skill 的查询机制一致；区别仅在我们把"文字回答"换成"交互 HTML"。

### Step 2.1 判定请求模式（三选一）

| 模式 | 触发条件 | 取材来源 | 产出 |
|------|---------|---------|------|
| ① 全书概述 | 用户说"概述全书/讲讲这本书"，无主题 | 读 INDEX.md Core Frameworks + cheatsheet | 概述页（骨架视图） |
| ② 主题聚合（默认） | 用户指定主题 / 说"做一页xxx" | 查主题索引 → 两级检索（§2.2） | 主题深度页 |
| ③ 单章深读（可选） | 用户指定章号 | 读该章摘要 + 该章原文 | 单章页 |

用户指定主题时，**先 grep full_text.md 验证书中确有相关内容**；命中 0 → 明确告知"本书未涉及该主题，建议尝试以下相关主题：…"，绝不瞎编。

### Step 2.1b 主题处理（无需用户选择）

HTML 页面**内置全部 6 套主题**（`warm-paper`/`minimal`/`dark`/`ink-wash`/`vintage-editorial`/`paper-ink`），通过右上角下拉菜单实时切换，默认使用 `warm-paper`。用户可在浏览器里自己切换，无需 Agent 生成前询问。

**如果用户明确点名某主题**（如"用极简风格"）→ 把 HTML 中 `<body data-theme="...">` 的初始值设为对应主题，`<select>` 的 `selected` 同步调整。否则默认暖纸典藏。

6 套主题的完整 CSS（`:root` 基准 + 5 个 `[data-theme="X"]` 覆盖块）直接写入 HTML 的 `<style>` 中，不依赖外部文件。主题目录见 `templates/themes/README.md`。

### Step 2.2 主题聚合的两级检索（关键差异化）

```
第一级（结构化）：读 chapters/ 里主题索引指向的章节摘要
                  → 框架/概念/反模式等结构化要点
第二级（原汁原味）：grep full_text.md 原文散落表述
                  → 具体论述/作者原话/数据
合并去重重组 → 完整主题视图
```

**两级都要**：第一级保结构，第二级保全面。这是相对 book-to-skill（只读摘要）的强化，确保主题页囊括书中所有对该主题的论述。

### Step 2.3 重组（散碎 → 流畅叙事）

1. **去重**：同一观点在多章重复的，合并成一处
2. **归类**：按因果/对比/演进逻辑排，不按章节顺序
3. **改写**：用自己的话重述，但**保留作者精确命名**（框架名/术语不改）
4. **补衔接**：观点间加过渡句，形成可读叙事，不是观点清单

### Step 2.4 结构化为 JSON 内容契约

按模式产出 JSON。`meta.mode` 字段标识模式，决定后续组件挑选。

**theme 模式 JSON：**

```json
{
  "meta": {"book": "...", "author": "...", "mode": "theme", "theme": "...", "sources": ["ch03","ch05"]},
  "hero": {"eyebrow": "...", "title": "...", "lede": "...", "thesis": "..."},
  "sections": [
    {
      "id": "past", "label": "过去20年",
      "lead": "...",
      "notes": [{"title": "需求被释放", "body": "..."}],
      "signature": "causal_chain",
      "chain": [{"id": "tax", "label": "分税制", "body": "..."}]
    }
  ],
  "questions": [{"title": "...", "hint": "..."}]
}
```

- `sections[].signature`：决定该分区用哪个特色组件（`causal_chain` / `type_selector` / `matrix` / `timeline` / `decision_tree` / `questions`）
- `sections[].lead`：段首引语（衔接层，Agent 现写）

**overview 模式 JSON：**

```json
{
  "meta": {"book": "...", "author": "...", "mode": "overview"},
  "hero": {"eyebrow": "...", "title": "...", "thesis": "..."},
  "frameworks": [{"name": "土地财政", "oneLine": "...", "when": "..."}],
  "chapterMap": [{"ch": "ch01", "title": "...", "role": "..."}],
  "conceptMap": [{"term": "土地财政", "links": ["ch03","ch05"]}],
  "decisionRules": [{"when": "...", "do": "...", "because": "..."}]
}
```

每个顶层数组对应一个概述专用组件。

### Step 2.5 挑组件（按内容性质决策，非简单映射）

**先判断内容性质，再选最合适的组件。** 一套主题内容往往适配多种组件，Agent 需要根据内容的逻辑结构来挑选 1-2 个。

#### 内容性质 → 组件 决策矩阵

| 内容性质 | 判断依据 | 首选组件 | 备选 |
|---------|---------|---------|------|
| 因果推进 | 有明显的"A→B→C→D"链条 | `causal_chain` | accordion |
| 历史演进 | 按时间顺序展开的事件 | `timeline` | story_card |
| 多类别并列 | 几类事物各有特点，适合分类比较 | `type_selector` | matrix |
| 多维权衡 | 需要对比选项在多个维度上的优劣 | `matrix` | before_after |
| 决策分叉 | "如果X则Y，如果A则B"的条件逻辑 | `decision_tree` | accordion |
| 案例叙事 | 有具体人物/事件/情境的生动故事 | `story_card` | quote_card |
| 政策/制度变迁 | 同一个事物在某个节点前后的状态对比 | `before_after` | timeline |
| 核心论述（分层） | "先给结论再给论证"，需控制信息密度 | `accordion` | decision_tree |
| 重要原话 | 需要保留作者精确表述、有冲击力的原文 | `quote_card` | story_card |
| 读者自检 | 从知识到行动的转化 | `questions` | decision_tree |

**挑选逻辑：**
1. 优先看内容的**主要逻辑结构**（因果/时间/分类/对比/条件），选最匹配的组件
2. 如果内容中有**特别生动的案例故事**，优先用 `story_card` 呈现
3. 如果想引用**作者原话**增加说服力，搭配 `quote_card`
4. 多数主题配 **2 个特色组件**（一主一辅，互补呈现）

**theme 模式固定：**
- 核心固定（每页必有）：Hero + 一句话总论 + 分区导航（sticky Tab）

**overview 模式固定：**
- 核心固定 + 概述专用：`frameworks` 卡片网格 + `chapterMap` + `conceptMap` + `decisionRules`

从 `templates/components.md` 取对应范式，填入 JSON 数据。

### Step 2.5b 嵌入追问入口（方案2 — 每个内容块内置深挖按钮）

每个带 `data-source` 的内容块（note / story / timeline-item / ba-col / accordion details / quote / explain / question）必须在内部末尾加上追问按钮：

```html
<button class="deep-dive-btn" title="追问这个概念"
  onclick="openDeepDive('{{概念名}}','{{data-source值}}')">?</button>
```

- `{{概念名}}` = 该块的标题/核心概念（如 `隐性担保`、`土地财政`）
- `{{data-source值}}` = 与所在元素的 `data-source` 属性相同

按钮默认 `opacity:0`，hover 父元素时浮现。点击后弹出全局遮罩层，用户输入追问内容，提交后自动将上下文 prompt 复制到剪贴板。

**base.html 已内置完整 JS**（`openDeepDive()` 函数 + overlay + toast），Agent 只需在组件内加这行 HTML。

### Step 2.5c 标注出处来源

**每个内容块必须标注原文出处。** 这既是学术诚信，也帮助读者溯源深入阅读。

#### 出处信息格式

```
第X章 第Y节 · 约第N-M页
```

例如：`第二章 第二节 · 约第95-110页`

#### 标注方法（A + B 混合方案）

**A — Margin 标记（默认可见，低调）：**
每个有出处的 HTML 元素加上 `data-source` 属性：
```html
<article class="note" data-source="第二章 第二节 · 约第95-110页">
```
样式自动处理：左侧 3px 细色条（hover 变蓝）、hover 时弹出 tooltip 显示来源。

**B — 全局"显示出处"开关：**
页面右上角固定按钮 "显示出处"，点击后所有内容块下方浮现灰色小字出处行。base.html 已内置此按钮和 JS 逻辑（`srcToggle` → `body.show-sources`），Agent 无需额外处理。

#### 标注规则

1. **每块内容必标**：note、story、timeline-item、question、accordion details、quote、explain、ba-col 等都要带 `data-source`
2. **页数估算方法**：从 `metadata.json` 取总页数，按章节在全文中的位置比例估算页码范围。例如 306 页的书，第 2 章从全文 13% 位置开始、26% 位置结束 → 约第 40-80 页
3. **精度要求**：标注到"节约N-M页"即可，不要求精确到具体页数
4. **同一来源合并**：同一 Panel 内多个内容块来源相同时，每块仍标注（方便读者逐条溯源）

### Step 2.6 三层渲染产出 HTML

**三层叠加（关键！组件不够，还要衔接层）：**

| 层 | 来源 | 谁做 | 占页面比例 |
|----|------|------|-----------|
| ① 骨架 | `templates/base.html` | **照抄**，替换 `{{lang}}`/`{{title}}` 等 | ~20% |
| ② 组件 | `templates/components.md` 对应范式 | **照抄 + 填数据** | ~35% |
| ③ 衔接 | Agent 现写，受下方规则约束 | **生成**：段首引语、过渡句、卡片标题重写 | ~45% |

**衔接层写作规则（必须遵守，决定页面质量）：**

1. **段首必有引语**：每个分区/Panel 开头一句提纲挈领的话，不直接堆组件
2. **卡片标题口语化重写**：不照搬原文小标题，改成读者一眼懂的短句（如"土地变成财源"而非"地方政府土地出让收入机制"）
3. **正文综合而非拼接**：grep 来的散碎原文必须去重合并改写成连贯段落，禁止直接堆多段原文
4. **组件间过渡**：组件前后用一两句话承接，不让交互组件孤立出现
5. **配色强调克制**：红字只用在 eyebrow 和总论标记，不滥用

**拼装流程：**

1. 读 `templates/base.html` 骨架
2. **内联全部 6 套主题**：把 `:root` 默认变量（暖纸典藏）+ 5 个 `[data-theme="X"]` 覆盖块整段写入 `<style>`，并设 `<body data-theme="warm-paper">`（用户点名某主题则改初始值）；同时加入主题下拉菜单 HTML + JS（`<select class="theme-picker">` + localStorage 记忆）
3. 设置 `{{lang}}`（中文书="zh-CN"）
4. 设置 `{{title}}` = `《书名》- 主题`
5. 把 Hero HTML 片段填入 `{{hero}}`
6. 把 Tab 按钮填入 `{{tabs}}`（`{{component_styles}}` 里设置 tabs 列数）
7. 把各 Panel HTML 填入 `{{panels}}`
8. 把 `{{component_styles}}` 设为组件专用 CSS
9. 把 `{{component_scripts}}` 设为所有交互 JS
10. 把 `{{footer_note}}` 设为脚注
11. 输出 `<书名>-<主题>.html`
12. **同步保存文本版**：把 Step 2.3 重组后的完整叙事正文（连贯文本 + 作者原话 + 案例），另存为 `<书名>-<主题>.md`，与 HTML 同目录。内容含：Hero 标题/总论 + 各 Section 正文（去组件标记、纯可读叙事）+ 追问问题列表 + 出处来源标注。这是渲染前的那道完整叙事——不依赖 HTML 组件即可独立阅读，也方便后续引用/复用。

**JS 安全规则（CRITICAL — 违反会导致页面按钮全部失效）：**

1. **用 `function()` 而非 `=>`**：箭头函数在脚本标签内可能导致解析差异。始终用 `document.querySelectorAll(".tab").forEach(function(t){ ... });`
2. **JS 字符串内禁用中文引号 `""`**：`"硬资产"` 这种中文引号在 JS 字符串中可能被误读为字符串边界，导致 JS 执行中断。改为直接写 `硬资产`（去掉引号）或改用其他符号。
3. **DOM 操作前加 null 守卫**：`var el = document.getElementById("x"); if (el) { el.onclick = ...; }`
4. **用 `var` 声明变量**：不用 `const/let`，最大化浏览器兼容性。

### Step 2.7 自检

#### 自动化验证（Playwright）

生成 HTML 后，**必须**运行验证脚本：

```bash
node <book-to-webpage-skill-directory>/scripts/verify-page.js <输出文件路径>
```

验证器依赖 Skill 根目录的固定版本 `playwright`（Node.js >=20）。首次使用，在实际安装的 Skill 目录运行：

```bash
cd <book-to-webpage-skill-directory>
npm ci
npx playwright install chromium
node scripts/verify-page.js <输出文件路径>
```

默认使用该 Playwright 版本配套的完整 Chromium（`channel: chromium`，new headless）；如果配套 executable 尚未安装，尝试已安装的 Google Chrome（`channel: chrome`）。没有可用浏览器时以非零状态退出并提示安装方式。可以用 `PLAYWRIGHT_CHANNEL=chrome` 选择 Chrome，或用 `PLAYWRIGHT_EXECUTABLE_PATH=/path/to/browser` 指定 executable；两者互斥，显式选择失败时不会静默改用其他浏览器。自定义 executable 的版本兼容性由调用者负责。依赖从脚本所在目录正常解析，不依赖 Homebrew/NVM 的 global package 路径。

开发验证：`npm test` 检查浏览器选择与失败路径；`npm run test:integration` 用真实浏览器检查最小 HTML fixture、点击、pageerror、responsive 与出处检查。只安装 Chrome 时可直接运行后者而不下载 Chromium。

该脚本自动检查：占位符残留、Tab 切换、Causal Chain、Type Selector、Accordion、Timeline、Before/After、Story Card、Quote Card、Questions、Source Toggle、移动端响应式、data-source 属性。

#### 人工逐项验证
- [ ] 所有 Tab 可切换、所有按钮可点且有响应
- [ ] 无残留占位符（无 `{{...}}`、TODO、xxx、空数据块）
- [ ] JSON 里每个声明的组件都真实渲染在 HTML 中
- [ ] 移动端（≤880px / ≤520px）不溢出
- [ ] 衔接层齐全（每分区有段首引语、卡片标题口语化、组件间有过渡）
- [ ] **每个内容块有 `data-source` 属性**，出处格式正确（"第X章 第Y节 · 约第N-M页"）
- [ ] 页数估算合理（根据 metadata.json 总页数按章节位置比例推算）
- [ ] 页面右上角"显示出处"开关可切换、tooltip hover 可显示

### Step 2.8 清理工作目录

```bash
rm -rf "<workdir>/book_skill_work"
```

---

## 风格系统（主题换肤）

页面布局/交互**完全不变**，只通过 CSS 变量换皮。`templates/base.html` 把字体/底色/纸面 tint/强调色全部抽成变量（`--font-body/--font-display/--bg/--surface/--ink/--red/--blue/--green/--gold/…`），组件 CSS 只引用变量、不写死颜色。

- **6 套主题**全部内联于每个生成的 HTML 页面中（`templates/themes/*.css`）：`warm-paper`（暖纸典藏·默认）/ `minimal`（极简学术）/ `dark`（夜读深空）/ `ink-wash`（东方水墨）/ `vintage-editorial`（复古编辑）/ `paper-ink`（纸墨风）。详见 `templates/themes/README.md`。
- **默认 = 暖纸典藏**：宋体正文 + PingFang 标题、暖纸色纸面 `#f8f2e7`、红蓝绿金强调、径向金光晕背景。
- **实时切换**：页面右上角内置主题下拉菜单，用户可在浏览器中一键切换 6 套皮肤，选择自动记忆（localStorage）。Agent 生成前无需询问用户偏好——除非用户明确指名某主题。
- **换肤机制**：`:root` 保存默认变量（暖纸典藏），5 个 `[data-theme="X"]` 选择器覆盖对应主题的全部变量+组件微调。`<body data-theme="...">` 控制当前生效主题。
- **单文件、零依赖**：CSS/JS 全部内联
- **移动端自适应**：≤880px 单列、取消 sticky；≤520px 字号缩减、chain 单列
- **无外部字体/图标/CDN**：仅用系统字体

---

## 错误处理

| 场景 | 处理 |
|------|------|
| PDF 多级回退全失败 | 报错 + 跑 `python3 scripts/extract.py --check` + 安装建议 |
| 提取出空文本 | 提示"可能是扫描版，建议用 Nutrient OCR" |
| 用户主题书里没有 | 明确告知"本书未涉及该主题" + 列相关候选（grep 相邻关键词） |
| 主题内容过少（<3处提及） | 提示"仅 N 处提及，内容较少，建议换主题或合并相关主题"，不硬凑 |

---

## 不在本次范围

- 语义搜索（当前只用关键词 grep）
- 多主题站点（当前只做单主题单页）
- 主题内可调子参数（字号/圆角等微调，当前每主题一套固定美学）
