import { useState, useEffect, useRef } from 'react';
import {
  UserLearningProfile,
  LearningPlan,
  ChatMessage,
  ChatSession,
  CollectedGrammarRef,
  CollectedWordRef,
  KnowledgeTab,
  LearnedWord,
  LearnedGrammar,
  FavoriteExpression,
  ApiSettings,
  StudyMode,
  RoleplayScenario,
  UserLevel,
  PersonaPreset,
  ShioriBackupData,
} from '../types';
import { ROLEPLAY_SCENARIOS } from '../data/scenarios';
import {
  extractKnowledgeFromMessage,
  collectNewWordRefs,
  isWordAlreadyLearned,
  isGrammarAlreadyLearned,
} from '../utils/knowledgeExtractor';
import { dictionaryService } from '../services/dictionaryService';
import { GRAMMAR_POINTS } from '../data/grammarPoints';
import {
  synthesizeGrammarDetails,
  normalizeGrammarKey,
  isGenericGrammarContent,
} from '../utils/grammarSynthesizer';
import {
  extractFirstSentenceTitle,
  formatSubtitleWithTopics,
  extractSessionKeywords,
} from '../utils/subtitleHelper';

const STORAGE_KEYS = {
  PROFILE: 'agy_jp_profile_v1',
  PLAN: 'agy_jp_plan_v1',
  MESSAGES: 'agy_jp_messages_v1',
  SESSIONS: 'agy_jp_sessions_v2',
  ACTIVE_SESSION_ID: 'agy_jp_active_session_id_v2',
  LEARNED_WORDS: 'agy_jp_learned_words_v1',
  LEARNED_GRAMMAR: 'agy_jp_learned_grammar_v1',
  FAVORITE_EXPRESSIONS: 'agy_jp_favorite_expressions_v1',
  SETTINGS: 'agy_jp_settings_v1',
  STATS: 'agy_jp_token_stats_v1',
  PERSONA_PRESETS: 'agy_jp_persona_presets_v2',
  PERSONA_PRESETS_LEGACY: 'agy_jp_persona_presets_v1',
};

export const DEFAULT_PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'preset-kaoruko',
    title: '温婉知性学姐（薫子）',
    description: '温柔知性的早稻田大学学姐薫子，耐心细致，鼓励自主造句与语感启发',
    aiTutorName: '薫子',
    userName: '学习者',
    aiNameReading: 'かおるこ',
    userNameReading: '',
    aiFirstPerson: '私',
    aiFirstPersonJp: '私',
    aiFirstPersonCn: '学姐',
    userCallName: '{userName}くん',
    userCallNameJp: '{userName}くん',
    userCallNameCn: '{userName}',
    aiPersona: '亲切温柔的日语系学姐薫子，讲解生动清晰，以中文贴心引导，适度穿插精炼实用的日语例句与互动',
    createdAt: 1700000000000,
  },
  {
    id: 'preset-hinata',
    title: '元气活力同伴（陽葵）',
    description: '同龄日语学习搭子，日常幽默，动漫与生活用语',
    aiTutorName: '陽葵',
    userName: '学习者',
    aiNameReading: 'ひなた',
    userNameReading: '',
    aiFirstPerson: '僕[ぼく]',
    aiFirstPersonJp: '僕[ぼく]',
    aiFirstPersonCn: '我',
    userCallName: '{userName}くん',
    userCallNameJp: '{userName}くん',
    userCallNameCn: '{userName}',
    aiPersona: '元气活泼、热爱动漫与日本流行文化的交流搭子，交流亲切幽默，多结合日常生活场景引导造句',
    createdAt: 1700000000001,
  },
  {
    id: 'preset-sato',
    title: '严谨博学学者（佐藤教授）',
    description: '语言学资深学者，语源考据与细腻敬语辨析',
    aiTutorName: '佐藤',
    userName: '学习者',
    aiNameReading: 'さとう',
    userNameReading: '',
    aiFirstPerson: 'わたくし',
    aiFirstPersonJp: 'わたくし',
    aiFirstPersonCn: '我',
    userCallName: '{userName}さん',
    userCallNameJp: '{userName}さん',
    userCallNameCn: '{userName}同学',
    aiPersona: '治学严谨但温和慈祥的大学教授，擅长词源文化背景与深层近义辨析，解答精准深入',
    createdAt: 1700000000002,
  },
  {
    id: 'preset-misaki',
    title: '知性职场菁英（美咲）',
    description: '日企资深商务精英，干练专业，实用商务口语',
    aiTutorName: '美咲',
    userName: '学习者',
    aiNameReading: 'みさき',
    userNameReading: '',
    aiFirstPerson: '私',
    aiFirstPersonJp: '私',
    aiFirstPersonCn: '我',
    userCallName: '{userName}さん',
    userCallNameJp: '{userName}さん',
    userCallNameCn: '{userName}',
    aiPersona: '外企日企资深职场前辈，注重地道职场与生活交际口语，用词得体精炼，互动高效',
    createdAt: 1700000000003,
  },
];

export const LEVEL_LABELS: Record<UserLevel, string> = {
  N0: '零基础·五十音启蒙',
  N5: '初级入门 (N5)',
  N4: '初级进阶 (N4)',
  N3: '中级桥梁 (N3)',
  N2: '中高级实战 (N2)',
  N1: '高级精通 (N1)',
};

const DEFAULT_PROFILE: UserLearningProfile = {
  level: 'N5',
  levelLabel: LEVEL_LABELS['N5'],
  estimatedVocab: 420,
  streakDays: 3,
  lastStudied: new Date().toISOString().split('T')[0],
  masteredGrammar: ['～は～です', '～をください', '～に行きます'],
  weakPoints: ['动词て形变形', '助词「に」与「で」的区别', '声调头高与平板'],
  targetGoals: ['无字幕看懂日常动漫', '日本自由行流畅点餐与问路', '通过 JLPT N3'],
  interests: ['anime', 'travel', 'daily'],
  notesForAI: '学生对日本美食和旅游很感兴趣，容易把「雨(1)」和「飴(0)」搞混，多提供发音音调指引。',
};

const DEFAULT_PLAN: LearningPlan = {
  currentStage: 'N5 核心日常会话与生活场景冲刺',
  todayGoal: '掌握居酒屋/便利店点单核心句式，巩固动词连接式',
  weeklyProgress: 42,
  tasks: [
    { id: 'task-1', title: '完成一次便利店买便当与加热的对话', type: 'dialogue', target: 'convenience_store', completed: false },
    { id: 'task-2', title: '熟练掌握「～てください」请求句型造句', type: 'grammar', target: 'n5_te_form', completed: true },
    { id: 'task-3', title: '练习经典声调辨析（雨 vs 飴、箸 vs 橋）', type: 'vocab', target: 'pitch', completed: false },
  ],
  suggestedTopics: ['下班后居酒屋点啤酒与烤串', '向电车售票机店员问路', '自我介绍与兴趣交流'],
  grammarFocus: ['～てください', '～てもいいですか', '～から～まで'],
  lastUpdated: new Date().toLocaleDateString(),
};

export const DEFAULT_LEARNED_WORDS: LearnedWord[] = [
  { id: 'word-1', surface: '言葉', reading: 'ことば', pitch: 3, pos: '名词', level: 'N5', meaning: '语言，话语，言语；词汇', detail: '日本での生活で新しい言葉を覚える。', mastery: 'learning', reviewCount: 1, learnedAt: Date.now() - 3600000 },
  { id: 'word-2', surface: '所', reading: 'ところ', pitch: 0, pos: '名词', level: 'N5', meaning: '地方，场所；时候，时刻', detail: '静かで綺麗な所に行きたい。', mastery: 'learning', reviewCount: 1, learnedAt: Date.now() - 3600000 * 2 },
  { id: 'word-3', surface: '日本語', reading: 'にほんご', pitch: 0, pos: '名词', level: 'N5', meaning: '日语，日文', detail: '日本語の会話を練習する。', mastery: 'mastered', reviewCount: 5, learnedAt: Date.now() - 86400000 * 3 },
  { id: 'word-4', surface: '雨', reading: 'あめ', pitch: 1, pos: '名词', level: 'N5', meaning: '雨水，下雨 (头高型)', mastery: 'reviewing', reviewCount: 2, learnedAt: Date.now() - 86400000 * 2 },
  { id: 'word-5', surface: '飴', reading: 'あめ', pitch: 0, pos: '名词', level: 'N5', meaning: '糖果，麦芽糖 (平板型)', mastery: 'reviewing', reviewCount: 2, learnedAt: Date.now() - 86400000 * 2 },
  { id: 'word-6', surface: 'カレー', reading: 'カレー', pitch: 1, pos: '名词', level: 'N5', meaning: '咖喱，咖喱饭', mastery: 'learning', reviewCount: 1, learnedAt: Date.now() - 3600000 * 3 },
];

