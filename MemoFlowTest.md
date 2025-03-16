---
PathToTimestamp: data/timestamp
PathToDiary: Mindscape/Diary/2025
PosToDiaryList: 想法
PosToDiaryTask: 计划
DiaryFormat: YYYY-MM-DD
FlowFormat: YYYY-MMDD HHmmss
DefaultToDiary: false
DefaultAsTask: false
ShowTask: true
ShowList: true
ShowDiary: true
ShowMemo: true
LimitNum: 4
---

```dataviewjs 
// ========== 1. 从 frontmatter 读取 ==========
const currentFile = dv.current().file;
async function getYamlProperty(property) {
  const metadata = await app.metadataCache.getFileCache(currentFile);
  return (metadata && metadata.frontmatter && metadata.frontmatter[property]) || null;
}

let writeToDiary    = await getYamlProperty("DefaultToDiary")   || false;
let isTaskList      = await getYamlProperty("DefaultAsTask")    || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp")  || "data/timestamp";
let PathToDiary     = await getYamlProperty("PathToDiary")      || "Mindscape/Diary";
let PosToDiaryList  = await getYamlProperty("PosToDiaryList")   || "想法";
let PosToDiaryTask  = await getYamlProperty("PosToDiaryTask")   || "计划";
let DateFormat      = await getYamlProperty("DateFormat")       || "YYYY-MM-DD";

// ========== 2. 创建外层容器 ==========

// 容器
const container = this.container.createDiv();
container.style.width = "100%";
container.style.marginBottom = "10px";

// 主表单容器: 竖排 => [ 文本输入框 ] + [ 按钮行(时间戳/无序 + tag + 发送 ) ]
const formContainer = container.createDiv();
formContainer.style.display = "flex";
formContainer.style.flexDirection = "column";
formContainer.style.width = "100%";

// ========== 3. 文本输入框 ==========
const inputBox = formContainer.createEl("textarea", { rows: 3 });
// 使用统一的输入框类
inputBox.classList.add("cy-input");
inputBox.placeholder = "写点什么好呢...";  // 占位提示

// 补充样式: 宽度/背景/边框/padding/可拉伸
inputBox.style.width = "100%";
inputBox.style.backgroundColor = "transparent";
inputBox.style.border = "1px solid #8A5CF5";
inputBox.style.padding = "8px";
inputBox.style.resize = "vertical";

// 设置最小高度
const lineHeight = 20;
const padding    = 16;
const minHeight  = lineHeight + padding;
inputBox.style.minHeight = `${minHeight}px`;

// 文本域自动增高
inputBox.addEventListener("input", () => {
  inputBox.style.height = "auto";
  inputBox.style.height = `${inputBox.scrollHeight}px`;
});

// Ctrl + Enter 发送
inputBox.addEventListener("keydown",(e)=>{
  if((e.ctrlKey || e.metaKey) && e.key==="Enter"){
    e.preventDefault();
    handleButtonClick();
  }
});

// ========== 4. 时间戳生成函数 ==========
function generateTimestamp(){
  const now=new Date();
  const dateFormatter = new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'});
  const timeFormatter = new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const datePart=dateFormatter.format(now);
  const timePart=timeFormatter.format(now).replace(/:/g,"");
  return `${datePart} ${timePart}`;
}

// ========== 5. 主点击函数 (保持原逻辑) ==========
async function handleButtonClick(){
  const propertyValue= inputBox.value.trim();
  const rawTags     = tagInput.value.trim();

  if(!propertyValue){
    new Notice("请在文本框中输入内容！");
    return;
  }

  const now = new Date();
  const timeString= now.toTimeString().slice(0,5);
  const timestamp= generateTimestamp();

  let tagList=[];
  if(rawTags){
    tagList= rawTags.split(/[,;]/).map(t=>t.trim()).filter(Boolean);
  }

  if(!writeToDiary){
    // 时间戳笔记
    let yamlTagLines="";
    if(tagList.length>0){
      yamlTagLines=tagList.map(t=>`  - ${t}`).join("\n");
    }
    const yamlHeader=`---\ntags:\n${yamlTagLines}${isTaskList?"  - todo":""}\ndatetime: ${timestamp}\n---`;
    const newFileName=`${PathToTimestamp}/${timestamp}.md`;
    const content= isTaskList? `- [ ] ${propertyValue}` : propertyValue;

    const file= await app.vault.create(newFileName, `${yamlHeader}\n${content}`);
    new Notice(`时间戳笔记添加成功: ${file.path}`);
  } else {
    // 写入当天日记
    const localTime= new Date();
    const diaryDate= moment(localTime).format(DateFormat);
    const journalFileName= `${PathToDiary}/${diaryDate}.md`;

    let file= app.vault.getAbstractFileByPath(journalFileName);
    if(!file){
      file= await app.vault.create(journalFileName, `# 日记\n\n## ${PosToDiaryList}\n\n## ${PosToDiaryTask}\n\n`);
    }
    const sectionTitle= isTaskList?`## ${PosToDiaryTask}`: `## ${PosToDiaryList}`;
    let existingContent= await app.vault.read(file);
    const sectionIndex= existingContent.indexOf(sectionTitle);

    if(sectionIndex!==-1){
      const afterSection= existingContent.slice(sectionIndex + sectionTitle.length);
      const insertIndex= afterSection.search(/\n(#+\\s|$)/);

      const content= isTaskList? `- [ ] ${timeString} ${propertyValue}`: `- ${timeString} ${propertyValue}`;
      const contentToInsert= content + "\n";
      const updatedContent= existingContent.slice(0, sectionIndex+sectionTitle.length)
           + (afterSection.startsWith("\n")?"":"\n")
           + afterSection.slice(0, insertIndex)
           + contentToInsert
           + afterSection.slice(insertIndex);

      await app.vault.modify(file, updatedContent);
    } else {
      const content= isTaskList? `- [ ] ${timeString} ${propertyValue}`: `- ${timeString} ${propertyValue}`;
      await app.vault.modify(file, `${existingContent}\n${sectionTitle}\n\n${content}\n`);
    }
    new Notice(`内容已成功添加到日记: ${journalFileName}`);
  }
  inputBox.value="";
}

