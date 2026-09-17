import { Capacitor } from '@capacitor/core';
import { ApiSettings, ChatMessage, ChatSession, StudyMode, UserLearningProfile, RoleplayScenario, LearningPlan, LearnedWord, LearnedGrammar } from '../types';
import { buildSystemPrompt, isDebugQuery, optimizeMessagesContext } from './tokenOptimizer';
import { sanitizeActionDescriptions, detectQueryLanguage } from '../utils/languageDetector';
import {
  stripAnnotatedBlockMarks,
  deriveReadingFromAnnotated,
  sanitizeAnnotatedText,
} from '../utils/rubyParser';

// 注音串清洗器已收归块语法的唯一持有者 rubyParser，此处再导出以保持既有引用面不变
export { sanitizeAnnotatedText };
import { countTokens } from '../utils/tokenCounter';
import { debugLogger } from './debugLogger';

/**
 * 判断当前运行环境是否应当使用 PC 本地 Node.js 代理 (/api/gemini)。
 *
 * 核心规则：
 * 1. 移动端原生 App (Capacitor Android / iOS) 内部没有运行 PC 的 server.cjs，严禁走 /api/gemini（否则会请求手机本地静态服务器返回 index.html 导致 JSON 解析异常）；
 * 2. 只有在非原生 App、且处于 PC 本地环境（localhost / 127.0.0.1）时，才使用本地代理借用电脑上的代理端口；
 * 3. 一旦在手机 App 端、或用户显式配置了自定义的非默认 baseUrl，一律走标准的 OpenAI 兼容协议直连或反代。
 */
export function shouldUseLocalGeminiProxy(settings: ApiSettings): boolean {
  if (settings.provider !== 'gemini') return false;

  // 1. 原生移动端 App 绝对不能走本地相对路径代理
  if (typeof window !== 'undefined') {
    try {
      if (
        Capacitor.isNativePlatform() ||
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'ionic:'
      ) {
        return false;
      }
    } catch {
      // ignore
    }
  }

  // 2. 仅在浏览器本地运行（由 PC 端 scripts/server.cjs 托管）时有效
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
    if (!isLocalHost) {
      return false;
    }
  }

  // 3. 用户如果显式填写了自定义反代 Base URL（不同于默认官方地址），应尊重用户的配置走该地址
  const customBase = (settings.baseUrl || '').trim();
  const defaultGeminiBase = 'https://generativelanguage.googleapis.com/v1beta/openai';
  if (customBase && customBase !== defaultGeminiBase && customBase !== `${defaultGeminiBase}/`) {
    return false;
  }

  return true;
}

/**
 * 解析大模型请求的最终绝对/相对 endpoint 地址
 */
export function resolveApiEndpoint(settings: ApiSettings): string {
  if (settings.provider === 'gemini') {
    if (shouldUseLocalGeminiProxy(settings)) {
      return '/api/gemini';
    }
    // 移动端 App 或自定义反代端：走标准 OpenAI 兼容接口
    const rawBase = (settings.baseUrl && settings.baseUrl.trim()) || 'https://generativelanguage.googleapis.com/v1beta/openai';
    const cleanBase = rawBase.replace(/\/+$/, '');
    return cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;
  }

  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  /** true 表示该数据为本地估算兜底（API 未返回 usage），false 表示来自 API 真实 usage */
  estimated: boolean;
}

export interface StreamCallback {
  onChunk: (delta: string) => void;
  /**
   * 深度思考（推理链）增量回调。
   * 只有当用户开启深度思考、且服务端确实在吐推理内容时才会被调用；
   * 关闭深度思考时该回调永远不会触发，界面也就不会出现思考区块。
   */
  onReasoning?: (delta: string) => void;
  onDone: (fullText: string, tokensUsed: TokenUsage) => void;
  onError: (error: Error) => void;
  // 暴露本次请求的 AbortController，供外部「停止生成」按钮真正中止请求
  onControllerReady?: (controller: AbortController) => void;
}

/**
 * 判断本次请求是否需要"深度思考"能力（是否向用户展示推理过程）。
 * 'off' 时彻底屏蔽推理内容，其余（auto / on）都允许展示。
 */
function isDeepThinkingEnabled(settings: ApiSettings): boolean {
  return (settings.deepThinkingMode || 'auto') !== 'off';
}

/**
 * 依据供应商注入「强制开启推理」的请求参数。
 *
 * 铁律：只在**已知该供应商明确支持**时才注入，绝不给未知接口塞自定义字段——
 * OpenAI 兼容协议对未知参数的处理各家不一（有的忽略、有的直接 400），
 * 宁可少注入，也不能让一个"开启思考"的开关把普通对话打挂。
 * 因此 auto 模式下什么都不注入（优秀推理模型如 deepseek-reasoner 本就会主动吐推理链）。
 */
function buildThinkingParams(settings: ApiSettings): Record<string, any> {
  if ((settings.deepThinkingMode || 'auto') !== 'on') return {};

  const model = (settings.model || '').toLowerCase();

  switch (settings.provider) {
    case 'gemini':
      // Gemini 经本地代理转成 generateContent，用 thinkingConfig.includeThoughts 索取思考摘要
      return { thinkingConfig: { includeThoughts: true } };
    case 'qwen':
      // 阿里百炼兼容模式：流式下 enable_thinking 生效（非流式会报错，本项目恒为流式）
      return { enable_thinking: true };
    case 'siliconflow':
      // 硅基流动对 DeepSeek / Qwen 系模型支持 enable_thinking
      return { enable_thinking: true };
    case 'openai':
      // 仅推理系模型接受 reasoning_effort；给 gpt-4o 之流传该参数会被 400 拒绝
      return /^(o[1-9]|gpt-5|gpt-4\.1)/.test(model) ? { reasoning_effort: 'medium' } : {};
    case 'custom':
      // 自定义网关：仅在模型名明确指向推理模型时注入常见思考开关
      return /deepseek|qwen|reason|qwq|r1|glm-4\.\d/i.test(model) ? { enable_thinking: true } : {};
    default:
      // deepseek 官方（deepseek-reasoner 自动返回推理）、kimi、groq、ollama、openrouter 等
      // 均通过模型自身决定是否输出推理内容，无需也不应注入额外参数
      return {};
  }
}

