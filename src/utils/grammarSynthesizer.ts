// =========================================================
// JAPANESE MORPHOLOGICAL GRAMMAR SYNTHESIZER
// (日语形态素语法解析与专业释义合成引擎)
// =========================================================
// 核心目标：
// 1. 杜绝任何“常用语法句型”、“特定语法用法”、“特色接续句型”等敷衍套话；
// 2. 深入日语词法与句法构成：拆解前置格助词（で/に/を/へ/から/直到/与/より/が）、
//    谓语动词词干及活用助动词（ました/ています/たい/ない/たことがある等）；
// 3. 自动生成标准权威的：JLPT 等级、接续公式、核心中文释义、用法点拨与语感解析，以及地道双语例句。

import { GRAMMAR_POINTS } from '../data/grammarPoints';
import { deinflect } from './deinflector';
import { DICT_BY_WORD } from '../data/dictionaryData';

export interface SynthesizedGrammar {
  title: string;
  structure: string;
  meaning: string;
  explanation: string;
  level: string;
  exampleJp?: string;
  exampleCn?: string;
  /**
   * 是否为「策划库未收录、只能靠形态素兜底」的空洞合成结果。
   * true 表示这条内容不具备真正的教学价值（如「围绕「読みます」的句意表达」），
   * 学情档案与语法采集一律不得收录，也绝不允许覆盖真实内容。
   */
  isGeneric?: boolean;
}

/** 语法标题归一化 key：忽略波浪线、空格与各类引号括号，仅用于去重比对 */
export function normalizeGrammarKey(title?: string): string {
  return (title || '').replace(/[～〜~\s【】「」『』［］\[\]（）()]/g, '').trim();
}

/** 空洞文案特征：出现即说明这条语法没有任何真正的讲解价值 */
const GENERIC_MEANING_PATTERNS = [
  /句意表达/,
  /句型表达/,
  /^与「.+」相关的.+表达$/,
  /特殊读法/,
];

const GENERIC_EXPLANATION_MARKERS = [
  '在对话中表达具体的语境动作',
  '引导分句中的关键动作成分',
  '日语口语中的连贯接续表达',
  '私教上下文精选表达例句',
  '特色接续句型',
  '常用语法句型',
];

/**
 * 判定一条语法记录是否为「无教学价值的空洞合成」。
 * 采集、入库、启动清洗三处共用同一把尺子，避免标准漂移。
 */
export function isGenericGrammarContent(item: {
  title?: string;
  meaning?: string;
  explanation?: string;
  structure?: string;
}): boolean {
  const meaning = (item.meaning || '').trim();
  const explanation = item.explanation || '';
  const structure = item.structure || '';

  if (!meaning) return true;
  const key = normalizeGrammarKey(item.title);
  if (key && normalizeGrammarKey(meaning) === key) return true;

  if (GENERIC_MEANING_PATTERNS.some((re) => re.test(meaning))) return true;
  if (GENERIC_EXPLANATION_MARKERS.some((m) => explanation.includes(m))) return true;
  if (structure.includes('前接词 +') || structure.includes('围绕')) return true;

  return false;
}

// 常见特定语法动词与生活句型规则库（毫秒级离线匹配）
interface VerbRule {
  pattern: RegExp;
  structure: string;
  meaning: string;
  explanation: string;
  level: string;
  exampleJp?: string;
  exampleCn?: string;
}

