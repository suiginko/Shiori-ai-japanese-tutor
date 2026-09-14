// =========================================================
// KNOWLEDGE EXTRACTOR (学情档案知识智能提取与清洗器 - 全面重构版)
// =========================================================
// 核心职责：
// 1. 自动从私教回复中提取重点实义词汇（名词、动词原型、形容词、副词）与语法点
// 2. 绝对杜绝语法助词（で、と、は、が等）、助动词（です、ます等）、连词（それと等）和代词污染生词本
// 3. 自动结合形态素还原器将动词/形容词活用形（如 買いました、食べました）还原为规范辞书形原型（如 買う、食べる）
// 4. 彻底杜绝单个未还原的动词语干（如单独的 "買"、"食"）以及错误的同音助词释义

import { ChatMessage, CollectedWordRef, LearnedGrammar, LearnedWord } from '../types';
import { dictionaryService } from '../services/dictionaryService';
import { synthesizeGrammarDetails, normalizeGrammarKey } from './grammarSynthesizer';
import { GRAMMAR_BLOCK_REGEX } from './rubyParser';
import { DICT_BY_WORD } from '../data/dictionaryData';
import { deinflect } from './deinflector';

// =========================================================
// 语法精讲块字段解析工具（:::grammar 由私教亲笔撰写，是语法页最高质量信源）
// =========================================================

/** 逐行读取 `key: value` 形式的块体字段（兼容中英文键名与 `- key: value` 列表写法） */
function readGrammarBlockFields(blockContent: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const rawLine of blockContent.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(/^(?:[-*]\s*)?([A-Za-z\u4e00-\u9fa5]+)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (!(key in fields)) fields[key] = m[2].trim();
  }
  return fields;
}

function pickGrammarField(fields: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    if (fields[alias]) return fields[alias];
  }
  return '';
}

