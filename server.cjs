const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 5273;
const DIST_DIR = path.join(__dirname, 'dist');

// Gemini 代理地址：可用环境变量 GEMINI_PROXY_URL 覆盖；设为 "none" 或空串则直连（不走代理）
const envProxy = process.env.GEMINI_PROXY_URL;
const GEMINI_PROXY =
  envProxy === undefined
    ? 'http://127.0.0.1:7897'
    : envProxy === 'none' || envProxy === ''
    ? null
    : envProxy;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function forwardToGeminiWithCurl(model, payload, apiKey) {
  return new Promise((resolve, reject) => {
    const postBody = JSON.stringify(payload);
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const args = ['-s'];
    if (GEMINI_PROXY) {
      args.push('-x', GEMINI_PROXY);
    }
    args.push(
      '-X', 'POST',
      targetUrl,
      '-H', 'Content-Type: application/json',
      '-d', postBody,
      '--max-time', '18',
    );

    const child = spawn('curl.exe', args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (!stdout && code !== 0) {
        const fallbackArgs = [
          '-s',
          '-X', 'POST',
          targetUrl,
          '-H', 'Content-Type: application/json',
          '-d', postBody,
          '--max-time', '18',
        ];
        const childFallback = spawn('curl.exe', fallbackArgs);
        let fbOut = '';
        childFallback.stdout.on('data', c => fbOut += c);
        childFallback.on('close', () => {
          try {
            const parsed = JSON.parse(fbOut);
            resolve({ status: 200, data: parsed });
          } catch {
            reject(new Error(stderr || `curl exited with code ${code}`));
          }
        });
        return;
      }

      try {
        const json = JSON.parse(stdout);
        resolve({ status: 200, data: json });
      } catch (e) {
        reject(new Error(`Failed to parse response: ${stdout || stderr}`));
      }
    });
  });
}

// 允许本机回环与私有局域网来源访问
const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/;