function sanitizeAndEnrichLearnedWords(list: LearnedWord[]): LearnedWord[] {
  const EXCLUDED_GRAMMAR = new Set([
    'は', 'が', 'を', 'に', 'で', 'へ', 'と', '从', '直到', 'から', 'まで', 'より', 'も', 'の', 'ね', 'よ', 'か', 'や',
    'です', 'ます', 'でした', 'ました', 'だ', 'である',
    '它', '这', '那', '哪', '这里', '那里', '哪里', '什么', '可以', '想', '去',
    'それと', '然后', '以及', '而且', '但是', 'そして', 'それに', 'それから', 'でも', '然而', '不过', '可是', 'しかし', 'だから', 'ですから', 'また',
    'これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'どこ',
  ]);

  const isPlaceholderMeaning = (meaning?: string) => {
    if (!meaning) return true;
    const m = meaning.trim();
    return (
      m.length === 0 ||
      m.includes('正在生成') ||
      m.includes('暂无释义') ||
      m.includes('常用日语词汇') ||
      m.includes('日语常用口语表达') ||
      m.includes('外来语借词（点击') ||
      m.includes('点击右上角')
    );
  };

  const validList = list.filter((w) => {
    if (!w || !w.surface) return false;
    const cleanSurface = w.surface.trim();
    // 过滤中文句子/中文长句杂质（如 "或者你想去什么地方"）
    if (cleanSurface.length > 8) return false;
    if (/[，。！？、“”《》；：]/.test(cleanSurface)) return false;
    if (/[的地得了着吗吧呢么什哪这那或者并如果因为所以虽然但是可以想去这里那里地方什么]/.test(cleanSurface)) return false;
    if (EXCLUDED_GRAMMAR.has(cleanSurface)) return false;
    return true;
  });

  // 收集所有词条原型集合，用于识别和清理残缺前缀
  const allSurfaces = new Set(validList.map((w) => w.surface.trim()));

  return validList
    .filter((w) => {
      const surface = w.surface.trim();
      // 检查列表中是否存在对应的更完整合法词（如已存在「かっこいい」，过滤掉残缺的「かっこい」）
      for (const other of allSurfaces) {
        if (
          other !== surface &&
          other.startsWith(surface) &&
          other.length > surface.length &&
          other.length - surface.length <= 2
        ) {
          if (isPlaceholderMeaning(w.meaning)) {
            return false;
          }
        }
      }
      return true;
    })
    .map((w) => {
      const dict = dictionaryService.lookup(w.surface, w.reading);
      const isBadMeaning =
        isPlaceholderMeaning(w.meaning) ||
        w.meaning === `${w.surface}（${w.reading}）` ||
        w.meaning === w.surface;

      const canonicalSurface = dict.lemma || (dict.word && !dict.isPlaceholder ? dict.word : w.surface);

      if (dict && (dict.source === 'builtin' || dict.source === 'ai' || (dict.source === 'cache' && !dict.isPlaceholder))) {
        return {
          ...w,
          surface: canonicalSurface,
          reading: dict.reading || w.reading,
          pitch: w.pitch !== undefined ? w.pitch : dict.pitch,
          meaning: isBadMeaning ? dict.meaning : w.meaning,
          pos: dict.pos || w.pos,
          level: dict.level || w.level,
          detail: dict.detail || w.detail,
          exampleJp: w.exampleJp || dict.examples?.[0]?.jp,
          exampleCn: w.exampleCn || dict.examples?.[0]?.zh,
        };
      }
      return {
        ...w,
        surface: canonicalSurface,
      };
    });
}

export const DEFAULT_LEARNED_GRAMMAR: LearnedGrammar[] = [
  {
    id: 'gram-1',
    title: '～は～です',
    structure: '名词A + は + 名词B + です',
    meaning: '……是……（基本肯定陈述句）',
    explanation: '日语基石判断句。「は」在此处作主题提示助词读作「wa」，「です」表礼貌断定。',
    level: 'N5',
    mastery: 'mastered',
    reviewCount: 4,
    learnedAt: Date.now() - 86400000 * 3,
    exampleJp: '私[わたし]は学生[がくせい]です。',
    exampleCn: '我是学生。',
  },
  {
    id: 'gram-2',
    title: '～をください',
    structure: '名词 + を + ください',
    meaning: '请给我某物（点餐/购物核心句型）',
    explanation: '向店员或他人索取物品时的经典礼貌表达，「を」提示宾语，「ください」意为请给予。',
    level: 'N5',
    mastery: 'mastered',
    reviewCount: 3,
    learnedAt: Date.now() - 86400000 * 2,
    exampleJp: 'カレーをください。',
    exampleCn: '请给我一份咖喱。',
  },
  {
    id: 'gram-3',
    title: '～てください',
    structure: '动词て形 + ください',
    meaning: '请做某事（礼貌请求）',
    explanation: '动词连用て形接续「ください」，用于向听话者提出友善请求或行动指引。',
    level: 'N5',
    mastery: 'learning',
    reviewCount: 1,
    learnedAt: Date.now() - 86400000,
    exampleJp: 'ちょっと待[ま]ってください。',
    exampleCn: '请稍微等一下。',
  },
];

const MASTERY_RANK: Record<LearnedGrammar['mastery'], number> = {
  learning: 0,
  reviewing: 1,
  mastered: 2,
};

/**
 * 启动清洗：补齐/校正语法条目，并
 *   1) 丢弃「形态素兜底合成」留下的空洞历史脏条目（如「围绕「読みます」的句意表达」）；
 *   2) 按句型归一化 key 去重（同一句型曾被反复收录时合并为一条，保留掌握度更高的那条）。
 * 采集质量提升后，这一步同时也是对旧用户存量数据的自动净化。
 */
export function sanitizeAndEnrichLearnedGrammar(list: LearnedGrammar[]): LearnedGrammar[] {
  if (!Array.isArray(list)) return [];

  const stripPitchAndPunctuation = (str?: string) =>
    (str || '')
      .replace(/\[([ぁ-んァ-ヶー]+)\|\d+\]/g, '[$1]')
      .replace(/[。！？!?、,\s]+$/, '')
      .trim();

  const stripPitchOnly = (str?: string) =>
    (str || '').replace(/\[([ぁ-んァ-ヶー]+)\|\d+\]/g, '[$1]').trim();

  const enriched = list
    .filter((g) => g && g.title && g.title.trim().length > 0)
    .map((g) => {
      const cleanTitle = stripPitchAndPunctuation(g.title);
      const synthesized = synthesizeGrammarDetails(cleanTitle, g.exampleJp);

      const isVagueMeaning =
        !g.meaning ||
        g.meaning.includes('围绕「') ||
        g.meaning.includes('句意表达') ||
        g.meaning.includes('常用语法句型') ||
        g.meaning.includes('常用语法') ||
        g.meaning.includes('基础语法') ||
        g.meaning.includes('特定语法用法') ||
        g.meaning.includes('特定语法') ||
        g.meaning.includes('特色接续') ||
        g.meaning.trim() === cleanTitle ||
        g.meaning.trim() === g.title.trim();

      const isVagueExplanation =
        !g.explanation ||
        g.explanation.includes('围绕') ||
        g.explanation.includes('特色接续句型') ||
        g.explanation.includes('常用语法');

      const isVagueStructure =
        !g.structure ||
        g.structure.includes('语法接续') ||
        g.structure.includes('围绕') ||
        g.structure.startsWith('动词/名词 +');

      return {
        ...g,
        title: synthesized.title || cleanTitle,
        // 合成器给不出真内容时绝不用空洞文案覆盖原有字段
        structure: isVagueStructure && !synthesized.isGeneric
          ? synthesized.structure
          : stripPitchOnly(g.structure),
        meaning: isVagueMeaning && !synthesized.isGeneric
          ? synthesized.meaning
          : stripPitchOnly(g.meaning),
        explanation: isVagueExplanation && !synthesized.isGeneric
          ? synthesized.explanation
          : stripPitchOnly(g.explanation),
        level: g.level || (synthesized.isGeneric ? undefined : synthesized.level),
        exampleJp: g.exampleJp || synthesized.exampleJp,
        exampleCn: g.exampleCn || synthesized.exampleCn,
      };
    })
    .filter((g) => !isGenericGrammarContent(g));

  const byKey = new Map<string, LearnedGrammar>();
  for (const g of enriched) {
    const key = normalizeGrammarKey(g.title);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, g);
      continue;
    }
    const prevRank = MASTERY_RANK[prev.mastery] ?? 0;
    const nextRank = MASTERY_RANK[g.mastery] ?? 0;
    const isNextBetter =
      nextRank > prevRank ||
      (nextRank === prevRank && (g.reviewCount || 0) > (prev.reviewCount || 0)) ||
      (nextRank === prevRank &&
        (g.reviewCount || 0) === (prev.reviewCount || 0) &&
        (g.learnedAt || 0) > (prev.learnedAt || 0));
    byKey.set(
      key,
      isNextBetter
        ? {
            ...g,
            exampleJp: g.exampleJp || prev.exampleJp,
            exampleCn: g.exampleCn || prev.exampleCn,
          }
        : {
            ...prev,
            exampleJp: prev.exampleJp || g.exampleJp,
            exampleCn: prev.exampleCn || g.exampleCn,
          }
    );
  }

  return Array.from(byKey.values());
}

const DEFAULT_SETTINGS: ApiSettings = {
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  apiKey: '',
  model: 'gemini-3.6-flash',
  temperature: 0.7,

  // Personalization & Names
  aiTutorName: 'Shiori AI',
  userName: '学习者',
  aiPersona: '亲切温柔的学姐，讲解生动清晰，以中文贴心引导，适度穿插精炼实用的日语例句与互动',
  aiFirstPerson: '私',
  aiFirstPersonJp: '私',
  aiFirstPersonCn: '我',
  userCallName: '{userName}さん',
  userCallNameJp: '{userName}さん',
  userCallNameCn: '{userName}',
  aiNameReading: 'しおり',
  userNameReading: '',
  aiAvatar: '',
  userAvatar: '',

  // Appearance & Design Tokens
  themeMode: 'system',
  themeColor: 'sakura',
  fontFamily: 'noto-sans',
  customFontFamily: '',
  fontSize: 'md',
  lineHeight: 'normal',
  customLineHeight: 1.6,
  rubySize: 'default',
  rubyCustomSize: 60,
  rubyColor: 'theme',
  rubyCustomColor: '#e11d48',
  bubbleDensity: 'normal',
  pitchLineColor: 'theme',

  furiganaMode: 'always',
  furiganaHideMastered: true,
  pitchDisplayMode: 'curve',
  ttsRate: 1.0,
  ttsVoice: '',
  tokenSavingEnabled: true,
  maxHistoryTurns: 16,
  crossSessionMemoryMode: 'standard',
  subtitleAutoRound: 5,
  subtitleSeparator: 'dot',
  subtitleCustomSeparator: '',
};

