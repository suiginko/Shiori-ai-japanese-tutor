import { COMMON_PITCH_DICT, calculateMoraPitches, MoraPitch } from './pitchAccentData';
import { DICT_BY_WORD } from '../data/dictionaryData';
import { deinflect } from './deinflector';
import { MessageCorrection } from '../types';
import { JAPANESE_TAG_REGEX, hasJapaneseTag } from './languageDetector';
import { deriveJukugoReading, deriveSingleKanjiReading, isAllKanji } from './kanjiJukugoData';
import { DictItem } from '../data/dictionaryData';
import { COMMON_CHINESE_STOPWORDS } from '../services/dictionaryService';

export interface RubyToken {
  type: 'ruby' | 'text' | 'plain-word';
  prefixKana?: string; // 混合词汇前置平假名/片假名（如 "やる気" 的 "やる"、"お茶" 的 "お"），保证排版绝不注音但保留整词词典联动
  surface: string;
  reading?: string;
  hideFurigana?: boolean; // 若为已掌握词汇，按学情设定隐藏振假名注音
  okurigana?: string; // 动词/形容词汉字后紧跟的送假名，如 "べました"
  fullWord?: string; // 完整词形，如 "食べました"
  fullReading?: string; // 完整假名读音，如 "たべました"
  pitch?: number;
  pitchType?: '平板' | '头高' | '中高' | '尾高';
  moras?: MoraPitch[];
  isPureKana?: boolean;
  isParticle?: boolean;
  isQueried?: boolean; // 是否为用户划词查询过的文本，强制保留虚线并可点击
  isFromJTag?: boolean; // 是否来自日文区域（<jp> 标签内或显式日文文本）
  mastery?: 'learning' | 'reviewing' | 'mastered'; // 命中学情档案时的掌握状态
  dictionaryEntry?: {
    meaning: string;
    reading: string;
    pitch: number;
    pos?: string;
    level?: string;
  };
}

export interface ParseOptions {
  masteredWords?: Set<string>; // 属于“已掌握”状态的生词表面词或辞书形集合
  hideMasteredFurigana?: boolean; // 是否对已掌握词汇隐藏注音（默认为 true）
  isExplicitJapanese?: boolean; // 强制按日文解析整段文本（如词汇卡片、五十音）
  showPlainFurigana?: boolean; // 是否对平文汉字显示振假名（根据全局 furiganaMode 决定）
  learnedWordsMap?: Map<string, { reading?: string; pitch?: number; meaning?: string; pos?: string; level?: string; mastery?: 'learning' | 'reviewing' | 'mastered' }>;
  customNameReadings?: Map<string, CustomNameEntry>; // 用户在双方名字或人设中指定的自定义注音映射（如 高咲->たかさき、侑->ゆう、高咲侑->たかさきゆう）
  unannotatedNames?: Set<string>; // 用户未特意加注音的名字集合，对话中出现时不为其注音
  queriedTerms?: Set<string>; // 日文区划词查询完成的词条集合
  queriedChineseTerms?: Set<string>; // 中文普通文本中用户明确手动划选查询过的词条集合，非 <jp> 专用
}

export interface CustomNameEntry {
  reading: string;
  subUnits?: Array<{ surface: string; reading: string }>;
}

// 全局自定义人名与专有名词注音字典（从用户设置中的双方名字、人设中实时同步）
let globalCustomNameEntries = new Map<string, CustomNameEntry>();
let globalUnannotatedNames = new Set<string>();

export function setGlobalCustomNameReadings(
  readings: Map<string, CustomNameEntry | string>,
  unannotatedNames?: Set<string>
) {
  globalCustomNameEntries = new Map();
  for (const [k, v] of readings.entries()) {
    if (typeof v === 'string') {
      globalCustomNameEntries.set(k, { reading: v });
    } else {
      globalCustomNameEntries.set(k, v);
    }
  }
  globalUnannotatedNames = unannotatedNames || new Set<string>();
}

export function getGlobalCustomNameReadings(): Map<string, CustomNameEntry> {
  return globalCustomNameEntries;
}

export function getGlobalUnannotatedNames(): Set<string> {
  return globalUnannotatedNames;
}

export interface ParseResult {
  tokens: RubyToken[];
  correction?: MessageCorrection;
  cleanText: string;
}

// 语法助词、助动词、连词及常见基础小词集合（不作为生词高亮，保持版面清爽）
export const EXCLUDED_GRAMMAR_WORDS = new Set([
  'で', 'と', 'は', 'が', 'を', 'に', 'へ', 'も', 'か', 'ね', 'よ', 'の', 'や', 'から', 'まで', 'より',
  'など', 'ばかり', 'ほど', 'くらい', 'ぐらい', 'けれど', 'けれども',
  'です', 'ます', 'でした', 'ました', 'だ', 'である', 'ではない', 'じゃない', 'ではありません', 'じゃありません',
  'それと', '然后', '以及', '而且', '但是', 'そして', 'それに', 'それから', 'でも', '然而', '不过', '可是', 'しかし', 'だから', 'ですから', 'また', 'だけど',
  'これ', 'それ', 'あれ', 'どれ', '这里', '那里', '哪里', 'ここ', 'そこ', 'あそこ', 'どこ', 'こちら', 'そちら', 'あちら', 'どちら',
  '私', 'あなた'
]);

// Convert pitch number and mora count into Chinese label
export function getPitchTypeLabel(pitchNum: number, moraCount: number): '平板' | '头高' | '中高' | '尾高' {
  if (pitchNum === 0) return '平板';
  if (pitchNum === 1) return '头高';
  if (pitchNum === moraCount) return '尾高';
  return '中高';
}

