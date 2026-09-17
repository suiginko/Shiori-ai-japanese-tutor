import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChatMessage, FuriganaMode, PitchDisplayMode, MessageCorrection } from '../../types';
import { RubyText } from './RubyText';
import { parseMessageSegments, normalizeJapaneseMarkdownTags } from '../../utils/rubyParser';
import { sanitizeStreamingContent } from '../../utils/streamingSanitizer';
import { getNameInitial, NameWithRuby } from '../../utils/nameRubyHelper';
import { computeCorrectionDiff } from '../../utils/diffHelper';
import { sanitizeActionDescriptions } from '../../utils/languageDetector';
import { CheckCircle2, AlertCircle, Pencil, RotateCcw, Layers, BookOpen, Brain, ChevronDown } from 'lucide-react';

interface MessageItemProps {
  message: ChatMessage;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate?: number;
  aiTutorName?: string;
  userName?: string;
  aiAvatar?: string;
  userAvatar?: string;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onResendMessage?: (messageId: string) => void;
  /** 点击「已收录语法」提示 → 打开学情档案的句型语法页并定位 */
  onOpenCollectedGrammar?: (targetTitle?: string) => void;
  onOpenCollectedWords?: (targetWord?: string) => void;
  isGenerating?: boolean;
  /** 是否开启深度思考：关闭时既不渲染思考区块、也不显示"正在深度思考"占位 */
  deepThinkingEnabled?: boolean;
}

// Leaf Renderer: Handles Japanese Parenthesis Dimming and Ruby Annotations
interface ParenthesisRubyProps {
  text: string;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
}

interface ParenSegment {
  type: 'plain' | 'paren';
  content: string;
  openParen?: string;
  closeParen?: string;
  inner?: string;
}

/**
 * 检查当前字符索引是否处于日文包裹标签 <jp> 或 <j> 内部
 */
function isInsideJapaneseTag(str: string, index: number): boolean {
  const lastOpen = Math.max(
    str.lastIndexOf('<jp>', index),
    str.lastIndexOf('<j>', index)
  );
  if (lastOpen === -1) return false;
  const lastClose = Math.max(
    str.lastIndexOf('</jp>', index),
    str.lastIndexOf('</p>', index),
    str.lastIndexOf('<p>', index),
    str.lastIndexOf('</j>', index)
  );
  return lastOpen > lastClose;
}

/**
 * 嵌套平衡括号扫描器：精准支持多层全角（）与半角()圆括号嵌套
 */
function parseParenthesisSegments(text: string): ParenSegment[] {
  if (!text) return [];

  const segments: ParenSegment[] = [];
  const len = text.length;
  let lastIndex = 0;
  let i = 0;

  while (i < len) {
    const char = text[i];
    if ((char === '（' || char === '(') && !isInsideJapaneseTag(text, i)) {
      const matchStart = i;
      const openParen = char;
      let depth = 1;
      let j = i + 1;
      let foundClose = false;
      let closeParen = '';
      let matchEnd = -1;

      while (j < len) {
        const c = text[j];
        if (c === '（' || c === '(') {
          depth++;
        } else if (c === '）' || c === ')') {
          depth--;
          if (depth === 0) {
            foundClose = true;
            closeParen = c;
            matchEnd = j + 1;
            break;
          }
        }
        j++;
      }

      if (foundClose) {
        if (matchStart > lastIndex) {
          segments.push({
            type: 'plain',
            content: text.substring(lastIndex, matchStart),
          });
        }

        const fullText = text.substring(matchStart, matchEnd);
        const inner = fullText.slice(1, -1);

        segments.push({
          type: 'paren',
          content: fullText,
          openParen,
          closeParen,
          inner,
        });

        lastIndex = matchEnd;
        i = matchEnd;
        continue;
      } else {
        if (matchStart > lastIndex) {
          segments.push({
            type: 'plain',
            content: text.substring(lastIndex, matchStart),
          });
        }

        const fullText = text.substring(matchStart);
        const inner = fullText.slice(1);

        segments.push({
          type: 'paren',
          content: fullText,
          openParen,
          closeParen: '',
          inner,
        });

        lastIndex = len;
        i = len;
        break;
      }
    } else {
      i++;
    }
  }

  if (lastIndex < len) {
    segments.push({
      type: 'plain',
      content: text.substring(lastIndex),
    });
  }

  return segments;
}

/**
 * 拆分表格行单元格，支持转义竖线 \|
 */