// Helper: 生成未接入 API Key 时的状态说明与配置指引
function generateNoApiKeyNotice(settings: ApiSettings): string {
  const providerNames: Record<string, string> = {
    gemini: 'Google Gemini',
    deepseek: 'DeepSeek',
    openai: 'OpenAI (ChatGPT)',
    moonshot: '月之暗面 (Kimi)',
    qwen: '阿里通义千问 (Qwen)',
    siliconflow: '硅基流动 (SiliconFlow)',
    custom: '自定义兼容接口',
  };

  const currentProvider = providerNames[settings.provider] || settings.provider || 'AI 大模型';
  const tutorName = settings.aiTutorName?.trim() || '栞 (Shiori)';

  return `【⚠️ 状态提示：当前尚未接入 API Key】

你好！我是你的专属 AI 日语老师 **${tutorName}** 🌸。

当前系统检测到你**尚未配置有效的 ${currentProvider} API Key**，因此 AI 处于**离线待机模式**，无法实时调用大模型为你进行智能思考与个性化回复。

---
### 🛠️ 怎么接入 API 开启完整智能老师互动？
1. 点击界面右上角的 **「⚙️ 设置」** 按钮；
2. 在弹出的设置窗口中切换到 **「AI 大模型接口」** 选项卡；
3. 选择你偏好的模型提供商（支持 **Google Gemini**、**DeepSeek**、**OpenAI**、**Kimi**、**通义千问** 等）；
4. 填入你的 **API Key**，点击下方**保存设置**即可！

配置好 API Key 之后，我就可以陪你自由对话、场景扮演、随堂语法纠错与个性化教学啦！期待与你的正式交流～🌸`;
}