/** 清理日文侧字段：剥标签、剥花括号宿主标记、压平声调数字 */
function cleanupGrammarJp(raw: string): string {
  return (raw || '')
    .replace(/<\/?j(?:p)?>/gi, '')
    .replace(/[{}｛｝]/g, '')
    .replace(/\[([ぁ-んァ-ヶー]+)\|\d+\]/g, '[$1]')
    .replace(/^[*#\-•・]\s*/, '')
    .trim();
}

function cleanupGrammarCn(raw: string): string {
  return (raw || '')
    .replace(/<\/?j(?:p)?>/gi, '')
    .replace(/^[“"「『]/, '')
    .replace(/[”"」』]$/, '')
    .trim();
}

/** 统一句型标题写法：去引号括号、波浪线归一化为 ～ 前缀 */
function formatGrammarTitle(raw: string): string {
  let s = cleanupGrammarJp(raw)
    .replace(/[【】「」『』［］\[\]]/g, '')
    .replace(/[。、\s]+$/, '')
    .trim();
  if (!s) return '';
  s = s.replace(/^[~〜]/, '～');
  if (!s.startsWith('～')) s = `～${s}`;
  return s;
}

/** 句型标题合理性校验：必须是「～ + 接续部位」的短语，不能是具体句子或中文 */
function isPlausibleGrammarTitle(title: string): boolean {
  const core = title.replace(/^[～〜]/, '').trim();
  if (!core || core.length > 22) return false;
  if (/[。！？!?，,、；;]/.test(core)) return false;
  if (/[的地得了着吗吧呢么什哪这那或者并如果因为所以虽然但是可以想去这里那里地方什么]/.test(core)) return false;
  if (!/[一-龯々〆ぁ-んァ-ヶー]/.test(core)) return false;
  return true;
}

function normalizeGrammarLevel(raw: string): string | undefined {
  const m = (raw || '').toUpperCase().match(/N[1-5]/);
  return m ? m[0] : undefined;
}

/** 在正文中寻找一句包含该句型特征的完整句子，作为「真实语境例句」 */
function findContextSentence(
  content: string,
  plainCore: string
): string | undefined {
  if (!plainCore) return undefined;
  const sentences = content
    .split(/[\n。！？]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && s.length < 80);

  for (const s of sentences) {
    if (s.includes(':::') || s.includes('http')) continue;
    const plain = s
      .replace(/<\/?j(?:p)?>/gi, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[{}｛｝]/g, '');
    if (plain.includes(plainCore)) {
      return cleanupGrammarJp(s);
    }
  }
  return undefined;
}

// 排除纯语法助词、语气助词、助动词、连词及无实义虚词，绝对禁止进入生词档案
const EXCLUDED_SURFACES = new Set([
  'は', 'が', 'を', 'に', 'で', 'へ', 'と', 'から', 'まで', 'より', 'も', 'の', 'ね', 'よ', 'か', 'や',
  'です', 'ます', 'でした', 'ました', 'だ', 'である', 'こと', 'もの', 'よう', 'そう', 'ため', 'わけ',
  'それと', 'そして', 'それに', 'それから', 'でも', 'しかし', 'だから', 'ですから', 'また', 'あるいは',
  'これ', 'それ', 'あれ', 'どれ', 'ここ', 'そこ', 'あそこ', 'どこ', 'この', 'その', 'あの', 'どの',
  '私', 'わたし', 'あなた', '彼', '彼女',
]);

/**
 * 自动从 AI 私教的消息中精准提取高价值实义词汇与语法点
 */
export function extractKnowledgeFromMessage(
  message: ChatMessage
): {
  words: Array<Omit<LearnedWord, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'>>;
  grammars: Array<Omit<LearnedGrammar, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'>>;
} {
  const words: Array<Omit<LearnedWord, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'>> = [];
  const grammars: Array<Omit<LearnedGrammar, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'>> = [];
  const content = message.content || '';

  const seenWordSurfaces = new Set<string>();
  // 语法去重使用「归一化句型 key」（忽略波浪线/空格/引号），避免同一句型反复入档
  const seenGrammarKeys = new Set<string>();

  // 0. 从 <jp>...</jp> 标签中精准提取未记录过的 JLPT 考纲词汇（深度联动新中日文判断体系）
  const jpTagRegex = /<jp?>([\s\S]*?)(?:<\/jp>|<\/j>|<\/p>|<p>)/gi;
  let jpMatch: RegExpExecArray | null;
  while ((jpMatch = jpTagRegex.exec(content)) !== null) {
    const rawJpSegment = jpMatch[1].trim();
    if (!rawJpSegment) continue;

    // 清理可能夹带的注音方括号或圆括号，获得纯日文文本流
    const cleanJpSegment = rawJpSegment
      .replace(/\[[ぁ-んァ-ヶー|0-9]+\]/g, '')
      .replace(/[（\(][ぁ-んァ-ヶー]+[）\)]/g, '');

    let i = 0;
    const len = cleanJpSegment.length;

    while (i < len) {
      const char = cleanJpSegment[i];
      if (/[\s、。！？!?,.:;…~「」『』()（）\[\]\d+a-zA-Z\-_]/.test(char)) {
        i++;
        continue;
      }

      let matched = false;
      const maxLen = Math.min(8, len - i);

      for (let candLen = maxLen; candLen >= 1; candLen--) {
        const candidate = cleanJpSegment.substring(i, i + candLen);
        const hasKanji = /[一-龯々〆]/.test(candidate);

        // a) 精确命中词库
        if (DICT_BY_WORD.has(candidate)) {
          const item = DICT_BY_WORD.get(candidate)!;
          const pos = item.pos || '';
          if (
            !pos.includes('助词') &&
            !pos.includes('助动词') &&
            !pos.includes('连词') &&
            !pos.includes('代词') &&
            !EXCLUDED_SURFACES.has(candidate) &&
            (hasKanji || candidate.length >= 2)
          ) {
            const level = item.level;
            const isJlpt = level && ['N5', 'N4', 'N3', 'N2', 'N1'].includes(level);
            if (isJlpt && !seenWordSurfaces.has(candidate)) {
              seenWordSurfaces.add(candidate);
              words.push({
                surface: candidate,
                reading: item.reading,
                pitch: item.pitch,
                meaning: item.meaning,
                pos: item.pos,
                level: item.level,
                detail: item.detail,
                exampleJp: item.examples?.[0]?.jp,
                exampleCn: item.examples?.[0]?.zh,
                source: '对话学习',
              });
            }
          }
          i += candLen;
          matched = true;
          break;
        }

        // b) 动词/形容词活用逆向推导还原
        if (hasKanji && candLen >= 2) {
          const deinflected = deinflect(candidate);
          const valid = deinflected.find((d) => DICT_BY_WORD.has(d.lemma));
          if (valid) {
            const baseItem = DICT_BY_WORD.get(valid.lemma)!;
            const pos = baseItem.pos || '';
            const lemma = valid.lemma;
            if (
              !pos.includes('助词') &&
              !pos.includes('助动词') &&
              !pos.includes('连词') &&
              !pos.includes('代词') &&
              !EXCLUDED_SURFACES.has(lemma)
            ) {
              const level = baseItem.level;
              const isJlpt = level && ['N5', 'N4', 'N3', 'N2', 'N1'].includes(level);
              if (isJlpt && !seenWordSurfaces.has(lemma)) {
                seenWordSurfaces.add(lemma);
                words.push({
                  surface: lemma,
                  reading: baseItem.reading,
                  pitch: baseItem.pitch,
                  meaning: baseItem.meaning,
                  pos: baseItem.pos,
                  level: baseItem.level,
                  detail: baseItem.detail,
                  exampleJp: baseItem.examples?.[0]?.jp,
                  exampleCn: baseItem.examples?.[0]?.zh,
                  source: '对话学习',
                });
              }
            }
            i += candLen;
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        // 如果是 2-4 字连续汉字词，尝试 dictionaryService 检索
        if (/[一-龯々〆]/.test(char)) {
          let kanjiEnd = i + 1;
          while (kanjiEnd < len && /[一-龯々〆]/.test(cleanJpSegment[kanjiEnd]) && kanjiEnd - i <= 5) {
            kanjiEnd++;
          }
          const kanjiWord = cleanJpSegment.substring(i, kanjiEnd);
          if (kanjiWord.length >= 2 && !seenWordSurfaces.has(kanjiWord) && !EXCLUDED_SURFACES.has(kanjiWord)) {
            const lookupRes = dictionaryService.lookup(kanjiWord);
            if (lookupRes && !lookupRes.isPlaceholder && lookupRes.meaning) {
              const pos = lookupRes.pos || '';
              if (!pos.includes('助词') && !pos.includes('代词')) {
                const targetWord = lookupRes.lemma || lookupRes.word || kanjiWord;
                if (!seenWordSurfaces.has(targetWord)) {
                  seenWordSurfaces.add(targetWord);
                  words.push({
                    surface: targetWord,
                    reading: lookupRes.reading || targetWord,
                    pitch: lookupRes.pitch,
                    meaning: lookupRes.meaning,
                    pos: lookupRes.pos,
                    level: (lookupRes.level as any) || 'N4',
                    detail: lookupRes.detail,
                    exampleJp: lookupRes.examples?.[0]?.jp,
                    exampleCn: lookupRes.examples?.[0]?.zh,
                    source: '对话学习',
                  });
                }
              }
            }
          }
          i = kanjiEnd;
        } else {
          i++;
        }
      }
    }
  }

  // 1. 从注音格式 Word[reading|pitch] 中提取词汇
  const rubyRegex = /([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\[([ぁ-んァ-ヶー]+)(?:\|(\d+))?\]/g;
  let rubyMatch: RegExpExecArray | null;

  while ((rubyMatch = rubyRegex.exec(content)) !== null) {
    const rawSurface = rubyMatch[1].trim();
    const rawReading = rubyMatch[2].trim();
    const explicitPitch = rubyMatch[3] !== undefined ? parseInt(rubyMatch[3], 10) : undefined;

    // 剥离被吞入的前置假名/助词（如 "昨日は寿司" -> "寿司"，"を食" -> "食"）
    const kanjiOnlyMatch = rawSurface.match(/([一-龯々〆ヵヶ]+)$/);
    const targetKanji = kanjiOnlyMatch ? kanjiOnlyMatch[1] : rawSurface;

    // 过滤中文句子/解释/杂质：严禁将包含中文虚词、助词、常用中文标点或过长的中文句子误当作日语单词收录！
    if (
      targetKanji.length > 8 ||
      /[，。！？、“”《》；：]/.test(targetKanji) ||
      /[的地得了着吗吧呢么什哪这那或者并如果因为所以虽然但是可以想去这里那里地方什么]/.test(targetKanji)
    ) {
      continue;
    }

    // 优先检测后置紧随的送假名 (Okurigana，如 買[か]います、食[た]べました、会[あ]いました)
    const matchEnd = rubyMatch.index + rubyMatch[0].length;
    const afterBracket = content.slice(matchEnd, matchEnd + 15);
    const okuriganaMatch = afterBracket.match(/^([ぁ-んー]+)/);

    let dictLookup = null;

    if (okuriganaMatch) {
      const candidateFullKana = okuriganaMatch[1];
      // 从最长到最短尝试结合送假名寻找动词/形容词原型
      for (let k = candidateFullKana.length; k >= 1; k--) {
        const subOkurigana = candidateFullKana.slice(0, k);
        const fullSurface = targetKanji + subOkurigana;
        const fullReading = rawReading + subOkurigana;
        const lookupRes = dictionaryService.lookup(fullSurface, fullReading);
        if (
          lookupRes &&
          (lookupRes.source === 'builtin' || lookupRes.source === 'ai') &&
          (lookupRes.lemma || lookupRes.pos?.includes('动词') || lookupRes.pos?.includes('形容词'))
        ) {
          dictLookup = lookupRes;
          break;
        }
      }
    }

    // 若送假名未结合成功，查询独立词
    if (!dictLookup) {
      dictLookup = dictionaryService.lookup(targetKanji, rawReading);
    }

    // 核心词库绑定校验：严禁未经验证的未知词或启发兜底词进入学情档案
    if (!dictLookup || (dictLookup.source !== 'builtin' && dictLookup.source !== 'ai')) {
      continue;
    }

    const pos = dictLookup.pos || '';

    // 核心词性过滤：学情生词档案只收录实义词（名词、动词原型、形容词、副词）
    // 严格杜绝助词（で、と、は等）、助动词（です、ます等）、连词（それと等）和指示代词入库
    if (
      pos.includes('助词') ||
      pos.includes('助动词') ||
      pos.includes('连词') ||
      pos.includes('代词')
    ) {
      continue;
    }

    // 确定规范化归档原型 (如 買います 归档为 買う，食べました 归档为 食べる)
    const canonicalSurface = dictLookup.lemma || dictLookup.word || targetKanji;
    const canonicalReading = dictLookup.reading || rawReading;
    const effectivePitch = explicitPitch !== undefined ? explicitPitch : dictLookup.pitch;

    if (EXCLUDED_SURFACES.has(canonicalSurface) || canonicalSurface.length <= 0) continue;
    if (seenWordSurfaces.has(canonicalSurface)) continue;

    // 严禁残缺的单汉字动词词根（如单独的 "買"、"食"、"行" 等）未还原直接入库
    // 纯单汉字词只有在属于独立名词（如 "猫"、"本"、"車"、"駅"、"山"）时才允许入库
    if (/^[一-龯々〆]$/.test(canonicalSurface) && !pos.includes('名词')) {
      continue;
    }

    // 必须有权威有效释义，杜绝无效空条目、占位符和同义反复
    if (
      !dictLookup.meaning ||
      dictLookup.meaning.includes('暂无释义') ||
      dictLookup.meaning.includes('基础日常表达') ||
      dictLookup.meaning.includes('常用日语') ||
      dictLookup.meaning === canonicalSurface
    ) {
      continue;
    }

    seenWordSurfaces.add(canonicalSurface);
    words.push({
      surface: canonicalSurface,
      reading: canonicalReading,
      pitch: effectivePitch,
      meaning: dictLookup.meaning,
      pos: dictLookup.pos,
      level: dictLookup.level,
      detail: dictLookup.detail,
      exampleJp: dictLookup.examples?.[0]?.jp,
      exampleCn: dictLookup.examples?.[0]?.zh,
      source: '对话学习',
    });
  }

  // 2. 扫描在日语引号「...」或『...』中重点提及的核心词汇
  const quotedWordRegex = /[「『]([一-龯々〆ヵヶぁ-んァ-ヶー]{2,10})[」』]/g;
  let qm: RegExpExecArray | null;
  while ((qm = quotedWordRegex.exec(content)) !== null) {
    const wordCandidate = qm[1].trim();
    if (seenWordSurfaces.has(wordCandidate) || EXCLUDED_SURFACES.has(wordCandidate)) continue;

    // 在词典中验证并做词性过滤
    const check = dictionaryService.isValidJapaneseWord(wordCandidate);
    if (check.isValid && check.entry && check.entry.source === 'builtin') {
      const pos = check.entry.pos || '';
      if (
        pos.includes('助词') ||
        pos.includes('助动词') ||
        pos.includes('连词') ||
        pos.includes('代词')
      ) {
        continue;
      }

      const canonicalSurface = check.entry.lemma || check.entry.word;
      if (seenWordSurfaces.has(canonicalSurface) || EXCLUDED_SURFACES.has(canonicalSurface)) continue;

      seenWordSurfaces.add(canonicalSurface);
      words.push({
        surface: canonicalSurface,
        reading: check.entry.reading,
        pitch: check.entry.pitch,
        meaning: check.entry.meaning,
        pos: check.entry.pos,
        level: check.entry.level,
        detail: check.entry.detail,
        exampleJp: check.entry.examples?.[0]?.jp,
        exampleCn: check.entry.examples?.[0]?.zh,
        source: '重点例句',
      });
    }
  }

  // =========================================================
  // 3. 语法采集：三重信源，条条都要求「有真实可读的教学内容」
  // =========================================================
  // 信源 A：:::grammar 随堂精讲块 —— 私教亲笔声明，内容最完整、置信度最高
  // 信源 B：纠错块中的 grammar 字段 —— 随堂纠正的句型（须能命中内置语法库）
  // 信源 C：带波浪线的显式引用「～X」 —— 须能命中内置语法库 / 生活句型规则库
  //
  // 【已彻底移除】过去对全文做 matchPatterns 扫描并用形态素兜底合成的做法。
  //   它既无法区分"讲过"与"只是用过"（于是 ～てください 这种高频句型天天刷屏），
  //   又会合成「围绕「読みます」的句意表达」这类空洞条目——这正是语法页失去价值的根因。
  const pushGrammar = (
    item: Omit<LearnedGrammar, 'id' | 'learnedAt' | 'reviewCount' | 'mastery'>
  ) => {
    const key = normalizeGrammarKey(item.title);
    if (!key || seenGrammarKeys.has(key)) return;
    seenGrammarKeys.add(key);
    grammars.push(item);
  };

  // —— 信源 A：:::grammar 精讲块（私教亲笔，直接采信）——
  const grammarBlockRegex = new RegExp(GRAMMAR_BLOCK_REGEX.source, 'gi');
  let gbMatch: RegExpExecArray | null;
  while ((gbMatch = grammarBlockRegex.exec(content)) !== null) {
    const fields = readGrammarBlockFields(gbMatch[1]);
    const point = formatGrammarTitle(
      pickGrammarField(fields, ['point', 'title', 'grammar', '句型', '语法点'])
    );
    if (!isPlausibleGrammarTitle(point)) continue;

    const aiMeaning = cleanupGrammarCn(
      pickGrammarField(fields, ['meaning', '释义', '含义', '意思'])
    );
    if (!aiMeaning) continue;

    // 内置语法库若能命中同一条，则用它的权威接续/等级/语感解析补齐缺失字段
    const synth = synthesizeGrammarDetails(point);
    const trusted = !synth.isGeneric;
    const aiStructure = cleanupGrammarJp(pickGrammarField(fields, ['structure', '接续', '结构']));
    const aiNote = cleanupGrammarCn(pickGrammarField(fields, ['note', '讲解', '点拨', '说明', '用法']));
    const aiExample = cleanupGrammarJp(pickGrammarField(fields, ['example', '例句']));

    pushGrammar({
      title: trusted ? synth.title : point,
      structure: aiStructure || (trusted ? synth.structure : ''),
      meaning: aiMeaning,
      explanation: aiNote || (trusted ? synth.explanation : ''),
      level:
        normalizeGrammarLevel(pickGrammarField(fields, ['level', '等级', 'jlpt'])) ||
        (trusted ? synth.level : undefined),
      exampleJp: aiExample || undefined,
      exampleCn:
        cleanupGrammarCn(pickGrammarField(fields, ['examplecn', '译文', '翻译'])) || undefined,
      source: '私教精讲',
    });
  }

  // —— 信源 B：纠错块里的 grammar 字段（句型纠错即教学信号）——
  const grammarCorrectionRegex = /:::correction\s*([\s\S]*?)(?::::|\n[ \t]*\n|$)/gi;
  let gcMatch: RegExpExecArray | null;
  while ((gcMatch = grammarCorrectionRegex.exec(content)) !== null) {
    const fields = readGrammarBlockFields(gcMatch[1]);
    const point = formatGrammarTitle(
      pickGrammarField(fields, ['grammar', 'point', 'grammarpoint', '句型', '语法点'])
    );
    if (!isPlausibleGrammarTitle(point)) continue;

    const synth = synthesizeGrammarDetails(point);
    // 内置库未收录就不猜、不编——宁缺毋滥
    if (synth.isGeneric) continue;

    const correctedSentence = cleanupGrammarJp(
      pickGrammarField(fields, ['corrected', '正确', '建议'])
    );
    pushGrammar({
      title: synth.title,
      structure: synth.structure,
      meaning: synth.meaning,
      explanation: synth.explanation,
      level: synth.level,
      // 优先用学生自己那句被纠正后的真实句子，代入感远胜字典例句
      exampleJp: correctedSentence || synth.exampleJp,
      exampleCn: correctedSentence ? undefined : synth.exampleCn,
      source: '纠错点拨',
    });
  }

  // —— 信源 C：正文中带波浪线的显式引用「～X」（私教在讲解某个句型）——
  const citedGrammarRegex = /[「『【]([～〜][^」』】\n]{1,24})[」』】]/g;
  let cgMatch: RegExpExecArray | null;
  while ((cgMatch = citedGrammarRegex.exec(content)) !== null) {
    const point = formatGrammarTitle(cgMatch[1]);
    if (!isPlausibleGrammarTitle(point)) continue;

    const synth = synthesizeGrammarDetails(point);
    if (synth.isGeneric) continue;

    const plainCore = point.replace(/[～〜\s]/g, '').replace(/\[[^\]]+\]/g, '');
    const contextSentence = findContextSentence(content, plainCore);

    pushGrammar({
      title: synth.title,
      structure: synth.structure,
      meaning: synth.meaning,
      explanation: synth.explanation,
      level: synth.level,
      exampleJp: contextSentence || synth.exampleJp,
      exampleCn: contextSentence ? undefined : synth.exampleCn,
      source: '语法实战',
    });
  }

  return { words, grammars };
}

/**
 * 从本轮提取到的单词中，挑出「此前未收录进生词本」的那些，作为对话区提示引用。
 *
 * 设计取舍：单词库远大于语法库，几乎每条日文回复都会命中若干已学词。
 * 若已收录词复现也提示，会变成噪音。因此这里【只返回新词】——
 * 已收录词在对话中复现属于日常复习，不提示。
 *
 * 纯函数，便于单测锁定「新词提示 / 旧词不提示」的边界行为。
 */
export function collectNewWordRefs(
  extracted: Array<Pick<LearnedWord, 'surface' | 'reading' | 'level' | 'pos'>>,
  existingSurfaces: Set<string>
): CollectedWordRef[] {
  const seen = new Set<string>();
  const refs: CollectedWordRef[] = [];
  for (const w of extracted) {
    const surface = (w.surface || '').trim();
    if (!surface) continue;
    if (seen.has(surface)) continue; // 本轮内去重
    if (existingSurfaces.has(surface)) continue; // 存量已收录 → 不提示（日常复习）
    seen.add(surface);
    refs.push({ surface, reading: w.reading, level: w.level, pos: w.pos });
  }
  return refs;
}

/**
 * 严格判定候选单词是否已存在于学情生词档案中。
 * 综合考虑：表面词完全匹配、辞书原型 (lemma) 匹配、形态素反活用 (deinflect) 匹配、以及词典条目对齐。
 */
export function isWordAlreadyLearned(
  candidate: { surface?: string; reading?: string },
  knownWords: LearnedWord[]
): boolean {
  if (!candidate || !candidate.surface) return false;
  const rawSurface = candidate.surface.trim();
  if (!rawSurface) return false;

  // 1. 查询词典规范词形与原型
  const dict = dictionaryService.lookup(rawSurface, candidate.reading);
  const canonicalSurface = dict.lemma?.trim() || dict.word?.trim() || rawSurface;
  const candidateLemma = dict.lemma?.trim() || '';

  // 2. 形态素反向活用候选（若为动词/形容词活用形，一并纳入匹配）
  const deinflectedCandidates = deinflect(rawSurface).map((c) => c.lemma.trim());

  return knownWords.some((existing) => {
    const existingSurface = (existing.surface || '').trim();
    if (!existingSurface) return false;

    // A. 表面词完全匹配
    if (existingSurface === rawSurface || existingSurface === canonicalSurface) {
      return true;
    }

    // B. 辞书原型 (lemma) 匹配
    if (candidateLemma && existingSurface === candidateLemma) {
      return true;
    }

    // C. 反活用候选匹配
    if (deinflectedCandidates.includes(existingSurface)) {
      return true;
    }

    // D. 已有词的原型与当前词匹配
    const existingDict = dictionaryService.lookup(existingSurface, existing.reading);
    const existingLemma = existingDict.lemma?.trim() || existingDict.word?.trim() || '';
    if (existingLemma) {
      if (
        existingLemma === rawSurface ||
        existingLemma === canonicalSurface ||
        (candidateLemma && existingLemma === candidateLemma) ||
        deinflectedCandidates.includes(existingLemma)
      ) {
        return true;
      }
    }

    return false;
  });
}

/**
 * 生成语法句型的常用简体/敬体/活用变体，用于跨形态精准排重比对
 */
export function getGrammarVariations(title: string): string[] {
  const norm = normalizeGrammarKey(title);
  if (!norm) return [];
  const variations = new Set<string>([norm]);

  // 1. 敬体/简体变体映射
  const politeToPlain: Array<[RegExp, string]> = [
    [/思います$/, '思う'],
    [/言います$/, '言う'],
    [/行きます$/, '行く'],
    [/来ます$/, '来る'],
    [/します$/, 'する'],
    [/できます$/, 'できる'],
    [/あります$/, 'ある'],
    [/います$/, 'いる'],
    [/なります$/, 'なる'],
    [/分かります$/, '分かる'],
    [/てしまいます$/, 'てしまう'],
    [/ていきます$/, 'ていく'],
    [/てきます$/, 'てくる'],
    [/てみます$/, 'てみる'],
    [/てはいけません$/, 'てはいけない'],
    [/なければなりません$/, 'なければならない'],
    [/たいです$/, 'たい'],
    [/つもりです$/, 'つもりだ'],
    [/かもしれません$/, 'かもしれない'],
    [/はずです$/, 'はずだ'],
    [/ようです$/, 'ようだ'],
    [/そうです$/, 'そうだ'],
    [/らしいです$/, 'らしい'],
    [/でしょう$/, 'だろう'],
    [/ません$/, 'ない'],
    [/ました$/, 'た'],
    [/です$/, 'だ'],
  ];

  for (const [reg, rep] of politeToPlain) {
    if (reg.test(norm)) {
      variations.add(norm.replace(reg, rep));
    }
  }

  const plainToPolite: Array<[RegExp, string]> = [
    [/思う$/, '思います'],
    [/言う$/, '言います'],
    [/行く$/, '行きます'],
    [/来る$/, '来ます'],
    [/する$/, 'します'],
    [/できる$/, 'できます'],
    [/ある$/, 'あります'],
    [/いる$/, 'います'],
    [/なる$/, 'なります'],
    [/分かる$/, '分かります'],
    [/てしまう$/, 'てしまいます'],
    [/ていく$/, 'ていきます'],
    [/てくる$/, 'てきます'],
    [/てみる$/, 'てみます'],
    [/てはいけない$/, 'てはいけません'],
    [/なければならない$/, 'なければなりません'],
    [/たい$/, 'たいです'],
    [/つもりだ$/, 'つもりです'],
    [/かもしれない$/, 'かもしれません'],
    [/はずだ$/, 'はずです'],
    [/ようだ$/, 'ようです'],
    [/そうだ$/, 'そうです'],
    [/らしい$/, 'らしいです'],
    [/だろう$/, 'でしょう'],
    [/だ$/, 'です'],
  ];

  for (const [reg, rep] of plainToPolite) {
    if (reg.test(norm)) {
      variations.add(norm.replace(reg, rep));
    }
  }

  // 2. 利用形态素反向活用对尾部动词进行解析
  const deinflected = deinflect(norm);
  for (const d of deinflected) {
    if (d.lemma) variations.add(normalizeGrammarKey(d.lemma));
  }

  return Array.from(variations);
}

/**
 * 严格判定候选语法是否已存在于学情语法档案中。
 * 综合考虑：标点与声调清理、波浪线与括号归一化 (normalizeGrammarKey)、简体/敬体活用变体、以及权威句型库规范化标题对齐。
 */
export function isGrammarAlreadyLearned(
  candidate: { title?: string; exampleJp?: string },
  knownGrammars: LearnedGrammar[]
): boolean {
  if (!candidate || !candidate.title) return false;
  const rawTitle = candidate.title.trim();
  if (!rawTitle) return false;

  const stripPitchAndPunctuation = (str?: string) =>
    (str || '')
      .replace(/\[([ぁ-んァ-ヶー]+)\|\d+\]/g, '[$1]')
      .replace(/[。！？!?、,\s]+$/, '')
      .trim();

  const cleanTitle = stripPitchAndPunctuation(rawTitle);
  const synthesized = synthesizeGrammarDetails(cleanTitle, candidate.exampleJp);
  const canonicalTitle = synthesized.title ? stripPitchAndPunctuation(synthesized.title) : cleanTitle;

  const candidateVariations = new Set([
    ...getGrammarVariations(rawTitle),
    ...getGrammarVariations(cleanTitle),
    ...getGrammarVariations(canonicalTitle),
  ]);

  return knownGrammars.some((existing) => {
    const existingRawTitle = (existing.title || '').trim();
    const existingCleanTitle = stripPitchAndPunctuation(existingRawTitle);
    const existingVariations = getGrammarVariations(existingCleanTitle);

    for (const v of existingVariations) {
      if (candidateVariations.has(v)) {
        return true;
      }
    }

    if (synthesized.title) {
      const synthVariations = getGrammarVariations(synthesized.title);
      for (const v of synthVariations) {
        if (existingVariations.includes(v)) {
          return true;
        }
      }
    }

    return false;
  });
}