// 清理日文标签内部可能残留的孤立注音符号与格式优化
export function cleanOrphanedRubyBrackets(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;
  // 0. 全角方括号统一转半角方括号：［よみ］ -> [よみ]
  text = text.replace(/［/g, '[').replace(/］/g, ']');

  // 0.3 花括号宿主块容错：若 AI 把读音括号写在花括号外（{野菜}[やさい]），收进块内归一为 {野菜[やさい]}，
  // 避免读音括号脱离宿主后在界面上泄漏为裸 [やさい]。仅作用于花括号上下文，不影响普通文本中的方括号。
  text = text.replace(
    /\{([^\[\]{}]{1,40})\}\s*\[\s*([ぁ-んァ-ヶー]{1,20})\s*(?:\|\s*(\d+)\s*)?\]/g,
    (_m, host, reading, pitch) => (pitch !== undefined ? `{${host}[${reading}|${pitch}]}` : `{${host}[${reading}]}`)
  );

  // 0.5 提前将各类 HTML <ruby> 语法统一转换为方括号注音，杜绝 <ruby> 穿透未消毒的漏洞：
  // 彻底支持内部送假名如 <ruby>カレーを食<rt>た</rt>べる</ruby> -> カレーを食[た]べる
  // 以及 <ruby><rb>词</rb><rt>音</rt></ruby>、带属性的 <ruby class="..."> 等变体
  text = text.replace(
    /<ruby[^>]*>(?:<rb[^>]*>)?([\s\S]*?)(?:<\/rb>)?\s*<rt[^>]*>([\s\S]*?)<\/rt>(?:<rp>[\s\S]*?<\/rp>)?\s*([\s\S]*?)<\/ruby>/gi,
    (_match, base, reading, trailing) => {
      const cleanBase = base.replace(/<[^>]+>/g, '').trim();
      const cleanReading = reading.replace(/<[^>]+>/g, '').trim();
      const cleanTrailing = trailing.replace(/<[^>]+>/g, '').trim();
      return `${cleanBase}[${cleanReading}]${cleanTrailing}`;
    }
  );
  text = text.replace(/<\/?(?:ruby|rt|rb|rp)[^>]*>/gi, '');

  // 1. 规范化粗体外的注音吸收进粗体内：**水** [みず|0] -> **水[みず]**
  text = text.replace(
    /\*\*([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\*\*\s*\[([ぁ-んァ-ヶー]+)(?:\|\d+)?\]/g,
    (_match, word, reading) => {
      const hasKanji = /[一-龯々〆]/.test(word);
      return hasKanji ? `**${word}[${reading}]**` : `**${word}**`;
    }
  );


  // 2. 清除纯假名词汇上多余的相同假名注音或孤立音调（如 ゲームセンター[ゲームセンター] 或 それと[0]）
  text = text.replace(
    /(^|[^一-龯々〆ヵヶ])([ぁ-んァ-ヶー]{2,})\s*\[(?:\s*\2(?:\s*\|\s*\d+)?|\s*\d+\s*)\]/g,
    '$1$2'
  );

  // 注：不再提供“圆括号 → 方括号注音”的容错转换（旧规则 3/4 已删除）。
  // 界面约定：普通小括号（）() 的内容一律作为“灰字注释/译文/神态”渲染（见 MessageItem 的
  // ParenthesisRuby），绝非振假名载体；注音唯一合法载体是花括号宿主块 {原文[读音]}。
  // 若把 （かんじ） 这类内容改写成 [かんじ]，会破坏灰字约定并把注释错当成注音。

  return text;
}

/**
 * 假名前缀安全剥离器（兼容平假名/片假名跨系统对齐）：
 * 当表面词开头剥离出前置副词/助词（如 "ぜひ"）时，从整词读音（如 "ぜひおしえ"）中剥除对应前缀，返回真实词干读音（如 "おしえ"）
 */
export function stripKanaPrefix(fullReading: string, prefixKana: string): string {
  if (!fullReading || !prefixKana) return fullReading;
  if (fullReading.startsWith(prefixKana)) return fullReading.substring(prefixKana.length);
  // 片假名与平假名对齐转换兜底
  const hira = prefixKana.replace(/[\u30a1-\u30f6]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60));
  if (fullReading.startsWith(hira)) return fullReading.substring(hira.length);
  const kata = prefixKana.replace(/[\u3041-\u3096]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60));
  if (fullReading.startsWith(kata)) return fullReading.substring(kata.length);
  return fullReading;
}

/**
 * 汉字词干与前后缀假名精准解构器：
 * 匹配表面词中的末尾汉字群及可能跟随的送假名，并分离前置非汉字成分（如助词、前置词）：
 * - "カレーを食" -> leadingPlain: "カレーを", kanjiStem: "食", trailingKana: "", cleanReading: "た"
 * - "カレーを食べる" -> leadingPlain: "カレーを", kanjiStem: "食", trailingKana: "べる", cleanReading: "た"
 * - "部屋の中" -> leadingPlain: "部屋の", kanjiStem: "中", trailingKana: "", cleanReading: "なか"
 * - "は何" -> leadingPlain: "は", kanjiStem: "何", trailingKana: "", cleanReading: "なに"
 * - "やる気" -> leadingPlain: "やる", kanjiStem: "気", trailingKana: "", cleanReading: "き"
 */
export function decomposeSurface(rawSurface: string, rawReading: string) {
  const match = rawSurface.match(/([一-龯々〆ヵヶ]+)([^一-龯々〆ヵヶ]*)$/);
  if (!match) {
    return {
      leadingPlain: '',
      kanjiStem: rawSurface,
      trailingKana: '',
      cleanReading: rawReading,
    };
  }

  const leading = rawSurface.substring(0, match.index);
  const kanjiStem = match[1];
  const trailingKana = match[2];
  let cleanReading = rawReading;

  // 若读音开头包含前置假名，剥离之（如 "ぜひ教" 的读音 "ぜひおしえ" -> "おしえ"）
  if (leading && cleanReading.startsWith(leading)) {
    cleanReading = cleanReading.substring(leading.length);
  } else if (leading) {
    cleanReading = stripKanaPrefix(cleanReading, leading);
  }

  // 若读音末尾包含尾置送假名，剥离之（如 "食べる" 的读音 "たべる" -> "た"）
  if (trailingKana && cleanReading.endsWith(trailingKana) && cleanReading.length > trailingKana.length) {
    cleanReading = cleanReading.slice(0, -trailingKana.length);
  }

  // 特殊保护：针对动词 "行く" 及其活用形式（如 "行きます"）的 AI 错误读音矫正
  // AI 经常误将 "行きます" 的 "行" 注音为 "き"（源自 "いき"）或 "いき"
  if (kanjiStem === '行' && (cleanReading === 'き' || cleanReading === 'いき')) {
    cleanReading = 'い';
  }

  return {
    leadingPlain: leading,
    kanjiStem,
    trailingKana,
    cleanReading,
  };
}

/**
 * 随堂语法精讲块（:::grammar ... :::）的统一匹配式。
 * 这是「私教亲笔声明的语法点」的载体，属于纯系统块——界面、朗读、提示词摘录一律不可见。
 * 终止符除 ::: 外额外接受空行，避免模型漏写尾标记时把整条回复吞掉。
 */
export const GRAMMAR_BLOCK_REGEX = /:::grammar\s*([\s\S]*?)(?::::|\n[ \t]*\n|$)/gi;

/** 剥离消息中所有 :::grammar 语法精讲块（仅供纯文本 / 朗读 / 检索使用，采集走知识提取器） */
export function stripGrammarBlocks(text: string): string {
  if (!text) return '';
  return text.replace(/(?:\r?\n)?\s*:::grammar\s*[\s\S]*?(?::::|\n[ \t]*\n|$)/gi, '');
}

/** 剥离消息中所有 ::: 系统块（纠错块 + 语法精讲块） */
export function stripSystemBlocks(text: string): string {
  if (!text) return '';
  return stripGrammarBlocks(text)
    .replace(/:::correction\s*[\s\S]*?(?::::|$)/gi, '')
    .trim();
}


// 提取 AI 输出中的随堂语法纠错块
export function extractCorrectionBlock(rawText: string): { cleanText: string; correction?: MessageCorrection } {
  const correctionRegex = /:::correction\s*([\s\S]*?):::/i;
  const match = rawText.match(correctionRegex);

  if (!match) {
    return { cleanText: cleanOrphanedRubyBrackets(stripGrammarBlocks(rawText)) };
  }

  const blockContent = match[1];
  const lines = blockContent.split('\n');
  let original = '';
  let corrected = '';
  let explanation = '';
  let betterExpression = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('original:')) {
      original = trimmed.replace('original:', '').trim();
    } else if (trimmed.startsWith('corrected:')) {
      corrected = trimmed.replace('corrected:', '').trim();
    } else if (trimmed.startsWith('explanation:')) {
      explanation = trimmed.replace('explanation:', '').trim();
    } else if (trimmed.startsWith('better:')) {
      betterExpression = trimmed.replace('better:', '').trim();
    }
  }

  const cleanText = cleanOrphanedRubyBrackets(
    stripGrammarBlocks(rawText.replace(correctionRegex, '')).trim()
  );

  if (original || corrected || explanation) {
    return {
      cleanText,
      correction: {
        original,
        corrected,
        explanation,
        betterExpression,
      },
    };
  }

  return { cleanText };
}

export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'correction'; data: MessageCorrection };