export async function sendChatMessageStream(
  messages: ChatMessage[],
  mode: StudyMode,
  profile: UserLearningProfile,
  settings: ApiSettings,
  scenario: RoleplayScenario | undefined,
  callbacks: StreamCallback,
  learnedKnowledge?: { words: LearnedWord[]; grammar: LearnedGrammar[] },
  allSessions?: ChatSession[],
  currentSessionId?: string
) {
  const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // If no API key is provided, clearly explain the current API status and guide setup
  if (!settings.apiKey || settings.apiKey.trim() === '') {
    const noticeText = generateNoApiKeyNotice(settings);
    const noticeTokens: TokenUsage = {
      prompt: 0,
      completion: countTokens(noticeText),
      total: countTokens(noticeText),
      estimated: true,
    };

    debugLogger.startChatRequest({
      id: requestId,
      mode,
      scenario,
      profile,
      settings,
      systemPrompt: '（离线模式：当前未配置 API Key，触发系统内置待机与配置指引流程）',
      rawMessages: messages,
      optimizedMessages: messages.map((m) => ({ role: m.role, content: m.content })),
      estimatedPromptTokens: 0,
      endpoint: 'Local Offline Fallback',
      learnedKnowledge,
      totalSessionsCount: allSessions?.length || 1,
      rawRequestBody: { reason: 'No API Key provided' },
    });

    simulateStreamingResponse(noticeText, callbacks, noticeTokens, requestId);
    return;
  }

  // Real LLM API request
  const controller = new AbortController();
  callbacks.onControllerReady?.(controller);

  let activeRequestId = requestId;
  try {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const systemPrompt = buildSystemPrompt(
      mode,
      profile,
      scenario,
      settings,
      learnedKnowledge?.words,
      learnedKnowledge?.grammar,
      allSessions,
      currentSessionId,
      lastUserMsg?.content,
      isDebugQuery(lastUserMsg?.content || '') // 仅调试类输入时注入调试指令，按需减负
    );
    const optimized = optimizeMessagesContext(
      messages,
      systemPrompt,
      settings.tokenSavingEnabled ? settings.maxHistoryTurns : 20
    );

    const useLocalGeminiProxy = shouldUseLocalGeminiProxy(settings);
    const endpoint = resolveApiEndpoint(settings);

    // 深度思考：仅在「强制开启」时注入供应商专属参数；off/auto 一律保持请求体原样。
    // revealReasoning 决定服务端若返回推理内容时是否向上透出（off 时直接丢弃）。
    const thinkingParams = buildThinkingParams(settings);
    const revealReasoning = isDeepThinkingEnabled(settings);

    const requestPayload = useLocalGeminiProxy
      ? {
        model: settings.model || 'gemini-3.6-flash',
        messages: optimized.messages,
        systemInstruction: optimized.systemPrompt,
        ...thinkingParams,
      }
      : {
        model: settings.model || (settings.provider === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4o-mini'),
        messages: optimized.messages,
        temperature: settings.temperature,
        stream: true,
        stream_options: { include_usage: true },
        ...thinkingParams,
      };

    // Log the initiation of the chat request to Debug Logger
    debugLogger.startChatRequest({
      id: activeRequestId,
      mode,
      scenario,
      profile,
      settings,
      systemPrompt: optimized.systemPrompt,
      rawMessages: messages,
      optimizedMessages: optimized.messages,
      estimatedPromptTokens: optimized.estimatedTokens,
      endpoint,
      learnedKnowledge,
      totalSessionsCount: allSessions?.length || 1,
      rawRequestBody: requestPayload,
    });

    // Gemini provider: use high-speed local proxy with Clash tunnel support (PC browser only)
    if (useLocalGeminiProxy) {
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 25000);

      try {
        const response = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestPayload,
            apiKey: settings.apiKey.trim(),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Gemini API 请求失败');
        }

        // 深度思考：本地代理会把 Gemini 的 thought 分片单独回传为 reasoning 字段
        const reasoningText = typeof result.reasoning === 'string' ? result.reasoning.trim() : '';
        if (revealReasoning && reasoningText) {
          callbacks.onReasoning?.(reasoningText);
        }

        const fullText = sanitizeActionDescriptions(result.text || '');
        const hasRealPrompt = typeof result.tokens?.prompt === 'number';
        const hasRealCompletion = typeof result.tokens?.completion === 'number';
        // 服务器若返回 tokensEstimated 标记，则说明其用量为兜底估算而非真实 usageMetadata
        const serverEstimated = result.tokensEstimated === true;
        const tokensCalc: TokenUsage = {
          prompt: hasRealPrompt ? result.tokens.prompt : optimized.estimatedTokens,
          completion: hasRealCompletion ? result.tokens.completion : countTokens(fullText),
          total:
            hasRealPrompt && hasRealCompletion
              ? result.tokens.total ?? result.tokens.prompt + result.tokens.completion
              : (hasRealPrompt ? result.tokens.prompt : optimized.estimatedTokens) +
              (hasRealCompletion ? result.tokens.completion : countTokens(fullText)),
          estimated: serverEstimated || !(hasRealPrompt && hasRealCompletion),
        };

        await simulateStreamingResponse(fullText, callbacks, tokensCalc, activeRequestId, controller.signal);
        return;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err?.name === 'AbortError') {
          if (timedOut) {
            throw new Error('请求超时 (25秒)，请检查代理连接后重试');
          }
          throw err; // 用户主动取消生成
        }
        throw err;
      }
    }

    // Standard OpenAI compatible providers (DeepSeek, OpenAI, Qwen, etc.)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API 请求错误 (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('响应数据流为空');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let streamUsage: any = null;

    // SSE 逐行解析缓冲：网络分片可能把一行 JSON 切成两半，
    // 直接对 chunk 做 split('\n') 会把残缺帧静默吞掉（正文偶发丢字，推理链更明显）。
    // 把最后一段不完整的行留到下一轮拼接，才能真正做到逐字不丢。
    let sseBuffer = '';

    const consumeSseLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') return;

      let data: any;
      try {
        data = JSON.parse(trimmed.replace('data: ', ''));
      } catch {
        return; // 仍可能是残缺帧，跳过
      }

      // 兼容不同厂商返回 usage 的位置：顶层 data.usage 或 data.choices[0].usage
      if (data.usage) {
        streamUsage = data.usage;
      } else if (data.choices?.[0]?.usage) {
        streamUsage = data.choices[0].usage;
      }

      const delta = data.choices?.[0]?.delta;
      if (!delta) return;

      // 推理内容字段名各家不一：DeepSeek / Qwen / SiliconFlow 用 reasoning_content，
      // Ollama 与部分网关用 reasoning，另有网关用 thinking。
      const rawReasoning = delta.reasoning_content ?? delta.reasoning ?? delta.thinking;
      if (revealReasoning && typeof rawReasoning === 'string' && rawReasoning) {
        callbacks.onReasoning?.(rawReasoning);
      }

      const content = typeof delta.content === 'string' ? delta.content : '';
      if (content) {
        accumulatedText += content;
        debugLogger.appendChunk(activeRequestId, content);
        callbacks.onChunk(content);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() ?? ''; // 末段可能不完整，留到下一轮再拼
      for (const line of lines) consumeSseLine(line);
    }
    // 收尾：冲掉缓冲区里可能残留的最后一帧
    if (sseBuffer.trim()) consumeSseLine(sseBuffer);

    const sanitizedAccumulated = sanitizeActionDescriptions(accumulatedText);
    const realPrompt = typeof streamUsage?.prompt_tokens === 'number' ? streamUsage.prompt_tokens : undefined;
    const realCompletion = typeof streamUsage?.completion_tokens === 'number' ? streamUsage.completion_tokens : undefined;
    const finalTokens: TokenUsage = {
      prompt: realPrompt ?? optimized.estimatedTokens,
      completion: realCompletion ?? countTokens(sanitizedAccumulated),
      total: realPrompt != null && realCompletion != null
        ? realPrompt + realCompletion
        : (realPrompt ?? optimized.estimatedTokens) + (realCompletion ?? countTokens(sanitizedAccumulated)),
      estimated: !(realPrompt != null && realCompletion != null),
    };

    debugLogger.completeChatRequest(activeRequestId, {
      sanitizedText: sanitizedAccumulated,
      tokens: finalTokens,
    });

    callbacks.onDone(sanitizedAccumulated, finalTokens);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // 用户主动停止生成：不做错误日志，交由调用方处理
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } else {
      let errorMsg = err?.message || String(err);
      if (settings.provider === 'gemini' && !shouldUseLocalGeminiProxy(settings)) {
        if (/Failed to fetch|NetworkError|Load failed|timeout|ERR_CONNECTION|aborted/i.test(errorMsg)) {
          errorMsg = `【连接提示】无法连接至 Google Gemini 官方服务（${errorMsg}）。移动端无法直接访问 PC 本地代理端口，请确认手机已开启网络代理工具，或在「设置」中将 Base URL 设为可用的 Gemini 反代地址。`;
        }
      }
      debugLogger.errorChatRequest(activeRequestId, errorMsg);
      callbacks.onError(err instanceof Error ? err : new Error(errorMsg));
    }
  }
}

