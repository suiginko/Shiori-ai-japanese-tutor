const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function getGitHubToken() {
  const out = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n\n'
  }).toString();
  const token = out.split('\n').find(l => l.startsWith('password='))?.replace('password=', '').trim();
  if (!token) throw new Error('Could not find GitHub token in git credential store');
  return token;
}

function requestJson(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function uploadAsset(uploadUrlTemplate, filePath, fileName, contentType, token) {
  return new Promise((resolve, reject) => {
    const cleanUrl = uploadUrlTemplate.replace(/\{.*?\}$/, '') + `?name=${encodeURIComponent(fileName)}`;
    const urlObj = new URL(cleanUrl);
    const fileStats = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    console.log(`正在上传 ${fileName} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)...`);

    const req = https.request(urlObj, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Shiori-Release-Script',
        'Content-Type': contentType,
        'Content-Length': fileStats.size,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ ${fileName} 上传成功！`);
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`上传 ${fileName} 失败 (HTTP ${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    fileStream.pipe(req);
  });
}

async function main() {
  const token = getGitHubToken();
  const repo = 'suiginko/Shiori-ai-japanese-tutor';
  const tag = 'v0.2.1';
  const releaseName = '🔖 栞 (Shiori) v0.2.1 - Android APK & PC 桌面便携版';

  const body = `## 🔖 栞 (Shiori) - AI 日语自适应智能私教 v0.2.1

### 🌟 本次版本核心更新

1. **五十音重构为「日语发音与 26 键键盘打字工坊」**：
   - 假名图谱扩充至 120+ 音（新增 36 个标准拗音 + 24 个现代外来语特殊假名）；
   - 新增 6 大核心发音深度精讲专题（促音停顿法则、拨音同化规律、长音延伸规则、音拍与声调核、不送气清音辨析、助词特例）；
   - 26 键键盘打字全攻略秘籍（小假名 x/l 前缀、促音双写流与独立流、拨音连击 nn 避坑、外来语简拼速查、F6~F10 快捷键）；
   - 沉浸式 26 键打字实训场（实时连击 Combo、计分进阶与语音朗读）；
   - 视觉与排版修复：彻底消除卡片重复字母，片假名与罗马字母放大，罗马音全面调用内置思源黑体（Noto Sans JP），界面元素全系接入和风自定义主题色。

2. **AI 自主学习规划与排课器（Curriculum Planner）升级**：
   - 引入轻量微课（~15m）、标准平衡（~25m）、高能冲刺（~40m）三档学习节奏体系；
   - 内置 N0~N1 完整学习路线图（Roadmap 全景图）；
   - 支持课时情境随时掷骰子微调或自定义输入场景重新备课；
   - 弹窗常驻「下一步行动卡」，步骤默认折叠减负，移动端响应式排版重构。

3. **振假名引擎（Ruby Parser）与查词弹窗鲁棒性**：
   - 智能切分保护中日文混排文本前缀，杜绝中文被误当成日文宿主吞入；
   - 智能识别并优雅渲染未写 <jp> 标签的裸方括号振假名，防止注音格式泄露。

---

### 📱 Android 手机版 (APK)
- **开箱即用**：下载 \`Shiori-AI-Japanese-Tutor_v0.2.1.apk\` 直接在手机安装；
- **专属图标**：搭载雅致和风「栞」应用专属图标；
- **纯离线字体**：内置 Noto Sans JP 日文字体，零外部请求；
- **自适应教学**：完整支持 N0~N1 梯级引导、汉字振假名注音与即时词典。

### 💻 电脑端绿色便携版 (ZIP)
- **免安装运行**：解压 \`Shiori-AI-Japanese-Tutor_v0.2.1.zip\` 到任意文件夹；
- **Windows 用户**：解压后根目录直接双击「**双击启动.bat**」即可秒级启动；
- **macOS / Linux 用户**：终端运行 \`bash "启动_Mac_Linux.sh"\`。

---
> 💡 如需体验 AI 私教交互功能，请在设置中填入您的 Gemini / OpenAI / DeepSeek 等大模型 API Key。所有数据与密钥均保存在您个人本地设备中，安全无忧。`;

  console.log(`1. 正在检查是否存在已有 Release (${tag})...`);
  let release;
  try {
    release = await requestJson(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Shiori-Release-Script',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    console.log(`找到已有 Release (ID: ${release.id})`);
  } catch (err) {
    console.log(`未找到已有 Release，正在创建新 Release (${tag})...`);
    release = await requestJson(`https://api.github.com/repos/${repo}/releases`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Shiori-Release-Script',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, {
      tag_name: tag,
      name: releaseName,
      body: body,
      draft: false,
      prerelease: false
    });
    console.log(`🎉 Release 创建成功 (ID: ${release.id})`);
  }

  const rootDir = path.resolve(__dirname, '..');
  const assets = [
    { file: 'Shiori-AI-Japanese-Tutor_v0.2.1.apk', type: 'application/vnd.android.package-archive' },
    { file: '栞-Shiori-AI_v0.2.1.apk', type: 'application/vnd.android.package-archive' },
    { file: 'Shiori-AI-Japanese-Tutor_v0.2.1.zip', type: 'application/zip' },
    { file: '栞-Shiori-AI日语私教_v0.2.1.zip', type: 'application/zip' }
  ];

  console.log('2. 正在上传构建附件...');
  for (const item of assets) {
    const filePath = path.join(rootDir, item.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`文件不存在: ${filePath}，跳过`);
      continue;
    }
    await uploadAsset(release.upload_url, filePath, item.file, item.type, token);
  }

  console.log(`\n🚀 恭喜！v0.2.1 Release 全部发布完成！`);
  console.log(`链接: https://github.com/${repo}/releases/tag/${tag}`);
}

main().catch(err => {
  console.error('发布失败:', err);
  process.exit(1);
});