// 解析消息分段：允许纠错块自然穿插在一条对话消息的中间或末尾，并嵌套在气泡内渲染
export function parseMessageSegments(
  rawText: string,
  fallbackCorrection?: MessageCorrection,
  isStreaming = false
): MessageSegment[] {
  // 语法精讲块是纯系统块：先在渲染前整体剥离，绝不能在气泡里露出 :::grammar 字样或未完成后台草稿
  rawText = stripGrammarBlocks(rawText || '');
  if (isStreaming) {
    rawText = rawText.replace(/:::grammar[\s\S]*$/gi, '');
    rawText = rawText.replace(/(?:\n|^)\s*:::(?:g(?:r(?:a(?:m(?:m(?:a(?:r)?)?)?)?)?)?)?$/i, '');
  }

  if (!rawText) {
    if (fallbackCorrection) {
      return [{ type: 'correction', data: fallbackCorrection }];
    }
    return [{ type: 'text', content: '' }];
  }

  const correctionRegex = /:::correction\s*([\s\S]*?)(?::::|$)/gi;
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = correctionRegex.exec(rawText)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;

    if (matchStart > lastIndex) {
      let textBefore = rawText.slice(lastIndex, matchStart);
      if (textBefore.endsWith('\n')) {
        textBefore = textBefore.replace(/\r?\n$/, '');
      }
      if (textBefore) {
        segments.push({
          type: 'text',
          content: cleanOrphanedRubyBrackets(textBefore),
        });
      }
    }

    const blockContent = match[1];
    const lines = blockContent.split('\n');
    let original = '';
    let corrected = '';
    let explanation = '';
    let betterExpression = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('original:')) {
        original = trimmed.replace(/^original:\s*/i, '').trim();
      } else if (trimmed.startsWith('corrected:')) {
        corrected = trimmed.replace(/^corrected:\s*/i, '').trim();
      } else if (trimmed.startsWith('explanation:')) {
        explanation = trimmed.replace(/^explanation:\s*/i, '').trim();
      } else if (trimmed.startsWith('better:')) {
        betterExpression = trimmed.replace(/^better:\s*/i, '').trim();
      }
    }

    if (original || corrected || explanation || betterExpression) {
      segments.push({
        type: 'correction',
        data: {
          original,
          corrected,
          explanation,
          betterExpression,
        },
      });
    }

    lastIndex = matchEnd;

    if (match[0].length === 0) {
      break;
    }
  }

  if (lastIndex < rawText.length) {
    let remainingText = rawText.slice(lastIndex);
    if (isStreaming) {
      // 过滤末尾正在输入的未完成纠错前缀，杜绝 :::corr 残片裸露
      remainingText = remainingText.replace(/(?:\n|^)\s*:::(?:c(?:o(?:r(?:r(?:e(?:c(?:t(?:i(?:o(?:n)?)?)?)?)?)?)?)?)?)?$/i, '');
    }
    if (remainingText) {
      segments.push({
        type: 'text',
        content: cleanOrphanedRubyBrackets(remainingText),
      });
    }
  }

  const hasCorrection = segments.some((s) => s.type === 'correction');
  if (!hasCorrection && fallbackCorrection) {
    segments.push({
      type: 'correction',
      data: fallbackCorrection,
    });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', content: cleanOrphanedRubyBrackets(rawText) });
  }

  return segments;
}

/**
 * 智能拆分汉字词干与送假名：
 * 1. 表面词自身带送假名（如 食べる[たべる]、美味しい[おいしい]、行く[いく]）
 *    -> 拆分为 词干: 食, 读音: た, 送假名: べる, 完整词: 食べる, 完整读音: たべる
 * 2. 方括号后紧跟送假名（如 食[た]べる、美味[おい]しい、行[い]く）
 *    -> 自动吸收后续假名并校验动词/形容词合法性，防止误吞助词（如 角[かど]に 中的 "に" 不被吞并）
 * 3. 纯汉字无送假名（如 準備[じゅんび]、桜[さくら]）
 *    -> 直接作为标准汉字词注音
 */
export function splitStemAndOkurigana(
  rawSurface: string,
  rawReading: string,
  fullContext?: string,
  matchEndIndex?: number
): {
  surface: string;
  reading: string;
  okurigana?: string;
  fullWord: string;
  fullReading: string;
  consumedEndIndex: number;
} {
  const matchEnd = matchEndIndex ?? rawSurface.length;

  // 汉字与假名前后缀安全解构：绝对杜绝 leadingPlain（如 "カレーを"、"部屋の"）留在 surface 中！
  const decomp = decomposeSurface(rawSurface, rawReading);

  // 汉字-假名-汉字复合词保护（如 "昼ご飯"、"夏休み"）：前置部分含汉字时不得剥离，
  // 否则会丢失前半汉字（"昼ご"）；应作为整词注音，而非只拆出末位汉字
  if (decomp.leadingPlain && /[一-龯々〆]/.test(decomp.leadingPlain)) {
    return {
      surface: rawSurface,
      reading: rawReading,
      okurigana: undefined,
      fullWord: rawSurface,
      fullReading: rawReading,
      consumedEndIndex: matchEnd,
    };
  }

  const cleanSurface = decomp.kanjiStem;
  let cleanReading = decomp.cleanReading;

  // 情形 0：若表面词内部已带尾置送假名（如 "食べる"、"食べます"、"美味しい"）
  if (decomp.trailingKana) {
    const fullWord = cleanSurface + decomp.trailingKana;
    const fullReading = cleanReading + decomp.trailingKana;
    return {
      surface: cleanSurface,
      reading: cleanReading,
      okurigana: decomp.trailingKana,
      fullWord,
      fullReading,
      consumedEndIndex: matchEnd,
    };
  }

  // 特殊保护：针对动词 "行く" 及其活用形式（如 "行きます"）的形态素智能对齐
  if (cleanSurface === '行') {
    const follow = fullContext && matchEndIndex !== undefined ? fullContext.substring(matchEndIndex) : '';
    // 情形 A：AI 注音为 行[き]ます、行[いき]ます 或 行[い]ます
    if ((cleanReading === 'き' || cleanReading === 'いき' || rawReading === 'き' || rawReading === 'いき' || cleanReading === 'い') && follow.startsWith('ます')) {
      return {
        surface: '行',
        reading: 'い',
        okurigana: 'きます',
        fullWord: '行きます',
        fullReading: 'いきます',
        consumedEndIndex: matchEnd + 2,
      };
    }
    // 情形 B：标准注音 行[い]きます
    if (cleanReading === 'い' && follow.startsWith('きます')) {
      return {
        surface: '行',
        reading: 'い',
        okurigana: 'きます',
        fullWord: '行きます',
        fullReading: 'いきます',
        consumedEndIndex: matchEnd + 3,
      };
    }
    // 情形 C：标准注音 行[い]く
    if (cleanReading === 'い' && follow.startsWith('く')) {
      return {
        surface: '行',
        reading: 'い',
        okurigana: 'く',
        fullWord: '行く',
        fullReading: 'いく',
        consumedEndIndex: matchEnd + 1,
      };
    }
  }

  // 情形 1：表面词本身带有送假名且读音与送假名对齐
  const stemWithKana = cleanSurface.match(/^([一-龯々〆ヵヶ]+)([ぁ-んァ-ヶー]+)$/);
  if (stemWithKana) {
    const kanjiStem = stemWithKana[1];
    const okurigana = stemWithKana[2];
    if (cleanReading.endsWith(okurigana) && cleanReading.length > okurigana.length) {
      const stemReading = cleanReading.slice(0, -okurigana.length);
      return {
        surface: kanjiStem,
        reading: stemReading,
        okurigana,
        fullWord: cleanSurface,
        fullReading: cleanReading,
        consumedEndIndex: matchEnd,
      };
    }
  }

  // 情形 1.5：表面词为纯汉字且读音末尾包含活用送假名（如 surface: "教", reading: "おしえ"）
  // 当剥离末尾假名形成的辞书形合法时（如 "教" + "え" -> "教える"），智能将末尾假名作为送假名提取，
  // 并且若后续文本还有紧随假名（如 "てください"），一并融合为完整活用词 "教えてください"
  if (/^[一-龯々〆ヵヶ]+$/.test(cleanSurface) && cleanReading.length >= 2) {
    const lastReadingKana = cleanReading[cleanReading.length - 1];
    const candidateOkuriganaWord = cleanSurface + lastReadingKana;
    const deinflected = deinflect(candidateOkuriganaWord);
    const validDeinflect = deinflected.find((d) => DICT_BY_WORD.has(d.lemma));
    if (validDeinflect) {
      const stemReading = cleanReading.slice(0, -1);
      let okurigana = lastReadingKana;
      let consumed = matchEnd;
      if (fullContext && matchEndIndex !== undefined && matchEndIndex < fullContext.length) {
        const followMatch = fullContext.substring(matchEndIndex).match(/^([ぁ-んァ-ヶー]+)/);
        if (followMatch) {
          const followKana = followMatch[1];
          for (let k = followKana.length; k >= 1; k--) {
            const subFollow = followKana.slice(0, k);
            const combinedWord = cleanSurface + lastReadingKana + subFollow;
            if (DICT_BY_WORD.has(combinedWord) || deinflect(combinedWord).some((d) => DICT_BY_WORD.has(d.lemma))) {
              okurigana = lastReadingKana + subFollow;
              consumed = matchEndIndex + subFollow.length;
              break;
            }
          }
        }
      }
      return {
        surface: cleanSurface,
        reading: stemReading,
        okurigana,
        fullWord: cleanSurface + okurigana,
        fullReading: stemReading + okurigana,
        consumedEndIndex: consumed,
      };
    }
  }

  // 情形 2：方括号后紧跟送假名（如 食[た]べる 或 食[た]べました 或 美味[おい]しい）
  if (fullContext && matchEndIndex !== undefined && matchEndIndex < fullContext.length) {
    const isPureKanji = /^[一-龯々〆ヵヶ]+$/.test(cleanSurface);
    if (isPureKanji) {
      const followMatch = fullContext.substring(matchEndIndex).match(/^([ぁ-んァ-ヶー]+)/);
      if (followMatch) {
        const candidateKana = followMatch[1];
        for (let k = candidateKana.length; k >= 1; k--) {
          const subKana = candidateKana.slice(0, k);
          const candidateFullWord = cleanSurface + subKana;
          const isDictWord = DICT_BY_WORD.has(candidateFullWord);
          const deinflected = !isDictWord ? deinflect(candidateFullWord) : [];
          const hasValidDeinflect = deinflected.some((d) => {
            if (d.formTag && (d.formTag.includes('断定') || d.formTag.includes('判断'))) return false;
            return DICT_BY_WORD.has(d.lemma);
          });

          if (isDictWord || hasValidDeinflect) {
            return {
              surface: cleanSurface,
              reading: cleanReading,
              okurigana: subKana,
              fullWord: candidateFullWord,
              fullReading: cleanReading + subKana,
              consumedEndIndex: matchEndIndex + subKana.length,
            };
          }
        }
      }
    }
  }

  // 默认普通汉字词（如 準備[じゅんび]、桜[さくら]）
  return {
    surface: cleanSurface,
    reading: cleanReading,
    okurigana: undefined,
    fullWord: cleanSurface,
    fullReading: cleanReading,
    consumedEndIndex: matchEnd,
  };
}

