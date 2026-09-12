import { ApiSettings, ChatMessage, ChatSession, StudyMode, UserLearningProfile, RoleplayScenario, LearningPlan, LearnedWord, LearnedGrammar } from '../types';
import { buildSystemPrompt, isDebugQuery, optimizeMessagesContext } from './tokenOptimizer';
import { sanitizeActionDescriptions, detectQueryLanguage } from '../utils/languageDetector';
import { countTokens } from '../utils/tokenCounter';
import { debugLogger } from './debugLogger';

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  /** true 表示该数据为本地估算兜底（API 未返回 usage），false 表示来自 API 真实 usage */
  estimated: boolean;
}

export interface StreamCallback {
  onChunk: (delta: string) => void;
  onDone: (fullText: string, tokensUsed: TokenUsage) => void;
  onError: (error: Error) => void;
  // 暴露本次请求的 AbortController，供外部「停止生成」按钮真正中止请求
  onControllerReady?: (controller: AbortController) => void;
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

你好！我是你的专属 AI 日语私教 **${tutorName}** 🌸。

当前系统检测到你**尚未配置有效的 ${currentProvider} API Key**，因此 AI 处于**离线待机模式**，无法实时调用大模型为你进行智能思考与个性化回复。

---
### 🛠️ 怎么接入 API 开启完整智能私教互动？
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

    const isGemini = settings.provider === 'gemini';
    const endpoint = isGemini
      ? '/api/gemini'
      : settings.baseUrl.endsWith('/')
        ? `${settings.baseUrl}chat/completions`
        : `${settings.baseUrl}/chat/completions`;