// ========== 6. 注入CSS (只两个基础类 + 新的功能组class) ==========

const style=document.createElement("style");
style.innerHTML=`
/* 按钮: 通用样式 */
.cy-btn {
  padding: 6px 12px;
  color: black !important;
  border: 1px solid #1A191E !important;
  background-color: #8A5CF5 !important;
  border-radius: 10px !important;
  cursor: pointer;
}
/* 输入框: 通用样式 */
.cy-input {
  background: transparent !important;
  border: 1px solid #8A5CF5 !important;
  border-radius: 4px !important;
  padding: 4px 6px !important;
  box-sizing: border-box !important;
}
/* 功能组: 不参与剩余宽度, 宽度不足时先在这组之间换行 */
.time-list-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;  /* 不参与宽度填充 */
  align-items: center;
}
`;
document.head.appendChild(style);

// ========== 7. 创建按钮行 (时间戳+无序列表 + tag + 发送) ==========

const buttonRow = formContainer.createDiv();
buttonRow.style.display="flex";
buttonRow.style.alignItems="center";
buttonRow.style.gap="6px";
buttonRow.style.marginTop="5px";
buttonRow.style.width="100%";

// 左侧: “时间戳笔记 + 无序列表” => 不参与剩余, 使用功能组 class
const timeListGroup = buttonRow.createDiv({ cls:"time-list-group" });

// 时间戳笔记按钮
const toggleWriteButton = timeListGroup.createEl("button",{ text: writeToDiary ? "📓写入日记" : "🕛时间戳笔记" });
toggleWriteButton.classList.add("cy-btn");
toggleWriteButton.style.width="100px";  // 不参与自动伸缩
toggleWriteButton.onclick=()=>{
  writeToDiary=!writeToDiary;
  toggleWriteButton.textContent= writeToDiary? "📓写入日记":"🕛时间戳笔记";
};

// 无序列表 / 任务列表
const toggleListButton = timeListGroup.createEl("button",{ text: isTaskList? "☑️任务列表":"🔘无序列表" });
toggleListButton.classList.add("cy-btn");
toggleListButton.style.width="100px";
toggleListButton.onclick=()=>{
  isTaskList=!isTaskList;
  toggleListButton.textContent= isTaskList? "☑️任务列表":"🔘无序列表";
};

// 中间: tag输入框 => 占用剩余空间
const tagInput = buttonRow.createEl("input",{ type:"text", placeholder:"tag1,tag2;tag3..." });
tagInput.classList.add("cy-input");
tagInput.style.minWidth="60px";
tagInput.style.flexGrow="1";

