// =========================================================
// LANGUAGE DETECTOR & CLASSIFIER (中日双语精准标签判定引擎)
// =========================================================
// 核心规则：
// 1. AI 输出中的所有日文统一以 <jp> 开头、</jp> 结尾（如：<jp>こんにちは！今日は東京に行きます。</jp>）。
//    这组包裹标签在渲染时对用户不可见，是系统绝对精准判定中日文的唯一基准。
// 2. 彻底去除原有模糊的假名比例/中文功能词统计猜测算法。
// 3. 用户发送的消息无包裹符号，不进行振假名注音。划词查词时结合前后文环境进行中日文判定。

/**
 * 匹配 AI 输出中的日文包裹块：统一标准为 <jp> ... </jp>（同时向下兼容 <j>...</j>、<j>...</p> 等历史变体）
 */
export const JAPANESE_TAG_REGEX = /<jp?>([\s\S]*?)(?:<\/jp>|<\/j>|<\/p>|<p>)/gi;

/**
 * 判定文本中是否包含被 <jp>...</jp> 标注的日文内容
 */
export function hasJapaneseTag(text: string): boolean {
  if (!text) return false;
  return /<jp?>[\s\S]*?(?:<\/jp>|<\/j>|<\/p>|<p>)/i.test(text);
}

/**
 * 判定单行或整段文本是否包含/主体为“日语句子”
 * - 若包含 <jp>...</jp> 标签：直接判定为日文（100% 确定）
 * - 若无标签（例如来自用户发言）：通过是否含有日文假名进行判断
 */
export function isJapaneseSentence(rawText: string, isFromTag?: boolean): boolean {
  if (!rawText || !rawText.trim()) return false;
  if (isFromTag) return true;

  // 1. 优先根据明确的 <jp>...</jp> 包裹标签判断
  if (hasJapaneseTag(rawText)) {
    return true;
  }

  // 2. 对于无标签文本（如用户输入）：检测是否包含纯正日文假名（平假名/片假名）
  return /[ぁ-んァ-ヶ]/.test(rawText);
}

/**
 * 提取文本中所有被 <jp>...</jp> 包裹的纯日文片段数组
 */
export function extractJapaneseSpans(rawText: string): string[] {
  if (!rawText) return [];
  const spans: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(JAPANESE_TAG_REGEX.source, 'gi');

  while ((match = regex.exec(rawText)) !== null) {
    const content = match[1]?.trim();
    if (content) {
      spans.push(content);
    }
  }

  return spans;
}

/**
 * 从文本中提取专供日语 TTS 语音合成朗读的纯正日文文本：
 * 1. 优先提取所有 <j>...</p> 标签内的日文内容
 * 2. 剥离可能存在的注音方括号语法（如 [かんじ]）与 Markdown 标记
 * 3. 若无标签（如用户自身消息），且含有假名，则提取并朗读
 */
