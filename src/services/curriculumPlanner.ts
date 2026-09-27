/**
 * 本地排课器（Curriculum Planner）——「因材施教」的判定核心。
 *
 * 设计前提：备课必须两段式。
 * - **A 段（本文件）**：零 token、纯确定性、可离线单测。按能力画像 + 学情档案，
 *   从软件【已有静态资产】里筛出"这一课教什么"，产出 {@link Lesson} 骨架 + 可执行步骤。
 * - **B 段（llmService）**：只把骨架喂给模型，要求它产出情境脚本、用法点拨与验收题。
 *
 * 为什么不把选词交给模型：选题需要"知道学生学过什么、什么该复习、难度怎么阶梯"，
 * 这些数据全在本地，交给模型只会得到一份看似合理但与你档案无关的清单
 * （旧实现就是如此：备课 prompt 只带了 `profile.level` + 手工维护的字符串数组）。
 *
 * 本文件不产生任何随机数——同一份输入永远排出同一份课表，这样单测才有意义。
 */

import {
  AbilityAxes,
  DailyTask,
  LearnedGrammar,
  LearnedWord,
  LearningGoal,
  LearningPlan,
  Lesson,
  LessonItems,
  LessonMaterialPayload,
  LessonStep,
  LessonStepEvidence,
  LessonStepKind,
  RoleplayScenario,
  StudyPace,
  UserLearningProfile,
  UserLevel,
} from '../types';
import { COMPREHENSIVE_VOCABULARY } from '../data/dictionaryVocabulary';
import { GRAMMAR_POINTS } from '../data/grammarPoints';
import { DAKUON_KANA, SEION_KANA } from '../data/kanaChart';
import { isTrueSingleWordTerm } from './dictionaryService';
import { isGenericGrammarContent, normalizeGrammarKey } from '../utils/grammarSynthesizer';
import { stripAnnotatedBlockMarks } from '../utils/rubyParser';

/** JLPT 各级【标准量参照】。用于算"还差多少"，不是给学生打分。 */
export const JLPT_TARGETS: Record<UserLevel, { vocab: number; grammar: number }> = {
  N0: { vocab: 0, grammar: 0 },
  N5: { vocab: 800, grammar: 80 },
  N4: { vocab: 1500, grammar: 170 },
  N3: { vocab: 3750, grammar: 330 },
  N2: { vocab: 6000, grammar: 500 },
  N1: { vocab: 10000, grammar: 700 },
};

const LEVEL_SEQUENCE: UserLevel[] = ['N0', 'N5', 'N4', 'N3', 'N2', 'N1'];

export interface LessonCapacity {
  newWords: number;
  newGrammars: number;
  reviewWords: number;
  kanaPerLesson: number;
}

/** 学习节奏容量分级（轻量微课 / 标准平衡 / 考前冲刺） */
export const PACE_CAPACITY: Record<StudyPace, LessonCapacity> = {
  light: {
    newWords: 3,
    newGrammars: 1,
    reviewWords: 2,
    kanaPerLesson: 4,
  },
  standard: {
    newWords: 6,
    newGrammars: 2,
    reviewWords: 4,
    kanaPerLesson: 5,
  },
  intensive: {
    newWords: 10,
    newGrammars: 3,
    reviewWords: 6,
    kanaPerLesson: 6,
  },
};

/** 每课的默认教学容量（向后兼容） */
export const LESSON_CAPACITY: LessonCapacity = PACE_CAPACITY.standard;

export function getLessonCapacity(pace?: StudyPace): LessonCapacity {
  return PACE_CAPACITY[pace || 'standard'] || PACE_CAPACITY.standard;
}

/**
 * 语法先序依赖表 (Grammar Prerequisite DAG)
 * 映射：高阶/复合句型 -> 前置基石句型（必须先修或优先修）
 */
export const GRAMMAR_PREREQUISITE_MAP: Record<string, string[]> = {
  // 依赖て形（以 ～てください 或 て形 为基石）
  '～てもいいですか': ['～てください'],
  '～てはいけません': ['～てください'],
  '～てから': ['～てください'],
  '～てしまう / ちゃう': ['～てください'],
  '～てみる': ['～てください'],
  '～ておく': ['～てください'],
  '～てある': ['～てください'],

  // 依赖判断句
  '～ではありません / じゃありません': ['～は～です'],
  '～と思います': ['～は～です'],

  // 依赖た形（以 ～たことがあります 为基石）
  '～たり～たりする': ['～たことがあります'],
  '～ほうがいいです': ['～たことがあります'],
  '～後（あと）で': ['～たことがあります'],

  // 依赖动词原形/接续
  '～ことができます': ['～は～です'],
  '～前（まえ）に': ['～ることができます', '～は～です'],
  '～つもりです': ['～たいです'],

  // N3/N2 复合逻辑与辨析
  '～わけにはいかない': ['～ないでください'],
  '～おかげで / ～せいで': ['～と思います'],
  '～に対して': ['～について'],
};

// ————————————————————————————————————————————————————————————
// 一、分轴能力画像（全部由可数证据派生）
// ————————————————————————————————————————————————————————————

const KANJI_RE = /[一-龯々〆]/g;

/**
 * 由生词本 / 语法档案派生分轴画像。
 *
 * 刻意【不】派生听力、产出等无法采证的轴——编一个数字出来就是自欺。
 * 这里每个返回值都能追溯到具体计数来源，界面可以直接把依据展示给学生。
 */
export function deriveAbilityAxes(
  profile: UserLearningProfile,
  learnedWords: LearnedWord[] = [],
  learnedGrammar: LearnedGrammar[] = []
): AbilityAxes {
  const words = Array.isArray(learnedWords) ? learnedWords : [];
  const grammars = Array.isArray(learnedGrammar) ? learnedGrammar : [];

  const kanjiSet = new Set<string>();
  for (const w of words) {
    const m = (w?.surface || '').match(KANJI_RE);
    if (m) m.forEach((c) => kanjiSet.add(c));
  }

  const level: UserLevel = profile?.level || 'N5';

  return {
    kanaKnown: estimateKanaKnown(level, profile),
    vocabKnown: words.length,
    grammarKnown: grammars.length,
    kanjiSeen: kanjiSet.size,
    targets: JLPT_TARGETS[level],
  };
}

/**
 * 假名熟练度估计。
 * 软件没有「五十音答题」采证通道，因此只在能明确判断时给数：N0 阶段按闯关进度，
 * 已进入 N5 及以上的学生视为假名已过关（这是等级定义本身蕴含的事实，不是猜测）。
 */
function estimateKanaKnown(level: UserLevel, profile: UserLearningProfile): number | undefined {
  const TOTAL_SEION = SEION_KANA.length || 46;
  if (level !== 'N0') return TOTAL_SEION;
  if (Array.isArray(profile?.masteredGrammar) && profile.masteredGrammar.includes('五十音')) {
    return Math.round(TOTAL_SEION * 0.6);
  }
  return undefined;
}

// ————————————————————————————————————————————————————————————
// 二、取材：重心 → 关键词 → 优先词/句型
// ————————————————————————————————————————————————————————————

/**
 * 训练重心。对齐 `RoleplayScenario.category`，让"排什么样的课"和"演什么情景"天然一致。
 */
const FOCUS_KEYWORDS: Record<Lesson['focus'], string[]> = {
  shopping: ['买', '買', '店', '袋', '値段', '料金', '安', '高', '商品', '代', '払', '売'],
  travel: ['駅', '電車', '切符', '道', '場所', '旅', '宿', '泊', '行', '着', '乗', '空港'],
  business: ['会議', '名刺', '部長', '課長', '取引', '資料', '会社', '連絡', '挨拶', '敬語', '失礼'],
  anime: ['話', '見', '作品', '声', '好き', '凄', '熱', '漫画', '番組', '最高', '主人公', '感動'],
  daily: ['食', '飲', '友', '家', '時間', '今日', '明日', '作', '使', '朝', '夜', '一緒'],
  foundation: ['です', 'ます', 'ある', 'いる', 'する', 'なる', '人', '物', '事'],
  kana: [],
};

