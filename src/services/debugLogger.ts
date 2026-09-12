import { ApiSettings, ChatMessage, LearnedGrammar, LearnedWord, RoleplayScenario, StudyMode, UserLearningProfile } from '../types';
import { countTokens } from '../utils/tokenCounter';

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  timeStr: string;
  type: 'chat' | 'dictionary' | 'plan';
  typeLabel: string;
  title: string;
  mode?: StudyMode;
  modeLabel?: string;
  scenarioTitle?: string;
  status: 'streaming' | 'success' | 'error';
  errorMessage?: string;

  // Timing metrics
  startTime: number;
  timeToFirstTokenMs?: number;
  endTime?: number;
  durationMs?: number;

  // AI & Request Parameters
  provider: string;
  model: string;
  endpoint: string;
  temperature?: number;
  stream: boolean;

  // Prompts & Context
  systemPrompt: string;
  systemPromptTokens?: number;
  systemPromptCharCount: number;
  rawMessagesCount: number;
  optimizedMessages: Array<{ role: string; content: string }>;
  messagesTokens?: number;

  // Output
  rawOutput: string;
  sanitizedOutput?: string;
  chunkCount: number;

  // Token Stats（prompt/completion/total 为本次请求最终用量；estimated 标记其是否来自 API 真实 usage）
  tokens: {
    prompt: number;
    completion: number;
    total: number;
    estimated: boolean;
  };

  // Runtime State Snapshot
  stateSnapshot?: {
    userLevel: string;
    userName: string;
    tutorName: string;
    userWeakPoints: string[];
    learnedWordsCount: {
      learning: number;
      reviewing: number;
      mastered: number;
      total: number;
    };
    learnedGrammarCount: number;
    totalSessionsCount: number;
  };

  // Raw Payload sent
  rawRequestBody?: any;
}

const STORAGE_KEY = 'shiori_debug_logs_v1';
const CHANNEL_NAME = 'shiori_debug_bus_v1';
const MAX_LOGS = 50;

