import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check } from 'lucide-react';
import { WordDictionaryPopover } from '../components/Chat/WordDictionaryPopover';
import { LearnedWord, FavoriteExpression } from '../types';
import { dictionaryService } from '../services/dictionaryService';

/**
 * 划词查询允许的最大字符数。
 * 旧实现的 30 字硬上限导致「选中整句/长句」时悬浮按钮根本不出现，
 * 这里放宽到 300 字，既覆盖整句与短段落，又避免误选整篇长文导致超长提示词。
 */
export const MAX_SELECTION_LOOKUP_LENGTH = 300;

export interface OpenDictionaryParams {
  word: string;
  reading?: string;
  anchorRect: DOMRect;
  anchorEl?: HTMLElement;
  lineEl?: HTMLElement | null;
  bubbleEl?: HTMLElement | null;
  offsetInLine?: { left: number; top: number; width: number; height: number } | null;
  offsetInBubble?: { left: number; top: number; width: number; height: number } | null;
  isFromJTag?: boolean;
  sentenceContext?: string;
  /** 划词瞬间的选区 Range，用于在浮窗关闭后继续在对话区精确定位"正在翻译"的文本 */
  selectionRange?: Range | null;
}

/** 发起一次 AI 查询时的定位与上下文信息 */
export interface PendingLookupRequest {
  text: string;
  rect: DOMRect;
  reading?: string;
  isFromJTag?: boolean;
  sentenceContext?: string;
  selectionRange?: Range | null;
  anchorEl?: HTMLElement;
  lineEl?: HTMLElement | null;
  bubbleEl?: HTMLElement | null;
  offsetInLine?: { left: number; top: number; width: number; height: number } | null;
  offsetInBubble?: { left: number; top: number; width: number; height: number } | null;
  scrollContainer?: HTMLElement | null;
  offsetInAnchor?: { left: number; top: number; width: number; height: number } | null;
  initialScrollTop?: number;
  initialScrollLeft?: number;
}

/** 对话区内联查询状态：loading = 正在翻译（转圈）；ready = 已翻译完成，可点击查看 */
export interface PendingLookup extends PendingLookupRequest {
  id: string;
  status: 'loading' | 'ready';
  createdAt: number;
}

interface DictionaryContextType {
  openDictionary: (params: OpenDictionaryParams) => void;
  closeDictionary: () => void;
  /** 登记一次 AI 查询（返回可用的追踪 id） */
  beginLookup: (params: PendingLookupRequest) => string;
  /** 标记该次 AI 查询结束（success=false 表示未拿到结果，直接撤掉提示而不是谎报"翻译完成"） */
  endLookup: (id: string, success?: boolean) => void;
  isOpen: boolean;
  activeWord?: string;
  learnedWords?: LearnedWord[];
  furiganaHideMastered?: boolean;
  /** 日文区划选查询过的词条集合（用于日文 <jp> 内部渲染虚线） */
  queriedTerms: Set<string>;
  /** 中文普通文本中用户手动划选查询过的词条集合（非 <jp> 普通文本专用） */
  queriedChineseTerms: Set<string>;
  addQueriedTerm: (term: string, isFromJTag?: boolean) => void;
}

const DictionaryContext = createContext<DictionaryContextType | null>(null);

/**
 * 寻找最适合承载特效的相对定位容器（优先为聊天消息列表 .messages-list）。
 * 当特效作为 .messages-list 的 position: absolute 子节点时，
 * 其与消息文本处于同一个 GPU 合成滚动图层中，随用户滚动 100% 硬件同步位移，
 * 彻底杜绝主线程事件异步传递导致的任何“跟随时迟滞/延迟”现象。
 */
function getLookupHost(lookup: PendingLookup): HTMLElement {
  // 核心稳定性：消息列表容器是所有聊天气泡在当前页面的统一绝对定位标尺。
  // 无论 anchorEl 处于何种重绘状态，只要 .messages-list 存在，始终固定作为宿主，
  // 彻底杜绝 host 在不同 render 帧之间在 document.body 与 .messages-list 间漂移切换导致的严重横向错位。
  const defaultList = document.querySelector('.messages-list');
  if (defaultList) return defaultList as HTMLElement;
  if (lookup.anchorEl && lookup.anchorEl.isConnected) {
    const list = lookup.anchorEl.closest('.messages-list');
    if (list) return list as HTMLElement;
    const chatContainer = lookup.anchorEl.closest('.chat-container-main');
    if (chatContainer) return chatContainer as HTMLElement;
  }
  if (lookup.selectionRange && lookup.selectionRange.startContainer?.isConnected) {
    const container = lookup.selectionRange.commonAncestorContainer;
    const el = container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;
    const list = el?.closest('.messages-list');
    if (list) return list as HTMLElement;
    const chatContainer = el?.closest('.chat-container-main');
    if (chatContainer) return chatContainer as HTMLElement;
  }
  return document.body;
}

interface HostBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 获取 Range 的高精度真实排版坐标。
 * 核心优化：过滤掉注音假名 <rt> 标签可能带来的向左/向右悬挂溢出（Overhang），
 * 并防御跨行断词导致 minLeft 坍缩到行首，确保矩形紧贴目标文本本体。
 */
