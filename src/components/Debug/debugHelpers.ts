import type { DebugLogEntry } from '../../services/debugLogger';

/* =========================================================================
 * 格式化工具
 * ========================================================================= */

export function formatNumber(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

export function formatDuration(ms?: number): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  const min = Math.floor(ms / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(1);
  return `${min} min ${sec} s`;
}

export function formatRelativeTime(timestamp: number, now: number): string {
  const delta = Math.max(0, now - timestamp);
  if (delta < 5000) return '刚刚';
  if (delta < 60000) return `${Math.floor(delta / 1000)} 秒前`;
  if (delta < 3600000) return `${Math.floor(delta / 60000)} 分前`;
  return formatClock(timestamp);
}

export function formatClock(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatBytesFromChars(chars: number): string {
  if (chars < 1000) return `${chars} 字符`;
  return `${(chars / 1000).toFixed(1)}k 字符`;
}

/** 度量单位缩写：1.2k */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1000000).toFixed(2)}M`;
}

/* =========================================================================
 * 检索
 * ========================================================================= */

export function entryMatchesQuery(entry: DebugLogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    entry.title,
    entry.id,
    entry.model,
    entry.provider,
    entry.endpoint,
    entry.modeLabel,
    entry.scenarioTitle,
    entry.typeLabel,
    entry.errorMessage,
    entry.systemPrompt,
    entry.rawOutput,
    entry.sanitizedOutput,
    entry.tokens ? String(entry.tokens.total) : '',
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/** 将文本按查询词切成高亮片段（大小写不敏感） */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const found = lowerText.indexOf(lowerQ, cursor);
    if (found === -1) {
      segments.push({ text: text.slice(cursor), hit: false });
      break;
    }
    if (found > cursor) segments.push({ text: text.slice(cursor, found), hit: false });
    segments.push({ text: text.slice(found, found + q.length), hit: true });
    cursor = found + q.length;
  }
  return segments.length > 0 ? segments : [{ text, hit: false }];
}

/* =========================================================================
 * 原始输出 vs 清洗输出 逐行差异
 * ========================================================================= */

export type DiffLineType = 'same' | 'del' | 'add';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

const MAX_DIFF_LINES = 400;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');

  // 超长文本降级为「全删 + 全增」，避免 O(n*m) 内存爆炸
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return [
      ...a.map<DiffLine>((text) => ({ type: 'del', text })),
      ...b.map<DiffLine>((text) => ({ type: 'add', text })),
    ];
  }

  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] });
      i++;
    } else {
      out.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] });
  while (j < m) out.push({ type: 'add', text: b[j++] });
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
  identical: boolean;
}

export function summarizeDiff(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const line of lines) {
    if (line.type === 'add') added++;
    else if (line.type === 'del') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged, identical: added === 0 && removed === 0 };
}

/* =========================================================================
 * 请求体 / cURL / Markdown 导出
 * ========================================================================= */

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost:5273';
}

/** 将本次请求还原为可直接在终端执行的 cURL 命令 */
export function buildCurlCommand(entry: DebugLogEntry): string {
  const origin = resolveOrigin();
  const isGeminiProxy = entry.endpoint.includes('/api/gemini');
  const url = entry.endpoint.startsWith('http') ? entry.endpoint : `${origin}${entry.endpoint}`;

  const payload: Record<string, unknown> = entry.rawRequestBody ? { ...entry.rawRequestBody } : {};
  const lines: string[] = [`curl -X POST ${shellSingleQuote(url)}`];
  lines.push(`  -H 'Content-Type: application/json'`);

  if (isGeminiProxy) {
    // 本地代理会自行补齐 apiKey 转发到 Google，这里显式标注占位符
    payload.apiKey = '<YOUR_GEMINI_API_KEY>';
  } else {
    lines.push(`  -H ${shellSingleQuote('Authorization: Bearer <YOUR_API_KEY>')}`);
    if (entry.stream) lines.push('  -N --no-buffer');
  }

  lines.push(`  -d ${shellSingleQuote(JSON.stringify(payload))}`);
  return lines.join(' \\\n');
}

function pickFence(text: string): string {
  const runs = text.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((r) => r.length)) : 0;
  return '`'.repeat(Math.max(3, longest + 1));
}

function fenced(text: string, lang = 'text'): string {
  const fence = pickFence(text);
  return `${fence}${lang}\n${text}\n${fence}`;
}