// =========================================================
// 统一注音引擎核心：读音消歧 + 学情联动 + 生僻词互补
// =========================================================
// 读音消歧优先级：学情档案 > 内置词典 > 声调/熟语词典 > 孤立单字音读兜底 > AI 方括号读音
// 学情联动：按【词形 → 辞书原型】匹配掌握状态，已掌握且开启隐藏则不再注音
// 生僻词互补：不在学情/词典/熟语中的词，只要有读音来源即强制注音

interface AnnotationContext {
  hideMastered: boolean;
  masteredSet?: Set<string>;
  showFurigana: boolean;
  isExplicitJapanese?: boolean;
  learnedWordsMap?: Map<string, { reading?: string; pitch?: number; meaning?: string; pos?: string; level?: string; mastery?: 'learning' | 'reviewing' | 'mastered' }>;
  customNameReadings?: Map<string, CustomNameEntry>;
  unannotatedNames?: Set<string>;
  queriedTerms?: Set<string>;
  queriedChineseTerms?: Set<string>;
}

function buildAnnotationContext(options?: ParseOptions): AnnotationContext {
  return {
    hideMastered: options?.hideMasteredFurigana !== false,
    masteredSet: options?.masteredWords,
    showFurigana: options?.showPlainFurigana !== false || !!options?.isExplicitJapanese,
    isExplicitJapanese: options?.isExplicitJapanese,
    learnedWordsMap: options?.learnedWordsMap,
    customNameReadings: options?.customNameReadings || globalCustomNameEntries,
    unannotatedNames: options?.unannotatedNames || globalUnannotatedNames,
    queriedTerms: options?.queriedTerms,
    queriedChineseTerms: options?.queriedChineseTerms,
  };
}

// 词形 → 辞书原型（用于掌握度判定）
function resolveLemma(word: string): string {
  const candidates = deinflect(word);
  for (const d of candidates) {
    if (DICT_BY_WORD.has(d.lemma)) return d.lemma;
  }
  return word;
}

// 将辞书原型读音换算为当前活用词形读音（如 食べる[たべる] → 食べました[たべました]）
function conjugateReading(surface: string, lemma: string, lemmaReading: string): string {
  if (surface === lemma || !lemmaReading) return lemmaReading;
  const l = lemma.match(/^([一-龯々〆]+)(.*)$/);
  const s = surface.match(/^([一-龯々〆]+)(.*)$/);
  if (l && s && l[1] === s[1] && l[2] && lemmaReading.endsWith(l[2])) {
    return lemmaReading.slice(0, -l[2].length) + s[2];
  }
  return lemmaReading;
}

