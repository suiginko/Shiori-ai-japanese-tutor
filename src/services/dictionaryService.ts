// =========================================================
// SMART OFFLINE-FIRST DICTIONARY SERVICE (智能电子词典服务)
// =========================================================
// 特点：
// 1. 内置高频离线核心词库 (覆盖核心语法助词、JLPT N5~N1 动词、形容词、副词、名词)，毫秒级响应
// 2. 深度融合形态素活用还原器 (De-inflector)，点击动词活用形 (如 食べました、行きたい、美味しかった) 自动还原辞书形
// 3. 本地持久化缓存 (LocalStorage: agy_jp_dict_cache_v1)，自动记录用户与对话衍生释义
// 4. 专注词语解释、词性与用法，零网络依赖、零 Token 消耗

import { DICT_BY_WORD, DICT_BY_READING, DictItem } from '../data/dictionaryData';
import { deinflect } from '../utils/deinflector';
import { queryWordDefinitionFromLLM } from './llmService';
import { detectQueryLanguage, DISTINCT_CHINESE_CHAR_REGEX } from '../utils/languageDetector';

/** 句子 / 短语的成分拆解片段（仅 phrase / grammar / sentence 类型返回） */
export interface DictSegment {
  jp: string; // 日文片段，如 "図書館で"
  zh?: string; // 该片段的中文含义
  role?: string; // 语法功能 / 成分，如 "地点状语"、"谓语"
}

export interface DictEntry {
  word: string; // 单词原型/表层词，如 "東京"、"食べる"、"で"
  reading: string; // 假名读音，如 "とうきょう"、"たべる"、"で"
  originalQuery?: string; // 若从中文查日文，记录原中文查询词句
  pos?: string; // 词性标签，如 "名词"、"他动词·一段"、"格助词"、"副词" 等
  meaning: string; // 权威中文释义
  detail?: string; // 深入用法说明或接续说明
  breakdown?: DictSegment[]; // 成分拆解（短语/句型/句子专用）
  annotated?: string; // 逐词注音串，软件统一 `{原文[读音]}` 语法（短语/句型/句子专用，供小窗标题渲染振假名）
  examples?: Array<{ jp: string; zh: string }>; // 经典例句
  level?: string; // JLPT 等级参考，如 N5 / N4
  pitch?: number; // 声调数字
  lemma?: string; // 辞书形原型（如果是活用形推导而来）
  lemmaReading?: string; // 辞书原型读音（当 word 为变位活用形时，如 "たべる"）
  inflectionForm?: string; // 当前语法形态说明，如 "敬体过去式"
  source?: 'builtin' | 'cache' | 'user' | 'ai';
  isPlaceholder?: boolean; // 是否为兜底占位词条（可通过AI自愈升级）
  queryType?: 'word' | 'phrase' | 'grammar' | 'sentence'; // 查询范畴：单词 / 词组惯用语 / 文法句型 / 句子表达
}

/**
 * 智能推导动词/形容词活用形表层词自身的假名读音
 * 例如：surface="使います", lemma="使う", lemmaReading="つかう" -> "つかいます"
 *      surface="食べました", lemma="食べる", lemmaReading="たべる" -> "たべました"
 *      surface="美味しかった", lemma="美味しい", lemmaReading="おいしい" -> "おいしかった"
 */
export function deriveConjugatedReading(surface: string, lemma: string, lemmaReading: string): string {
  if (!surface || !lemma || !lemmaReading) return surface || '';
  if (surface === lemma) return lemmaReading;

  // 纯假名词
  if (/^[ぁ-んァ-ヶー]+$/.test(surface)) {
    return surface;
  }

  // 汉字词干 + 送假名匹配（如 食べる / 食べました）
  const lemmaMatch = lemma.match(/^([一-龯々〆]+)(.*)$/);
  const surfaceMatch = surface.match(/^([一-龯々〆]+)(.*)$/);

  if (lemmaMatch && surfaceMatch && lemmaMatch[1] === surfaceMatch[1]) {
    const lemmaOkuri = lemmaMatch[2];
    const surfaceOkuri = surfaceMatch[2];
    if (lemmaOkuri && lemmaReading.endsWith(lemmaOkuri)) {
      const stemReading = lemmaReading.slice(0, -lemmaOkuri.length);
      return stemReading + surfaceOkuri;
    }
  }

  // 通用最长共同前缀（支持复合词如 持ち歩く -> 持ち歩きます）
  let commonLen = 0;
  while (commonLen < surface.length && commonLen < lemma.length && surface[commonLen] === lemma[commonLen]) {
    commonLen++;
  }
  if (commonLen > 0) {
    const lemmaSuffix = lemma.substring(commonLen);
    const surfaceSuffix = surface.substring(commonLen);
    if (lemmaSuffix && lemmaReading.endsWith(lemmaSuffix)) {
      const prefixReading = lemmaReading.slice(0, -lemmaSuffix.length);
      return prefixReading + surfaceSuffix;
    }
  }

  return lemmaReading;
}

/**
 * 校验词汇是否安全可注入离线词库（防止脏词条与粘连语法短语污染全局分词与注音）：
 * 1. 严禁以格助词/提示助词开头且后跟汉字或假名短语（如 に行、を食べる、で話す、の部屋、は学生）作为独立词条存入离线词典
 * 2. 严禁复数格助词短语（如 から～、まで～、より～）作为独立词条存入离线词典
 * 3. 严禁覆盖基础单字语法助词（を、に、で、へ、が、は、の、と、も、や、か等）
 */
