import React, { useState, useMemo } from 'react';
import { ChatMessage, FuriganaMode, PitchDisplayMode, MessageCorrection } from '../../types';
import { RubyText } from './RubyText';
import { parseMessageSegments, stripRubyForTTS, normalizeJapaneseMarkdownTags } from '../../utils/rubyParser';
import { sanitizeStreamingContent } from '../../utils/streamingSanitizer';
import { getNameInitial, NameWithRuby } from '../../utils/nameRubyHelper';
import { computeCorrectionDiff } from '../../utils/diffHelper';
import { isJapaneseSentence, extractJapaneseSpeakableText, sanitizeActionDescriptions } from '../../utils/languageDetector';
import { Volume2, CheckCircle2, AlertCircle, Pencil, RotateCcw, Layers, BookOpen } from 'lucide-react';
import { speechService } from '../../services/speechService';

interface MessageItemProps {
  message: ChatMessage;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
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
 * 嵌套平衡括号扫描器：精准支持多层全角（）与半角()圆括号嵌套，
 * 遇到括号内嵌套括号（如（说明（细节）继续）或（例：「雨」(あめ)））时，
 * 绝不会因为内部闭括号而提前截断，完整保持灰显范围。
 */
function parseParenthesisSegments(text: string): ParenSegment[] {
  if (!text) return [];

  const isInsideJapaneseTag = (str: string, index: number): boolean => {
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
  };

  const segments: ParenSegment[] = [];
  const len = text.length;
  let lastIndex = 0;
  let i = 0;

  while (i < len) {
    const char = text[i];
    // 寻找最外层开括号（且确保不在 <j> 标签内部，防止撕裂日文标签）
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
        // 如果此前有普通文本
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
        // 未找到配对闭括号，开括号视为普通文本，继续后移
        i++;
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

const ParenthesisRuby: React.FC<ParenthesisRubyProps> = ({
  text,
  furiganaMode,
  pitchDisplayMode,
  ttsRate,
}) => {
  if (!text) return null;

  const segments = parseParenthesisSegments(text);

  return (
    <>
      {segments.map((seg, index) => {
        if (seg.type === 'plain') {
          return (
            <RubyText
              key={`plain-${index}`}
              content={seg.content}
              furiganaMode={furiganaMode}
              pitchDisplayMode={pitchDisplayMode}
              ttsRate={ttsRate}
            />
          );
        }

        // 括号及括号内文字灰显渲染，但内部词汇与划词查询过的内容保留虚线和点击即看功能
        return (
          <span key={`paren-${index}`} className="parenthesis-text roleplay-action-text">
            {seg.openParen}
            <RubyText
              content={seg.inner || ''}
              furiganaMode={furiganaMode}
              pitchDisplayMode={pitchDisplayMode}
              ttsRate={ttsRate}
              interactive={true}
            />
            {seg.closeParen}
          </span>
        );
      })}
    </>
  );
};

// Inline Markdown & Ruby Renderer:
// Converts ***bold italic***, **bold**, *italic*, ~~strikethrough~~, `code` into HTML elements
// while seamlessly preserving Ruby annotations and Japanese parenthesis dimming inside
interface MarkdownRubyProps {
  text: string;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
}

const MarkdownRuby: React.FC<MarkdownRubyProps> = ({
  text,
  furiganaMode,
  pitchDisplayMode,
  ttsRate,
}) => {
  if (!text) return null;

  // 1. 规范化处理：
  // 1.0 规范化日文标签与行内 Markdown 的嵌套关系，防止标签被 Markdown 切分撕裂，
  // 将 <jp>AAA**BBB**CCC</jp> 转化为 <jp>AAA</jp>**<jp>BBB</jp>**<jp>CCC</jp>
  let normalized = normalizeJapaneseMarkdownTags(text);

  // 1.1 假名注音紧贴粗体外侧时吸收入内，并自动去除多余的声调代码（如 |0、|1）：**词汇**[读音] -> **词汇[读音]**
  normalized = normalized.replace(
    /\*\*([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\*\*\[([ぁ-んァ-ヶー]+)(?:\|\d+)?\]/g,
    (_m, word, reading) => {
      return `**${word}[${reading}]**`;
    }
  );

  normalized = normalized.replace(
    /\*([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\*\[([ぁ-んァ-ヶー]+)(?:\|\d+)?\]/g,
    (_m, word, reading) => {
      return `*${word}[${reading}]*`;
    }
  );

  // 1.2 容错单边未闭合的星号（例如某行只有奇数个 ** 时，在行尾自动成对闭合，杜绝裸露的 ** 显示）
  const boldTokens = normalized.match(/\*\*/g);
  if (boldTokens && boldTokens.length % 2 !== 0) {
    normalized += '**';
  }

  // 2. 正则匹配行内 Markdown 语法元素：
  // 优先级：***粗斜体*** -> **粗体** -> *斜体* -> ~~删除线~~ -> `代码`
  const mdRegex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[^\*\n]+?\*|~~[\s\S]+?~~|`[^`\n]+?`)/g;
  const parts = normalized.split(mdRegex);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;

        // 粗斜体 ***text***
        if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
          const inner = part.slice(3, -3);
          return (
            <strong key={index} className="md-bold-text">
              <em className="md-italic-text">
                <ParenthesisRuby
                  text={inner}
                  furiganaMode={furiganaMode}
                  pitchDisplayMode={pitchDisplayMode}
                  ttsRate={ttsRate}
                />
              </em>
            </strong>
          );
        }

        // 粗体 **text**
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          const inner = part.slice(2, -2);
          return (
            <strong key={index} className="md-bold-text">
              <ParenthesisRuby
                text={inner}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
              />
            </strong>
          );
        }

        // 斜体 *text*
        if (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**')) {
          const inner = part.slice(1, -1);
          return (
            <em key={index} className="md-italic-text">
              <ParenthesisRuby
                text={inner}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
              />
            </em>
          );
        }

        // 删除线 ~~text~~
        if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
          const inner = part.slice(2, -2);
          return (
            <s key={index} className="md-strikethrough-text">
              <ParenthesisRuby
                text={inner}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
              />
            </s>
          );
        }

        // 行内代码 `code`
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          const inner = part.slice(1, -1);
          return (
            <span key={index} className="md-inline-code">
              <ParenthesisRuby
                text={inner}
                furiganaMode={furiganaMode}
                pitchDisplayMode={pitchDisplayMode}
                ttsRate={ttsRate}
              />
            </span>
          );
        }

        // 普通文本段（调用 ParenthesisRuby 变灰括号文本并挂载日文注音）
        return (
          <ParenthesisRuby
            key={index}
            text={part}
            furiganaMode={furiganaMode}
            pitchDisplayMode={pitchDisplayMode}
            ttsRate={ttsRate}
          />
        );
      })}
    </>
  );
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
    <MarkdownRuby
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
  ttsRate,
  aiTutorName = 'AI 私教',
  userName = '学习者',
  aiAvatar,
  userAvatar,
  onEditMessage,
  onResendMessage,
  onOpenCollectedGrammar,
  onOpenCollectedWords,
  isGenerating = false,
}) {
  const isUser = message.role === 'user';
  const [playingLineKey, setPlayingLineKey] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

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

  // Speak single sentence/line (extracts pure Japanese without Chinese translation in brackets)
  const handleSpeakSentence = (sentenceText: string, key: string) => {
    if (playingLineKey === key) {
      speechService.stop();
      setPlayingLineKey(null);
      return;
    }

    const speakable = extractJapaneseSpeakableText(sentenceText);
    if (!speakable) return;

    speechService.speak(
      speakable,
      ttsRate,
      undefined,
      () => setPlayingLineKey(key),
      () => setPlayingLineKey(null),
      () => setPlayingLineKey(null)
    );
  };

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

  // 渲染文本段落的多行内容（Markdown 语法、Ruby 注音与整句朗读按钮）
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

    return (
      <div key={`text-${segIdx}`} className="bubble-content-text">
        {lines.map((line, idx) => {
          const lineKey = `${segIdx}-${idx}`;
          const trimmed = line.trim();
          const isLastLine = idx === lines.length - 1;

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
            const isJpSentence = isJapaneseSentence(headerContent);
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
                  {!isUser && isJpSentence && (
                    <button
                      type="button"
                      className={`sentence-speak-inline-btn ${playingLineKey === lineKey ? 'playing' : ''}`}
                      onClick={() => handleSpeakSentence(headerContent, lineKey)}
                      title={playingLineKey === lineKey ? '停止朗读此句' : '朗读此句'}
                    >
                      <Volume2 size={12} />
                    </button>
                  )}
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
            const isJpSentence = isJapaneseSentence(quoteContent);
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
                  {!isUser && isJpSentence && (
                    <button
                      type="button"
                      className={`sentence-speak-inline-btn ${playingLineKey === lineKey ? 'playing' : ''}`}
                      onClick={() => handleSpeakSentence(quoteContent, lineKey)}
                      title={playingLineKey === lineKey ? '停止朗读此句' : '朗读此句'}
                    >
                      <Volume2 size={12} />
                    </button>
                  )}
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

          // 5. 有序列表项 (1. 或 **1.** 等)
          const numMatch = bulletContent.match(/^(?:\*\*(\d+)\.\*\*|\*\*(\d+)\.\s*\*|(\d+)\.)\s*(.*)$/);
          const isNumbered = !isBullet && !!numMatch;
          const numPrefix = isNumbered ? (numMatch[1] || numMatch[2] || numMatch[3]) : '';
          const lineContent = isNumbered ? numMatch[4] : (isBullet ? bulletContent : line);

          // Only show sentence-level audio button on lines whose primary language is actually Japanese
          const isJpSentence = isJapaneseSentence(lineContent);
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

                {/* Single sentence audio player button placed directly at the end of genuine Japanese sentences */}
                {!isUser && isJpSentence && (
                  <button
                    type="button"
                    className={`sentence-speak-inline-btn ${playingLineKey === lineKey ? 'playing' : ''}`}
                    onClick={() => handleSpeakSentence(lineContent, lineKey)}
                    title={playingLineKey === lineKey ? '停止朗读此句' : '朗读此句'}
                  >
                    <Volume2 size={12} />
                  </button>
                )}
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
