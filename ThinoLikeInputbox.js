// 作者: @Cyletix
// 使用方法: 安装dataview, 在dataview设置中启用dataviewjs, 粘贴内容到dataviewjs代码块. 暂时不能在Obsidian中引用, 原因未知. 
// 文件结构:
//     日记: Diary/年份/2024-11-11
//     时间戳笔记: timestamp/
// 路径 插入位置和限制数量在YAML头文件中可以自定义修改



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
inputBox.style.border = "1px solid #ccc";
inputBox.style.resize = "vertical"; // 允许用户手动调整高度
inputBox.placeholder = "写点什么好呢...";
inputBox.style.backgroundColor = "transparent";
//inputBox.style.color = "black";  // 字体颜色

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
            const timezoneOffset = -localTimezoneOffset * 60 * 1000;// 毫秒，且需反向调整符号
            // 获取当前时间，并通过时区偏移量调整为本地时间
            const now = new Date();
            const localTime = new Date(now.getTime() + timezoneOffset);

            // 获取本地日期部分
            const year = localTime.getFullYear();
            const today = localTime.toISOString().slice(0, 10); // 这里的 localTime 已是调整后的时间
            const journalFileName = `${PathToDiary}/${year}/${today}.md`;

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
    .custom-button {
        background-color: #57a5ff !important;
        color: black !important;
        padding: 5px 10px !important;
        border: none !important;
        cursor: pointer !important;
    }
    .button-container {
        display: flex;
        align-items: center;
	    background-color = "transparent";
        justify-content: space-between;
        width: 100%;
        margin-top: 5px;
    }
    .left-buttons, .right-button {
        display: flex;
        align-items: center;
    }
    .left-buttons > button {
        margin-right: 5px;
    }
`;
document.head.appendChild(style);

// 6. 创建容器和按钮，并应用自定义样式
const buttonContainer = formContainer.createDiv({ cls: "button-container" });

// 左侧按钮容器
const leftButtons = buttonContainer.createDiv({ cls: "left-buttons" });

// 切换写入模式按钮
const toggleWriteButton = leftButtons.createEl("button", { text: writeToDiary ? "📓写入日记" : "🕛时间戳笔记", cls: "custom-button" });
toggleWriteButton.style.width = "100px";
//toggleWriteButton.style.backgroundColor = "transparent";
toggleWriteButton.onclick = () => {
    writeToDiary = !writeToDiary;
    toggleWriteButton.textContent = writeToDiary ? "📓写入日记" : "🕛时间戳笔记";
};

// 切换列表类型按钮
const toggleListButton = leftButtons.createEl("button", { text: isTaskList ? "☑️任务列表" : "🔘无序列表", cls: "custom-button" });
toggleListButton.style.width = "100px";
//toggleListButton.style.backgroundColor = "transparent";
toggleListButton.onclick = () => {
    isTaskList = !isTaskList;
    toggleListButton.textContent = isTaskList ? "☑️任务列表" : "🔘无序列表";
};

// 右侧按钮容器
const rightButtonContainer = buttonContainer.createDiv({ cls: "right-button" });
const mainButton = rightButtonContainer.createEl("button", { text: "Send", cls: "custom-button" });
rightButtonContainer.style.backgroundColor = "transparent";
mainButton.onclick = handleButtonClick;

// 7. 添加快捷键 Ctrl+Enter
inputBox.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        handleButtonClick();
    }
});