export function isSafeToInjectIntoOfflineDict(word: string): boolean {
  if (!word || typeof word !== 'string') return false;
  const clean = word.trim();
  if (clean.length === 0) return false;

  // 严禁纯中文词条注入日文离线词典
  if (detectQueryLanguage(clean) === 'cn' || DISTINCT_CHINESE_CHAR_REGEX.test(clean)) {
    return false;
  }

  // 格助词/提示助词开头且后跟汉字或假名短语（如 に行、を食べる、で話す、の部屋、は学生）绝对禁止作为独立词条存入词典
  if (/^[をにでへがはものとや]([一-龯々〆ヵヶぁ-んァ-ヶー]+)/.test(clean)) {
    return false;
  }
  // 严禁复数格助词短语（如 から～、まで～）
  if (/^(から|まで|より)([一-龯々〆ヵヶぁ-んァ-ヶー]+)/.test(clean)) {
    return false;
  }
  // 严禁通过 AI 覆盖基础单字语法助词
  const PROTECTED_GRAMMAR_PARTICLES = new Set([
    'を', 'に', 'で', 'へ', 'が', 'は', 'の', 'と', 'も', 'や', 'か', 'から', 'まで', 'より',
    'です', 'ます', 'でした', 'ました', 'だ', 'である'
  ]);
  if (PROTECTED_GRAMMAR_PARTICLES.has(clean)) {
    return false;
  }
  return true;
}

/**
 * 判断是否为「真正的单个词条」（可安全注入离线分词词典）：
 * 必须是短词条（≤6 字符、不含标点与空白），且通过助词污染校验。
 * 短语、句型、整句一律返回 false —— 绝不污染 DICT_BY_WORD 全局分词与注音。
 */
export function isTrueSingleWordTerm(term: string): boolean {
  const clean = (term || '').trim();
  if (!clean) return false;
  if (clean.length > 6) return false;
  if (/[。！？!?、,.\s\u3000]/.test(clean)) return false;
  return isSafeToInjectIntoOfflineDict(clean);
}

/**
 * 判断是否为「短小的助词粘连脏词条」（如 に行、を食べる、は学生）。
 * 长短语与整句（长度 > 6 或含标点/空格）属于用户合法的划词查询内容，不算污染，必须保留。
 */
export function isShortGluedQuery(term: string): boolean {
  const clean = (term || '').trim();
  if (!clean) return true;
  return clean.length <= 6 && !/[。！？!?、,.\s\u3000]/.test(clean);
}

/**
 * 规范化用户或划选输入的查词词条：
 * 若输入为粘连助词短语（如 "に行"、"を食べる"、"で話す"），
 * 智能剥离前置助词并还原核心动词/名词辞书原型（如 "に行" -> 核心 "行く"，助词 "に"）
 */
export function normalizeQueryTerm(rawTerm: string): {
  normalizedWord: string;
  extractedParticle?: string;
  originalQuery: string;
  isGrammarPhrase: boolean;
} {
  const clean = rawTerm.trim();
  // 核心防护：若用户选中的是较长短语、惯用句或整句（长度 > 6 或含标点/空格），绝不当作单字粘连助词剥离！
  if (clean.length > 6 || /[。！？!?、\s\u3000]/.test(clean)) {
    return {
      normalizedWord: clean,
      originalQuery: clean,
      isGrammarPhrase: false,
    };
  }

  const particleMatch = clean.match(/^([をにでへがはものとや]|から|まで|より)([一-龯々〆ヵヶぁ-んァ-ヶー]+)$/);
  if (particleMatch) {
    const particle = particleMatch[1];
    const rest = particleMatch[2];

    // 如果 rest 为 "行"，直接对齐 "行く"
    if (rest === '行') {
      return {
        normalizedWord: '行く',
        extractedParticle: particle,
        originalQuery: clean,
        isGrammarPhrase: true,
      };
    }

    // 尝试活用形还原
    const deinflected = deinflect(rest);
    const valid = deinflected.find((d) => DICT_BY_WORD.has(d.lemma));
    if (valid) {
      return {
        normalizedWord: valid.lemma,
        extractedParticle: particle,
        originalQuery: clean,
        isGrammarPhrase: true,
      };
    }

    if (DICT_BY_WORD.has(rest)) {
      return {
        normalizedWord: rest,
        extractedParticle: particle,
        originalQuery: clean,
        isGrammarPhrase: true,
      };
    }
  }

  return {
    normalizedWord: clean,
    originalQuery: clean,
    isGrammarPhrase: false,
  };
}

/** 常见中文连词、介词、代词及口语助词黑名单：绝对禁止作为已查询高亮项或在普通文本中虚线化 */
export const COMMON_CHINESE_STOPWORDS = new Set([
  '然后', '但是', '所以', '因为', '虽然', '如果', '不过', '而且', '接着', '并且',
  '以及', '或者', '还是', '那么', '只是', '就是', '我们', '你们', '他们', '什么',
  '怎么', '这里', '那里', '这个', '那个', '已经', '可以', '现在', '刚才', '开始',
  '一直', '其实', '可能', '应该', '为了', '关于', '对于', '一边', '一起', '一样',
  '以后', '以前', '之后', '之前', '时候', '地方', '东西', '事情', '很多', '一点',
  '非常', '特别', '十分', '真的', '好的', '好的呀', '好的呢', '这样', '那样'
]);

const DICT_CACHE_KEY = 'agy_jp_dict_cache_v1';
const QUERIED_TERMS_KEY = 'agy_queried_terms_v1';
const QUERIED_CHINESE_TERMS_KEY = 'agy_queried_chinese_terms_v1';

class DictionaryService {
  private localCache: Map<string, DictEntry> = new Map();
  /** 进行中的 AI 请求池：同 key 的并发查询共享同一个 Promise，杜绝重复请求与重复计费 */
  private pendingAiRequests: Map<string, Promise<DictEntry | null>> = new Map();
  private queriedTerms: Set<string> = new Set();
  /** 专用于中文普通文本中用户手动划词查询过的词汇（不包含词典词汇，严格杜绝污染） */
  private queriedChineseTerms: Set<string> = new Set();
  private queriedTermsListeners: Set<(japaneseTerms: Set<string>, chineseTerms: Set<string>) => void> = new Set();
  private isLoaded = false;

  constructor() {
    this.initCacheFromStorage();
  }

