// 作者: @Cyletix
// 版本: 1.5.0
// 更新日志:
// - 重构代码结构，将输入模块独立为单独文件
// - 优化CSS样式，增强UI一致性
// - 改进时间戳生成逻辑
// - 添加快捷键支持 (Ctrl+Enter)
// - 增强错误处理
// - 支持动态调整输入框高度
// - 优化按钮布局和交互

// 使用方法: 
// 在dataviewjs代码块中使用 dv.view("MemoFlowInputbox_v1.5") 引用

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
