export type UserLevel = 'N0' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export type StudyMode = 'tutor' | 'roleplay' | 'correction' | 'assessment' | 'kana';

export type FuriganaMode = 'always' | 'hover' | 'hidden';

export type PitchDisplayMode = 'badge' | 'curve' | 'none';

export type CrossSessionMemoryMode = 'standard' | 'deep' | 'off';

/**
 * 深度思考（推理链）策略：
 * - off  ：不向模型请求推理，即使服务端返回了推理内容也直接丢弃，界面上完全不出现思考区块。
 * - auto ：不额外注入任何推理参数，完全尊重当前供应商 / 模型的默认行为；
 *          若服务端主动返回了推理内容（如 deepseek-reasoner、QwQ、o 系列等），则照实展示。
 * - on   ：主动注入该供应商已知安全的推理开关参数（Gemini thinkingConfig、Qwen enable_thinking 等），
 *          尽量让模型把推理过程吐出来并展示。
 */
export type DeepThinkingMode = 'off' | 'auto' | 'on';

/**
 * 学习目标取向：决定「教什么、怎么验收」。
 * - jlpt     ：题型化、汉字量对齐 JLPT
 * - anime    ：动漫台词 / 名场面 / 角色语癖
 * - travel   ：场景优先（问路、点餐、住宿）
 * - business ：敬语优先（拜访、会议、邮件）
 * - school   ：在校课程进度对齐
 * - free     ：兴趣自由漫谈
 */
export type LearningGoal = 'jlpt' | 'anime' | 'travel' | 'business' | 'school' | 'free';

/**
 * 分轴能力画像（全部字段都是【可数证据】，不是主观评分）。
 *
 * 单一 `level` 无法描述真实学生：「五十音很熟、语法零基础、看了三年动漫听力很好」的人，
 * 套 N0 会被当婴儿（中文 90%、不许出长句），套 N5 又语法跟不上。
 * 所以排课改用分轴取材，且每个数字都能追溯到具体计数来源：
 * - `kanaKnown`   ← 五十音阶段自评 / N0 进度
 * - `vocabKnown`  ← 生词本去重条数（实词）
 * - `grammarKnown`← 学情档案语法点条数
 * - `kanjiSeen`   ← 生词本中出现的不同汉字数
 * - `targets`     ← JLPT 各级标准量（常量，见 curriculumPlanner）
 *
 * 刻意【不设】听力 / 产出评分：软件没有可靠的采证通道，编一个数字出来就是自欺。
 */
export interface AbilityAxes {
  kanaKnown?: number;
  vocabKnown?: number;
  grammarKnown?: number;
  kanjiSeen?: number;
  /** 当前等级的标准量参照（用于算"还差多少"，不是评分） */
  targets?: {
    vocab?: number;
    grammar?: number;
  };
}

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
  /** 学习目标取向（缺省视为 jlpt），驱动取材与验收方式 */
  goal?: LearningGoal;
  /** 学习节奏：微课(~15m) / 标准(~25m) / 冲刺(~40m) */
  studyPace?: StudyPace;
  /** 分轴能力画像（由采证派生，勿手工填） */
  axes?: AbilityAxes;
}

/** 学习节奏类型：微课 / 标准 / 冲刺 */
export type StudyPace = 'light' | 'standard' | 'intensive';

/**
 * @deprecated 旧「每日任务清单」实体。
 *
 * 它和「上课」是两种互斥的交互心智：勾选清单会让学生以为「打勾 = 学会」。
 * 新架构已由 {@link Lesson} / {@link LessonStep} 取代（步骤完成必须带证据），
 * 本类型仅为兼容存量数据读取而保留，新代码请勿再写入。
 */