function getPreciseRangeRect(range: Range): DOMRect | null {
  try {
    const clientRects = Array.from(range.getClientRects()).filter(
      (r) => r.width >= 1 && r.height >= 2
    );
    if (clientRects.length === 0) {
      const r = range.getBoundingClientRect();
      return r && (r.width > 0 || r.height > 0) ? r : null;
    }

    if (clientRects.length === 1) {
      return clientRects[0];
    }

    // 检查祖先容器中是否存在 ruby 标签
    const commonAncestor = range.commonAncestorContainer;
    const hostEl =
      commonAncestor.nodeType === Node.ELEMENT_NODE
        ? (commonAncestor as HTMLElement)
        : commonAncestor.parentElement;

    const rtEls = hostEl ? Array.from(hostEl.querySelectorAll('rt')) : [];
    const rubyEl = hostEl?.closest('ruby') || hostEl?.querySelector('ruby');
    if (rubyEl) {
      rubyEl.querySelectorAll('rt').forEach((rt) => {
        if (!rtEls.includes(rt)) rtEls.push(rt);
      });
    }

    let filteredRects = clientRects;
    if (rtEls.length > 0) {
      const rtRects = rtEls
        .map((rt) => rt.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);

      // 过滤掉高度较小、位于上方注音位置的 <rt> 节点矩形
      const baseRects = clientRects.filter((r) => {
        return !rtRects.some(
          (rtR) =>
            Math.abs(r.top - rtR.top) < 6 &&
            Math.abs(r.height - rtR.height) < 6
        );
      });

      if (baseRects.length > 0) {
        filteredRects = baseRects;
      }
    }

    if (filteredRects.length === 1) {
      return filteredRects[0];
    }

    // 防护跨行断词导致 minLeft 坍缩到行首：
    // 在同一直线水平行内，矩形的 top 差值通常在 8px 以内。
    // 如果存在跨行矩形，优先取与选区起点（或主文本）同行的矩形，杜绝跨行取 minLeft 导致向左严重偏斜
    const primaryTop = filteredRects[0].top;
    const sameLineRects = filteredRects.filter((r) => Math.abs(r.top - primaryTop) < 8);
    const targetRects = sameLineRects.length > 0 ? sameLineRects : filteredRects;

    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    for (const r of targetRects) {
      if (r.left < minLeft) minLeft = r.left;
      if (r.top < minTop) minTop = r.top;
      if (r.right > maxRight) maxRight = r.right;
      if (r.bottom > maxBottom) maxBottom = r.bottom;
    }

    if (minLeft < Infinity && minTop < Infinity && maxRight > minLeft) {
      return new DOMRect(minLeft, minTop, maxRight - minLeft, maxBottom - minTop);
    }

    return range.getBoundingClientRect();
  } catch {
    return null;
  }
}

/**
 * 将 Range 的端点规范化映射到真实的 TEXT_NODE 节点上。
 * 在 Chromium/Edge 中，当用户划选跨越 span 或从空白边界起选时，
 * range.startContainer 极易被赋予外层 ELEMENT_NODE（例如 .bubble-line 或 .ruby-text-container），
 * 此时 range.getClientRects() 会异常返回该父级外层元素的 bounding box（left 从行首 0 开始），
 * 从而导致特效严重偏向行首最左侧。将其规范化至具体文本节点后彻底消除该浏览器层面的 Bug。
 */
function normalizeRangeToTextNodes(range: Range): Range {
  let startContainer = range.startContainer;
  let startOffset = range.startOffset;
  let endContainer = range.endContainer;
  let endOffset = range.endOffset;

  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    const el = startContainer as HTMLElement;
    if (startOffset < el.childNodes.length) {
      const child = el.childNodes[startOffset];
      if (child.nodeType === Node.TEXT_NODE) {
        startContainer = child;
        startOffset = 0;
      } else {
        const textWalker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
        const firstText = textWalker.nextNode();
        if (firstText) {
          startContainer = firstText;
          startOffset = 0;
        }
      }
    }
  }

  if (endContainer.nodeType === Node.ELEMENT_NODE) {
    const el = endContainer as HTMLElement;
    const childIndex = Math.max(0, endOffset - 1);
    if (childIndex < el.childNodes.length) {
      const child = el.childNodes[childIndex];
      if (child.nodeType === Node.TEXT_NODE) {
        endContainer = child;
        endOffset = (child as Text).length;
      } else {
        const textWalker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
        let lastText: Node | null = null;
        let curr: Node | null;
        while ((curr = textWalker.nextNode())) {
          lastText = curr;
        }
        if (lastText) {
          endContainer = lastText;
          endOffset = (lastText as Text).length;
        }
      }
    }
  }

  try {
    const normalized = document.createRange();
    normalized.setStart(startContainer, startOffset);
    normalized.setEnd(endContainer, endOffset);
    return normalized;
  } catch {
    return range;
  }
}

/**
 * 裁剪 Range 边缘的空格、全角空格及括号/引号，使选区边界精准紧贴词汇本体
 */
function trimRangeToCleanText(
  range: Range,
  rawText: string
): { trimmedRange: Range; cleanText: string } {
  const leadingMatch = rawText.match(/^[ \t\r\n\u3000()（）「」『』【】《》〈〉〔〕\[\]""''“”‘’]+/);
  const trailingMatch = rawText.match(/[ \t\r\n\u3000()（）「」『』【】《》〈〉〔〕\[\]""''“”‘’]+$/);

  const leadingLen = leadingMatch ? leadingMatch[0].length : 0;
  const trailingLen = trailingMatch ? trailingMatch[0].length : 0;

  const cleanText = rawText
    .replace(/^[ \t\r\n\u3000()（）「」『』【】《》〈〉〔〕\[\]""''“”‘’]+/, '')
    .replace(/[ \t\r\n\u3000()（）「」『』【】《》〈〉〔〕\[\]""''“”‘’]+$/, '')
    .trim();

  if (leadingLen === 0 && trailingLen === 0) {
    return { trimmedRange: range, cleanText: rawText.trim() };
  }

  if (!cleanText) {
    return { trimmedRange: range, cleanText: rawText.trim() };
  }

  try {
    const cloned = range.cloneRange();
    if (leadingLen > 0 && cloned.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = cloned.startContainer as Text;
      const targetOffset = cloned.startOffset + leadingLen;
      if (targetOffset <= textNode.length) {
        cloned.setStart(textNode, targetOffset);
      }
    }
    if (trailingLen > 0 && cloned.endContainer.nodeType === Node.TEXT_NODE) {
      const textNode = cloned.endContainer as Text;
      const targetOffset = cloned.endOffset - trailingLen;
      if (targetOffset >= 0) {
        cloned.setEnd(textNode, targetOffset);
      }
    }
    return { trimmedRange: cloned, cleanText };
  } catch {
    return { trimmedRange: range, cleanText };
  }
}

/**
 * 当 DOM 重新渲染导致原始 Range/anchorEl 断开时，在发起该次查询的具体消息气泡（或列表中）实时寻找最新 DOM 节点
 */
