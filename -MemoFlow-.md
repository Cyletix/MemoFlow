---
DefaultToDiary: false
DefaultAsTask: false
PathToTimestamp: data/timestamp
PathToDiary: Mindscape/Diary
PosToDiaryList: 想法
PosToDiaryTask: 计划
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

// 使用异步初始化变量
let writeToDiary = await getYamlProperty("DefaultToDiary") || false;
let isTaskList = await getYamlProperty("DefaultAsTask") || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp") || "data/timestamp";
let PathToDiary = await getYamlProperty("PathToDiary") || "Mindscape/Diary";
let PosToDiaryList = await getYamlProperty("PosToDiaryList") || "想法";
let PosToDiaryTask = await getYamlProperty("PosToDiaryTask") || "计划";

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

    if (propertyValue) {
        const now = new Date();
        const timeString = now.toTimeString().slice(0, 5); // HH:mm格式时间
        const timestamp = generateTimestamp(); // 生成时间戳

        if (!writeToDiary) {
            // 写入时间戳文件
            const yamlHeader = `---\ntag: ${isTaskList ? "todo" : ""}\ndatetime: ${timestamp}\n---`;
            const newFileName = `${PathToTimestamp}/${timestamp}.md`;
            
            const content = isTaskList
                ? `- [ ] ${propertyValue}` // 任务列表需要添加任务符号
                : `${propertyValue}`;     // 普通内容直接写入

            // 时间戳笔记直接写入内容
            const file = await app.vault.create(newFileName, `${yamlHeader}\n${content}`);
            new Notice(`时间戳笔记添加成功: ${file.path}`);
        } else {
            // 写入当天日记

            // 动态计算系统的时区偏移量
            const localTimezoneOffset = new Date().getTimezoneOffset(); // 分钟 
            const timezoneOffset = -localTimezoneOffset * 60 * 1000; // 毫秒，且需反向调整符号
            // 获取当前时间，并通过时区偏移量调整为本地时间
            const now = new Date();
            const localTime = new Date(now.getTime() + timezoneOffset);

            // 获取本地日期部分
            const year = localTime.getFullYear();
            const today = localTime.toISOString().slice(0, 10); // 格式：YYYY-MM-DD

            // 先检查年份文件夹是否存在, 如不存在则创建
            const yearFolder = `${PathToDiary}/${year}`;
            let folder = app.vault.getAbstractFileByPath(yearFolder);
            if (!folder) {
                await app.vault.createFolder(yearFolder);
            }

            const journalFileName = `${yearFolder}/${today}.md`;

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
const buttonContainer = formContainer.createDiv({ cls: "button-container" });

// 左侧按钮容器
const leftButtons = buttonContainer.createDiv({ cls: "left-buttons" });

// 切换写入模式按钮
const toggleWriteButton = leftButtons.createEl("button", { text: writeToDiary ? "📓写入日记" : "🕛时间戳笔记", cls: "toggle-write-button custom-button" });
toggleWriteButton.style.width = "100px";
toggleWriteButton.onclick = () => {
    writeToDiary = !writeToDiary;
    toggleWriteButton.textContent = writeToDiary ? "📓写入日记" : "🕛时间戳笔记";
};

// 切换列表类型按钮
const toggleListButton = leftButtons.createEl("button", { text: isTaskList ? "☑️任务列表" : "🔘无序列表", cls: "toggle-list-button custom-button" });
toggleListButton.style.width = "100px";
toggleListButton.onclick = () => {
    isTaskList = !isTaskList;
    toggleListButton.textContent = isTaskList ? "☑️任务列表" : "🔘无序列表";
};

// 右侧发送按钮
const sendButton = buttonContainer.createEl("button", { text: "发送", cls: "right-button custom-button" });
sendButton.style.width = "60px";
sendButton.onclick = handleButtonClick;

// 7. 添加快捷键 Ctrl+Enter
inputBox.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        handleButtonClick();
    }
});
```
```dataviewjs 
const activeFile = app.workspace.getActiveFile();
async function getYamlProperty(prop) {
    const metadata = await app.metadataCache.getFileCache(activeFile);
    return (metadata && metadata.frontmatter && metadata.frontmatter[prop]) || null;
}

let writeToDiary    = await getYamlProperty("DefaultToDiary")   || false;
let isTaskList      = await getYamlProperty("DefaultAsTask")    || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp")  || "data/timestamp";
let PathToDiary     = await getYamlProperty("PathToDiary")      || "Mindscape/Diary";
let PosToDiaryList  = await getYamlProperty("PosToDiaryList")   || "想法";
let PosToDiaryTask  = await getYamlProperty("PosToDiaryTask")   || "计划";
let LimitNum        = parseInt(await getYamlProperty("LimitNum")) || 64;

// 动态更新 YAML
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

