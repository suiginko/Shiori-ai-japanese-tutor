import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';

function forwardToGeminiWithCurl(model: string, payload: any, apiKey: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const postBody = JSON.stringify(payload);
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Prefer Clash proxy 7897, fallback if not responding
    const args = [
      '-s',
      '-x', 'http://127.0.0.1:7897',
      '-X', 'POST',
      targetUrl,
      '-H', 'Content-Type: application/json',
      '-d', postBody,
      '--max-time', '18',
    ];

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
        // Retry without proxy in case user doesn't use 7897
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
      } catch (e: any) {
        reject(new Error(`Failed to parse response: ${stdout || stderr}`));
      }
    });
  });
}

function geminiLocalProxyPlugin() {
  return {
    name: 'gemini-local-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/gemini', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let rawBody = '';
        req.on('data', (chunk: any) => rawBody += chunk);
        req.on('end', async () => {
          try {
            const body = JSON.parse(rawBody);
            let { model = 'gemini-3.1-flash-lite', messages = [], systemInstruction, apiKey } = body;

            if (!apiKey) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: '缺少 Gemini API Key，请在右上角设置中填写' }));
              return;
            }

            // Fallback for models experiencing 503 high demand
            if (model === 'gemini-3.6-flash' || model === 'gemini-2.5-flash') {
              model = 'gemini-3.1-flash-lite';
            }

            const rawContents: any[] = [];
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

            // Gemini strictly requires:
            // 1) contents[0].role MUST be 'user'
            // 2) adjacent roles must alternate (user -> model -> user)
            const contents: any[] = [];
            for (const item of rawContents) {
              if (contents.length === 0 && item.role === 'model') {
                // If the first message in the window is model, prepend an introductory user turn
                contents.push({ role: 'user', parts: [{ text: '（系统前情提要：私教老师在上一轮作出了如下开场或讲解，请继续辅导）' }] });
              }
              if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
                contents[contents.length - 1].parts[0].text += '\n\n' + item.parts[0].text;
              } else {
                contents.push(item);
              }
            }

            const geminiPayload: any = { contents };
            if (systemText) {
              geminiPayload.systemInstruction = { parts: [{ text: systemText }] };
            }

            const result = await forwardToGeminiWithCurl(model, geminiPayload, apiKey);

            if (result.data.error) {
              // If model was experiencing 503 high demand, auto-retry through fallback models
              if (result.data.error.code === 503) {
                const fallbackModels = ['gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-flash'];
                for (const fb of fallbackModels) {
                  if (fb === model) continue;
                  const retryResult = await forwardToGeminiWithCurl(fb, geminiPayload, apiKey);
                  if (!retryResult.data.error && retryResult.data.candidates) {
                    const candidate = retryResult.data.candidates[0];
                    const text = candidate?.content?.parts?.[0]?.text || '';
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                      success: true,
                      text,
                      tokens: { prompt: 50, completion: Math.ceil(text.length * 1.3), total: 50 + Math.ceil(text.length * 1.3) }
                    }));
                    return;
                  }
                }
              }

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
              }
            }));
          } catch (err: any) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || '内部代理错误' }));
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), geminiLocalProxyPlugin()],
  server: {
    port: 5273,
    host: true,
    strictPort: true,
  },
});
