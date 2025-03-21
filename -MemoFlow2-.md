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
const currentFile = dv.current().file;

// 读取 YAML 属性
async function getYamlProperty(property) {
  const metadata = await app.metadataCache.getFileCache(currentFile);
  return (metadata && metadata.frontmatter && metadata.frontmatter[property]) || null;
}

// 初始化配置
let writeToDiary = await getYamlProperty("DefaultToDiary") || false;
let isTaskList = await getYamlProperty("DefaultAsTask") || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp") || "data/timestamp";
let PathToDiary = await getYamlProperty("PathToDiary") || "Mindscape/Diary";
let PosToDiaryList = await getYamlProperty("PosToDiaryList") || "想法";
let PosToDiaryTask = await getYamlProperty("PosToDiaryTask") || "计划";

// ========== 2. 创建输入界面 ==========
const container = this.container.createDiv();
container.style.width = "100%";
container.style.marginBottom = "10px";

// 主表单容器
const formContainer = container.createDiv();
formContainer.style.display = "flex";
formContainer.style.flexDirection = "column";
formContainer.style.width = "100%";

// 创建文本输入框
const inputBox = formContainer.createEl("textarea", { rows: 3 });
inputBox.classList.add("cy-input");
inputBox.placeholder = "写点什么好呢...";
inputBox.style.width = "100%";
inputBox.style.backgroundColor = "transparent";
inputBox.style.border = "1px solid #8A5CF5";
inputBox.style.padding = "8px";
inputBox.style.resize = "vertical";

// 动态调整高度
const lineHeight = 20;
const padding = 16;
const minHeight = lineHeight + padding;
inputBox.style.minHeight = `${minHeight}px`;

inputBox.addEventListener("input", () => {
  inputBox.style.height = "auto";
  inputBox.style.height = `${inputBox.scrollHeight}px`;
});

// ========== 3. 时间戳生成 ==========
function generateTimestamp() {
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return `${dateFormatter.format(now)} ${timeFormatter.format(now).replace(/:/g, "")}`;
}

// ========== 4. 主处理函数 ==========
async function handleButtonClick() {
  const propertyValue = inputBox.value.trim();
  
  if (!propertyValue) {
    new Notice("请在文本框中输入内容！");
    return;
  }

  const timestamp = generateTimestamp();
  
  if (!writeToDiary) {
    // 写入时间戳笔记
    const yamlHeader = `---\ntags:\n${isTaskList ? "  - todo" : ""}\ndatetime: ${timestamp}\n---`;
    const newFileName = `${PathToTimestamp}/${timestamp}.md`;
    const content = isTaskList ? `- [ ] ${propertyValue}` : propertyValue;
    
    const file = await app.vault.create(newFileName, `${yamlHeader}\n${content}`);
    new Notice(`时间戳笔记添加成功: ${file.path}`);
  } else {
    // 写入日记
    const localTime = new Date();
    const diaryDate = moment(localTime).format("YYYY-MM-DD");
    const journalFileName = `${PathToDiary}/${diaryDate}.md`;
    
    let file = app.vault.getAbstractFileByPath(journalFileName);
    if (!file) {
      file = await app.vault.create(journalFileName, `# 日记\n\n## ${PosToDiaryList}\n\n## ${PosToDiaryTask}\n\n`);
    }
    
    const sectionTitle = isTaskList ? `## ${PosToDiaryTask}` : `## ${PosToDiaryList}`;
    let existingContent = await app.vault.read(file);
    const sectionIndex = existingContent.indexOf(sectionTitle);
    
    if (sectionIndex !== -1) {
      const afterSection = existingContent.slice(sectionIndex + sectionTitle.length);
      const insertIndex = afterSection.search(/\n(#+\\s|$)/);
      
      const content = isTaskList ? `- [ ] ${propertyValue}` : `- ${propertyValue}`;
      const updatedContent = existingContent.slice(0, sectionIndex + sectionTitle.length) +
        (afterSection.startsWith("\n") ? "" : "\n") +
        afterSection.slice(0, insertIndex) +
        `${content}\n` +
        afterSection.slice(insertIndex);
        
      await app.vault.modify(file, updatedContent);
    } else {
      const content = isTaskList ? `- [ ] ${propertyValue}` : `- ${propertyValue}`;
      await app.vault.modify(file, `${existingContent}\n${sectionTitle}\n\n${content}\n`);
    }
    new Notice(`内容已成功添加到日记: ${journalFileName}`);
  }
  
  inputBox.value = "";
}

// ========== 5. 创建按钮 ==========
const buttonRow = formContainer.createDiv();
buttonRow.style.display = "flex";
buttonRow.style.alignItems = "center";
buttonRow.style.gap = "6px";
buttonRow.style.marginTop = "5px";
buttonRow.style.width = "100%";

// 左侧按钮组
const timeListGroup = buttonRow.createDiv({ cls: "time-list-group" });

// 切换写入模式按钮
const toggleWriteButton = timeListGroup.createEl("button", {
  text: writeToDiary ? "📓写入日记" : "🕛时间戳笔记"
});
toggleWriteButton.classList.add("cy-btn");
toggleWriteButton.style.width = "100px";
toggleWriteButton.onclick = () => {
  writeToDiary = !writeToDiary;
  toggleWriteButton.textContent = writeToDiary ? "📓写入日记" : "🕛时间戳笔记";
};

// 切换列表类型按钮
const toggleListButton = timeListGroup.createEl("button", {
  text: isTaskList ? "☑️任务列表" : "🔘无序列表"
});
toggleListButton.classList.add("cy-btn");
toggleListButton.style.width = "100px";
toggleListButton.onclick = () => {
  isTaskList = !isTaskList;
  toggleListButton.textContent = isTaskList ? "☑️任务列表" : "🔘无序列表";
};

// 右侧发送按钮
const sendButton = buttonRow.createEl("button", { text: "发送" });
sendButton.classList.add("cy-btn");
sendButton.style.width = "60px";
sendButton.onclick = handleButtonClick;

// ========== 6. 快捷键支持 ==========
inputBox.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    handleButtonClick();
  }
});