export interface DailyTask {
  id: string;
  title: string;
  type: 'dialogue' | 'grammar' | 'kana' | 'vocab';
  target: string;
  completed: boolean;
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

// ——————————————————————————————————————————————————————————————
// 课时（Lesson）：把旧「学习计划」从一张打勾清单，重构成可上课的教学单元。
// ——————————————————————————————————————————————————————————————

export type LessonStepKind =
  | 'warmup'    // 热身：唤起本课相关旧知
  | 'vocab'     // 词汇
  | 'grammar'   // 句型语法
  | 'script'    // 情境脚本（取代"课文"）
  | 'drill'     // 操练 / 小测
  | 'roleplay'  // 角色扮演实战
  | 'wrapup';   // 收束与复盘

/**
 * 步骤的可执行动作。
 *
 * 这是整个重构的要点：旧的 `DailyTask` 只有 `target: string` 且无任何代码消费，
 * 「点击」只做 `toggleTask` + 放彩带——计划是纪念碑，不是入口。
 * 新模型要求【每一步都能真的点开并产生教学行为】。
 */
export type LessonStepAction =
  | { type: 'chat'; mode: StudyMode; scenarioId?: string; seedPrompt: string }
  | { type: 'flashcard'; wordIds?: string[]; grammarIds?: string[] }
  | { type: 'review'; tab?: KnowledgeTab };

/**
 * 步骤完成的证据。没有证据就不算完成——进度是算出来的，不是按出来的。
 *
 * 语义边界（这次重构刻意分清的一件事）：
 * - 步骤 `done` = **这一步的教学行为真的发生了**（课程推进度，对象是课）
 * - 生词本 `mastery` = **学生真的会了**（掌握度，对象是知识）
 * 旧版把两者混成一个"打勾"，才让"打勾 = 学会"这个错误心智得以成立。
 */
export interface LessonStepEvidence {
  at: number;
  /**
   * 证据通道。界面据此向学生解释"凭什么算这一步完成了"。
   * - `material-taught`   ：备课教材确实用到了本课知识点（脚本里逐词验证，本地判定）
   * - `word-collected`    ：本课新词已进生词本
   * - `grammar-collected` ：本课句型已进学情档案
   * - `flashcard`         ：本课复习词在闪卡里真的作答过（reviewCount > 0）
   * - `scenario-rounds`   ：实战演练说满了约定回合
   * - `manual`            ：学生自评（主观）。只对没有自动通道的步骤开放，界面必须分开计数
   */
  via: 'material-taught' | 'word-collected' | 'grammar-collected' | 'flashcard' | 'scenario-rounds' | 'manual';
  result?: 'forgot' | 'remembered' | 'mastered';
}

export interface LessonStep {
  id: string;
  kind: LessonStepKind;
  title: string;
  /** 教学指令 / 给老师看的演示要点 */
  brief: string;
  minutes: number;
  action: LessonStepAction;
  done: boolean;
  /**
   * 首次执行这一步的时间戳。
   *
   * 用途只有一个：区分"第一次开这一步"和"再点一次接着上"。
   * 步骤指令（`seedPrompt`）是【开课指令】（"请教我本课这几个新词…"），
   * 原样重发会让老师把整节课重头讲一遍——学生看到的正是"同一段开场说了两遍"。
   */
  startedAt?: number;
  evidence?: LessonStepEvidence;
}

/** 备课产物：本课要教的「教材」。全部由本地排课器 + AI 生成共同填充。 */
export interface LessonItems {
  words: Array<{
    surface: string;
    reading?: string;
    meaning?: string;
    pos?: string;
    level?: string;
    /** 是否为本课新词（已在生词本中的属于复习词） */
    isNew: boolean;
    /** 排课器选它的理由，用于界面解释 */
    reason?: string;
  }>;
  grammars: Array<{
    title: string;
    structure?: string;
    meaning?: string;
    level?: string;
    isNew: boolean;
    reason?: string;
    /** 前置语法依赖（如动词て形变形等） */
    prerequisites?: string[];
  }>;
  /**
   * 情境脚本（取代"课文"）：神态旁白 + 角色台词 + 译文点拨。
   * 复用软件既有的 `（神态/动作）` 灰色小字渲染约定，贴合角色对话载体。
   */
  script?: Array<{ speaker: 'ai' | 'user'; jp: string; cn?: string; note?: string }>;
  /** 文化 / 语用 / 声调等点拨 */
  points?: string[];
}

/**
 * `:::lesson` 块解析产物：备课阶段 AI 产出的教材载荷。
 *
 * 之所以用 `:::lesson` 块而非 JSON 承载教材：JSON 需要额外转义才能安全容纳 `<jp>` 契约
 * 与花括号注音，模型极易写坏；块语法则天然复用既有的剥离 / 渲染 / 朗读链路。
 * 解析一律走 `rubyParser.parseLessonBlock()`，注音一律走 `scanAnnotatedUnits`。
 */
export interface LessonMaterialPayload {
  title?: string;
  titleJp?: string;
  /** 可验证的课时目标 */
  goal?: string;
  /** 本课训练重心（由备课模型判断，用于覆盖排课器的默认值） */
  focus?: Lesson['focus'];
  /** 备课模型现场编写的角色扮演设定（覆盖排课器的模板兜底） */
  scenario?: {
    title?: string;
    roleAi?: string;
    roleUser?: string;
    initialMessage?: string;
    goals?: string[];
  };
  /** 情境脚本：speaker 为 'S'（学生）/ 'T'（老师）或角色名 */
  script?: Array<{ speaker: 'ai' | 'user'; jp: string; cn?: string; note?: string }>;
  points?: string[];
}

export type LessonMaterialState = 'skeleton' | 'generating' | 'ready' | 'failed';

export type LessonStatus = 'planned' | 'in_progress' | 'done';

export interface Lesson {
  id: string;
  /** 第几课（从 1 开始） */
  index: number;
  title: string;
  titleJp?: string;
  /** 可验证的课时目标：能独立完成 X */
  goal: string;
  level: UserLevel;
  /** 训练重心，对齐 RoleplayScenario.category */
  focus: 'daily' | 'travel' | 'business' | 'anime' | 'shopping' | 'kana' | 'foundation';
  status: LessonStatus;
  items: LessonItems;
  steps: LessonStep[];
  /** 教材生成状态：skeleton 表示只排好知识点、还没生成教材 */
  material: LessonMaterialState;
  createdAt: number;
  completedAt?: number;
  /** 本课对应的对话会话 id（上课即开新会话） */
  sessionId?: string;
  /**
   * 本课的实战演练情景。
   * 由排课器先给模板兜底，备课模型产出 `:::lesson` 后再被现场编写的设定覆盖。
   * 直接存在课时里（而不是另起一张动态场景注册表），这样随 `plan` 一起持久化，无需额外状态。
   */
  scenario?: RoleplayScenario;
  /** 教材生成失败时的原因，界面据此提示可重试 */
  error?: string;
}

/**
 * 课表。旧 `LearningPlan`（既当大纲又当任务清单还塞进度）已拆解：
 * 大纲与教学实体下沉到 {@link Lesson}，这里只剩课表投影与轻量摘要。
 *
 * `weeklyProgress` / `tasks` 标注为可选废弃字段——存量用户数据里还有它们，
 * 读取时要兼容（迁移时按 `tasks → steps` 转成第一课），但【不再写入】。
 */
export interface LearningPlan {
  currentStage: string;
  todayGoal: string;
  /** @deprecated 进度一律由 `computeCourseProgress()` 依证据算出 */
  weeklyProgress?: number;
  /** @deprecated 由 `lessons` 取代；仅存量数据读取兼容 */
  tasks?: DailyTask[];
  suggestedTopics: string[];
  grammarFocus: string[];
  lastUpdated: string;
  /** 课表：由本地排课器产出的课时序列 */
  lessons?: Lesson[];
  /** 当前正在上的课时 id */
  activeLessonId?: string;
}

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
  /**
   * 深度思考（推理链）原文。仅在开启深度思考且服务端确实返回了推理内容时才存在；
   * 界面据此在气泡上方渲染可折叠的「深度思考」面板。
   */
  reasoning?: string;
  /** 思考耗时（毫秒）：从首个推理增量到首个正文增量之间的时间差，用于展示"思考了 x.x 秒" */
  reasoningMs?: number;
  /**
   * 本条消息为某一课的备课外化产物。
   * 界面据此在气泡旁挂上教材卡片；同时它也是证据来源之一（教材已就绪）。
   */
  lessonId?: string;
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
  /**
   * 【主动测验】次数：仅由闪卡 / 测验的作答结果累加。
   * 掌握度晋升与遗忘曲线只看它。
   */
  reviewCount: number;
  learnedAt: number;
  /** 最近一次【主动测验】时间（被动遇见不刷新它，否则遗忘曲线失效） */
  lastReviewedAt?: number;
  /**
   * 【被动遇见】次数：学生只是在对话 / 教材 / 课文里碰到该词，未做任何作答。
   * 与 reviewCount 严格分离——混用时"聊天里出现过两次"会被误判为「温习中」，
   * 进而被 `extractPrioritizedKnowledge` 当复习靶标反复注入提示词。
   */
  exposureCount?: number;
  /** 最近一次【被动遇见】时间 */
  lastExposureAt?: number;
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
  /** 【主动测验】次数：仅由闪卡 / 测验作答累加（语义同 {@link LearnedWord.reviewCount}） */
  reviewCount: number;
  learnedAt: number;
  /** 最近一次【主动测验】时间 */
  lastReviewedAt?: number;
  /** 【被动遇见】次数：仅在对话 / 教材中自然出现而未被测验 */
  exposureCount?: number;
  /** 最近一次【被动遇见】时间 */
  lastExposureAt?: number;
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

export type ThemeMode = 'system' | 'light' | 'dark';
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
  /** 深度思考（推理链）策略，缺省视为 'auto'（尊重模型默认行为，有推理就展示） */
  deepThinkingMode?: DeepThinkingMode;

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
  themeMode?: ThemeMode; // 'system' | 'light' | 'dark'，默认跟随系统
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
  pitchLineColor?: PitchLineColorChoice;