// Generates an updated dynamic learning plan based on recent student progress
export async function generateUpdatedPlan(
  profile: UserLearningProfile,
  recentMessages: ChatMessage[],
  settings: ApiSettings
): Promise<LearningPlan> {
  const defaultPlan: LearningPlan = {
    currentStage: `${profile.level} 阶段核心攻坚`,
    todayGoal: `完成 ${profile.level} 核心语法理解与 1 轮情景对话`,
    weeklyProgress: Math.min(100, Math.max(15, profile.masteredGrammar.length * 12)),
    tasks: [
      { id: 't1', title: '进行一次居酒屋或便利店场景实战演练', type: 'dialogue', target: 'roleplay', completed: false },
      { id: 't2', title: '掌握 2 个新句型与动词变形', type: 'grammar', target: 'grammar', completed: false },
      { id: 't3', title: '复习 10 个高频生活生词与声调', type: 'vocab', target: 'tutor', completed: false },
    ],
    suggestedTopics: ['日常购物与数字金额表达', '时间与交通出行', '向朋友表达喜好与建议'],
    grammarFocus: profile.weakPoints.length > 0 ? profile.weakPoints : ['～てください', '～てもいいですか'],
    lastUpdated: new Date().toLocaleDateString(),
  };

  // If no API key or prompt fails, return rich default
  if (!settings.apiKey) {
    return defaultPlan;
  }

  const startTime = Date.now();
  const useLocalGeminiProxy = shouldUseLocalGeminiProxy(settings);
  const endpoint = resolveApiEndpoint(settings);

  try {
    const prompt = `根据学生档案（水平：${profile.level}，已掌握：${profile.masteredGrammar.join(',')}，薄弱项：${profile.weakPoints.join(',')}），请生成一份结构化学习计划 JSON。
格式必须严格为 JSON：
{
  "currentStage": "阶段名称",
  "todayGoal": "今日目标",
  "weeklyProgress": 45,
  "tasks": [
    {"id": "1", "title": "任务描述", "type": "dialogue", "target": "roleplay", "completed": false}
  ],
  "suggestedTopics": ["话题1", "话题2"],
  "grammarFocus": ["语法1", "语法2"]
}`;

    let resultText = '';
    if (useLocalGeminiProxy) {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.model || 'gemini-3.6-flash',
          messages: [{ role: 'user', content: prompt }],
          apiKey: settings.apiKey.trim(),
          generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        }),
      });

      if (!response.ok) return defaultPlan;
      const result = await response.json();
      if (!result.success || !result.text) return defaultPlan;
      resultText = result.text;
    } else {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: settings.model || (settings.provider === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4o-mini'),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      });

      if (!response.ok) return defaultPlan;
      const json = await response.json();
      resultText = json.choices?.[0]?.message?.content || '';
    }

    const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    debugLogger.logGenericTask({
      type: 'plan',
      title: `生成 ${profile.level} 动态学习计划`,
      provider: settings.provider,
      model: settings.model || (settings.provider === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4o-mini'),
      endpoint,
      prompt,
      rawOutput: resultText,
      status: 'success',
      durationMs: Date.now() - startTime,
    });

    return {
      ...parsed,
      lastUpdated: new Date().toLocaleDateString(),
    };
  } catch (err: any) {
    debugLogger.logGenericTask({
      type: 'plan',
      title: `生成 ${profile.level} 学习计划 (异常回退)`,
      provider: settings.provider,
      model: settings.model || 'default',
      endpoint,
      prompt: '（生成计划时异常）',
      rawOutput: '',
      status: 'error',
      errorMessage: err?.message || String(err),
      durationMs: Date.now() - startTime,
    });
    return defaultPlan;
  }
}

