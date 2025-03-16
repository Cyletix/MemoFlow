// 作者: @Cyletix
// 版本: 1.5.0
// 更新日志:
// - 重构代码结构，将筛选模块独立为单独文件
// - 优化高级筛选布局，解决日期组对齐问题
// - 改进分页和刷新功能
// - 增强筛选性能
// - 优化CSS样式
// - 添加错误处理
// - 支持动态调整筛选条件

// 使用方法:
// 在dataviewjs代码块中使用 dv.view("MemoFlowTasksView_v1.5") 引用

// ========== 1. 初始化 ==========
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
