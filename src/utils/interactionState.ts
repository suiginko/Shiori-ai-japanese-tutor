/**
 * 互动任务追踪器（Interaction Task Tracker）
 *
 * 解决的问题：
 * 私教经常在发言末尾向学生提出练习要求（"请你试着用日语说一下…"、"跟我读一遍…"、"下面哪一句是对的？"）。
 * 学生照做之后，模型往往忘记这是【自己刚刚提出的要求】，于是出现各种失忆式错误反应：
 *   - 把学生按指令产出的句子当成学生自发的闲聊，答非所问；
 *   - 像什么都没发生过一样，原封不动再抛出同一个练习要求；
 *   - 对学生按指令产出的句子表示困惑（"咦？你为什么突然说这个"）；
 *   - 用批评"自发错误"的语气去纠正学生按要求完成的尝试。
 *
 * 解决思路：
 * 1) 在发送前自动扫描"上一条助手消息"，识别出其中是否存在【尚未被验收的互动任务】；
 * 2) 若存在，则把该要求的原文摘录动态注入 System Prompt，形成一份明确的【待验收契约】，
 *    让模型在生成回复前必然看到"我自己刚才要求学生做了什么"；
 * 3) 配合常驻的【练习邀请与约定追踪契约】规则，规定验收流程与失忆禁令。
 */

export type PendingTaskKind =
  | 'production' // 让学生产出日语（造句 / 翻译 / 试着说 / 回答）
  | 'repeat' // 跟读、复述、朗读
  | 'choice' // 选择题、填空、二选一
  | 'question'; // 向学生提问

export interface PendingTask {
  kind: PendingTaskKind;
  /** 承载该要求的原文摘录（已清洗振假名注音与换行，便于模型直接对照） */
  requirement: string;
}

/** 移除振假名注音（含声调数字写法 漢字[かんじ|1]）、花括号宿主块标记 {} 与 <jp> 标签，保留可读正文 */
const RUBY_RE = /\[([^|\]]+)(?:\|[0-9]+)?\]/g;