  // History & Subtitle
  subtitleAutoRound: number; // 副标题在第几轮对话自动生成（0代表不自动生成，默认5）
  subtitleSeparator: SubtitleSeparatorType; // 连接词预设：“·”“、”“&”“空格”“与”“と”“自定义”
  subtitleCustomSeparator?: string; // 自定义连接词内容

  // Reading & Speech
  furiganaMode: FuriganaMode;
  furiganaHideMastered?: boolean; // 默认 true: 对学情档案中已掌握的生词自动隐藏振假名注音
  pitchDisplayMode: PitchDisplayMode;
  ttsRate?: number; // 已废弃（保留可选以兼容旧配置）
  ttsVoice?: string; // 已废弃（保留可选以兼容旧配置）
  externalDictSource?: ExternalDictSource; // 查词小窗外部权威词典来源（默认 'moji'）
  tokenSavingEnabled: boolean;
  showTokenUsage?: boolean;
  maxHistoryTurns: number; // e.g. 5 rounds (10 messages)
  crossSessionMemoryMode?: 'standard' | 'deep' | 'off'; // 跨会话记忆与学情追踪：standard (推荐轻量，增约100 tokens), deep (深度私教，增约250 tokens), off (独立单会话)
}

export type ExternalDictSource = 'moji' | 'hujiang' | 'weblio_cjjc' | 'weblio_jp' | 'youdao';


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
  type: 'seion' | 'dakuon' | 'yoon' | 'special';
  chineseMnemonic: string;
  pronunciationTip: string;
  altRomaji?: string[]; // 常见的备选罗马字写法，如 si/shi, ti/chi, tu/tsu, hu/fu
  keystrokes?: string[]; // 26键键盘标准及快捷输入法按键，如 ['shi', 'si']
}