// Helper typewriter simulation for zero-config preview
function simulateStreamingResponse(
  fullText: string,
  callbacks: StreamCallback,
  tokensOverride?: TokenUsage,
  requestId?: string,
  signal?: AbortSignal
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let index = 0;
    const length = fullText.length;
    const chunkSize = 2; // output 2 chars at a time
    const intervalTime = 16; // smooth 60fps typing
    let cancelled = false;
    let interval: number;

    const cleanup = () => {
      clearInterval(interval);
      if (signal) signal.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      cancelled = true;
      cleanup();
      reject(new DOMException('已取消', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    interval = window.setInterval(() => {
      if (cancelled) return;
      if (index >= length) {
        cleanup();
        const finalTokens = tokensOverride || {
          prompt: 0,
          completion: countTokens(fullText),
          total: countTokens(fullText),
          estimated: true,
        } as TokenUsage;

        if (requestId) {
          debugLogger.completeChatRequest(requestId, {
            sanitizedText: fullText,
            tokens: finalTokens,
          });
        }

        callbacks.onDone(fullText, finalTokens);
        resolve();
        return;
      }

      const nextChunk = fullText.substring(index, Math.min(index + chunkSize, length));
      index += chunkSize;

      if (requestId) {
        debugLogger.appendChunk(requestId, nextChunk);
      }

      callbacks.onChunk(nextChunk);
    }, intervalTime);
  });
}

/**
 * 把 AI 返回的日文片段（例句 / 成分拆解）统一收敛成"可渲染的注音串"：
 * 带规范注音块时保留注音串（供界面渲染振假名），否则抹掉残留系统标记只留纯文本。
 *
 * 词典小窗的例句与 breakdown 片段同样由模型按注音语法书写，绝不能让 `{` `}` `[` `]`
 * 直接暴露给用户，也绝不能让括号内的读音混进正文。
 */
function toRenderableJpField(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return sanitizeAnnotatedText(raw) ?? stripAnnotatedBlockMarks(raw);
}

/**
 * 实时通过 AI 权威生成精准日语词条定义（当离线词库未命中或遇到俚语、生僻词时的自愈方案）
 */
export async function queryWordDefinitionFromLLM(
  word: string,
  reading?: string,
  customSettings?: ApiSettings,
  contextOptions?: { isFromJTag?: boolean; sentenceContext?: string; originalQuery?: string }
): Promise<{
  word: string;
  lemma?: string;
  reading: string;
  originalQuery?: string;
  pos?: string;
  pitch?: number;
  level?: string;
  meaning: string;
  detail?: string;
  breakdown?: Array<{ jp: string; zh?: string; role?: string }>;
  /** 带注音的标题串（软件统一 `{原文[读音]}` 语法）：由 AI 返回的 "word" 字段解析而来，各类型都会有 */
  annotated?: string;
  examples?: Array<{ jp: string; zh: string }>;
  queryType?: 'word' | 'phrase' | 'grammar' | 'sentence';
} | null> {
  const cleanWord = word.trim();
  if (!cleanWord) return null;

  let effectiveSettings: ApiSettings | undefined = customSettings;
  if (!effectiveSettings) {
    try {
      const stored = localStorage.getItem('agy_jp_settings_v1');
      if (stored) {
        effectiveSettings = JSON.parse(stored);
      }
    } catch {
      // Ignore
    }
  }

  // 如果没有有效的 API Key，直接返回 null（使用本地离线词典）
  if (!effectiveSettings || !effectiveSettings.apiKey || effectiveSettings.apiKey.trim() === '') {
    return null;
  }

  const finalSettings = effectiveSettings;

  // 基于明确的 <j> 标签及前后文，精准判断是否为中文输入查日文
  const queryLang = detectQueryLanguage(
    cleanWord,
    contextOptions?.sentenceContext,
    contextOptions?.isFromJTag
  );
  const isChineseQuery = queryLang === 'cn';

  let prompt = '';
  if (isChineseQuery) {
    prompt = `你是一部权威专业的中日·日汉双解词典与专业日语翻译专家。
用户输入了中文内容「${cleanWord}」，需要查询其对应的最地道、标准的日文表达与专业解析。
${contextOptions?.sentenceContext ? `所在上下文环境参考（仅辅助理解原意，必须严格针对「${cleanWord}」本身进行翻译）：「${contextOptions.sentenceContext}」` : ''}

第一步，判定语言范畴（queryType）：
   - 单词（word）：单个字词（如：迟到 → 遅刻，手机 → スマホ，高兴 → 嬉しい）。
   - 词组/惯用语（phrase）：固定短语、熟语（如：看人下菜碟 → 足元を見る，一见钟情 → 一目惚れ）。
   - 文法句型（grammar）：表达语法功能或句式的结构（如：未必如此 → わけではない，必须做 → なければならない）。
   - 句子/表达（sentence）：包含完整主谓动作的句子或口语表达（如：我想喝咖啡 → コーヒーを飲みたい）。

第二步，按范畴输出【相配的内容】——绝不千篇一律：
   - 单词：给标准声调核与 JLPT 等级；meaning 为对应日文词的简明中文释义；省略 breakdown。
   - 词组/惯用语、文法句型：meaning 为整体引申义与语法含义；detail 说明接续方式与使用语境；
     breakdown 按内部结构逐块拆分（词块 + 中文含义 + 语法功能）。
   - 句子/表达：meaning 必须是自然流畅、可直接使用的完整地道翻译（不要逐字直译）；
     breakdown 必须逐块给出句子成分（日文片段 + 中文含义 + 语法功能），按语序排列并覆盖全句；
     detail 概括语气、时态与使用场景，并点出 1~2 个关键语法点；请省略 pitch 与 level。

【硬性约束】
- "word" 必须是地道的【日文表达】（标准日文汉字或假名），绝不能原样输出中文词句。
- "word" 必须自带注音：所有类型（单词 / 词组 / 句型 / 句子）都用本软件统一语法 {汉字[读音]} 标注汉字读音。
  例："word": "{疲[つか]}れる"、"{図書館[としょかん]}で{本[ほん]}を{読[よ]}みます"。
  * 一个花括号只圈【一个词】里的汉字部分，严禁把跨助词的一整串圈进同一块；
  * 送假名（れる / ます / しい 等）与助词（は/が/を/に/で/と/へ/も/の 等）一律写在花括号【外】，直接写原文；
  * 纯假名词与片假名外来语（如 コーヒー、これ）不圈块，直接写原文——它们所见即所读，注音会被系统丢弃；
  * 块内读音必须只是所圈汉字的真实读音，不含送假名（{読[よ]}みます 而非 {読みます[よみます]}）；
  * 【务必圈全】本软件直接由花括号反推整段读音，故每一个汉字都必须圈注，漏注即该处读音彻底丢失。
- "originalQuery" 原样填写用户的中文输入「${cleanWord}」。
- breakdown 仅在 phrase / grammar / sentence 时输出，word 时请省略该字段。
- 严格输出标准 JSON，禁止任何 Markdown 代码块包裹或任何解释文字：
{
  "queryType": "word | phrase | grammar | sentence",
  "word": "带注音的日文表达，汉字用 {汉字[读音]} 标注（如 {疲[つか]}れる）",
  "originalQuery": "${cleanWord}",
  "pitch": 0,
  "pos": "词性或类型（如 名词 / 惯用句 / 语法句型 / 句子表达 等）",
  "level": "JLPT等级（如 N5 / N4 / N3 / N2 / N1 之一；句子请省略）",
  "meaning": "中文释义；若为句子则输出地道完整的对应翻译",
  "breakdown": [
    { "jp": "日文片段（按语序）", "zh": "该片段的中文含义", "role": "语法功能，如 主语/地点状语/谓语" }
  ],
  "detail": "用法搭配、文法接续说明；句子则概括语气时态与使用场景",
  "examples": [
    { "jp": "包含该日文表达的标准经典日文例句", "zh": "地道准确的中文翻译" }
  ]
}`;
  } else {
    prompt = `你是一部权威专业的日语语言智能解析专家与现代日汉双解词典。
请深度解析用户实际选中的日语内容：「${cleanWord}」（假名读音若已知：${reading || '请根据上下文推导'}）。
${contextOptions?.originalQuery ? `注意：用户原始查询片段为「${contextOptions.originalQuery}」。` : ''}
${contextOptions?.sentenceContext ? `所在上下文环境参考（仅用于辅助确定当前词义，禁止替代查询目标）：「${contextOptions.sentenceContext}」` : ''}

核心要求（极其严格）：
0. 【聚焦实际查询内容，严禁过度参考上下文】：用户实际查询与选中的唯一目标是「${cleanWord}」，你必须严格且仅针对该选定内容本身进行词典解析！严禁喧宾夺主地将外部未选中的整句翻译或整句含义作为释义（meaning），绝不要越界发散到未选中的上下文！
1. 首先智能判定查询内容的语言范畴（queryType），再按范畴输出【相配的结构与深度】——绝不千篇一律：
   - 单词（word）：独立单个词汇或动词/形容词活用形（如「食べる」「綺麗」「昨日」「美味しそう」）。
     * 若仅为短小单字附带了无意义的单个粘连助词（如「に行」），请剥离助词还原辞书形原型「行く」，并在 detail 中说明「由助词『に』+ 动词『行く』构成」。
     * "word" 输出规范辞书形原型（自带 {汉字[读音]} 注音），"pitch" 给标准声调核（0=平板，1=头高，≥2=中高/尾高），"pos" 给精准词性，"level" 给 JLPT 等级。请省略 breakdown。
   - 词组/惯用语（phrase）：多词构成的固定搭配、连语、惯用句或熟语（如「気がする」「気をつける」「足元を見る」「一目惚れ」）。
     * 【极其重要】：必须保持完整短语词组本身（"word": "${cleanWord}"），绝对不要拆解或强行降维为单个字！"pos" 标「惯用句」「连语」「固定词组」等。
     * "meaning" 给出该词组地道贴切的引申义与核心中文释义。
     * "breakdown" 按内部结构逐块拆分（每个词块给出中文含义与语法角色）。
     * "detail" 剖析该惯用句的字面本义、深层寓意及常见语境。
     * "examples" 提供 2 个体现该短语地道用法的经典例句。
   - 文法句型（grammar）：语法结构、句型或功能接续表达（如「わけではない」「ことになっている」「なければならない」「てたまらない」）。
     * 【极其重要】：必须保持该文法句型本身（"word": "${cleanWord}"），绝不降维为单字！"pos" 标「语法句型」「句型表达」等，"level" 给对应 JLPT 等级。
     * "meaning" 简明准确概括该句型的核心语法含义（如“并不是...；未必...”）。
     * "breakdown" 按「前接成分 + 句型标记」拆出接续结构，role 写明接续要求（如“前接动词普通形”）。
     * "detail" 详细说明：①接续方式；②语气特征与核心用法点拨；③易混淆点。
     * "examples" 提供 2 个生动实用的造句例句。
   - 句子/表达（sentence）：完整主谓或谓语动作的句子、短句或日常交际会话（如「図書館で本を読みます」「天気がいいですね」「お腹が空いた」「マジで？」）。
     * "word" 保持该完整句子原样（逐词注音）；"pos" 标「句子表达」「日常会话句」等。
     * "meaning" 必须是自然流畅、贴切地道的【完整中文翻译】（不要逐字直译、不要只译片段）。
     * "breakdown" 必须逐块拆解句子成分（日文片段 + 中文含义 + role 如 主语/地点状语/宾语/谓语），按语序排列并覆盖全句。
     * "detail" 概括整句语气、时态与使用场景，并点出 1~2 个关键语法点。
     * "examples" 提供 1~2 个相关变体表达或日常对话场景范例。
     * 句子请省略 pitch 与 level 字段。

2. breakdown 仅在 phrase / grammar / sentence 时输出，word 时请省略该字段。
3. "word" 必须自带注音：所有类型（单词 / 词组 / 句型 / 句子）都用软件统一语法 {汉字[读音]} 标注汉字读音。
   例："word": "{疲[つか]}れる"、"{図書館[としょかん]}で{本[ほん]}を{読[よ]}みます"。
   * 一个花括号只圈【一个词】里的汉字部分，严禁把跨助词的一整串圈进同一块；
   * 送假名（れる / ます / しい 等）与助词（は/が/を/に/で/と/へ/も/の 等）一律写在花括号【外】，直接写原文；
   * 纯假名词与片假名外来语（如 コーヒー、これ）不圈块，直接写原文——它们所见即所读，注音会被系统丢弃；
   * 块内读音必须只是所圈汉字的真实读音，不含送假名（{読[よ]}みます 而非 {読みます[よみます]}）。
   * 【务必圈全】本软件直接由花括号反推整段读音，故每一个汉字都必须圈注，漏注即该处读音彻底丢失。
4. 严格输出标准 JSON 格式，禁止任何 Markdown 代码块包裹或解释：
{
  "queryType": "word | phrase | grammar | sentence",
  "word": "规范词条/短语/句型/原句，汉字用 {汉字[读音]} 标注（如 {疲[つか]}れる）",
  "originalQuery": "${contextOptions?.originalQuery || cleanWord}",
  "pitch": 0,
  "pos": "词性或语法分类（如 他动词·一段 / 惯用句 / 语法句型·N2 / 句子表达 等）",
  "level": "JLPT等级（如适用，N5-N1；句子请省略）",
  "meaning": "准确精炼的中文释义；若为句子则输出地道完整的翻译",
  "breakdown": [
    { "jp": "日文片段（按语序）", "zh": "该片段的中文含义", "role": "语法功能，如 主语/地点状语/谓语" }
  ],
  "detail": "用法搭配、文法接续解析；句子则概括语气时态与使用场景",
  "examples": [
    { "jp": "日文例句或变体", "zh": "中文翻译" }
  ]
}`;
  }

  const startTime = Date.now();
  const useLocalGeminiProxy = shouldUseLocalGeminiProxy(finalSettings);
  const endpoint = resolveApiEndpoint(finalSettings);

  try {
    let rawText = '';
    if (useLocalGeminiProxy) {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: finalSettings.model || 'gemini-3.6-flash',
          messages: [{ role: 'user', content: prompt }],
          apiKey: finalSettings.apiKey.trim(),
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      });

      if (!response.ok) return null;
      const result = await response.json();
      if (!result.success || !result.text) return null;
      rawText = result.text;
    } else {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${finalSettings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: finalSettings.model || (finalSettings.provider === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4o-mini'),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });

      if (!response.ok) return null;
      const json = await response.json();
      rawText = json.choices?.[0]?.message?.content || '';
    }

    debugLogger.logGenericTask({
      type: 'dictionary',
      title: `AI 权威查词: ${cleanWord}`,
      provider: finalSettings.provider,
      model: finalSettings.model || (finalSettings.provider === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4o-mini'),
      endpoint,
      prompt,
      rawOutput: rawText,
      status: 'success',
      durationMs: Date.now() - startTime,
    });

    const cleanJson = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return null;
      }
    }

    if (!parsed.meaning || typeof parsed.meaning !== 'string' || parsed.meaning.includes('常用日语词汇')) {
      return null;
    }

    // "word" 自带注音（`{原文[读音]}`）：先还原出纯文本词形，再清洗出规范注音串。
    // 纯文本词形才是词条身份（生词本词形、DICT_BY_WORD key、朗读文本），绝不允许块标记泄漏出去。
    const rawWord = typeof parsed.word === 'string' ? parsed.word.trim() : '';
    const resultWord = (rawWord ? stripAnnotatedBlockMarks(rawWord) : '') || cleanWord;

    // 读音不再要求模型单独输出：注音块本身已完整承载读音，直接反推即可
    //（块内取读音、块外照抄送假名与助词），从根上消灭 word 与 reading 互相矛盾的破绽。
    // 注意用未清洗的 rawWord 反推：清洗会把「无注音价值的块」降级为纯文本，而 コーヒー
    // 这类外来语的读音恰恰就是它自己，不能被清掉。
    const sanitizedWordAnnotated = sanitizeAnnotatedText(rawWord);
    const readingFromBlocks = deriveReadingFromAnnotated(rawWord);
    // 反推结果残留汉字 = 模型漏注（该处读音本就已丢），此时才退回过期契约里的独立 "reading"。
    // 纯假名 / 片假名外来语没有注音块，反推结果即原文——对它们而言原文正是读音本身。
    const resultReading =
      (readingFromBlocks && !/[\u3005\u3400-\u9fff]/.test(readingFromBlocks) ? readingFromBlocks : '') ||
      (typeof parsed.reading === 'string' ? stripAnnotatedBlockMarks(parsed.reading) : '') ||
      reading ||
      resultWord;

    const detectedType =
      parsed.queryType === 'phrase' ||
        parsed.queryType === 'grammar' ||
        parsed.queryType === 'sentence' ||
        parsed.queryType === 'word'
        ? parsed.queryType
        : (cleanWord.length > 8 || /[。！？!?、]/.test(cleanWord)
          ? 'sentence'
          : cleanWord.length > 4 && /[\s\u3000]/.test(cleanWord)
            ? 'phrase'
            : 'word');

    // 成分拆解：仅短语/句型/句子有意义；此处做程序化清洗（丢弃非对象、空片段、超长脏数据）。
    // 片段同样按注音语法收敛：带 `{原文[读音]}` 的保留注音串供界面渲染振假名，其余抹标记只留纯文本。
    const rawBreakdown = Array.isArray(parsed.breakdown) ? parsed.breakdown : [];
    const breakdown = rawBreakdown
      .filter((seg: any) => seg && typeof seg === 'object' && typeof seg.jp === 'string' && seg.jp.trim())
      .slice(0, 12)
      .map((seg: any) => ({
        jp: toRenderableJpField(seg.jp).slice(0, 60),
        zh: typeof seg.zh === 'string' && seg.zh.trim() ? seg.zh.trim().slice(0, 120) : undefined,
        role: typeof seg.role === 'string' && seg.role.trim() ? seg.role.trim().slice(0, 24) : undefined,
      }))
      .filter((seg: any) => !!seg.jp);

    // 例句同理：AI 常顺手把例句也写成注音语法，必须在此收敛，否则标记会裸露在词典小窗里
    const rawExamples = Array.isArray(parsed.examples) ? parsed.examples : [];
    const examples = rawExamples
      .filter((ex: any) => ex && typeof ex === 'object' && typeof ex.jp === 'string' && ex.jp.trim())
      .slice(0, 4)
      .map((ex: any) => ({
        jp: toRenderableJpField(ex.jp).slice(0, 160),
        zh: typeof ex.zh === 'string' ? ex.zh.trim().slice(0, 200) : '',
      }))
      .filter((ex: any) => !!ex.jp);

    const isWordLike = detectedType === 'word';
    const isSentence = detectedType === 'sentence';

    // 注音串（`{原文[读音]}`）：现在由 "word" 自己携带——单词类型同样需要，
    // 词头可直接渲染 AI 给出的权威振假名，不再依赖 splitStemAndOkurigana 猜测汉字/送假名边界。
    // 兼容旧契约：老缓存或旧模型可能仍把注音放在独立的 "annotated" 字段。
    const sanitizedAnnotated = sanitizedWordAnnotated ?? sanitizeAnnotatedText(parsed.annotated);
    // 比对前先剥掉 [读音] 内容，只留下"宿主原文"，再抹去花括号与标点等装饰字符；
    // 注音串与纯文本词形必须实质一致，否则视为模型串台/漏词，整条丢弃让界面退化兜底。
    const coreChars = (s: string) =>
      s
        .replace(/\[[^\]]*\]/g, '')
        .replace(/[^\u3005\u3040-\u30ff\u3400-\u9fff\uff66-\uff9fa-zA-Z]/g, '');
    const annotated =
      sanitizedAnnotated && coreChars(sanitizedAnnotated) === coreChars(resultWord)
        ? sanitizedAnnotated
        : undefined;

    return {
      word: resultWord,
      lemma: parsed.lemma?.trim() || undefined,
      reading: resultReading,
      originalQuery: parsed.originalQuery || (isChineseQuery ? cleanWord : undefined),
      pos: parsed.pos || (isSentence ? '句子表达' : detectedType === 'grammar' ? '语法句型' : detectedType === 'phrase' ? '惯用表达' : '日语词汇'),
      // 声调仅对单个单词有意义：短语/句型/句子一律剥离，避免界面出现无意义的“0调”标签
      pitch: isWordLike ? (typeof parsed.pitch === 'number' ? parsed.pitch : 0) : undefined,
      // 句子不存在 JLPT 等级；其余类型以模型返回为准，不再凭空兜底 N4
      level: isSentence ? undefined : (parsed.level || (isWordLike ? 'N4' : undefined)),
      meaning: parsed.meaning.trim(),
      detail: parsed.detail || '',
      breakdown: !isWordLike && breakdown.length > 0 ? breakdown : undefined,
      annotated,
      examples: examples.length > 0 ? examples : undefined,
      queryType: detectedType,
    };
  } catch (err: any) {
    debugLogger.logGenericTask({
      type: 'dictionary',
      title: `AI 查词异常: ${cleanWord}`,
      provider: finalSettings.provider,
      model: finalSettings.model || 'default',
      endpoint,
      prompt,
      rawOutput: '',
      status: 'error',
      errorMessage: err?.message || String(err),
      durationMs: Date.now() - startTime,
    });
    return null;
  }
}

