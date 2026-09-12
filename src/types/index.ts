export type UserLevel = 'N0' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export type StudyMode = 'tutor' | 'roleplay' | 'correction' | 'assessment' | 'kana';

export type FuriganaMode = 'always' | 'hover' | 'hidden';

export type PitchDisplayMode = 'badge' | 'curve' | 'none';

export type CrossSessionMemoryMode = 'standard' | 'deep' | 'off';

export interface UserLearningProfile {
  level: UserLevel;
  levelLabel: string; // e.g. "零基础·五十音启蒙" or "初级进阶 N4"
  estimatedVocab: number;
  streakDays: number;
  lastStudied: string;
  masteredGrammar: string[];
  weakPoints: string[];
  targetGoals: string[];
  interests: string[]; // e.g. 'anime', 'travel', 'business', 'daily', 'exam'
  notesForAI: string; // Dynamic AI memory
}

export interface DailyTask {
  id: string;
  title: string;
  type: 'dialogue' | 'grammar' | 'kana' | 'vocab';
  target: string;
  completed: boolean;
}

export interface LearningPlan {
  currentStage: string;
  todayGoal: string;
  weeklyProgress: number; // 0 - 100
  tasks: DailyTask[];
  suggestedTopics: string[];
  grammarFocus: string[];
  lastUpdated: string;
}

export interface ParsedRubyToken {
  type: 'text' | 'ruby';
  surface: string; // Kanji or word surface
  reading?: string; // Hiragana reading
  pitch?: string; // e.g. '0', '1', '2', '3', etc.
  pitchType?: '平板' | '头高' | '中高' | '尾高';
}

export interface MessageCorrection {
  original: string;
  corrected: string;
  explanation: string;
  betterExpression?: string;
  grammarPoint?: string;
}

/**
 * 对话中自动收录到的语法点引用，挂在 AI 消息上用于在气泡旁给出轻量提示。
 * isNew 为 true 表示本次是首次收录，false 表示此前已在学情档案中。
 */
export interface CollectedGrammarRef {
  title: string;
  level?: string;
  isNew: boolean;
}

/**
 * 对话中自动收录到生词本的单词引用，挂在 AI 消息上用于在气泡旁给出轻量提示。
 * 只在「该词首次进入生词本」时才记录——已收录词在对话中再次出现属于日常复习，
 * 若每次都提示会变成噪音（几乎每条日文回复都会命中若干已学词）。
 */
export interface CollectedWordRef {
  surface: string;
  reading?: string;
  level?: string;
  pos?: string;
}

/** 学情档案弹窗的三个页签，供对话区提示条点击后直接跳转 */
export type KnowledgeTab = 'vocab' | 'grammar' | 'favorites';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // Raw markdown/text
  timestamp: number;
  mode: StudyMode;
  scenarioId?: string;
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
    estimated?: boolean; // true 表示该数据为本地估算兜底，false/缺省表示来自 API 真实 usage
  };
  correction?: MessageCorrection;
  /** 本轮私教讲解中被自动收录进学情档案的语法点（用于气泡旁的"已收录"提示） */
  collectedGrammar?: CollectedGrammarRef[];
  /** 本轮首次进入生词本的单词（仅新词，用于气泡旁的"已收录新词"提示） */
  collectedWords?: CollectedWordRef[];
  isDebug?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  subtitle?: string; // 话题副标题（如：“笨蛋·测验·召唤兽”）
  subtitleTopics?: string[]; // 提炼出的3个关键词数组
  hasCustomTitle?: boolean; // 是否被用户手动修改过标题
  hasCustomSubtitle?: boolean; // 是否被用户手动修改过副标题
  createdAt: number;
  updatedAt: number;
  mode: StudyMode;
  scenarioId?: string;
  messages: ChatMessage[];
  summary?: string;
}

export interface LearnedWord {
  id: string;
  surface: string;
  reading: string;
  pitch?: number;
  meaning: string;
  mastery: 'learning' | 'reviewing' | 'mastered';
  reviewCount: number;
  learnedAt: number;
  lastReviewedAt?: number;
  exampleJp?: string;
  exampleCn?: string;
  pos?: string;
  level?: string;
  detail?: string;
  source?: string;
}

