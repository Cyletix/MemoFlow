---
DefaultToDiary: false
DefaultAsTask: false
PathToTimestamp: data/timestamp/2025
PathToDiary: Mindscape/Diary
PosToDiaryList: 想法
PosToDiaryTask: 计划
DiaryFormat: "YYYY-MM-DD"        # 日记命名格式（若失败则兜底 "YYYY-MM-DD"）
FlowFormat: "YYYY-MM-DD HHmmss"  # 闪念命名格式（若失败则兜底 "YYYY-MM-DD HHmmss"）
LimitNum: 128
---
```dataviewjs
// 1. 获取当前文件
const activeFile = app.workspace.getActiveFile();

// 读取 YAML 属性
async function getYamlProperty(property) {
    const metadata = await app.metadataCache.getFileCache(activeFile);
    return metadata && metadata.frontmatter ? metadata.frontmatter[property] : null;
}

// 使用异步初始化变量,  默认值均可自定义
let writeToDiary    = await getYamlProperty("DefaultToDiary")   || false;
let isTaskList      = await getYamlProperty("DefaultAsTask")    || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp")  || "data/timestamp";
let PathToDiary     = await getYamlProperty("PathToDiary")      || "Mindscape/Diary";
let PosToDiaryList  = await getYamlProperty("PosToDiaryList")   || "想法";
let PosToDiaryTask  = await getYamlProperty("PosToDiaryTask")   || "计划";
let DateFormat      = await getYamlProperty("DateFormat")       || "YYYY-MM-DD";

// 2. 创建输入框用于获取用户的输入内容，并添加自定义样式
const inputContainer = this.container.createDiv();
inputContainer.style.marginBottom = "10px";
inputContainer.style.width = "100%";

// 创建一个容器用于放置输入框和按钮，以便更好地控制布局
const formContainer = inputContainer.createDiv();
formContainer.style.display = "flex";
formContainer.style.flexDirection = "column";

// 创建文本输入框
const inputBox = formContainer.createEl("textarea", { type: "text", rows: 3 });
inputBox.style.width = "100%";
inputBox.style.padding = "8px";
inputBox.style.border = "1px solid #8A5CF5";
inputBox.style.resize = "vertical"; // 允许用户手动调整高度
inputBox.placeholder = "写点什么好呢...";
inputBox.style.backgroundColor = "transparent";
//inputBox.style.color = "black";  // 字体颜色


// 设置最小高度（至少一行的高度）
const lineHeight = 20; // 假设一行的高度为 20px（根据实际字体大小调整）
const padding = 16; // 上下 padding 各 8px
const minHeight = lineHeight + padding; // 最小高度 = 一行高度 + padding
inputBox.style.minHeight = `${minHeight}px`;

// 添加输入事件监听器，动态调整高度
inputBox.addEventListener("input", () => {
    inputBox.style.height = "auto"; // 重置高度
    inputBox.style.height = `${inputBox.scrollHeight}px`; // 根据内容设置高度
});

// 3. 创建时间戳生成函数
function generateTimestamp() {
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const datePart = dateFormatter.format(now);
    const timePart = timeFormatter.format(now).replace(/:/g, ""); // 去掉冒号
    return `${datePart} ${timePart}`;
}

// 4. 主函数：从文本框获取内容并写入新文件或日记
async function handleButtonClick() {
    const propertyValue = inputBox.value.trim();
    const rawTags = tagInput.value.trim();         // 标签输入框

    if (propertyValue) {
        const now = new Date();
        const timeString = now.toTimeString().slice(0, 5); // HH:mm格式时间
        const timestamp = generateTimestamp(); // 生成时间戳

        // 把标签按逗号或分号拆分，去空白
        let tagList = [];
        if (rawTags) {
            tagList = rawTags.split(/[,;]/).map(t => t.trim()).filter(Boolean);
        }

        if (!writeToDiary) {
            // 写入时间戳文件
            // 输入tag
            let yamlTagLines = "";
            if (tagList.length > 0) {
                yamlTagLines = tagList.map(t => `  - ${t}`).join("\n");
            }
            //构造YAML frontmatter
            const yamlHeader = `---\ntags:\n${yamlTagLines}${isTaskList ? "  - todo" : ""}\ndatetime: ${timestamp}\n---`;
            const newFileName = `${PathToTimestamp}/${timestamp}.md`;
            
            const content = isTaskList
                ? `- [ ] ${propertyValue}` // 任务列表需要添加任务符号
                : `${propertyValue}`;     // 普通内容直接写入

            // 时间戳笔记直接写入内容
            const file = await app.vault.create(newFileName, `${yamlHeader}\n${content}`);
            new Notice(`时间戳笔记添加成功: ${file.path}`);
        } else {
            // 写入当天日记

            // 获取当前时间
            const now = new Date();
            const localTime = new Date(now.getTime());

            // 使用用户指定的 PathToDiary 作为存储日记的目录，日记名按照 DateFormat 格式化
            const diaryDate = moment(localTime).format(DateFormat);
            const journalFileName = `${PathToDiary}/${diaryDate}.md`;

            let file = app.vault.getAbstractFileByPath(journalFileName);

            if (!file) {
                file = await app.vault.create(journalFileName, `# 日记\n\n## ${PosToDiaryList}\n\n## ${PosToDiaryTask}\n\n`);
            }

            // 插入内容
            const sectionTitle = isTaskList ? `## ${PosToDiaryTask}` : `## ${PosToDiaryList}`;
            let existingContent = await app.vault.read(file);
            const sectionIndex = existingContent.indexOf(sectionTitle);

            if (sectionIndex !== -1) {
                const afterSection = existingContent.slice(sectionIndex + sectionTitle.length);
                const insertIndex = afterSection.search(/\n(#+\s|$)/);

                // 日记需要添加无序列表标记和时间
                const content = isTaskList
                    ? `- [ ] ${timeString} ${propertyValue}`
                    : `- ${timeString} ${propertyValue}`;
                const contentToInsert = `${content}\n`;
                const updatedContent = 
                    existingContent.slice(0, sectionIndex + sectionTitle.length) +
                    (afterSection.startsWith("\n") ? "" : "\n") + // 确保换行
                    afterSection.slice(0, insertIndex) +
                    contentToInsert +
                    afterSection.slice(insertIndex);

                await app.vault.modify(file, updatedContent);
            } else {
                const content = isTaskList
                    ? `- [ ] ${timeString} ${propertyValue}`
                    : `- ${timeString} ${propertyValue}`;
                await app.vault.modify(file, `${existingContent}\n${sectionTitle}\n\n${content}\n`);
            }
            new Notice(`内容已成功添加到日记: ${journalFileName}`);
        }

        inputBox.value = ""; // 清空文本框
    } else {
        new Notice(`请在文本框中输入内容！`);
    }
}

