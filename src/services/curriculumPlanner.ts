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
  UserLearningProfile,
  UserLevel,
} from '../types';
import { COMPREHENSIVE_VOCABULARY } from '../data/dictionaryVocabulary';
import { GRAMMAR_POINTS } from '../data/grammarPoints';
import { SEION_KANA } from '../data/kanaChart';
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

/** 每课的教学容量：固定值让课时长度可预期，也让排课结果可测。 */
export const LESSON_CAPACITY = {
  newWords: 6,
  newGrammars: 2,
  reviewWords: 4,
  /** N0 每课固定 5 个假名（直接用静态五十音表，绝不让模型生成假名） */
  kanaPerLesson: 5,
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

// ————————————————————————————————————————————————————————————
// 三、A 段主入口：排出一课
// ————————————————————————————————————————————————————————————

export function planNextLesson(input: PlannerInput): PlannedLesson {
  const { profile, lessonIndex } = input;
  const learnedWords = input.learnedWords || [];
  const learnedGrammar = input.learnedGrammar || [];
  const existing = input.existingLessons || [];

  const level: UserLevel = profile?.level || 'N5';
  const goal: LearningGoal | undefined = profile?.goal;
  const focus: Lesson['focus'] = input.focus || resolveFocus(goal, level);

  const lessonId = `lesson-${lessonIndex}-${Date.now().toString(36)}`;

  const items: LessonItems =
    focus === 'kana'
      ? planKanaItems(lessonIndex)
      : planTextItems({ level, focus, lessonIndex, learnedWords, learnedGrammar, existing });

  const steps = buildSteps({ lessonId, focus, items, level, lessonIndex });

  // 课时目标必须【可验证】：写清"能独立完成什么"，不写"掌握 XX 知识"
  const goalText = buildGoalText(focus, items, level);

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

function planKanaItems(lessonIndex: number): LessonItems {
  const per = LESSON_CAPACITY.kanaPerLesson;
  const start = ((lessonIndex - 1) * per) % (SEION_KANA.length || 1);
  const picked: typeof SEION_KANA = [];
  for (let i = 0; i < per; i += 1) {
    const item = SEION_KANA[(start + i) % SEION_KANA.length];
    if (item) picked.push(item);
  }

  return {
    words: [],
    grammars: [],
    script: [
      {
        speaker: 'ai',
        jp: picked.map((k) => k.hiragana).join(''),
        cn: `本课假名：${picked.map((k) => `${k.hiragana}（${k.romaji}）`).join('、')}`,
        note: picked.map((k) => `${k.hiragana}：${k.chineseMnemonic}`).join('；'),
      },
    ],
    points: picked.map((k) => `${k.hiragana} / ${k.katakana}（${k.romaji}）— ${k.pronunciationTip}`),
  };
}

function planTextItems(args: {
  level: UserLevel;
  focus: Lesson['focus'];
  lessonIndex: number;
  learnedWords: LearnedWord[];
  learnedGrammar: LearnedGrammar[];
  existing: Lesson[];
}): LessonItems {
  const { level, focus, lessonIndex, learnedWords, learnedGrammar, existing } = args;
  const levels = allowedLevels(level);

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

  const newWords = pickRotated(ranked, LESSON_CAPACITY.newWords, lessonIndex);

  // ——— 复习靶标（"见过很多次却没考过"的词优先——这正是拆分 exposureCount 的收益）———
  const reviewTargets = [...learnedWords]
    .filter((w) => w && w.mastery !== 'mastered')
    .map((w) => {
      const daysSinceReview = w.lastReviewedAt
        ? (Date.now() - w.lastReviewedAt) / 86400000
        : 999;
      // 遗忘风险：久未测验 + 被动遇见多（说明反复碰到但没真正考过）
      const risk = daysSinceReview * 2 + (w.exposureCount || 0) * 1.5 - (w.reviewCount || 1) * 0.5;
      return { w, risk };
    })
    .sort((a, b) => b.risk - a.risk)
    .slice(0, LESSON_CAPACITY.reviewWords)
    .map((x) => x.w);

  // ——— 句型语法 ———
  const knownGrammarKeys = new Set(learnedGrammar.map((g) => normalizeGrammarKey(g?.title)));
  const taughtGrammarKeys = new Set<string>();
  for (const l of existing) {
    for (const g of l.items?.grammars || []) if (g.isNew) taughtGrammarKeys.add(normalizeGrammarKey(g.title));
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

  const newGrammars = pickRotated(grammarCandidates, LESSON_CAPACITY.newGrammars, lessonIndex);

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
      ...reviewTargets.map((w) => ({
        surface: w.surface,
        reading: w.reading,
        meaning: w.meaning,
        pos: w.pos,
        level: w.level,
        isNew: false,
        reason:
          (w.exposureCount || 0) >= 3 && (w.reviewCount || 1) <= 1
            ? `已遇见 ${w.exposureCount} 次却从未测验过`
            // 不带括号：这个 reason 会被拼进 `（${reason}）` 里，再套一层括号就成了 `（该复习了（温习中））`
            : `该复习了 · ${w.mastery === 'reviewing' ? '温习中' : '初学'}`,
      })),
    ],
    grammars: newGrammars.map((g) => ({
      title: g.title,
      structure: g.structure,
      meaning: g.meaning,
      level: g.level,
      isNew: true,
      reason: '本课新句型',
    })),
    points: [],
  };
}

function buildLessonTitle(focus: Lesson['focus'], items: LessonItems, index: number): string {
  if (focus === 'kana') return `第 ${index} 课 · 五十音阶梯（${(items.script?.[0]?.cn || '').replace('本课假名：', '')}）`;
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

function buildGoalText(focus: Lesson['focus'], items: LessonItems, level: UserLevel): string {
  if (focus === 'kana') {
    const kana = items.script?.[0]?.jp || '';
    return `能准确认读并听辨 ${kana.split('').join('、')} 的平片假名与发音`;
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
  action: LessonStep['action']
): LessonStep {
  return {
    id: `${lessonId}-step-${index}-${kind}`,
    kind,
    title,
    brief,
    minutes: LESSON_MINUTES[kind] || 5,
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
}): LessonStep[] {
  const { lessonId, focus, items, level } = args;
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
      }),
      makeStep(lessonId, 'vocab', i++, '假名认读与书写', '平假名 / 片假名 / 罗马字三向对应', {
        type: 'chat',
        mode: 'tutor',
        seedPrompt: `请把本课假名（${kana.split('').join('、')}）的平假名、片假名、罗马字列成对照，并给我默写练习。`,
      }),
      makeStep(lessonId, 'drill', i++, '五十音自测', '打开笔记本自测本课假名，答不出的标记为忘记', {
        type: 'review',
        tab: 'grammar',
      }),
      makeStep(lessonId, 'wrapup', i++, '复盘', '回看今天容易混的假名', {
        type: 'chat',
        mode: 'tutor',
        seedPrompt: '帮我复盘今天学的假名里我最容易混的几个，并给我明天的复习建议。',
      })
    );
    return steps;
  }

  steps.push(
    makeStep(
      lessonId,
      'warmup',
      i++,
      '热身唤醒',
      '用本课主题的自然闲聊唤起相关旧知，不急着上新内容',
      {
        type: 'chat',
        mode: 'tutor',
        // 【不写"告诉我今天要学什么"】——那会让热身变成开课宣言。
        // 课表里已经把本课的词、句型和目标摆好了，学生点这一步只是想先热热嘴；
        // 一旦让热身负责"介绍课程"，学生再点一次就会听到同一段开场白（重复触发）。
        seedPrompt: `听说今天要聊「${FOCUS_THEME_LABEL[focus]}」。请用两三句闲聊式的日语把话头带起来，顺手问我一两个相关的旧表达、看看我还记得多少。这一步只做热身：不要介绍课程、不要预告今天要学什么、不要展示词表，说完就停下来等我回应。`,
      }
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
        }
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
        }
      )
    );
  }

  steps.push(
    makeStep(lessonId, 'script', i++, '情境脚本', '用本课词与句型串一段可照着演的情境对话', {
      type: 'chat',
      mode: 'tutor',
      seedPrompt: `请只用本课的新词（${newWords.map((w) => w.surface).join('、') || '无'}）和句型（${grammars.map((g) => g.title).join('、') || '无'}）编一段「${FOCUS_THEME_LABEL[focus]}」的情境对话，3~5 个来回，每一句都配中文翻译；先给我看整段，再逐句带我读。`,
    })
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
        }
      )
    );
  } else {
    steps.push(
      makeStep(lessonId, 'drill', i++, '随堂小测', '用本课内容即时出题，检验是否真的会用', {
        type: 'chat',
        mode: 'assessment',
        seedPrompt: `请就本课内容出 5 道小测（含填空、改错、翻译各类型），一次一题，我答完你再出下一题并点评。`,
      })
    );
  }

  steps.push(
    makeStep(lessonId, 'roleplay', i++, `实战演练：${FOCUS_THEME_LABEL[focus]}`, '在情景里真的用出今天的词和句型', {
      type: 'chat',
      mode: 'roleplay',
      seedPrompt: `我们开始角色扮演实战。请按设定进入角色，尽量把我今天学的词和句型用出来，并留给我接话的空间。`,
    })
  );

  steps.push(
    makeStep(lessonId, 'wrapup', i++, '收束复盘', '总结本课所得，给出下一课建议', {
      type: 'chat',
      mode: 'tutor',
      seedPrompt: `今天的课到这里，请帮我复盘：我这节课用对了什么、还差什么，然后给下一课的建议。`,
    })
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
      default:
        // warmup / wrapup：没有可靠的自动采证通道，保留给学生自评
        return step;
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
 * 界面据此决定给「我完成了」按钮还是显示「系统判定」，避免让学生误以为可以随手打勾。
 */
export function isAutoEvidenced(step: LessonStep): boolean {
  return step.kind !== 'warmup' && step.kind !== 'wrapup';
}

/** 证据渠道的中文说明，界面直接展示，让学生知道"凭什么算完成" */
export const EVIDENCE_LABELS: Record<LessonStepEvidence['via'], string> = {
  // 这些字串会直接渲染在步骤下方（「完成依据：xxx」），必须是学生看得懂的话。
  // 禁止写入字段名、表名、模块名或任何只有开发者才懂的词。
  'material-taught': '本课内容已讲过',
  'word-collected': '已收进生词本',
  'grammar-collected': '已收进语法档案',
  flashcard: '闪卡已作答',
  'scenario-rounds': '演练已达标',
  manual: '你自己确认的',
};

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