export interface LearnedGrammar {
  id: string;
  title: string;
  structure: string;
  meaning: string;
  explanation?: string;
  level?: string;
  mastery: 'learning' | 'reviewing' | 'mastered';
  reviewCount: number;
  learnedAt: number;
  lastReviewedAt?: number;
  exampleJp?: string;
  exampleCn?: string;
  source?: string;
}

/**
 * 手动收藏的表达（短语 / 句型 / 整句）。
 * 与生词本刻意分离：句子与短语不属于"词汇"，绝不能混进生词本，
 * 否则会污染学情注入、AI 测验与注音词库。此集合仅由用户在词典小窗主动点击「收藏」触发。
 */
export interface FavoriteExpression {
  id: string;
  /** 收藏的日文原文（短语 / 句型 / 整句） */
  text: string;
  /** 整段假名读音 */
  reading?: string;
  /** 逐词注音串，软件统一 `{原文[读音]}` 语法，供渲染振假名 */
  annotated?: string;
  /** 中文释义 / 地道翻译 */
  meaning: string;
  /** 结构拆解或用法点拨 */
  detail?: string;
  /** 成分拆解（日文片段 + 中文含义 + 语法功能） */
  breakdown?: Array<{ jp: string; zh?: string; role?: string }>;
  pos?: string;
  level?: string;
  examples?: Array<{ jp: string; zh: string }>;
  /** 语义类型：词组 / 句型 / 句子 */
  kind: 'phrase' | 'grammar' | 'sentence';
  source?: string;
  createdAt: number;
}

export interface ScenarioGoal {
  id: string;
  description: string;
  completed: boolean;
}

export interface RoleplayScenario {
  id: string;
  title: string;
  titleJp: string;
  category: 'daily' | 'travel' | 'business' | 'anime' | 'shopping';
  level: UserLevel;
  icon: string;
  description: string;
  roleAi: string;
  roleUser: string;
  initialMessage: string;
  goals: ScenarioGoal[];
  usefulPhrases: Array<{ jp: string; kana: string; cn: string }>;
}

export type ApiProvider =
  | 'gemini'
  | 'deepseek'
  | 'openai'
  | 'qwen'
  | 'kimi'
  | 'siliconflow'
  | 'groq'
  | 'ollama'
  | 'custom';

export type ThemeColor = 'sakura' | 'indigo' | 'matcha' | 'amber' | 'slate' | 'violet';
export type AppFontFamily = 'noto-sans' | 'custom' | 'noto-serif' | 'zen-maru' | 'system';
export type AppFontSize = 'sm' | 'md' | 'lg' | 'xl';
export type RubySizeRatio = 'xs' | 'small' | 'default' | 'large' | 'xl' | 'custom';
export type RubyColorChoice = 'theme' | 'slate' | 'crimson' | 'indigo' | 'emerald' | 'violet' | 'amber' | 'custom';
export type BubbleDensity = 'compact' | 'normal' | 'spacious';
export type PitchLineColorChoice = 'theme' | 'vermilion' | 'indigo';
export type LineHeightChoice = 'tight' | 'compact' | 'normal' | 'relaxed' | 'custom';
export type SubtitleSeparatorType = 'dot' | 'comma' | 'and' | 'space' | 'yu' | 'to' | 'custom';

export interface ApiSettings {
  // Provider & API
  provider: ApiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;

  // Personalization & Names
  aiTutorName: string;
  userName: string;
  aiPersona: string;
  aiFirstPerson?: string; // 兼容旧字段
  aiFirstPersonJp?: string; // 私教日文第一人称习惯（置空默认："私[わたし]"）
  aiFirstPersonCn?: string; // 私教中文第一人称习惯（置空默认："我"）
  userCallName?: string; // 兼容旧字段
  userCallNameJp?: string; // 对学生的日文习惯称呼（置空默认："{userName}さん"）
  userCallNameCn?: string; // 对学生的中文习惯称呼（置空默认："{userName}"）
  aiNameReading?: string; // 私教名字读音，如 "しおり"
  userNameReading?: string; // 用户名字读音，如 "しょうめい"
  aiAvatar?: string; // 私教自定义头像（图片 URL 或 base64 data:image）
  userAvatar?: string; // 用户自定义头像（图片 URL 或 base64 data:image）