function splitTableCells(line: string): string[] {
  const trimmed = line.trim();
  const content = trimmed.replace(/^\|\s*/, '').replace(/\s*\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '\\' && i + 1 < content.length && content[i + 1] === '|') {
      current += '|';
      i++;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

interface TableBlock {
  type: 'table';
  key: string;
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
  isLastBlock: boolean;
}

interface SingleLineBlock {
  type: 'line';
  key: string;
  line: string;
  isLastBlock: boolean;
}

type TextBlock = TableBlock | SingleLineBlock;

interface FormattedSegment {
  type: 'plain' | 'paren' | 'bold_italic' | 'bold' | 'italic' | 'strike' | 'code';
  content: string;
  openParen?: string;
  closeParen?: string;
  inner?: string;
}

/**
 * 从左至右扫描最先发生的最外层行内语法元素（括号与各类 Markdown 行内标记）
 * 确保外层结构（如全包围的括号或全包围的加粗）保持完整，内部递归解析，彻底根除截断问题。
 */
function parseFormattedSegments(text: string): FormattedSegment[] {
  if (!text) return [];

  const segments: FormattedSegment[] = [];
  const len = text.length;
  let i = 0;
  let lastIndex = 0;

  while (i < len) {
    let bestStart = -1;
    let bestType: FormattedSegment['type'] | null = null;
    let bestEnd = -1;
    let bestInner = '';
    let bestOpen = '';
    let bestClose = '';

    for (let k = i; k < len; k++) {
      const char = text[k];

      // 1. 括号扫描（不在 <jp> 标签内）
      if ((char === '（' || char === '(') && !isInsideJapaneseTag(text, k)) {
        let depth = 1;
        let found = false;
        let closeChar = '';
        let matchEnd = -1;
        for (let j = k + 1; j < len; j++) {
          const c = text[j];
          if (c === '（' || c === '(') depth++;
          else if (c === '）' || c === ')') {
            depth--;
            if (depth === 0) {
              found = true;
              closeChar = c;
              matchEnd = j + 1;
              break;
            }
          }
        }
        bestStart = k;
        bestType = 'paren';
        bestOpen = char;
        if (found) {
          bestEnd = matchEnd;
          bestClose = closeChar;
          bestInner = text.slice(k + 1, matchEnd - 1);
        } else {
          bestEnd = len;
          bestClose = '';
          bestInner = text.slice(k + 1);
        }
        break;
      }

      // 2. 粗斜体 ***
      if (text.startsWith('***', k)) {
        const closeIdx = text.indexOf('***', k + 3);
        if (closeIdx !== -1) {
          bestStart = k;
          bestType = 'bold_italic';
          bestEnd = closeIdx + 3;
          bestInner = text.slice(k + 3, closeIdx);
          break;
        }
      }

      // 3. 粗体 **
      if (text.startsWith('**', k) && !text.startsWith('***', k)) {
        const closeIdx = text.indexOf('**', k + 2);
        if (closeIdx !== -1) {
          bestStart = k;
          bestType = 'bold';
          bestEnd = closeIdx + 2;
          bestInner = text.slice(k + 2, closeIdx);
          break;
        }
      }

      // 4. 删除线 ~~
      if (text.startsWith('~~', k)) {
        const closeIdx = text.indexOf('~~', k + 2);
        if (closeIdx !== -1) {
          bestStart = k;
          bestType = 'strike';
          bestEnd = closeIdx + 2;
          bestInner = text.slice(k + 2, closeIdx);
          break;
        }
      }

      // 5. 行内代码 `
      if (char === '`') {
        const closeIdx = text.indexOf('`', k + 1);
        if (closeIdx !== -1) {
          bestStart = k;
          bestType = 'code';
          bestEnd = closeIdx + 1;
          bestInner = text.slice(k + 1, closeIdx);
          break;
        }
      }

      // 6. 斜体 *
      if (char === '*' && !text.startsWith('**', k) && (k === 0 || text[k - 1] !== '*')) {
        let closeIdx = -1;
        for (let m = k + 1; m < len; m++) {
          if (text[m] === '*' && text[m - 1] !== '*' && (m + 1 >= len || text[m + 1] !== '*')) {
            closeIdx = m;
            break;
          }
        }
        if (closeIdx !== -1) {
          bestStart = k;
          bestType = 'italic';
          bestEnd = closeIdx + 1;
          bestInner = text.slice(k + 1, closeIdx);
          break;
        }
      }
    }

    if (bestType !== null && bestStart !== -1) {
      if (bestStart > lastIndex) {
        segments.push({
          type: 'plain',
          content: text.substring(lastIndex, bestStart),
        });
      }
      segments.push({
        type: bestType,
        content: text.substring(bestStart, bestEnd),
        inner: bestInner,
        openParen: bestOpen,
        closeParen: bestClose,
      });
      lastIndex = bestEnd;
      i = bestEnd;
    } else {
      break;
    }
  }

  if (lastIndex < len) {
    segments.push({
      type: 'plain',
      content: text.substring(lastIndex),
    });
  }

  return segments;
}

interface FormattedInlineRubyProps {
  text: string;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
  depth?: number;
}

/**
 * 行内格式统一递归解析器：完美协同 Markdown 行内元素（粗体、斜体、删除线、代码）
 * 与全/半角括号灰显（parenthesis-text），杜绝任何语法嵌套导致的截断与样式丢失。
 */
const FormattedInlineRuby: React.FC<FormattedInlineRubyProps> = ({
  text,
  furiganaMode,
  pitchDisplayMode,
  ttsRate,
  depth = 0,
}) => {
  if (!text) return null;

  let normalized = text;
  if (depth === 0) {
    // 1.0 规范化日文标签与行内 Markdown 的嵌套关系，防止标签被 Markdown 切分撕裂
    normalized = normalizeJapaneseMarkdownTags(normalized);

    // 1.1 全角双星号规范化为半角双星号，增强输入法宽容度
    normalized = normalized.replace(/＊＊/g, '**');

    // 1.2 假名注音紧贴粗体外侧时吸收入内：**词汇**[读音] -> **词汇[读音]**
    normalized = normalized.replace(
      /\*\*([^\*\n]+?)\*\*\s*\[([ぁ-んァ-ヶー]+)(?:\|\d+)?\]/g,
      (_m, word, reading) => `**${word}[${reading}]**`
    );
    normalized = normalized.replace(
      /\*([^\*\n]+?)\*\s*\[([ぁ-んァ-ヶー]+)(?:\|\d+)?\]/g,
      (_m, word, reading) => `*${word}[${reading}]*`
    );

    // 1.3 容错单边未闭合的星号（例如某行只有奇数个 ** 时，在行尾自动成对闭合，杜绝裸露的 ** 显示）
    const boldTokens = normalized.match(/\*\*/g);
    if (boldTokens && boldTokens.length % 2 !== 0) {
      normalized += '**';
    }
  }

  // 超过安全递归深度时直接输出叶子注音组件
  if (depth > 5) {
    return (
      <RubyText
        content={normalized}
        furiganaMode={furiganaMode}
        pitchDisplayMode={pitchDisplayMode}
        ttsRate={ttsRate}
        interactive={true}
      />
    );
  }

  const segments = parseFormattedSegments(normalized);

  return (
    <>
      {segments.map((seg, index) => {
        if (!seg) return null;

        // 括号及括号内文字灰显：内部递归调用，保持括号从头到尾的灰显完整性
        if (seg.type === 'paren') {
          return (
            <span key={index} className="parenthesis-text roleplay-action-text">
              {seg.openParen}
              <FormattedInlineRuby
                text={seg.inner || ''}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
                depth={depth + 1}
              />
              {seg.closeParen}
            </span>
          );
        }

        // 粗斜体 ***text***
        if (seg.type === 'bold_italic') {
          return (
            <strong key={index} className="md-bold-text">
              <em className="md-italic-text">
                <FormattedInlineRuby
                  text={seg.inner || ''}
                  furiganaMode={furiganaMode}
                  pitchDisplayMode={pitchDisplayMode}
                  ttsRate={ttsRate}
                  depth={depth + 1}
                />
              </em>
            </strong>
          );
        }

        // 粗体 **text**
        if (seg.type === 'bold') {
          return (
            <strong key={index} className="md-bold-text">
              <FormattedInlineRuby
                text={seg.inner || ''}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
                depth={depth + 1}
              />
            </strong>
          );
        }

        // 斜体 *text*
        if (seg.type === 'italic') {
          return (
            <em key={index} className="md-italic-text">
              <FormattedInlineRuby
                text={seg.inner || ''}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
                depth={depth + 1}
              />
            </em>
          );
        }

        // 删除线 ~~text~~
        if (seg.type === 'strike') {
          return (
            <s key={index} className="md-strikethrough-text">
              <FormattedInlineRuby
                text={seg.inner || ''}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
                depth={depth + 1}
              />
            </s>
          );
        }

        // 行内代码 `code`
        if (seg.type === 'code') {
          return (
            <span key={index} className="md-inline-code">
              <FormattedInlineRuby
                text={seg.inner || ''}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
                depth={depth + 1}
              />
            </span>
          );
        }

        // 普通文本段：交由底层 RubyText 进行日文分词、振假名注音与划词查词
        return (
          <RubyText
            key={index}
            content={seg.content}
            furiganaMode={furiganaMode}
            pitchDisplayMode={pitchDisplayMode}
            ttsRate={ttsRate}
            interactive={true}
          />
        );
      })}
    </>
  );
};

// 兼容别名
const ParenthesisRuby: React.FC<ParenthesisRubyProps> = (props) => {
  return <FormattedInlineRuby {...props} />;
};

interface MarkdownRubyProps {
  text: string;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
}

const MarkdownRuby: React.FC<MarkdownRubyProps> = (props) => {
  return <FormattedInlineRuby {...props} />;
};

interface LineContentRendererProps {
  content: string;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
}

const LineContentRenderer: React.FC<LineContentRendererProps> = ({
  content,
  furiganaMode,
  pitchDisplayMode,
  ttsRate,
}) => {
  return (
    <FormattedInlineRuby
      text={content}
      furiganaMode={furiganaMode}
      pitchDisplayMode={pitchDisplayMode}
      ttsRate={ttsRate}
    />
  );
};

// Renders the original sentence with strikethrough styling only on the parts that differ from the correction
interface OriginalSentenceDiffProps {
  original: string;
  corrected?: string;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
}

const OriginalSentenceDiff: React.FC<OriginalSentenceDiffProps> = ({
  original,
  corrected,
  furiganaMode,
  pitchDisplayMode,
  ttsRate,
}) => {
  const diffSegments = useMemo(
    () => computeCorrectionDiff(original, corrected),
    [original, corrected]
  );

  return (
    <div className="original-sentence">
      {diffSegments.map((seg, idx) => (
        <span
          key={idx}
          className={seg.isError ? 'original-diff-error' : 'original-diff-correct'}
          title={seg.isError ? '添削指出的待修正部分' : undefined}
        >
          <LineContentRenderer
            content={seg.text}
            furiganaMode={furiganaMode}
            pitchDisplayMode={pitchDisplayMode}
            ttsRate={ttsRate}
          />
        </span>
      ))}
    </div>
  );
};

// Renders the grammar correction box directly inside the message bubble
interface CorrectionBoxProps {
  correction: MessageCorrection;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
}

const CorrectionBox: React.FC<CorrectionBoxProps> = ({
  correction,
  furiganaMode,
  pitchDisplayMode,
  ttsRate,
}) => {
  return (
    <div className="correction-card">
      <div className="correction-content">
        {correction.original && (
          <div className="correction-row original-row">
            <span className="row-tag tag-warning">
              <AlertCircle size={13} />
              <span>原句</span>
            </span>
            <OriginalSentenceDiff
              original={correction.original}
              corrected={correction.corrected}
              furiganaMode={furiganaMode}
              pitchDisplayMode={pitchDisplayMode}
              ttsRate={ttsRate}
            />
          </div>
        )}

        {correction.corrected && (
          <div className="correction-row corrected-row">
            <span className="row-tag tag-success">
              <CheckCircle2 size={13} />
              <span>建议</span>
            </span>
            <div className="corrected-sentence">
              <LineContentRenderer
                content={correction.corrected}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
              />
            </div>
          </div>
        )}

        {correction.explanation && (
          <div className="correction-explanation">
            <span className="explanation-label">📝 语法解析：</span>
            <div className="explanation-text-content">
              <LineContentRenderer
                content={correction.explanation}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
              />
            </div>
          </div>
        )}

        {correction.betterExpression && (
          <div className="correction-better-expression">
            <span className="better-label">✨ 更地道的母语者表达：</span>
            <div className="better-text">
              <LineContentRenderer
                content={correction.betterExpression}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MessageItem = React.memo<MessageItemProps>(function MessageItem({
  message,
  furiganaMode,
  pitchDisplayMode,
  ttsRate = 1.0,
  aiTutorName = 'AI 老师',
  userName = '学习者',
  aiAvatar,
  userAvatar,
  onEditMessage,
  onResendMessage,
  onOpenCollectedGrammar,
  onOpenCollectedWords,
  isGenerating = false,
  deepThinkingEnabled = true,
}) {
  const isUser = message.role === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  // 深度思考面板的展开状态：思考过程中自动展开（边想边看），回答完成后自动收起（把舞台让给正文）
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  const senderTitle = isUser ? userName : aiTutorName;
  const avatarLetter = isUser
    ? getNameInitial(userName, '我')
    : getNameInitial(aiTutorName, '日');

  // 解析消息内可能嵌套的随堂语法纠错块（支持穿插在对话消息中间、末尾或由 message.correction 兜底）
  const segments = useMemo(
    () => parseMessageSegments(message.content, message.correction, isGenerating),
    [message.content, message.correction, isGenerating]
  );

  const hasAnyContent = useMemo(() => {
    return segments.some((seg) =>
      seg.type === 'text' ? seg.content.trim().length > 0 : true
    );
  }, [segments]);

  // ---------------- 深度思考（推理链）展示 ----------------
  const reasoningText = useMemo(() => {
    if (!deepThinkingEnabled || isUser) return '';
    return (message.reasoning || '').trim();
  }, [message.reasoning, deepThinkingEnabled, isUser]);

  const hasReasoning = reasoningText.length > 0;

  // 思考耗时文案：流式中显示"思考中"，结束后显示"思考 x.x 秒"
  const reasoningDurationLabel = useMemo(() => {
    if (!hasReasoning) return '';
    if (isGenerating && !message.reasoningMs) return '思考中';
    if (typeof message.reasoningMs === 'number' && message.reasoningMs > 0) {
      return `思考 ${(message.reasoningMs / 1000).toFixed(1)} 秒`;
    }
    return '';
  }, [hasReasoning, isGenerating, message.reasoningMs]);

  const prevGeneratingRef = useRef(false);
  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current;
    prevGeneratingRef.current = isGenerating;

    if (isGenerating && hasReasoning) {
      // 推理内容一到就自动展开，让用户实时看到思路演进
      setReasoningExpanded(true);
    } else if (wasGenerating && !isGenerating) {
      // 正式回答已经就绪，自动收起思考区，避免长文霸占可视区域
      setReasoningExpanded(false);
    }
  }, [isGenerating, hasReasoning]);

  // 用户消息编辑与重发操作
  const handleStartEdit = () => {
    setEditText(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditText(message.content);
    setIsEditing(false);
  };

  const handleConfirmEdit = () => {
    if (!editText.trim()) return;
    setIsEditing(false);
    if (onEditMessage) {
      onEditMessage(message.id, editText.trim());
    }
  };

  const handleResend = () => {
    if (onResendMessage) {
      onResendMessage(message.id);
    }
  };

  // 渲染文本段落的多行内容（Markdown 语法、表格、Ruby 注音与整句朗读按钮）
  const renderTextLines = (
    rawChunk: string,
    segIdx: number,
    isLastSegment: boolean
  ) => {
    const isStreamTarget = isGenerating && isLastSegment;
    const smoothedChunk = sanitizeStreamingContent(rawChunk, isStreamTarget);
    const sanitizedText = sanitizeActionDescriptions(smoothedChunk);
    const safeText = sanitizedText.replace(/\{userName\}/g, userName);
    const lines = safeText.split('\n');

    // 将单行序列转换为块级结构（将多行连续的表格聚合为 TableBlock）
    const parseBlocks = (allLines: string[]): TextBlock[] => {
      const result: TextBlock[] = [];
      const total = allLines.length;
      let i = 0;

      while (i < total) {
        const cur = allLines[i];
        const trimmed = cur.trim();

        // 检查 Markdown 表格起始：当前行包含 '|'，且下一行匹配分隔行规则
        if (
          trimmed.includes('|') &&
          i + 1 < total &&
          /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(allLines[i + 1].trim())
        ) {
          const headerLine = trimmed;
          const delimiterLine = allLines[i + 1].trim();
          const rawHeaders = splitTableCells(headerLine);
          const rawAlignments = splitTableCells(delimiterLine).map((d) => {
            const hasLeft = d.startsWith(':');
            const hasRight = d.endsWith(':');
            if (hasLeft && hasRight) return 'center';
            if (hasRight) return 'right';
            return 'left';
          });

          const rows: string[][] = [];
          let j = i + 2;
          while (j < total) {
            const rowTrimmed = allLines[j].trim();
            if (!rowTrimmed || !rowTrimmed.includes('|')) {
              break;
            }
            const cells = splitTableCells(rowTrimmed);
            while (cells.length < rawHeaders.length) {
              cells.push('');
            }
            rows.push(cells.slice(0, rawHeaders.length));
            j++;
          }

          result.push({
            type: 'table',
            key: `${segIdx}-table-${i}`,
            headers: rawHeaders,
            alignments: rawAlignments,
            rows,
            isLastBlock: j === total,
          });

          i = j;
          continue;
        }

        result.push({
          type: 'line',
          key: `${segIdx}-${i}`,
          line: cur,
          isLastBlock: i === total - 1,
        });
        i++;
      }

      return result;
    };

    const blocks = parseBlocks(lines);

    return (
      <div key={`text-${segIdx}`} className="bubble-content-text">
        {blocks.map((block) => {
          if (block.type === 'table') {
            return (
              <div key={block.key} className="bubble-line md-table-container">
                <table className="md-table">
                  <thead>
                    <tr>
                      {block.headers.map((h, hIdx) => (
                        <th key={hIdx} style={{ textAlign: block.alignments[hIdx] || 'left' }}>
                          <LineContentRenderer
                            content={h}
                            furiganaMode={furiganaMode}
                            pitchDisplayMode={pitchDisplayMode}
                            ttsRate={ttsRate}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => {
                          const isLastCell = rIdx === block.rows.length - 1 && cIdx === row.length - 1;
                          return (
                            <td key={cIdx} style={{ textAlign: block.alignments[cIdx] || 'left' }}>
                              <LineContentRenderer
                                content={cell}
                                furiganaMode={furiganaMode}
                                pitchDisplayMode={pitchDisplayMode}
                                ttsRate={ttsRate}
                              />
                              {isLastCell && block.isLastBlock && !isUser && isGenerating && isLastSegment && (
                                <span className="streaming-cursor-dot" title="AI 正在生成中..." />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          const line = block.line;
          const lineKey = block.key;
          const trimmed = line.trim();
          const isLastLine = block.isLastBlock;

          if (!trimmed) {
            return (
              <div key={lineKey} className="bubble-paragraph-spacer">
                {isLastLine && !isUser && isGenerating && isLastSegment && (
                  <span className="streaming-cursor-dot" title="AI 正在生成中..." />
                )}
              </div>
            );
          }

          // 1. 水平分割线 (---, ***, ___)
          if (/^([-*_]){3,}\s*$/.test(trimmed)) {
            return (
              <div key={lineKey} className="bubble-line md-divider-container">
                <hr className="md-divider" />
                {isLastLine && !isUser && isGenerating && isLastSegment && (
                  <span className="streaming-cursor-dot" title="AI 正在生成中..." />
                )}
              </div>
            );
          }

          // 2. Markdown 标题 (# ~ ######)
          const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
          if (headerMatch) {
            const headerLevel = headerMatch[1].length;
            const headerContent = headerMatch[2];
            const hasRubyInLine = /\[.+?\]/.test(headerContent);
            const headingClassLevel = headerLevel <= 2 ? headerLevel : (headerLevel === 3 ? 3 : 4);

            return (
              <div
                key={lineKey}
                className={`bubble-line md-heading md-heading-${headingClassLevel} ${
                  hasRubyInLine ? 'has-ruby-annotation' : ''
                }`}
              >
                <span className="line-content-inline">
                  <LineContentRenderer
                    content={headerContent}
                    furiganaMode={furiganaMode}
                    pitchDisplayMode={pitchDisplayMode}
                    ttsRate={ttsRate}
                  />
                  {isLastLine && !isUser && isGenerating && isLastSegment && (
                    <span className="streaming-cursor-dot" title="AI 正在生成中..." />
                  )}
                </span>
              </div>
            );
          }

          // 3. Markdown 引用块 (> ...)
          const quoteMatch = trimmed.match(/^>\s*(.*)$/);
          if (quoteMatch) {
            const quoteContent = quoteMatch[1];
            const hasRubyInLine = /\[.+?\]/.test(quoteContent);

            return (
              <div
                key={lineKey}
                className={`bubble-line md-blockquote ${hasRubyInLine ? 'has-ruby-annotation' : ''}`}
              >
                <span className="line-content-inline">
                  <LineContentRenderer
                    content={quoteContent}
                    furiganaMode={furiganaMode}
                    pitchDisplayMode={pitchDisplayMode}
                    ttsRate={ttsRate}
                  />
                  {isLastLine && !isUser && isGenerating && isLastSegment && (
                    <span className="streaming-cursor-dot" title="AI 正在生成中..." />
                  )}
                </span>
              </div>
            );
          }

          // 4. 无序列表项 (・, -, *, +)
          const isBullet =
            trimmed.startsWith('・') ||
            trimmed.startsWith('- ') ||
            trimmed.startsWith('+ ') ||
            (trimmed.startsWith('* ') && !trimmed.startsWith('**'));
          const bulletContent = isBullet ? trimmed.replace(/^([・\-+]|(\*\s+))\s*/, '') : trimmed;

          // 5. 有序列表项 (1. 或 **1.** 等，精准防止撕裂双星号加粗标题)
          const numMatch = bulletContent.match(/^(?:\*\*(\d+)\.\*\*\s*|(\d+)\.\s+)(.*)$/);
          const isNumbered = !isBullet && !!numMatch;
          const numPrefix = isNumbered ? (numMatch[1] || numMatch[2]) : '';
          const lineContent = isNumbered ? numMatch[3] : (isBullet ? bulletContent : line);

          const hasRubyInLine = /\[.+?\]/.test(lineContent);

          return (
            <div
              key={lineKey}
              className={`bubble-line ${isBullet ? 'bullet-item' : ''} ${
                isNumbered ? 'numbered-item' : ''
              } ${hasRubyInLine ? 'has-ruby-annotation' : ''}`}
            >
              {isBullet && <span className="bullet-dot">•</span>}
              {isNumbered && <span className="numbered-prefix">{numPrefix}.</span>}

              <span className="line-content-inline">
                <LineContentRenderer
                  content={lineContent}
                  furiganaMode={furiganaMode}
                  pitchDisplayMode={pitchDisplayMode}
                  ttsRate={ttsRate}
                />

                {isLastLine && !isUser && isGenerating && isLastSegment && (
                  <span className="streaming-cursor-dot" title="AI 正在生成中..." />
                )}
              </span>
            </div>
          );
        })}
        {lines.length === 0 && !isUser && isGenerating && isLastSegment && (
          <span className="streaming-cursor-dot" title="AI 正在重新生成中..." />
        )}
      </div>
    );
  };

  // 本轮语法自动收录提示：仅当本轮有“新收录”的句型时提示，对于已收录过的复现不再重复提示
  const collectedGrammarHint = useMemo(() => {
    const list = message.collectedGrammar;
    if (!list || list.length === 0) return null;

    const fresh = list.filter((g) => g.isNew);
    if (fresh.length === 0) return null;

    const focus = fresh.slice(0, 2);
    const titles = focus.map((g) => g.title).join('、');
    const suffix = fresh.length > focus.length ? ` 等 ${fresh.length} 项` : '';
    return {
      hasNew: true,
      text: `已收录新语法：${titles}${suffix}`,
      targetTitle: fresh[0]?.title,
    };
  }, [message.collectedGrammar]);

  // 本轮新单词自动收录提示：只挂"首次进入生词本"的词（已学词复现属日常复习，不提示），最多列两项
  const collectedWordHint = useMemo(() => {
    const list = message.collectedWords;
    if (!list || list.length === 0) return null;

    const focus = list.slice(0, 2);
    const labels = focus
      .map((w) => (w.reading ? `${w.surface}（${w.reading}）` : w.surface))
      .join('、');
    const suffix = list.length > focus.length ? ` 等 ${list.length} 个` : '';
    return {
      text: `已收录新单词：${labels}${suffix}`,
      targetSurface: list[0]?.surface,
    };
  }, [message.collectedWords]);

  return (
    <div
      className={`message-item-wrapper ${isUser ? 'user-side' : 'assistant-side'}`}
      data-message-id={message.id}
    >
      <div className="message-avatar-meta-row">
        <div className={`message-avatar-box avatar-circle ${isUser ? 'user-avatar' : 'ai-avatar'}`}>
          {isUser ? (
            userAvatar ? (
              <img src={userAvatar} alt={userName} className="avatar-img" />
            ) : (
              <span className="avatar-letter">{avatarLetter}</span>
            )
          ) : (
            aiAvatar ? (
              <img src={aiAvatar} alt={aiTutorName} className="avatar-img" />
            ) : (
              <span className="avatar-jp-char">{avatarLetter}</span>
            )
          )}
        </div>

        <div className="message-header-meta">
          <span className="sender-name">
            <NameWithRuby text={senderTitle} />
          </span>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="message-body">
        {/* 深度思考（推理链）面板：只有确实收到推理内容时才出现；关闭深度思考时完全不渲染 */}
        {!isUser && hasReasoning && (
          <div
            className={`deep-thinking-panel ${reasoningExpanded ? 'is-open' : ''} ${isGenerating ? 'is-live' : ''}`}
          >
            <button
              type="button"
              className="deep-thinking-head"
              onClick={() => setReasoningExpanded((v) => !v)}
              title={reasoningExpanded ? '收起思考过程' : '展开查看完整思考过程'}
            >
              <Brain size={13} className="deep-thinking-icon" />
              <span className="deep-thinking-title">深度思考</span>
              {reasoningDurationLabel && (
                <span className="deep-thinking-duration">{reasoningDurationLabel}</span>
              )}
              <span className="deep-thinking-toggle">{reasoningExpanded ? '收起' : '展开'}</span>
              <ChevronDown
                size={13}
                className={`deep-thinking-chevron ${reasoningExpanded ? 'is-open' : ''}`}
              />
            </button>
            {reasoningExpanded && <div className="deep-thinking-body">{reasoningText}</div>}
          </div>
        )}
        <div className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'} ${!isUser && isGenerating && !hasAnyContent ? 'bubble-loading' : ''}`}>
          {!isUser && isGenerating && !hasAnyContent ? (
            <div className="typing-dots-container">
              <div className="typing-dots">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
              <span className="typing-text">{aiTutorName} 正在输入...</span>
            </div>
          ) : isUser && isEditing ? (
            <div className="user-message-edit-box">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleConfirmEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelEdit();
                  }
                }}
                className="user-message-edit-input"
                rows={Math.min(8, Math.max(3, editText.split('\n').length + 1))}
                placeholder="编辑消息内容 (Enter 发送, Esc 取消)..."
                autoFocus
              />
              <div className="user-message-edit-actions">
                <button
                  type="button"
                  className="edit-action-btn edit-btn-cancel"
                  onClick={handleCancelEdit}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="edit-action-btn edit-btn-confirm"
                  onClick={handleConfirmEdit}
                  disabled={!editText.trim()}
                >
                  保存并重发
                </button>
              </div>
            </div>
          ) : (
            <>
              {segments.map((seg, segIdx) => {
                const isLastSegment = segIdx === segments.length - 1;
                if (seg.type === 'correction') {
                  return (
                    <React.Fragment key={`correction-${segIdx}`}>
                      <CorrectionBox
                        correction={seg.data}
                        furiganaMode={furiganaMode}
                        pitchDisplayMode={pitchDisplayMode}
                        ttsRate={ttsRate}
                      />
                      {!isUser && isGenerating && isLastSegment && (
                        <span className="streaming-cursor-dot" title="AI 正在重新生成中..." />
                      )}
                    </React.Fragment>
                  );
                }

                return renderTextLines(seg.content, segIdx, isLastSegment);
              })}

              {/* 用户发出的文本框按钮：改为“编辑”和“重发”以方便使用 */}
              {isUser && (
                <div className="message-bubble-actions user-actions">
                  <button
                    type="button"
                    className="bubble-action-btn"
                    onClick={handleStartEdit}
                    title="编辑此条消息"
                  >
                    <Pencil size={12} />
                    <span>编辑</span>
                  </button>
                  <button
                    type="button"
                    className="bubble-action-btn"
                    onClick={handleResend}
                    title="重新发送此条消息"
                  >
                    <RotateCcw size={12} />
                    <span>重发</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 语法自动收录提示：轻量不打扰，点击直达学情档案「句型语法」页 */}
        {!isUser && !isGenerating && collectedGrammarHint && (
          <button
            type="button"
            className={`grammar-collected-hint ${collectedGrammarHint.hasNew ? 'is-new' : ''}`}
            onClick={() => onOpenCollectedGrammar?.(collectedGrammarHint.targetTitle)}
            title="前往「学情档案 · 句型语法」查看完整接续、释义与例句"
          >
            <Layers size={12} />
            <span className="grammar-collected-hint-text">{collectedGrammarHint.text}</span>
            <span className="grammar-collected-hint-link">查看</span>
          </button>
        )}

        {/* 新单词自动收录提示：仅首次入档的词才出现，点击直达学情档案「生词本」页 */}
        {!isUser && !isGenerating && collectedWordHint && (
          <button
            type="button"
            className="word-collected-hint is-new"
            onClick={() => onOpenCollectedWords?.(collectedWordHint.targetSurface)}
            title="前往「学情档案 · 生词本」查看读音、释义与例句"
          >
            <BookOpen size={12} />
            <span className="word-collected-hint-text">{collectedWordHint.text}</span>
            <span className="word-collected-hint-link">查看</span>
          </button>
        )}
      </div>
    </div>
  );
});