// ========== 7. 注入CSS ==========
const style = document.createElement("style");
style.innerHTML = `
.cy-btn {
  padding: 6px 12px;
  color: black !important;
  border: 1px solid #1A191E !important;
  background-color: #8A5CF5 !important;
  border-radius: 10px !important;
  cursor: pointer;
}

.cy-input {
  background: transparent !important;
  border: 1px solid #8A5CF5 !important;
  border-radius: 4px !important;
  padding: 4px 6px !important;
  box-sizing: border-box !important;
}

.time-list-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
}
`;
document.head.appendChild(style);
```
```dataviewjs
const currentFile = dv.current().file;

// 读取 YAML 属性
async function getYamlProperty(property) {
  const metadata = await app.metadataCache.getFileCache(currentFile);
  return (metadata && metadata.frontmatter && metadata.frontmatter[property]) || null;
}

// 初始化配置
let writeToDiary = await getYamlProperty("DefaultToDiary") || false;
let isTaskList = await getYamlProperty("DefaultAsTask") || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp") || "data/timestamp";
let PathToDiary = await getYamlProperty("PathToDiary") || "Mindscape/Diary";
let PosToDiaryList = await getYamlProperty("PosToDiaryList") || "想法";
let PosToDiaryTask = await getYamlProperty("PosToDiaryTask") || "计划";
let LimitNum = parseInt(await getYamlProperty("LimitNum")) || 64;
let DiaryFormat = await getYamlProperty("DiaryFormat") || "YYYY-MM-DD";
let FlowFormat = await getYamlProperty("FlowFormat") || "YYYY-MM-DD HHmmss";

// 复选框状态
let showTask = await getYamlProperty("ShowTask");
let showList = await getYamlProperty("ShowList");
let showDiary = await getYamlProperty("ShowDiary");
let showMemo = await getYamlProperty("ShowMemo");

// ========== 2. 创建UI ==========
const topRow = dv.container.createDiv({ cls: "top-row" });

// 高级筛选按钮
const toggleBtn = topRow.createEl("button", { text: "高级筛选" });
toggleBtn.classList.add("cy-btn");
toggleBtn.onclick = () => filterFields.classList.toggle("filter-hidden");

// 复选框区域
const checksContainer = topRow.createDiv({ cls: "center-checks" });
const twoGroup = checksContainer.createDiv({ cls: "two-group" });

// 左侧复选框组
const leftBox = twoGroup.createDiv({ cls: "check-group" });
makeCheck("任务", showTask, val => {
  showTask = val;
  updateYamlProperty("ShowTask", val);
  refreshEntries();
}, leftBox);

makeCheck("列表", showList, val => {
  showList = val;
  updateYamlProperty("ShowList", val);
  refreshEntries();
}, leftBox);

// 右侧复选框组
const rightBox = twoGroup.createDiv({ cls: "check-group" });
makeCheck("日记", showDiary, val => {
  showDiary = val;
  updateYamlProperty("ShowDiary", val);
  refreshEntries();
}, rightBox);

makeCheck("闪念", showMemo, val => {
  showMemo = val;
  updateYamlProperty("ShowMemo", val);
  refreshEntries();
}, rightBox);

// 右侧操作组
const rightGroup = topRow.createDiv({ cls: "right-group" });
let currentPage = 1;

// 分页控件
const paginationGroup = rightGroup.createDiv({ cls: "pagination-group" });
const prevPageBtn = paginationGroup.createEl("button", { text: "<" });
prevPageBtn.classList.add("cy-btn", "page-btn");
prevPageBtn.onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    pageInput.value = currentPage;
    refreshEntries();
  }
};