function findLiveElementForText(
  host: HTMLElement,
  text: string,
  preferredScope?: HTMLElement | null
): HTMLElement | null {
  if (!host || !text) return null;
  const clean = text.replace(/^[（(「『【《〈〔\[]+|[）)」』】》〉〕\]]+$/g, '').trim();
  if (!clean) return null;
  const cleanNorm = clean.replace(/\s+/g, '');

  // 1. 最高优先级：在指定的作用域容器（用户发起划词查询的具体消息气泡）内寻找，绝不跨越到历史早先消息中引起严重横向错位
  const searchContainers = preferredScope && preferredScope.isConnected ? [preferredScope] : [host];

  for (const container of searchContainers) {
    const words = container.querySelectorAll<HTMLElement>(
      '.clickable-word, .plain-dict-word, .plain-kana-word, .ruby-word-unit, ruby, .ruby-base-surface'
    );

    for (let i = 0; i < words.length; i++) {
      const el = words[i];
      if (el.tagName.toLowerCase() === 'rt') continue;
      const elText = (el.innerText || el.textContent || '').replace(/\s+/g, '').trim();
      if (elText === cleanNorm) {
        return el;
      }
    }

    for (let i = 0; i < words.length; i++) {
      const el = words[i];
      const base = el.querySelector<HTMLElement>('.ruby-base-surface');
      if (base) {
        const baseText = (base.innerText || base.textContent || '').replace(/\s+/g, '').trim();
        if (baseText === cleanNorm) {
          return el;
        }
      }
    }

    const spans = container.querySelectorAll<HTMLElement>(
      '.roleplay-action-text span, .parenthesis-text span, .bubble-text span'
    );
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i];
      if (el.children.length > 2) continue;
      const elText = (el.innerText || el.textContent || '').replace(/\s+/g, '').trim();
      if (elText === cleanNorm) {
        return el;
      }
    }
  }

  return null;
}