export function extractJapaneseSpeakableText(sentenceText: string): string {
  if (!sentenceText) return '';

  let japanesePieces: string[] = [];

  if (hasJapaneseTag(sentenceText)) {
    japanesePieces = extractJapaneseSpans(sentenceText);
  } else if (/[ぁ-んァ-ヶ]/.test(sentenceText)) {
    // 用户输入的无标签日文
    japanesePieces = [sentenceText];
  }

  if (japanesePieces.length === 0) return '';

  return japanesePieces
    .map((piece) => {
      let clean = piece;
      // 剥离可能存在的内部注音语法：漢字[かんじ] -> 漢字
      clean = clean.replace(/([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\[([ぁ-んァ-ヶー]+)(?:\|\d+)?\]/g, '$1');
      clean = clean.replace(/\[[ぁ-んァ-ヶーa-zA-Z0-9|]+\]/g, '');
      // 剥离 Markdown 符号
      clean = clean.replace(/[*#_`]/g, '');
      return clean.trim();
    })
    .filter((p) => p.length > 0)
    .join('、 ');
}

/**
 * 提炼整段消息中的全部正规日语句子（用于“朗读整段”时避免音色朗读中文解释）
 */
export function extractAllJapaneseSentences(fullText: string): string {
  return extractJapaneseSpeakableText(fullText);
}

/**
 * 移除文本中所有的日文包裹标签 <jp>、</jp>、<j>、<p>、</p> 等（用于纯文本展示或复制）
 */
export function stripJapaneseTags(text: string): string {
  if (!text) return '';
  return text.replace(/<\/?jp>/gi, '').replace(/<\/?j>/gi, '').replace(/<\/?p>/gi, '');
}

/**
 * 智能判断查词输入到底是“基于日文查中文”还是“基于中文查日文”
 * @param query 用户划选或输入的词条
 * @param sentenceContext 词条所在的前后文（如气泡整段文字）
 * @param isFromJTag 该词条是否直接划选自 <jp>...</jp> 日文包裹标签内部
 */
export function detectQueryLanguage(
  query: string,
  sentenceContext?: string,
  isFromJTag: boolean = false
): 'jp' | 'cn' {
  const clean = query.trim();
  if (!clean) return 'jp';

  // 1. 若明确来自 <jp>...</jp> 包裹区域内部，100% 确定为日文
  if (isFromJTag) {
    return 'jp';
  }

  // 2. 如果包含明确的假名（平假名/片假名），100% 为日文
  if (/[ぁ-んァ-ヶ]/.test(clean)) {
    return 'jp';
  }

  // 3. 全是汉字或包含汉字的情况（如“料理”、“準備”、“学校”、“遅刻”）：
  if (sentenceContext && sentenceContext.trim()) {
    // 检查前后文是否包含日文标签
    if (hasJapaneseTag(sentenceContext)) {
      // 检查该词是否位于 <jp>...</jp> 之间
      const regex = new RegExp(JAPANESE_TAG_REGEX.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = regex.exec(sentenceContext)) !== null) {
        if (m[1].includes(clean)) {
          return 'jp';
        }
      }
    }

    // 若整句前后文几乎全为中文（含有中文常用词且无任何假名）
    const contextHasKana = /[ぁ-んァ-ヶ]/.test(sentenceContext);
    if (!contextHasKana && (sentenceContext.length > clean.length + 2)) {
      return 'cn';
    }
  }

  // 默认作为日文词条查询
  return 'jp';
}

/**
 * 具有鲜明中文特征的字符正则（主要包含现代简体中文独有字、中文特有高频词字如“这那着么个为说时他她它们会在对很从还把让给被并且或者但是而且然而因此所以因为虽然如果只要只有无论不管甚至以及关于对于通过根据按照”、以及中文特有标点符号等）
 * 用于快速排查和校验：若含有这些字符，则必定为中文，严禁作为日文假名或日语词条处理。
 */
export const DISTINCT_CHINESE_CHAR_REGEX =
  /[这那着么个为说时他她它们会在对很从还把让给被并且或者但是而且然而因此所以因为虽然如果只要只有无论不管甚至以及关于对于通过根据按照、，。！？“”《》【】…—]/;

/**
 * 动作、神态与心理描写关键词特征库
 */
const ACTION_KEYWORDS_REGEX = /(?:轻轻|微微|悄悄|缓缓|低头|抬头|转头|转身|回头|点头|摇头|眨[了眼]|叹气|叹了口气|深吸|挪[了动]|递[给过]|指尖|双手|不好意思|红着脸|脸颊|羞涩|害羞|愣[了住]|整理|衣角|动作|香气|脚步|眼神|目光|端起|合上|翻开|站[起立]|坐[下到]|走[向到出]|靠[近向]|咬了咬|下意识|忍不住|有些[害羞不好意思紧张拘谨迟疑犹豫]?|笑着|轻声|抿了抿|托着腮|托腮|别过脸|捂[着住]|握[着紧]|松开)/;

/**
 * 清理角色扮演或日常互动中，动作/神态/心理描写括号内残留的第一人称代词（如“我”、“自己”、“私”）。
 * 同时严格确保不对 <jp>...</jp> 内的日文产生破坏。
 */
export function sanitizeActionDescriptions(text: string): string {
  if (!text) return text;

  return text.replace(/(?:[（\(]([^）\)]+)[）\)]|\*([^*]+)\*)/g, (fullMatch, p1, p2, offset, wholeStr) => {
    const inner = p1 !== undefined ? p1 : p2;
    if (!inner || !inner.trim()) return fullMatch;

    // 如果括号内容本身被包裹在日文 <jp>...</jp> 内部，绝不篡改
    const precedingText = wholeStr.slice(0, offset);
    const openTags = (precedingText.match(/<jp?>/gi) || []).length;
    const closeTags = (precedingText.match(/<\/(?:jp|j|p)>|<p>/gi) || []).length;
    if (openTags > closeTags) {
      return fullMatch;
    }

    const isChineseParen = fullMatch.startsWith('（');

    // 检查括号前文是否为日语句子或日文引用（如果是日文翻译，且不包含动作特征词，则不作处理）
    const preceding = wholeStr.slice(Math.max(0, offset - 35), offset);
    const precededByJapanese =
      /(?:<\/jp>|<\/p>|<\/j>|<p>)\s*$/i.test(preceding) ||
      /[「『][^」』]+[」』]\s*$/.test(preceding) ||
      /[ぁ-んァ-ヶー][。！？!?]?\s*$/.test(preceding);

    const isAction = !precededByJapanese || ACTION_KEYWORDS_REGEX.test(inner);
    if (!isAction) {
      return fullMatch;
    }

    let cleanedInner = inner;

    // 1. 将动作描写中冗余的第一人称领属“我的脸/心/手/神情”优化为客观叙述“脸/心/手/神情”
    cleanedInner = cleanedInner.replace(/(^|[，,；;、\s。！？!?])我的(?=(?:脸|心|手|眼神|目光|神情|嘴角|脸颊|身体|身子|头|双眼))/g, '$1');

    // 2. 移除动作描写开头的“我/自己/私”（不带“的”，如 “我微微一笑” -> “微微一笑”）
    cleanedInner = cleanedInner.replace(/^(\s*)(?:我|自己|私)(?!的)(?=[\u4e00-\u9fa5])/g, '$1');

    // 3. 移除标点符号（逗号、分号、顿号、空格、句号等）后作为主语的“我/自己/私”（不带“的”，如 “，我有些不好意思” -> “，有些不好意思”）
    cleanedInner = cleanedInner.replace(/([，,；;、\s。！？!?])(?:我|自己|私)(?!的)(?=[\u4e00-\u9fa5])/g, '$1');

    if (p1 !== undefined) {
      return isChineseParen ? `（${cleanedInner}）` : `(${cleanedInner})`;
    } else {
      return `*${cleanedInner}*`;
    }
  });
}