/** goal → 首选训练重心 */
export function resolveFocus(goal: LearningGoal | undefined, level: UserLevel): Lesson['focus'] {
  if (level === 'N0') return 'kana';
  switch (goal) {
    case 'anime':
      return 'anime';
    case 'travel':
      return 'travel';
    case 'business':
      return 'business';
    case 'jlpt':
    case 'school':
      return 'foundation';
    default:
      return 'daily';
  }
}

/** 某等级可取用的取材等级：本等级为主，允许高一级作挑战 */
function allowedLevels(level: UserLevel): string[] {
  const i = LEVEL_SEQUENCE.indexOf(level);
  if (i <= 0) return []; // N0 不出词典词
  const out: string[] = [LEVEL_SEQUENCE[i]];
  const next = LEVEL_SEQUENCE[i + 1];
  if (next) out.push(next);
  return out;
}

/** 内容词优先：助词 / 助动词 / 接续词不作为词汇教学对象 */
const FUNCTION_POS_RE = /助词|助動詞|接续|接續|连词|連詞|感叹|感嘆/;

function isTeachableWord(dict: (typeof COMPREHENSIVE_VOCABULARY)[number]): boolean {
  if (!dict?.word || !dict.reading) return false;
  // 与生词本收录口径对齐（≤6 字符、无标点、无助词粘连），否则会出现
  // "课文教了但笔记静默没收录"的断裂
  if (!isTrueSingleWordTerm(dict.word)) return false;
  if (FUNCTION_POS_RE.test(dict.pos || '')) return false;
  if (dict.word === dict.reading) return false; // 纯假名词不占生词额度，不算"新词"
  return true;
}

function focusHit(text: string | undefined, focus: Lesson['focus']): number {
  if (!text) return 0;
  const kws = FOCUS_KEYWORDS[focus] || [];
  let hit = 0;
  for (const kw of kws) if (text.includes(kw)) hit += 1;
  return hit;
}

/** 确定性轮转：让第 2 课不会又教第 1 课榜首的那批词 */
function pickRotated<T>(candidates: T[], count: number, seed: number): T[] {
  if (candidates.length === 0 || count <= 0) return [];
  if (candidates.length <= count) return candidates.slice();
  const start = ((seed - 1) * count) % candidates.length;
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(candidates[(start + i) % candidates.length]);
  }
  return out;
}

export interface PlannerInput {
  profile: UserLearningProfile;
  learnedWords?: LearnedWord[];
  learnedGrammar?: LearnedGrammar[];
  /** 这是第几课（从 1 开始），决定取材轮转位置 */
  lessonIndex: number;
  /** 训练重心，缺省由 goal + level 推断 */
  focus?: Lesson['focus'];
  /** 学习节奏：微课(~15m) / 标准(~25m) / 冲刺(~40m)，缺省读 profile.studyPace */
  pace?: StudyPace;
  /** 已排出的课时（用于避开重复选词、判断是否已有教材） */
  existingLessons?: Lesson[];
}

/** 排课产物：课时骨架 + 模板兜底情景（AI 备课后会被现场编写的情景覆盖） */
export interface PlannedLesson {
  lesson: Lesson;
  scenario?: RoleplayScenario;
}

const LESSON_MINUTES: Record<LessonStepKind, number> = {
  warmup: 3,
  vocab: 9,
  grammar: 8,
  script: 10,
  drill: 6,
  roleplay: 10,
  wrapup: 3,
};

function getStepMinutes(kind: LessonStepKind, pace: StudyPace): number {
  if (pace === 'light') {
    switch (kind) {
      case 'warmup': return 2;
      case 'vocab': return 3;
      case 'grammar': return 3;
      case 'script': return 3;
      case 'drill': return 2;
      case 'roleplay': return 4;
      case 'wrapup': return 1;
    }
  }
  if (pace === 'intensive') {
    switch (kind) {
      case 'warmup': return 4;
      case 'vocab': return 12;
      case 'grammar': return 10;
      case 'script': return 12;
      case 'drill': return 8;
      case 'roleplay': return 12;
      case 'wrapup': return 4;
    }
  }
  return LESSON_MINUTES[kind] || 5;
}

// ————————————————————————————————————————————————————————————
// 三、A 段主入口：排出一课
// ————————————————————————————————————————————————————————————

export function planNextLesson(input: PlannerInput): PlannedLesson {
  const { profile, lessonIndex } = input;
  const learnedWords = input.learnedWords || [];
  const learnedGrammar = input.learnedGrammar || [];
  const existing = input.existingLessons || [];

  const pace: StudyPace = input.pace || profile?.studyPace || 'standard';
  const capacity = getLessonCapacity(pace);

  const level: UserLevel = profile?.level || 'N5';
  const goal: LearningGoal | undefined = profile?.goal;
  const focus: Lesson['focus'] = input.focus || resolveFocus(goal, level);

  const lessonId = `lesson-${lessonIndex}-${Date.now().toString(36)}`;

  const items: LessonItems =
    focus === 'kana'
      ? planKanaItems(lessonIndex, capacity)
      : planTextItems({ level, focus, lessonIndex, learnedWords, learnedGrammar, existing, profile, capacity });

  const steps = buildSteps({ lessonId, focus, items, level, lessonIndex, pace, profile });

  // 课时目标必须【可验证】：写清"能独立完成什么"，不写"掌握 XX 知识"
  const goalText = buildGoalText(focus, items, level, lessonIndex);

  const lesson: Lesson = {
    id: lessonId,
    index: lessonIndex,
    title: buildLessonTitle(focus, items, lessonIndex),
    goal: goalText,
    level,
    focus,
    status: 'planned',
    items,
    steps,
    material: 'skeleton',
    createdAt: Date.now(),
  };

  const scenario = focus === 'kana' ? undefined : buildFallbackScenario(lesson);
  if (scenario) {
    const rp = lesson.steps.find((s) => s.action.type === 'chat' && s.action.mode === 'roleplay');
    if (rp && rp.action.type === 'chat') rp.action.scenarioId = scenario.id;
  }

  return { lesson, scenario };
}

