// 作者: @Cyletix
// 使用方法: 安装dataview, 在dataview设置中启用dataviewjs, 粘贴内容到dataviewjs代码块,
// 或者使用 dv.view("ThinoLikeTasksView"); 引用此脚本
// 文件结构:
//     日记: Diary/年份/2024-11-11
//     时间戳笔记: timestamp/
// 路径、插入位置和限制数量在YAML头文件中可自定义修改


// ========== 1. 读取 YAML 与初始化 ==========
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

        const pageData = dv.page(page.file.path);
        if (!pageData) continue;
        const tasks = pageData.file.tasks.array();

        let tags = [];
        if (pageData.tags) {
            tags = pageData.tags;
        } else if (pageData.file.frontmatter && pageData.file.frontmatter.tag) {
            tags = pageData.file.frontmatter.tag;
            if (typeof tags === 'string') tags = [tags];
        }

        if (tasks.length > 0) {
            // 标记为“任务”
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
            // 标记为“无序列表”
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
    const files = dv.pages(`"${pathToDiary}"`)
        .filter(p => getDate(p.file.name))
        .file.path;

    for (const filePath of files) {
        const content = await dv.io.load(filePath);
        const cleaned = removeYaml(content);
        const ideaSection = findIdeaSection(cleaned);

        const pageData = dv.page(filePath);
        if (!pageData) continue;
        let tags = [];
        if (pageData.tags) {
            tags = pageData.tags;
        } else if (pageData.file.frontmatter?.tag) {
            tags = pageData.file.frontmatter.tag;
            if (typeof tags === 'string') tags = [tags];
        }

        // 找到“想法”部分 -> 都算 note
        if (ideaSection) {
            const ideaItems = parseIdeaList(ideaSection);
            ideaItems.forEach(item => {
                const fileName = pageData.file.name;
                const date = getDate(fileName);
                let timeParts = item.time ? item.time.split(':').map(Number) : [0];
                while (timeParts.length < 3) {
                    timeParts.push(0);
                }
                const [h,m,s] = timeParts;
                const dateTime = new Date(date);
                dateTime.setHours(h||0, m||0, s||0, 0);

                entries.push({
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

        // 找到“计划”部分 -> 都算 task
        const planTasks = pageData.file.tasks
            .where(t => t.section && t.section.subpath === PosToDiaryTask)
            .array();
        if (planTasks.length > 0) {
            const allCompleted = planTasks.every(t => t.completed);
            const calloutTitle = allCompleted ? '- ' : '+ ';
            const date = getDate(pageData.file.name);

            entries.push({
                date,
                content: generateTodoCard(filePath, calloutTitle),
                tags,
                type: 'task',
                source: 'diary'
            });
        }
    }
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

/* 第一行: [筛选按钮] [刷新按钮+数量] */
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

/* 筛选区域 (可隐藏) */
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

/* 复选框行 */
.dv-checkbox-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
  align-items: center;
  width: 100%;
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

// --- 第一行: [筛选按钮] [LimitNum+刷新按钮]
const topRow = dv.container.createDiv({ cls: "dv-row-top" });

// 1) "高级筛选" 按钮 (左侧)
const toggleBtn = topRow.createEl("button", { cls: "dv-button", text: "高级筛选" });

// 2) 右侧区域：LimitNum + 刷新
const rightGroup = topRow.createDiv({ cls: "dv-right-group" });

// 3) LimitNum 输入框 (紧贴刷新按钮)
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

// 4) "刷新" 按钮
const refreshBtn = rightGroup.createEl("button", { cls: "dv-button", text: "刷新" });
refreshBtn.onclick = refreshEntries;
refreshBtn.style.width = "60px";

// --- 第二行: 可隐藏的筛选字段 (复选框 + 日期范围 & tag)
const filterFields = dv.container.createDiv({ cls: "dv-filter-fields dv-filter-hidden" });

// **复选框组（单独一行）**
const checkboxRow = filterFields.createDiv({ cls: "dv-checkbox-row" });

function createCheckbox(labelText, defaultVal, onChange) {
    const wrap = checkboxRow.createDiv({ cls: "dv-checkbox-wrapper" });
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

// **日期 & 标签筛选框（单独一行）**
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

// **点击“筛选”按钮 -> 切换 filterFields 是否隐藏**
toggleBtn.onclick = () => {
    filterFields.classList.toggle("dv-filter-hidden");
};




// ========== 9. refreshEntries 主流程 ==========
async function refreshEntries() {
    // 同步 LimitNum
    const realVal = parseInt(await getYamlProperty("LimitNum")) || LimitNum;
    LimitNum = realVal;
    limitNumInput.value = realVal.toString();

    // 清空之前的内容（保留 topRow + filterFields）
    while (dv.container.children.length > 2) {
        dv.container.lastChild.remove();
    }

    // 筛选条件
    const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
    const endDate = endDateInput.value ? new Date(endDateInput.value) : null;
    const tagFilter = tagInput.value.trim();

    // 收集 entries
    const entries = [];
    await processTimestampNotes(PathToTimestamp, entries);
    await processDiaryNotes(PathToDiary, entries);

    // 过滤
    const filtered = entries.filter(e => {
        // 日期过滤
        if (startDate && e.date < startDate) return false;
        if (endDate && e.date > endDate) return false;

        // 标签过滤
        if (tagFilter) {
            const tagsNeeded = tagFilter.split(";").map(t => t.trim());
            const hasAll = tagsNeeded.every(t => e.tags && e.tags.includes(t));
            if (!hasAll) return false;
        }

        // 复选框过滤
        if (e.type === 'task' && !showTasks) return false;
        if (e.type === 'note' && !showNotes) return false;
        if (e.source === 'diary' && !showDiary) return false;
        if (e.source === 'timestamp' && !showTimestamp) return false;

        return true;
    });

    // 渲染
    displayEntries(filtered, LimitNum);
}

// 首次加载
refreshEntries();