// 5. 添加自定义 CSS 样式
const style = document.createElement("style");
style.innerHTML = `
    .dv-container {
    min-width: 400px; /* 这里可以调整最小宽度 */
    }
    .custom-button {
        color: #000000 !important;
        background-color: #8A5CF5 !important;
        border: 1px solid #000000!important;
        padding: 5px 10px !important;
        cursor: pointer !important;
	    border-radius: 10px; /* 调整按钮圆角 */
        flex-wrap: wrap; /* 允许换行 */
        min-width: 60px; /* 最小宽度 */
    }
    .button-container {
        display: flex;
        align-items: center;
	    background-color = "transparent";
        justify-content: space-between;
        width: 100%;
        margin-top: 5px;
        gap: 5px; /* 按钮间距 */
        justify-content: space-between; /* 平均分配空间 */
    }

    .left-buttons, .right-button {
        display: flex;
        align-items: center;
    }
    .left-buttons {
        flex-wrap: wrap;
    }
    .left-buttons > .toggle-write-button {
        margin-right: 5px;
    }
    .left-buttons > .toggle-list-button {
        margin-right: 5px;
    }
    .right-button {
        margin-left: auto;
        flex-shrink: 0; /* 防止按钮缩小 */
        width: 100px; /* 固定宽度 */
        align-items: right;
    }
`;
document.head.appendChild(style);

// 6. 创建容器和按钮，并应用自定义样式
const buttonRow = formContainer.createDiv();
buttonRow.style.display = "flex";
buttonRow.style.flexDirection = "row";
buttonRow.style.alignItems = "center";
buttonRow.style.gap = "6px";
buttonRow.style.marginTop = "5px";