// ========== 2. 公用函数 ==========
const parsedDates = new Map();
function getDate(filename) {
    if (!parsedDates.has(filename)) {
        parsedDates.set(filename, parseFilenameToDate(filename));
    }
    return parsedDates.get(filename);
}
function parseFilenameToDate(filename) {
    if (!filename || typeof filename !== "string") return null;
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})(?:[\s_](\d{6}))?/);
    if (!match) return null;

    const [_, datePart, timePart] = match;
    const [year, month, day] = datePart.split("-").map(Number);
    if (timePart) {
        const hours   = parseInt(timePart.slice(0, 2), 10);
        const minutes = parseInt(timePart.slice(2, 4), 10);
        const seconds = parseInt(timePart.slice(4, 6), 10);
        return new Date(year, month - 1, day, hours, minutes, seconds);
    } else {
        return new Date(year, month - 1, day);
    }
}

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
    if (nextSectionIndex !== -1) {
        return lines.slice(idx+1, idx+1+nextSectionIndex);
    } else {
        return lines.slice(idx+1);
    }
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

// ========== 3. 筛选状态：4个复选框 ==========
let showTasks      = true;
let showNotes      = true;
let showDiary      = true;
let showTimestamp  = true;

// ========== 4. 处理“时间戳”笔记 ==========
async function processTimestampNotes(pathToTimestamp, entries) {
    const pages = dv.pages(`"${pathToTimestamp}"`)
        .filter(p => p && p.file && p.file.name)
        .map(p => ({ ...p, date: getDate(p.file.name) }))
        .filter(p => p.date)
        .sort((a, b) => b.date - a.date);
    
    for (const page of pages) {
        const date = page.date;
        if (!date) continue;
    
        // 直接使用已有的 page 对象
        const tasks = page.file.tasks.array();
    
        let tags = [];
        if (page.tags) {
            tags = page.tags;
        } else if (page.file.frontmatter && page.file.frontmatter.tag) {
            tags = page.file.frontmatter.tag;
            if (typeof tags === 'string') tags = [tags];
        }
    
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
    // 获取所有符合条件的日记页面，避免重复调用 dv.page
    const pages = dv.pages(`"${pathToDiary}"`).filter(p => getDate(p.file.name));
    const pageEntries = await Promise.all(pages.map(async (page) => {
        const filePath = page.file.path;
        const content = await dv.io.load(filePath);
        const cleaned = removeYaml(content);
        const ideaSection = findIdeaSection(cleaned);
        let localEntries = [];
        let tags = [];
        if (page.tags) {
            tags = page.tags;
        } else if (page.file.frontmatter?.tag) {
            tags = page.file.frontmatter.tag;
            if (typeof tags === 'string') tags = [tags];
        }
        // 处理“想法”部分：均作为 note
        if (ideaSection) {
            const ideaItems = parseIdeaList(ideaSection);
            ideaItems.forEach(item => {
                const fileName = page.file.name;
                const date = getDate(fileName);
                let timeParts = item.time ? item.time.split(':').map(Number) : [0];
                while (timeParts.length < 3) { timeParts.push(0); }
                const [h, m, s] = timeParts;
                const dateTime = new Date(date);
                dateTime.setHours(h || 0, m || 0, s || 0, 0);
    
                localEntries.push({
                    date: dateTime,
                    content: item.time 
                        ? `> [!quote]+ [[${fileName}]] ${item.time}\n> ${item.content}`
                        : `> [!quote]+ [[${fileName}]]\n> ${item.content}`,
                    tags,
                    type: 'note',
                    source: 'diary'
                });
            });
        }
    
        // 处理“计划”部分：均作为 task
        const planTasks = page.file.tasks
            .where(t => t.section && t.section.subpath === PosToDiaryTask)
            .array();
        if (planTasks.length > 0) {
            const allCompleted = planTasks.every(t => t.completed);
            const calloutTitle = allCompleted ? '- ' : '+ ';
            const date = getDate(page.file.name);
    
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
    // 将各页面产生的 entries 扁平化合并
    pageEntries.flat().forEach(e => entries.push(e));
}


// ========== 6. 显示函数 ==========
function displayEntries(entries, limit) {
    entries.sort((a,b) => b.date - a.date);
    entries.slice(0, limit).forEach(e => {
        dv.paragraph(e.content);
    });
}

// ========== 7. 注入自适应CSS ==========
const style = document.createElement("style");
style.innerHTML = `

/* 第一行: [筛选按钮] [复选框们] [LimitNum] [刷新按钮] */
.dv-row-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  justify-content: space-between;
}

/* 通用按钮样式 */
.dv-button {
  padding: 6px 12px;
  color: black !important;
  border: 1px solid #1A191E;
  background-color: #8A5CF5 !important;
  border-radius: 10px;
  cursor: pointer;
}

/* 右侧区域 (LimitNum + 刷新按钮) */
.dv-right-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 复选框组 (放在第一行中间) */
.dv-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* 复选框样式 */
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

/* 第二行: 可隐藏的筛选字段 (日期 + tag) */
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

/* 日期+标签输入框行 */
.dv-filter-inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  width: 100%;
}

/* Tag 框自动扩展 */
.dv-filter-tag {
  flex-grow: 1;
}

/* 输入框样式 */
.dv-filter-input {
  border: 1px solid #1A191E;
  background-color: transparent !important;
  border-radius: 4px;
  padding: 4px 6px;
  min-width: 40px;
}

`;
document.head.appendChild(style);

// ========== 8. 创建UI ==========

// --- 第一行: [筛选按钮] [复选框(4个)] [LimitNum+刷新按钮]
const topRow = dv.container.createDiv({ cls: "dv-row-top" });

// 1) "高级筛选" 按钮 (左侧)
const toggleBtn = topRow.createEl("button", { cls: "dv-button", text: "高级筛选" });

// 2) 复选框组 (中间)
const checkboxGroup = topRow.createDiv({ cls: "dv-checkbox-group" });

function createCheckbox(labelText, defaultVal, onChange) {
    const wrap = checkboxGroup.createDiv({ cls: "dv-checkbox-wrapper" });
    const cb = wrap.createEl("input", { type: "checkbox" });
    cb.checked = defaultVal;
    cb.addEventListener("change", () => onChange(cb.checked));
    const label = wrap.createEl("label");
    label.textContent = labelText;
}

// 4 个复选框
createCheckbox("任务", showTasks, val => { showTasks = val; refreshEntries(); });
createCheckbox("列表", showNotes, val => { showNotes = val; refreshEntries(); });
createCheckbox("日记", showDiary, val => { showDiary = val; refreshEntries(); });
createCheckbox("闪念", showTimestamp, val => { showTimestamp = val; refreshEntries(); });

// 3) 右侧区域：LimitNum + 刷新
const rightGroup = topRow.createDiv({ cls: "dv-right-group" });

// 3.1) LimitNum 输入框 (紧贴刷新按钮)
const limitNumInput = rightGroup.createEl("input", { type: "number", cls: "dv-filter-input", value: LimitNum.toString(), min: "1" });
limitNumInput.title = "显示条目数量";
limitNumInput.addEventListener("input", (e) => {
    LimitNum = parseInt(e.target.value) || 1;
});
limitNumInput.addEventListener("blur", async () => {
    LimitNum = parseInt(limitNumInput.value) || 1;
    await updateYamlProperty("LimitNum", LimitNum);
});
limitNumInput.addEventListener("wheel", (e) => {
    e.preventDefault();
}, { passive: false });
limitNumInput.style.width = "50px";

// 3.2) "刷新" 按钮
const refreshBtn = rightGroup.createEl("button", { cls: "dv-button", text: "刷新" });
refreshBtn.onclick = refreshEntries;
refreshBtn.style.width = "60px";

// --- 第二行: 可隐藏的筛选字段 (日期范围 & tag)
const filterFields = dv.container.createDiv({ cls: "dv-filter-fields dv-filter-hidden" });

// 仅包含日期与标签，不再有复选框
const filterInputs = filterFields.createDiv({ cls: "dv-filter-inputs" });

// a) 开始日期
const startDateInput = filterInputs.createEl("input", { type: "date", cls: "dv-filter-input" });
startDateInput.title = "开始日期";

// 间隔符
const dashSpan = filterInputs.createEl("span", { text: "~" });
dashSpan.style.lineHeight = "1.8em";

// b) 结束日期
const endDateInput = filterInputs.createEl("input", { type: "date", cls: "dv-filter-input" });
endDateInput.title = "结束日期";

// c) 标签输入框 (自动扩展)
const tagInput = filterInputs.createEl("input", { type: "text", cls: "dv-filter-input dv-filter-tag", placeholder: "tag1;tag2;..." });
tagInput.title = "筛选标签";

// 点击“筛选”按钮 -> 切换 第二行 显示/隐藏
toggleBtn.onclick = () => {
    filterFields.classList.toggle("dv-filter-hidden");
};

// ========== 9. refreshEntries 主流程 ==========
async function refreshEntries() {
    const realVal = parseInt(await getYamlProperty("LimitNum")) || LimitNum;
    LimitNum = realVal;
    limitNumInput.value = realVal.toString();
    
    // 清空旧内容，保留 topRow 与 filterFields
    while (dv.container.children.length > 2) {
        dv.container.lastChild.remove();
    }
    
    const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
    const endDate = endDateInput.value ? new Date(endDateInput.value) : null;
    const tagFilter = tagInput.value.trim();
    // 预先拆分标签，避免在每个 entry 过滤时重复计算
    const tagsNeeded = tagFilter ? tagFilter.split(";").map(t => t.trim()) : null;
    
    const entries = [];
    // 并行处理不同类型的笔记
    await Promise.all([
         processTimestampNotes(PathToTimestamp, entries),
         processDiaryNotes(PathToDiary, entries)
    ]);
    
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