// 右侧: 发送按钮(固定60px)
const sendButton = buttonRow.createEl("button",{ text:"发送" });
sendButton.classList.add("cy-btn");
sendButton.style.width="60px";
sendButton.onclick= handleButtonClick;
```

```dataviewjs 
// TasksView（笔记筛选模块）
const currentFile = dv.current().file;
async function getYamlProperty(prop) {
  const metadata = await app.metadataCache.getFileCache(currentFile);
  return (metadata && metadata.frontmatter && metadata.frontmatter[prop]) || null;
}

// ========== 1. 从 frontmatter 读取 ==========
let writeToDiary    = await getYamlProperty("DefaultToDiary")   || false;
let isTaskList      = await getYamlProperty("DefaultAsTask")    || false;
let PathToTimestamp = await getYamlProperty("PathToTimestamp")  || "data/timestamp";
let PathToDiary     = await getYamlProperty("PathToDiary")      || "Mindscape/Diary";
let PosToDiaryList  = await getYamlProperty("PosToDiaryList")   || "想法";
let PosToDiaryTask  = await getYamlProperty("PosToDiaryTask")   || "计划";
let LimitNum        = parseInt(await getYamlProperty("LimitNum")) || 64;
let DiaryFormat     = await getYamlProperty("DiaryFormat")      || "YYYY-MM-DD";
let FlowFormat      = await getYamlProperty("FlowFormat")       || "YYYY-MM-DD HHmmss";

// 复选框状态
let showTask = await getYamlProperty("ShowTask");
let showList = await getYamlProperty("ShowList");
let showDiary = await getYamlProperty("ShowDiary");
let showMemo = await getYamlProperty("ShowMemo");

// 去除路径尾部斜杠
function normalizePath(path){ return path.replace(/\/+$/,""); }
PathToDiary = normalizePath(PathToDiary);
PathToTimestamp = normalizePath(PathToTimestamp);