// 统一读音消歧：返回权威读音、声调、是否已知（学情/词典/熟语）及命中的词条
function resolveWordReading(
  fullWord: string,
  hintReading: string,
  ctx: AnnotationContext
): {
  reading: string;
  pitch: number;
  known: boolean;
  suppressFurigana?: boolean;
  learned?: { reading?: string; pitch?: number; meaning?: string; pos?: string; level?: string; mastery?: 'learning' | 'reviewing' | 'mastered' };
  dictItem?: DictItem;
  lemma?: string;
  customEntry?: CustomNameEntry;
} {
  // 0.1 若命中未特意加注音的双方名字，抑制自动注音，保持纯净无假名显示
  const unannotatedSet = ctx.unannotatedNames || globalUnannotatedNames;
  if (unannotatedSet && unannotatedSet.has(fullWord)) {
    return {
      reading: '',
      pitch: 0,
      known: true,
      suppressFurigana: true,
    };
  }

  // 0.2 最高优先级：命中用户定制的人名/专有读音（如双方名字、人设中的 {高咲[たかさき]}{侑[ゆう]} 等）
  const customEntry = ctx.customNameReadings?.get(fullWord) || globalCustomNameEntries.get(fullWord);
  if (customEntry) {
    return {
      reading: customEntry.reading,
      pitch: 0,
      known: true,
      customEntry,
    };
  }

  let learned = ctx.learnedWordsMap?.get(fullWord);
  let dictItem = DICT_BY_WORD.get(fullWord);
  // 防护：若词典条目的原型与当前词汇完全不匹配（如中译日查询历史残留），绝不提取读音
  if (dictItem && dictItem.word !== fullWord && (dictItem as any).lemma !== fullWord) {
    dictItem = undefined;
  }
  let lemma: string | undefined;

  // 活用形还原命中（仅限动词/形容词，排除断定/判断助动词规则，防止名词误套）
  if (!learned && !dictItem && /[一-龯々〆]/.test(fullWord)) {
    for (const d of deinflect(fullWord)) {
      if (d.formTag && (d.formTag.includes('断定') || d.formTag.includes('判断'))) continue;
      const lw = ctx.learnedWordsMap?.get(d.lemma);
      const di = DICT_BY_WORD.get(d.lemma);
      if (!lw && !di) continue;
      const pos = (di?.pos || lw?.pos || '') as string;
      if (pos && !pos.includes('动词') && !pos.includes('动') && !pos.includes('形容词') && !pos.includes('形')) continue;
      // 词干对齐防护：原型以汉字开头时，词形必须同以该汉字开头（杜绝 "カレーを食べます" 等前置短语被误套活用）
      const baseStem = d.lemma.match(/^([一-龯々〆]+)/);
      if (baseStem && !fullWord.startsWith(baseStem[1])) continue;
      learned = lw;
      dictItem = di;
      lemma = d.lemma;
      break;
    }
  }

  const pitchItem = COMMON_PITCH_DICT[fullWord];
  const jukugo = fullWord.length >= 2 && isAllKanji(fullWord) ? deriveJukugoReading(fullWord) : null;
  const single = fullWord.length === 1 && isAllKanji(fullWord) ? deriveSingleKanjiReading(fullWord) : null;

  let baseReading = learned?.reading || dictItem?.reading || pitchItem?.reading || jukugo?.reading || single?.reading || '';
  if (baseReading && lemma && lemma !== fullWord) {
    baseReading = conjugateReading(fullWord, lemma, baseReading);
  }
  const reading = baseReading || hintReading || '';

  const pitch = learned?.pitch ?? dictItem?.pitch ?? pitchItem?.pitch ?? jukugo?.pitch ?? single?.pitch ?? 0;
  const isQueried = !!(ctx.queriedTerms && ctx.queriedTerms.has(fullWord));
  const known = !!(learned || dictItem || pitchItem || jukugo || isQueried);

  return { reading, pitch, known, learned, dictItem, lemma };
}

// 统一词汇发射器：显式注音与平文自动注音共用同一套掌握度/已知/读音消歧逻辑，消除历史分歧
function emitRubyWord(
  tokens: RubyToken[],
  ctx: AnnotationContext,
  tokenType: 'ruby' | 'plain-word',
  args: {
    fullWord: string;
    fullReading: string;
    prefixKana?: string;
    pitch: number;
    learned?: { reading?: string; pitch?: number; meaning?: string; pos?: string; level?: string; mastery?: 'learning' | 'reviewing' | 'mastered' };
    dictItem?: DictItem;
    lemma?: string;
    isPureKana?: boolean;
    isParticle?: boolean;
  }
) {
  // 智能拆分词干与送假名（统一用同一套拆分逻辑）
  let surface = args.fullWord;
  let reading = args.fullReading;
  let okurigana: string | undefined;
  let prefixKana = args.prefixKana;
  if (/[一-龯々〆]/.test(args.fullWord)) {
    // 混合词前置假名剥离（如 "やる気" -> prefix "やる" + stem "気"、"お茶" -> prefix "お"）
    if (!prefixKana) {
      const mixed = args.fullWord.match(/^([ぁ-んァ-ヶー]+)([一-龯々〆ヵヶ]+.*)$/);
      if (mixed && args.fullReading.startsWith(mixed[1])) {
        prefixKana = mixed[1];
        surface = mixed[2];
        reading = args.fullReading.substring(prefixKana.length);
      }
    }
    const split = splitStemAndOkurigana(surface, reading);
    surface = split.surface;
    reading = split.reading;
    okurigana = split.okurigana;
  }

  const lemmaTarget = args.lemma || resolveLemma(args.fullWord);
  const isMastered =
    ctx.hideMastered &&
    !!ctx.masteredSet &&
    (ctx.masteredSet.has(args.fullWord) || ctx.masteredSet.has(lemmaTarget));

  const hide = isMastered;
  const showReading = ctx.showFurigana && !hide;
  const moras = calculateMoraPitches(args.fullReading, args.pitch);

  const entrySource = args.learned || args.dictItem;
  const dictionaryEntry = entrySource
    ? {
        meaning: args.learned?.meaning || args.dictItem?.meaning || '',
        reading: args.learned?.reading || args.dictItem?.reading || args.fullReading,
        pitch: args.pitch,
        pos: args.learned?.pos || args.dictItem?.pos || (args.isParticle ? '助词' : '词汇'),
        level: args.learned?.level || args.dictItem?.level,
      }
    : undefined;

  tokens.push({
    type: tokenType,
    prefixKana: prefixKana || undefined,
    surface,
    reading: showReading ? reading : undefined,
    hideFurigana: hide,
    okurigana,
    fullWord: args.fullWord,
    fullReading: args.fullReading,
    pitch: args.pitch,
    pitchType: getPitchTypeLabel(args.pitch, moras.length),
    moras,
    isPureKana: args.isPureKana || false,
    isParticle: args.isParticle,
    isFromJTag: true,
    mastery: args.learned?.mastery,
    dictionaryEntry,
  });
}

// 发射显式方括号注音（AI 提供的 [读音]），并对 AI 读音做权威校验（学情/词典优先）
function emitExplicitRuby(
  text: string,
  tokens: RubyToken[],
  ctx: AnnotationContext,
  rawSurface: string,
  rawReading: string,
  explicitPitch: number | undefined,
  matchEnd: number
): number {
  const hasKanji = /[一-龯々〆]/.test(rawSurface);
  if (!hasKanji) {
    // 宿主不含汉字（纯假名 / 片假名外来语，如 テレビ[てれび]、おはよう[おはよう]）：
    // 这类词本身"所见即读", 不存在需要上标注音的汉字；AI 若误补读音括号，此处应把读音吸收，
    // 仅输出宿主原文（去掉 [读音] 括号），避免把裸 [てれび] 泄漏到界面。
    // 纯假名宿主且读音与宿主相同或为其子串（重复注音）——一律作为普通文本原样呈现。
    tokens.push({ type: 'text', surface: rawSurface });
    return matchEnd;
  }

  const decomp = decomposeSurface(rawSurface, rawReading);
  let prefixKana: string | undefined = undefined;
  let leadingPlain = '';
  const targetSurface = decomp.kanjiStem;
  let targetReading = decomp.cleanReading;
  const trailingKana = decomp.trailingKana;

  if (
    decomp.leadingPlain &&
    decomp.leadingPlain.length <= 3 &&
    rawReading.startsWith(decomp.leadingPlain) &&
    (DICT_BY_WORD.has(rawSurface) || COMMON_PITCH_DICT[rawSurface] || ctx.learnedWordsMap?.has(rawSurface))
  ) {
    prefixKana = decomp.leadingPlain;
    targetReading = stripKanaPrefix(rawReading, prefixKana);
  } else {
    leadingPlain = decomp.leadingPlain;
  }
  if (leadingPlain) {
    tokens.push({ type: 'text', surface: leadingPlain });
  }

  // 花括号宿主块（{食[た]}べました）：方括号与后续送假名之间隔着闭合的 }，
  // 吸收后续送假名（或直接结束本宿主）前先跳过它，使 "べました" 可被正常并入。
  const absorbEnd = text[matchEnd] === '}' || text[matchEnd] === '｝' ? matchEnd + 1 : matchEnd;

  const split = trailingKana
    ? {
        surface: targetSurface,
        reading: targetReading,
        okurigana: trailingKana,
        fullWord: targetSurface + trailingKana,
        fullReading: targetReading + trailingKana,
        consumedEndIndex: absorbEnd,
      }
    : splitStemAndOkurigana(targetSurface, targetReading, text, absorbEnd);

  const fullWordText = prefixKana ? prefixKana + split.fullWord : split.fullWord;
  const fullReadingText = prefixKana ? prefixKana + split.fullReading : split.fullReading;

  // 读音消歧：学情/词典权威读音优先于 AI 方括号读音（AI 可能写错，如 行きます 误注 き）
  const resolved = resolveWordReading(fullWordText, fullReadingText, ctx);
  const finalFullReading = resolved.reading || fullReadingText;

  emitRubyWord(tokens, ctx, 'ruby', {
    fullWord: fullWordText,
    fullReading: finalFullReading,
    prefixKana,
    pitch: explicitPitch !== undefined ? explicitPitch : resolved.pitch,
    learned: resolved.learned,
    dictItem: resolved.dictItem,
    lemma: resolved.lemma,
  });

  return split.consumedEndIndex;
}