/**
 * 实时通过 AI 权威生成精准日语语法与句型释义（当离线规则或词库未命中时的自愈赋能方案）
 */
export async function queryGrammarExplanationFromLLM(
  grammarTitle: string,
  context?: string,
  customSettings?: ApiSettings
): Promise<{
  title: string;
  structure: string;
  meaning: string;
  explanation: string;
  level: string;
  exampleJp?: string;
  exampleCn?: string;
} | null> {
  const cleanTitle = grammarTitle.replace(/[【】「」『』]/g, '').trim();
  if (!cleanTitle) return null;

  let effectiveSettings: ApiSettings | undefined = customSettings;
  if (!effectiveSettings) {
    try {
      const stored = localStorage.getItem('agy_jp_settings_v1');
      if (stored) {
        effectiveSettings = JSON.parse(stored);
      }
    } catch {
      // Ignore
    }
  }

  // 如果没有有效的 API Key，直接返回 null（使用本地语法库）
  if (!effectiveSettings || !effectiveSettings.apiKey || effectiveSettings.apiKey.trim() === '') {
    return null;
  }

  const finalSettings = effectiveSettings;

  const prompt = `你是一部权威专业的日语语法辞书（如《日本语句型辞典》）。请为语法句型「${cleanTitle}」${context ? `（参考上下文例句：${context}）` : ''}生成详实、地道、专业的语法条目。
要求：
1. 严禁出现“常用语法句型”、“特定语法用法”、“特色接续句型”等模糊套话！
2. 给出规范的接续公式（例如：场所名词 + で + 生まれました）、核心中文释义、详实的用法点拨与语感解析、JLPT等级（N5/N4/N3/N2/N1）及双语例句。
3. 严格输出标准 JSON，禁止任何 Markdown 代码块包裹或任何解释文字：
{
  "title": "${cleanTitle}",
  "structure": "规范接续公式",
  "meaning": "准确精炼的中文核心释义",
  "explanation": "深入浅出的用法辨析、语感要点与搭配点拨",
  "level": "N5",
  "exampleJp": "地道自然的经典日文例句（带平假名振假名标注，如 私[わたし]は東京[とうきょう]で 生[う]まれました。）",
  "exampleCn": "地道准确的中文翻译"
}`;

  const useLocalGeminiProxy = shouldUseLocalGeminiProxy(finalSettings);
  const endpoint = resolveApiEndpoint(finalSettings);

  try {
    let rawText = '';
    if (useLocalGeminiProxy) {
      // 仅在 PC 本地开发环境走本地代理，避免 Clash 隧道用户直连 Google 失败
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: finalSettings.model || 'gemini-3.6-flash',
          messages: [{ role: 'user', content: prompt }],
          apiKey: finalSettings.apiKey.trim(),
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      });

      if (!response.ok) return null;
      const result = await response.json();
      if (!result.success || !result.text) return null;
      rawText = result.text;
    } else {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${finalSettings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: finalSettings.model || (finalSettings.provider === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4o-mini'),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });

      if (!response.ok) return null;
      const json = await response.json();
      rawText = json.choices?.[0]?.message?.content || '';
    }

    const cleanJson = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleanJson);
    if (!parsed.meaning || typeof parsed.meaning !== 'string' || parsed.meaning.includes('常用语法句型') || parsed.meaning.includes('特定语法')) {
      return null;
    }

    return {
      title: parsed.title || cleanTitle,
      structure: parsed.structure || `名词/动词 + ${cleanTitle}`,
      meaning: parsed.meaning.trim(),
      explanation: parsed.explanation || '',
      level: parsed.level || 'N5',
      exampleJp: parsed.exampleJp,
      exampleCn: parsed.exampleCn,
    };
  } catch {
    return null;
  }
}