const SPECIFIC_VERB_PATTERNS: VerbRule[] = [
  {
    pattern: /(?:で|に)?\s*(?:生[ま|]|うま)れました|(?:で|に)?\s*(?:生[ま|]|うま)れた/i,
    structure: '地点/场所名词 + で + 生まれました',
    meaning: '在……出生（出生地与籍贯表达）',
    explanation: '格助词「で」用于提示动作或事件发生的地点，「生まれました」是动词「生まれる」的敬体过去式，是初级自我介绍中说明出生地、故乡或籍贯的标准句型。',
    level: 'N5',
    exampleJp: '私[]は 東京[]で 生[]まれました。',
    exampleCn: '我出生在东京。',
  },
  {
    pattern: /(?:で|に)?\s*(?:育[だ|]|そだ)ちました|(?:为|に)?\s*(?:育[だ|]|そだ)った/i,
    structure: '地点/场所名词 + で + 育ちました',
    meaning: '在……长大（成长经历表达）',
    explanation: '格助词「で」提示成长环境场所，「育ちました」是动词「育つ（そだつ）」的敬体过去式，常与出生地句型连用，如「北京で生まれ、上海で育ちました」。',
    level: 'N5',
    exampleJp: '京都[]で 育[]ちました。',
    exampleCn: '在京都长大。',
  },
  {
    pattern: /に\s*(?:住[ん|]|す)んでいます|に\s*(?:住[ん|]|す)んでいる/i,
    structure: '地点/场所名词 + に + 住んでいます',
    meaning: '住在……、定居于……（现居住地表达）',
    explanation: '格助词「に」用于标记静态生活存在的归宿点，「住んでいます」表示持续居住的状态，用于准确说明当前住所或现居住城市。',
    level: 'N5',
    exampleJp: '今[]は 横浜[]に 住[]んでいます。',
    exampleCn: '我现在住在横滨。',
  },
  {
    pattern: /で\s*(?:働[い|]|はたら)いています|で\s*(?:働[い|]|はたら)いている/i,
    structure: '公司/场所名词 + で + 働いています',
    meaning: '在……工作、就职于……',
    explanation: '格助词「で」提示具体工作单位或地点，「働いています」表示持续的在职职业状态。',
    level: 'N5',
    exampleJp: 'IT企業[]で 働[]いています。',
    exampleCn: '在一家IT企业工作。',
  },
  {
    pattern: /から\s*(?:来[き|]|き)ました/i,
    structure: '国家/省市名词 + から + 来ました',
    meaning: '来自……、从……来（出处与国籍表达）',
    explanation: '格助词「从」表示起点，「来ました」是动词「来る」的敬体过去式，在初次见面自我介绍时表示自己的家乡、省份或国籍。',
    level: 'N5',
    exampleJp: '中国[]から 来[]ました。',
    exampleCn: '我来自中国。',
  },
  {
    pattern: /が\s*(?:好[き|]|す)きです|が\s*(?:好[き|]|す)きだ/i,
    structure: '名词/名词化小句 + が + 好きです',
    meaning: '喜欢……、爱好……（喜好表达）',
    explanation: '在日语中，好恶、欲望、技能等心理情感对象一律使用助词「が」提示，不可误用宾格助词「を」。',
    level: 'N5',
    exampleJp: '日本[]の アニメが 好[]きです。',
    exampleCn: '我喜欢日本动漫。',
  },
  {
    pattern: /が\s*(?:嫌[い|]|きら)いです|が\s*(?:嫌[い|]|きら)いだ/i,
    structure: '名词 + が + 嫌いです',
    meaning: '讨厌……、不喜欢……（反感情感表达）',
    explanation: '助词「が」提示厌恶的对象。口语中委婉表达时常使用「あまり好きではありません」或「苦手です」替代。',
    level: 'N5',
    exampleJp: '辛[]い 料理[]が 嫌[]いです。',
    exampleCn: '我讨厌辛辣的料理。',
  },
  {
    pattern: /が\s*(?:上手[じょうず|]|じょうず)です/i,
    structure: '技能/领域名词 + が + 上手です',
    meaning: '擅长……、……做得很好（能力赞许）',
    explanation: '助词「が」提示评价的技能对象。通常用于赞扬夸奖他人，自谦时一般用「得意（とくい）です」。',
    level: 'N5',
    exampleJp: '日本語[]が とても 上手[]ですね。',
    exampleCn: '你的日语说得真好呀。',
  },
  {
    pattern: /が\s*(?:下手[へた|]|へた)です|が\s*(?:苦手[にがて|]|にがて)です/i,
    structure: '技能名词 + が + 下手です / 苦手です',
    meaning: '不擅长……、拙于……（谦逊与短板表达）',
    explanation: '用于委婉告知对方自己在某方面的不足，生活中使用「苦手です」语气更为自然得体。',
    level: 'N5',
    exampleJp: '料理[]が 苦手[]です。',
    exampleCn: '我不怎么会做饭。',
  },
  {
    pattern: /(?:に|へ)?\s*(?:行[っ|]|い)たことがあります/i,
    structure: '地点名词 + に/へ + 行ったことがあります',
    meaning: '曾经去过某地（经历表达）',
    explanation: '动词た形接续「ことがある/あります」表示过去曾经发生的经历体验，助词「に/へ」标记旅行目的地。',
    level: 'N5',
    exampleJp: '富士山[]に 行[]ったことがあります。',
    exampleCn: '我曾经去过富士山。',
  },
  {
    pattern: /(?:と)?\s*(?:思[い|]|お莫)います/i,
    structure: '简体普通形小句 + と + 思います',
    meaning: '我认为……、我觉得……（主观观点表达）',
    explanation: '助词「と」提示思考的内容，后接动词「思います」，用于在谈话中委婉表达个人见解或推测。',
    level: 'N5',
    exampleJp: '明日[]は 雨[]だと 思[]います。',
    exampleCn: '我觉得明天可能会下雨。',
  },
  {
    pattern: /(?:と)?\s*(?:言[い|]|い)いました/i,
    structure: '引用内容 + と + 言いました',
    meaning: '说了……、称……（传言与直接/间接引用）',
    explanation: '助词「と」引导引语内容，动词「言いました」表示发话行为，用于向他人转述说话内容。',
    level: 'N5',
    exampleJp: '先生[]は「大丈夫[]」と 言[]いました。',
    exampleCn: '老师说了“没关系”。',
  },
  {
    pattern: /を\s*(?:勉強[べんきょう|]|べんきょう)しています/i,
    structure: '语言/学科名词 + を + 勉強しています',
    meaning: '正在学习……（学业与研修状态）',
    explanation: '宾格助词「を」提示学习的科目，「勉強しています」表示动作持续进行或近期正在从事的学习状态。',
    level: 'N5',
    exampleJp: '大学[]で 日本語[]を 勉強[]しています。',
    exampleCn: '在大学里学习日语。',
  },
];