/**
 * 在中文普通文本（非 <jp> 标签内容、动作旁白、中文说明、用户发言等）中：
 * 不被 <jp></jp> 包裹的即是中文，所以不需要被注音；
 * 另外也绝不在中文中自动匹配已进入词典的词（无论离线词典、生词本还是日文查询词），
 * 唯有且仅当用户在此处手动划词查询过（queriedChineseTerms），才渲染为可点击虚线（plain-word）。
 */
function scanPlainStringForQueriedTerms(
  str: string,
  tokens: RubyToken[],
  ctx: AnnotationContext
) {
  if (!str) return;

  const candidates: string[] = [];
  // 严格只匹配中文专属的手动查询词（queriedChineseTerms），绝不匹配任何词典/生词本或日文查询词
  if (ctx.queriedChineseTerms && ctx.queriedChineseTerms.size > 0) {
    for (const t of ctx.queriedChineseTerms) {
      // 1. 核心防护：在非 <jp> 中文普通文本中，严格禁止匹配单字（长度小于 2）！
      // 坚决杜绝“手”、“前”、“日”、“人”等单汉字或单字符在中文句子中被意外染成虚线
      if (!t || t.length < 2) continue;
      // 2. 常见中文连接词、代词、虚词绝不作为可交互划词项（如“然后”、“但是”）
      if (COMMON_CHINESE_STOPWORDS.has(t)) continue;
      // 3. 纯假名词不参与中文普通文本的扫描
      if (/^[ぁ-んァ-ヶー]+$/.test(t)) continue;

      if (str.includes(t)) {
        candidates.push(t);
      }
    }
  }

  if (candidates.length === 0) {
    tokens.push({ type: 'text', surface: str });
    return;
  }

  // 优先最长匹配
  candidates.sort((a, b) => b.length - a.length);

  let i = 0;
  const len = str.length;
  let plainStart = 0;

  while (i < len) {
    let matched: string | null = null;
    for (const cand of candidates) {
      if (str.startsWith(cand, i)) {
        matched = cand;
        break;
      }
    }

    if (matched) {
      if (i > plainStart) {
        tokens.push({ type: 'text', surface: str.substring(plainStart, i) });
      }
      const resolved = resolveWordReading(matched, '', ctx);
      const hasKanji = /[一-龯々〆]/.test(matched);
      // 核心防护：当查询文本与匹配到的条目原型不一致时（如查询中文“嘴”匹配到日文“口”），绝不能给“嘴”注音上くち，读音置空
      const isWordMismatch =
        (resolved.dictItem && resolved.dictItem.word !== matched && (resolved.dictItem as any).lemma !== matched) ||
        (resolved.learned && (resolved.learned as any).surface !== matched && (resolved.learned as any).word !== matched);
      const targetReading = isWordMismatch ? undefined : (resolved.reading || undefined);

      tokens.push({
        type: 'plain-word',
        surface: matched,
        fullWord: matched,
        fullReading: targetReading,
        reading: undefined, // 关键：非 <jp> 中文文本严格不加任何振假名注音！
        hideFurigana: true, // 确保永远不渲染 ruby/rt 振假名
        pitch: isWordMismatch ? 0 : resolved.pitch,
        isQueried: true,
        isPureKana: !hasKanji,
        isFromJTag: false,
        dictionaryEntry: (resolved.dictItem || resolved.learned)
          ? {
              meaning: resolved.learned?.meaning || resolved.dictItem?.meaning || '',
              reading: resolved.learned?.reading || resolved.dictItem?.reading || resolved.reading || matched,
              pitch: isWordMismatch ? 0 : resolved.pitch,
              pos: resolved.learned?.pos || resolved.dictItem?.pos || '词汇',
              level: resolved.learned?.level || resolved.dictItem?.level,
            }
          : undefined,
      });
      i += matched.length;
      plainStart = i;
    } else {
      i++;
    }
  }

  if (plainStart < len) {
    tokens.push({ type: 'text', surface: str.substring(plainStart) });
  }
}

// 标签外普通文本（中文说明、用户发言等）：不被 <jp> 包裹的即是中文，所以不需要被注音，
// 且不自动匹配已进入词典的词，仅保留手动在此处查询过的词赋予虚线点击交互。
function annotatePlainText(text: string, tokens: RubyToken[], ctx: AnnotationContext) {
  if (!text) return;
  scanPlainStringForQueriedTerms(text, tokens, ctx);
}