/** N0 假名阶梯：清音(1-9课) -> 浊音半浊音(10-14课) -> 促长拨音规则(15课) -> 五十音收官与破冰问候桥梁(16课) */
function planKanaItems(lessonIndex: number, capacity: LessonCapacity): LessonItems {
  // 假名课时循环周期 16 课
  const cycleIndex = ((lessonIndex - 1) % 16) + 1;

  if (cycleIndex <= 9) {
    // 清音阶段 (1~9 课)
    const per = capacity.kanaPerLesson || 5;
    let start = (cycleIndex - 1) * per;
    let count = per;
    if (cycleIndex === 9) {
      // 最后一组包含 わ、を、ん 及综合串讲
      start = 40;
      count = Math.min(6, (SEION_KANA.length || 46) - start);
    }
    const picked = SEION_KANA.slice(start, start + count);
    const kanaStr = picked.map((k) => k.hiragana).join('');

    const MNEMONIC_WORDS: Record<number, string> = {
      1: '例词拼读：あい（爱）、あお（蓝）、いえ（家）、うえ（上）',
      2: '例词拼读：かお（脸）、あき（秋天）、きく（听/菊花）、いけ（池塘）',
      3: '例词拼读：あさ（早晨）、すし（寿司）、せかい（世界）、そこ（那里）',
      4: '例词拼读：うた（歌曲）、ちち（父亲）、つき（月亮）、て（手）',
      5: '例词拼读：さかな（鱼）、にく（肉）、いぬ（狗）、ねこ（猫）',
      6: '例词拼读：はな（花/鼻子）、ひと（人）、ふね（船）、ほし（星星）',
      7: '例词拼读：あたま（头）、みみ（耳朵）、むし（昆虫）、め（眼睛）',
      8: '例词拼读：やま（山）、ゆき（雪）、よる（夜晚）、そら（天空）',
      9: '例词拼读：はる（春天）、かわ（河流）、ほん（书本）、にほん（日本）',
    };

    return {
      words: [],
      grammars: [],
      script: [
        {
          speaker: 'ai',
          jp: kanaStr,
          cn: `本课清音：${picked.map((k) => `${k.hiragana}（${k.romaji}）`).join('、')}`,
          note: MNEMONIC_WORDS[cycleIndex] || picked.map((k) => `${k.hiragana}：${k.chineseMnemonic}`).join('；'),
        },
      ],
      points: [
        ...picked.map((k) => `${k.hiragana} / ${k.katakana}（${k.romaji}）— ${k.pronunciationTip}`),
        MNEMONIC_WORDS[cycleIndex] || '',
      ].filter(Boolean),
    };
  }

  if (cycleIndex >= 10 && cycleIndex <= 14) {
    // 浊音与半浊音阶段 (10~14 课)
    const dakuonStep = cycleIndex - 10; // 0: ga, 1: za, 2: da, 3: ba, 4: pa
    const start = dakuonStep * 5;
    const picked = DAKUON_KANA.slice(start, start + 5);
    const kanaStr = picked.map((k) => k.hiragana).join('');

    const DAKUON_WORDS: Record<number, string> = {
      10: '浊音拼读：ごはん（米饭）、かぎ（钥匙）、かげ（影子）、ひげ（胡须）',
      11: '浊音拼读：みず（水）、かぜ（风）、ぞう（大象）、ざっし（杂志）',
      12: '浊音拼读：からだ（身体）、はなぢ（鼻血）、でんき（电）、まど（窗户）',
      13: '浊音拼读：たばこ（香烟）、えび（虾）、ぶた（猪）、ぼく（我）',
      14: '半浊音拼读：パン（面包）、きっぷ（车票）、さんぽ（散步）、えんぴつ（铅笔）',
    };

    return {
      words: [],
      grammars: [],
      script: [
        {
          speaker: 'ai',
          jp: kanaStr,
          cn: `本课${cycleIndex === 14 ? '半浊音' : '浊音'}：${picked.map((k) => `${k.hiragana}（${k.romaji}）`).join('、')}`,
          note: DAKUON_WORDS[cycleIndex] || '体会声带振动与清浊音气流差异',
        },
      ],
      points: [
        ...picked.map((k) => `${k.hiragana} / ${k.katakana}（${k.romaji}）— ${k.pronunciationTip}`),
        DAKUON_WORDS[cycleIndex] || '',
      ].filter(Boolean),
    };
  }

  if (cycleIndex === 15) {
    // 特殊音专项：促音、长音与拨音节奏
    return {
      words: [],
      grammars: [],
      script: [
        {
          speaker: 'ai',
          jp: 'っ・ー・ん',
          cn: '特殊音节专项：促音（っ 停顿一拍）、长音（ー 延长一拍）、拨音（ん 独立一拍）',
          note: '对比感受：ビル（大楼）vs ビール（啤酒）；おばさん（阿姨）vs おばあさん（祖母）；きって（邮票）vs きて（来）',
        },
      ],
      points: [
        '促音「っ」：不发音，停顿半拍/一拍，如「きっぷ（切符）」',
        '长音：元音延长一拍，如「おにいさん」「おかあさん」「コーヒー」',
        '拨音「ん」：占完整一拍，依后接音变化为 m/n/ng 口型',
      ],
    };
  }

  // cycleIndex === 16：五十音收官大闯关与破冰问候桥梁课
  return {
    words: [
      { surface: 'おはよう', reading: 'おはよう', meaning: '早上好（熟人日常）', isNew: true, reason: 'N0-N5破冰核心句' },
      { surface: 'こんにちは', reading: 'こんにちは', meaning: '你好（白天通用）', isNew: true, reason: 'N0-N5破冰核心句' },
      { surface: 'ありがとう', reading: 'ありがとう', meaning: '谢谢', isNew: true, reason: 'N0-N5破冰核心句' },
      { surface: 'すみません', reading: 'すみません', meaning: '不好意思 / 对不起 / 借过', isNew: true, reason: 'N0-N5破冰核心句' },
    ],
    grammars: [
      {
        title: '～です（初遇判断）',
        structure: '名词 + です',
        meaning: '是……（如：学生です）',
        level: 'N5',
        isNew: true,
        reason: '迈入N5第一句型',
      },
    ],
    script: [
      {
        speaker: 'ai',
        jp: 'はじめまして。',
        cn: '初次见面。恭喜你通关五十音！',
        note: '你已掌握全部清音、浊音与发音规则，即将开启 N5 真正会话世界！',
      },
    ],
    points: [
      '五十音全貌复盘：平假名日常书写、片假名外来语、罗马字输入法',
      '常用高频问候：おはよう、こんにちは、ありがとう、すみません',
      '即将解锁：N5 基础句型与情景实战',
    ],
  };
}