  // Appearance & Design Tokens
  themeColor: ThemeColor;
  fontFamily: AppFontFamily;
  customFontFamily?: string; // 自定义字体名称（如 "Klee One", "LXGW WenKai", "Yu Mincho"）
  fontSize: AppFontSize;
  lineHeight: LineHeightChoice; // default: 'normal'
  customLineHeight?: number; // 1.4 - 2.6, default: 1.8
  rubySize: RubySizeRatio;
  rubyCustomSize?: number; // 40 - 100 (%)
  rubyColor: RubyColorChoice; // default: 'theme'
  rubyCustomColor?: string; // hex, e.g. '#e11d48'
  bubbleDensity: BubbleDensity;
  pitchLineColor: PitchLineColorChoice;

  // History & Subtitle
  subtitleAutoRound: number; // 副标题在第几轮对话自动生成（0代表不自动生成，默认5）
  subtitleSeparator: SubtitleSeparatorType; // 连接词预设：“·”“、”“&”“空格”“与”“と”“自定义”
  subtitleCustomSeparator?: string; // 自定义连接词内容

  // Reading & Speech
  furiganaMode: FuriganaMode;
  furiganaHideMastered?: boolean; // 默认 true: 对学情档案中已掌握的生词自动隐藏振假名注音
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number; // 0.7 - 1.3
  ttsVoice: string;
  tokenSavingEnabled: boolean;
  showTokenUsage?: boolean;
  maxHistoryTurns: number; // e.g. 5 rounds (10 messages)
  crossSessionMemoryMode?: 'standard' | 'deep' | 'off'; // 跨会话记忆与学情追踪：standard (推荐轻量，增约100 tokens), deep (深度私教，增约250 tokens), off (独立单会话)
}

export interface GrammarItem {
  id: string;
  level: UserLevel;
  title: string;
  meaning: string;
  structure: string;
  explanation: string;
  examples: Array<{
    jp: string;
    reading: string;
    cn: string;
  }>;
  matchPatterns?: string[]; // 用于智能语篇识别的特征正则或关键词
}

export interface KanaItem {
  hiragana: string;
  katakana: string;
  romaji: string;
  row: string;
  col: string;
  type: 'seion' | 'dakuon' | 'yoon';
  chineseMnemonic: string;
  pronunciationTip: string;
}

export interface PersonaPreset {
  id: string;
  title: string;
  description?: string;
  aiTutorName: string;
  userName?: string;
  aiPersona: string;
  aiFirstPerson?: string;
  aiFirstPersonJp?: string;
  aiFirstPersonCn?: string;
  userCallName?: string;
  userCallNameJp?: string;
  userCallNameCn?: string;
  aiNameReading?: string;
  userNameReading?: string;
  aiAvatar?: string;
  userAvatar?: string;
  createdAt: number;
}

export interface ShioriBackupData {
  version: 1;
  appName: string;
  exportedAt: number;
  exportedAtFormatted: string;
  sourceDevice?: string;
  data: {
    profile?: UserLearningProfile;
    plan?: LearningPlan;
    sessions?: ChatSession[];
    activeSessionId?: string;
    messages?: ChatMessage[];
    learnedWords?: Record<string, LearnedWord>;
    learnedGrammar?: Record<string, LearnedGrammar>;
    favoriteExpressions?: FavoriteExpression[];
    settings?: ApiSettings;
    personaPresets?: PersonaPreset[];
    stats?: any;
  };
  summary: {
    wordsCount: number;
    grammarCount: number;
    sessionsCount: number;
    messagesCount: number;
    presetsCount: number;
    favoritesCount: number;
    hasApiKey: boolean;
  };
}