// 动态更新 YAML
async function updateYamlProperty(property, value) {
  const metadata = app.metadataCache.getFileCache(currentFile);
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

// ========== 2. 解析函数（原版） ==========
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

// ========== 3. 其余辅助函数（原版） ==========
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

// ========== 4. 闪念 ==========
async function processTimestampNotes(pathToTimestamp, entries) {
  const pages = dv.pages(`"${pathToTimestamp}"`)
    .filter(p => p && p.file && p.file.name)
    .map(p => {
      const d = parseFlowFilenameToDate(p.file.name, FlowFormat);
      return { ...p, date: d };
    })
    .filter(p => p.date)
    .sort((a,b) => b.date - a.date);

  for (const page of pages) {
    const date = page.date;
    const tasks = page.file.tasks.array();
    let tags = [];
    if (page.tags) {
      tags = page.tags;
    } else if (page.file.frontmatter?.tag) {
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

// ========== 5. 日记 ==========
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
        while (timeParts.length < 3){ timeParts.push(0); }
        const [h,m,s] = timeParts;
        const dateTime = new Date(date);
        dateTime.setHours(h||0, m||0, s||0, 0);
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
    if (planTasks.length > 0){
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
  all.sort((a,b) => b.date - a.date);
  all.forEach(e => entries.push(e));
}

// ========== 6. 显示函数 ==========
function displayEntries(entries, limit){
  entries.sort((a, b) => b.date - a.date);
  entries.slice(0, limit).forEach(e => { dv.paragraph(e.content); });
}

// ========== 7. 注入CSS ==========
const style = document.createElement("style");
style.innerHTML = `
/* 按钮统一 */
.cy-btn {
  padding: 6px 12px;
  color: black !important;
  background-color: #8A5CF5 !important;
  border-radius: 10px !important;
  cursor: pointer;
}
/* 输入框统一 */
.cy-input {
  background: transparent !important;
  border: 1px solid #8A5CF5 !important;
  border-radius: 4px !important;
  padding: 4px 6px !important;
  box-sizing: border-box !important;
}

/* 顶部行: 左边=高级筛选; 中间=复选框; 右边=翻页按钮+刷新 */
.top-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  width: 100%;
}
/* 中间的复选框区域 (居中) */
.center-checks {
  display: flex;
  flex-wrap: wrap; 
  gap: 8px;
  margin: 0 auto;
  justify-content: center;
}
/* 两组复选框 (任务+列表 与 日记+闪念) */
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

/* 右侧: 分页+刷新 */
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
/* 将 filter-row 改为 inline-flex，使其宽度仅包裹内部内容 */
.filter-row {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
}

/* 筛选行布局 */
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

/* tag 输入框 */
#tagInput {
  flex-grow: 1;
  min-width: 60px;
}

/* 日期组 */
.date-input {
  width: 100px;
  min-width: 100px;
  text-align: center;
  flex-grow: 0;
}
`;
document.head.appendChild(style);

// ========== 8. 创建UI ==========
const topRow = dv.container.createDiv({ cls:"top-row" });
const toggleBtn = topRow.createEl("button", { text:"高级筛选" });
toggleBtn.classList.add("cy-btn");
toggleBtn.onclick = () => filterFields.classList.toggle("filter-hidden");

const checksContainer = topRow.createDiv({ cls:"center-checks" });
const twoGroup = checksContainer.createDiv({ cls:"two-group" });
const leftBox = twoGroup.createDiv({ cls:"check-group" });
function makeCheck(labelText, defVal, onChange, parent){
  const wrap = parent.createDiv({});
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "2px";
  const cb = wrap.createEl("input", { type:"checkbox" });
  cb.checked = defVal;
  cb.addEventListener("change", () => onChange(cb.checked));
  wrap.createEl("label", { text: labelText });
}
makeCheck("任务", showTask, val => { showTask = val; updateYamlProperty("ShowTask", val); refreshEntries(); }, leftBox);
makeCheck("列表", showList, val => { showList = val; updateYamlProperty("ShowList", val); refreshEntries(); }, leftBox);

const rightBox = twoGroup.createDiv({ cls:"check-group" });
makeCheck("日记", showDiary, val => { showDiary = val; updateYamlProperty("ShowDiary", val); refreshEntries(); }, rightBox);
makeCheck("闪念", showMemo, val => { showMemo = val; updateYamlProperty("ShowMemo", val); refreshEntries(); }, rightBox);

const rightGroup = topRow.createDiv({ cls:"right-group" });
let currentPage = 1;
const paginationGroup = rightGroup.createDiv({ cls:"pagination-group" });
const prevPageBtn = paginationGroup.createEl("button", { text:"<" });
prevPageBtn.classList.add("cy-btn","page-btn");
prevPageBtn.onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    pageInput.value = currentPage;
    refreshEntries();
  }
};

const pageInput = paginationGroup.createEl("input", { type:"number", value:"1" });
pageInput.classList.add("cy-input");
pageInput.style.width = "30px";
pageInput.addEventListener("change", () => {
  const newPage = parseInt(pageInput.value);
  if (!isNaN(newPage) && newPage >= 1) {
    currentPage = newPage; 
    refreshEntries();
  }
});
const nextPageBtn = paginationGroup.createEl("button", { text:">" });
nextPageBtn.classList.add("cy-btn", "page-btn");
nextPageBtn.onclick = () => {
  const totalPages = Math.ceil(allFilteredEntries.length / LimitNum) || 1;
  if (currentPage < totalPages) {
    currentPage++;
    pageInput.value = currentPage;
    refreshEntries();
  }
};

const refreshBtn = rightGroup.createEl("button", { text:"刷新" });
refreshBtn.classList.add("cy-btn");
refreshBtn.onclick = refreshEntries;

const filterFields = dv.container.createDiv({ cls:"filter-fields filter-hidden" });
const filterRow = filterFields.createDiv({ cls:"filter-row" });
const tagInput = filterRow.createEl("input", { type:"text", placeholder:"tag1,tag2;tag3..." });
tagInput.classList.add("cy-input");
tagInput.id = "tagInput";
tagInput.value = "";
tagInput.style.minWidth = "60px";
tagInput.style.flexGrow = "1";

const dateGroup = filterRow.createDiv();
dateGroup.style.display = "flex";
dateGroup.style.alignItems = "center";
dateGroup.style.gap = "4px";
dateGroup.style.marginLeft = "auto";

const startDateInput = dateGroup.createEl("input", { type:"date" });
startDateInput.classList.add("cy-input","date-input");
const dashSpan = dateGroup.createEl("span", { text:"~" });
const endDateInput = dateGroup.createEl("input", { type:"date" });
endDateInput.classList.add("cy-input","date-input");

let allFilteredEntries = [];
async function refreshEntries(){
  const realVal = parseInt(await getYamlProperty("LimitNum")) || LimitNum;
  LimitNum = realVal;
  while(dv.container.children.length > 2){
    dv.container.lastChild.remove();
  }
  const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
  const endDate   = endDateInput.value   ? new Date(endDateInput.value) : null;
  const tFilter   = tagInput.value.trim();
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
  pageEntries.forEach(e => {
    dv.paragraph(e.content);
  });
}
refreshEntries();
```