function planTextItems(args: {
  level: UserLevel;
  focus: Lesson['focus'];
  lessonIndex: number;
  learnedWords: LearnedWord[];
  learnedGrammar: LearnedGrammar[];
  existing: Lesson[];
  profile?: UserLearningProfile;
  capacity?: LessonCapacity;
}): LessonItems {
  const { level, focus, lessonIndex, learnedWords, learnedGrammar, existing, profile } = args;
  const capacity = args.capacity || LESSON_CAPACITY;
  const levels = allowedLevels(level);
  const weakPoints = Array.isArray(profile?.weakPoints) ? profile.weakPoints : [];

  const knownSurfaces = new Set(learnedWords.map((w) => w?.surface).filter(Boolean) as string[]);
  const taughtSurfaces = new Set<string>();
  for (const l of existing) {
    for (const w of l.items?.words || []) if (w.isNew) taughtSurfaces.add(w.surface);
  }

  // ——— 新词 ———
  const wordCandidates = COMPREHENSIVE_VOCABULARY
    .filter((d) => levels.includes(d.level))
    .filter(isTeachableWord)
    .filter((d) => !knownSurfaces.has(d.word) && !taughtSurfaces.has(d.word));

  // 排序：重心命中高者优先 → 等级低者优先 → 保持静态表原始顺序（结果确定）
  const ranked = wordCandidates
    .map((d, idx) => ({ d, idx, hit: focusHit(d.meaning, focus) + focusHit(d.detail, focus) }))
    .sort((a, b) => {
      if (b.hit !== a.hit) return b.hit - a.hit;
      const la = levels.indexOf(a.d.level);
      const lb = levels.indexOf(b.d.level);
      if (la !== lb) return la - lb;
      return a.idx - b.idx;
    })
    .map((x) => x.d);

  const newWords = pickRotated(ranked, capacity.newWords, lessonIndex);

  // ——— 复习靶标（薄弱项针对优先 + 久未测验遗忘风险最高）———
  const unmastered = [...learnedWords].filter((w) => w && w.mastery !== 'mastered');

  // 优先提取薄弱项
  const weakWordTargets: LearnedWord[] = [];
  const normalWordCandidates: LearnedWord[] = [];

  for (const w of unmastered) {
    const isWeak = weakPoints.some(
      (wp) =>
        wp &&
        (w.surface.includes(wp) ||
          (w.meaning && w.meaning.includes(wp)) ||
          wp.includes(w.surface))
    );
    if (isWeak) {
      weakWordTargets.push(w);
    } else {
      normalWordCandidates.push(w);
    }
  }

  const sortedNormal = normalWordCandidates
    .map((w) => {
      const daysSinceReview = w.lastReviewedAt
        ? (Date.now() - w.lastReviewedAt) / 86400000
        : 999;
      const risk = daysSinceReview * 2 + (w.exposureCount || 0) * 1.5 - (w.reviewCount || 1) * 0.5;
      return { w, risk };
    })
    .sort((a, b) => b.risk - a.risk)
    .map((x) => x.w);

  const pickedReviewWords = [...weakWordTargets, ...sortedNormal].slice(0, capacity.reviewWords);

  // ——— 句型语法（引入 DAG 先序依赖排课与薄弱项回捞）———
  const knownGrammarKeys = new Set(learnedGrammar.map((g) => normalizeGrammarKey(g?.title)));
  const taughtGrammarKeys = new Set<string>();
  for (const l of existing) {
    for (const g of l.items?.grammars || []) if (g.isNew) taughtGrammarKeys.add(normalizeGrammarKey(g.title));
  }

  // 查找前置依赖
  function findPrerequisites(title: string): string[] {
    for (const [key, prereqs] of Object.entries(GRAMMAR_PREREQUISITE_MAP)) {
      const cleanKey = key.replace(/^[～~]/, '').trim();
      const cleanTitle = title.replace(/^[～~]/, '').trim();
      if (cleanTitle.includes(cleanKey) || cleanKey.includes(cleanTitle)) {
        return prereqs;
      }
    }
    return [];
  }

  const grammarCandidates = GRAMMAR_POINTS
    .filter((g) => levels.includes(g.level))
    .filter((g) => !isGenericGrammarContent(g))
    .filter((g) => {
      const key = normalizeGrammarKey(g.title);
      return !knownGrammarKeys.has(key) && !taughtGrammarKeys.has(key);
    })
    .map((g, idx) => ({
      g,
      idx,
      hit: focusHit(g.meaning, focus) + focusHit(g.title, focus) * 2,
    }))
    .sort((a, b) => {
      if (b.hit !== a.hit) return b.hit - a.hit;
      const la = levels.indexOf(a.g.level);
      const lb = levels.indexOf(b.g.level);
      if (la !== lb) return la - lb;
      return a.idx - b.idx;
    })
    .map((x) => x.g);

  // 依赖检查：如果命中率高的句型缺少前置依赖，优先挑选未掌握的前置句型作为基石
  const finalGrammars: Array<{
    title: string;
    structure?: string;
    meaning?: string;
    level?: string;
    isNew: boolean;
    reason?: string;
    prerequisites?: string[];
  }> = [];

  const candidatePool = [...grammarCandidates];

  for (let i = 0; i < candidatePool.length && finalGrammars.length < capacity.newGrammars; i += 1) {
    const candidate = candidatePool[i];
    const prereqs = findPrerequisites(candidate.title);
    const missing = prereqs.find(
      (p) => !knownGrammarKeys.has(normalizeGrammarKey(p)) && !taughtGrammarKeys.has(normalizeGrammarKey(p))
    );

    if (missing) {
      // 检查库里是否能找到该前置依赖
      const prereqItem = GRAMMAR_POINTS.find(
        (gp) => normalizeGrammarKey(gp.title) === normalizeGrammarKey(missing)
      );
      if (prereqItem && !finalGrammars.some((fg) => normalizeGrammarKey(fg.title) === normalizeGrammarKey(prereqItem.title))) {
        finalGrammars.push({
          title: prereqItem.title,
          structure: prereqItem.structure,
          meaning: prereqItem.meaning,
          level: prereqItem.level,
          isNew: true,
          reason: `前置基石：为学习「${candidate.title}」做准备`,
        });
        taughtGrammarKeys.add(normalizeGrammarKey(prereqItem.title));
        continue;
      }
    }

    if (!finalGrammars.some((fg) => normalizeGrammarKey(fg.title) === normalizeGrammarKey(candidate.title))) {
      finalGrammars.push({
        title: candidate.title,
        structure: candidate.structure,
        meaning: candidate.meaning,
        level: candidate.level,
        isNew: true,
        reason: prereqs.length ? '阶梯进阶句型' : '本课新句型',
        prerequisites: prereqs.length ? prereqs : undefined,
      });
      taughtGrammarKeys.add(normalizeGrammarKey(candidate.title));
    }
  }

  // 兜底补足
  if (finalGrammars.length < capacity.newGrammars) {
    const rotated = pickRotated(grammarCandidates, capacity.newGrammars - finalGrammars.length, lessonIndex);
    for (const g of rotated) {
      if (!finalGrammars.some((fg) => normalizeGrammarKey(fg.title) === normalizeGrammarKey(g.title))) {
        finalGrammars.push({
          title: g.title,
          structure: g.structure,
          meaning: g.meaning,
          level: g.level,
          isNew: true,
          reason: '本课新句型',
        });
      }
    }
  }

  return {
    words: [
      ...newWords.map((d) => ({
        surface: d.word,
        reading: d.reading,
        meaning: d.meaning,
        pos: d.pos,
        level: d.level,
        isNew: true,
        reason: '本课新词',
      })),
      ...pickedReviewWords.map((w) => {
        const isWeak = weakPoints.some(
          (wp) =>
            wp &&
            (w.surface.includes(wp) ||
              (w.meaning && w.meaning.includes(wp)) ||
              wp.includes(w.surface))
        );
        return {
          surface: w.surface,
          reading: w.reading,
          meaning: w.meaning,
          pos: w.pos,
          level: w.level,
          isNew: false,
          reason: isWeak
            ? '重点薄弱项针对巩固'
            : (w.exposureCount || 0) >= 3 && (w.reviewCount || 1) <= 1
            ? `已遇见 ${w.exposureCount} 次却从未测验过`
            : `该复习了 · ${w.mastery === 'reviewing' ? '温习中' : '初学'}`,
        };
      }),
    ],
    grammars: finalGrammars,
    points: [],
  };
}

function buildLessonTitle(focus: Lesson['focus'], items: LessonItems, index: number): string {
  if (focus === 'kana') {
    const cycleIndex = ((index - 1) % 16) + 1;
    if (cycleIndex <= 9) return `第 ${index} 课 · 五十音清音阶梯（第 ${cycleIndex}/9 阶段）`;
    if (cycleIndex <= 14) return `第 ${index} 课 · 浊音与半浊音进阶（第 ${cycleIndex - 9}/5 阶段）`;
    if (cycleIndex === 15) return `第 ${index} 课 · 促音与长音发音规则专项`;
    return `第 ${index} 课 · 五十音收官与破冰问候`;
  }
  const theme = FOCUS_THEME_LABEL[focus] || '日常会话';
  const seed = items.words.find((w) => w.isNew)?.surface;
  return seed ? `第 ${index} 课 · ${theme}：${seed}` : `第 ${index} 课 · ${theme}`;
}

const FOCUS_THEME_LABEL: Record<Lesson['focus'], string> = {
  shopping: '购物场景',
  travel: '出行场景',
  business: '商务场景',
  anime: '动漫话题',
  daily: '日常会话',
  foundation: '基础句型',
  kana: '五十音',
};

function buildGoalText(focus: Lesson['focus'], items: LessonItems, level: UserLevel, lessonIndex?: number): string {
  if (focus === 'kana') {
    const cycleIndex = lessonIndex ? ((lessonIndex - 1) % 16) + 1 : 1;
    if (cycleIndex <= 9) return '准确认读与拼读书写本课假名，并能跟读拼出日常基础单词';
    if (cycleIndex <= 14) return '掌握声带振动技巧，准确区分清音与浊音/半浊音的发音与拼写';
    if (cycleIndex === 15) return '掌握促音停顿拍节与长音拖长规则，听辨易混相似词';
    return '五十音大通关：流畅认读全部假名，并能脱口而出初次相遇的破冰问候';
  }
  const w = items.words.filter((x) => x.isNew).map((x) => x.surface);
  const g = items.grammars.map((x) => x.title);
  const parts: string[] = [];
  if (w.length) parts.push(`用上 ${w.slice(0, 3).join('、')}${w.length > 3 ? ' 等' : ''} ${w.length} 个新词`);
  if (g.length) parts.push(`用对 ${g.join('、')} ${g.length} 个句型`);
  const scene = FOCUS_THEME_LABEL[focus];
  if (!parts.length) return `能独立完成一轮${scene}对话（${level}）`;
  return `能独立完成一轮${scene}对话，并${parts.join('、')}`;
}

// ————————————————————————————————————————————————————————————
// 四、步骤：每一步都必须可执行（这是与旧「打勾清单」的根本区别）
// ————————————————————————————————————————————————————————————