class DebugLoggerService {
  private logs: DebugLogEntry[] = [];
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(logs: DebugLogEntry[]) => void> = new Set();

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          this.handleBroadcastMessage(event.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel initialization failed, falling back to storage sync', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            this.logs = JSON.parse(e.newValue);
            this.notifyListeners();
          } catch {
            // Ignore parse errors
          }
        }
      });
    }
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch {
      this.logs = [];
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      // Keep only the most recent MAX_LOGS entries
      const slice = this.logs.slice(0, MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
    } catch (e) {
      console.warn('Failed to save debug logs to localStorage', e);
    }
  }

  private broadcast(action: string, payload: any) {
    if (this.channel) {
      try {
        this.channel.postMessage({ action, payload });
      } catch (err) {
        console.warn('Broadcast error:', err);
      }
    }
  }

  private handleBroadcastMessage(data: { action: string; payload: any }) {
    if (!data || !data.action) return;

    if (data.action === 'CREATE_LOG') {
      const entry: DebugLogEntry = data.payload;
      const idx = this.logs.findIndex((l) => l.id === entry.id);
      if (idx === -1) {
        this.logs = [entry, ...this.logs].slice(0, MAX_LOGS);
      } else {
        this.logs[idx] = entry;
      }
      this.notifyListeners();
    } else if (data.action === 'UPDATE_LOG') {
      const entry: DebugLogEntry = data.payload;
      const idx = this.logs.findIndex((l) => l.id === entry.id);
      if (idx !== -1) {
        this.logs[idx] = { ...this.logs[idx], ...entry };
      } else {
        this.logs = [entry, ...this.logs].slice(0, MAX_LOGS);
      }
      this.notifyListeners();
    } else if (data.action === 'REMOVE_LOG') {
      const targetId: string = data.payload?.id;
      if (targetId) {
        this.logs = this.logs.filter((l) => l.id !== targetId);
        this.notifyListeners();
      }
    } else if (data.action === 'CLEAR_LOGS') {
      this.logs = [];
      this.notifyListeners();
    }
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.logs);
    }
  }

  public subscribe(callback: (logs: DebugLogEntry[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.logs);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public getLogs(): DebugLogEntry[] {
    return this.logs;
  }

  public clearLogs() {
    this.logs = [];
    this.saveToStorage();
    this.broadcast('CLEAR_LOGS', null);
    this.notifyListeners();
  }

  /** 删除单条调试记录，并通过广播通道同步到其它已打开的调试窗口 */
  public removeLog(id: string) {
    const next = this.logs.filter((l) => l.id !== id);
    if (next.length === this.logs.length) return;
    this.logs = next;
    this.saveToStorage();
    this.broadcast('REMOVE_LOG', { id });
    this.notifyListeners();
  }

  public getLogById(id: string): DebugLogEntry | undefined {
    return this.logs.find((l) => l.id === id);
  }

  public startChatRequest(params: {
    id: string;
    mode: StudyMode;
    scenario?: RoleplayScenario;
    profile: UserLearningProfile;
    settings: ApiSettings;
    systemPrompt: string;
    rawMessages: ChatMessage[];
    optimizedMessages: Array<{ role: string; content: string }>;
    estimatedPromptTokens: number;
    endpoint: string;
    learnedKnowledge?: { words: LearnedWord[]; grammar: LearnedGrammar[] };
    totalSessionsCount?: number;
    rawRequestBody?: any;
  }): DebugLogEntry {
    const now = Date.now();
    const d = new Date(now);
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;

    const modeLabels: Record<StudyMode, string> = {
      tutor: '自适应私教教学',
      roleplay: '情景沉浸演练',
      correction: '语法纠错与润色',
      assessment: '水平自测与评估',
      kana: '五十音启蒙互动',
    };

    const words = params.learnedKnowledge?.words || [];
    const grammar = params.learnedKnowledge?.grammar || [];

    const entry: DebugLogEntry = {
      id: params.id,
      timestamp: now,
      timeStr,
      type: 'chat',
      typeLabel: '私教流式对话',
      title: params.mode === 'roleplay' && params.scenario ? `情景演练: ${params.scenario.title}` : modeLabels[params.mode] || '智能私教对话',
      mode: params.mode,
      modeLabel: modeLabels[params.mode] || params.mode,
      scenarioTitle: params.scenario?.title,
      status: 'streaming',
      startTime: now,

      provider: params.settings.provider,
      model: params.settings.model || (params.settings.provider === 'gemini' ? 'gemini-3.6-flash' : 'default-model'),
      endpoint: params.endpoint,
      temperature: params.settings.temperature,
      stream: true,

      systemPrompt: params.systemPrompt,
      systemPromptCharCount: params.systemPrompt.length,
      systemPromptTokens: countTokens(params.systemPrompt),
      rawMessagesCount: params.rawMessages.length,
      optimizedMessages: params.optimizedMessages,
      messagesTokens: params.estimatedPromptTokens,

      rawOutput: '',
      chunkCount: 0,

      tokens: {
        prompt: params.estimatedPromptTokens,
        completion: 0,
        total: params.estimatedPromptTokens,
        estimated: true,
      },

      stateSnapshot: {
        userLevel: params.profile.level,
        userName: params.settings.userName || '学习者',
        tutorName: params.settings.aiTutorName || '栞 (Shiori)',
        userWeakPoints: params.profile.weakPoints || [],
        learnedWordsCount: {
          learning: words.filter((w) => w.mastery === 'learning').length,
          reviewing: words.filter((w) => w.mastery === 'reviewing').length,
          mastered: words.filter((w) => w.mastery === 'mastered').length,
          total: words.length,
        },
        learnedGrammarCount: grammar.length,
        totalSessionsCount: params.totalSessionsCount || 1,
      },

      rawRequestBody: params.rawRequestBody,
    };

    this.logs = [entry, ...this.logs.filter((l) => l.id !== entry.id)].slice(0, MAX_LOGS);
    this.saveToStorage();
    this.broadcast('CREATE_LOG', entry);
    this.notifyListeners();

    return entry;
  }

  public appendChunk(id: string, delta: string) {
    const entry = this.logs.find((l) => l.id === id);
    if (!entry) return;

    const now = Date.now();
    if (!entry.timeToFirstTokenMs) {
      entry.timeToFirstTokenMs = now - entry.startTime;
    }

    entry.rawOutput += delta;
    entry.chunkCount += 1;

    // Update in memory and broadcast throttled
    this.broadcast('UPDATE_LOG', entry);
    this.notifyListeners();
  }

  public completeChatRequest(
    id: string,
    params: {
      sanitizedText: string;
      tokens: { prompt: number; completion: number; total: number; estimated: boolean };
    }
  ) {
    const entry = this.logs.find((l) => l.id === id);
    if (!entry) return;

    const now = Date.now();
    entry.endTime = now;
    entry.durationMs = now - entry.startTime;
    entry.status = 'success';
    entry.sanitizedOutput = params.sanitizedText;
    if (!entry.rawOutput) {
      entry.rawOutput = params.sanitizedText;
    }

    entry.tokens = {
      prompt: params.tokens.prompt,
      completion: params.tokens.completion,
      total: params.tokens.total,
      estimated: params.tokens.estimated,
    };

    this.saveToStorage();
    this.broadcast('UPDATE_LOG', entry);
    this.notifyListeners();
  }

  public errorChatRequest(id: string, errorMessage: string) {
    const entry = this.logs.find((l) => l.id === id);
    if (!entry) return;

    const now = Date.now();
    entry.endTime = now;
    entry.durationMs = now - entry.startTime;
    entry.status = 'error';
    entry.errorMessage = errorMessage;

    this.saveToStorage();
    this.broadcast('UPDATE_LOG', entry);
    this.notifyListeners();
  }

  public logGenericTask(params: {
    type: 'dictionary' | 'plan';
    title: string;
    provider: string;
    model: string;
    endpoint: string;
    prompt: string;
    rawOutput: string;
    sanitizedOutput?: string;
    status: 'success' | 'error';
    errorMessage?: string;
    durationMs: number;
    tokens?: { prompt: number; completion: number; total: number; estimated?: boolean };
    rawRequestBody?: any;
  }) {
    const now = Date.now();
    const d = new Date(now);
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;

    const promptTokens = params.tokens?.prompt ?? countTokens(params.prompt);
    const completionTokens = params.tokens?.completion ?? countTokens(params.rawOutput);
    const totalTokens = params.tokens?.total ?? (promptTokens + completionTokens);

    const entry: DebugLogEntry = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      timeStr,
      type: params.type,
      typeLabel: params.type === 'dictionary' ? 'AI 权威词典查词' : '动态学情计划规划',
      title: params.title,
      status: params.status,
      errorMessage: params.errorMessage,
      startTime: now - params.durationMs,
      endTime: now,
      durationMs: params.durationMs,

      provider: params.provider,
      model: params.model,
      endpoint: params.endpoint,
      stream: false,

      systemPrompt: params.prompt,
      systemPromptCharCount: params.prompt.length,
      systemPromptTokens: promptTokens,
      rawMessagesCount: 1,
      optimizedMessages: [{ role: 'user', content: params.prompt }],
      messagesTokens: promptTokens,

      rawOutput: params.rawOutput,
      sanitizedOutput: params.sanitizedOutput || params.rawOutput,
      chunkCount: 1,

      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        total: totalTokens,
        estimated: params.tokens?.estimated ?? true,
      },

      rawRequestBody: params.rawRequestBody,
    };

    this.logs = [entry, ...this.logs].slice(0, MAX_LOGS);
    this.saveToStorage();
    this.broadcast('CREATE_LOG', entry);
    this.notifyListeners();
  }
}

export const debugLogger = new DebugLoggerService();
