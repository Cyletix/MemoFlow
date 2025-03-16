// 作者: @Cyletix  
// 日期: 2025-03-06  
// 版本: 1.4.0  
// 更新:  
// - 修正 activeFile 获取方式，改用 `dv.current().file`，确保基于代码所在笔记，而非当前活动文件。
// - 新增 YAML 复选框状态持久化 (`ShowTask`、`ShowList`、`ShowDiary`、`ShowMemo`)，交互时自动更新。
// - 增强日期解析，支持 YAML 指定的 `DiaryFormat` 和 `FlowFormat`，替换原先固定格式解析。
// - 统一路径处理，新增 `normalizePath`，去除路径尾部多余斜杠，保证一致性。
// - UI 调整：优化复选框分组布局，新增分页按钮与输入框，提升可读性与操作性。
// - CSS 细化：完善筛选区域、分页控件等样式，使界面更整洁、美观。
// - 提升数据处理效率，改进 `Promise.all` 并行处理，提高日记与时间戳笔记的加载速度。

// 使用方法: 
//      1. 安装dataview, 在dataview设置中启用dataviewjs, 粘贴内容到dataviewjs代码块,
//      2. 或者使用 dv.view("ThinoLikeTasksView"); 引用此脚本
// 文件结构:
//     日记: Diary/2024(此版本需要手动创建)/2024-11-11
//     时间戳笔记: timestamp/
// 路径、插入位置和限制数量在YAML头文件中可自定义修改



// ========== 1. 读取 YAML 与初始化 ==========

// TasksView（笔记筛选模块）
const currentFile = dv.current().file;
async function getYamlProperty(prop) {
    const metadata = await app.metadataCache.getFileCache(currentFile);
    return (metadata && metadata.frontmatter && metadata.frontmatter[prop]) || null;
}

// 从 frontmatter 读取配置，默认值与原版一致
let writeToDiary    = await getYamlProperty("DefaultToDiary")   || false;
let isTaskList      = await getYamlProperty("DefaultAsTask")    || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp")  || "data/timestamp";
let PathToDiary     = await getYamlProperty("PathToDiary")      || "Mindscape/Diary";
let PosToDiaryList  = await getYamlProperty("PosToDiaryList")   || "想法";
let PosToDiaryTask  = await getYamlProperty("PosToDiaryTask")   || "计划";
let LimitNum        = parseInt(await getYamlProperty("LimitNum")) || 64;
let DiaryFormat     = await getYamlProperty("DiaryFormat")      || "YYYY-MM-DD";
let FlowFormat      = await getYamlProperty("FlowFormat")       || "YYYY-MM-DD HHmmss";

// 新增：复选框状态直接从 YAML 中读取，不再默认 true
let showTask = await getYamlProperty("ShowTask");
let showList = await getYamlProperty("ShowList");
let showDiary = await getYamlProperty("ShowDiary");
let showMemo = await getYamlProperty("ShowMemo");

// 去除路径尾部斜杠
function normalizePath(path) {
    return path.replace(/\/+$/, "");
}
PathToDiary = normalizePath(PathToDiary);
PathToTimestamp = normalizePath(PathToTimestamp);

// ------ 动态更新 YAML 函数（原版保持不变） ------
async function updateYamlProperty(property, value) {
    const metadata = await app.metadataCache.getFileCache(currentFile);
    if (!metadata || !metadata.frontmatter) return;
    const fileContent = await app.vault.read(currentFile);
    const frontmatterEnd = fileContent.indexOf('---', 3);
    if (frontmatterEnd === -1) return;
    const frontmatterContent = fileContent.slice(0, frontmatterEnd + 3);
    const bodyContent = fileContent.slice(frontmatterEnd + 3);
    const updatedFrontmatter = frontmatterContent.replace(
        new RegExp(`(^${property}:\\s*)(.+)$`, 'm'),
        (_, p1) => `${p1}${value}`
    );
    const updatedContent = updatedFrontmatter + bodyContent;
    await app.vault.modify(currentFile, updatedContent);
}

// ========== 1. 两个解析函数（保持原版） ==========
function parseDiaryFilenameToDate(filename, userFormat) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    let m = moment(nameWithoutExt, userFormat, true);
    if (!m.isValid()) {
        m = moment(nameWithoutExt, "YYYY-MM-DD", true);
    }
    return m.isValid() ? m.toDate() : null;
}
function parseFlowFilenameToDate(filename, userFormat) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    let m = moment(nameWithoutExt, userFormat, true);
    if (!m.isValid()) {
        m = moment(nameWithoutExt, "YYYY-MM-DD HHmmss", true);
    }
    return m.isValid() ? m.toDate() : null;
}

// ========== 2. 其余辅助函数（保持原版一致） ==========
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
/* 此处直接使用 YAML 中读取的状态 */
  