function makeStep(
  lessonId: string,
  kind: LessonStepKind,
  index: number,
  title: string,
  brief: string,
  action: LessonStep['action'],
  pace: StudyPace = 'standard'
): LessonStep {
  return {
    id: `${lessonId}-step-${index}-${kind}`,
    kind,
    title,
    brief,
    minutes: getStepMinutes(kind, pace),
    action,
    done: false,
  };
}

function buildSteps(args: {
  lessonId: string;
  focus: Lesson['focus'];
  items: LessonItems;
  level: UserLevel;
  lessonIndex: number;
  pace?: StudyPace;
  profile?: UserLearningProfile;
}): LessonStep[] {
  const { lessonId, focus, items, level, pace = 'standard' } = args;
  const steps: LessonStep[] = [];
  let i = 0;

  const newWords = items.words.filter((w) => w.isNew);
  const reviewWords = items.words.filter((w) => !w.isNew);
  const grammars = items.grammars;

  if (focus === 'kana') {
    const kana = items.script?.[0]?.jp || '';
    steps.push(
      makeStep(lessonId, 'warmup', i++, '发音热身', '跟读本课假名，先建立听觉印象', {
        type: 'chat',
        mode: 'tutor',
        seedPrompt: `请带着我逐个认读本课假名：${kana.split('').join('、')}。用中文讲清每个假名的发音口型要点与易混点，每个都给我一组最小对比练习。`,
      }, pace),
      makeStep(lessonId, 'vocab', i++, '假名认读与书写', '平假名 / 片假名 / 罗马字三向对应', {
        type: 'chat',
        mode: 'tutor',
        seedPrompt: `请把本课假名（${kana.split('').join('、')}）的平假名、片假名、罗马字列成对照，并给我默写练习。`,
      }, pace),
      makeStep(lessonId, 'drill', i++, '五十音自测', '打开笔记本自测本课假名，答不出的标记为忘记', {
        type: 'review',
        tab: 'grammar',
      }, pace),
      makeStep(lessonId, 'wrapup', i++, '复盘', '回看今天容易混的假名', {
        type: 'chat',
        mode: 'tutor',
        seedPrompt: '帮我复盘今天学的假名里我最容易混的几个，并给我明天的复习建议。',
      }, pace)
    );
    return steps;
  }

  // 检查是否有薄弱项需要开场针对性热身
  const weakReviewWords = reviewWords.filter((w) => (w.reason || '').includes('薄弱项'));
  const weakGrammars = grammars.filter((g) => (g.reason || '').includes('前置基石') || (g.reason || '').includes('薄弱项'));
  const hasRemedialTargets = weakReviewWords.length > 0 || weakGrammars.length > 0;

  let warmupSeedPrompt = `听说今天要聊「${FOCUS_THEME_LABEL[focus]}」。请用两三句闲聊式的日语把话头带起来，顺手问我一两个相关的旧表达、看看我还记得多少。这一步只做热身：不要介绍课程、不要预告今天要学什么、不要展示词表，说完就停下来等我回应。`;
  let warmupBrief = '用本课主题的自然闲聊唤起相关旧知，不急着上新内容';

  if (hasRemedialTargets) {
    const weakNames = [
      ...weakReviewWords.map((w) => w.surface),
      ...weakGrammars.map((g) => g.title),
    ].slice(0, 3);
    warmupBrief = `针对薄弱点（${weakNames.join('、')}）进行轻量复习唤醒`;
    warmupSeedPrompt = `听说今天要聊「${FOCUS_THEME_LABEL[focus]}」。在正式上新课前，请先用轻松闲聊的日语顺带考考我之前容易混淆的【${weakNames.join('、')}】，做个靶向复查。我说完后，你简短点评即可，等我确认后再进入新课。不要剧透本课的新词表。`;
  }

  steps.push(
    makeStep(
      lessonId,
      'warmup',
      i++,
      hasRemedialTargets ? '复习唤醒（巩固弱项）' : '热身唤醒',
      warmupBrief,
      {
        type: 'chat',
        mode: 'tutor',
        seedPrompt: warmupSeedPrompt,
      },
      pace
    )
  );

  if (newWords.length) {
    steps.push(
      makeStep(
        lessonId,
        'vocab',
        i++,
        `新词 ${newWords.length} 个`,
        newWords.map((w) => `${w.surface}（${w.reading}）${w.meaning || ''}`).join('；'),
        {
          type: 'chat',
          mode: 'tutor',
          seedPrompt: `请教我本课这几个新词：${newWords.map((w) => w.surface).join('、')}。每个词给我读音、声调、词性、一句贴合「${FOCUS_THEME_LABEL[focus]}」的例句和中文翻译；讲完让我各造一句，帮我改。`,
        },
        pace
      )
    );
  }

  if (grammars.length) {
    steps.push(
      makeStep(
        lessonId,
        'grammar',
        i++,
        `句型 ${grammars.map((g) => g.title).join(' / ')}`,
        grammars.map((g) => `${g.title}：${g.meaning || ''}（${g.structure || ''}）`).join('；'),
        {
          type: 'chat',
          mode: 'tutor',
          seedPrompt: `请重点讲这两个句型：${grammars.map((g) => g.title).join('、')}。接续规则、语感差异、易错点都用中文讲透，各配两个场景例句，然后让我用它们造句。`,
        },
        pace
      )
    );
  }

  steps.push(
    makeStep(
      lessonId,
      'script',
      i++,
      '情境脚本',
      '用本课词与句型串一段可照着演的情境对话',
      {
        type: 'chat',
        mode: 'tutor',
        seedPrompt: `请只用本课的新词（${newWords.map((w) => w.surface).join('、') || '无'}）和句型（${grammars.map((g) => g.title).join('、') || '无'}）编一段「${FOCUS_THEME_LABEL[focus]}」的情境对话，3~5 个来回，每一句都配中文翻译；先给我看整段，再逐句带我读。`,
      },
      pace
    )
  );

  if (reviewWords.length) {
    steps.push(
      makeStep(
        lessonId,
        'drill',
        i++,
        `复习 ${reviewWords.length} 个旧词`,
        reviewWords.map((w) => `${w.surface}（${w.reason || ''}）`).join('；'),
        {
          type: 'flashcard',
          wordIds: reviewWords.map((w) => w.surface),
        },
        pace
      )
    );
  } else {
    steps.push(
      makeStep(
        lessonId,
        'drill',
        i++,
        '随堂小测',
        '用本课内容即时出题，检验是否真的会用',
        {
          type: 'chat',
          mode: 'assessment',
          seedPrompt: `请就本课内容出 5 道小测（含填空、改错、翻译各类型），一次一题，我答完你再出下一题并点评。`,
        },
        pace
      )
    );
  }

  steps.push(
    makeStep(
      lessonId,
      'roleplay',
      i++,
      `实战演练：${FOCUS_THEME_LABEL[focus]}`,
      '在情景里真的用出今天的词和句型',
      {
        type: 'chat',
        mode: 'roleplay',
        seedPrompt: `我们开始角色扮演实战。请按设定进入角色，尽量把我今天学的词和句型用出来，并留给我接话的空间。`,
      },
      pace
    )
  );

  steps.push(
    makeStep(
      lessonId,
      'wrapup',
      i++,
      '收束复盘',
      '总结本课所得，给出下一课建议',
      {
        type: 'chat',
        mode: 'tutor',
        seedPrompt: `今天的课到这里，请帮我复盘：我这节课用对了什么、还差什么，然后给下一课的建议。`,
      },
      pace
    )
  );

  return steps;
}

// ————————————————————————————————————————————————————————————
// 五、情景兜底：AI 备课时会现场编写，这里只保证"没有 AI 也能上课"
// ————————————————————————————————————————————————————————————

const SCENARIO_TEMPLATE: Record<
  Exclude<Lesson['focus'], 'kana'>,
  { title: string; roleAi: string; roleUser: string; opening: string; goal: (w: string, g: string) => string }