export const getLevelInitialGreeting = (
  level: UserLevel = 'N5',
  tutorName: string = 'Shiori AI'
): string => {
  switch (level) {
    case 'N0':
      return `你好！我是你的专属AI日语私教【${tutorName}】。
初次见面，在日语中可以说「初[はじ]めまして」。
零基础不用担心看不懂，我会全程以清晰的中文带你从五十音发音、认读与最基础的生活用语学起。今天你想从假名认读、还是简单实用的生活问候语开始呢？`;

    case 'N5':
    default:
      return `你好！我是你的专属AI日语私教【${tutorName}】。初[はじ]めまして！
不用担心看不懂，在这里我们以通俗易懂的中文讲解为主，带你轻松掌握生活常用短句。
今日[きょう]も 一緒[いっしょ]に 楽[たの]しく 日本語[にほんご]を 勉強[べんきょう]しましょう！（今天也一起开心地学日语吧！）你想从哪个话题或者句型开始呢？`;

    case 'N4':
      return `你好！欢迎继续日语学习之旅。初级进阶阶段（N4）我们会重点巩固动词变形与日常实用表达。
语法逻辑与错因剖析我会以清晰中文讲透，同时适度穿插日常实用会话练习。
準備[じゅんび]は いいですか？（准备好了吗？）今天想练习什么场景或者语法点呢？`;

    case 'N3':
      return `こんにちは！【${tutorName}】です。中级阶段（N3）我们将迈向更地道流利的自然表达。
复杂的语法规则与近义词语感差异我会用中文为你清晰点拨，日常对话交流中多鼓励你运用日语表达。
今日[きょう]は どんな テーマで 話[はな]しましょうか？想从哪个感兴趣的话题开始聊聊呢？`;

    case 'N2':
      return `こんにちは！今日[きょう]も お疲[つか]れ様[さま]です。
进入 N2 阶段，我们将重点进行沉浸式表达与长句润色。对话交流以地道日语为主，遇到抽象语感、文化背景或复杂语法时，随时向我提问，我会用中文深入解析。
さっそく始[はじ]めましょう！`;

    case 'N1':
      return `こんにちは！N1 上级精通阶段，我们将聚焦母语者级别的细腻语感、地道惯用表达与高级润色。
我们将以自然流畅的高级日语展开深入探讨，有任何细微困惑随时以中文或日文提问。
何[なに]から 始[はじ]めましょうか？`;
  }
};

export const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-init-1',
    role: 'assistant',
    content: getLevelInitialGreeting('N5', 'Shiori AI'),
    timestamp: Date.now(),
    mode: 'tutor',
    tokens: {
      prompt: 45,
      completion: 120,
      total: 165,
      estimated: true,
    },
  },
];

export const createNewDefaultSession = (
  mode: StudyMode = 'tutor',
  scenario?: RoleplayScenario,
  customTitle?: string,
  level: UserLevel = 'N5',
  tutorName: string = 'Shiori AI'
): ChatSession => {
  let initialContent = getLevelInitialGreeting(level, tutorName);
  let title = customTitle || '新对话';

  if (scenario) {
    initialContent = `【情景练习：${scenario.title}】\n${scenario.initialMessage}`;
  }

  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode,
    scenarioId: scenario?.id,
    messages: [
      {
        id: `msg-init-${Date.now()}`,
        role: 'assistant',
        content: initialContent,
        timestamp: Date.now(),
        mode,
        scenarioId: scenario?.id,
        tokens: {
          prompt: 45,
          completion: 120,
          total: 165,
          estimated: true,
        },
      },
    ],
  };
};

const loadInitialSessions = (): { initialSessions: ChatSession[]; initialActiveId: string } => {
  try {
    const savedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (savedSessions) {
      const parsed: ChatSession[] = JSON.parse(savedSessions);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Automatically clean up old pitch accent tutorial intro from initial assistant messages
        const cleaned = parsed.map((session) => ({
          ...session,
          messages: session.messages.map((m) => {
            if (m.id.startsWith('msg-init') && m.content.includes('已开启沉浸式线条声调标注')) {
              return {
                ...m,
                content: `こんにちは！私[わたし]は あなたのAI日本語[にほんご]専属[せんぞく]コーチです。\n今日[きょう]も一緒[いっしょ]に楽[たの]しく日本語[にほんご]を勉強[べんきょう]しましょう！`,
              };
            }
            return m;
          }),
        }));

        const savedActiveId = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
        const activeExists = cleaned.some((s) => s.id === savedActiveId);
        return {
          initialSessions: cleaned,
          initialActiveId: activeExists ? (savedActiveId as string) : cleaned[0].id,
        };
      }
    }

    // Fallback migration from legacy single-session messages
    const legacyMessagesRaw = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    let legacyMessages: ChatMessage[] = INITIAL_MESSAGES;
    if (legacyMessagesRaw) {
      try {
        const parsedMsgs = JSON.parse(legacyMessagesRaw);
        if (Array.isArray(parsedMsgs) && parsedMsgs.length > 0) {
          legacyMessages = parsedMsgs;
        }
      } catch {
        // ignore
      }
    }

    const firstSession: ChatSession = {
      id: `session-init-${Date.now()}`,
      title: legacyMessages.length > 1 ? '历史对话 1' : '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: 'tutor',
      messages: legacyMessages,
    };

    return {
      initialSessions: [firstSession],
      initialActiveId: firstSession.id,
    };
  } catch {
    const defaultSession = createNewDefaultSession();
    return {
      initialSessions: [defaultSession],
      initialActiveId: defaultSession.id,
    };
  }
};