// ========== 4. 处理“时间戳”笔记 ==========
async function processTimestampNotes(pathToTimestamp, entries) {
    const pages = dv.pages(`"${pathToTimestamp}"`)
        .filter(p => p && p.file && p.file.name)
        .map(p => {
            const d = parseFlowFilenameToDate(p.file.name, FlowFormat);
            return { ...p, date: d };
        })
        .filter(p => p.date)
        .sort((a, b) => b.date - a.date);
    for (const page of pages) {
        const date = page.date;
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
    const pages = dv.pages(`"${PathToDiary}"`);
    const pageEntries = await Promise.all(pages.map(async (page) => {
        const date = parseDiaryFilenameToDate(page.file.name, DiaryFormat);
        if (!date) return [];
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
        if (ideaSection) {
            const ideaItems = parseIdeaList(ideaSection);
            ideaItems.forEach(item => {
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
    const all = pageEntries.flat();
    all.sort((a, b) => b.date - a.date);
    all.forEach(e => entries.push(e));
}

// ========== 6. 显示函数 ==========
function displayEntries(entries, limit) {
    entries.sort((a, b) => b.date - a.date);
    entries.slice(0, limit).forEach(e => {
        dv.paragraph(e.content);
    });
}

// ========== 7. 注入 CSS 样式 ==========
const style = document.createElement("style");
style.innerHTML = `
/* 主行：顺序为 高级筛选按钮、复选框矩阵、右侧容器（包含翻页按钮组与刷新按钮） */
.dv-row-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  justify-content: flex-start;
}
/* 高级筛选按钮、刷新按钮采用 dv-button 样式 */
.dv-button {
  padding: 6px 12px;
  color: black !important;
  border: 1px solid #1A191E;
  background-color: #8A5CF5 !important;
  border-radius: 10px;
  cursor: pointer;
}
/* 复选框矩阵容器：使用 flex 保持一行，允许换行 */
.dv-checkbox-container {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
/* 每个分组保持一行 */
.dv-checkbox-group {
  display: flex;
  gap: 8px;
  flex-direction: row;
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
/* 右侧容器：用于翻页按钮组与刷新按钮 */
.dv-right-group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
/* 分页控件 */
.pagination-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pagination-button {
  background: transparent !important;
  border: none !important;
  padding: 2px 4px;
  cursor: pointer;
  font-size: 14px;
}
.pagination-input {
  width: 20px !important;
}
/* 高级筛选区 */
.dv-filter-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 2px 0;
}
.dv-filter-hidden {
  display: none !important;
}
.dv-filter-inputs {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  width: 100%;
}
/* 左侧：每页数量 */
.dv-filter-left {
  display: flex;
  align-items: stretch;
  gap: 4px;
}
/* 右侧：Tag 与日期组 */
.dv-filter-right {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-left: auto;
}
/* 日期组 */
.dv-date-group {
  display: flex;
  align-items: stretch;
  gap: 4px;
  margin-left: auto;
}
.dv-filter-tag, .dv-filter-input {
  border: 1px solid #1A191E;
  background-color: transparent !important;
  border-radius: 4px;
  padding: 4px 6px;
  min-width: 40px;
}
`;
document.head.appendChild(style);

// ========== 8. 创建 UI ==========
const topRow = dv.container.createDiv({ cls: "dv-row-top" });

// (1) 高级筛选按钮
const toggleBtn = topRow.createEl("button", { cls: "dv-button", text: "高级筛选" });
toggleBtn.onclick = () => { filterFields.classList.toggle("dv-filter-hidden"); };

// (2) 复选框矩阵
const checkboxContainer = topRow.createDiv({ cls: "dv-checkbox-container" });
const typeGroup1 = checkboxContainer.createDiv({ cls: "dv-checkbox-group" });
function createCheckbox(labelText, defaultVal, onChange, parent) {
    const wrap = parent.createDiv({ cls: "dv-checkbox-wrapper" });
    const cb = wrap.createEl("input", { type: "checkbox" });
    cb.checked = defaultVal;
    cb.addEventListener("change", () => onChange(cb.checked));
    const label = wrap.createEl("label");
    label.textContent = labelText;
}
createCheckbox("任务", showTask, val => { showTask = val; updateYamlProperty("ShowTask", val); refreshEntries(); }, typeGroup1);
createCheckbox("列表", showList, val => { showList = val; updateYamlProperty("ShowList", val); refreshEntries(); }, typeGroup1);
const typeGroup2 = checkboxContainer.createDiv({ cls: "dv-checkbox-group" });
createCheckbox("日记", showDiary, val => { showDiary = val; updateYamlProperty("ShowDiary", val); refreshEntries(); }, typeGroup2);
createCheckbox("闪念", showMemo, val => { showMemo = val; updateYamlProperty("ShowMemo", val); refreshEntries(); }, typeGroup2);

// (3) 右侧容器：包含翻页按钮组和刷新按钮
const rightGroup = topRow.createDiv({ cls: "dv-right-group" });
const paginationGroup = rightGroup.createDiv({ cls: "pagination-group" });
const prevPageBtn = paginationGroup.createEl("button", { text: "<", cls: "pagination-button" });
const pageInput = paginationGroup.createEl("input", { type: "number", value: "1", min: "1", cls: "dv-filter-input dv-filter-tag pagination-input" });
pageInput.style.width = "18px";
const nextPageBtn = paginationGroup.createEl("button", { text: ">", cls: "pagination-button" });
let currentPage = 1;
prevPageBtn.onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    pageInput.value = currentPage;
    refreshEntries();
  }
};
nextPageBtn.onclick = () => {
  const totalPages = Math.ceil(allFilteredEntries.length / LimitNum) || 1;
  if (currentPage < totalPages) {
    currentPage++;
    pageInput.value = currentPage;
    refreshEntries();
  }
};
pageInput.addEventListener("change", () => {
  const newPage = parseInt(pageInput.value);
  if (!isNaN(newPage) && newPage >= 1) {
    currentPage = newPage;
    refreshEntries();
  }
});
// 刷新按钮
const refreshBtn = rightGroup.createEl("button", { cls: "dv-button", text: "刷新" });
refreshBtn.onclick = refreshEntries;
refreshBtn.style.width = "60px";

// (高级筛选区域)——放在主行下方
const filterFields = dv.container.createDiv({ cls: "dv-filter-fields dv-filter-hidden" });
const filterInputs = filterFields.createDiv({ cls: "dv-filter-inputs" });

// 左侧分区：Tag 筛选和每页数量
const filterLeft = filterInputs.createDiv({ cls: "dv-filter-left" });
const limitSpan = filterLeft.createEl("span", { text: "每页数量:" });
const limitInput = filterLeft.createEl("input", { type: "number", value: LimitNum.toString(), min: "1", cls: "dv-filter-input dv-filter-tag" });
limitInput.style.width = "20px";
const tagInput = filterLeft.createEl("input", { type: "text", cls: "dv-filter-input dv-filter-tag", placeholder: "tag1,tag2;tag3..." });
tagInput.title = "筛选标签";

// 右侧分区：日期组
const filterRight = filterInputs.createDiv({ cls: "dv-filter-right" });

// 日期组：包含开始日期、~、结束日期
const dateGroup = filterRight.createDiv({ cls: "dv-date-group" });
const startDateInput = dateGroup.createEl("input", { type: "date", cls: "dv-filter-input" });
startDateInput.title = "开始日期";
const dashSpan = dateGroup.createEl("span", { text: "~" });
dashSpan.style.lineHeight = "1.8em";
const endDateInput = dateGroup.createEl("input", { type: "date", cls: "dv-filter-input" });
endDateInput.title = "结束日期";

// ========== 9. 主刷新流程 ==========
let allFilteredEntries = [];
async function refreshEntries() {
  const realVal = parseInt(await getYamlProperty("LimitNum")) || LimitNum;
  LimitNum = realVal;
  limitInput.value = realVal.toString();
  
  // 清空除前两行 UI 外的所有内容
  while (dv.container.children.length > 2) {
    dv.container.lastChild.remove();
  }
  
  const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
  const endDate = endDateInput.value ? new Date(endDateInput.value) : null;
  const tagFilter = tagInput.value.trim();
  const tagsNeeded = tagFilter ? tagFilter.split(/[,;]/).map(t => t.trim()).filter(Boolean) : null;
  
  const entries = [];
  await Promise.all([
    processTimestampNotes(PathToTimestamp, entries),
    processDiaryNotes(PathToDiary, entries)
  ]);
  
  let filtered = entries.filter(e => {
    if (startDate && e.date < startDate) return false;
    if (endDate && e.date > endDate) return false;
    if (tagsNeeded) {
      const hasAll = e.tags && tagsNeeded.every(t => e.tags.includes(t));
      if (!hasAll) return false;
    }
    if (e.type === 'task' && !showTask) return false;
    if (e.type === 'note' && !showList) return false;
    if (e.source === 'diary' && !showDiary) return false;
    if (e.source === 'timestamp' && !showMemo) return false;
    return true;
  });
  
  // 按日期降序排序，使最新的词条排在前面
  filtered.sort((a, b) => b.date - a.date);
  
  allFilteredEntries = filtered;
  const totalPages = Math.ceil(filtered.length / LimitNum) || 1;
  if (currentPage > totalPages) currentPage = 1;
  pageInput.value = currentPage;
  const startIndex = (currentPage - 1) * LimitNum;
  const pageEntries = filtered.slice(startIndex, startIndex + LimitNum);
  pageEntries.forEach(e => {
    dv.paragraph(e.content);
  });
}

// 首次加载
refreshEntries();
