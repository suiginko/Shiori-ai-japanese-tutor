/**
 * 统一 Token 计数工具 —— 全站唯一的 Token 估算源。
 *
 * 说明：真正的 Token 数取决于各家模型的分词器（BPE），只有 API 返回的 usage
 * 字段才是「实际消耗」的权威值。本工具用于在 API 未返回 usage 时的估算兜底，
 * 以及在发送前预估 prompt 规模。其启发式规则贴近 GPT 系 tokenizer（cl100k/o200k）：
 *
 * - 中日韩表意文字（汉字）与假名：每字符约 1 token（少数生僻字可能 2~3）。
 * - 拉丁字母/数字：约每 4 个字符 1 token（常见单词整体计 1 token）。
 * - 空白字符：通常并入前一个 token，不额外计费。
 * - 其余标点：每个 1 token。
 */
const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F\u3000-\u303F]/;

// 依次匹配：中日韩/假名单个字符 | 拉丁/数字连续串（允许内部撇号连字符） | 空白串 | 其它单字符
const TOKENIZE_RE =
  /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F\u3000-\u303F]|[A-Za-z0-9]+(?:[’'\-—][A-Za-z0-9]+)*|\s+|./g;

export function countTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  const matches = text.match(TOKENIZE_RE);
  if (!matches) return 0;

  for (const m of matches) {
    if (CJK_RE.test(m[0])) {
      // 汉字/假名：每字约 1 token
      tokens += 1;
    } else if (/^\s+$/.test(m)) {
      // 空白：不计
    } else if (/^[A-Za-z0-9]/.test(m)) {
      // 拉丁/数字：约 4 字符 1 token，至少 1
      tokens += Math.max(1, Math.ceil(m.length / 4));
    } else {
      // 其余标点/符号：1 token
      tokens += 1;
    }
  }
  return tokens;
}

/** 批量统计多条消息内容的总 token 数（不含角色名等协议开销，仅内容）。 */
export function countTokensOfMessages(
  messages: Array<{ content: string }>
): number {
  let total = 0;
  for (const m of messages) {
    if (m && typeof m.content === 'string') {
      total += countTokens(m.content);
    }
  }
  return total;
}

/** 将 token 数格式化为易读字符串（如 1234 → "1.2k"）。 */
export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