const pageInput = paginationGroup.createEl("input", { type: "number", value: "1" });
pageInput.classList.add("cy-input");
pageInput.style.width = "30px";
pageInput.addEventListener("change", () => {
  const newPage = parseInt(pageInput.value);
  if (!isNaN(newPage)) {
    currentPage = newPage;
    refreshEntries();
  }
});

const nextPageBtn = paginationGroup.createEl("button", { text: ">" });
nextPageBtn.classList.add("cy-btn", "page-btn");
nextPageBtn.onclick = () => {
  const totalPages = Math.ceil(allFilteredEntries.length / LimitNum) || 1;
  if (currentPage < totalPages) {
    currentPage++;
    pageInput.value = currentPage;
    refreshEntries();
  }
};

// 刷新按钮
const refreshBtn = rightGroup.createEl("button", { text: "刷新" });
refreshBtn.classList.add("cy-btn");
refreshBtn.onclick = refreshEntries;

// ========== 3. 高级筛选 ==========
const filterFields = dv.container.createDiv({ cls: "filter-fields filter-hidden" });
const filterRow = filterFields.createDiv({ cls: "filter-row" });

// 标签输入框
const tagInput = filterRow.createEl("input", { type: "text", placeholder: "tag1,tag2;tag3..." });
tagInput.classList.add("cy-input");
tagInput.id = "tagInput";
tagInput.value = "";
tagInput.style.minWidth = "60px";

// 日期范围选择器
const dateRangeContainer = filterRow.createDiv({ cls: "date-range-container" });
const startDateInput = dateRangeContainer.createEl("input", { type: "date" });
startDateInput.classList.add("cy-input", "date-input");

const dashSpan = dateRangeContainer.createEl("span", { text: "~" });
dashSpan.style.margin = "0 4px";

const endDateInput = dateRangeContainer.createEl("input", { type: "date" });
endDateInput.classList.add("cy-input", "date-input");

// ========== 4. 注入CSS ==========
const style = document.createElement("style");
style.innerHTML = `
/* 顶部行 */
.top-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  width: 100%;
}

/* 复选框区域 */
.center-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 auto;
  justify-content: center;
}

.two-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.check-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

/* 右侧操作组 */
.right-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.pagination-group {
  display: flex;
  gap: 4px;
  align-items: center;
}

.page-btn {
  width: 25px !important;
  padding: 0 !important;
  text-align: center;
}

/* 高级筛选 */
.filter-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0;
}

.filter-hidden {
  display: none !important;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.date-range-container {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.date-input {
  width: 100px;
  min-width: 100px;
  text-align: center;
}

/* 通用样式 */
.cy-btn {
  padding: 6px 12px;
  color: black !important;
  background-color: #8A5CF5 !important;
  border-radius: 10px !important;
  cursor: pointer;
}

.cy-input {
  background: transparent !important;
  border: 1px solid #8A5CF5 !important;
  border-radius: 4px !important;
  padding: 4px 6px !important;
  box-sizing: border-box !important;
}
`;
document.head.appendChild(style);

// ========== 5. 辅助函数 ==========
function makeCheck(labelText, defVal, onChange, parent) {
  const wrap = parent.createDiv({});
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "2px";
  const cb = wrap.createEl("input", { type: "checkbox" });
  cb.checked = defVal;
  cb.addEventListener("change", () => onChange(cb.checked));
  wrap.createEl("label", { text: labelText });
}

// ========== 6. 数据筛选逻辑 ==========
let allFilteredEntries = [];

async function refreshEntries() {
  const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
  const endDate = endDateInput.value ? new Date(endDateInput.value) : null;
  const tFilter = tagInput.value.trim();
  const tagsNeeded = tFilter ? tFilter.split(/[,;]/).map(x => x.trim()).filter(Boolean) : null;
  
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
    if (e.type === "task" && !showTask) return false;
    if (e.type === "note" && !showList) return false;
    if (e.source === "diary" && !showDiary) return false;
    if (e.source === "timestamp" && !showMemo) return false;
    return true;
  });
  
  filtered.sort((a, b) => b.date - a.date);
  allFilteredEntries = filtered;
  
  const totalPages = Math.ceil(filtered.length / LimitNum) || 1;
  if (currentPage > totalPages) currentPage = 1;
  pageInput.value = currentPage;
  
  const startIndex = (currentPage - 1) * LimitNum;
  const pageEntries = filtered.slice(startIndex, startIndex + LimitNum);
  
  while (dv.container.children.length > 2) {
    dv.container.lastChild.remove();
  }
  
  pageEntries.forEach(e => {
    dv.paragraph(e.content);
  });
}

// ========== 7. 初始化 ==========
refreshEntries();
```