// <jp> 标签内的纯日文片段：统一扫描显式注音 + 平文自动注音
function annotateJapaneseSegment(text: string, tokens: RubyToken[], ctx: AnnotationContext) {
  const processed = cleanOrphanedRubyBrackets(text);

  const bracketRegex = /([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\s*\[\s*([ぁ-んァ-ヶー]+)\s*(?:\|\s*(\d+)\s*)?\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = bracketRegex.exec(processed)) !== null) {
    const matchStart = match.index;
    const matchEnd = bracketRegex.lastIndex;

    const plainBefore = matchStart > lastIndex ? processed.substring(lastIndex, matchStart) : '';
    if (plainBefore) {
      segmentJapanesePlainWords(plainBefore, tokens, ctx);
    }

    const consumedEnd = emitExplicitRuby(
      processed,
      tokens,
      ctx,
      match[1],
      match[2],
      match[3] !== undefined ? parseInt(match[3], 10) : undefined,
      matchEnd
    );
    lastIndex = consumedEnd;
    bracketRegex.lastIndex = consumedEnd;
  }

  if (lastIndex < processed.length) {
    segmentJapanesePlainWords(processed.substring(lastIndex), tokens, ctx);
  }
}

/**
 * 规范化日文标签与行内 Markdown 的嵌套关系：
 * 当 <jp>...</jp> 标签内部包含行内 Markdown（如粗体 **、斜体 * 等）时，
 * 若直接用 Markdown 正则切分会导致 <jp> 与 </jp> 被撕裂到不同片段而无法成对闭合，
 * 从而导致 <jp> 标识裸露且中间文字失去日文语境。
 * 本函数将日文标签下沉/外推：使 <jp>AAA**BBB**CCC</jp> 转换为 <jp>AAA</jp>**<jp>BBB</jp>**<jp>CCC</jp>
 */
export function normalizeJapaneseMarkdownTags(text: string): string {
  if (!text) return '';

  // 匹配日文标签块（兼容 <jp>...</jp>、<j>...</j>、<j>...</p>、<jp>...</p>）
  const tagRegex = /(<j(?:p)?>)([\s\S]*?)(<\/(?:j|p|jp)>|<p>)/gi;

  return text.replace(tagRegex, (_match, openTag, innerContent, closeTag) => {
    // 检查内部是否含有 Markdown 标记（***粗斜体***, **粗体**, *斜体*, ~~删除线~~, `代码`）
    const inlineMdRegex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[^\*\n]+?\*|~~[\s\S]+?~~|`[^`\n]+?`)/g;
    if (!inlineMdRegex.test(innerContent)) {
      return `${openTag}${innerContent}${closeTag}`;
    }

    // 将内部的 Markdown 结构拆解并注入日文标签：
    // 如 **BBB** -> </jp>**<jp>BBB</jp>**<jp>
    inlineMdRegex.lastIndex = 0;
    const distributed = innerContent.replace(inlineMdRegex, (mdChunk: string) => {
      let prefix = '';
      let suffix = '';
      let core = '';

      if (mdChunk.startsWith('***') && mdChunk.endsWith('***') && mdChunk.length >= 6) {
        prefix = '***';
        suffix = '***';
        core = mdChunk.slice(3, -3);
      } else if (mdChunk.startsWith('**') && mdChunk.endsWith('**') && mdChunk.length >= 4) {
        prefix = '**';
        suffix = '**';
        core = mdChunk.slice(2, -2);
      } else if (mdChunk.startsWith('*') && mdChunk.endsWith('*') && mdChunk.length >= 2) {
        prefix = '*';
        suffix = '*';
        core = mdChunk.slice(1, -1);
      } else if (mdChunk.startsWith('~~') && mdChunk.endsWith('~~') && mdChunk.length >= 4) {
        prefix = '~~';
        suffix = '~~';
        core = mdChunk.slice(2, -2);
      } else if (mdChunk.startsWith('`') && mdChunk.endsWith('`') && mdChunk.length >= 2) {
        prefix = '`';
        suffix = '`';
        core = mdChunk.slice(1, -1);
      } else {
        return mdChunk;
      }

      if (!core) return mdChunk;

      return `</jp>${prefix}<jp>${core}</jp>${suffix}<jp>`;
    });

    // 重新包裹并清理空标签：<jp></jp>
    const reassembled = `<jp>${distributed}</jp>`;
    return reassembled.replace(/<j(?:p)?><\/(?:j|p|jp)>/gi, '');
  });
}

/**
 * 剥除显式注音块的系统标记花括号 {}（如 {野菜[やさい]} 中的花括号），
 * 并彻底剥离任何残留漏入普通文本 token 的系统包裹标签（<jp>、</jp>、<j> 等），
 * 确保控制标签绝对不会以普通文本形式泄漏渲染在用户界面上。
 */
function stripBlockMarks(tokens: RubyToken[]): RubyToken[] {
  const out: RubyToken[] = [];
  for (const t of tokens) {
    if (t.type === 'text') {
      const surface = t.surface
        .replace(/[{}｛｝]/g, '')
        .replace(/<\/?(?:jp|j|p)>/gi, '');
      if (!surface) continue;
      const prev = out[out.length - 1];
      if (prev && prev.type === 'text') {
        prev.surface += surface;
        continue;
      }
      out.push({ ...t, surface });
      continue;
    }
    out.push(t);
  }
  return out;
}

export function parseJapaneseContent(text: string, options?: ParseOptions): RubyToken[] {
  if (!text) return [];

  const tokens: RubyToken[] = [];
  const ctx = buildAnnotationContext(options);
  const sanitizedText = cleanOrphanedRubyBrackets(text);

  // 1. 检测文本中是否包含明确的 <jp>...</jp> 标签（兼容 <j>...</j>、<jp>...</jp>、<j>...<p> 等）
  const tagRegex = /(?:<j(?:p)?>)([\s\S]*?)(?:<\/(?:j|p|jp)>|<p>)/gi;
  if (tagRegex.test(sanitizedText)) {
    tagRegex.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(sanitizedText)) !== null) {
      const matchStart = match.index;
      const matchEnd = tagRegex.lastIndex;

      if (matchStart > lastIndex) {
        const nonJapanesePart = sanitizedText.substring(lastIndex, matchStart);
        if (nonJapanesePart) {
          annotatePlainText(nonJapanesePart, tokens, ctx);
        }
      }

      const japaneseContent = match[1];
      if (japaneseContent) {
        annotateJapaneseSegment(japaneseContent, tokens, ctx);
      }

      lastIndex = matchEnd;
    }

    if (lastIndex < sanitizedText.length) {
      const remainingNonJp = sanitizedText.substring(lastIndex);
      if (remainingNonJp) {
        annotatePlainText(remainingNonJp, tokens, ctx);
      }
    }

    return stripBlockMarks(tokens);
  }

  // 2. 无 <jp>...</jp> 标签的处理（例如词汇自测卡片、或用户发言）
  if (options?.isExplicitJapanese) {
    annotateJapaneseSegment(sanitizedText, tokens, { ...ctx, isExplicitJapanese: true });
    return stripBlockMarks(tokens);
  }

  // 3. 用户发出的对话文本或普通说明文本（无标签）：
  // 保持普通文本输出，但容错解析其中可能包含的显式方括号注音（如 食べる[たべる]）
  annotatePlainText(sanitizedText, tokens, ctx);

  return stripBlockMarks(tokens);
}

/**
 * 智能日文词法分词器（统一注音引擎的平文扫描路径）：
 * - 前向最大匹配 + 汉字熟语音读矩阵（Jukugo Guard），严禁将连续汉字熟语拆分为单字并套用训读（如“心配”绝不注成“心[こころ]”）
 * - 结合动词连用形与活用逆向推导（如“教えてください” -> “教える”）
 * - 读音消歧、学情联动（词形→辞书原型匹配）、生僻词互补（单字音读兜底强制注音）全部由 resolveWordReading / emitRubyWord 统一处理
 */