// 左侧按钮容器（避免使用已声明的 leftButtons，改用不同名称）
const btnContainer = buttonRow.createDiv();
btnContainer.style.display = "flex";
btnContainer.style.gap = "6px";

// 切换写入模式按钮
const toggleWriteButtonNew = btnContainer.createEl("button", { text: writeToDiary ? "📓写入日记" : "🕛时间戳笔记", cls: "toggle-write-button custom-button" });
toggleWriteButtonNew.style.width = "100px";
toggleWriteButtonNew.onclick = () => {
    writeToDiary = !writeToDiary;
    toggleWriteButtonNew.textContent = writeToDiary ? "📓写入日记" : "🕛时间戳笔记";
};

// 切换列表类型按钮
const toggleListButtonNew = btnContainer.createEl("button", { text: isTaskList ? "☑️任务列表" : "🔘无序列表", cls: "toggle-list-button custom-button" });
toggleListButtonNew.style.width = "100px";
toggleListButtonNew.onclick = () => {
    isTaskList = !isTaskList;
    toggleListButtonNew.textContent = isTaskList ? "☑️任务列表" : "🔘无序列表";
};

// 中间标签输入框（自动占满剩余空间）
const tagInput = buttonRow.createEl("input", { type: "text" });
tagInput.style.flexGrow = "1";
tagInput.style.padding = "6px";
tagInput.style.border = "1px solid #8A5CF5";
tagInput.style.backgroundColor = "transparent";
tagInput.placeholder = "tag1,tag2;tag3...";

// 右侧发送按钮
const sendButtonNew = buttonRow.createEl("button", { text: "发送", cls: "custom-button" });
sendButtonNew.style.width = "60px";
sendButtonNew.onclick = handleButtonClick;

// 7. 添加快捷键 Ctrl+Enter
inputBox.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        handleButtonClick();
    }
});
```
```dataviewjs
// TasksView（笔记筛选模块）
const activeFile = app.workspace.getActiveFile();
async function getYamlProperty(prop) {
    const metadata = await app.metadataCache.getFileCache(activeFile);
    return (metadata && metadata.frontmatter && metadata.frontmatter[prop]) || null;
}

// 从 frontmatter 读取各种配置, 支持自定义默认值
let writeToDiary    = await getYamlProperty("DefaultToDiary")   || false;
let isTaskList      = await getYamlProperty("DefaultAsTask")    || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp")  || "data/timestamp";
let PathToDiary     = await getYamlProperty("PathToDiary")      || "Mindscape/Diary";
let PosToDiaryList  = await getYamlProperty("PosToDiaryList")   || "想法";
let PosToDiaryTask  = await getYamlProperty("PosToDiaryTask")   || "计划";
let LimitNum        = parseInt(await getYamlProperty("LimitNum")) || 64;

// 新增的两个自定义属性，用来解析文件名
let DiaryFormat     = await getYamlProperty("DiaryFormat")      || "YYYY-MM-DD";
let FlowFormat      = await getYamlProperty("FlowFormat")       || "YYYY-MM-DD HHmmss";

// 归一化路径（去除尾部斜杠）
function normalizePath(path) {
    return path.replace(/\/+$/, "");
}
PathToDiary = normalizePath(PathToDiary);
PathToTimestamp = normalizePath(PathToTimestamp);

// ------ 动态更新 YAML 函数（不变） ------
async function updateYamlProperty(property, value) {
    const metadata = app.metadataCache.getFileCache(activeFile);
    if (!metadata || !metadata.frontmatter) return;
    const fileContent = await app.vault.read(activeFile);
    const frontmatterEnd = fileContent.indexOf('---', 3);
    if (frontmatterEnd === -1) return;
    const frontmatterContent = fileContent.slice(0, frontmatterEnd + 3);
    const bodyContent = fileContent.slice(frontmatterEnd + 3);
    const updatedFrontmatter = frontmatterContent.replace(
        new RegExp(`(^${property}:\\s*)(.+)$`, 'm'),
        (_, p1) => `${p1}${value}`
    );
    const updatedContent = updatedFrontmatter + bodyContent;
    await app.vault.modify(activeFile, updatedContent);
}