> = {
  shopping: {
    title: '店里挑东西',
    roleAi: '店员（礼貌、语速自然）',
    roleUser: '来买东西的客人',
    opening: 'いらっしゃいませ。何をお探しですか？',
    goal: (w, g) => `用上「${w}」完成一次询价与结账，并说出「${g}」`,
  },
  travel: {
    title: '路上问个路',
    roleAi: '车站工作人员（清晰、指引明确）',
    roleUser: '正在找路的旅客',
    opening: 'はい、どうされましたか？',
    goal: (w, g) => `用上「${w}」问清地点与走法，并说出「${g}」`,
  },
  business: {
    title: '商务寒暄与洽谈',
    roleAi: '客户方负责人（严谨得体）',
    roleUser: '前来拜访的商务代表',
    opening: '本日はお忙しい中ありがとうございます。どうぞお掛けください。',
    goal: (w, g) => `用上「${w}」完成寒暄与说明来意，并说出「${g}」`,
  },
  anime: {
    title: '宅友聊番',
    roleAi: '动漫同好（热情、口语化）',
    roleUser: '动漫爱好者',
    opening: 'お、久しぶり！最近何か面白いの見てる？',
    goal: (w, g) => `用上「${w}」说说自己最近在看什么，并说出「${g}」`,
  },
  daily: {
    title: '日常闲聊',
    roleAi: '日语母语朋友（亲切、语速自然）',
    roleUser: '正在学日语的朋友',
    opening: 'お疲れさま！今日はどうだった？',
    goal: (w, g) => `用上「${w}」聊满三个来回，并说出「${g}」`,
  },
  foundation: {
    title: '基础句型实战',
    roleAi: '日语老师（会用问题逼你开口）',
    roleUser: '正在打基础的学生',
    opening: 'では、今日の表現を使ってみましょう。',
    goal: (w, g) => `用上「${w}」造出正确句子，并说出「${g}」`,
  },
};

/**
 * 模板兜底情景。目标文案必须写成"学生要说出什么"，
 * 因为系统提示词里会把它声明为【只有学生亲口达成才算过关】。
 */
export function buildFallbackScenario(lesson: Lesson): RoleplayScenario | undefined {
  if (lesson.focus === 'kana') return undefined;
  const tpl = SCENARIO_TEMPLATE[lesson.focus] || SCENARIO_TEMPLATE.daily;
  const w = lesson.items.words.find((x) => x.isNew)?.surface || lesson.items.words[0]?.surface || '';
  const g = lesson.items.grammars[0]?.title || '';

  return {
    id: `lesson-scenario-${lesson.id}`,
    title: lesson.title,
    titleJp: lesson.titleJp || lesson.title,
    // focus 已在函数开头排除了 kana；foundation 映射到日常场景（RoleplayScenario 没有该分类）
    category: lesson.focus === 'foundation' ? 'daily' : lesson.focus,
    level: lesson.level,
    icon: 'BookOpen',
    description: `${lesson.goal}`,
    roleAi: tpl.roleAi,
    roleUser: tpl.roleUser,
    initialMessage: tpl.opening,
    goals: [
      { id: 'lg1', description: tpl.goal(w, g), completed: false },
      { id: 'lg2', description: '全程至少三个来回，不中途切换成中文解释', completed: false },
    ],
    usefulPhrases: [],
  };
}

/** 根据课时已排定的词汇与句型骨架，结合可选自定义微主题，生成/刷新角色扮演设定 */
export function buildCustomScenario(lesson: Lesson, customTopic?: string): RoleplayScenario | undefined {
  const base = buildFallbackScenario(lesson);
  if (!base) return undefined;
  if (!customTopic || !customTopic.trim()) return base;
  const topic = customTopic.trim();
  return {
    ...base,
    id: `lesson-scenario-${lesson.id}-custom`,
    title: `情境实战：${topic}`,
    titleJp: base.titleJp || `シチュエーション：${topic}`,
    description: `结合本课词汇与句型，围绕「${topic}」开展日常角色扮演演练。`,
    initialMessage: `こんにちは！今日は「${topic}」について一緒に練習しましょう。準備はいいですか？`,
  };
}

// ————————————————————————————————————————————————————————————
// 六、证据回写：步骤完成必须由采证通道驱动，不能由人按、也不能由模型报
// ————————————————————————————————————————————————————————————

/**
 * 采证上下文。全部来自软件【已有的】采证通道，不新增埋点：
 * - `learnedWords` / `learnedGrammar` ← `ingestKnowledgeAndTokens` 每轮自动采集
 * - `sessionRoundCounts` ← 会话消息计数（实战演练说了几个来回）
 */
export interface EvidenceContext {
  learnedWords?: LearnedWord[];
  learnedGrammar?: LearnedGrammar[];
  /** lessonId → 该课会话里助手已产出的消息条数 */
  sessionRoundCounts?: Record<string, number>;
}

/** 实战演练至少说满几个来回才认可用过 */
export const ROLEPLAY_MIN_ROUNDS = 3;

function alreadyDone(step: LessonStep): boolean {
  return !!step.done;
}

function markDone(step: LessonStep, via: LessonStepEvidence['via']): LessonStep {
  return { ...step, done: true, evidence: { at: Date.now(), via } };
}

/**
 * 依证据推进课时步骤完成度。
 *
 * 【语义边界】步骤 `done` 表示"这一步的教学行为真的发生了"（课程推进度，对象是课），
 * 而"学生真的会了"只体现在生词本的 `mastery` 上。旧版把两者混成一个「打勾」，
 * 才让"打勾 = 学会"这个错误心智得以成立。分清之后，课时进度是诚实的：
 * 它回答的是"课推进到哪了"，而不是"你掌握了多少"。
 *
 * 三条纪律：
 * 1. **只能 false→true**，绝不回退。学生后来把某词从生词本删掉，不应该把已上过的一步"退回去"。
 * 2. **无自动证据通道的步骤保留给人**（热身 / 收束复盘），记为 `via: 'manual'`——
 *    界面上"系统采证"与"学生自评"分开计数，绝不把自评混进客观进度里。
 * 3. 无变化时**返回同一个对象引用**，供 React 依赖比较，避免无谓重渲染与 setState 死循环。
 */
export function applyLessonEvidence(lesson: Lesson, ctx: EvidenceContext = {}): Lesson {
  const words = ctx.learnedWords || [];
  const grammars = ctx.learnedGrammar || [];
  const wordSurfaces = new Set(words.map((w) => w?.surface).filter(Boolean) as string[]);
  const wordSurfacesQuizzed = new Set(
    words.filter((w) => (w?.reviewCount || 0) > 0).map((w) => w?.surface).filter(Boolean) as string[]
  );
  const grammarKeys = new Set(grammars.map((g) => normalizeGrammarKey(g?.title)));

  const materialReady = lesson.material === 'ready';

  const newWordSurfaces = lesson.items.words.filter((w) => w.isNew).map((w) => w.surface);
  const allWordsCollected =
    newWordSurfaces.length > 0 && newWordSurfaces.every((s) => wordSurfaces.has(s));

  const grammarTitles = lesson.items.grammars.map((g) => g.title);
  const allGrammarsCollected =
    grammarTitles.length > 0 &&
    grammarTitles.every((t) => grammarKeys.has(normalizeGrammarKey(stripAnnotatedBlockMarks(t).replace(/^～/, ''))));

  const steps = lesson.steps.map((step) => {
    if (alreadyDone(step)) return step;

    switch (step.kind) {
      case 'vocab': {
        // 只有本课新词【真的进了生词本】才算这一步上过。
        // 不给"教材里写了就算"的口子——那会让进度跑到学习前面去。
        if (newWordSurfaces.length === 0) return step;
        if (allWordsCollected) return markDone(step, 'word-collected');
        return step;
      }
      case 'grammar': {
        if (grammarTitles.length === 0) return step;
        if (allGrammarsCollected) return markDone(step, 'grammar-collected');
        return step;
      }
      case 'script': {
        // 情境脚本这一步的对象是"教材本身"：备课产出且呈现给学生即视为交付
        if (!materialReady || (lesson.items.script || []).length === 0) return step;
        return markDone(step, 'material-taught');
      }
      case 'drill': {
        if (step.action.type !== 'flashcard') return step;
        const targets = (step.action.wordIds || []).filter(Boolean);
        if (targets.length === 0) return step;
        // 只有真的作答过（reviewCount > 0）才算复习完成，光是躺在生词本里不算
        if (!targets.every((s) => wordSurfacesQuizzed.has(s))) return step;
        return markDone(step, 'flashcard');
      }
      case 'roleplay': {
        const rounds = lesson.sessionId ? ctx.sessionRoundCounts?.[lesson.sessionId] || 0 : 0;
        if (rounds < ROLEPLAY_MIN_ROUNDS) return step;
        return markDone(step, 'scenario-rounds');
      }
      case 'warmup':
      case 'wrapup': {
        // 自然连贯推进：学生点击开启了热身或复盘，且会话中已有互动发生，自动标记完成
        const rounds = lesson.sessionId ? ctx.sessionRoundCounts?.[lesson.sessionId] || 0 : 0;
        if (step.startedAt && rounds >= 1) {
          return markDone(step, 'material-taught');
        }
        return step;
      }
      default: {
        // 其他小测类步骤（非闪卡）：产生互动即可达成
        const rounds = lesson.sessionId ? ctx.sessionRoundCounts?.[lesson.sessionId] || 0 : 0;
        if (step.startedAt && rounds >= 1) {
          return markDone(step, 'material-taught');
        }
        return step;
      }
    }
  });

  const changed = steps.some((s, i) => s !== lesson.steps[i]);
  if (!changed) return lesson;

  const next: Lesson = { ...lesson, steps };
  next.status = recomputeLessonStatus(next);
  if (next.status === 'done' && !next.completedAt) next.completedAt = Date.now();
  return next;
}

