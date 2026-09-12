import { ApiSettings, ChatMessage, SubtitleSeparatorType } from '../types';
import { stripRubyMarkers } from './nameRubyHelper';

/** 将连接符类型转为实际字符 */
export function getSeparatorString(type: SubtitleSeparatorType = 'dot', custom?: string): string {
  const map: Record<SubtitleSeparatorType, string> = {
    dot: '·',
    comma: '、',
    and: ' & ',
    space: ' ',
    yu: '与',
    to: 'と',
    custom: custom?.trim() || '·',
  };
  return map[type] || '·';
}

/** 拼接副标题（必须恰好为 3 个关键词） */
export function formatSubtitleWithTopics(
  topics: string[],
  type: SubtitleSeparatorType = 'dot',
  custom?: string
): string {
  if (!topics) return '';
  const clean = topics.map((t) => t.trim()).filter(Boolean);
  return clean.length === 3 ? clean.join(getSeparatorString(type, custom)) : '';
}

/** 排除各类成对括号（旁白、动作描写、振假名等） */
export function stripParenthesesAndBrackets(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\(（\[［【\{｛〔〈].*?[\)）\]］】\}｝〕〉]/g, ' ')
    .replace(/[#*_`~>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 历史记录对话预览文本专用清洗函数：
 * 彻底过滤掉 <jp>、:::correction、:::grammar 等特殊隐藏标签和系统元数据块
 */
export function cleanHistoryPreviewText(rawContent?: string): string {
  if (!rawContent || !rawContent.trim()) return '';

  return rawContent
    // 1. 彻底剔除 :::correction 纠错块、:::grammar 语法块及其他 ::: 系统块
    .replace(/:::[a-zA-Z_-]+[\s\S]*?(?::::|\n[ \t]*\n|$)/gi, ' ')
    // 2. 彻底剔除 <jp>、</jp>、<j>、</j> 等日文包裹标签及 HTML/XML 隐藏标记
    .replace(/<\/?(?:jp|j|p)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // 3. 剥除 {汉字[读音]} 形式的注音，保留正文汉字
    .replace(/\{([^{}\[\]]+)(?:\[[^\]]*\])?\}/g, '$1')
    .replace(/([一-龯々〆ヵヶぁ-んァ-ヶa-zA-Z0-9]+)\[[^\]]*\]/g, '$1')
    .replace(/[{}｛｝]/g, '')
    // 4. 剔除旁白/动作描写成对括号（如（微笑）、[点头]）
    .replace(/[\(（\[［【\{｛〔〈].*?[\)）\]］】\}｝〕〉]/g, ' ')
    // 5. 剔除 Markdown 标记符（标题#、加粗*、反引号`等）
    .replace(/[#*_`~>]/g, ' ')
    // 6. 压缩空白字符与换行
    .replace(/[\r\n\t\f\v]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 常见无聊泛词与学科通识词正则（严禁“日语”、“语法”、“单词”等） */
const BORING_WORDS_REGEX = /^(?:日语|日文|文法|语法|单词|生词|词汇|单字|汉字|假名|平假名|片假名|发音|读音|音调|声调|敬语|句型|句子|造句|例句|动词变形|学习|复习|练习|对话|问答|交流|探讨|辅导|教学|考试|测验|基础|入门)$/;
const BORING_SUBSTR_REGEX = /日语|日文|语法|文法|单词|生词|词汇|假名|平假名|片假名|造句|例句|发音/;

/** 人设、身份与提示词相关正则 */
const PERSONA_OR_META_REGEX = /人设|设定|扮演|提示词|系统提示|角色背景|身份|私教|老师|学生|店员|店小二|顾客|游客|留学生|青梅竹马|同桌|同学|助手|system|prompt|roleplay|assistant|user/i;

/** 动词/介词前缀与复合动作后缀正则（用于剥离短语搭配提取实体） */
const PREFIX_REGEX = /^(?:购买|乘坐|前往|探讨|学习|办理|咨询|去|买|吃|喝|点|做|学|乘|坐|看|听|写|玩|找|教)/;
const SUFFIX_REGEX = /(?:点餐|点单|付款|结算|交流|探讨|学习|购物|练习|对话|乘坐|购买|使用|介绍|问路|退房|入住|表达|词汇)$/;

/** 检查候选词是否为常见无聊泛词 */
export function isBannedCommonOrBoringWord(word: string): boolean {
  if (!word) return true;
  const w = word.trim().toLowerCase();
  return BORING_WORDS_REGEX.test(w) || BORING_SUBSTR_REGEX.test(w);
}

/** 检查候选词是否为人设、角色身份或提示词 */
export function isBannedPersonaOrMetaWord(word: string): boolean {
  if (!word) return true;
  return PERSONA_OR_META_REGEX.test(word.trim().toLowerCase());
}

/** 检查候选词是否命中私教或用户的名字/称谓 */
export function isNameOrNameDerivative(word: string, settings?: Partial<ApiSettings>): boolean {
  if (!word) return false;
  const w = word.trim().toLowerCase();
  const names = ['栞', 'shiori', '薫子', 'kaoruko', '陽葵', 'himari', '佐藤', '美咲', '言の葉', '学习者', '私教', '老师'];

  if (settings?.aiTutorName) {
    const clean = stripRubyMarkers(settings.aiTutorName).replace(/[()（）]/g, ' ').trim().toLowerCase();
    clean.split(/\s+/).forEach((n) => n && names.push(n));
  }
  if (settings?.userName) {
    const clean = stripRubyMarkers(settings.userName).replace(/[()（）]/g, ' ').trim().toLowerCase();
    clean.split(/\s+/).forEach((n) => n && names.push(n));
  }
  if (settings?.aiNameReading) names.push(settings.aiNameReading.trim().toLowerCase());
  if (settings?.userNameReading) names.push(settings.userNameReading.trim().toLowerCase());

  return names.some((n) => n && (w === n || (n.length >= 2 && w.includes(n)) || (w.includes(n) && /(?:小|阿|酱|桑|君|老师|同学|先生)/.test(w))));
}

/** 校验是否为合规的单个实体词（2~5字，无标点，非泛词、非人名、非动宾词组） */
export function isStandaloneWord(word: string, settings?: Partial<ApiSettings>): boolean {
  if (!word) return false;
  const w = word.trim();
  if (w.length < 2 || w.length > 5) return false;
  if (/[\s·、&/\\+\-_,，。！？!?:：()（）[\]【】《》「」『』"'“”‘’]/.test(w)) return false;
  if (isBannedPersonaOrMetaWord(w) || isBannedCommonOrBoringWord(w) || isNameOrNameDerivative(w, settings)) return false;
  if (w.length >= 3 && PREFIX_REGEX.test(w)) return false;
  if (w.length >= 4 && SUFFIX_REGEX.test(w)) return false;
  return true;
}

/** 尝试将复合短语清洗为单独词（如：“居酒屋点餐” -> “居酒屋”） */
export function sanitizeToStandaloneWord(rawWord: string, settings?: Partial<ApiSettings>): string | null {
  if (!rawWord) return null;
  let clean = rawWord.replace(/[《》「」『』""''“”‘’\(\)（）\[\]【】\s·、&]/g, '').trim();
  if (isStandaloneWord(clean, settings)) return clean;

  clean = clean.replace(PREFIX_REGEX, '').replace(SUFFIX_REGEX, '').trim();
  return isStandaloneWord(clean, settings) ? clean : null;
}

/** 预清洗对话内容，剔除括号和人设声明语句 */
export function cleanMessageForTopicExtraction(raw: string): string {
  if (!raw?.trim()) return '';
  const text = stripParenthesesAndBrackets(raw);
  const personaLinePattern = /人设|设定[：:]|(?:\b|^)(?:请|你|我)?扮演|提示词|system\s*prompt|prompt[：:]|指令[：:]|(?:你|我)的?(?:身份|角色|人设)|(?:你是|我是)(?:一个|一名|一位)?(?:店员|老板|店小二|店长|学生|老师|私教|青梅竹马|顾客|客人|游客|留学生|背包客)/i;

  return text
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('/') && !s.startsWith('！') && !s.startsWith('!') && !personaLinePattern.test(s))
    .join(' ')
    .trim();
}

/** 提取首句作为会话标题 */
export function extractFirstSentenceTitle(rawContent: string): string {
  if (!rawContent?.trim()) return '新对话';
  const text = cleanMessageForTopicExtraction(rawContent) || stripParenthesesAndBrackets(rawContent) || '新对话';
  const first = text.split(/[。！？!?\n]+/)[0]?.trim() || text;
  const clean = first.replace(/[。！？!?\s]+$/, '').trim() || text;
  return clean.length > 28 ? `${clean.slice(0, 26)}...` : clean;
}

/** 计算对话中已完成的轮次 */
export function countCompletedTurns(messages: ChatMessage[]): number {
  if (!messages?.length) return 0;
  return messages.filter((m, i) => m.role === 'user' && messages.slice(i + 1).some((r) => r.role === 'assistant' && r.content.trim())).length;
}

/** 由 AI 提炼会话中的 3 个核心话题关键词（严格保证恰好 3 个） */
export async function extractSessionKeywords(
  messages: ChatMessage[],
  settings: ApiSettings
): Promise<string[]> {
  if (!messages?.length || !settings?.apiKey?.trim()) return [];

  const conversationSummary = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map((m) => {
      const cleaned = cleanMessageForTopicExtraction(m.content);
      return cleaned ? `${m.role === 'user' ? '学生' : '私教'}: ${cleaned.slice(0, 150)}` : '';
    })
    .filter(Boolean)
    .join('\n');

  if (!conversationSummary) return [];

  const cleanTutor = stripRubyMarkers(settings.aiTutorName || '').replace(/[()（）]/g, ' ').trim() || 'AI私教';
  const cleanUser = stripRubyMarkers(settings.userName || '').replace(/[()（）]/g, ' ').trim() || '学习者';

  const prompt = `阅读以下对话，提炼出【恰好3个】代表本次对话核心内容的具体话题关键词。

对话内容：
${conversationSummary}

要求：
1. 动漫标题感：3个词组合需具备日本轻小说或动漫作品标题般的画面感与趣味感（如“笨蛋·测验·召唤兽”、“新干线·便当·富士山”）。
2. 实体词约束：提取的必须是3个独立的具体实体名词（2~4字，如“居酒屋”、“生啤酒”、“烤串”），严禁动宾词组（如“居酒屋点餐”）。
3. 负面排除：严禁出现“日语”、“语法”、“单词”等常见泛词，严禁包含私教（${cleanTutor}）与学生（${cleanUser}）的名字或身份称谓。
4. 输出格式：仅输出 3~5 个候选词的纯 JSON 字符串数组，例如：["词1", "词2", "词3"]，无任何额外解释或 Markdown 标记。`;

  try {
    let rawText = '';
    if (settings.provider === 'gemini') {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.model || 'gemini-3.6-flash',
          messages: [{ role: 'user', content: prompt }],
          apiKey: settings.apiKey.trim(),
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      });
      if (!res.ok) throw new Error(`Gemini status ${res.status}`);
      const json = await res.json();
      rawText = json.text || '';
    } else {
      const res = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: settings.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });
      if (!res.ok) throw new Error(`API status ${res.status}`);
      const json = await res.json();
      rawText = json.choices?.[0]?.message?.content || '';
    }

    const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleanJson.match(/\[[\s\S]*?\]/);
    const parsed = JSON.parse(match ? match[0] : cleanJson);

    if (Array.isArray(parsed)) {
      const cleanKeywords: string[] = [];
      for (const item of parsed) {
        const word = sanitizeToStandaloneWord(String(item), settings);
        if (word && !cleanKeywords.includes(word)) {
          cleanKeywords.push(word);
          if (cleanKeywords.length === 3) break;
        }
      }
      if (cleanKeywords.length === 3) return cleanKeywords;
    }
    return [];
  } catch (err) {
    console.warn('AI keyword extraction failed:', err);
    return [];
  }
}