// ========== 1. 两个解析函数（只改动这里） ==========

// 解析“日记”文件名 -> Date
function parseDiaryFilenameToDate(filename, userFormat) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    // 先用用户在 frontmatter 里指定的格式去解析（严格模式）
    let m = moment(nameWithoutExt, userFormat, true);
    // 如果失败，再尝试一次最常见的 "YYYY-MM-DD" 作为兜底
    if (!m.isValid()) {
        m = moment(nameWithoutExt, "YYYY-MM-DD", true);
    }
    return m.isValid() ? m.toDate() : null;
}

// 解析“闪念/时间戳”文件名 -> Date
function parseFlowFilenameToDate(filename, userFormat) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    // 优先用 frontmatter 里指定的 FlowFormat
    let m = moment(nameWithoutExt, userFormat, true);
    // 若解析失败，则再尝试 "YYYY-MM-DD HHmmss" 兜底
    if (!m.isValid()) {
        m = moment(nameWithoutExt, "YYYY-MM-DD HHmmss", true);
    }
    return m.isValid() ? m.toDate() : null;
}

// ========== 2. 其余辅助函数（保持和原版一致） ==========

function generateCalloutCard(title, content) {
    return `> [!quote]+ [[${title}]]\n${content}`;
}
function generateTodoCard(filePath, calloutTitle) {
    const fileName = dv.page(filePath).file.name;
    return `> [!todo]${calloutTitle}[[${fileName}]]\n> \`\`\`dataview\n> task\n> from "${filePath}"\n> \`\`\``;
}

function removeYaml(content) {
    const yamlRegex = /^---[\s\S]*?---\n/;
    return content.replace(yamlRegex, '');
}
function findIdeaSection(content) {
    const lines = content.split('\n');
    const idx = lines.findIndex(line => line.trim().startsWith(`## ${PosToDiaryList}`));
    if (idx === -1) return null;
    const nextSectionIndex = lines.slice(idx+1).findIndex(line => line.trim().startsWith('## '));
    return nextSectionIndex !== -1
        ? lines.slice(idx+1, idx+1+nextSectionIndex)
        : lines.slice(idx+1);
}
function parseIdeaList(lines) {
    const ideaItems = [];
    const listRegex = /^\s*-\s*(?:(\d{1,2}:\d{2}(?::\d{2})?)\s+)?(.+?)$/;
    for (const line of lines) {
        const match = line.match(listRegex);
        if (match && match[2] && match[2].trim() !== '') {
            ideaItems.push({
                time: match[1] || '',
                content: match[2].trim()
            });
        }
    }
    return ideaItems;
}

// ========== 3. 筛选状态 ==========

let showTasks      = true;
let showNotes      = true;
let showDiary      = true;
let showTimestamp  = true;

// ========== 4. 处理“时间戳”笔记 ==========

async function processTimestampNotes(pathToTimestamp, entries) {
    // 读取 pathToTimestamp 下所有文件，用 parseFlowFilenameToDate() 获得日期
    const pages = dv.pages(`"${pathToTimestamp}"`)
        .filter(p => p && p.file && p.file.name)
        .map(p => {
            const d = parseFlowFilenameToDate(p.file.name, FlowFormat);
            return { ...p, date: d };
        })
        // 过滤掉无法解析出日期的文件
        .filter(p => p.date)
        // 逆序排列(最新在前)
        .sort((a, b) => b.date - a.date);
    
    for (const page of pages) {
        const date = page.date;
        const tasks = page.file.tasks.array();
        // 尝试读取 tag
        let tags = [];
        if (page.tags) {
            tags = page.tags;
        } else if (page.file.frontmatter && page.file.frontmatter.tag) {
            tags = page.file.frontmatter.tag;
            if (typeof tags === 'string') tags = [tags];
        }
        // 有任务 => 生成 TODO 卡片
        if (tasks.length > 0) {
            const allCompleted = tasks.every(t => t.completed);
            const calloutTitle = allCompleted ? '- ' : '+ ';
            entries.push({
                date,
                content: generateTodoCard(page.file.path, calloutTitle),
                tags,
                type: 'task',
                source: 'timestamp'
            });
        } else {
            // 没有任务 => 普通笔记 Callout
            entries.push({
                date,
                content: generateCalloutCard(page.file.name, `![[${page.file.path}#]]`),
                tags,
                type: 'note',
                source: 'timestamp'
            });
        }
    }
}