    const requestPayload = isGemini
      ? {
        model: settings.model || 'gemini-3.6-flash',
        messages: optimized.messages,
        systemInstruction: optimized.systemPrompt,
      }
      : {
        model: settings.model,
        messages: optimized.messages,
        temperature: settings.temperature,
        stream: true,
        stream_options: { include_usage: true },
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

    // Gemini provider: use high-speed local proxy with Clash tunnel support
    if (isGemini) {
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          try {
            const data = JSON.parse(trimmed.replace('data: ', ''));
            // 兼容不同厂商返回 usage 的位置：顶层 data.usage 或 data.choices[0].usage
            if (data.usage) {
              streamUsage = data.usage;
            } else if (data.choices?.[0]?.usage) {
              streamUsage = data.choices[0].usage;
            }
            const content = data.choices?.[0]?.delta?.content || '';
            if (content) {
              accumulatedText += content;
              debugLogger.appendChunk(activeRequestId, content);
              callbacks.onChunk(content);
            }
          } catch {
            // Ignore parse errors on partial frames
          }
        }
      }
    }

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
      debugLogger.errorChatRequest(activeRequestId, err?.message || String(err));
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
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
  const isGemini = settings.provider === 'gemini';
  const endpoint = isGemini
    ? '/api/gemini'
    : settings.baseUrl.endsWith('/')
      ? `${settings.baseUrl}chat/completions`
      : `${settings.baseUrl}/chat/completions`;

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
    if (isGemini) {
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
          model: settings.model,
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
      model: settings.model || (isGemini ? 'gemini-3.6-flash' : 'gpt-4o-mini'),
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
 * 清洗并校验 AI 返回的逐词注音串（短语/句型/整句标题专用）。
 *
 * 软件统一注音语法：`{原文[读音]}` —— 花括号圈定注音作用的原文范围，方括号内为该段读音。
 * 此处做程序化兜底（不依赖模型自觉）：
 * 1. 剥除 Markdown 代码块围栏与换行，保持单行（标题排版需要）；
 * 2. 逐块重写为规范形式 `{原文[读音]}`；
 * 3. 纯假名 / 片假名外来语（无汉字）一律丢弃注音块只留原文——所见即所读，注音只会干扰排版；
 * 4. 读音与原文相同时同样降级为纯文本；
 * 5. 残留的不成对花括号直接剥除，避免渲染层泄漏系统标记。
 * 若清洗后不含任何有效注音块，则返回 undefined（调用方退化为"原文 + 独立读音行"）。
 */
export function sanitizeAnnotatedText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const src = raw.replace(/```[a-zA-Z]*/g, '').replace(/[\r\n]+/g, '').trim();
  if (!src) return undefined;

  const blockRe = /\{\s*([^{}[\]]+?)\s*\[\s*([^\]{}]+?)\s*\]\s*\}/g;
  let out = '';
  let cursor = 0;
  let hasValidBlock = false;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(src)) !== null) {
    // 块外的裸花括号一律剥除（系统的宿主边界标记绝不能泄漏到界面）
    out += src.slice(cursor, m.index).replace(/[{}｛｝]/g, '');
    const host = m[1].trim();
    const reading = m[2].trim();
    // 纯假名 / 片假名外来语（无汉字）与"读音即原文"的块没有注音价值：降级为纯文本
    const keep = !!host && !!reading && /[一-龯々〆]/.test(host) && reading !== host;
    out += keep ? `{${host}[${reading}]}` : host;
    if (keep) hasValidBlock = true;
    cursor = m.index + m[0].length;
  }
  out += src.slice(cursor).replace(/[{}｛｝]/g, '');
  out = out.trim();

  // 清洗后必须至少留下一个有效注音块，否则调用方退化为"原文 + 独立读音行"
  if (!hasValidBlock || !out || out.length > 400) return undefined;
  return out;
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
  /** 逐词注音串（软件统一 `{原文[读音]}` 语法），仅 phrase / grammar / sentence 返回 */
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
${contextOptions?.sentenceContext ? `所在上下文环境：「${contextOptions.sentenceContext}」` : ''}

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
- "reading" 必须是该日文表达对应的纯平假名读音（整句请给出全句假名朗读）。
- "originalQuery" 原样填写用户的中文输入「${cleanWord}」。
- breakdown 仅在 phrase / grammar / sentence 时输出，word 时请省略该字段。
- 仅 phrase / grammar / sentence 额外输出 "annotated"：把上面的日文表达按【词】逐词标注读音，格式为 {原文[读音]}（例：{図書館[としょかん]}で{本[ほん]}を{読[よ]}みます）。
  * 一个花括号只圈【一个词】，严禁把跨助词的一整串圈进同一块；
  * 助词（は/が/を/に/で/と/へ/も/の 等）一律不圈、直接写原文；
  * 纯假名词与片假名外来语（如 コーヒー、これ）不圈块，直接写原文——它们所见即所读，注音会被系统丢弃；
  * 块内读音必须只是所圈汉字的真实读音，不含送假名（{読[よ]}みます 而非 {読みます[よみます]}）。
- 严格输出标准 JSON，禁止任何 Markdown 代码块包裹或任何解释文字：
{
  "queryType": "word | phrase | grammar | sentence",
  "word": "转换后的地道日文表达（必须为日文，绝不能保留中文原词）",
  "reading": "该日文表达的平假名读音（整句为全句假名）",
  "annotated": "仅 phrase/grammar/sentence：逐词注音串，格式 {原文[读音]}；word 请省略此字段",
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
请深度解析用户划选查询的日语内容：「${cleanWord}」（假名读音若已知：${reading || '请根据上下文推导'}）。
${contextOptions?.originalQuery ? `注意：用户原始查询片段为「${contextOptions.originalQuery}」。` : ''}
${contextOptions?.sentenceContext ? `所在上下文完整句子：「${contextOptions.sentenceContext}」` : ''}

核心要求（极其严格）：
1. 首先智能判定查询内容的语言范畴（queryType），再按范畴输出【相配的结构与深度】——绝不千篇一律：
   - 单词（word）：独立单个词汇或动词/形容词活用形（如「食べる」「綺麗」「昨日」「美味しそう」）。
     * 若仅为短小单字附带了无意义的单个粘连助词（如「に行」），请剥离助词还原辞书形原型「行く」，并在 detail 中说明「由助词『に』+ 动词『行く』构成」。
     * "word" 输出规范辞书形原型，"reading" 填平假名，"pitch" 给标准声调核（0=平板，1=头高，≥2=中高/尾高），"pos" 给精准词性，"level" 给 JLPT 等级。请省略 breakdown。
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
     * "word" 保持该完整句子原样；"reading" 填写该句子的全假名朗读注音；"pos" 标「句子表达」「日常会话句」等。
     * "meaning" 必须是自然流畅、贴切地道的【完整中文翻译】（不要逐字直译、不要只译片段）。
     * "breakdown" 必须逐块拆解句子成分（日文片段 + 中文含义 + role 如 主语/地点状语/宾语/谓语），按语序排列并覆盖全句。
     * "detail" 概括整句语气、时态与使用场景，并点出 1~2 个关键语法点。
     * "examples" 提供 1~2 个相关变体表达或日常对话场景范例。
     * 句子请省略 pitch 与 level 字段。

2. breakdown 仅在 phrase / grammar / sentence 时输出，word 时请省略该字段。
3. 仅 phrase / grammar / sentence 额外输出 "annotated"：把上述日文表达按【词】逐词标注读音，格式为 {原文[读音]}（例：{図書館[としょかん]}で{本[ほん]}を{読[よ]}みます）。
   * 一个花括号只圈【一个词】，严禁把跨助词的一整串圈进同一块；助词（は/が/を/に/で/と/へ/も/の 等）一律不圈、直接写原文；
   * 纯假名词与片假名外来语（如 コーヒー、これ）不圈块，直接写原文——它们所见即所读，注音会被系统丢弃；
   * 块内读音必须只是所圈汉字的真实读音，不含送假名（{読[よ]}みます 而非 {読みます[よみます]}）。
4. 严格输出标准 JSON 格式，禁止任何 Markdown 代码块包裹或解释：
{
  "queryType": "word | phrase | grammar | sentence",
  "word": "规范词条/短语/句型/原句",
  "reading": "对应的假名注音读音（整句为全句假名）",
  "annotated": "仅 phrase/grammar/sentence：逐词注音串，格式 {原文[读音]}；word 请省略此字段",
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
  const isGemini = finalSettings.provider === 'gemini';
  const endpoint = isGemini
    ? '/api/gemini'
    : finalSettings.baseUrl.endsWith('/')
      ? `${finalSettings.baseUrl}chat/completions`
      : `${finalSettings.baseUrl}/chat/completions`;

  try {
    let rawText = '';
    if (isGemini) {
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
          model: finalSettings.model || 'gpt-4o-mini',
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
      model: finalSettings.model || (isGemini ? 'gemini-3.6-flash' : 'gpt-4o-mini'),
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

    const resultWord = parsed.word?.trim() || cleanWord;
    const resultReading = parsed.reading?.trim() || reading || resultWord;

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

    // 成分拆解：仅短语/句型/句子有意义；此处做程序化清洗（丢弃非对象、空片段、超长脏数据）
    const rawBreakdown = Array.isArray(parsed.breakdown) ? parsed.breakdown : [];
    const breakdown = rawBreakdown
      .filter((seg: any) => seg && typeof seg === 'object' && typeof seg.jp === 'string' && seg.jp.trim())
      .slice(0, 12)
      .map((seg: any) => ({
        jp: seg.jp.trim().slice(0, 60),
        zh: typeof seg.zh === 'string' && seg.zh.trim() ? seg.zh.trim().slice(0, 120) : undefined,
        role: typeof seg.role === 'string' && seg.role.trim() ? seg.role.trim().slice(0, 24) : undefined,
      }));

    const isWordLike = detectedType === 'word';
    const isSentence = detectedType === 'sentence';

    // 逐词注音串（{原文[读音]}）：仅短语/句型/整句有意义。
    // 清洗后还需与正文做一致性校验——注音串剥掉标记后必须与正文实质一致，
    // 否则视为模型串台/漏词，直接丢弃，让界面退化为"原文 + 独立读音行"。
    const sanitizedAnnotated = isWordLike ? undefined : sanitizeAnnotatedText(parsed.annotated);
    // 比对前先剥掉 [读音] 内容，只留下"宿主原文"，再抹去花括号与标点等装饰字符
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
      examples: Array.isArray(parsed.examples) ? parsed.examples : undefined,
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

  try {
    let rawText = '';
    if (finalSettings.provider === 'gemini') {
      // 统一走本地代理，避免 Clash 隧道用户直连 Google 失败，行为与查词/会话一致
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
      const endpoint = `${finalSettings.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${finalSettings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: finalSettings.model || 'gpt-4o-mini',
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

