// 作者: @Cyletix
// 使用方法: 安装dataview, 在dataview设置中启用dataviewjs, 粘贴内容到dataviewjs代码块, 或者使用dv.view("ThinoLikeTasksView"); 引用此脚本
// 文件结构:
//     日记: Diary/年份/2024-11-11
//     时间戳笔记: timestamp/
// 路径、插入位置和限制数量在YAML头文件中可以自定义修改


// 1. 获取当前文件
const activeFile = app.workspace.getActiveFile();

// 读取 YAML 属性
async function getYamlProperty(property) {
    const metadata = await app.metadataCache.getFileCache(activeFile);
    return metadata && metadata.frontmatter ? metadata.frontmatter[property] : null;
}

// 使用异步初始化变量
let writeToDiary    = await getYamlProperty("DefaultToDiary")   || false;
let isTaskList      = await getYamlProperty("DefaultAsTask")    || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp")  || "data/timestamp";
let PathToDiary     = await getYamlProperty("PathToDiary")      || "Mindscape/Diary";
let PosToDiaryList  = await getYamlProperty("PosToDiaryList")   || "想法";
let PosToDiaryTask  = await getYamlProperty("PosToDiaryTask")   || "计划";
let LimitNum        = await getYamlProperty("LimitNum")         || 64;

// ============== 文件名日期缓存 ==============
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
        const hours = parseInt(timePart.slice(0, 2), 10);
        const minutes = parseInt(timePart.slice(2, 4), 10);
        const seconds = parseInt(timePart.slice(4, 6), 10);
        return new Date(year, month - 1, day, hours, minutes, seconds);
    } else {
        return new Date(year, month - 1, day);
    }
}

// ========== 卡片生成辅助 ==========
function generateCalloutCard(title, content) {
    return `> [!quote]+ [[${title}]]\n${content}`;
}
function generateTodoCard(filePath, calloutTitle) {
    const fileName = dv.page(filePath).file.name;
    return `> [!todo]${calloutTitle}[[${fileName}]]\n> \`\`\`dataview\n> task\n> from "${filePath}"\n> \`\`\``;
}