function segmentJapanesePlainWords(text: string, tokens: RubyToken[], ctx: AnnotationContext) {
  if (!text) return;

  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    // 1. 标点符号、空格与空白字符
    if (/[\s、。！？!?,.:;…~「」『』()（）\[\]\d+a-zA-Z\-_]/.test(char)) {
      let punctEnd = i + 1;
      while (punctEnd < len && /[\s、。！？!?,.:;…~「」『』()（）\[\]\d+a-zA-Z\-_]/.test(text[punctEnd])) {
        punctEnd++;
      }
      tokens.push({
        type: 'text',
        surface: text.substring(i, punctEnd),
        isFromJTag: true,
      });
      i = punctEnd;
      continue;
    }

    // 1.5 核心语法屏障：单字格助词阻断（Systematic Case Particle Barrier）
    // 格助词「を」「に」「で」「へ」在现代日语中绝不可能作为词头与紧随的汉字熔合为复合词（如 "に行"、"を食"、"で話す"、"へ行く"）！
    const CASE_PARTICLES = new Set(['を', 'に', 'で', 'へ']);
    if (CASE_PARTICLES.has(char) && i + 1 < len && /[一-龯々〆]/.test(text[i + 1])) {
      const particleItem = DICT_BY_WORD.get(char);
      tokens.push({
        type: 'plain-word',
        surface: char,
        isPureKana: true,
        isParticle: true,
        isFromJTag: true,
        dictionaryEntry: particleItem ? {
          meaning: particleItem.meaning || '',
          reading: particleItem.reading || char,
          pitch: particleItem.pitch ?? 0,
          pos: particleItem.pos || '格助词',
          level: particleItem.level,
        } : undefined,
      });
      i += 1;
      continue;
    }

    // 1.8 划词查询词条优先命中：若当前位置匹配用户划选查询过的词汇/短语/句型，优先作为整体词发射！
    let queriedMatch: string | null = null;
    if (ctx.queriedTerms && ctx.queriedTerms.size > 0) {
      for (const q of ctx.queriedTerms) {
        if (q && q.length >= 1 && text.startsWith(q, i)) {
          if (!queriedMatch || q.length > queriedMatch.length) {
            queriedMatch = q;
          }
        }
      }
    }

    if (queriedMatch) {
      const resolved = resolveWordReading(queriedMatch, '', ctx);
      const hasKanji = /[一-龯々〆]/.test(queriedMatch);
      // 核心防护：当查询文本与匹配到的条目原型不一致时（如查询中文“嘴”匹配到日文“口”），绝不能给“嘴”注音上くち，读音置空
      const isWordMismatch =
        (resolved.dictItem && resolved.dictItem.word !== queriedMatch && (resolved.dictItem as any).lemma !== queriedMatch) ||
        (resolved.learned && (resolved.learned as any).surface !== queriedMatch && (resolved.learned as any).word !== queriedMatch);
      const targetReading = isWordMismatch ? undefined : (resolved.reading || undefined);

      tokens.push({
        type: 'plain-word',
        surface: queriedMatch,
        fullWord: queriedMatch,
        fullReading: targetReading,
        reading: targetReading,
        pitch: isWordMismatch ? 0 : resolved.pitch,
        isQueried: true,
        isPureKana: !hasKanji,
        isFromJTag: true,
        dictionaryEntry: (resolved.dictItem || resolved.learned)
          ? {
              meaning: resolved.learned?.meaning || resolved.dictItem?.meaning || '',
              reading: resolved.learned?.reading || resolved.dictItem?.reading || resolved.reading || queriedMatch,
              pitch: isWordMismatch ? 0 : resolved.pitch,
              pos: resolved.learned?.pos || resolved.dictItem?.pos || '词汇',
              level: resolved.learned?.level || resolved.dictItem?.level,
            }
          : undefined,
      });
      i += queriedMatch.length;
      continue;
    }

    // 2. 词库前向最大长度匹配 (8 ~ 1 字符)，统一走 resolveWordReading 消歧
    let matched = false;
    const maxLen = Math.min(8, len - i);

    for (let candidateLen = maxLen; candidateLen >= 1; candidateLen--) {
      const candidate = text.substring(i, i + candidateLen);
      const hasKanji = /[一-龯々〆]/.test(candidate);

      // 助词词头防御：任何长度 >= 2 的候选词如果以格助词 [をにでへ] 开头且包含汉字，必须跳过
      if (candidateLen >= 2 && CASE_PARTICLES.has(candidate[0]) && hasKanji) {
        continue;
      }

      // Jukugo Guard：当前仅为 1 个汉字但后方紧跟汉字（构成熟语）时，绝不在此时按单字断词
      if (hasKanji && candidateLen === 1 && i + 1 < len && /[一-龯々〆]/.test(text[i + 1])) {
        continue;
      }

      const resolved = resolveWordReading(candidate, '', ctx);

      if (resolved.suppressFurigana) {
        // 未设定注音的双方名字：作为普通文本输出，不给名字注音
        tokens.push({
          type: 'text',
          surface: candidate,
          isFromJTag: true,
        });
        i += candidateLen;
        matched = true;
        break;
      }

      if (hasKanji) {
        // 汉字词：只要有权威/兜底读音即发射（生僻孤立字由单字音读兜底强制注音）
        if (resolved.reading) {
          // 精巧对齐：若命中自定义人名且包含子单元（如 高咲[たかさき] + 侑[ゆう]），按子单元分别发射，实现完美字音对齐
          if (resolved.customEntry?.subUnits && resolved.customEntry.subUnits.length > 1) {
            for (const unit of resolved.customEntry.subUnits) {
              emitRubyWord(tokens, ctx, 'plain-word', {
                fullWord: unit.surface,
                fullReading: unit.reading,
                pitch: 0,
              });
            }
          } else {
            emitRubyWord(tokens, ctx, 'plain-word', {
              fullWord: candidate,
              fullReading: resolved.reading,
              pitch: resolved.pitch,
              learned: resolved.learned,
              dictItem: resolved.dictItem,
              lemma: resolved.lemma,
            });
          }
          i += candidateLen;
          matched = true;
          break;
        }
      } else {
        // 纯假名词：命中词典/学情/声调库才作为可点击词汇，否则交给连续假名收集
        if (resolved.known) {
          const pos = resolved.dictItem?.pos || resolved.learned?.pos || '';
          const isParticle = pos.includes('助词');
          const entrySource = resolved.dictItem || resolved.learned;
          tokens.push({
            type: 'plain-word',
            surface: candidate,
            isPureKana: true,
            isParticle,
            isFromJTag: true,
            dictionaryEntry: entrySource
              ? {
                  meaning: resolved.learned?.meaning || resolved.dictItem?.meaning || '',
                  reading: resolved.learned?.reading || resolved.dictItem?.reading || candidate,
                  pitch: resolved.pitch,
                  pos: pos || '词汇',
                  level: resolved.learned?.level || resolved.dictItem?.level,
                }
              : undefined,
          });
          i += candidateLen;
          matched = true;
          break;
        }
      }
    }

    if (matched) continue;

    // 3.1 连续汉字熟语兜底：词典/熟语矩阵均未命中时，保留完整连续汉字块，绝不拆开单字套训读
    if (/[一-龯々〆]/.test(char) && i + 1 < len && /[一-龯々〆]/.test(text[i + 1])) {
      let kEnd = i + 1;
      while (kEnd < len && /[一-龯々〆]/.test(text[kEnd])) {
        kEnd++;
      }
      tokens.push({
        type: 'plain-word',
        surface: text.substring(i, kEnd),
        fullWord: text.substring(i, kEnd),
        isFromJTag: true,
      });
      i = kEnd;
      continue;
    }

    // 3.2 孤立未收录单字（无任何读音来源）：作为普通文本，避免误注
    if (/[一-龯々〆]/.test(char)) {
      tokens.push({
        type: 'text',
        surface: char,
        isFromJTag: true,
      });
      i++;
      continue;
    }

    // 连续假名或未注音字符收集
    let plainEnd = i + 1;
    while (
      plainEnd < len &&
      !/[一-龯々〆\s、。！？!?,.:;…~「」『』()（）\[\]]/.test(text[plainEnd])
    ) {
      plainEnd++;
    }

    tokens.push({
      type: 'text',
      surface: text.substring(i, plainEnd),
      isFromJTag: true,
    });
    i = plainEnd;
  }
}


// 供 TTS 语音合成剥离注音文本
export function stripRubyForTTS(text: string): string {
  if (!text) return '';
  let stripped = stripSystemBlocks(text);
  // 移除日文标签 <j> 和 <p>
  stripped = stripped.replace(/<\/?j>/gi, '').replace(/<\/?p>/gi, '');
  stripped = stripped.replace(/<\/?jp>/gi, '');
  stripped = stripped.replace(/[*#_`]/g, '');
  // 剥离显式注音宿主块的系统标记花括号（界面与朗读均不可见）
  stripped = stripped.replace(/[{}｛｝]/g, '');
  // 剥离可能存在的方括号注音
  stripped = stripped.replace(/([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\[([ぁ-んァ-ヶー]+)(?:\|\d+)?\]/g, '$1');
  stripped = stripped.replace(/<\/?[^>]+(>|$)/g, '');
  return stripped.trim();
}