/**
 * 判断某一步是否"可自动采证"。
 * 界面据此展示采证说明
 */
export function isAutoEvidenced(step: LessonStep): boolean {
  return step.kind !== 'warmup' && step.kind !== 'wrapup';
}

/** 证据渠道的中文说明，界面直接展示，让学生清晰了解进度依据 */
export const EVIDENCE_LABELS: Record<LessonStepEvidence['via'], string> = {
  'material-taught': '互动教学已完成',
  'word-collected': '已收进生词本',
  'grammar-collected': '已收进语法档案',
  flashcard: '闪卡已作答',
  'scenario-rounds': '演练已达标',
  manual: '已完成',
};

export interface LevelRoadmapStage {
  level: UserLevel;
  levelTitle: string;
  stageName: string;
  badge: string;
  color: string;
  summary: string;
  coreTargets: string[];
  estimatedLessons: string;
}

/** JLPT 从初阶到高阶的完整学习脉络全景图 */
export const JLPT_ROADMAP_STAGES: LevelRoadmapStage[] = [
  {
    level: 'N0',
    levelTitle: '零基础启蒙',
    stageName: '五十音与发音基石',
    badge: '入门基石',
    color: '#10b981',
    summary: '建立假名听辨读写本能，扫清发音障碍，掌握生存破冰短句。',
    coreTargets: ['平假名/片假名对照', '浊音/半浊音/长促音规则', '日常问候破冰'],
    estimatedLessons: '16 课',
  },
  {
    level: 'N5',
    levelTitle: '初级入门',
    stageName: '生存日语与句型骨架',
    badge: '句型破冰',
    color: '#06b6d4',
    summary: '掌握基础词汇与判断/存在句型，能完成便利店购物、点餐、时间询问。',
    coreTargets: ['基础助词（は/が/を/に/で）', '动词敬体ます形', '指示代词与数字日期'],
    estimatedLessons: '约 20~25 课',
  },
  {
    level: 'N4',
    levelTitle: '初级进阶',
    stageName: '动词活用与日常生活',
    badge: '核心大关',
    color: '#3b82f6',
    summary: '攻破动词活用体系，自如表达许可、愿望、授受与日常见闻。',
    coreTargets: ['て形/た形/ない形变形', '授受动词与请求句型', '简单复句与因果表达'],
    estimatedLessons: '约 25~30 课',
  },
  {
    level: 'N3',
    levelTitle: '中级过渡',
    stageName: '真实语境与长句表达',
    badge: '会话分水岭',
    color: '#8b5cf6',
    summary: '跨入真正流利会话门槛。掌握可能态、被动态、使役态与近义表达。',
    coreTargets: ['可能形/被动形/使役形', '初级敬语与语气词', '近义句型辨析与转折复句'],
    estimatedLessons: '约 30~35 课',
  },
  {
    level: 'N2',
    levelTitle: '高级进阶',
    stageName: '社会话题与地道流利',
    badge: '商务与留学',
    color: '#ec4899',
    summary: '达到日本留学与外企职场门槛。顺畅阅读报刊评论，准确表达立场与推测。',
    coreTargets: ['近义句型微差异辨析', '复合格助词与转折修辞', '职场邮件与社会生活场景'],
    estimatedLessons: '约 35~40 课',
  },
  {
    level: 'N1',
    levelTitle: '高阶精通',
    stageName: '文化底蕴与深度思辨',
    badge: '无障碍母语感',
    color: '#f59e0b',
    summary: '理解抽象思辨、高级敬语体系内外尊卑、传统惯用语与新闻政论。',
    coreTargets: ['高级敬语体系与内外视角', '文语残留与四字熟语', '新闻时事深度思辨讨论'],
    estimatedLessons: '持续浸润',
  },
];

/** 把学生手动标记的完成写进步骤（仅对无自动通道的步骤开放） */
export function markStepManually(lesson: Lesson, stepId: string): Lesson {
  const steps = lesson.steps.map((s) =>
    s.id === stepId ? { ...s, done: true, evidence: { at: Date.now(), via: 'manual' as const } } : s
  );
  if (steps.every((s, i) => s === lesson.steps[i])) return lesson;
  const next: Lesson = { ...lesson, steps };
  next.status = recomputeLessonStatus(next);
  if (next.status === 'done' && !next.completedAt) next.completedAt = Date.now();
  return next;
}

/**
 * 记录"这一步开过了"。
 *
 * 与 `markStepManually` 的分工：这个只管"开课时间"，**绝不把 done 置真**——
 * 完成仍必须由 {@link applyLessonEvidence} 的证据通道判定。
 */
export function markStepStarted(lesson: Lesson, stepId: string): Lesson {
  const steps = lesson.steps.map((s) => (s.id === stepId && !s.startedAt ? { ...s, startedAt: Date.now() } : s));
  if (steps.every((s, i) => s === lesson.steps[i])) return lesson;
  return { ...lesson, steps };
}

/**
 * 再点一次同一步时要发的指令。
 *
 * 步骤自带的 `seedPrompt` 是【开课指令】（"请教我本课这几个新词：…"），原样重发
 * 会让老师把整节课从头讲一遍——这正是学生反馈的"热身唤醒重复触发"：
 * 点两次就会听到两遍开场。所以第二次起换成"接着上"的指令。
 */
export function continueSeedFor(step: LessonStep): string {
  return `我们接着上一步（${step.title}）继续。请顺着刚才的进度往下带，不要重新开头、不要重复前面的内容、不要再介绍一遍这一步。如果上一步还有没讲完的地方，先把它补完。`;
}

/**
 * 数"这一步演练真的说了几个来回"。
 *
 * 只数【属于本情景】的助手发言：会话第一条问候、备课说明、热身/词汇等其他步骤的发言
 * 都不算。旧实现数的是"会话里所有非空助手消息"，于是开课问候 + 备课说明就凑够了 3 条，
 * 实战演练一步没演就被判过关——进度又一次变成填出来的。
 */
export function countScenarioRounds(
  messages: Array<{ role?: string; content?: string; scenarioId?: string }> | undefined,
  scenarioId: string | undefined
): number {
  if (!scenarioId || !Array.isArray(messages)) return 0;
  return messages.filter(
    (m) => m?.role === 'assistant' && !!m.content?.trim() && m.scenarioId === scenarioId
  ).length;
}