/** 发音知识专题卡片 */
export interface PronunciationTopic {
  id: string;
  title: string;
  subtitle: string;
  iconType: string;
  tag: string;
  summary: string;
  coreRule: string;
  examples: Array<{
    word: string;
    reading: string;
    romaji: string;
    meaning: string;
    note?: string;
  }>;
  audioText?: string;
  practicalTips: string[];
}

/** 打字练习题目条目 */
export interface TypingDrillItem {
  id: string;
  word: string; // 展示词，如 "きって" 或 "パーティー"
  reading: string; // 假名读音
  kanjiMeaning?: string; // 中文释义，如 "邮票"
  validKeys: string[]; // 允许的罗马字输入方案（如 ["kitte", "ki-xtsu-te", "ki-ltsu-te"]）
  category: 'basic' | 'yoon' | 'sokuon' | 'katakana' | 'daily';
  tip?: string;
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
    /** 多套 API 连接配置档案（随备份迁移，换设备免重新配置） */
    apiProfiles?: ApiProfile[];
    stats?: any;
  };
  summary: {
    wordsCount: number;
    grammarCount: number;
    sessionsCount: number;
    messagesCount: number;
    presetsCount: number;
    favoritesCount: number;
    /** API 连接配置档案数量（旧备份文件可能没有该字段） */
    apiProfilesCount?: number;
    hasApiKey: boolean;
  };
}

/**
 * 一套可保存、可一键切换的 API 连接配置档案。
 *
 * 只承载"连接层"的字段（供应商 / 地址 / 密钥 / 模型 / 温度 / 深度思考策略），
 * 刻意不包含人设、外观、学习偏好等配置——那些属于 personaPresets 与 settings 的职责，
 * 混在一起会让"换一个 API"变成"换一整套人设"，反而不好用。
 */
export interface ApiProfile {
  id: string;
  /** 档案名称，如「DeepSeek 官方」「公司代理 GPT-4o」 */
  name: string;
  provider: ApiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  deepThinkingMode?: DeepThinkingMode;
  createdAt: number;
  updatedAt: number;
}