// ========== 移除 YAML 前置、查找“想法”段落等 ==========
function removeYaml(content) {
    const yamlRegex = /^---[\s\S]*?---\n/;
    return content.replace(yamlRegex, '');
}
function findIdeaSection(content) {
    const lines = content.split('\n');
    const ideaStartIndex = lines.findIndex(line => line.trim().startsWith(`## ${PosToDiaryList}`));
    if (ideaStartIndex === -1) return null;

    const nextSectionIndex = lines.slice(ideaStartIndex + 1).findIndex(line => line.trim().startsWith('## '));
    return nextSectionIndex !== -1 
        ? lines.slice(ideaStartIndex + 1, ideaStartIndex + 1 + nextSectionIndex)
        : lines.slice(ideaStartIndex + 1);
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


// ========== 额外增加：4个复选框的全局状态 (初始都 true) ==========
let showTasks = true;       // 任务
let showNotes = true;       // 非任务
let showDiary = true;       // 日记
let showTimestamp = true;   // 时间戳笔记


// ========== 处理“时间戳”笔记 ==========
async function processTimestampNotes(pathToTimestamp, entries) {
    const timestampPages = dv.pages(`"${pathToTimestamp}"`)
        .filter(p => p && p.file && p.file.name)
        .map(p => ({ ...p, date: getDate(p.file.name) }))
        .filter(p => p.date)
        .sort((a, b) => b.date - a.date);

    for (const page of timestampPages) {
        const date = page.date;
        if (!date) continue;

        const pageData = dv.page(page.file.path);
        if (!pageData) continue;

        const tasks = pageData.file.tasks.array();

        // 提取标签
        let tags = [];
        if (pageData.tags) {
            tags = pageData.tags;
        } else if (pageData.file.frontmatter && pageData.file.frontmatter.tag) {
            tags = pageData.file.frontmatter.tag;
            if (typeof tags === 'string') tags = [tags];
        }

        if (tasks.length > 0) {
            // 标记为任务
            const allCompleted = tasks.every(task => task.completed);
            const calloutTitle = allCompleted ? '- ' : '+ ';

            entries.push({
                date: date,
                content: generateTodoCard(page.file.path, calloutTitle),
                tags: tags,
                type: 'task',       // 任务
                source: 'timestamp'
            });
        } else {
            // 标记为无序列表
            entries.push({
                date: date,
                content: generateCalloutCard(`${page.file.name}`, `![[${page.file.path}#]]`),
                tags: tags,
                type: 'note',
                source: 'timestamp'
            });
        }
    }
}

// ========== 处理“日记”笔记 ==========
async function processDiaryNotes(pathToDiary, entries) {
    const files = dv.pages(`"${pathToDiary}"`)
        .filter(p => getDate(p.file.name))
        .file.path;

    for (const filePath of files) {
        const content = await dv.io.load(filePath);
        const cleanedContent = removeYaml(content);
        const ideaSection = findIdeaSection(cleanedContent);

        if (ideaSection) {
            const ideaItems = parseIdeaList(ideaSection);
            if (ideaItems.length > 0) {
                ideaItems.forEach(item => {
                    const pageData = dv.page(filePath);
                    const fileName = pageData.file.name;
                    const date = getDate(fileName);

                    // 时间字符串解析
                    let timeParts = item.time ? item.time.split(':').map(Number) : [0];
                    while (timeParts.length < 3) {
                        timeParts.push(0);
                    }
                    const [hours, minutes, seconds] = timeParts;
                    const dateTime = new Date(date);
                    dateTime.setHours(hours || 0, minutes || 0, seconds || 0, 0);

                    // 提取标签
                    let tags = [];
                    if (pageData.tags) {
                        tags = pageData.tags;
                    } else if (pageData.file.frontmatter && pageData.file.frontmatter.tag) {
                        tags = pageData.file.frontmatter.tag;
                        if (typeof tags === 'string') tags = [tags];
                    }

                    // 都算“无序列表”类
                    entries.push({
                        date: dateTime,
                        content: item.time 
                            ? `> [!quote]+ [[${fileName}]] ${item.time}\n> ${item.content}`
                            : `> [!quote]+ [[${fileName}]]\n> ${item.content}`,
                        tags: tags,
                        type: 'note',
                        source: 'diary'
                    });
                });
            }
        }

        // 处理“计划”部分的任务
        const pageData = dv.page(filePath);
        if (!pageData) continue;
        const planTasks = pageData.file.tasks
            .where(task => task.section && task.section.subpath === PosToDiaryTask)
            .array();
        if (planTasks.length > 0) {
            const allCompleted = planTasks.every(task => task.completed);
            const calloutTitle = allCompleted ? '- ' : '+ ';
            const date = getDate(pageData.file.name);

            let tags = [];
            if (pageData.tags) {
                tags = pageData.tags;
            } else if (pageData.file.frontmatter && pageData.file.frontmatter.tag) {
                tags = pageData.file.frontmatter.tag;
                if (typeof tags === 'string') tags = [tags];
            }

            // 标记为“任务”
            entries.push({
                date: date,
                content: generateTodoCard(filePath, calloutTitle),
                tags: tags,
                type: 'task',
                source: 'diary'
            });
        }
    }
}

// ========== 显示排序 =============
function displayEntries(entries, limit) {
    entries.sort((a, b) => b.date - a.date);
    entries.slice(0, limit).forEach(entry => {
        dv.paragraph(entry.content);
    });
}


// ========== 注入自适应 CSS ========== 
const style = document.createElement("style");
style.innerHTML = `
    /* 第一行容器：包含“筛选”按钮和“刷新”按钮 */
    .dv-filter-toprow {
    display: flex;
    flex-wrap: wrap; /* 宽度不足时自动换行 */
    gap: 8px;
    align-items: center;
    margin-bottom: 5px;
    }
    
    /* “筛选”按钮 */
    .dv-filter-button {
    flex: 0 0 auto;
    padding: 6px 12px;
    border: 1px solid #ccc;
    cursor: pointer;
    background-color: #ddd;
    border-radius: 6px;
    }
    
    /* “刷新”按钮 */
    .dv-refresh-button {
    flex: 0 0 auto;
    padding: 6px 12px;
    border: 1px solid #ccc;
    cursor: pointer;
    background-color: #6097F4;
    color: black;
    border-radius: 6px;
    }

    /* 容器：放日期输入、标签输入、LimitNum */
    .dv-filter-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 5px;
    }
    
    /* 默认隐藏 */
    .dv-filter-fields.hidden {
    display: none !important;
    }

    /* 输入框样式 */
    .dv-filter-input {
    border: 1px solid #ccc;
    background-color: transparent;
    padding: 4px 6px;
    border-radius: 4px;
    min-width: 80px;
    }

    /* 第二行 4 个复选框容器 */
    .dv-checkbox-container {
    display: flex;
    flex-wrap: wrap; /* 小屏幕自动换行 */
    gap: 12px;
    margin-bottom: 5px;
    }
    .dv-checkbox-wrapper {
    display: flex;
    align-items: center;
    }
    .dv-checkbox-wrapper input {
    cursor: pointer;
    }
    .dv-checkbox-wrapper label {
    margin-left: 5px;
    user-select: none;
    }

`;
document.head.appendChild(style);


// ========== 第一行：日期、标签、limit、刷新按钮 ==========

// 创建容器(行1)
const controlContainer = dv.container.createDiv();
controlContainer.style.display = "flex";
controlContainer.style.flexWrap = "nowrap";
controlContainer.style.alignItems = "center";
controlContainer.style.marginBottom = "5px";
controlContainer.style.backgroundColor = "transparent";

// —— 开始日期
const startDateInput = controlContainer.createEl("input", { type: "date" });
// startDateInput.style.margin = "2px";
// startDateInput.style.border = "1px solid #1A191E";
startDateInput.style.backgroundColor = "transparent";
startDateInput.title = "开始日期";

// —— 间隔符
const toLabel = controlContainer.createEl("span", { text: "~" });
toLabel.style.margin = "2px";
toLabel.style.lineHeight = "2em";
toLabel.style.backgroundColor = "transparent";

// —— 结束日期
const endDateInput = controlContainer.createEl("input", { type: "date" });
// endDateInput.style.margin = "2px";
// endDateInput.style.border = "1px solid #1A191E";
endDateInput.style.backgroundColor = "transparent";
endDateInput.title = "结束日期";

// —— 标签输入框
const tagInput = controlContainer.createEl("input", { type: "text", placeholder: "tag1;tag2;..." });
// tagInput.style.margin = "2px";
// tagInput.style.border = "1px solid #1A191E";
tagInput.style.width = "80px";
// tagInput.style.height = "28px";
tagInput.style.flex = "1";
tagInput.style.backgroundColor = "transparent";
tagInput.title = "筛选标签";

// —— limitNum
const limitNumInput = controlContainer.createEl("input", { 
    type: "number", 
    value: LimitNum.toString(), 
    min: "1", 
    placeholder: "limit" 
});
limitNumInput.style.margin = "2px";
limitNumInput.style.border = "1px solid #1A191E";
limitNumInput.style.width = "80px";
limitNumInput.style.height = "28px";
limitNumInput.style.backgroundColor = "transparent";
limitNumInput.title = "显示条目数量";

// 监听 limitNum
limitNumInput.addEventListener("input", (event) => {
    LimitNum = parseInt(event.target.value) || 1;
});
limitNumInput.addEventListener("blur", async () => {
    const newLimitNum = parseInt(limitNumInput.value) || 1;
    LimitNum = newLimitNum;
    await updateYamlProperty("LimitNum", newLimitNum);
});
// 禁止鼠标滚轮更改
limitNumInput.addEventListener("wheel", (event) => {
    event.preventDefault();
}, { passive: false });

// —— 刷新按钮
const refreshButton = controlContainer.createEl("button", { text: "刷新" });
refreshButton.style.margin = "2px";
refreshButton.style.border = "1px solid #1A191E";
refreshButton.style.width = "60px";
refreshButton.style.height = "28px";
refreshButton.style.cursor = "pointer";
refreshButton.style.borderRadius = "20px"; // 调整按钮圆角
// 设置蓝色背景
refreshButton.style.backgroundColor = "#6097F4"; 
refreshButton.style.color = "black"; 
refreshButton.onclick = refreshEntries;


// ========== 第二行：4 个复选框 (任务/无序列表/日记/时间戳) ==========
const checkboxContainer = dv.container.createDiv({ cls: "dv-checkbox-container" });

// 帮助函数：创建复选框
function createCheckbox(parent, labelText, defaultVal, onChange) {
    const wrapper = parent.createDiv({ cls: "dv-checkbox-wrapper" });
    // 复选框
    const checkbox = wrapper.createEl("input", { type: "checkbox" });
    checkbox.checked = defaultVal;
    checkbox.style.cursor = "pointer";  // 保持手型
    checkbox.addEventListener("change", () => onChange(checkbox.checked));
    // 标签
    const label = wrapper.createEl("label");
    label.textContent = labelText;
    return checkbox;
}

// —— 1) showTasks
createCheckbox(checkboxContainer, "任务", showTasks, (val) => {
    showTasks = val;
    refreshEntries();
});
// —— 2) showNotes
createCheckbox(checkboxContainer, "列表", showNotes, (val) => {
    showNotes = val;
    refreshEntries();
});
// —— 3) showDiary
createCheckbox(checkboxContainer, "日记", showDiary, (val) => {
    showDiary = val;
    refreshEntries();
});
// —— 4) showTimestamp
createCheckbox(checkboxContainer, "时间戳", showTimestamp, (val) => {
    showTimestamp = val;
    refreshEntries();
});


// ========== 主刷新函数 ==========

async function refreshEntries() {
    // 从 YAML 中重新获取 LimitNum
    LimitNum = parseInt(await getYamlProperty("LimitNum")) || LimitNum;
    // 更新到输入框
    limitNumInput.value = LimitNum.toString();

    // 清空之前的内容（保留最上面2行控件）
    while (dv.container.children.length > 2) {
        dv.container.lastChild.remove();
    }

    // 获取筛选条件
    const tagFilter = tagInput.value.trim();
    const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
    const endDate = endDateInput.value ? new Date(endDateInput.value) : null;

    // 收集 entries
    const entries = [];
    await processTimestampNotes(PathToTimestamp, entries);
    await processDiaryNotes(PathToDiary, entries);

    // 复选框、日期和标签三重过滤
    const filteredEntries = entries.filter(entry => {
        // 日期
        if (startDate && endDate) {
            if (entry.date < startDate || entry.date > endDate) return false;
        } else if (startDate) {
            if (entry.date < startDate) return false;
        } else if (endDate) {
            if (entry.date > endDate) return false;
        }

        // 标签
        if (tagFilter) {
            const tagsToMatch = tagFilter.split(";").map(t => t.trim());
            const hasAllTags = tagsToMatch.every(t => entry.tags && entry.tags.includes(t));
            if (!hasAllTags) return false;
        }

        // 复选框: type/source
        // 1) 任务
        if (entry.type === "task" && !showTasks) return false;
        // 2) 无序
        if (entry.type === "note" && !showNotes) return false;
        // 3) 日记
        if (entry.source === "diary" && !showDiary) return false;
        // 4) 时间戳
        if (entry.source === "timestamp" && !showTimestamp) return false;

        return true;
    });

    // 显示
    displayEntries(filteredEntries, LimitNum);
}

// 首次加载
refreshEntries();
