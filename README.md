# 🌸 栞 (Shiori) - AI 日语自适应智能私教

<p align="center">
  <img src="public/favicon.svg" alt="Shiori Logo" width="100" height="100" />
</p>

<p align="center">
  <strong>专为中文母语者设计的次世代 AI 日语自适应伴学系统</strong><br>
  教材级假名与声调标注 · 自适应水平诊断 · 极省 Token 架构 · 零后端纯前端直连 · 纯离线日文字体支持
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-8.2-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" />
</p>

---

## 🌟 核心特性与亮点

### 1. 📖 教材级振假名与高低声调折线标注 (Ruby & Pitch Accent)
* **精准汉字振假名**：全句自动智能分词与词性还原，日文汉字上方精准悬浮对应平假名注音。
* **高低音调可视化折线**：彻底解决初学者“只会读平假名却读不出地道音调”的痛点，支持平板调（⓪型）、头高调（①型）、中高调与尾高调的多型音调声调折线渲染。
* **分词释义与形态还原 (Deinflector)**：内置动词、形容词各态活用形反查引擎，点击句子中任意活用词汇均可智能回溯至辞书形原形。

### 2. 🧠 自适应水平诊断与学情流转体系
* **梯级教学引导**：精准支持 **N0 (五十音零基础) -> N5 -> N4 -> N3 -> N2 -> N1** 全周期阶梯式教学。
* **动态双语比例**：零基础/初级阶段以温和详尽的中文母语拆解语法难点；随着水平提升，系统自动平滑过渡为沉浸式全日语高阶对话交流。
* **三阶段学情档案**：词汇与语法自动流转管理（初学 ➔ 温习 ➔ 熟练掌握），支持一键闪卡复习与自测。

### 3. ⚡ 极省 Token 架构与先验记忆引擎
* **内置离线词库与语法索引**：本地搭载精细化的高频词汇库与 JLPT 语法点数据库，常用词汇释义直接本地即时秒显，绝不平白消耗大模型 Token。
* **跨会话先验去重**：自动记录学员已熟练掌握的知识点，避免 AI 在后续对话中反复机械式科普已知生词，省 Token 的同时让对话更流畅自然。
* **长会话上下文滑动窗口压缩**：自动精简多轮历史对话，在保障 AI 教师记忆连贯的前提下显著降低每次调用的 Token 消耗。

### 4. 🎭 多角色人设与深度沉浸定制
* **多元预设导师**：
  * 🌸 **水野 栞 (Shiori)**：温柔体贴、循循善诱的知性学姐。
  * ☀️ **阳葵 (Himari)**：活力元气、趣味并进的同龄同桌语伴。
  * 🎓 **佐藤 教授 (Sato)**：严谨专业、专注学术与考级精读的资深导师。
* **社交级角色与个人头像定制**：支持上传本地图片，提供滚轮缩放、拖拽平移、90° 旋转的圆形头像裁剪器，可自由配置专属称呼、第一人称自称及语调风格。
* **情境实战演练**：内置便利店购物、东京地铁求助、居酒屋点单、职场面试等多场景角色扮演（Role-play）。

### 5. 🔌 全主流大模型零后端直连
* **零后端、纯前端直连**：保护个人隐私，数据全部加密存储于本地浏览器 IndexedDB / LocalStorage。
* **多模型兼容支持**：
  * **Google Gemini**（Gemini 2.5 Flash / Pro、Gemini 2.0 等）
  * **OpenAI**（GPT-4o、GPT-4o-mini 等）
  * **DeepSeek**（DeepSeek-V3、DeepSeek-R1）
  * **国内兼容服务**：月之暗面 Kimi (Moonshot)、通义千问 Qwen、硅基流动 (SiliconFlow) 等任何兼容 OpenAI 格式的模型。
* **免 API Key 交互体验**：内置高保真教学交互模拟，无需配置 Key 即可立即体验核心功能。