  // 从本地 LocalStorage 读取已保存的词条缓存并自动消毒
  private initCacheFromStorage() {
    if (this.isLoaded) return;
    try {
      // 1. 初始化持久化的已查询划词词库（日文区）
      try {
        const storedTerms = localStorage.getItem(QUERIED_TERMS_KEY);
        if (storedTerms) {
          const list = JSON.parse(storedTerms) as string[];
          let termsChanged = false;
          if (Array.isArray(list)) {
            for (const t of list) {
              if (typeof t === 'string') {
                const clean = t.trim();
                // 严禁单字（尤其是单汉字如“手”、“前”）或常见中文虚词（如“然后”）混入已查询词库
                if (clean.length >= 2 && !COMMON_CHINESE_STOPWORDS.has(clean)) {
                  this.queriedTerms.add(clean);
                } else {
                  termsChanged = true;
                }
              }
            }
          }
          if (termsChanged) {
            try {
              localStorage.setItem(QUERIED_TERMS_KEY, JSON.stringify(Array.from(this.queriedTerms)));
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }

      // 1.1 初始化持久化的中文手动划选查询词库（非 <jp> 普通文本专用）
      try {
        const storedCnTerms = localStorage.getItem(QUERIED_CHINESE_TERMS_KEY);
        if (storedCnTerms) {
          const list = JSON.parse(storedCnTerms) as string[];
          let termsChanged = false;
          if (Array.isArray(list)) {
            for (const t of list) {
              if (typeof t === 'string') {
                const clean = t.trim();
                // 严格消毒：长度 >= 2、非停用词、非纯假名
                if (
                  clean.length >= 2 &&
                  !COMMON_CHINESE_STOPWORDS.has(clean) &&
                  !/^[ぁ-んァ-ヶー]+$/.test(clean)
                ) {
                  this.queriedChineseTerms.add(clean);
                } else {
                  termsChanged = true;
                }
              }
            }
          }
          if (termsChanged) {
            try {
              localStorage.setItem(
                QUERIED_CHINESE_TERMS_KEY,
                JSON.stringify(Array.from(this.queriedChineseTerms))
              );
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }

      const stored = localStorage.getItem(DICT_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, DictEntry>;
        let hasPollutedEntries = false;

        for (const [k, v] of Object.entries(parsed)) {
          // 污染词条自动清理：仅针对「短小的助词粘连脏词条」（如 "に行"、"を食べる"）；
          // 长短语 / 整句（长度 > 6 或含标点空格）属于合法的划词查询内容，必须原样保留。
          if (isShortGluedQuery(k) && !isSafeToInjectIntoOfflineDict(k)) {
            hasPollutedEntries = true;
            continue;
          }

          // 关键自愈：如果本地缓存中的条目其 word 是中文原词（历史 bug 留下的脏数据），尝试自愈
          if (v && v.word) {
            const isWordChinese =
              detectQueryLanguage(v.word) === 'cn' ||
              DISTINCT_CHINESE_CHAR_REGEX.test(v.word) ||
              (v.originalQuery && v.word === v.originalQuery);
            if (isWordChinese) {
              if (v.lemma && detectQueryLanguage(v.lemma) !== 'cn' && !DISTINCT_CHINESE_CHAR_REGEX.test(v.lemma)) {
                v.word = v.lemma;
                hasPollutedEntries = true;
              } else if (v.reading && /[ぁ-んァ-ヶ]/.test(v.reading) && !DISTINCT_CHINESE_CHAR_REGEX.test(v.reading)) {
                v.word = v.reading;
                hasPollutedEntries = true;
              }
            }
          }

          this.localCache.set(k, v);

          // 核心机制：将本地已缓存的权威 AI 释义与例句同步覆盖注入离线内置词典，实现永久离线更新覆盖
          if (v && v.meaning && !v.isPlaceholder && (v.source === 'ai' || (v.examples && v.examples.length > 0))) {
            const targetWord = v.word || k;
            // 关键防护：只允许真正的单词注入离线分词词典，绝不让短语/句型/整句污染 DICT_BY_WORD
            const isWordCategory = !v.queryType || v.queryType === 'word';
            if (isWordCategory && isTrueSingleWordTerm(targetWord)) {
              const item: DictItem = {
                word: targetWord,
                reading: v.reading || targetWord,
                pitch: v.pitch ?? 0,
                pos: v.pos || '词汇',
                level: (v.level as any) || 'N4',
                meaning: v.meaning,
                detail: v.detail,
                examples: v.examples,
              };
              DICT_BY_WORD.set(item.word, item);
              if (v.lemma && isTrueSingleWordTerm(v.lemma)) {
                DICT_BY_WORD.set(v.lemma, item);
              }
              if (item.reading) {
                DICT_BY_READING.set(item.reading, item);
              }
            }
          }
        }

        // 关键自愈：清理 DICT_BY_WORD 中被注入的中文词条或历史遗留不一致条目
        for (const [key, item] of DICT_BY_WORD.entries()) {
          if (
            detectQueryLanguage(key) === 'cn' ||
            DISTINCT_CHINESE_CHAR_REGEX.test(key) ||
            (item && (detectQueryLanguage(item.word) === 'cn' || DISTINCT_CHINESE_CHAR_REGEX.test(item.word))) ||
            (item && item.word !== key && (item as any).lemma !== key)
          ) {
            DICT_BY_WORD.delete(key);
          }
        }

        if (hasPollutedEntries) {
          this.persistCacheToStorage();
        }
      }
      this.isLoaded = true;
    } catch {
      this.isLoaded = true;
    }
  }

  // 适度写入本地持久存储，并设置安全容量上限（保留最近 1000 词，节约存储空间）
  private persistCacheToStorage() {
    try {
      const entries = Array.from(this.localCache.entries()).slice(-1000);
      const obj: Record<string, DictEntry> = {};
      for (const [k, v] of entries) {
        obj[k] = v;
      }
      localStorage.setItem(DICT_CACHE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore quota errors
    }
  }

  /** 获取所有日文区已完成查询的文本集合（用于 <jp> 标签内划词虚线高亮） */
  public getQueriedTerms(): Set<string> {
    this.initCacheFromStorage();
    return new Set(this.queriedTerms);
  }

  /** 获取所有中文普通文本中手动划选查询的词条集合（非 <jp> 普通文本专用） */
  public getQueriedChineseTerms(): Set<string> {
    this.initCacheFromStorage();
    return new Set(this.queriedChineseTerms);
  }

  /** 登记一个已查询完成的文本词条，按中日文作用域严格区分并持久化 */
  public addQueriedTerm(term: string, isFromJTag: boolean = true) {
    const clean = (term || '').trim();
    if (!clean || clean.length < 2) return; // 绝对禁止单字（如汉字“手”、“前”或假名）作为已查询词汇高亮
    // 过滤纯标点、纯空白与常见中文连词/虚词
    if (/^[、。！？!?,.:;…~「」『』()（）\[\]\s\-]+$/.test(clean)) return;
    if (COMMON_CHINESE_STOPWORDS.has(clean)) return;

    this.initCacheFromStorage();

    if (isFromJTag) {
      // 日文区域查询项：加入日文划词集，绝不污染中文普通文本
      const had = this.queriedTerms.has(clean);
      this.queriedTerms.add(clean);

      const unparen = clean.replace(/^[（(「『【《〈〔\[]+|[）)」』】》〉〕\]]+$/g, '').trim();
      if (
        unparen &&
        unparen !== clean &&
        unparen.length >= 2 &&
        !COMMON_CHINESE_STOPWORDS.has(unparen) &&
        !/^[、。！？!?,.:;…~\s\-]+$/.test(unparen)
      ) {
        this.queriedTerms.add(unparen);
      }

      if (!had) {
        try {
          const list = Array.from(this.queriedTerms).slice(-600);
          localStorage.setItem(QUERIED_TERMS_KEY, JSON.stringify(list));
        } catch {
          // ignore
        }
        this.notifyQueriedTermsListeners();
      }
    } else {
      // 中文普通文本手动划词查询项：严格校验后仅加入中文专属查询集
      if (/^[ぁ-んァ-ヶー]+$/.test(clean)) return; // 纯假名词不加入中文集
      const had = this.queriedChineseTerms.has(clean);
      this.queriedChineseTerms.add(clean);

      const unparen = clean.replace(/^[（(「『【《〈〔\[]+|[）)」』】》〉〕\]]+$/g, '').trim();
      if (
        unparen &&
        unparen !== clean &&
        unparen.length >= 2 &&
        !COMMON_CHINESE_STOPWORDS.has(unparen) &&
        !/^[ぁ-んァ-ヶー]+$/.test(unparen) &&
        !/^[、。！？!?,.:;…~\s\-]+$/.test(unparen)
      ) {
        this.queriedChineseTerms.add(unparen);
      }

      if (!had) {
        try {
          const list = Array.from(this.queriedChineseTerms).slice(-600);
          localStorage.setItem(QUERIED_CHINESE_TERMS_KEY, JSON.stringify(list));
        } catch {
          // ignore
        }
        this.notifyQueriedTermsListeners();
      }
    }
  }

  /** 订阅已查询词汇变化事件，当任何新词查询成功后立即广播，驱动界面重新渲染虚线 */
  public subscribeQueriedTerms(
    listener: (japaneseTerms: Set<string>, chineseTerms: Set<string>) => void
  ): () => void {
    this.queriedTermsListeners.add(listener);
    return () => {
      this.queriedTermsListeners.delete(listener);
    };
  }

  private notifyQueriedTermsListeners() {
    const jpSnapshot = new Set(this.queriedTerms);
    const cnSnapshot = new Set(this.queriedChineseTerms);
    for (const fn of this.queriedTermsListeners) {
      try {
        fn(jpSnapshot, cnSnapshot);
      } catch {
        // ignore
      }
    }
  }

  /**
   * 同步查询单词：
   * 0. 优先检查本地 LocalStorage/内存中是否有经 AI 精释生成或覆盖过的权威词条（彻底解决离线词典未覆盖问题）
   * 1. 精确匹配内置权威日汉词库原型（0 延迟，0 流量，0 token）
   * 2. 结合形态素活用还原器（De-inflector）逆向推导原型（如 食べました -> 食べる、行きたい -> 行く）
   * 3. 词干智能关联（如 買 -> 買う、食 -> 食べる）
   * 4. 纯假名反向查找
   * 5. 本地缓存与启发式解析
   */
  public lookup(word: string, reading?: string): DictEntry {
    this.initCacheFromStorage();
    const cleanWord = word.trim();
    if (!cleanWord) {
      return {
        word: '',
        reading: '',
        pos: '词汇',
        meaning: '暂无释义',
        source: 'builtin',
      };
    }

    // 0. 语法短语预处理（如用户查询了 "に行"、"を食べる" 等粘连短语）
    const norm = normalizeQueryTerm(cleanWord);
    if (norm.isGrammarPhrase && norm.normalizedWord !== cleanWord) {
      // 优先从已有的缓存或内置词典中查找规范化后的原型
      const baseEntry = this.lookup(norm.normalizedWord, reading);
      if (baseEntry && baseEntry.meaning && !baseEntry.meaning.includes('暂无释义')) {
        const particleDesc = norm.extractedParticle ? `助词「${norm.extractedParticle}」+ ` : '';
        return {
          ...baseEntry,
          originalQuery: cleanWord,
          word: baseEntry.word || norm.normalizedWord,
          lemma: norm.normalizedWord,
          detail: baseEntry.detail
            ? `【语法搭配】由${particleDesc}词条「${norm.normalizedWord}」构成。${baseEntry.detail}`
            : `【语法搭配】由${particleDesc}词条「${norm.normalizedWord}」构成的语法短语。`,
        };
      }
    }

    // 0.1 最高优先级：检查本地缓存中是否有经过 AI 精确生成或手动覆盖的高质量释义条目
    if (this.localCache.has(cleanWord)) {
      const cached = this.localCache.get(cleanWord)!;
      if (
        cached &&
        !cached.isPlaceholder &&
        !cached.meaning.includes('常用日语词汇') &&
        !cached.meaning.includes('正在生成') &&
        !cached.meaning.includes('常用口语表达') &&
        (cached.source === 'ai' || (cached.examples && cached.examples.length > 0))
      ) {
        if (
          cached.originalQuery === cleanWord ||
          detectQueryLanguage(cleanWord) === 'cn' ||
          DISTINCT_CHINESE_CHAR_REGEX.test(cleanWord)
        ) {
          return cached;
        }
        return {
          ...cached,
          word: cached.word || cleanWord,
          lemma: cached.lemma || (cached.word !== cleanWord ? cached.word : undefined),
          source: 'ai',
        };
      }
    }

    // 1. 精确匹配内置词典原型（并核对是否有 AI 升级覆盖）
    if (DICT_BY_WORD.has(cleanWord)) {
      const item = DICT_BY_WORD.get(cleanWord)!;
      // 若该原型在 localCache 中有 AI 覆盖，优先使用 AI 覆盖
      if (this.localCache.has(item.word)) {
        const cached = this.localCache.get(item.word)!;
        if (cached && !cached.isPlaceholder && (cached.source === 'ai' || (cached.examples && cached.examples.length > 0))) {
          if (
            cached.originalQuery === cleanWord ||
            detectQueryLanguage(cleanWord) === 'cn' ||
            DISTINCT_CHINESE_CHAR_REGEX.test(cleanWord)
          ) {
            return cached;
          }
          return {
            ...cached,
            word: cleanWord,
            lemma: cleanWord !== item.word ? item.word : undefined,
            source: 'ai',
          };
        }
      }
      return {
        word: item.word,
        reading: item.reading,
        pos: item.pos,
        meaning: item.meaning,
        detail: item.detail,
        level: item.level,
        pitch: item.pitch,
        examples: item.examples,
        source: (item as any).source || 'builtin',
      };
    }

    // 2. 形态素活用逆向还原（De-inflector）：
    // 例如输入 "食べました"、"行きたい"、"美味しかった"、"読んだ"、"使われます"
    const candidates = deinflect(cleanWord);
    for (const cand of candidates) {
      // 排除断定/判断助动词规则，避免名词如「本当です」误套用
      if (cand.formTag && (cand.formTag.includes('断定') || cand.formTag.includes('判断'))) {
        continue;
      }
      if (DICT_BY_WORD.has(cand.lemma)) {
        const item = DICT_BY_WORD.get(cand.lemma)!;
        // 核心修复：词典标题使用当前活用形式自身的读音（如 "使います" -> "つかいます"），
        // 辞书原型读音保存在 lemmaReading（如 "使う" -> "つかう"）
        const surfaceReading = (reading && reading !== item.reading)
          ? reading
          : deriveConjugatedReading(cleanWord, cand.lemma, item.reading);

        return {
          word: cleanWord,
          lemma: cand.lemma,
          reading: surfaceReading,
          lemmaReading: item.reading,
          pos: item.pos,
          level: item.level,
          pitch: item.pitch,
          meaning: item.meaning,
          detail: `当前形式为「${cleanWord}」（${cand.formTag}）。辞书原型：${cand.lemma}【${item.reading}】。${item.detail || ''}`,
          inflectionForm: cand.formTag,
          source: 'builtin',
        };
      }
    }

    // 3. 单汉字/词干智能关联扩展（例如输入 "買"、"食"、"行" 等词干时，精准关联到动词原型 "買う"、"食べる"、"行く"）
    const hasKanji = /[一-龯々〆]/.test(cleanWord);
    if (hasKanji && cleanWord.length <= 2) {
      for (const [w, item] of DICT_BY_WORD.entries()) {
        if (w.startsWith(cleanWord) && (item.pos.includes('动词') || item.pos.includes('形容词'))) {
          // 若传入了 reading（如 買 的 reading 为 か），必须核对假名读音前缀，杜绝乱配
          const cleanReading = reading ? reading.trim() : '';
          if (!cleanReading || item.reading.startsWith(cleanReading)) {
            return {
              word: cleanWord,
              lemma: item.word,
              reading: item.reading,
              pos: item.pos,
              level: item.level,
              pitch: item.pitch,
              meaning: item.meaning,
              detail: `词根对应单词原型：${item.word}【${item.reading}】（${item.pos}）。${item.detail || ''}`,
              inflectionForm: '词根/语干',
              source: 'builtin',
            };
          }
        }
      }
    }

    // 4. 仅当查询词本身是【纯假名】时，才允许按读音反向查找对应假名词！
    // 绝对禁止汉字词（如 "買"）被反向读音查找误判定为无关假名助词（如 "か"）！
    const targetReading = reading ? reading.trim() : '';
    const isPureKanaWord = /^[ぁ-んァ-ヶー]+$/.test(cleanWord);
    if (isPureKanaWord) {
      const kanaQuery = targetReading || cleanWord;
      if (DICT_BY_READING.has(kanaQuery)) {
        const item = DICT_BY_READING.get(kanaQuery)!;
        // 进一步保证匹配项不是风马牛不相及的词
        if (item.reading === kanaQuery || item.word === kanaQuery) {
          return {
            word: cleanWord,
            reading: item.reading,
            pos: item.pos,
            meaning: item.meaning,
            detail: item.detail,
            level: item.level,
            pitch: item.pitch,
            source: 'builtin',
          };
        }
      }
    }

    // 5. 智能假名语干/漏选补全匹配（例如划词漏选末尾假名，如 "かっこい" 补全为 "かっこいい"，"おいし" 补全为 "おいしい"）
    const candIAdjective = cleanWord + 'い';
    if (DICT_BY_WORD.has(candIAdjective)) {
      const item = DICT_BY_WORD.get(candIAdjective)!;
      return {
        word: cleanWord,
        lemma: candIAdjective,
        reading: item.reading,
        pos: item.pos,
        level: item.level,
        pitch: item.pitch,
        meaning: item.meaning,
        detail: `语干智能推导形容词原型：${candIAdjective}【${item.reading}】。${item.detail || ''}`,
        inflectionForm: '形容词原型关联',
        source: 'builtin',
      };
    }
    if (this.localCache.has(candIAdjective)) {
      const cached = this.localCache.get(candIAdjective)!;
      if (!cached.isPlaceholder && !cached.meaning.includes('常用日语词汇') && !cached.meaning.includes('常用口语表达')) {
        return {
          ...cached,
          word: cleanWord,
          lemma: cached.word || candIAdjective,
          detail: `语干智能关联辞书原型：${cached.word || candIAdjective}【${cached.reading}】。${cached.detail || ''}`,
          source: cached.source || 'cache',
          isPlaceholder: false,
        };
      }
    }

    // 6. 检查本地 LocalStorage 缓存
    if (this.localCache.has(cleanWord)) {
      const cached = this.localCache.get(cleanWord)!;
      // 只要不是旧版无意义占位符，就直接秒级返回
      if (!cached.isPlaceholder && !cached.meaning.includes('常用日语词汇') && !cached.meaning.includes('常用口语表达')) {
        // 关键防护：如果当前查询的是中文原词（如 cached.originalQuery === cleanWord 或 cleanWord 经判定为中文），
        // 缓存中的 cached.word 已经是翻译后的日文词（如 "口"），绝对不能倒退覆盖为中文 cleanWord（"嘴"）！
        if (
          cached.originalQuery === cleanWord ||
          detectQueryLanguage(cleanWord) === 'cn' ||
          DISTINCT_CHINESE_CHAR_REGEX.test(cleanWord)
        ) {
          return cached;
        }
        // 如果缓存条目的真实 word 不等于 cleanWord（例如 AI 纠错后 cleanWord 为 "かっこい"，而 cached.word 为 "かっこいい"）
        if (cached.word && cached.word !== cleanWord) {
          return {
            ...cached,
            word: cleanWord,
            lemma: cached.word,
          };
        }
        return cached;
      }
    }

    // 7. 在本地缓存中查找是否存在以 cleanWord 为前缀的权威词条（长度差1~2个假名）
    for (const [key, entry] of this.localCache.entries()) {
      if (!entry.isPlaceholder && entry.meaning && !entry.meaning.includes('常用口语表达')) {
        const targetWord = entry.lemma || entry.word;
        if (
          targetWord.startsWith(cleanWord) &&
          targetWord.length > cleanWord.length &&
          targetWord.length - cleanWord.length <= 2
        ) {
          return {
            ...entry,
            word: cleanWord,
            lemma: targetWord,
            detail: `前缀自动命中规范词原型：${targetWord}【${entry.reading}】。${entry.detail || ''}`,
            source: entry.source || 'cache',
            isPlaceholder: false,
          };
        }
      }
    }

    // 8. 启发式词法分析与智能派生提取
    const derived = this.deriveHeuristicEntry(cleanWord, reading);
    this.localCache.set(cleanWord, derived);
    this.persistCacheToStorage();
    return derived;
  }

  /**
   * 实时调用大模型生成权威精准词条定义
   * 获取成功后自动存入 LocalStorage 持久化词库（agy_jp_dict_cache_v1），
   * 该词条即被永久收录，下一次点击该词时直接 0ms 离线秒查！
   *
   * 并发去重（核心）：同一查询（词条 + 读音 + 上下文）在返回前若被重复触发
   * （典型场景：用户关闭悬浮窗后立刻再次划选同一段文本），直接复用同一个
   * in-flight Promise —— 绝不重复请求、绝不重复消耗 Token。
   */
  public async fetchAiDefinition(
    word: string,
    reading?: string,
    contextOptions?: { isFromJTag?: boolean; sentenceContext?: string }
  ): Promise<DictEntry | null> {
    this.initCacheFromStorage();
    const cleanWord = word.trim();
    if (!cleanWord) return null;

    const dedupeKey = `${cleanWord}\u0000${reading || ''}\u0000${contextOptions?.sentenceContext || ''}`;
    const inflight = this.pendingAiRequests.get(dedupeKey);
    if (inflight) return inflight;

    const task = this.requestAiDefinition(cleanWord, reading, contextOptions);
    this.pendingAiRequests.set(dedupeKey, task);
    try {
      return await task;
    } finally {
      if (this.pendingAiRequests.get(dedupeKey) === task) {
        this.pendingAiRequests.delete(dedupeKey);
      }
    }
  }

  /** 真正发起 AI 词条请求（仅由 fetchAiDefinition 调用，已在上层完成并发去重） */
  private async requestAiDefinition(
    cleanWord: string,
    reading?: string,
    contextOptions?: { isFromJTag?: boolean; sentenceContext?: string }
  ): Promise<DictEntry | null> {
    // 智能预规范化处理：如果 cleanWord 包含前置助词（如 "に行"）
    const norm = normalizeQueryTerm(cleanWord);
    const queryWord = norm.normalizedWord;
    const effectiveContext = {
      ...contextOptions,
      originalQuery: cleanWord !== queryWord ? cleanWord : undefined,
    };

    try {
      const aiResult = await queryWordDefinitionFromLLM(queryWord, reading, undefined, effectiveContext);
      if (aiResult && aiResult.meaning && !aiResult.meaning.includes('常用日语词汇')) {
        let finalWord = aiResult.word?.trim() || queryWord;
        const isInputChinese =
          detectQueryLanguage(cleanWord) === 'cn' ||
          DISTINCT_CHINESE_CHAR_REGEX.test(cleanWord);

        // 如果输入是中文，而 finalWord 依然等于 cleanWord 或包含纯中文字符，执行兜底自愈
        if (isInputChinese && (finalWord === cleanWord || DISTINCT_CHINESE_CHAR_REGEX.test(finalWord) || detectQueryLanguage(finalWord) === 'cn')) {
          if (aiResult.lemma && detectQueryLanguage(aiResult.lemma) !== 'cn' && !DISTINCT_CHINESE_CHAR_REGEX.test(aiResult.lemma)) {
            finalWord = aiResult.lemma;
          } else if (aiResult.reading && /[ぁ-んァ-ヶ]/.test(aiResult.reading) && !DISTINCT_CHINESE_CHAR_REGEX.test(aiResult.reading)) {
            finalWord = aiResult.reading;
          }
        }

        const fullEntry: DictEntry = {
          word: finalWord,
          lemma: finalWord !== cleanWord && !isInputChinese ? finalWord : undefined,
          originalQuery: aiResult.originalQuery || (isInputChinese || finalWord !== cleanWord ? cleanWord : undefined),
          reading: aiResult.reading || reading || finalWord,
          pos: aiResult.pos || (aiResult.queryType === 'sentence' ? '句子表达' : aiResult.queryType === 'grammar' ? '语法句型' : '日语词汇'),
          pitch: aiResult.pitch,
          level: aiResult.level,
          meaning: aiResult.meaning,
          detail: aiResult.detail || '',
          breakdown: aiResult.breakdown,
          annotated: aiResult.annotated,
          examples: aiResult.examples,
          source: 'ai',
          isPlaceholder: false,
          queryType: aiResult.queryType,
        };

        // 关键防护：只有合法的单个词条（非句子、非短语、非中文输入）才允许写入离线内置分词词典，绝对禁止将整句或长短语污染 DICT_BY_WORD！
        const isTrueSingleWord =
          !isInputChinese &&
          (!aiResult.queryType || aiResult.queryType === 'word') &&
          isTrueSingleWordTerm(finalWord);

        if (isTrueSingleWord) {
          const updatedOfflineItem: DictItem = {
            word: finalWord,
            reading: fullEntry.reading,
            pitch: fullEntry.pitch ?? 0,
            pos: fullEntry.pos || '日语词汇',
            level: (fullEntry.level as any) || 'N4',
            meaning: fullEntry.meaning,
            detail: fullEntry.detail,
            examples: fullEntry.examples,
          };
          DICT_BY_WORD.set(finalWord, updatedOfflineItem);
          if (fullEntry.lemma && isTrueSingleWordTerm(fullEntry.lemma)) {
            DICT_BY_WORD.set(fullEntry.lemma, updatedOfflineItem);
          }
          if (cleanWord === finalWord && isTrueSingleWordTerm(cleanWord)) {
            DICT_BY_WORD.set(cleanWord, updatedOfflineItem);
          }
          if (fullEntry.reading && fullEntry.reading.length <= 12) {
            DICT_BY_READING.set(fullEntry.reading, updatedOfflineItem);
          }
        }

        if (finalWord !== cleanWord) {
          // cleanWord 仅作为本地缓存重定向，指向规范化后的 finalWord 原型，绝不污染 DICT_BY_WORD
          this.localCache.set(cleanWord, {
            ...fullEntry,
            word: finalWord,
            lemma: finalWord,
            originalQuery: cleanWord,
          });
          this.localCache.set(finalWord, fullEntry);
        } else {
          this.localCache.set(cleanWord, fullEntry);
        }
        const isFromJTag = contextOptions?.isFromJTag ?? true;
        this.addQueriedTerm(cleanWord, isFromJTag);
        if (finalWord) this.addQueriedTerm(finalWord, true);
        if (fullEntry.originalQuery && !isFromJTag) {
          this.addQueriedTerm(fullEntry.originalQuery, false);
        }
        return fullEntry;
      }
    } catch {
      // Ignore network errors
    }
    return null;
  }

  /**
   * 校验某个词是否为合法、真实的日语词条（或可还原为合法辞书原型）
   * 供学情档案自动收录白名单校验使用：
   * 绝对禁止收录语法助词（で、と、は等）、助动词（です、ます等）、连词（それと等）及碎片残缺字
   */
  public isValidJapaneseWord(word: string): { isValid: boolean; entry?: DictEntry } {
    const cleanWord = word.trim();
    if (!cleanWord || cleanWord.length <= 0) return { isValid: false };

    // 严禁语法助词、助动词、连词及纯单假名作为生词收录
    const EXCLUDED_GRAMMAR_WORDS = new Set([
      'で', 'と', 'は', 'が', '重', 'を', 'に', 'へ', 'も', 'か', 'ね', 'よ', 'の', 'や', 'から', 'まで', 'より',
      'です', 'ます', 'でした', 'ました', 'だ', 'である',
      'それと', 'そして', 'それに', 'それから', 'でも', 'しかし', 'だから', 'ですから', 'また',
      'これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'どこ', '私', 'あなた'
    ]);
    if (EXCLUDED_GRAMMAR_WORDS.has(cleanWord)) {
      return { isValid: false };
    }

    // 1. 检查词库精准匹配
    if (DICT_BY_WORD.has(cleanWord)) {
      const item = DICT_BY_WORD.get(cleanWord)!;
      // 排除非实义词
      if (
        item.pos.includes('助词') ||
        item.pos.includes('助动词') ||
        item.pos.includes('连词') ||
        item.pos.includes('代词')
      ) {
        return { isValid: false };
      }
      return {
        isValid: true,
        entry: {
          word: item.word,
          reading: item.reading,
          pos: item.pos,
          meaning: item.meaning,
          detail: item.detail,
          level: item.level,
          pitch: item.pitch,
          source: 'builtin',
        },
      };
    }

    // 2. 检查活用还原（如 食べました -> 食べる、買いました -> 買う）
    const candidates = deinflect(cleanWord);
    for (const cand of candidates) {
      if (DICT_BY_WORD.has(cand.lemma)) {
        const item = DICT_BY_WORD.get(cand.lemma)!;
        if (
          item.pos.includes('助词') ||
          item.pos.includes('助动词') ||
          item.pos.includes('连词') ||
          item.pos.includes('代词')
        ) {
          continue;
        }
        return {
          isValid: true,
          entry: {
            word: item.word,
            lemma: cand.lemma,
            reading: item.reading,
            pos: item.pos,
            level: item.level,
            pitch: item.pitch,
            meaning: item.meaning,
            detail: item.detail,
            source: 'builtin',
          },
        };
      }
    }

    // 3. 词干自动扩展（如 買 -> 关联到 買う，食 -> 关联到 食べる）
    const hasKanji = /[一-龯々〆]/.test(cleanWord);
    if (hasKanji && cleanWord.length <= 2) {
      for (const [w, item] of DICT_BY_WORD.entries()) {
        if (w.startsWith(cleanWord) && (item.pos.includes('动词') || item.pos.includes('形容词'))) {
          return {
            isValid: true,
            entry: {
              word: item.word,
              lemma: item.word,
              reading: item.reading,
              pos: item.pos,
              level: item.level,
              pitch: item.pitch,
              meaning: item.meaning,
              detail: item.detail,
              source: 'builtin',
            },
          };
        }
      }
    }

    // 4. 检查是否有本地缓存的 AI 权威条目
    if (this.localCache.has(cleanWord)) {
      const cached = this.localCache.get(cleanWord)!;
      if (!cached.isPlaceholder && cached.meaning && !cached.meaning.includes('常用日语词汇') && !cached.meaning.includes('常用口语表达')) {
        if (cached.word && cached.word !== cleanWord) {
          return {
            isValid: true,
            entry: {
              ...cached,
              lemma: cached.lemma || cached.word,
            },
          };
        }
        return {
          isValid: true,
          entry: cached,
        };
      }
    }

    // 5. 检查是否为形容词漏选假名（如 "かっこい" 对应 "かっこいい"）
    const candIAdj = cleanWord + 'い';
    if (DICT_BY_WORD.has(candIAdj)) {
      const item = DICT_BY_WORD.get(candIAdj)!;
      return {
        isValid: true,
        entry: {
          word: cleanWord,
          lemma: candIAdj,
          reading: item.reading,
          pos: item.pos,
          meaning: item.meaning,
          level: item.level,
          pitch: item.pitch,
          source: 'builtin',
        },
      };
    }
    if (this.localCache.has(candIAdj)) {
      const cached = this.localCache.get(candIAdj)!;
      if (!cached.isPlaceholder && cached.meaning && !cached.meaning.includes('常用日语词汇') && !cached.meaning.includes('常用口语表达')) {
        return {
          isValid: true,
          entry: {
            ...cached,
            word: cleanWord,
            lemma: cached.word || candIAdj,
            source: cached.source || 'cache',
          },
        };
      }
    }

    return { isValid: false };
  }

  /**
   * 保存或更新词条至本地缓存
   */
  public saveEntry(entry: DictEntry) {
    this.initCacheFromStorage();
    this.localCache.set(entry.word, { ...entry, source: 'cache' });
    this.persistCacheToStorage();
  }

  /**
   * 启发式离线形态解析器：
   * 当遇到未直接收入的冷门词时离线推导基本释义
   */
  private deriveHeuristicEntry(word: string, reading?: string): DictEntry {
    const effectiveReading = reading || word;

    // 检查是否为 ～たい (想做...)
    if (word.endsWith('たい') || word.endsWith('たいです')) {
      const stem = word.replace(/たい(です)?$/, '');
      return {
        word,
        reading: effectiveReading,
        pos: '动词愿望形',
        meaning: `想要${stem}，想做（动作）`,
        detail: `由动词连用形接愿望助动词「たい」构成，表示第一人称或说话者的强烈意愿。`,
        source: 'cache',
        isPlaceholder: false,
      };
    }

    // 检查是否为 ～ます / ～ました / ～ません (敬体动词)
    if (word.endsWith('ます') || word.endsWith('ました') || word.endsWith('ません')) {
      return {
        word,
        reading: effectiveReading,
        pos: '动词·礼貌体',
        meaning: `${word}（动词敬体形式）`,
        detail: `动词的ます形，用于日常向长辈、平辈或初次见面者表示礼貌。`,
        source: 'cache',
        isPlaceholder: false,
      };
    }

    // 检查是否为 ～ている / ～ています (正在进行 / 状态持续)
    if (word.endsWith('ている') || word.endsWith('ています')) {
      return {
        word,
        reading: effectiveReading,
        pos: '动词补助形',
        meaning: `正在...；处于...状态中`,
        detail: `动词「て形」+「いる/います」，表示动作正在进行中或结果状态的存续。`,
        source: 'cache',
        isPlaceholder: false,
      };
    }

    // 检查是否为 ～ない / ～ないで (否定形)
    if (word.endsWith('ない') || word.endsWith('ないで')) {
      return {
        word,
        reading: effectiveReading,
        pos: '动词否定形',
        meaning: `不...，没有...（未然形否定）`,
        source: 'cache',
        isPlaceholder: false,
      };
    }

    // 纯片假名外来语判断 (如 コンビニ、ホテル、スマホ)
    if (/^[ァ-ヴー]+$/.test(word)) {
      return {
        word,
        reading: effectiveReading,
        pos: '外来语 / 片假名词汇',
        meaning: '外来语借词（点击右上角 AI 按钮可获取精释）',
        detail: `源自外语的日文片假名借用词汇。建议在对话语境中体会具体含义。`,
        source: 'cache',
        isPlaceholder: true,
      };
    }

    // 纯假名日常词汇判断
    if (/^[ぁ-んー]+$/.test(word)) {
      return {
        word,
        reading: effectiveReading,
        pos: '假名词汇',
        meaning: '日语常用口语表达',
        detail: `常用日语日常表达，点击发音按钮可聆听母语级发音。`,
        source: 'cache',
        isPlaceholder: true,
      };
    }

    // 默认汉字词条兜底
    const hasKanji = /[一-龯々〆]/.test(word);
    return {
      word,
      reading: effectiveReading,
      pos: hasKanji ? '汉字词汇' : '日语词汇',
      meaning: '正在生成精准释义...',
      detail: `日常词汇。点击词典小窗中的“AI 生成释义”即可获取权威词条与搭配。`,
      source: 'cache',
      isPlaceholder: true,
    };
  }
}

export const dictionaryService = new DictionaryService();