/**
 * 专业级日语语法综合解析器：
 * 绝不使用“常用语法句型”等模板，而是深入剖析接续、词性、助词格位与动词语义
 */
export function synthesizeGrammarDetails(rawTitle: string, contextSentence?: string): SynthesizedGrammar {
  // 1. 彻底清除语法标题中不应存在的数字声调（如 飲[]みます -> 飲[の]みます）及句子标点
  const noPitchTitle = (rawTitle || '')
    .replace(/\[([ぁ-んァ-ヶー]+)\|\d+\]/g, '[$1]')
    .replace(/[。！？!?]$/, '');
  const cleanTitle = noPitchTitle.replace(/[【】「」『』]/g, '').trim();
  const normalizedTitle = cleanTitle.replace(/\s+/g, '');
  const titleWithTilde = normalizedTitle.startsWith('～') || normalizedTitle.startsWith('〜')
    ? normalizedTitle
    : `～${normalizedTitle}`;
  const core = normalizedTitle.replace(/^[～〜]/, '');
  // 纯文本（剥离注音括号），用于词典检索与形态素还原分析，例如 "飲[の]みます" -> "飲みます"
  const plainCore = core.replace(/\[[ぁ-んァ-ヶー]+\]/g, '');

  // 2. 优先匹配已有的权威语法点库 GRAMMAR_POINTS
  const matchedGp = GRAMMAR_POINTS.find((gp) => {
    const gpCore = gp.title.replace(/[～〜\s]/g, '');
    if (
      gp.title === normalizedTitle ||
      gp.title === titleWithTilde ||
      gpCore === core ||
      gpCore === plainCore
    ) {
      return true;
    }
    if (gp.matchPatterns?.some((p) => {
      try {
        const reg = new RegExp(p, 'i');
        return reg.test(normalizedTitle) || reg.test(rawTitle) || reg.test(plainCore);
      } catch {
        return false;
      }
    })) {
      return true;
    }
    return false;
  });

  if (matchedGp) {
    return {
      title: matchedGp.title,
      structure: matchedGp.structure,
      meaning: matchedGp.meaning,
      explanation: matchedGp.explanation,
      level: matchedGp.level,
      exampleJp: contextSentence || matchedGp.examples?.[0]?.jp,
      exampleCn: matchedGp.examples?.[0]?.cn,
    };
  }

  // 3. 匹配常见具体交际与生活场景句型规则库
  for (const rule of SPECIFIC_VERB_PATTERNS) {
    if (
      rule.pattern.test(normalizedTitle) ||
      rule.pattern.test(rawTitle) ||
      rule.pattern.test(plainCore)
    ) {
      return {
        title: titleWithTilde,
        structure: rule.structure,
        meaning: rule.meaning,
        explanation: rule.explanation,
        level: rule.level,
        exampleJp: contextSentence || rule.exampleJp,
        exampleCn: rule.exampleCn,
      };
    }
  }

  // 4. 形态素解析分解：助词格位 + 谓语动词活用分析
  let particle = '';
  let particleDesc = '';
  let particleStructurePrefix = '名词';

  if (plainCore.startsWith('で')) {
    particle = 'で';
    particleDesc = '格助词「で」表示动作/事件发生的场所、方式手段或原因';
    particleStructurePrefix = '地点/场所名词';
  } else if (plainCore.startsWith('に')) {
    particle = 'に';
    particleDesc = '格助词「に」表示归宿点、存在场所、目标时间或对象';
    particleStructurePrefix = '地点/对象名词';
  } else if (plainCore.startsWith('を')) {
    particle = 'を';
    particleDesc = '宾格助词「を」表示动作直接作用的对象或移动经过的场所';
    particleStructurePrefix = '宾语/名词';
  } else if (plainCore.startsWith('へ')) {
    particle = 'へ';
    particleDesc = '格助词「へ」表示动作指向的移动方向';
    particleStructurePrefix = '方向/地点名词';
  } else if (plainCore.startsWith('从') || plainCore.startsWith('から')) {
    particle = 'から';
    particleDesc = '格助词「从」表示动作的起点或原因理由';
    particleStructurePrefix = '起点/名词';
  } else if (plainCore.startsWith('直到') || plainCore.startsWith('まで')) {
    particle = '直到';
    particleDesc = '副助词「直到」表示空间或时间的终点界限';
    particleStructurePrefix = '终点/时间名词';
  } else if (plainCore.startsWith('与') || plainCore.startsWith('と')) {
    particle = '与';
    particleDesc = '格助词「与」表示伴随共同动作的对象或引用发话内容';
    particleStructurePrefix = '人物/伙伴名词';
  } else if (plainCore.startsWith('が')) {
    particle = 'が';
    particleDesc = '格助词「が」提示主语或喜恶、能力所对应的目标事物';
    particleStructurePrefix = '对象/主语名词';
  }

  const remainder = particle ? core.slice(particle.length).trim() : core;
  const plainRemainder = particle ? plainCore.slice(particle.length).trim() : plainCore;

  // 尝试逆向还原动词原型（使用纯日文文本）
  const deinflections = deinflect(plainRemainder);
  let resolvedLemma = '';
  let resolvedFormTag = '';
  let lemmaMeaning = '';

  for (const d of deinflections) {
    if (DICT_BY_WORD.has(d.lemma)) {
      const entry = DICT_BY_WORD.get(d.lemma)!;
      resolvedLemma = d.lemma;
      resolvedFormTag = d.formTag;
      lemmaMeaning = entry.meaning;
      break;
    }
  }

  // 5. 根据词法解构动态合成专业释义与解析
  if (resolvedLemma && lemmaMeaning) {
    const structure = `${particleStructurePrefix} + ${particle ? `${particle} + ` : ''}${remainder}`;
    const meaning = particle
      ? `与「${lemmaMeaning}」相关的${particleDesc.split('表示')[1]?.split('、')[0] || '动作'}表达`
      : `${lemmaMeaning}（${resolvedFormTag}）`;
    const explanation = `由${particle ? `${particleDesc}，` : ''}后接动词「${resolvedLemma}」的${resolvedFormTag}「${remainder}」构成，在对话中表达具体的语境动作。`;

    return {
      title: titleWithTilde,
      structure,
      meaning,
      explanation,
      level: 'N5',
      exampleJp: contextSentence,
      exampleCn: contextSentence ? '（私教上下文精选表达例句）' : undefined,
      isGeneric: true,
    };
  }

  // 6. 词尾活用特征深度识别
  if (plainCore.endsWith('たい') || plainCore.endsWith('たいです')) {
    return {
      title: titleWithTilde,
      structure: '动词连用形 + たい / たいです',
      meaning: '想要做某事（主观意愿表达）',
      explanation: '接在动词连用形后，表示说话者第一人称的主观愿望；询问对方时用「～たいですか」，否定为「～たくないです」。',
      level: 'N5',
      exampleJp: contextSentence,
    };
  }

  if (plainCore.endsWith('たくない') || plainCore.endsWith('たくないです')) {
    return {
      title: titleWithTilde,
      structure: '动词连用形 + たくない / たくないです',
      meaning: '不想做某事（愿望否定表达）',
      explanation: '愿望助动词「たい」的否定形式，用于委婉表达自己缺乏进行某项动作的主观意愿。',
      level: 'N5',
      exampleJp: contextSentence,
    };
  }

  if (plainCore.endsWith('たほうがいい') || plainCore.endsWith('たほうがいいです')) {
    return {
      title: titleWithTilde,
      structure: '动词た形 + ほうがいい / ほうがいいです',
      meaning: '最好……、建议……（诚恳劝告）',
      explanation: '用于向对方提出具有建设性的忠告或建议。肯定建议用动词た形，否定劝阻用ない形（～ないほうがいい）。',
      level: 'N5',
      exampleJp: contextSentence,
    };
  }

  if (plainCore.endsWith('てはいけない') || plainCore.endsWith('てはいけません') || plainCore.endsWith('ちゃだめ')) {
    return {
      title: titleWithTilde,
      structure: '动词て形 + はいけない / はいけません',
      meaning: '不可以……、严禁……（规则禁止）',
      explanation: '常用于规则制度、公共准则或长辈告诫，严格要求不可进行某动作。口语中常简略为「～ちゃダメ」。',
      level: 'N5',
      exampleJp: contextSentence,
    };
  }

  if (plainCore.endsWith('ている') || plainCore.endsWith('ています')) {
    return {
      title: titleWithTilde,
      structure: '动词て形 + いる / います',
      meaning: '正在进行 / 状态的存续',
      explanation: '接持续动词时表示动作正在进行（如 読んでいます）；接瞬间动词时表示动作结果状态的留存（如 結婚しています、知っています）。',
      level: 'N5',
      exampleJp: contextSentence,
    };
  }

  // 7. 高级语义兜底：严禁出现“特定语法用法”等空洞废话。
  //    此类结果标记 isGeneric，采集侧直接丢弃，绝不进入学情档案。
  return {
    title: titleWithTilde,
    structure: particle ? `${particleStructurePrefix} + ${particle} + ${remainder}` : `前接词 + ${core}`,
    meaning: particle ? `围绕「${remainder}」的句意表达` : `「${core}」句型表达`,
    explanation: particle
      ? `包含${particleDesc}，引导分句中的关键动作成分，建议结合私教教学上下文体会其具体交际功用。`
      : `日语口语中的连贯接续表达，用于使语句逻辑自然顺畅。`,
    level: 'N4',
    exampleJp: contextSentence,
    isGeneric: true,
  };
}