### 6. 📦 纯离线支持与开箱即用体验
* **内置离线日文字体**：打包内嵌 `Noto Sans JP` 本地字体（woff2 格式），零外网字体请求，彻底告别字符缺失与排版错位。
* **绿色一键即开**：提供轻量自宿主服务脚本（PowerShell / Node），普通 Windows 用户解压即可双击启动，免装复杂环境。

---

## 🚀 快速启动

### 方式一：面向普通用户（开箱即用，无需 Node.js）
1. 前往本仓库的 [Releases](https://github.com/suiginko/Shiori-ai-japanese-tutor/releases) 页面，下载最新的发布压缩包。
2. 解压至任意文件夹。
3. **Windows 用户**：双击运行 `Start_Windows.bat` 或 `双击启动.bat`。
4. **macOS / Linux 用户**：终端运行 `bash "启动 (Mac-Linux).sh"`。
5. 系统将自动在浏览器中打开 `http://localhost:5273`。

---

### 方式二：面向开发者（从源码构建与开发）

#### 1. 克隆仓库
```bash
git clone https://github.com/suiginko/Shiori-ai-japanese-tutor.git
cd Shiori-ai-japanese-tutor
```

#### 2. 安装依赖
```bash
npm install
```

#### 3. 启动本地开发服务
```bash
npm run dev
```
打开浏览器访问控制台提示的地址（默认 `http://localhost:5173` 或 `http://localhost:5273`）。

#### 4. 生产构建打包
```bash
npm run build
```
构建产物将输出至 `dist/` 目录。

---

## 🛠️ 技术栈与架构设计

```
ai-japanese-tutor/
├── public/                 # 静态资源与内置本地字体 (NotoSansJP-Regular.woff2)
├── src/
│   ├── assets/             # 图片与矢量图标
│   ├── components/         # React UI 核心组件
│   │   ├── Chat/           # 聊天主视窗、振假名文本渲染、即时词典浮层
│   │   ├── Reference/      # 语法库抽屉、五十音图表、学情知识自测
│   │   ├── Settings/       # AI 模型 API 配置、人设与头像剪裁面板
│   │   ├── TutorPlan/      # 自适应水平评估与学习计划面板
│   │   └── Debug/          # 开发者调试与 Token 分析抽屉
│   ├── context/            # React 全局上下文 (词典与检索状态)
│   ├── data/               # 内置 JLPT 核心词库、语法接续规则、五十音表
│   ├── services/           # LLM 通信抽象层、TTS 语音合成、Token 优化器
│   ├── state/              # 响应式全局状态树 (useAppStore)
│   └── utils/              # 活用形还原算法、假名切分算法、音调数据解析
├── server.cjs / .ps1       # 绿色免安装自宿主本地 HTTP 服务器
└── vite.config.ts          # Vite 现代前端构建配置
```

* **核心框架**：React 19 + TypeScript
* **构建与工程工具**：Vite 8 + Oxlint
* **图标库**：Lucide React
* **特效支持**：Canvas Confetti
* **字体排版**：Noto Sans JP (本地 WOFF2 纯离线内置)

---

## ⚙️ 模型配置与使用指南

1. 打开应用后，点击右上角 **⚙️ 设置** 图标。
2. 切换到 **「AI 大模型接口」** 标签页。
3. 选择您使用的服务商（默认已对 **Google Gemini** 进行网络优化适配，国内网络亦可稳定直连）。
4. 填入您的 API Key 并点击保存，即可开始畅享完整的智能私教教学体验！

> 🔒 **隐私承诺**：您的所有 API Key 和学习聊天记录均仅保存在您本地浏览器的安全存储中，绝不经过任何第三方服务器中转。

---

## 🤝 参与贡献

欢迎随时提出 Issue 或提交 Pull Request！
1. Fork 本项目仓库
2. 创建您的新特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的修改 (`git commit -m 'feat: Add some AmazingFeature'`)
4. 推送至该分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源发布。自由用于个人学习与改进，欢迎 Star ⭐️ 收藏支持！