const server = http.createServer(async (req, res) => {
  // Handle CORS
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Handle Gemini local proxy
  if (req.url === '/api/gemini' && req.method === 'POST') {
    const MAX_BODY_BYTES = 5 * 1024 * 1024; // 请求体上限，防止恶意超大请求
    let rawBody = '';
    let bodyTooLarge = false;
    req.on('data', chunk => {
      rawBody += chunk;
      if (!bodyTooLarge && rawBody.length > MAX_BODY_BYTES) {
        bodyTooLarge = true;
      }
    });
    req.on('end', async () => {
      if (bodyTooLarge) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: '请求体过大 (超过 5MB)' }));
        return;
      }
      try {
        const body = JSON.parse(rawBody);
        const {
          model = 'gemini-3.6-flash',
          messages = [],
          systemInstruction,
          apiKey,
          generationConfig,
        } = body;

        if (!apiKey) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: '缺少 Gemini API Key，请在设置中配置' }));
          return;
        }

        const rawContents = [];
        let systemText = systemInstruction || '';

        for (const m of messages) {
          if (m.role === 'system') {
            systemText = m.content;
          } else if (m.role === 'user') {
            rawContents.push({ role: 'user', parts: [{ text: m.content }] });
          } else if (m.role === 'assistant') {
            rawContents.push({ role: 'model', parts: [{ text: m.content }] });
          }
        }

        const contents = [];
        for (const item of rawContents) {
          if (contents.length === 0 && item.role === 'model') {
            contents.push({ role: 'user', parts: [{ text: '（系统前情提要：私教老师在上一轮作出了如下开场或讲解，请继续辅导）' }] });
          }
          if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
            contents[contents.length - 1].parts[0].text += '\n\n' + item.parts[0].text;
          } else {
            contents.push(item);
          }
        }

        const geminiPayload = { contents };
        if (systemText) {
          geminiPayload.systemInstruction = { parts: [{ text: systemText }] };
        }
        if (generationConfig && typeof generationConfig === 'object') {
          geminiPayload.generationConfig = generationConfig;
        }

        let result = await forwardToGeminiWithCurl(model, geminiPayload, apiKey);

        const isQuotaOrBusy = (err) => {
          if (!err) return false;
          const code = err.code;
          const status = err.status;
          const msg = (err.message || '').toLowerCase();
          return (
            code === 429 ||
            code === 503 ||
            status === 'RESOURCE_EXHAUSTED' ||
            status === 'UNAVAILABLE' ||
            msg.includes('quota exceeded') ||
            msg.includes('rate limit') ||
            msg.includes('resource exhausted') ||
            msg.includes('overloaded')
          );
        };

        if (result.data && result.data.error && isQuotaOrBusy(result.data.error)) {
          const fallbackModels = [
            'gemini-2.5-flash',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash-lite',
            'gemini-2.0-flash',
            'gemini-1.5-flash',
          ];
          console.log(`[Gemini 代理] 模型 ${model} 配额超限/服务繁忙 (${result.data.error.code || result.data.error.status})，自动尝试同 API Key 下的备选模型...`);
          for (const fb of fallbackModels) {
            if (fb === model) continue;
            try {
              console.log(`[Gemini 代理] 尝试备选模型: ${fb}`);
              const retryResult = await forwardToGeminiWithCurl(fb, geminiPayload, apiKey);
              if (!retryResult.data?.error && retryResult.data?.candidates && retryResult.data.candidates.length > 0) {
                console.log(`[Gemini 代理] 备选模型 ${fb} 响应成功！无缝接管对话`);
                result = retryResult;
                break;
              } else if (retryResult.data?.error && !isQuotaOrBusy(retryResult.data.error)) {
                // 若为其他错误（如 Key 无效等），停止轮询
                break;
              }
            } catch (e) {
              console.warn(`[Gemini 代理] 备选模型 ${fb} 请求异常:`, e.message);
            }
          }
        }

        if (result.data?.error) {
          const errMsg = result.data.error.message || `Google API 错误 (${result.data.error.code})`;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: errMsg }));
          return;
        }

        const candidate = result.data?.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text || '';
        const usage = result.data?.usageMetadata || {};

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          text,
          tokens: {
            prompt: usage.promptTokenCount || Math.ceil(rawBody.length * 1.2),
            completion: usage.candidatesTokenCount || Math.ceil(text.length * 1.3),
            total: usage.totalTokenCount || (Math.ceil(rawBody.length * 1.2) + Math.ceil(text.length * 1.3)),
          },
          tokensEstimated: !usage.totalTokenCount,
        }));
      } catch (err) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message || '内部代理错误' }));
      }
    });
    return;
  }

  // Handle Static Files
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  let filePath = path.join(DIST_DIR, reqPath);

  // Security: prevent path traversal（用相对路径判越界，避免 dist-evil 等同前缀目录绕过）
  const relativePath = path.relative(DIST_DIR, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback: serve index.html
      const indexPath = path.join(DIST_DIR, 'index.html');
      fs.readFile(indexPath, (indexErr, indexData) => {
        if (indexErr) {
          res.statusCode = 404;
          res.end('404 Not Found (dist/index.html missing)');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(indexData);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
  });
});

function startServer(port) {
  // 绑定 0.0.0.0 允许本机与局域网调试访问
  server.listen(port, '0.0.0.0', () => {
    const url = `http://localhost:${port}`;

    console.log(`\n======================================================`);
    console.log(`  🔖 栞 (Shiori) - AI 日语智能私教系统 已就绪！`);
    console.log(`======================================================`);
    console.log(`  本地访问地址: ${url}`);
    console.log(`  如浏览器未自动弹出，请在浏览器中手动打开上述网址。`);
    console.log(`  按 Ctrl + C 或直接关闭此窗口即可退出服务。`);
    console.log(`======================================================\n`);

    // Auto open browser
    const startCmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
    const { exec } = require('child_process');
    exec(startCmd, () => {});
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`端口 ${port} 被占用，正在尝试端口 ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('服务器启动异常:', err);
    }
  });
}

startServer(PORT);