function measureLookupInHost(lookup: PendingLookup, host: HTMLElement): HostBox | null {
  if (!host || !host.isConnected) return null;
  const hostRect = host.getBoundingClientRect();

  let textRect: DOMRect | null = null;

  // 计算行级或气泡级的基准预期视口坐标，用于防范 Range 坍塌到行首
  let expectedLeft: number | null = null;
  if (lookup.lineEl && lookup.lineEl.isConnected && lookup.offsetInLine) {
    try {
      const lr = lookup.lineEl.getBoundingClientRect();
      expectedLeft = lr.left + lookup.offsetInLine.left;
    } catch {}
  } else if (lookup.bubbleEl && lookup.bubbleEl.isConnected && lookup.offsetInBubble) {
    try {
      const br = lookup.bubbleEl.getBoundingClientRect();
      expectedLeft = br.left + lookup.offsetInBubble.left;
    } catch {}
  }

  // 1. 优先使用 Range 测量字符级精确坐标（过滤注音假名 overhang 及跨行偏斜）
  if (lookup.selectionRange && lookup.selectionRange.startContainer && lookup.selectionRange.startContainer.isConnected) {
    try {
      const r = getPreciseRangeRect(lookup.selectionRange);
      if (r && (r.width > 0 || r.height > 0)) {
        // 核心校验：如果期望坐标存在，且 r.left 与期望坐标相差超过 18px，
        // 说明触发了浏览器将 Range 端点置于外层行容器而导致的行首坍塌，果断放弃错误的 r
        if (expectedLeft === null || Math.abs(r.left - expectedLeft) <= 18) {
          textRect = r;
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. 核心锚定：利用行容器 (.bubble-line) 的稳定相对偏移量
  // 无论文本是否因注音更新而重新渲染，行元素始终随滚动硬件同步位移，文本相对行左缘的距离永不改变！
  if (!textRect && lookup.lineEl && lookup.lineEl.isConnected && lookup.offsetInLine) {
    try {
      const lr = lookup.lineEl.getBoundingClientRect();
      if (lr.width > 0 || lr.height > 0) {
        textRect = new DOMRect(
          lr.left + lookup.offsetInLine.left,
          lr.top + lookup.offsetInLine.top,
          lookup.offsetInLine.width,
          lookup.offsetInLine.height
        );
      }
    } catch {
      // ignore
    }
  }

  // 3. 气泡级锚定：利用消息气泡 (.message-bubble) 的相对偏移量
  if (!textRect && lookup.bubbleEl && lookup.bubbleEl.isConnected && lookup.offsetInBubble) {
    try {
      const br = lookup.bubbleEl.getBoundingClientRect();
      if (br.width > 0 || br.height > 0) {
        textRect = new DOMRect(
          br.left + lookup.offsetInBubble.left,
          br.top + lookup.offsetInBubble.top,
          lookup.offsetInBubble.width,
          lookup.offsetInBubble.height
        );
      }
    } catch {
      // ignore
    }
  }

  // 4. 若 Range 断开，在当前气泡作用域内实时定位最新渲染的 DOM 元素
  if (!textRect && host && host.isConnected) {
    const scopeEl = (lookup.bubbleEl?.isConnected
      ? lookup.bubbleEl
      : lookup.anchorEl?.closest('.message-bubble') ||
        lookup.anchorEl?.closest('.message-item-wrapper')) as HTMLElement | null;
    const liveEl = findLiveElementForText(host, lookup.text, scopeEl);
    if (liveEl && liveEl.isConnected) {
      try {
        const r = liveEl.getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0)) {
          if (expectedLeft === null || Math.abs(r.left - expectedLeft) <= 18) {
            textRect = r;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 5. 锚定元素相对偏移（绝不回退为整个 anchorEl 矩形，防止将整行当作文本）
  if (!textRect && lookup.anchorEl && lookup.anchorEl.isConnected && lookup.offsetInAnchor) {
    try {
      const elRect = lookup.anchorEl.getBoundingClientRect();
      if (elRect && (elRect.width > 0 || elRect.height > 0)) {
        if (lookup.offsetInAnchor.left >= 0 && lookup.offsetInAnchor.left < elRect.width + 10) {
          textRect = new DOMRect(
            elRect.left + lookup.offsetInAnchor.left,
            elRect.top + lookup.offsetInAnchor.top,
            lookup.offsetInAnchor.width,
            lookup.offsetInAnchor.height
          );
        }
      }
    } catch {
      // ignore
    }
  }

  // 6. 兜底使用发起查询时记录的初始 rect，并根据容器滚动差量动态补齐
  if (!textRect) {
    if (lookup.rect) {
      const currentScrollLeft = host.scrollLeft || 0;
      const currentScrollTop = host.scrollTop || 0;
      const initScrollLeft = lookup.initialScrollLeft ?? currentScrollLeft;
      const initScrollTop = lookup.initialScrollTop ?? currentScrollTop;
      const scrollDeltaX = currentScrollLeft - initScrollLeft;
      const scrollDeltaY = currentScrollTop - initScrollTop;

      textRect = new DOMRect(
        lookup.rect.left - scrollDeltaX,
        lookup.rect.top - scrollDeltaY,
        lookup.rect.width,
        lookup.rect.height
      );
    } else {
      return null;
    }
  }

  if (host === document.body) {
    return {
      left: Math.round(textRect.left),
      top: Math.round(textRect.top),
      width: Math.round(textRect.width),
      height: Math.round(textRect.height),
    };
  }

  // 精准补齐宿主的内部滚动及边框偏移
  const scrollLeft = host.scrollLeft || 0;
  const scrollTop = host.scrollTop || 0;
  const clientLeft = host.clientLeft || 0;
  const clientTop = host.clientTop || 0;

  const rawLeft = Math.round(textRect.left - hostRect.left + scrollLeft - clientLeft);
  const rawTop = Math.round(textRect.top - hostRect.top + scrollTop - clientTop);

  return {
    left: Math.max(0, rawLeft),
    top: rawTop,
    width: Math.round(textRect.width),
    height: Math.round(textRect.height),
  };
}

/** 划词按钮文案：短词直接显示词形；短语/整句改用动作提示，避免按钮被长文本撑爆 */
function getSelectionTooltipLabel(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 10) return clean;
  return '翻译 / 解析这段内容';
}

/**
 * 对话区内联查询提示：围绕被查询文本渲染。
 * - loading：一圈旋转的光环绕着文本转圈，提示"正在翻译，稍后即可查看"。
 * - ready：翻译已就绪，浮出可点击的小胶囊，点击即用缓存结果打开浮窗（不会重新查询）。
 */
const LookupIndicator: React.FC<{ lookup: PendingLookup; onOpen: (rect: DOMRect) => void }> = ({
  lookup,
  onOpen,
}) => {
  const hostEl = getLookupHost(lookup);
  const [box, setBox] = useState<HostBox | null>(() => measureLookupInHost(lookup, hostEl));

  const update = useCallback(() => {
    const nextBox = measureLookupInHost(lookup, hostEl);
    if (nextBox) {
      setBox(nextBox);
    }
  }, [lookup, hostEl]);

  // 当宿主容器尺寸改变（如流式输出、窗口大小改变、图片加载）时更新相对坐标
  useEffect(() => {
    update();
    window.addEventListener('resize', update);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && hostEl && hostEl !== document.body) {
      ro = new ResizeObserver(() => {
        update();
      });
      ro.observe(hostEl);
    }

    return () => {
      window.removeEventListener('resize', update);
      if (ro) ro.disconnect();
    };
  }, [update, hostEl]);

  if (!box) {
    return null;
  }

  const isFixed = hostEl === document.body;
  const padX = 4;
  const padY = 3;
  const minWidth = 24;
  const minHeight = 20;
  const rawW = box.width + padX * 2;
  const rawH = box.height + padY * 2;
  const width = Math.max(minWidth, rawW);
  const height = Math.max(minHeight, rawH);
  // 当触发最小尺寸保护时双向均分多余尺寸，确保特效始终精准居中对齐文本，绝不产生单侧横向偏移
  const extraX = (width - rawW) / 2;
  const extraY = (height - rawH) / 2;
  const left = Math.round(box.left - padX - extraX);
  const top = Math.round(box.top - padY - extraY);
  const radius = 6;

  // 获取当前最新视口坐标供点击打开弹窗时定位
  const getLiveViewportRect = (): DOMRect => {
    if (lookup.lineEl && lookup.lineEl.isConnected && lookup.offsetInLine) {
      try {
        const lr = lookup.lineEl.getBoundingClientRect();
        if (lr.width > 0 || lr.height > 0) {
          return new DOMRect(
            lr.left + lookup.offsetInLine.left,
            lr.top + lookup.offsetInLine.top,
            lookup.offsetInLine.width,
            lookup.offsetInLine.height
          );
        }
      } catch {}
    }
    if (lookup.bubbleEl && lookup.bubbleEl.isConnected && lookup.offsetInBubble) {
      try {
        const br = lookup.bubbleEl.getBoundingClientRect();
        if (br.width > 0 || br.height > 0) {
          return new DOMRect(
            br.left + lookup.offsetInBubble.left,
            br.top + lookup.offsetInBubble.top,
            lookup.offsetInBubble.width,
            lookup.offsetInBubble.height
          );
        }
      } catch {}
    }
    if (lookup.selectionRange && lookup.selectionRange.startContainer?.isConnected) {
      try {
        const r = getPreciseRangeRect(lookup.selectionRange);
        if (r && (r.width > 0 || r.height > 0)) return r;
      } catch {}
    }
    if (hostEl && hostEl.isConnected && hostEl !== document.body) {
      const hr = hostEl.getBoundingClientRect();
      const scrollLeft = hostEl.scrollLeft || 0;
      const scrollTop = hostEl.scrollTop || 0;
      const clientLeft = hostEl.clientLeft || 0;
      const clientTop = hostEl.clientTop || 0;
      return new DOMRect(
        hr.left + box.left - scrollLeft + clientLeft,
        hr.top + box.top - scrollTop + clientTop,
        box.width,
        box.height
      );
    }
    return lookup.rect;
  };

  const badgeLeft = Math.max(4, left + width - 10);
  const badgeTop = Math.max(4, top - 10);

  const content = lookup.status === 'ready' ? (
    <>
      {/* 短暂闪烁的完成框光效（0.75s 内自动淡出） */}
      <div
        className="lookup-finish-highlight"
        aria-hidden="true"
        style={{
          position: isFixed ? 'fixed' : 'absolute',
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        }}
      />
      {/* 短暂出现的对号 icon 按钮：轻量无打扰，点击直接打开结果 */}
      <button
        type="button"
        className="lookup-ready-check-badge"
        style={{
          position: isFixed ? 'fixed' : 'absolute',
          left: `${badgeLeft}px`,
          top: `${badgeTop}px`,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpen(getLiveViewportRect());
        }}
        title="翻译完成 · 点击查看"
      >
        <span className="check-badge-ping" />
        <Check size={12} strokeWidth={3} className="check-badge-icon" />
      </button>
    </>
  ) : (
    <div
      className="lookup-pending-ring"
      aria-hidden="true"
      style={{
        position: isFixed ? 'fixed' : 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <svg
        className="lookup-flowing-border-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 底层半透明轨道边框与微光底色 */}
        <rect
          x="1"
          y="1"
          width={width - 2}
          height={height - 2}
          rx={radius}
          ry={radius}
          className="lookup-flow-track"
        />
        {/* 紧贴被查询内容圆角矩形平滑流动的光流线条 */}
        <rect
          x="1"
          y="1"
          width={width - 2}
          height={height - 2}
          rx={radius}
          ry={radius}
          pathLength="100"
          className="lookup-flow-line"
        />
      </svg>
    </div>
  );

  return createPortal(content, hostEl);
};

export interface DictionaryProviderProps {
  children: React.ReactNode;
  ttsRate?: number;
  learnedWords?: LearnedWord[];
  furiganaHideMastered?: boolean;
  themeColor?: string;
  rubyColor?: string;
  onSaveWord?: (word: {
    surface: string;
    reading: string;
    meaning: string;
    pitch?: number;
    pos?: string;
    level?: string;
    detail?: string;
    exampleJp?: string;
    exampleCn?: string;
    source?: string;
  }) => void;
  onRemoveWord?: (wordId: string) => void;
  /** 手动收藏的短语 / 句型 / 整句集合（与生词本分离） */
  favoriteExpressions?: FavoriteExpression[];
  /** 收藏一段表达（短语 / 句型 / 整句） */
  onSaveExpression?: (item: Omit<FavoriteExpression, 'id' | 'createdAt'>) => void;
  /** 取消收藏（可传 id 或原文） */
  onRemoveExpression?: (idOrText: string) => void;
}

interface SelectionAction {
  text: string;
  cursorX: number;
  cursorY: number;
  anchorRect: DOMRect;
  anchorEl?: HTMLElement;
  lineEl?: HTMLElement | null;
  bubbleEl?: HTMLElement | null;
  offsetInLine?: { left: number; top: number; width: number; height: number } | null;
  offsetInBubble?: { left: number; top: number; width: number; height: number } | null;
  isFromJTag?: boolean;
  sentenceContext?: string;
  isInput?: boolean;
  /** 选区 Range（普通 DOM 划词时捕获，供结果浮窗关闭后继续定位） */
  selectionRange?: Range | null;
}

export const DictionaryProvider: React.FC<DictionaryProviderProps> = ({
  children,
  ttsRate = 1.0,
  learnedWords = [],
  furiganaHideMastered = true,
  themeColor,
  rubyColor,
  onSaveWord,
  onRemoveWord,
  favoriteExpressions = [],
  onSaveExpression,
  onRemoveExpression,
}) => {
  const [activeParams, setActiveParams] = useState<OpenDictionaryParams | null>(null);
  const [selectionAction, setSelectionAction] = useState<SelectionAction | null>(null);
  const [pendingLookups, setPendingLookups] = useState<PendingLookup[]>([]);
  const [queriedTerms, setQueriedTerms] = useState<Set<string>>(() =>
    dictionaryService.getQueriedTerms()
  );
  const [queriedChineseTerms, setQueriedChineseTerms] = useState<Set<string>>(() =>
    dictionaryService.getQueriedChineseTerms()
  );
  const tooltipRef = useRef<HTMLDivElement>(null);
  const selectionActionRef = useRef<SelectionAction | null>(null);
  selectionActionRef.current = selectionAction;
  const pendingLookupsRef = useRef<PendingLookup[]>([]);
  pendingLookupsRef.current = pendingLookups;
  const activeParamsRef = useRef<OpenDictionaryParams | null>(null);
  activeParamsRef.current = activeParams;

  const mouseDownInfoRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const justDismissedRef = useRef<boolean>(false);

  // 监听词典已查询词库更新，保证划词完成瞬间各气泡即刻呈现虚线
  useEffect(() => {
    return dictionaryService.subscribeQueriedTerms((jpTerms, cnTerms) => {
      setQueriedTerms(jpTerms);
      setQueriedChineseTerms(cnTerms);
    });
  }, []);

  const addQueriedTerm = useCallback((term: string, isFromJTag: boolean = true) => {
    dictionaryService.addQueriedTerm(term, isFromJTag);
  }, []);

  const openDictionary = useCallback((params: OpenDictionaryParams) => {
    // 浮窗即将展示该条目：清掉对话区里同文本的"等待/已完成"提示，避免重复显示
    setPendingLookups((prev) => prev.filter((p) => p.text !== params.word));
    setActiveParams(params);
    if (params.word) {
      dictionaryService.addQueriedTerm(params.word, params.isFromJTag ?? true);
    }
  }, []);

  const closeDictionary = useCallback(() => {
    setActiveParams(null);
  }, []);

  /**
   * 登记一次 AI 查询，返回追踪 id。
   * 若同一文本已有进行中的查询，则复用原 id（刷新定位与滚动容器信息），绝不产生重复提示。
   */
  const beginLookup = useCallback((params: PendingLookupRequest): string => {
    let anchorEl = params.anchorEl;
    if (!anchorEl && params.selectionRange) {
      try {
        const container = params.selectionRange.commonAncestorContainer;
        anchorEl = (container.nodeType === Node.ELEMENT_NODE
          ? (container as HTMLElement)
          : container.parentElement) || undefined;
      } catch {
        // ignore
      }
    }

    let lineEl = params.lineEl;
    let bubbleEl = params.bubbleEl;
    let offsetInLine = params.offsetInLine;
    let offsetInBubble = params.offsetInBubble;

    if (!lineEl && anchorEl) {
      lineEl = (anchorEl.closest('.bubble-line') || anchorEl.closest('.chat-bubble-content') || null) as HTMLElement | null;
    }
    if (!bubbleEl && anchorEl) {
      bubbleEl = (anchorEl.closest('.message-bubble') || anchorEl.closest('.message-item-wrapper') || null) as HTMLElement | null;
    }

    if (!offsetInLine && lineEl && lineEl.isConnected && params.rect) {
      try {
        const lr = lineEl.getBoundingClientRect();
        offsetInLine = {
          left: params.rect.left - lr.left,
          top: params.rect.top - lr.top,
          width: params.rect.width,
          height: params.rect.height,
        };
      } catch {}
    }

    if (!offsetInBubble && bubbleEl && bubbleEl.isConnected && params.rect) {
      try {
        const br = bubbleEl.getBoundingClientRect();
        offsetInBubble = {
          left: params.rect.left - br.left,
          top: params.rect.top - br.top,
          width: params.rect.width,
          height: params.rect.height,
        };
      } catch {}
    }

    const scrollContainer =
      (anchorEl?.closest('.chat-container-main') as HTMLElement | null) ||
      (document.querySelector('.chat-container-main') as HTMLElement | null);

    let offsetInAnchor = params.offsetInAnchor;
    if (!offsetInAnchor && anchorEl && anchorEl.isConnected) {
      try {
        const elRect = anchorEl.getBoundingClientRect();
        offsetInAnchor = {
          left: params.rect.left - elRect.left,
          top: params.rect.top - elRect.top,
          width: params.rect.width,
          height: params.rect.height,
        };
      } catch {
        // ignore
      }
    }

    const initialScrollTop = scrollContainer
      ? scrollContainer.scrollTop
      : window.scrollY || document.documentElement.scrollTop;
    const initialScrollLeft = scrollContainer
      ? scrollContainer.scrollLeft
      : window.scrollX || document.documentElement.scrollLeft;

    const fullParams: PendingLookupRequest = {
      ...params,
      anchorEl,
      lineEl,
      bubbleEl,
      offsetInLine,
      offsetInBubble,
      scrollContainer,
      offsetInAnchor,
      initialScrollTop,
      initialScrollLeft,
    };

    const existing = pendingLookupsRef.current.find(
      (p) => p.text === params.text && p.status === 'loading'
    );
    if (existing) {
      setPendingLookups((prev) =>
        prev.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                ...fullParams,
                id: p.id,
                status: 'loading',
                createdAt: Date.now(),
              }
            : p
        )
      );
      return existing.id;
    }

    const id = `lk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    setPendingLookups((prev) => [
      ...prev,
      {
        ...fullParams,
        id,
        status: 'loading',
        createdAt: Date.now(),
      },
    ]);
    return id;
  }, []);

  /** 标记查询结束：浮窗正展示该条目时直接移除提示，否则转为"已完成 · 点击查看" */
  const endLookup = useCallback((id: string, success: boolean = true) => {
    setPendingLookups((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target) return prev;
      if (success && target.text) {
        dictionaryService.addQueriedTerm(target.text, target.isFromJTag ?? false);
      }
      if (!success || activeParamsRef.current?.word === target.text) {
        return prev.filter((p) => p.id !== id);
      }
      return prev.map((p) =>
        p.id === id ? { ...p, status: 'ready', createdAt: Date.now() } : p
      );
    });
  }, []);

  // 提示生命周期：已完成对号提示 2.8 秒后自动淡出清理；异常挂起的加载提示最多保留 120 秒
  const hasReadyLookup = pendingLookups.some((p) => p.status === 'ready');
  useEffect(() => {
    if (!hasReadyLookup) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setPendingLookups((prev) =>
        prev.filter((p) => {
          const age = now - p.createdAt;
          return p.status === 'loading' ? age < 120000 : age < 2800;
        })
      );
    }, 350);
    return () => window.clearInterval(timer);
  }, [hasReadyLookup]);

  const checkIsSaved = useCallback(
    (word: string) => {
      return learnedWords.some(
        (w) => w.surface === word || (w.reading && w.reading === word)
      );
    },
    [learnedWords]
  );

  // 全局划词选区监听：支持普通 DOM 选区及 <input>/<textarea> 内的文本划选
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      mouseDownInfoRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };

      // 如果点击在划词悬浮按钮自身上，不予销毁
      if ((e.target as Element)?.closest?.('.selection-lookup-tooltip')) {
        return;
      }

      // 核心修复：点击外部任意组件时，立即标记并销毁现存的划词按钮
      if (selectionActionRef.current) {
        setSelectionAction(null);
        justDismissedRef.current = true;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // 若点击发生在划词按钮自身内部，不重新计算以防干扰按钮点击事件
      if ((e.target as Element)?.closest?.('.selection-lookup-tooltip')) {
        return;
      }

      const downInfo = mouseDownInfoRef.current;
      const dist = downInfo ? Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) : 0;
      const isSingleClick = e.detail <= 1 && dist < 5;

      // 核心修复：单次点击任何外部组件或空白处（无划选拖拽动作，且非双击选词）
      // 绝不允许重新唤起划词按钮，并顺畅消除残留选区
      if (isSingleClick) {
        if (justDismissedRef.current) {
          justDismissedRef.current = false;
          try {
            window.getSelection()?.removeAllRanges();
          } catch {
            // ignore
          }
        }
        setSelectionAction(null);
        return;
      }
      justDismissedRef.current = false;

      const target = e.target as HTMLElement | null;

      // 场景 1：在 <input> 或 <textarea> 输入框内部划词
      if (
        target &&
        (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)
      ) {
        if (target.type === 'password' || target.disabled) {
          setSelectionAction(null);
          return;
        }

        const start = target.selectionStart;
        const end = target.selectionEnd;
        if (start !== null && end !== null && end > start) {
          const rawText = target.value.slice(start, end).trim();
          if (
            rawText.length >= 1 &&
            rawText.length <= MAX_SELECTION_LOOKUP_LENGTH &&
            /[\u4e00-\u9fa5一-龯々〆ぁ-んァ-ヶa-zA-Z0-9]/.test(rawText)
          ) {
            // 输入框光标释放点即为用户划选终点
            const cursorX = e.clientX;
            const cursorY = e.clientY;
            const anchorRect = new DOMRect(cursorX - 10, cursorY - 12, 20, 20);
            const sentenceContext = target.value;

            setSelectionAction({
              text: rawText,
              cursorX,
              cursorY,
              anchorRect,
              anchorEl: target,
              isFromJTag: false,
              sentenceContext,
              isInput: true,
            });
            return;
          }
        }
      }

      // 场景 2：在普通 DOM 文本（气泡、卡片、注音等）中划词
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelectionAction(null);
        return;
      }

      const originalText = sel.toString();
      if (
        !originalText ||
        !/[\u4e00-\u9fa5一-龯々〆ぁ-んァ-ヶa-zA-Z0-9]/.test(originalText)
      ) {
        setSelectionAction(null);
        return;
      }

      try {
        const rawRange = sel.getRangeAt(0);
        // 先将 Range 规范化映射到真实的 TEXT_NODE 节点上，
        // 彻底杜绝 Chromium 在跨节点选区时将 Range.startContainer 置为父级元素（如 bubble-line），
        // 从而引发 getClientRects() 坍塌到行首左侧的严重定位 Bug
        const normalizedRange = normalizeRangeToTextNodes(rawRange);
        // 精确裁剪选区边缘的空格、标点及括号，确保选区矩形紧密贴合词汇本体，消除横向偏移
        const { trimmedRange, cleanText } = trimRangeToCleanText(normalizedRange, originalText);
        if (
          cleanText.length < 1 ||
          cleanText.length > MAX_SELECTION_LOOKUP_LENGTH ||
          !/[\u4e00-\u9fa5一-龯々〆ぁ-んァ-ヶa-zA-Z0-9]/.test(cleanText)
        ) {
          setSelectionAction(null);
          return;
        }

        const bounding = getPreciseRangeRect(trimmedRange) || trimmedRange.getBoundingClientRect();
        if (bounding.width > 0 && bounding.height > 0) {
          // 克隆选区：后续 removeAllRanges 不影响它，浮窗关闭后仍可用它精确定位被查询的文本
          const liveRange = trimmedRange.cloneRange();
          // 判断划词方向：正选（左->右，上->下）或 反选（右->左，下->上）
          let isBackward = false;
          if (sel.anchorNode && sel.focusNode) {
            if (sel.anchorNode === sel.focusNode) {
              isBackward = sel.anchorOffset > sel.focusOffset;
            } else {
              const pos = sel.anchorNode.compareDocumentPosition(sel.focusNode);
              isBackward = !(pos & Node.DOCUMENT_POSITION_FOLLOWING);
            }
          }

          // 获取终点光标（Caret）精确坐标
          let caretX: number | null = null;
          let caretY: number | null = null;

          if (sel.focusNode) {
            try {
              const caretRange = document.createRange();
              caretRange.setStart(sel.focusNode, sel.focusOffset);
              caretRange.setEnd(sel.focusNode, sel.focusOffset);
              const rects = caretRange.getClientRects();
              if (rects.length > 0) {
                caretX = isBackward ? rects[0].left : rects[0].right;
                caretY = rects[0].top;
              }
            } catch {
              // ignore
            }
          }

          // 若微小范围未命中，尝试将 Range 折叠至端点获取矩形
          if (caretX === null || caretY === null) {
            try {
              const cloned = trimmedRange.cloneRange();
              cloned.collapse(isBackward);
              const rects = cloned.getClientRects();
              if (rects.length > 0) {
                const targetRect = isBackward ? rects[0] : rects[rects.length - 1];
                caretX = isBackward ? targetRect.left : targetRect.right;
                caretY = targetRect.top;
              }
            } catch {
              // ignore
            }
          }

          // 若浏览器仍未提供，回退为选区边缘结合鼠标释放位置
          if (caretX === null || caretY === null) {
            caretX = isBackward ? bounding.left : bounding.right;
            caretY = isBackward ? bounding.top : bounding.bottom - 20;
          }

          const parentEl = sel.anchorNode?.parentElement;
          const isFromJTag =
            !!parentEl?.closest('.ruby-word-unit') || !!parentEl?.closest('.ruby-item');
          const sentenceContext =
            parentEl?.closest('.bubble-line')?.textContent ||
            parentEl?.closest('.message-bubble')?.textContent ||
            parentEl?.textContent ||
            '';

          const commonContainer = trimmedRange.commonAncestorContainer;
          const anchorEl = (commonContainer.nodeType === Node.ELEMENT_NODE
            ? (commonContainer as HTMLElement)
            : commonContainer.parentElement) || parentEl || undefined;

          const lineEl = (anchorEl?.closest('.bubble-line') || anchorEl?.closest('.chat-bubble-content') || null) as HTMLElement | null;
          const bubbleEl = (anchorEl?.closest('.message-bubble') || anchorEl?.closest('.message-item-wrapper') || null) as HTMLElement | null;

          let offsetInLine: { left: number; top: number; width: number; height: number } | null = null;
          if (lineEl && lineEl.isConnected) {
            try {
              const lr = lineEl.getBoundingClientRect();
              offsetInLine = {
                left: bounding.left - lr.left,
                top: bounding.top - lr.top,
                width: bounding.width,
                height: bounding.height,
              };
            } catch {}
          }

          let offsetInBubble: { left: number; top: number; width: number; height: number } | null = null;
          if (bubbleEl && bubbleEl.isConnected) {
            try {
              const br = bubbleEl.getBoundingClientRect();
              offsetInBubble = {
                left: bounding.left - br.left,
                top: bounding.top - br.top,
                width: bounding.width,
                height: bounding.height,
              };
            } catch {}
          }

          setSelectionAction({
            text: cleanText,
            cursorX: caretX,
            cursorY: caretY,
            anchorRect: bounding,
            anchorEl,
            lineEl,
            bubbleEl,
            offsetInLine,
            offsetInBubble,
            isFromJTag,
            sentenceContext,
            selectionRange: liveRange,
          });
          return;
        }
      } catch {
        setSelectionAction(null);
      }

      setSelectionAction(null);
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 查词按钮适时销毁机制：页面滚动、点击外部组件、按 Esc 或窗口改变大小时立即消失
  useEffect(() => {
    if (!selectionAction) return;

    const handleDismissScroll = () => {
      setSelectionAction(null);
    };

    const handleDismissMouseDown = (e: MouseEvent) => {
      if ((e.target as Element)?.closest?.('.selection-lookup-tooltip')) {
        return;
      }
      setSelectionAction(null);
      justDismissedRef.current = true;
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        // ignore
      }
    };

    const handleDismissKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        setSelectionAction(null);
      }
    };

    const handleDismissResize = () => {
      setSelectionAction(null);
    };

    window.addEventListener('scroll', handleDismissScroll, { capture: true, passive: true });
    window.addEventListener('mousedown', handleDismissMouseDown, true);
    window.addEventListener('keydown', handleDismissKeyDown);
    window.addEventListener('resize', handleDismissResize);

    return () => {
      window.removeEventListener('scroll', handleDismissScroll, true);
      window.removeEventListener('mousedown', handleDismissMouseDown, true);
      window.removeEventListener('keydown', handleDismissKeyDown);
      window.removeEventListener('resize', handleDismissResize);
    };
  }, [selectionAction]);

  // 点击查词按钮
  const handleSelectionLookup = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectionAction) return;

    openDictionary({
      word: selectionAction.text,
      anchorRect: selectionAction.anchorRect,
      anchorEl: selectionAction.anchorEl,
      lineEl: selectionAction.lineEl,
      bubbleEl: selectionAction.bubbleEl,
      offsetInLine: selectionAction.offsetInLine,
      offsetInBubble: selectionAction.offsetInBubble,
      isFromJTag: selectionAction.isFromJTag,
      sentenceContext: selectionAction.sentenceContext,
      selectionRange: selectionAction.selectionRange,
    });

    setSelectionAction(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // ignore
    }
  };

  // 坐标计算：将按钮定位于光标终点的正上方，并防溢出边界
  const tooltipLabel = selectionAction ? getSelectionTooltipLabel(selectionAction.text) : '';
  const tooltipPos = (() => {
    if (!selectionAction) return null;
    // 依据实际文案估算按钮宽度（中文约 13px/字），避免长文案按钮被视口截断
    const estWidth = Math.min(260, 34 + tooltipLabel.length * 13);
    const clampedX = Math.max(
      estWidth / 2 + 12,
      Math.min(window.innerWidth - estWidth / 2 - 12, selectionAction.cursorX)
    );
    // 关键优化：若在输入框中，加大抬升高度（56px），舒适悬浮于行上方，绝不遮挡输入文字与光标
    const isInput = !!selectionAction.isInput;
    const offset = isInput ? 56 : 38;
    let top = selectionAction.cursorY - offset;
    if (top < 8) {
      // 顶部空间不足，翻转至光标下方
      top = selectionAction.cursorY + (isInput ? 28 : 24);
    }
    return { left: clampedX, top };
  })();

  return (
    <DictionaryContext.Provider
      value={{
        openDictionary,
        closeDictionary,
        beginLookup,
        endLookup,
        isOpen: !!activeParams,
        activeWord: activeParams?.word,
        learnedWords,
        furiganaHideMastered,
        queriedTerms,
        queriedChineseTerms,
        addQueriedTerm,
      }}
    >
      {children}

      {/* 划词悬浮快捷查词按钮：挂载在 body 顶层，无“查词：”前缀，定位在光标上方 */}
      {selectionAction &&
        tooltipPos &&
        createPortal(
          <div
            ref={tooltipRef}
            className="selection-lookup-tooltip"
            data-theme={themeColor}
            title={`查询：${selectionAction.text.replace(/\s+/g, ' ').trim()}`}
            style={{
              left: `${tooltipPos.left}px`,
              top: `${tooltipPos.top}px`,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={handleSelectionLookup}
          >
            <BookOpen size={12} />
            <span>{tooltipLabel}</span>
          </div>,
          document.body
        )}

      {/* 对话区内联查询提示：浮窗被提前关闭时，仍在原文本处转圈提示，完成后可一键回看 */}
      {pendingLookups.map((lookup) => {
        // 浮窗正展示该条目时无需内联提示
        if (activeParams?.word === lookup.text) return null;
        return (
          <LookupIndicator
            key={lookup.id}
            lookup={lookup}
            onOpen={(rect) =>
              openDictionary({
                word: lookup.text,
                reading: lookup.reading,
                anchorRect: rect,
                anchorEl: lookup.anchorEl,
                lineEl: lookup.lineEl,
                bubbleEl: lookup.bubbleEl,
                offsetInLine: lookup.offsetInLine,
                offsetInBubble: lookup.offsetInBubble,
                isFromJTag: lookup.isFromJTag,
                sentenceContext: lookup.sentenceContext,
                selectionRange: lookup.selectionRange,
              })
            }
          />
        );
      })}

      {/* 使用 React Portal 将词典悬浮窗直接挂载在 document.body 上 */}
      {/* 传递 themeColor，彻底解决系统主题色接管问题 */}
      {activeParams &&
        createPortal(
          <WordDictionaryPopover
            word={activeParams.word}
            reading={activeParams.reading}
            anchorRect={activeParams.anchorRect}
            anchorEl={activeParams.anchorEl}
            lineEl={activeParams.lineEl}
            bubbleEl={activeParams.bubbleEl}
            offsetInLine={activeParams.offsetInLine}
            offsetInBubble={activeParams.offsetInBubble}
            selectionRange={activeParams.selectionRange}
            isFromJTag={activeParams.isFromJTag}
            sentenceContext={activeParams.sentenceContext}
            onClose={closeDictionary}
            ttsRate={ttsRate}
            onSaveWord={onSaveWord}
            onRemoveWord={onRemoveWord}
            favoriteExpressions={favoriteExpressions}
            onSaveExpression={onSaveExpression}
            onRemoveExpression={onRemoveExpression}
            isSaved={checkIsSaved(activeParams.word)}
            learnedWords={learnedWords}
            themeColor={themeColor}
            rubyColor={rubyColor}
            onLookupStart={beginLookup}
            onLookupEnd={endLookup}
          />,
          document.body
        )}
    </DictionaryContext.Provider>
  );
};

export const useDictionary = (): DictionaryContextType => {
  const ctx = useContext(DictionaryContext);
  if (!ctx) {
    return {
      openDictionary: () => {},
      closeDictionary: () => {},
      beginLookup: () => '',
      endLookup: () => {},
      isOpen: false,
      activeWord: undefined,
      learnedWords: [],
      furiganaHideMastered: true,
      queriedTerms: new Set(),
      queriedChineseTerms: new Set(),
      addQueriedTerm: () => {},
    };
  }
  return ctx;
};