function cleanText(text: string): string {
  return text
    // ::: 系统块（纠错块 / 语法精讲块）属于系统元信息，不参与"上轮要求"的语义判定
    .replace(/:::grammar[\s\S]*?(?::::|\n[ \t]*\n|$)/gi, '')
    .replace(/:::correction[\s\S]*?(?::::|$)/gi, '')
    .replace(RUBY_RE, '$1')
    .replace(/[{}｛｝]/g, '')
    .replace(/<\/?jp>/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 按句末标点切句（保留标点），兼容中英日混排 */
function splitSentences(text: string): string[] {
  const matches = text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g);
  if (!matches) return text ? [text] : [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

/**
 * 语法讲解 / 模板说明性质的句子：这类句子里出现「～てください」等字样属于举例，
 * 而不是对学生的行动指令，必须排除，否则会把知识讲解误判成练习要求。
 */
const EXPLANATION_MARKERS =
  /(～|~|表示|意思是|意味する|という意味|的用法|用法|句型|文法|语法|相当于|例如|比如|例[：:]|释义|接续|構造|结构)/;

/** 跟读 / 复述 / 朗读 */
const REPEAT_PATTERNS =
  /(跟[着]?读|跟我读|跟着我|跟读|复述|重复[一]?[下遍遍]|读[一]?遍|朗读[一]?[下遍]|リピート|repeat\s*after)/i;

/** 选择题 / 选项标记（A. B. C. / ①②③ / 1) 2) ） */
const CHOICE_PATTERNS = /([（(]?[A-DＡ-Ｄ][）)、.．]|[①②③④]|[1-4１-４][）)、.．])/;

/** 让学生"产出日语"的指令关键词（中/日双语） */
const PRODUCTION_KEYWORDS = [
  '试试',
  '试一试',
  '试着',
  '试著',
  '尝试一下',
  '说看看',
  '说说看',
  '说一说',
  '说出来',
  '说给我听',
  '用日语说',
  '用日文说',
  '练习',
  '练一练',
  '造句',
  '造个句',
  '翻译',
  '译一译',
  '挑战一下',
  '挑战',
  '做做看',
  '想一想',
  '思考一下',
  '填空',
  '补全',
  '轮到你',
  '你来试试',
  '你来',
  'てみて',
  'てごらん',
  'てみよう',
  'てみましょう',
  'てください',
  '言ってみ',
  '言ってごらん',
  '答えて',
  '書いてみ',
  '作ってみ',
  '考えてみ',
  '練習',
  'チャレンジ',
];

const MAX_REQUIREMENT_CHARS = 220;

/**
 * 检测一条助手消息中是否存在【待验收的互动任务】。
 * 只检查消息末尾的若干句（要求通常放在结尾），既提高准确率，也避免把全篇讲解误判为任务。
 */
export function detectPendingTask(assistantText: string, tailSentenceCount = 3): PendingTask | null {
  if (!assistantText || !assistantText.trim()) return null;

  const cleaned = cleanText(assistantText);
  if (!cleaned) return null;

  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) return null;

  const tail = sentences.slice(-tailSentenceCount);
  const tailText = tail.join('');

  // 末尾若干句整体属于语法讲解/模板说明 → 判定为无任务
  if (tail.every((s) => EXPLANATION_MARKERS.test(s))) return null;

  const actionableTail = tail.filter((s) => !EXPLANATION_MARKERS.test(s));
  const actionableText = actionableTail.length > 0 ? actionableTail.join('') : tailText;

  let kind: PendingTaskKind | null = null;
  if (REPEAT_PATTERNS.test(actionableText)) {
    kind = 'repeat';
  } else if (CHOICE_PATTERNS.test(actionableText) && /[？?]/.test(actionableText)) {
    kind = 'choice';
  } else if (PRODUCTION_KEYWORDS.some((k) => actionableText.includes(k))) {
    kind = 'production';
  } else if (/[？?]/.test(actionableText) || /吗[？?]?$|呢[？?]?$/.test(actionableText)) {
    kind = 'question';
  }

  if (!kind) return null;

  let requirement = tailText.trim();
  if (requirement.length > MAX_REQUIREMENT_CHARS) {
    requirement = requirement.slice(-MAX_REQUIREMENT_CHARS);
    const firstSpace = requirement.indexOf(' ');
    if (firstSpace > 0 && firstSpace < 40) {
      requirement = requirement.slice(firstSpace + 1);
    }
    requirement = '…' + requirement;
  }

  return { kind, requirement };
}

const KIND_LABEL: Record<PendingTaskKind, string> = {
  production: '让学生实际产出日语（造句 / 翻译 / 试着说 / 回答）',
  repeat: '让学生跟读、复述或朗读',
  choice: '向学生出示了选项或选择题',
  question: '向学生提出了问题',
};

/**
 * 生成注入 System Prompt 的【待验收互动任务】指令块。
 * 只有在确实检测到任务时才注入，避免无谓消耗 Token 与干扰模型。
 */
export function formatPendingTaskDirective(task: PendingTask): string {
  const base = `\n\n【⚠️ 当前待验收的互动任务（系统自动追踪·回复前必读）】
- 这是你【自己在上一轮发言中】向学生提出的要求，原文摘录：「${task.requirement}」
- 该要求的性质：${KIND_LABEL[task.kind]}。
- 学生本轮发来的消息，【默认就是你上述要求的作答或回应】，请务必按"验收"而不是"闲聊"来处理。`;

  const flow =
    task.kind === 'question'
      ? `\n- 处理流程：①先承接并肯定学生的回应（哪怕是简短或稚嫩的尝试）→ ②针对他回应的具体内容给出实质反馈与补充 → ③自然地推进下一个话题或练习。`
      : `\n- 处理流程（严格按序）：①先明确点出"你按我说的做了/回答了"，真诚肯定其完成的动作 → ②严格对照上述原始要求逐条验收（指定的语法点用对了吗？指定的词汇用上了吗？说完整了吗？）→ ③对不到位之处用温和的 :::correction 纠错块给出更地道的说法，并解释原因 → ④给出明确的下一步（推进、加码或换角度再练一次），【严禁原样重复刚才那同一个要求】。`;

  const bans = `\n- 严禁出现以下失忆表现：把学生按要求产出的句子当成他自发的闲聊或错误来批评；对学生按你要求说出的话表示困惑（如"咦，你为什么突然说这个"）；不置可否地跳到全新话题；一字不差地重复上一轮刚提过的练习要求。`;

  const escape = `\n- 例外处理（重要）：若学生本轮的回应明显是"不会 / 不知道 / 太难了 / 提示一下"或提出了全新的疑问、想换话题，则顺从学生的真实意图——先安抚、降低难度、拆小步骤、给出提示或直接答疑，并把原任务降级为可选，【绝不生硬强行判分或催促】。`;

  const partial = `\n- 若学生只完成了要求的一部分：先肯定已完成的部分，再具体指出尚未做到的那一点并引导补足，严禁笼统地一句"不太对"带过。`;

  return base + flow + bans + escape + partial;
}