/** 生成单条记录的 Markdown 复盘报告 */
export function buildMarkdownReport(entry: DebugLogEntry): string {
  const lines: string[] = [];
  lines.push(`# 调试记录：${entry.title}`);
  lines.push('');
  lines.push('## 概览');
  lines.push('');
  lines.push('| 项目 | 值 |');
  lines.push('| --- | --- |');
  lines.push(`| 记录 ID | \`${entry.id}\` |`);
  lines.push(`| 类型 | ${entry.typeLabel}${entry.modeLabel ? ` / ${entry.modeLabel}` : ''} |`);
  lines.push(`| 状态 | ${entry.status} |`);
  lines.push(`| 时间 | ${entry.timeStr}（${new Date(entry.timestamp).toLocaleString()}） |`);
  lines.push(`| 供应商 / 模型 | ${entry.provider} / ${entry.model} |`);
  lines.push(`| 终结点 | \`${entry.endpoint}\` |`);
  lines.push(`| 流式 / 温度 | ${entry.stream ? 'true' : 'false'} / ${entry.temperature ?? '—'} |`);
  lines.push(`| 总耗时 | ${formatDuration(entry.durationMs)} |`);
  lines.push(`| 首字延迟 TTFT | ${entry.timeToFirstTokenMs != null ? `${entry.timeToFirstTokenMs} ms` : '—'} |`);
  lines.push(`| 流式分块 | ${entry.chunkCount} |`);
  lines.push(
    `| Tokens | prompt ${formatNumber(entry.tokens.prompt)} / completion ${formatNumber(
      entry.tokens.completion
    )} / total ${formatNumber(entry.tokens.total)}（${entry.tokens.estimated ? '本地估算' : 'API 真实 usage'}） |`
  );
  lines.push(
    `| 上下文消息 | 原始 ${entry.rawMessagesCount} 条 → 压缩发送 ${entry.optimizedMessages.length} 条 |`
  );
  lines.push('');

  if (entry.errorMessage) {
    lines.push('## 错误信息');
    lines.push('');
    lines.push(fenced(entry.errorMessage));
    lines.push('');
  }

  lines.push('## 系统提示词 (System Prompt)');
  lines.push('');
  lines.push(`共 ${entry.systemPromptCharCount} 字符 / 约 ${formatNumber(entry.systemPromptTokens || 0)} tokens`);
  lines.push('');
  lines.push(fenced(entry.systemPrompt));
  lines.push('');

  lines.push('## 发送给 API 的消息列表');
  lines.push('');
  if (entry.optimizedMessages.length === 0) {
    lines.push('_（无上下文消息）_');
  } else {
    entry.optimizedMessages.forEach((msg, index) => {
      lines.push(`### #${index + 1} · ${msg.role}`);
      lines.push('');
      lines.push(fenced(msg.content));
      lines.push('');
    });
  }

  lines.push('## AI 原始输出（未清洗）');
  lines.push('');
  lines.push(fenced(entry.rawOutput || '（空）'));
  lines.push('');

  if (entry.sanitizedOutput && entry.sanitizedOutput !== entry.rawOutput) {
    lines.push('## 清洗后正文');
    lines.push('');
    lines.push(fenced(entry.sanitizedOutput));
    lines.push('');
  }

  if (entry.stateSnapshot) {
    const s = entry.stateSnapshot;
    lines.push('## 运行时学情快照');
    lines.push('');
    lines.push(
      `- 学习者：${s.userName}（${s.userLevel}），私教：${s.tutorName}，累计会话 ${s.totalSessionsCount}`
    );
    lines.push(
      `- 生词：初学 ${s.learnedWordsCount.learning} / 温习 ${s.learnedWordsCount.reviewing} / 已掌握 ${s.learnedWordsCount.mastered}（共 ${s.learnedWordsCount.total}）`
    );
    lines.push(`- 已学语法：${s.learnedGrammarCount} 条`);
    lines.push(`- 薄弱点：${s.userWeakPoints.length ? s.userWeakPoints.join('、') : '无'}`);
    lines.push('');
  }

  if (entry.rawRequestBody) {
    lines.push('## 请求报文 (Request Body)');
    lines.push('');
    lines.push(fenced(JSON.stringify(entry.rawRequestBody, null, 2), 'json'));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_由栞 (Shiori) 开发者调试控制台导出_');
  return lines.join('\n');
}

/* =========================================================================
 * 文件下载
 * ========================================================================= */

export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 释放对象 URL，避免内存泄漏
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* =========================================================================
 * 本地持久化
 * ========================================================================= */

export function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 忽略隐私模式下的写入失败
  }
}