// ========== 5. 处理“日记”笔记 ==========

async function processDiaryNotes(pathToDiary, entries) {
    // 读取 pathToDiary 下所有文件，用 parseDiaryFilenameToDate() 获得日期
    const pages = dv.pages(`"${pathToDiary}"`);
    const pageEntries = await Promise.all(pages.map(async (page) => {
        const date = parseDiaryFilenameToDate(page.file.name, DiaryFormat);
        // 若解析不到日期，跳过
        if (!date) return [];

        const filePath = page.file.path;
        const content = await dv.io.load(filePath);
        const cleaned = removeYaml(content);
        const ideaSection = findIdeaSection(cleaned);
        
        let localEntries = [];
        // 处理 tag
        let tags = [];
        if (page.tags) {
            tags = page.tags;
        } else if (page.file.frontmatter?.tag) {
            tags = page.file.frontmatter.tag;
            if (typeof tags === 'string') tags = [tags];
        }

        // 1) “想法”部分 => note
        if (ideaSection) {
            const ideaItems = parseIdeaList(ideaSection);
            ideaItems.forEach(item => {
                // 把日记日期 + (可能存在的 “HH:mm:ss”) 合并成一个完整时间
                let timeParts = item.time ? item.time.split(':').map(Number) : [0];
                while (timeParts.length < 3) { timeParts.push(0); }
                const [h, m, s] = timeParts;

                const dateTime = new Date(date);
                dateTime.setHours(h || 0, m || 0, s || 0, 0);

                localEntries.push({
                    date: dateTime,
                    content: item.time 
                        ? `> [!quote]+ [[${page.file.name}]] ${item.time}\n> ${item.content}`
                        : `> [!quote]+ [[${page.file.name}]]\n> ${item.content}`,
                    tags,
                    type: 'note',
                    source: 'diary'
                });
            });
        }

        // 2) “计划”部分 => task
        const planTasks = page.file.tasks
            .where(t => t.section && t.section.subpath === PosToDiaryTask)
            .array();
        if (planTasks.length > 0) {
            const allCompleted = planTasks.every(t => t.completed);
            const calloutTitle = allCompleted ? '- ' : '+ ';
            localEntries.push({
                date,
                content: generateTodoCard(filePath, calloutTitle),
                tags,
                type: 'task',
                source: 'diary'
            });
        }

        return localEntries;
    }));

    // 扁平化合并
    const all = pageEntries.flat();
    // 按时间逆序（新的在前）
    all.sort((a, b) => b.date - a.date);
    all.forEach(e => entries.push(e));
}

// ========== 6. 显示函数 (不变) ==========
function displayEntries(entries, limit) {
    entries.sort((a, b) => b.date - a.date);
    entries.slice(0, limit).forEach(e => {
        dv.paragraph(e.content);
    });
}

// ========== 7. 注入自适应CSS (不变) ==========
const style = document.createElement("style");
style.innerHTML = `
.dv-row-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  justify-content: space-between;
}
.dv-button {
  padding: 6px 12px;
  color: black !important;
  border: 1px solid #1A191E;
  background-color: #8A5CF5 !important;
  border-radius: 10px;
  cursor: pointer;
}
.dv-right-group {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dv-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.dv-checkbox-wrapper {
  display: flex;
  align-items: center;
}
.dv-checkbox-wrapper input {
  cursor: pointer;
}
.dv-checkbox-wrapper label {
  margin-left: 4px;
}
.dv-filter-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 6px;
  margin-top: 6px;
}
.dv-filter-hidden {
  display: none !important;
}
.dv-filter-inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.dv-filter-tag {
  flex-grow: 1;
}
.dv-filter-input {
  border: 1px solid #1A191E;
  background-color: transparent !important;
  border-radius: 4px;
  padding: 4px 6px;
  min-width: 40px;
}
`;
document.head.appendChild(style);

// ========== 8. 创建 UI (不变) ==========
const topRow = dv.container.createDiv({ cls: "dv-row-top" });