export function useAppStore() {
  const [profile, setProfile] = useState<UserLearningProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PROFILE);
      return saved ? JSON.parse(saved) : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  });

  const [plan, setPlan] = useState<LearningPlan>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PLAN);
      return saved ? JSON.parse(saved) : DEFAULT_PLAN;
    } catch {
      return DEFAULT_PLAN;
    }
  });

  // Multi-session history state
  const [{ initialSessions, initialActiveId }] = useState(loadInitialSessions);
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [currentSessionId, setCurrentSessionId] = useState<string>(initialActiveId);

  const [settings, setSettings] = useState<ApiSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        let targetModel = parsed.model || DEFAULT_SETTINGS.model;
        if (targetModel === 'gemini-2.5-flash' || targetModel === 'gemini-1.5-flash') {
          targetModel = 'gemini-3.6-flash';
        }

        // Migrate tutor name if legacy default '言の葉 AI' or '栞 AI' or '言の葉'
        let targetTutorName = parsed.aiTutorName;
        if (!targetTutorName || targetTutorName === '言の葉 AI' || targetTutorName === '栞 AI' || targetTutorName === '言の葉') {
          targetTutorName = 'Shiori AI';
        }

        // Migrate persona if legacy text mentions 言の葉
        let targetPersona = parsed.aiPersona;
        if (typeof targetPersona === 'string' && targetPersona.includes('言の葉')) {
          targetPersona = targetPersona.replace(/言の葉/g, '薫子');
        }

        // Migrate maxHistoryTurns if legacy default (<=6) was too small and caused amnesia
        let targetMaxTurns = parsed.maxHistoryTurns;
        if (!targetMaxTurns || typeof targetMaxTurns !== 'number' || targetMaxTurns < 8) {
          targetMaxTurns = 16;
        }

        const targetMemoryMode = parsed.crossSessionMemoryMode || 'standard';
        const targetSubtitleAutoRound = typeof parsed.subtitleAutoRound === 'number' ? parsed.subtitleAutoRound : 5;
        const targetSubtitleSeparator = parsed.subtitleSeparator || 'dot';
        const targetSubtitleCustomSeparator = parsed.subtitleCustomSeparator || '';

        if (!parsed.apiKey || parsed.apiKey.trim() === '') {
          return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            maxHistoryTurns: targetMaxTurns,
            crossSessionMemoryMode: targetMemoryMode,
            subtitleAutoRound: targetSubtitleAutoRound,
            subtitleSeparator: targetSubtitleSeparator,
            subtitleCustomSeparator: targetSubtitleCustomSeparator,
            aiTutorName: targetTutorName,
            aiPersona: targetPersona,
            provider: 'gemini',
            apiKey: DEFAULT_SETTINGS.apiKey,
            baseUrl: DEFAULT_SETTINGS.baseUrl,
            model: 'gemini-3.6-flash',
          };
        }
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          maxHistoryTurns: targetMaxTurns,
          crossSessionMemoryMode: targetMemoryMode,
          subtitleAutoRound: targetSubtitleAutoRound,
          subtitleSeparator: targetSubtitleSeparator,
          subtitleCustomSeparator: targetSubtitleCustomSeparator,
          aiTutorName: targetTutorName,
          aiPersona: targetPersona,
          model: targetModel,
        };
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [currentMode, setCurrentMode] = useState<StudyMode>('tutor');
  const [currentScenario, setCurrentScenario] = useState<RoleplayScenario>(ROLEPLAY_SCENARIOS[0]);

  // Learned Knowledge & Memory State (Auto-tracked and Persistent across conversations)
  const [learnedWords, setLearnedWords] = useState<LearnedWord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LEARNED_WORDS);
      const raw = saved ? JSON.parse(saved) : DEFAULT_LEARNED_WORDS;
      return sanitizeAndEnrichLearnedWords(raw);
    } catch {
      return sanitizeAndEnrichLearnedWords(DEFAULT_LEARNED_WORDS);
    }
  });

  const [learnedGrammar, setLearnedGrammar] = useState<LearnedGrammar[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LEARNED_GRAMMAR);
      const raw = saved ? JSON.parse(saved) : DEFAULT_LEARNED_GRAMMAR;
      return sanitizeAndEnrichLearnedGrammar(raw);
    } catch {
      return sanitizeAndEnrichLearnedGrammar(DEFAULT_LEARNED_GRAMMAR);
    }
  });

  // 手动收藏的短语 / 句型 / 整句（与生词本严格分离，绝不污染学情画像与注音词库）
  const [favoriteExpressions, setFavoriteExpressions] = useState<FavoriteExpression[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FAVORITE_EXPRESSIONS);
      const raw = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (f: any) =>
          f &&
          typeof f.text === 'string' &&
          f.text.trim().length > 0 &&
          typeof f.meaning === 'string' &&
          f.meaning.trim().length > 0
      );
    } catch {
      return [];
    }
  });

  // Persona Presets State (Builtin + User saved)
  const [personaPresets, setPersonaPresets] = useState<PersonaPreset[]>(() => {
    const sanitizeAndMigrate = (list: PersonaPreset[]): PersonaPreset[] => {
      return list.map((p) => {
        const aiFirstPersonJp = p.aiFirstPersonJp?.trim() || p.aiFirstPerson?.trim() || '私';
        const aiFirstPersonCn = p.aiFirstPersonCn?.trim() || '我';
        const userCallNameJp = p.userCallNameJp?.trim() || p.userCallName?.trim() || '{userName}さん';
        const userCallNameCn = p.userCallNameCn?.trim() || '{userName}';

        if (
          p.id === 'preset-kotonoha' ||
          p.id === 'preset-kaoruko' ||
          p.title.includes('言の葉') ||
          p.title.includes('薫子') ||
          p.aiTutorName === '言の葉'
        ) {
          return {
            ...p,
            id: 'preset-kaoruko',
            title: '温婉知性学姐（薫子）',
            description: '温柔知性的早稻田大学学姐薫子，耐心细致，鼓励自主造句与语感启发',
            aiTutorName: '薫子',
            aiNameReading: 'かおるこ',
            aiFirstPerson: p.aiFirstPerson || '私',
            aiFirstPersonJp: p.aiFirstPersonJp || '私',
            aiFirstPersonCn: p.aiFirstPersonCn || '学姐',
            userCallName: p.userCallName || '{userName}くん',
            userCallNameJp: p.userCallNameJp || '{userName}くん',
            userCallNameCn: p.userCallNameCn || '{userName}',
            aiPersona: (p.aiPersona || '').replace(/言の葉/g, '薫子') || DEFAULT_PERSONA_PRESETS[0].aiPersona,
          };
        }
        return {
          ...p,
          aiFirstPerson: p.aiFirstPerson || aiFirstPersonJp,
          aiFirstPersonJp,
          aiFirstPersonCn,
          userCallName: p.userCallName || userCallNameJp,
          userCallNameJp,
          userCallNameCn,
        };
      });
    };

    try {
      // 1. Try v2 first
      const savedV2 = localStorage.getItem(STORAGE_KEYS.PERSONA_PRESETS);
      if (savedV2) {
        const parsed = JSON.parse(savedV2);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sanitizeAndMigrate(parsed);
        }
      }
      // 2. Check legacy v1 and migrate to v2
      const savedV1 = localStorage.getItem(STORAGE_KEYS.PERSONA_PRESETS_LEGACY);
      if (savedV1) {
        const parsed = JSON.parse(savedV1);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migrated = sanitizeAndMigrate(parsed);
          localStorage.setItem(STORAGE_KEYS.PERSONA_PRESETS, JSON.stringify(migrated));
          return migrated;
        }
      }
      return DEFAULT_PERSONA_PRESETS;
    } catch {
      return DEFAULT_PERSONA_PRESETS;
    }
  });

  // Modal & Drawer control states
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false);
  const [kanaModalOpen, setKanaModalOpen] = useState(false);
  const [grammarModalOpen, setGrammarModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  /** 打开学情档案时要聚焦的页签（对话区"已收录语法"提示可直接跳到句型语法页） */
  const [knowledgeModalTab, setKnowledgeModalTab] = useState<KnowledgeTab>('vocab');

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PLAN, JSON.stringify(plan));
  }, [plan]);

  // 会话历史持久化：防抖 500ms，避免流式生成时每 chunk 全量序列化写入导致卡顿与闪存磨损
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    }, 500);
    return () => clearTimeout(timer);
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LEARNED_WORDS, JSON.stringify(learnedWords));
  }, [learnedWords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LEARNED_GRAMMAR, JSON.stringify(learnedGrammar));
  }, [learnedGrammar]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FAVORITE_EXPRESSIONS, JSON.stringify(favoriteExpressions));
  }, [favoriteExpressions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PERSONA_PRESETS, JSON.stringify(personaPresets));
  }, [personaPresets]);

  // Derived current session & messages
  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0];
  const messages = currentSession ? currentSession.messages : INITIAL_MESSAGES;

  // Sync currentSession messages to legacy key for compatibility (防抖，随流式高频更新而节流)
  useEffect(() => {
    if (currentSession) {
      const timer = setTimeout(() => {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(currentSession.messages));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentSession]);

  // 关闭页面/刷新前同步落盘，避免防抖窗口内的最新状态丢失
  const sessionsRef = useRef(sessions);
  const currentSessionIdRef = useRef(currentSessionId);
  const learnedWordsRef = useRef(learnedWords);
  const learnedGrammarRef = useRef(learnedGrammar);

  useEffect(() => {
    sessionsRef.current = sessions;
    currentSessionIdRef.current = currentSessionId;
  }, [sessions, currentSessionId]);

  useEffect(() => {
    learnedWordsRef.current = learnedWords;
  }, [learnedWords]);

  useEffect(() => {
    learnedGrammarRef.current = learnedGrammar;
  }, [learnedGrammar]);

  useEffect(() => {
    const flush = () => {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessionsRef.current));
      const cur = sessionsRef.current.find((s) => s.id === currentSessionIdRef.current) || sessionsRef.current[0];
      if (cur) {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(cur.messages));
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  // 启动时自动对当前会话中的历史私教回复进行语法自愈扫描，补齐历史遗留未收录的语法
  useEffect(() => {
    try {
      sessions.forEach((s) => {
        s.messages.forEach((m) => {
          if (m.role === 'assistant' && m.content) {
            const { grammars: exGrammars } = extractKnowledgeFromMessage(m);
            if (exGrammars.length > 0) {
              // 仅补录缺失项，绝不递增已存在条目的 reviewCount/mastery，防止每次刷新污染学情数据
              exGrammars.forEach((g) => addLearnedGrammar(g, { onlyIfMissing: true }));
            }
          }
        });
      });
    } catch {
      // Ignore
    }
  }, []);

  // Knowledge Operations
  const addLearnedWord = (item: Omit<LearnedWord, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'>) => {
    if (!item.surface || item.surface.trim().length <= 0 || item.surface.length > 8) return;
    const cleanSurface = item.surface.trim();
    if (/[，。！？、“”《》；：]/.test(cleanSurface)) return;
    if (/[的地得了着吗吧呢么什哪这那或者并如果因为所以虽然但是可以想去这里那里地方什么]/.test(cleanSurface)) return;

    // 严禁语法助词、助动词、连词及纯单假名作为生词收录
    const EXCLUDED_GRAMMAR_WORDS = new Set([
      'で', 'と', 'は', 'が', '重', 'を', 'に', 'へ', 'も', 'か', 'ね', 'よ', 'の', 'や', '从', '直到', 'から', 'まで', 'より',
      'です', 'ます', 'でした', 'ました', 'だ', 'である',
      '它', '这', '那', '哪', '这里', '那里', '哪里', '什么', '可以', '想', '去',
      'それと', '然后', '以及', '而且', '但是', 'そして', 'それに', 'それから', 'でも', '然而', '不过', '可是', 'しかし', 'だから', 'ですから', 'また',
      'これ', 'それ', 'あれ', 'どれ', '这里', '那里', '哪里', 'ここ', 'そこ', 'あそこ', 'どこ', '私', 'あなた'
    ]);
    if (EXCLUDED_GRAMMAR_WORDS.has(cleanSurface)) return;

    // 结合权威词典补充标准读音、声调、词性、JLPT等级与标准释义
    const dict = dictionaryService.lookup(cleanSurface, item.reading);

    const isPlaceholderMeaning = (meaning?: string) => {
      if (!meaning) return true;
      const m = meaning.trim();
      return (
        m.length === 0 ||
        m.includes('正在生成') ||
        m.includes('暂无释义') ||
        m.includes('常用日语词汇') ||
        m.includes('日语常用口语表达') ||
        m.includes('外来语借词（点击') ||
        m.includes('点击右上角')
      );
    };

    const itemMeaningIsValid = !isPlaceholderMeaning(item.meaning);
    const dictMeaningIsValid = !isPlaceholderMeaning(dict.meaning);

    // 严禁录入未就绪的占位符或无效残缺词条（必须有实质释义或来自 AI 真实产出）
    if (!itemMeaningIsValid && !dictMeaningIsValid && (dict.isPlaceholder || item.source !== 'ai')) {
      return;
    }

    // 确定权威规范词形（辞书原型优先，例如かっこいい优先于かっこい）
    let canonicalSurface = cleanSurface;
    if (dict.lemma && dict.lemma.trim().length > 0) {
      canonicalSurface = dict.lemma.trim();
    } else if (dict.word && !dict.isPlaceholder && dict.word.trim().length > 0) {
      canonicalSurface = dict.word.trim();
    }

    // 权威优先级：外部传入的有效释义（尤其是悬浮窗 AI 生成的新版权威解释）最高优先；若无则降级取词库
    const resolvedMeaning = itemMeaningIsValid
      ? item.meaning
      : (dict.meaning || item.meaning || '日常词汇');

    const enrichedItem: Omit<LearnedWord, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'> = {
      ...item,
      surface: canonicalSurface,
      reading: dict.reading || item.reading || canonicalSurface,
      pitch: item.pitch !== undefined ? item.pitch : dict.pitch,
      meaning: resolvedMeaning,
      pos: item.pos || dict.pos,
      level: item.level || dict.level,
      detail: item.detail || dict.detail,
      exampleJp: item.exampleJp || dict.examples?.[0]?.jp,
      exampleCn: item.exampleCn || dict.examples?.[0]?.zh,
      source: item.source || (itemMeaningIsValid ? 'ai' : dict.source),
    };

    setLearnedWords((prev) => {
      // 1. 检查既有词表中是否已经有比当前词更完整、合法的词（如已有 かっこいい，而当前尝试存入 かっこい）
      const existingSuperset = prev.find(
        (w) =>
          w.surface !== canonicalSurface &&
          w.surface.startsWith(canonicalSurface) &&
          w.surface.length > canonicalSurface.length &&
          w.surface.length - canonicalSurface.length <= 2
      );

      if (existingSuperset && (!itemMeaningIsValid || isPlaceholderMeaning(resolvedMeaning))) {
        // 说明当前是残缺碎片，已有完整词存在，绝不录入残缺词，直接刷新已有完整词的学习状态
        return prev.map((w) =>
          w.id === existingSuperset.id
            ? { ...w, reviewCount: w.reviewCount + 1, lastReviewedAt: Date.now() }
            : w
        );
      }

      // 2. 自愈清洗：剔除列表中属于当前权威词 canonicalSurface 的残缺前缀碎片（例如清理掉旧残留的 かっこい）
      const filtered = prev.filter((w) => {
        if (w.surface === canonicalSurface) return true;
        // 如果原有词是当前词的短前缀残片（差1-2个字符，如 かっこい vs かっこいい）
        const isPrefixFragment =
          canonicalSurface.startsWith(w.surface) &&
          canonicalSurface.length > w.surface.length &&
          canonicalSurface.length - w.surface.length <= 2;
        if (isPrefixFragment) {
          // 清理残缺词
          return false;
        }
        // 如果原有词是原输入词 cleanSurface（当 canonicalSurface !== cleanSurface 时）
        if (cleanSurface !== canonicalSurface && w.surface === cleanSurface) {
          return false;
        }
        return true;
      });

      // 3. 查找是否已存在同一词形
      const existingIdx = filtered.findIndex(
        (w) =>
          w.surface === canonicalSurface ||
          (dict.lemma && w.surface === dict.lemma)
      );

      if (existingIdx >= 0) {
        const updated = [...filtered];
        const existing = updated[existingIdx];
        const nextReviewCount = (existing.reviewCount || 1) + 1;
        
        // 智能流转机制：如果原状态为初学 (learning)，多次查阅/学习时自动进阶为复习中 (reviewing)
        let nextMastery = existing.mastery;
        if (existing.mastery === 'learning' && nextReviewCount >= 2) {
          nextMastery = 'reviewing';
        }
        
        // 词条已存在：无缝更新为悬浮窗/AI生成的新版权威释义与用法搭配例句，更新学习进度与复习时间
        updated[existingIdx] = {
          ...existing,
          ...enrichedItem,
          surface: canonicalSurface,
          id: existing.id,
          mastery: nextMastery,
          learnedAt: existing.learnedAt,
          reviewCount: nextReviewCount,
          lastReviewedAt: Date.now(),
        };
        return updated;
      }
      return [
        {
          ...enrichedItem,
          surface: canonicalSurface,
          id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          mastery: 'learning',
          reviewCount: 1,
          learnedAt: Date.now(),
          lastReviewedAt: Date.now(),
        },
        ...filtered,
      ];
    });
  };

  /**
   * 手动收藏一段表达（短语 / 句型 / 整句）。
   * 与生词本完全隔离：句子和短语不是"词汇"，放进生词本会污染学情注入与 AI 测验。
   * 同一原文重复收藏时原地更新（保留 id 与首次收藏时间），并置顶。
   */
  const addFavoriteExpression = (
    item: Omit<FavoriteExpression, 'id' | 'createdAt'>
  ) => {
    const text = (item.text || '').trim();
    const meaning = (item.meaning || '').trim();
    // 占位释义（"正在生成…"）与空内容绝不入库
    if (!text || !meaning) return;
    if (
      meaning.includes('正在生成') ||
      meaning.includes('暂无释义') ||
      meaning.includes('常用日语词汇') ||
      meaning.includes('日语常用口语表达') ||
      meaning.includes('外来语借词（点击')
    ) {
      return;
    }

    setFavoriteExpressions((prev) => {
      const idx = prev.findIndex((f) => f.text === text);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...item, text, meaning };
        return [updated[idx], ...updated.filter((_, i) => i !== idx)];
      }
      return [
        {
          ...item,
          text,
          meaning,
          id: `fav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now(),
        },
        ...prev,
      ];
    });
  };

  /** 取消收藏：同时支持按 id 与按原文移除 */
  const removeFavoriteExpression = (idOrText: string) => {
    setFavoriteExpressions((prev) =>
      prev.filter((f) => f.id !== idOrText && f.text !== idOrText)
    );
  };

  const clearFavoriteExpressions = () => setFavoriteExpressions([]);

  const addLearnedGrammar = (
    item: Omit<LearnedGrammar, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'>,
    options?: { onlyIfMissing?: boolean }
  ) => {
    if (!item.title || item.title.trim().length <= 0) return;

    const stripPitchAndPunctuation = (str?: string) =>
      (str || '')
        .replace(/\[([ぁ-んァ-ヶー]+)\|\d+\]/g, '[$1]')
        .replace(/[。！？!?、,\s]+$/, '')
        .trim();

    const stripPitchOnly = (str?: string) =>
      (str || '').replace(/\[([ぁ-んァ-ヶー]+)\|\d+\]/g, '[$1]').trim();

    const cleanTitle = stripPitchAndPunctuation(item.title);
    const synthesized = synthesizeGrammarDetails(cleanTitle, item.exampleJp);

    const isVagueMeaning =
      !item.meaning ||
      item.meaning.includes('围绕「') ||
      item.meaning.includes('句意表达') ||
      item.meaning.includes('常用语法句型') ||
      item.meaning.includes('常用语法') ||
      item.meaning.includes('基础语法') ||
      item.meaning.includes('特定语法用法') ||
      item.meaning.includes('特定语法') ||
      item.meaning.includes('特色接续') ||
      item.meaning.trim() === cleanTitle ||
      item.meaning.trim() === item.title.trim();

    const isVagueExplanation =
      !item.explanation ||
      item.explanation.includes('围绕') ||
      item.explanation.includes('特色接续句型') ||
      item.explanation.includes('常用语法');

    const isVagueStructure =
      !item.structure ||
      item.structure.includes('语法接续') ||
      item.structure.includes('围绕') ||
      item.structure.startsWith('动词/名词 +');

    const enrichedItem: Omit<LearnedGrammar, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'> = {
      ...item,
      title: synthesized.title || cleanTitle,
      structure: isVagueStructure && !synthesized.isGeneric
        ? synthesized.structure
        : stripPitchOnly(item.structure),
      meaning: isVagueMeaning && !synthesized.isGeneric
        ? synthesized.meaning
        : stripPitchOnly(item.meaning),
      explanation: isVagueExplanation && !synthesized.isGeneric
        ? synthesized.explanation
        : stripPitchOnly(item.explanation),
      level: item.level || (synthesized.isGeneric ? undefined : synthesized.level),
      exampleJp: item.exampleJp || synthesized.exampleJp,
      exampleCn: item.exampleCn || synthesized.exampleCn,
    };

    // 宁缺毋滥：拿不出真正教学内容的条目一律不入库（杜绝空洞条目污染学情档案与提示词注入）
    if (isGenericGrammarContent(enrichedItem)) return;

    setLearnedGrammar((prev) => {
      const incomingKey = normalizeGrammarKey(enrichedItem.title);
      const existingIdx = prev.findIndex((g) => {
        const gKey = normalizeGrammarKey(g.title);
        return (
          gKey === incomingKey ||
          g.title === enrichedItem.title ||
          g.title === cleanTitle
        );
      });
      if (existingIdx >= 0) {
        // 启动自愈扫描只补录缺失项，禁止递增已存在条目的复习次数与掌握度
        if (options?.onlyIfMissing) {
          return prev;
        }
        const updated = [...prev];
        const nextReviewCount = (updated[existingIdx].reviewCount || 1) + 1;
        let nextMastery = updated[existingIdx].mastery;
        if (nextMastery === 'learning' && nextReviewCount >= 2) {
          nextMastery = 'reviewing';
        }
        updated[existingIdx] = {
          ...updated[existingIdx],
          ...enrichedItem,
          // 新条目缺字段时保留旧值，绝不用空串覆盖已有的有效内容
          structure: enrichedItem.structure || updated[existingIdx].structure,
          explanation: enrichedItem.explanation || updated[existingIdx].explanation,
          exampleJp: enrichedItem.exampleJp || updated[existingIdx].exampleJp,
          exampleCn: enrichedItem.exampleCn || updated[existingIdx].exampleCn,
          level: enrichedItem.level || updated[existingIdx].level,
          mastery: nextMastery,
          reviewCount: nextReviewCount,
          lastReviewedAt: Date.now(),
        };
        return updated;
      }
      return [
        {
          ...enrichedItem,
          id: `gram-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          mastery: 'learning',
          reviewCount: 1,
          learnedAt: Date.now(),
        },
        ...prev,
      ];
    });
  };

  const removeLearnedWord = (wordId: string) => {
    setLearnedWords((prev) => prev.filter((w) => w.id !== wordId && w.surface !== wordId));
  };

  const removeLearnedGrammar = (grammarId: string) => {
    setLearnedGrammar((prev) => prev.filter((g) => g.id !== grammarId));
  };

  const updateWordMastery = (wordId: string, mastery: 'learning' | 'reviewing' | 'mastered') => {
    setLearnedWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, mastery, lastReviewedAt: Date.now() } : w))
    );
  };

  const updateGrammarMastery = (grammarId: string, mastery: 'learning' | 'reviewing' | 'mastered') => {
    setLearnedGrammar((prev) =>
      prev.map((g) => (g.id === grammarId ? { ...g, mastery, lastReviewedAt: Date.now() } : g))
    );
  };

  const recordReviewResult = (
    type: 'word' | 'grammar',
    id: string,
    result: 'remembered' | 'forgot' | 'mastered'
  ) => {
    if (type === 'word') {
      setLearnedWords((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const nextCount = w.reviewCount + 1;
          let nextMastery = w.mastery;
          if (result === 'mastered') nextMastery = 'mastered';
          else if (result === 'forgot') nextMastery = 'learning';
          else if (result === 'remembered') nextMastery = nextCount >= 3 ? 'mastered' : 'reviewing';
          return { ...w, reviewCount: nextCount, mastery: nextMastery, lastReviewedAt: Date.now() };
        })
      );
    } else {
      setLearnedGrammar((prev) =>
        prev.map((g) => {
          if (g.id !== id) return g;
          const nextCount = g.reviewCount + 1;
          let nextMastery = g.mastery;
          if (result === 'mastered') nextMastery = 'mastered';
          else if (result === 'forgot') nextMastery = 'learning';
          else if (result === 'remembered') nextMastery = nextCount >= 3 ? 'mastered' : 'reviewing';
          return { ...g, reviewCount: nextCount, mastery: nextMastery, lastReviewedAt: Date.now() };
        })
      );
    }
  };

  const addMessage = (message: ChatMessage) => {
    // 先做知识提取，把本轮收录到的语法点 / 新单词挂回消息，气泡旁才能给出"已收录"提示
    const ingestResult =
      message.role === 'assistant'
        ? ingestKnowledgeAndTokens(message)
        : { grammars: [] as CollectedGrammarRef[], words: [] as CollectedWordRef[] };
    const collectedGrammar = ingestResult.grammars;
    const collectedWords = ingestResult.words;
    const finalMessage: ChatMessage =
      collectedGrammar.length || collectedWords.length
        ? { ...message, collectedGrammar, collectedWords }
        : message;

    setSessions((prevSessions) => {
      return prevSessions.map((session) => {
        if (session.id === currentSessionId) {
          let newTitle = session.title;
          const hasPriorUserMsg = session.messages.some((m) => m.role === 'user');
          // If this is the first user message and title was not manually customized, set to user's first sentence
          if (
            finalMessage.role === 'user' &&
            (!hasPriorUserMsg || !session.hasCustomTitle || newTitle.startsWith('新对话') || newTitle.startsWith('初始对话') || newTitle.startsWith('历史对话'))
          ) {
            newTitle = extractFirstSentenceTitle(finalMessage.content);
          }
          return {
            ...session,
            title: newTitle,
            updatedAt: Date.now(),
            messages: [...session.messages, finalMessage],
          };
        }
        return session;
      });
    });
  };

  /**
   * 自动提取并静默收录知识。
   * 返回本轮【被收录进学情档案的语法点 + 新单词】，供调用方挂在消息上给出对话区提示。
   */
  const ingestKnowledgeAndTokens = (
    message: ChatMessage
  ): { grammars: CollectedGrammarRef[]; words: CollectedWordRef[] } => {
    // Auto-extract and silently ingest knowledge when AI generates content or correction
    if (message.role !== 'assistant' || !message.content) {
      return { grammars: [], words: [] };
    }

    const collectedGrammars: CollectedGrammarRef[] = [];
    let collectedWords: CollectedWordRef[] = [];
    try {
      const { words: extractedWords, grammars: extractedGrammars } = extractKnowledgeFromMessage(message);
      if (extractedWords.length > 0) {
        // 使用 Ref 确保拿到最新学情词库快照，杜绝闭包陈旧导致已收录词被重复判定为新词
        const currentWords = learnedWordsRef.current;
        const addedThisRoundSurfaces = new Set<string>();

        for (const w of extractedWords) {
          const surface = (w.surface || '').trim();
          if (!surface) continue;

          // 严格判定：若在学情档案中已收录（表面词、辞书原型 lemma、反活用对齐），或本轮已收录，一律判定为旧词
          const isOld = isWordAlreadyLearned(w, currentWords) || addedThisRoundSurfaces.has(surface);

          if (!isOld) {
            collectedWords.push({
              surface: w.surface,
              reading: w.reading,
              level: w.level,
              pos: w.pos,
            });
            addedThisRoundSurfaces.add(surface);
          }

          // 无论是否为新词，均执行入库或刷新复习频次
          addLearnedWord(w);

          // 联动 AI 词典：若当前词汇未在 AI 权威词典中生成丰富语用搭配与例句，异步触发生成并补充写入
          if (!w.detail || !w.exampleJp || w.meaning.length <= 8) {
            dictionaryService
              .fetchAiDefinition(w.surface, w.reading, {
                isFromJTag: true,
                sentenceContext: message.content,
              })
              .then((aiEntry) => {
                if (aiEntry && aiEntry.meaning && !aiEntry.meaning.includes('暂无释义')) {
                  addLearnedWord({
                    surface: aiEntry.word || w.surface,
                    reading: aiEntry.reading || w.reading,
                    pitch: aiEntry.pitch ?? w.pitch,
                    meaning: aiEntry.meaning,
                    pos: aiEntry.pos || w.pos,
                    level: aiEntry.level || w.level,
                    detail: aiEntry.detail,
                    exampleJp: aiEntry.examples?.[0]?.jp,
                    exampleCn: aiEntry.examples?.[0]?.zh,
                    source: 'ai',
                  });
                }
              })
              .catch(() => {});
          }
        }

        if (collectedWords.length > 0) {
          setProfile((prev) => ({
            ...prev,
            estimatedVocab: prev.estimatedVocab + Math.min(collectedWords.length * 2, 6),
          }));
        }
      }

      if (extractedGrammars.length > 0) {
        // 使用 Ref 确保拿到最新学情语法快照
        const currentGrammars = learnedGrammarRef.current;
        const addedThisRoundKeys = new Set<string>();

        for (const g of extractedGrammars) {
          const rawTitle = (g.title || '').trim();
          if (!rawTitle) continue;
          const normalizedKey = normalizeGrammarKey(rawTitle);

          // 严格判定：若在学情档案中已收录（标题归一化、权威语法库对齐），或本轮已收录，一律判定为旧语法
          const isOld = isGrammarAlreadyLearned(g, currentGrammars) || addedThisRoundKeys.has(normalizedKey);

          if (!isOld) {
            // 严格只将全新句型加入 collectedGrammars，旧句型绝不放入，杜绝错误提示
            collectedGrammars.push({
              title: g.title,
              level: g.level,
              isNew: true,
            });
            addedThisRoundKeys.add(normalizedKey);
          }

          // 无论是否新语法，均入库学情档案或递增复习频次
          addLearnedGrammar(g);
        }
      }
    } catch (err) {
      console.warn('Knowledge extraction failed:', err);
    }
    return { grammars: collectedGrammars, words: collectedWords };
  };

  const setMessages = (action: React.SetStateAction<ChatMessage[]>) => {
    setSessions((prevSessions) => {
      return prevSessions.map((session) => {
        if (session.id === currentSessionId) {
          const updatedMessages = typeof action === 'function' ? action(session.messages) : action;
          let newTitle = session.title;
          if (!session.hasCustomTitle || newTitle.startsWith('新对话') || newTitle.startsWith('初始对话') || newTitle.startsWith('历史对话')) {
            const firstUserMsg = updatedMessages.find((m) => m.role === 'user');
            if (firstUserMsg && firstUserMsg.content.trim()) {
              newTitle = extractFirstSentenceTitle(firstUserMsg.content);
            }
          }
          return {
            ...session,
            title: newTitle,
            updatedAt: Date.now(),
            messages: updatedMessages,
          };
        }
        return session;
      });
    });
  };

  const updateMessage = (
    messageId: string,
    updater: Partial<ChatMessage> | ((prev: ChatMessage) => ChatMessage)
  ) => {
    setSessions((prevSessions) => {
      return prevSessions.map((session) => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            updatedAt: Date.now(),
            messages: session.messages.map((m) => {
              if (m.id === messageId) {
                return typeof updater === 'function' ? updater(m) : { ...m, ...updater };
              }
              return m;
            }),
          };
        }
        return session;
      });
    });
  };

  const createNewSession = (mode?: StudyMode, scenario?: RoleplayScenario, customTitle?: string) => {
    const targetMode = mode || currentMode;
    const targetScenario = targetMode === 'roleplay' ? (scenario || currentScenario) : undefined;
    const newSession = createNewDefaultSession(targetMode, targetScenario, customTitle, profile.level, settings.aiTutorName);

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);

    if (targetMode) setCurrentMode(targetMode);
    if (targetScenario) setCurrentScenario(targetScenario);

    return newSession;
  };

  const switchSession = (sessionId: string) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;
    setCurrentSessionId(sessionId);
    if (target.mode) {
      setCurrentMode(target.mode);
    }
    if (target.scenarioId) {
      const sc = ROLEPLAY_SCENARIOS.find((s) => s.id === target.scenarioId);
      if (sc) setCurrentScenario(sc);
    }
  };

  const deleteSession = (sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      if (next.length === 0) {
        const fresh = createNewDefaultSession(currentMode, currentScenario, undefined, profile.level, settings.aiTutorName);
        setCurrentSessionId(fresh.id);
        return [fresh];
      }
      if (currentSessionId === sessionId) {
        setCurrentSessionId(next[0].id);
        if (next[0].mode) setCurrentMode(next[0].mode);
        if (next[0].scenarioId) {
          const sc = ROLEPLAY_SCENARIOS.find((s) => s.id === next[0].scenarioId);
          if (sc) setCurrentScenario(sc);
        }
      }
      return next;
    });
  };

  const updateSessionTitleAndSubtitle = (
    sessionId: string,
    newTitle: string,
    newSubtitle?: string
  ) => {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          title: trimmedTitle,
          subtitle: newSubtitle !== undefined ? newSubtitle.trim() : s.subtitle,
          hasCustomTitle: true,
          hasCustomSubtitle: newSubtitle !== undefined ? true : s.hasCustomSubtitle,
        };
      })
    );
  };

  const renameSession = (sessionId: string, newTitle: string) => {
    updateSessionTitleAndSubtitle(sessionId, newTitle);
  };

  const generateSessionSubtitle = async (
    sessionId: string,
    force: boolean = false
  ): Promise<string | null> => {
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (!targetSession) return null;
    if (!force && targetSession.subtitle) {
      return targetSession.subtitle;
    }

    try {
      const keywords = await extractSessionKeywords(targetSession.messages, settings);
      if (!keywords || keywords.length !== 3) {
        return null;
      }
      const formatted = formatSubtitleWithTopics(
        keywords,
        settings.subtitleSeparator,
        settings.subtitleCustomSeparator
      );
      if (!formatted) {
        return null;
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                subtitle: formatted,
                subtitleTopics: keywords,
                hasCustomSubtitle: false,
              }
            : s
        )
      );
      return formatted;
    } catch (err) {
      console.error('Failed to generate session subtitle:', err);
      return null;
    }
  };

  const clearAllSessions = () => {
    const fresh = createNewDefaultSession('tutor', undefined, undefined, profile.level, settings.aiTutorName);
    setSessions([fresh]);
    setCurrentSessionId(fresh.id);
    setCurrentMode('tutor');
  };

  const updateProfileLevel = (newLevel: UserLevel) => {
    setProfile((prev) => ({
      ...prev,
      level: newLevel,
      levelLabel: LEVEL_LABELS[newLevel],
    }));
  };

  const toggleTaskCompleted = (taskId: string) => {
    setPlan((prev) => {
      const updatedTasks = prev.tasks.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      );
      const completedCount = updatedTasks.filter((t) => t.completed).length;
      const progress = Math.round((completedCount / updatedTasks.length) * 100);
      return {
        ...prev,
        tasks: updatedTasks,
        weeklyProgress: progress,
      };
    });
  };

  // Persona Presets Operations
  const savePersonaPreset = (presetData: Omit<PersonaPreset, 'id' | 'createdAt'>): PersonaPreset => {
    const newPreset: PersonaPreset = {
      ...presetData,
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    setPersonaPresets((prev) => [newPreset, ...prev]);
    return newPreset;
  };

  const applyPersonaPreset = (presetId: string) => {
    const target = personaPresets.find((p) => p.id === presetId);
    if (!target) return;
    setSettings((prev) => ({
      ...prev,
      aiTutorName: target.aiTutorName,
      userName: target.userName !== undefined ? target.userName : prev.userName,
      aiPersona: target.aiPersona,
      aiFirstPerson: target.aiFirstPerson || prev.aiFirstPerson,
      userCallName: target.userCallName || prev.userCallName,
      aiNameReading: target.aiNameReading || prev.aiNameReading,
      userNameReading: target.userNameReading || prev.userNameReading,
      aiAvatar: target.aiAvatar !== undefined ? target.aiAvatar : prev.aiAvatar,
      userAvatar: target.userAvatar !== undefined ? target.userAvatar : prev.userAvatar,
    }));
  };

  const deletePersonaPreset = (presetId: string) => {
    setPersonaPresets((prev) => prev.filter((p) => p.id !== presetId));
  };

  const exportPersonaPresets = (): string => {
    return JSON.stringify(personaPresets, null, 2);
  };

  const importPersonaPresets = (jsonStr: string): { success: boolean; count: number; error?: string } => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, error: '导入数据必须为预设数组格式 (JSON Array)' };
      }
      const validItems: PersonaPreset[] = [];
      for (const item of parsed) {
        if (item && typeof item === 'object' && item.title && item.aiTutorName && item.aiPersona) {
          validItems.push({
            id: item.id || `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: String(item.title).slice(0, 30),
            description: item.description ? String(item.description).slice(0, 80) : undefined,
            aiTutorName: String(item.aiTutorName),
            userName: item.userName ? String(item.userName) : undefined,
            aiPersona: String(item.aiPersona),
            aiFirstPerson: item.aiFirstPerson ? String(item.aiFirstPerson) : undefined,
            userCallName: item.userCallName ? String(item.userCallName) : undefined,
            aiNameReading: item.aiNameReading ? String(item.aiNameReading) : undefined,
            userNameReading: item.userNameReading ? String(item.userNameReading) : undefined,
            aiAvatar: item.aiAvatar ? String(item.aiAvatar) : undefined,
            userAvatar: item.userAvatar ? String(item.userAvatar) : undefined,
            createdAt: item.createdAt || Date.now(),
          });
        }
      }
      if (validItems.length === 0) {
        return { success: false, count: 0, error: '未识别到有效的预设格式内容' };
      }
      setPersonaPresets((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newOnes = validItems.filter((v) => !existingIds.has(v.id));
        return [...newOnes, ...prev];
      });
      return { success: true, count: validItems.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err?.message || 'JSON 解析失败' };
    }
  };

  /**
   * 全量数据一键导出（包含学情档案、生词、语法、会话历史、人设与设置）
   */
  const exportAllData = (includeApiKey: boolean = true): string => {
    const safeSettings: ApiSettings = { ...settings };
    if (!includeApiKey) {
      safeSettings.apiKey = '';
    }

    let statsData: any = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STATS);
      if (raw) statsData = JSON.parse(raw);
    } catch {
      // ignore
    }

    const payload: ShioriBackupData = {
      version: 1,
      appName: 'Shiori AI Japanese Tutor',
      exportedAt: Date.now(),
      exportedAtFormatted: new Date().toLocaleString(),
      sourceDevice:
        typeof navigator !== 'undefined' && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)
          ? '手机/移动端'
          : '电脑/桌面端',
      data: {
        profile,
        plan,
        sessions,
        activeSessionId: currentSessionId,
        learnedWords: (learnedWords || []).reduce((acc, item) => {
          acc[item.id || item.surface] = item;
          return acc;
        }, {} as Record<string, LearnedWord>),
        learnedGrammar: (learnedGrammar || []).reduce((acc, item) => {
          acc[item.id || item.title] = item;
          return acc;
        }, {} as Record<string, LearnedGrammar>),
        favoriteExpressions,
        settings: safeSettings,
        personaPresets,
        stats: statsData,
      },
      summary: {
        wordsCount: learnedWords.length,
        grammarCount: learnedGrammar.length,
        sessionsCount: sessions.length,
        messagesCount: sessions.reduce((sum, s) => sum + (s.messages?.length || 0), 0),
        presetsCount: personaPresets.length,
        favoritesCount: favoriteExpressions.length,
        hasApiKey: Boolean(includeApiKey && settings.apiKey?.trim()),
      },
    };

    return JSON.stringify(payload, null, 2);
  };

  /**
   * 备份文件合法性检验与摘要提取（导入前预览）
   */
  const inspectBackupData = (
    jsonStr: string
  ): { success: boolean; data?: ShioriBackupData; error?: string } => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: '无效的文件格式，不是合法的 JSON 对象' };
      }

      // 兼容标准 ShioriBackupData 格式
      if (parsed.appName?.includes('Shiori') || parsed.data) {
        const d = parsed.data || {};
        const words = Array.isArray(d.learnedWords)
          ? d.learnedWords
          : Object.values(d.learnedWords || {});
        const grammar = Array.isArray(d.learnedGrammar)
          ? d.learnedGrammar
          : Object.values(d.learnedGrammar || {});
        const sessList = Array.isArray(d.sessions) ? d.sessions : [];
        const presets = Array.isArray(d.personaPresets) ? d.personaPresets : [];
        const favs = Array.isArray(d.favoriteExpressions) ? d.favoriteExpressions : [];

        const normalized: ShioriBackupData = {
          version: parsed.version || 1,
          appName: parsed.appName || 'Shiori AI Japanese Tutor',
          exportedAt: parsed.exportedAt || Date.now(),
          exportedAtFormatted:
            parsed.exportedAtFormatted ||
            (parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : '未知时间'),
          sourceDevice: parsed.sourceDevice || '未知设备',
          data: d,
          summary: parsed.summary || {
            wordsCount: words.length,
            grammarCount: grammar.length,
            sessionsCount: sessList.length,
            messagesCount: sessList.reduce((sum: number, s: any) => sum + (s.messages?.length || 0), 0),
            presetsCount: presets.length,
            favoritesCount: favs.length,
            hasApiKey: Boolean(d.settings?.apiKey?.trim()),
          },
        };
        return { success: true, data: normalized };
      }

      // 容错：若用户导出了旧版预设或数组
      if (Array.isArray(parsed)) {
        return {
          success: false,
          error: '检测到这是一个单纯的数组列表（如人设预设），请使用全量备份文件进行多端数据恢复。',
        };
      }

      return { success: false, error: '未识别到符合「栞 (Shiori)」规范的学情备份数据。' };
    } catch (err: any) {
      return { success: false, error: `JSON 解析出错：${err?.message || '未知错误'}` };
    }
  };

  /**
   * 全量数据导入恢复（支持增量合并 merge 与全量覆盖 overwrite）
   */
  const importAllData = (
    jsonStr: string,
    mode: 'merge' | 'overwrite' = 'merge'
  ): {
    success: boolean;
    stats?: {
      wordsAdded: number;
      wordsUpdated: number;
      grammarAdded: number;
      sessionsAdded: number;
      mode: 'merge' | 'overwrite';
    };
    error?: string;
  } => {
    const inspection = inspectBackupData(jsonStr);
    if (!inspection.success || !inspection.data) {
      return { success: false, error: inspection.error || '备份文件解析失败' };
    }

    const { data: incomingData } = inspection.data;
    if (!incomingData) {
      return { success: false, error: '备份文件中未找到核心数据' };
    }

    try {
      // 提取 incoming 的各项数据（支持 Array 或 Record 格式）
      const incomingWordsList: LearnedWord[] = Array.isArray(incomingData.learnedWords)
        ? incomingData.learnedWords
        : Object.values(incomingData.learnedWords || {});
      const incomingGrammarList: LearnedGrammar[] = Array.isArray(incomingData.learnedGrammar)
        ? incomingData.learnedGrammar
        : Object.values(incomingData.learnedGrammar || {});
      const incomingSessions: ChatSession[] = Array.isArray(incomingData.sessions)
        ? incomingData.sessions
        : [];
      const incomingPresets: PersonaPreset[] = Array.isArray(incomingData.personaPresets)
        ? incomingData.personaPresets
        : [];
      const incomingFavorites: FavoriteExpression[] = Array.isArray(incomingData.favoriteExpressions)
        ? incomingData.favoriteExpressions
        : [];

      if (mode === 'overwrite') {
        // 全量覆盖模式
        if (incomingData.profile) {
          setProfile(incomingData.profile);
          localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(incomingData.profile));
        }
        if (incomingData.plan) {
          setPlan(incomingData.plan);
          localStorage.setItem(STORAGE_KEYS.PLAN, JSON.stringify(incomingData.plan));
        }

        const sanitizedWords = sanitizeAndEnrichLearnedWords(incomingWordsList);
        setLearnedWords(sanitizedWords);
        localStorage.setItem(STORAGE_KEYS.LEARNED_WORDS, JSON.stringify(sanitizedWords));

        const sanitizedGrammar = sanitizeAndEnrichLearnedGrammar(incomingGrammarList);
        setLearnedGrammar(sanitizedGrammar);
        localStorage.setItem(STORAGE_KEYS.LEARNED_GRAMMAR, JSON.stringify(sanitizedGrammar));

        setFavoriteExpressions(incomingFavorites);
        localStorage.setItem(STORAGE_KEYS.FAVORITE_EXPRESSIONS, JSON.stringify(incomingFavorites));

        if (incomingSessions.length > 0) {
          setSessions(incomingSessions);
          localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(incomingSessions));
          const targetActiveId =
            incomingData.activeSessionId &&
            incomingSessions.some((s) => s.id === incomingData.activeSessionId)
              ? incomingData.activeSessionId
              : incomingSessions[0].id;
          setCurrentSessionId(targetActiveId);
          localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, targetActiveId);
        }

        if (incomingPresets.length > 0) {
          setPersonaPresets(incomingPresets);
          localStorage.setItem(STORAGE_KEYS.PERSONA_PRESETS, JSON.stringify(incomingPresets));
        }

        if (incomingData.settings) {
          // 如果 incoming 未包含 API Key 而本地有，保留本地 key 避免清空
          const mergedSettings: ApiSettings = {
            ...DEFAULT_SETTINGS,
            ...incomingData.settings,
            apiKey: incomingData.settings.apiKey || settings.apiKey || '',
          };
          setSettings(mergedSettings);
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(mergedSettings));
        }

        return {
          success: true,
          stats: {
            wordsAdded: sanitizedWords.length,
            wordsUpdated: 0,
            grammarAdded: sanitizedGrammar.length,
            sessionsAdded: incomingSessions.length,
            mode: 'overwrite',
          },
        };
      } else {
        // 智能增量合并模式（两端学情结合）
        let wordsAdded = 0;
        let wordsUpdated = 0;
        let grammarAdded = 0;
        let sessionsAdded = 0;

        // 1. 合并生词表
        const existingWordsMap = new Map<string, LearnedWord>();
        learnedWords.forEach((w) => existingWordsMap.set(w.surface, w));

        const mergedWordsList: LearnedWord[] = [...learnedWords];
        incomingWordsList.forEach((inWord) => {
          if (!inWord.surface) return;
          const exist = existingWordsMap.get(inWord.surface);
          if (exist) {
            const existRank = MASTERY_RANK[exist.mastery] || 0;
            const inRank = MASTERY_RANK[inWord.mastery] || 0;
            if (inRank > existRank || (inWord.reviewCount || 0) > (exist.reviewCount || 0)) {
              const idx = mergedWordsList.findIndex((w) => w.surface === inWord.surface);
              if (idx >= 0) {
                mergedWordsList[idx] = {
                  ...exist,
                  mastery: inRank > existRank ? inWord.mastery : exist.mastery,
                  reviewCount: Math.max(exist.reviewCount || 0, inWord.reviewCount || 0),
                  meaning: exist.meaning || inWord.meaning,
                  detail: exist.detail || inWord.detail,
                  pitch: exist.pitch !== undefined ? exist.pitch : inWord.pitch,
                };
                wordsUpdated++;
              }
            }
          } else {
            mergedWordsList.push(inWord);
            existingWordsMap.set(inWord.surface, inWord);
            wordsAdded++;
          }
        });
        const finalWords = sanitizeAndEnrichLearnedWords(mergedWordsList);
        setLearnedWords(finalWords);
        localStorage.setItem(STORAGE_KEYS.LEARNED_WORDS, JSON.stringify(finalWords));

        // 2. 合并语法库
        const existingGrammarMap = new Map<string, LearnedGrammar>();
        learnedGrammar.forEach((g) => existingGrammarMap.set(normalizeGrammarKey(g.title), g));

        const mergedGrammarList: LearnedGrammar[] = [...learnedGrammar];
        incomingGrammarList.forEach((inGram) => {
          if (!inGram.title) return;
          const key = normalizeGrammarKey(inGram.title);
          const exist = existingGrammarMap.get(key);
          if (exist) {
            const existRank = MASTERY_RANK[exist.mastery] || 0;
            const inRank = MASTERY_RANK[inGram.mastery] || 0;
            if (inRank > existRank || (inGram.reviewCount || 0) > (exist.reviewCount || 0)) {
              const idx = mergedGrammarList.findIndex(
                (g) => normalizeGrammarKey(g.title) === key
              );
              if (idx >= 0) {
                mergedGrammarList[idx] = {
                  ...exist,
                  mastery: inRank > existRank ? inGram.mastery : exist.mastery,
                  reviewCount: Math.max(exist.reviewCount || 0, inGram.reviewCount || 0),
                  exampleJp: exist.exampleJp || inGram.exampleJp,
                  exampleCn: exist.exampleCn || inGram.exampleCn,
                };
              }
            }
          } else {
            mergedGrammarList.push(inGram);
            existingGrammarMap.set(key, inGram);
            grammarAdded++;
          }
        });
        const finalGrammar = sanitizeAndEnrichLearnedGrammar(mergedGrammarList);
        setLearnedGrammar(finalGrammar);
        localStorage.setItem(STORAGE_KEYS.LEARNED_GRAMMAR, JSON.stringify(finalGrammar));

        // 3. 合并会话历史
        const existingSessionIds = new Set(sessions.map((s) => s.id));
        const newSessions = incomingSessions.filter((s) => !existingSessionIds.has(s.id));
        if (newSessions.length > 0) {
          const mergedSessions = [...sessions, ...newSessions].sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
          );
          setSessions(mergedSessions);
          localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(mergedSessions));
          sessionsAdded = newSessions.length;
        }

        // 4. 合并人设预设
        if (incomingPresets.length > 0) {
          setPersonaPresets((prev) => {
            const existingPresetIds = new Set(prev.map((p) => p.id));
            const newPresets = incomingPresets.filter((p) => !existingPresetIds.has(p.id));
            const next = [...newPresets, ...prev];
            localStorage.setItem(STORAGE_KEYS.PERSONA_PRESETS, JSON.stringify(next));
            return next;
          });
        }

        // 5. 合并收藏夹
        if (incomingFavorites.length > 0) {
          setFavoriteExpressions((prev) => {
            const existingFavSet = new Set(prev.map((f) => `${f.text}__${f.meaning}`));
            const newFavs = incomingFavorites.filter(
              (f) => !existingFavSet.has(`${f.text}__${f.meaning}`)
            );
            const next = [...prev, ...newFavs];
            localStorage.setItem(STORAGE_KEYS.FAVORITE_EXPRESSIONS, JSON.stringify(next));
            return next;
          });
        }

        // 6. 如果本地没有 API Key 但备份中有，自动补齐
        if (!settings.apiKey && incomingData.settings?.apiKey) {
          setSettings((prev) => {
            const next = { ...prev, apiKey: incomingData.settings!.apiKey };
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
            return next;
          });
        }

        return {
          success: true,
          stats: {
            wordsAdded,
            wordsUpdated,
            grammarAdded,
            sessionsAdded,
            mode: 'merge',
          },
        };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || '导入合并处理失败' };
    }
  };

  /**
   * 重置出厂初始化数据（用于需要完全清除测试脏数据时）
   */
  const resetAllData = () => {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.PLAN);
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
    localStorage.removeItem(STORAGE_KEYS.LEARNED_WORDS);
    localStorage.removeItem(STORAGE_KEYS.LEARNED_GRAMMAR);
    localStorage.removeItem(STORAGE_KEYS.FAVORITE_EXPRESSIONS);
    localStorage.removeItem(STORAGE_KEYS.STATS);
    localStorage.removeItem(STORAGE_KEYS.MESSAGES);

    setProfile(DEFAULT_PROFILE);
    setPlan(DEFAULT_PLAN);
    const newSession = createNewDefaultSession();
    setSessions([newSession]);
    setCurrentSessionId(newSession.id);
    setLearnedWords(sanitizeAndEnrichLearnedWords(DEFAULT_LEARNED_WORDS));
    setLearnedGrammar(sanitizeAndEnrichLearnedGrammar(DEFAULT_LEARNED_GRAMMAR));
    setFavoriteExpressions([]);
  };

  return {
    profile,
    setProfile,
    updateProfileLevel,
    plan,
    setPlan,
    toggleTaskCompleted,
    // Sessions & History
    sessions,
    currentSessionId,
    currentSession,
    createNewSession,
    switchSession,
    deleteSession,
    renameSession,
    updateSessionTitleAndSubtitle,
    generateSessionSubtitle,
    clearAllSessions,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    ingestKnowledgeAndTokens,
    settings,
    setSettings,
    currentMode,
    setCurrentMode,
    currentScenario,
    setCurrentScenario,
    planModalOpen,
    setPlanModalOpen,
    assessmentModalOpen,
    setAssessmentModalOpen,
    kanaModalOpen,
    setKanaModalOpen,
    grammarModalOpen,
    setGrammarModalOpen,
    settingsModalOpen,
    setSettingsModalOpen,
    historyDrawerOpen,
    setHistoryDrawerOpen,
    // Knowledge & Memory
    learnedWords,
    setLearnedWords,
    learnedGrammar,
    setLearnedGrammar,
    addLearnedWord,
    addLearnedGrammar,
    removeLearnedWord,
    removeLearnedGrammar,
    updateWordMastery,
    updateGrammarMastery,
    recordReviewResult,
    // Favorites (手动收藏的短语 / 句型 / 整句)
    favoriteExpressions,
    setFavoriteExpressions,
    addFavoriteExpression,
    removeFavoriteExpression,
    clearFavoriteExpressions,
    knowledgeModalOpen,
    setKnowledgeModalOpen,
    knowledgeModalTab,
    setKnowledgeModalTab,
    // Persona Presets
    personaPresets,
    savePersonaPreset,
    applyPersonaPreset,
    deletePersonaPreset,
    exportPersonaPresets,
    importPersonaPresets,
    // Backup & Sync
    exportAllData,
    inspectBackupData,
    importAllData,
    resetAllData,
  };
}