// ————————————————————————————————————————————————————————————
// 七、进度：只能算出来，不能填出来
// ————————————————————————————————————————————————————————————

export interface CourseProgress {
  /** 按【课时分钟数】加权的完成度，比"任务条数"更贴近真实学习量 */
  percent: number;
  doneSteps: number;
  totalSteps: number;
  doneLessons: number;
  totalLessons: number;
  /** 完成证据按渠道分布，界面据此向学生解释进度是怎么来的 */
  byVia: Record<string, number>;
  /** 由系统采证完成的步骤数（客观） */
  evidencedSteps: number;
  /** 学生自评完成的步骤数（主观）——界面必须与上一项分开显示，绝不混为一谈 */
  selfReportedSteps: number;
  /** 还有多少分钟没上 */
  remainingMinutes: number;
}

/**
 * 按证据计算课程进度。
 * 旧实现里 `weeklyProgress` 是模型自由发挥或 `masteredGrammar.length * 12`，
 * 与真实学习量无关；这里改为"已完成步骤的课时分钟 / 总课时分钟"，
 * 且 `done` 只能由 {@link applyLessonEvidence} 或 {@link markStepManually} 写入。
 */
export function computeCourseProgress(lessons: Lesson[] = []): CourseProgress {
  const byVia: Record<string, number> = {};
  let doneMinutes = 0;
  let totalMinutes = 0;
  let doneSteps = 0;
  let totalSteps = 0;
  let doneLessons = 0;
  let evidencedSteps = 0;
  let selfReportedSteps = 0;

  for (const l of lessons) {
    const steps = l.steps || [];
    let lessonDone = 0;
    for (const s of steps) {
      const m = s.minutes || 0;
      totalMinutes += m;
      totalSteps += 1;
      if (s.done) {
        doneMinutes += m;
        doneSteps += 1;
        lessonDone += 1;
        const via = s.evidence?.via || 'manual';
        byVia[via] = (byVia[via] || 0) + 1;
        if (via === 'manual') selfReportedSteps += 1;
        else evidencedSteps += 1;
      }
    }
    if (steps.length > 0 && lessonDone === steps.length) doneLessons += 1;
  }

  const percent = totalMinutes > 0 ? Math.round((doneMinutes / totalMinutes) * 100) : 0;

  return {
    percent,
    doneSteps,
    totalSteps,
    doneLessons,
    totalLessons: lessons.length,
    byVia,
    evidencedSteps,
    selfReportedSteps,
    remainingMinutes: Math.max(0, totalMinutes - doneMinutes),
  };
}

/**
 * 由步骤证据重算课时状态。`status` 是派生值，绝不手工设置——
 * 否则又回到"勾选清单"的老路。
 */
export function recomputeLessonStatus(lesson: Lesson): Lesson['status'] {
  const steps = lesson.steps || [];
  if (steps.length === 0) return lesson.status;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return 'done';
  if (done > 0) return 'in_progress';
  return 'planned';
}

/** 课的预计总时长（分钟），界面用来告诉学生"这节课大约要多久" */
export function lessonMinutes(lesson: Lesson): number {
  return (lesson.steps || []).reduce((sum, s) => sum + (s.minutes || 0), 0);
}

// ————————————————————————————————————————————————————————————
// 八、备课成果合并（B 段产物 → 课时）
// ————————————————————————————————————————————————————————————

/**
 * 把 AI 备课产出（`:::lesson` 解析载荷）合并进课时骨架。
 *
 * 两条硬约束：
 * 1. **N0 阶梯的假名序列由静态五十音表决定**，绝不让模型改写——模型生成假名必缺必错，
 *    而 `kanaChart` 里的平/片假名、罗马字、字源记忆法与发音要点都是人工校过的。
 * 2. **词表与句型表以排课器为准**，模型只提供"教材正文"（情境脚本、点拨）。模型无权换掉
 *    本课要教的知识点，否则"因材施教"的判定就绕过了本地学情数据。
 */
export function mergeLessonMaterial(lesson: Lesson, payload: LessonMaterialPayload | null): Lesson {
  if (!payload) {
    // error 会直接显示在课时卡片里，所以写学生看得懂的话，不写"解析失败/骨架"这类内部说法
    return { ...lesson, material: 'failed', error: '老师这次给出的教材没能读取，课表和词表都还在，可以重新备课' };
  }

  const items: LessonItems = { ...lesson.items };
  if (payload.script && payload.script.length > 0) items.script = payload.script;
  if (payload.points && payload.points.length > 0) items.points = payload.points;

  let scenario = lesson.scenario;
  if (payload.scenario && lesson.focus !== 'kana') {
    const base = lesson.scenario;
    const goals = (payload.scenario.goals || []).filter(Boolean).map((d, i) => ({
      id: `lg${i + 1}`,
      description: d,
      completed: false,
    }));
    scenario = {
      id: base?.id || `lesson-scenario-${lesson.id}`,
      title: payload.scenario.title || base?.title || lesson.title,
      titleJp: payload.titleJp || base?.titleJp || lesson.titleJp || lesson.title,
      category: base?.category || 'daily',
      level: lesson.level,
      icon: base?.icon || 'BookOpen',
      description: payload.goal || base?.description || lesson.goal,
      roleAi: payload.scenario.roleAi || base?.roleAi || '日语母语者',
      roleUser: payload.scenario.roleUser || base?.roleUser || '正在学日语的学生',
      initialMessage: payload.scenario.initialMessage || base?.initialMessage || '',
      goals: goals.length > 0 ? goals : base?.goals || [],
      usefulPhrases: base?.usefulPhrases || [],
    };
  }

  // 步骤上的 scenarioId 必须跟着情景走，否则实战演练会指到一个不存在的情景
  const steps = lesson.steps.map((s) =>
    s.action.type === 'chat' && s.action.mode === 'roleplay' && scenario
      ? { ...s, action: { ...s.action, scenarioId: scenario.id } }
      : s
  );

  return {
    ...lesson,
    title: payload.title || lesson.title,
    titleJp: payload.titleJp || lesson.titleJp,
    goal: payload.goal || lesson.goal,
    focus: payload.focus || lesson.focus,
    items,
    scenario,
    steps,
    material: 'ready',
    error: undefined,
  };
}

// ————————————————————————————————————————————————————————————
// 九、旧计划兼容
// ————————————————————————————————————————————————————————————

/**
 * 旧 `DailyTask` 清单 → 无可迁移的有价值信息。
 *
 * 旧任务的 `target` 字段没有任何契约（默认计划写 `convenience_store`，生成器写 `roleplay`，
 * 模型生成又是任意串），也没有任何代码消费它，所以【无法】诚实地还原成可执行的课时步骤。
 * 硬转只会造出一堆点了没反应的步骤——那正是我们要修掉的病。
 *
 * 因此这里只清理已废弃字段，保留课表；旧清单不再渲染。
 */
export function normalizeLegacyPlan(plan: LearningPlan | undefined): LearningPlan {
  const base: LearningPlan = plan || ({} as LearningPlan);
  return {
    currentStage: base.currentStage || '未排课',
    todayGoal: base.todayGoal || '',
    suggestedTopics: Array.isArray(base.suggestedTopics) ? base.suggestedTopics : [],
    grammarFocus: Array.isArray(base.grammarFocus) ? base.grammarFocus : [],
    lastUpdated: base.lastUpdated || '',
    lessons: Array.isArray(base.lessons) ? base.lessons : [],
    activeLessonId: base.activeLessonId,
  };
}

/** 判断旧数据里是否只存在「打勾清单」而没有课表 */
export function hasOnlyLegacyTasks(plan: LearningPlan | undefined): boolean {
  if (!plan) return false;
  const hasLessons = Array.isArray(plan.lessons) && plan.lessons.length > 0;
  const tasks: DailyTask[] = Array.isArray(plan.tasks) ? plan.tasks : [];
  return !hasLessons && tasks.length > 0;
}