const toggleBtn = topRow.createEl("button", { cls: "dv-button", text: "高级筛选" });

const checkboxGroup = topRow.createDiv({ cls: "dv-checkbox-group" });
function createCheckbox(labelText, defaultVal, onChange) {
    const wrap = checkboxGroup.createDiv({ cls: "dv-checkbox-wrapper" });
    const cb = wrap.createEl("input", { type: "checkbox" });
    cb.checked = defaultVal;
    cb.addEventListener("change", () => onChange(cb.checked));
    const label = wrap.createEl("label");
    label.textContent = labelText;
}
createCheckbox("任务", showTasks, val => { showTasks = val; refreshEntries(); });
createCheckbox("列表", showNotes, val => { showNotes = val; refreshEntries(); });
createCheckbox("日记", showDiary, val => { showDiary = val; refreshEntries(); });
createCheckbox("闪念", showTimestamp, val => { showTimestamp = val; refreshEntries(); });

const rightGroup = topRow.createDiv({ cls: "dv-right-group" });
const limitNumInput = rightGroup.createEl("input", { type: "number", cls: "dv-filter-input", value: LimitNum.toString(), min: "1" });
limitNumInput.title = "显示条目数量";
limitNumInput.addEventListener("input", (e) => {
    LimitNum = parseInt(e.target.value) || 1;
});
limitNumInput.addEventListener("blur", async () => {
    LimitNum = parseInt(limitNumInput.value) || 1;
    await updateYamlProperty("LimitNum", LimitNum);
});
limitNumInput.addEventListener("wheel", (e) => { e.preventDefault(); }, { passive: false });
limitNumInput.style.width = "50px";

const refreshBtn = rightGroup.createEl("button", { cls: "dv-button", text: "刷新" });
refreshBtn.onclick = refreshEntries;
refreshBtn.style.width = "60px";

const filterFields = dv.container.createDiv({ cls: "dv-filter-fields dv-filter-hidden" });
const filterInputs = filterFields.createDiv({ cls: "dv-filter-inputs" });
const startDateInput = filterInputs.createEl("input", { type: "date", cls: "dv-filter-input" });
startDateInput.title = "开始日期";
const dashSpan = filterInputs.createEl("span", { text: "~" });
dashSpan.style.lineHeight = "1.8em";
const endDateInput = filterInputs.createEl("input", { type: "date", cls: "dv-filter-input" });
endDateInput.title = "结束日期";
const tagInput = filterInputs.createEl("input", { type: "text", cls: "dv-filter-input dv-filter-tag", placeholder: "tag1;tag2;..." });
tagInput.title = "筛选标签";

toggleBtn.onclick = () => {
    filterFields.classList.toggle("dv-filter-hidden");
};

// ========== 9. 主流程 ==========

async function refreshEntries() {
    const realVal = parseInt(await getYamlProperty("LimitNum")) || LimitNum;
    LimitNum = realVal;
    limitNumInput.value = realVal.toString();
    
    // 清空旧内容(保留前面2行UI)
    while (dv.container.children.length > 2) {
        dv.container.lastChild.remove();
    }
    
    const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
    const endDate = endDateInput.value ? new Date(endDateInput.value) : null;
    const tagFilter = tagInput.value.trim();
    const tagsNeeded = tagFilter ? tagFilter.split(/[,;]/).map(t => t.trim()).filter(Boolean) : null;
    
    const entries = [];
    // 并行处理闪念 & 日记
    await Promise.all([
         processTimestampNotes(PathToTimestamp, entries),
         processDiaryNotes(PathToDiary, entries)
    ]);
    
    // 最后做过滤与展示
    const filtered = entries.filter(e => {
        if (startDate && e.date < startDate) return false;
        if (endDate && e.date > endDate) return false;
        if (tagsNeeded) {
            const hasAll = e.tags && tagsNeeded.every(t => e.tags.includes(t));
            if (!hasAll) return false;
        }
        if (e.type === 'task' && !showTasks) return false;
        if (e.type === 'note' && !showNotes) return false;
        if (e.source === 'diary' && !showDiary) return false;
        if (e.source === 'timestamp' && !showTimestamp) return false;
        return true;
    });
    
    displayEntries(filtered, LimitNum);
}

// 首次加载
refreshEntries();
```