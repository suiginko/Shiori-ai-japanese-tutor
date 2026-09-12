import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Volume2,
  X,
  Bookmark,
  Check,
  BookOpen,
  Sparkles,
  ExternalLink,
  Lightbulb,
  ArrowRightLeft,
  GraduationCap,
  RefreshCw,
  Languages,
  ListTree,
} from 'lucide-react';
import { dictionaryService, DictEntry } from '../../services/dictionaryService';
import { speechService } from '../../services/speechService';
import { LearnedWord, FavoriteExpression } from '../../types';
import { FuriganaTitle } from '../Common/FuriganaTitle';
import { parseJapaneseContent } from '../../utils/rubyParser';
import type { PendingLookupRequest } from '../../context/DictionaryContext';
import { DISTINCT_CHINESE_CHAR_REGEX } from '../../utils/languageDetector';

/**
 * 将软件统一注音串（`{原文[读音]}`）渲染为振假名 ruby，供词典小窗标题使用。
 * 与聊天区不同，这里的注音恒定显示，且不受全局注音模式与"已掌握隐藏"影响——
 * 词典小窗的职责就是把读音讲清楚，隐藏注音毫无意义。同时禁用点击，避免嵌套划词。
 */
function renderDictRuby(text: string): React.ReactNode {
  const tokens = parseJapaneseContent(text, {
    isExplicitJapanese: true,
    showPlainFurigana: true,
    hideMasteredFurigana: false,
  });

  return tokens.map((token, idx) => {
    if (token.type === 'text') {
      return <span key={idx}>{token.surface}</span>;
    }
    const showRuby = !!token.reading && !token.isPureKana;
    return (
      <span key={idx} className="dict-ruby-unit">
        {token.prefixKana && <span className="dict-ruby-affix">{token.prefixKana}</span>}
        {showRuby ? (
          <ruby className="dict-ruby">
            <span className="dict-ruby-base">{token.surface}</span>
            <rt className="dict-ruby-rt">{token.reading}</rt>
          </ruby>
        ) : (
          <span className="dict-ruby-base">{token.surface}</span>
        )}
        {token.okurigana && <span className="dict-ruby-affix">{token.okurigana}</span>}
      </span>
    );
  });
}

/**
 * 占位词条上的自动分类标签（如「汉字词汇」「假名词汇」「外来语 / 片假名词汇」）。
 * 这些标签是离线兜底算法猜出来的，在 AI 权威词条返回前毫无信息量，一律不显示。
 */
const MEANINGLESS_POS_LABELS = new Set([
  '汉字词汇',
  '假名词汇',
  '日语词汇',
  '词汇',
  '外来语 / 片假名词汇',
  '外来语/片假名词汇',
]);


export interface WordDictionaryPopoverProps {
  word: string;
  reading?: string;
  anchorRect: DOMRect;
  onClose: () => void;
  ttsRate?: number;
  isFromJTag?: boolean;
  sentenceContext?: string;
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
  isSaved?: boolean;
  learnedWords?: LearnedWord[];
  /** 手动收藏的短语 / 句型 / 整句集合（与生词本严格分离） */
  favoriteExpressions?: FavoriteExpression[];
  /** 收藏一段表达（短语 / 句型 / 整句） */
  onSaveExpression?: (item: Omit<FavoriteExpression, 'id' | 'createdAt'>) => void;
  /** 取消收藏（可传 id 或原文） */
  onRemoveExpression?: (idOrText: string) => void;
  themeColor?: string;
  rubyColor?: string;
  anchorEl?: HTMLElement;
  lineEl?: HTMLElement | null;
  bubbleEl?: HTMLElement | null;
  offsetInLine?: { left: number; top: number; width: number; height: number } | null;
  offsetInBubble?: { left: number; top: number; width: number; height: number } | null;
  selectionRange?: Range | null;
  /** 登记一次 AI 查询（用于浮窗关闭后仍在对话区定位并提示"正在翻译"） */
  onLookupStart?: (params: PendingLookupRequest) => string;
  /** 标记该次 AI 查询结束（success=false 时撤掉提示，不谎报完成） */
  onLookupEnd?: (id: string, success?: boolean) => void;
}

export const WordDictionaryPopover: React.FC<WordDictionaryPopoverProps> = ({
  word,
  reading,
  anchorRect,
  anchorEl,
  lineEl,
  bubbleEl,
  offsetInLine,
  offsetInBubble,
  selectionRange,
  onClose,
  ttsRate = 1.0,
  isFromJTag = false,
  sentenceContext,
  onSaveWord,
  onRemoveWord,
  isSaved = false,
  learnedWords = [],
  favoriteExpressions = [],
  onSaveExpression,
  onRemoveExpression,
  themeColor,
  rubyColor,
  onLookupStart,
  onLookupEnd,
}) => {
  // 当前查词词条（支持点击原型卡片在变位形与原型之间快速切换）
  const [currentQueryWord, setCurrentQueryWord] = useState(word);
  const [currentQueryReading, setCurrentQueryReading] = useState(reading);
  const [entry, setEntry] = useState<DictEntry | null>(() => dictionaryService.lookup(word, reading));
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingExampleIdx, setPlayingExampleIdx] = useState<number | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 记录本轮用户主动移出生词本的词（防止被自动机制重复加回）
  const userRemovedWordsRef = useRef<Set<string>>(new Set());
  // 记录已同步更新的唯一条目指纹，避免重复无意义刷新
  const lastSyncedSignatureRef = useRef<string>('');

  // 辅助检测条目释义是否为尚未就绪的占位文本
  const isPlaceholderMeaning = (meaning?: string) => {
    if (!meaning) return true;
    const m = meaning.trim();
    return (
      m.length === 0 ||
      m.includes('正在生成') ||
      m.includes('暂无释义') ||
      m.includes('常用日语词汇') ||
      m.includes('日语常用口语表达') ||
      m.includes('外来语借词（点击') ||
      m.includes('点击右上角')
    );
  };

  // 核心同步函数：将悬浮窗内的信息（尤其是 AI 生成的新版权威解释、例句与考点）成功同步更新到生词本
  const syncEntryToNotebook = useCallback(
    (targetEntry: DictEntry | null, forceExplicit = false) => {
      if (!targetEntry || !onSaveWord) return;

      // 核心拦截：非用户主动手动点击收藏时，兜底占位条目（如“日语常用口语表达”、“正在生成精准释义...”等）
      // 绝不允许自动写入学情档案！必须等待 AI 权威生成完毕或真实词库条目加载就绪。
      if (!forceExplicit && (targetEntry.isPlaceholder || isPlaceholderMeaning(targetEntry.meaning))) {
        return;
      }

      // 核心拦截：当查询内容为非单词（词组、惯用句、文法句型、句子表达等）时，
      // 绝不允许自动写入学情档案（生词本）！仅当用户主动点击“收录至生词本”时才允许。
      const isNonWord =
        (targetEntry.queryType && targetEntry.queryType !== 'word') ||
        targetEntry.pos?.includes('句') ||
        targetEntry.pos?.includes('短语') ||
        targetEntry.pos?.includes('文法') ||
        targetEntry.pos?.includes('语法') ||
        targetEntry.pos?.includes('表达') ||
        targetEntry.word.length > 7 ||
        /[。！？!?、\s\u3000]/.test(targetEntry.word);

      if (!forceExplicit && isNonWord) {
        return;
      }

      // 若仍处于生成或未就绪状态，暂不写入生词本
      if (
        !targetEntry.meaning ||
        targetEntry.meaning.includes('正在生成') ||
        targetEntry.meaning.includes('暂无释义') ||
        !targetEntry.word
      ) {
        return;
      }

      let targetWord = targetEntry.lemma || targetEntry.word || currentQueryWord;
      if (DISTINCT_CHINESE_CHAR_REGEX.test(targetWord)) {
        if (targetEntry.lemma && !DISTINCT_CHINESE_CHAR_REGEX.test(targetEntry.lemma)) {
          targetWord = targetEntry.lemma;
        } else if (targetEntry.reading && /[ぁ-んァ-ヶ]/.test(targetEntry.reading) && !DISTINCT_CHINESE_CHAR_REGEX.test(targetEntry.reading)) {
          targetWord = targetEntry.reading;
        } else {
          return;
        }
      }
      const targetReading = targetEntry.lemma ? (targetEntry.lemmaReading || targetEntry.reading) : (targetEntry.reading || targetWord);

      // 如果用户在当前浮窗主动移出过该词，非主动点击时不逆向加回
      if (
        !forceExplicit &&
        (userRemovedWordsRef.current.has(targetWord) || userRemovedWordsRef.current.has(currentQueryWord))
      ) {
        return;
      }

      // 生成条目指纹（词条+释义+用法+例句）
      const signature = `${targetWord}:::${targetEntry.meaning}:::${targetEntry.detail || ''}:::${targetEntry.examples?.[0]?.jp || ''}`;
      if (lastSyncedSignatureRef.current === signature) {
        return;
      }
      lastSyncedSignatureRef.current = signature;

      onSaveWord({
        surface: targetWord,
        reading: targetReading,
        meaning: targetEntry.meaning,
        pitch: targetEntry.pitch,
        pos: targetEntry.pos,
        level: targetEntry.level,
        detail: targetEntry.detail,
        exampleJp: targetEntry.examples?.[0]?.jp,
        exampleCn: targetEntry.examples?.[0]?.zh,
        source: targetEntry.source || 'ai',
      });
    },
    [onSaveWord, currentQueryWord]
  );

  // 用户开启词典或条目数据更新后，自动将权威释义更新到生词本
  useEffect(() => {
    if (entry) {
      syncEntryToNotebook(entry);
    }
  }, [entry, syncEntryToNotebook]);

  // 定位状态：基于真实渲染测量尺寸精准计算
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    arrowLeft: number;
    isTop: boolean;
    maxHeight: number;
  }>({
    top: anchorRect.bottom + 8,
    left: Math.max(12, anchorRect.left),
    arrowLeft: 24,
    isTop: false,
    maxHeight: 520,
  });

  // 当外部传入的 word/reading 发生变化时同步
  useEffect(() => {
    setCurrentQueryWord(word);
    setCurrentQueryReading(reading);
  }, [word, reading]);

  // 从本地零流量/零Token词典中离线秒查；当遇到占位符或未命中时，后台自动调用 AI 精确自愈解析
  useEffect(() => {
    const res = dictionaryService.lookup(currentQueryWord, currentQueryReading);
    setEntry(res);

    // 如果未完全收录或属于占位条目，自动异步调用 AI 获取权威释义
    if (
      res &&
      (res.isPlaceholder ||
        res.meaning.includes('常用日语词汇') ||
        res.meaning.includes('正在生成') ||
        res.meaning.includes('外来语借词（点击') ||
        res.meaning.includes('日语常用口语表达'))
    ) {
      setIsAiLoading(true);
      // 登记查询：即使用户中途关掉浮窗，也能在对话区原位显示"正在翻译"的转圈提示
      const lookupId = onLookupStart?.({
        text: word,
        rect: anchorRect,
        anchorEl,
        lineEl,
        bubbleEl,
        offsetInLine,
        offsetInBubble,
        selectionRange,
        reading,
        isFromJTag,
        sentenceContext,
      });
      let aiSucceeded = false;
      dictionaryService
        .fetchAiDefinition(currentQueryWord, currentQueryReading, { isFromJTag, sentenceContext })
        .then((aiEntry) => {
          if (aiEntry) {
            aiSucceeded = true;
            setEntry(aiEntry);
            const canonicalWord = aiEntry.lemma || aiEntry.word;
            // 登记已查询词（根据中日文来源分别登记，确保消息内立即获得虚线并可点击）
            if (isFromJTag) {
              dictionaryService.addQueriedTerm(currentQueryWord, true);
              if (word) dictionaryService.addQueriedTerm(word, true);
              if (aiEntry.word) dictionaryService.addQueriedTerm(aiEntry.word, true);
              if (canonicalWord) dictionaryService.addQueriedTerm(canonicalWord, true);
            } else {
              // 用户在中文普通文本中划词：仅记录用户划选的中文原词，日文结果登记至日文库
              dictionaryService.addQueriedTerm(currentQueryWord, false);
              if (canonicalWord) dictionaryService.addQueriedTerm(canonicalWord, true);
            }

            // 核心功能：如果 AI 返回了规范纠正原型或中译日结果
            if (canonicalWord && canonicalWord !== currentQueryWord) {
              const oldQuery = currentQueryWord;
              setCurrentQueryWord(canonicalWord);
              if (aiEntry.reading) {
                setCurrentQueryReading(aiEntry.reading);
              }
              // 关键自愈：如果由于历史或误查留下了残缺旧词（如 かっこい），彻底从生词本中移出
              if (onRemoveWord) {
                onRemoveWord(oldQuery);
                if (word && word !== canonicalWord) {
                  onRemoveWord(word);
                }
              }
            }
            // 核心功能：AI 生成的新版权威释义即刻同步更新到生词本！
            syncEntryToNotebook(aiEntry);
          }
        })
        .finally(() => {
          setIsAiLoading(false);
          if (lookupId) onLookupEnd?.(lookupId, aiSucceeded);
        });
    } else {
      setIsAiLoading(false);
      // 本地离线词典直接命中有效释义时，也立即登记为已查询完成
      if (res && !res.isPlaceholder && !isPlaceholderMeaning(res.meaning)) {
        if (isFromJTag) {
          dictionaryService.addQueriedTerm(currentQueryWord, true);
          if (word) dictionaryService.addQueriedTerm(word, true);
          if (res.word) dictionaryService.addQueriedTerm(res.word, true);
        } else {
          dictionaryService.addQueriedTerm(currentQueryWord, false);
        }
      }
    }
  }, [
    currentQueryWord,
    currentQueryReading,
    syncEntryToNotebook,
    onRemoveWord,
    word,
    isFromJTag,
    sentenceContext,
    anchorRect,
    anchorEl,
    lineEl,
    bubbleEl,
    offsetInLine,
    offsetInBubble,
    selectionRange,
    reading,
    onLookupStart,
    onLookupEnd,
  ]);

  // 手动触发 AI 重新精释或刷新
  const handleManualAiLookup = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAiLoading) return;
    setIsAiLoading(true);
    const lookupId = onLookupStart?.({
      text: word,
      rect: anchorRect,
      anchorEl,
      lineEl,
      bubbleEl,
      offsetInLine,
      offsetInBubble,
      selectionRange,
      reading,
      isFromJTag,
      sentenceContext,
    });
    let manualAiSucceeded = false;
    try {
      const targetQuery = entry?.originalQuery || currentQueryWord;
      const aiEntry = await dictionaryService.fetchAiDefinition(targetQuery, currentQueryReading, { isFromJTag, sentenceContext });
      if (aiEntry) {
        manualAiSucceeded = true;
        setEntry(aiEntry);
        const canonicalWord = aiEntry.lemma || aiEntry.word;
        if (canonicalWord && canonicalWord !== currentQueryWord) {
          const oldQuery = currentQueryWord;
          setCurrentQueryWord(canonicalWord);
          if (aiEntry.reading) {
            setCurrentQueryReading(aiEntry.reading);
          }
          if (onRemoveWord) {
            onRemoveWord(oldQuery);
            if (word && word !== canonicalWord) {
              onRemoveWord(word);
            }
          }
        }
        // 核心功能：手动点击 AI 刷新获得的新释义，即刻同步更新到生词本并强制覆盖！
        syncEntryToNotebook(aiEntry, true);
      }
    } finally {
      setIsAiLoading(false);
      if (lookupId) onLookupEnd?.(lookupId, manualAiSucceeded);
    }
  };

  // 监听键盘 Esc 关闭，以及外部滚动/窗口尺寸变化时自动调整或关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleScroll = (e: Event) => {
      // 核心修复：如果是词典悬浮框内部的滚动（如滚轮滚动释义列表、拖动内部滚动条），绝对不要关闭浮窗！
      if (
        popoverRef.current &&
        e.target &&
        (e.target === popoverRef.current || popoverRef.current.contains(e.target as Node))
      ) {
        return;
      }
      // 只有外部页面发生滚动时才关闭浮窗，避免悬浮脱节
      onClose();
    };

    const handleResize = () => {
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  // 查询语义类型（未标注的旧词条一律按单词处理）+ 按类型自适应的悬浮窗宽度
  // 兜底推断：AI 尚未返回 queryType（离线占位词条）时，按查询文本形态粗判，
  // 避免整句在加载期间被当作"单词"用振假名标题渲染（长句套一层注音极其难看）。
  const inferredKind: 'word' | 'sentence' = (() => {
    const t = (entry?.word || currentQueryWord || '').trim();
    return /[。！？!?、]/.test(t) || t.length > 12 ? 'sentence' : 'word';
  })();
  const queryKind: 'word' | 'phrase' | 'grammar' | 'sentence' = entry?.queryType || inferredKind;
  const targetWidth = useMemo(() => {
    const base =
      queryKind === 'sentence' ? 560 : queryKind === 'phrase' || queryKind === 'grammar' ? 480 : 420;
    return Math.min(base, Math.max(280, window.innerWidth - 24));
  }, [queryKind]);

  // 视口安全坐标计算（按语义类型自适应宽度，并精准解决上下边缘溢出、左右截断、遮挡问题）
  useLayoutEffect(() => {
    if (!popoverRef.current) return;

    const popoverEl = popoverRef.current;
    // 按查询类型自适应宽度：整句需要更宽的阅读视野，单词保持紧凑
    const popoverWidth = targetWidth;
    const popoverHeight = popoverEl.offsetHeight || 320;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 水平居中对齐单词：
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    const idealLeft = anchorCenterX - popoverWidth / 2;
    // 限制在视口左右边界 [12px, viewportWidth - popoverWidth - 12px]
    const left = Math.max(12, Math.min(idealLeft, viewportWidth - popoverWidth - 12));

    // 指针箭头在悬浮窗内的水平偏移位置（与单词中心严格对齐）
    const arrowLeft = Math.max(24, Math.min(anchorCenterX - left, popoverWidth - 24));

    // 垂直可用空间分析
    const spaceBelow = viewportHeight - anchorRect.bottom - 12;
    const spaceAbove = anchorRect.top - 12;

    let isTop = false;
    let top = anchorRect.bottom + 8;
    let maxHeight = 540;

    // 如果下方空间不足容纳弹窗，且上方空间更加充裕，则翻转展示在上方
    if (spaceBelow < Math.min(popoverHeight, 380) && spaceAbove > spaceBelow) {
      isTop = true;
      maxHeight = Math.max(220, Math.min(540, spaceAbove - 16));
      top = Math.max(12, anchorRect.top - 8 - Math.min(popoverHeight, maxHeight));
    } else {
      isTop = false;
      maxHeight = Math.max(220, Math.min(540, spaceBelow - 16));
      top = anchorRect.bottom + 8;
    }

    setPosition({
      top,
      left,
      arrowLeft,
      isTop,
      maxHeight,
    });
  }, [anchorRect, entry, targetWidth]);

  // 目标原型词（用于保存至生词本以及外部字典查询）
  const canonicalWord = entry?.lemma || entry?.word || currentQueryWord;
  const canonicalReading = entry?.reading || canonicalWord;

  // 检查当前单词是否已在生词档案
  const savedItem = useMemo(() => {
    return learnedWords.find(
      (w) => w.surface === canonicalWord || w.surface === currentQueryWord
    );
  }, [learnedWords, canonicalWord, currentQueryWord]);

  // 非单词（短语 / 句型 / 整句）走独立的收藏集合，绝不混进生词本
  const savedExpression = useMemo(
    () =>
      favoriteExpressions.find(
        (f) => f.text === currentQueryWord || (!!entry?.word && f.text === entry.word)
      ),
    [favoriteExpressions, currentQueryWord, entry?.word]
  );

  const isWordLike = queryKind === 'word';
  const isSentenceLike = queryKind === 'sentence';
  const isPhraseLike = queryKind === 'phrase' || queryKind === 'grammar';

  // 标题自愈保护：如果词条 word 仍然是中文原词，尝试使用 lemma、annotated 提取、breakdown 或 reading 呈现日文标题
  const displayWord = useMemo(() => {
    if (!entry) return currentQueryWord;
    const w = entry.word || '';
    const isChinese =
      (entry.originalQuery && w === entry.originalQuery) ||
      DISTINCT_CHINESE_CHAR_REGEX.test(w);
    if (!isChinese) return w;

    if (entry.lemma && !DISTINCT_CHINESE_CHAR_REGEX.test(entry.lemma)) {
      return entry.lemma;
    }
    if (entry.annotated) {
      const stripped = entry.annotated
        .replace(/\{([^{}\[\]]+)\[[^{}\[\]]*\]\}/g, '$1')
        .replace(/[{}[\]]/g, '')
        .trim();
      if (stripped && !DISTINCT_CHINESE_CHAR_REGEX.test(stripped) && stripped !== w) {
        return stripped;
      }
    }
    if (entry.breakdown && entry.breakdown.length > 0) {
      const joined = entry.breakdown
        .map((b) => (typeof b?.jp === 'string' ? b.jp.trim() : ''))
        .join('');
      if (joined && !DISTINCT_CHINESE_CHAR_REGEX.test(joined) && joined !== w) {
        return joined;
      }
      const bJp = entry.breakdown[0].jp?.trim();
      if (bJp && !DISTINCT_CHINESE_CHAR_REGEX.test(bJp) && bJp !== w) {
        return bJp;
      }
    }
    if (entry.reading && /[ぁ-んァ-ヶ]/.test(entry.reading) && !DISTINCT_CHINESE_CHAR_REGEX.test(entry.reading)) {
      return entry.reading;
    }
    return w;
  }, [entry, currentQueryWord]);

  const wordIsSaved = isWordLike ? isSaved || !!savedItem : !!savedExpression;

  // 手动点击触发单词发音（绝不自动播放声音）
  const handleSpeakWord = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry) return;
    setIsPlaying(true);
    speechService.speak(
      entry.reading || entry.word,
      ttsRate,
      undefined,
      () => setIsPlaying(true),
      () => setIsPlaying(false),
      () => setIsPlaying(false)
    );
  };

  // 手动点击触发例句发音
  const handleSpeakExample = (e: React.MouseEvent, jpText: string, idx: number) => {
    e.stopPropagation();
    if (playingExampleIdx === idx) {
      speechService.stop();
      setPlayingExampleIdx(null);
      return;
    }
    setPlayingExampleIdx(idx);
    speechService.speak(
      jpText,
      ttsRate,
      undefined,
      () => setPlayingExampleIdx(idx),
      () => setPlayingExampleIdx(null),
      () => setPlayingExampleIdx(null)
    );
  };

  // 切换查看辞书原型或当前活用形
  const handleToggleLemma = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry?.lemma) return;
    if (currentQueryWord === entry.lemma) {
      // 切换回原查询词
      setCurrentQueryWord(word);
      setCurrentQueryReading(reading);
    } else {
      // 切换为原型
      setCurrentQueryWord(entry.lemma);
      setCurrentQueryReading(entry.lemmaReading || entry.reading);
    }
  };

  // 保存/移出生词档案切换
  const handleSaveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry) return;

    // 释义尚未就绪（占位词条）时不允许收藏，避免把"正在生成精准释义..."写进收藏夹
    if (isPlaceholderMeaning(entry.meaning)) return;

    // 非单词（短语 / 句型 / 整句）→ 写入独立的收藏集合
    if (queryKind !== 'word') {
      if (savedExpression && onRemoveExpression) {
        onRemoveExpression(savedExpression.id);
        return;
      }
      if (onSaveExpression) {
        onSaveExpression({
          text: entry.word,
          reading: entry.reading,
          annotated: entry.annotated,
          meaning: entry.meaning,
          detail: entry.detail,
          breakdown: entry.breakdown,
          pos: entry.pos,
          level: entry.level,
          examples: entry.examples,
          kind: queryKind === 'grammar' ? 'grammar' : queryKind === 'phrase' ? 'phrase' : 'sentence',
          source: entry.source || 'ai',
        });
      }
      return;
    }

    if (wordIsSaved && savedItem && onRemoveWord) {
      userRemovedWordsRef.current.add(canonicalWord);
      userRemovedWordsRef.current.add(currentQueryWord);
      onRemoveWord(savedItem.id);
    } else if (onSaveWord) {
      userRemovedWordsRef.current.delete(canonicalWord);
      userRemovedWordsRef.current.delete(currentQueryWord);
      lastSyncedSignatureRef.current = '';
      syncEntryToNotebook(entry, true);
    }
  };

  // 声调类型描述
  const getPitchLabel = (pitch?: number) => {
    if (pitch === undefined) return null;
    if (pitch === 0) return '0调 · 平板型';
    if (pitch === 1) return '1调 · 头高型';
    return `${pitch}调 · 中高/尾高型`;
  };

  if (!entry) return null;

  const originalQueryText = entry.originalQuery || (displayWord !== entry.word ? entry.word : undefined);

  // 将释义文本中包含的多项分条（如 ① ② 等）格式化
  // 整句译文必须保持一整段自然语流，绝不按数字/符号拆散
  const meaningLines = isSentenceLike
    ? [entry.meaning]
    : (entry.meaning || '')
        .split(/(?=[①②③④⑤⑥\d+\.])/g)
        .map((s) => s.trim())
        .filter(Boolean);

  // 分类型的分区标题：让"查单词"与"翻译句子/解析短语"呈现完全不同的信息骨架
  const meaningTitle = isSentenceLike
    ? '中文翻译'
    : queryKind === 'grammar'
      ? '句型含义'
      : queryKind === 'phrase'
        ? '整体释义'
        : '词典释义';

  const detailTitle = isSentenceLike
    ? '整句语感与要点'
    : queryKind === 'grammar'
      ? '接续规则与用法辨析'
      : queryKind === 'phrase'
        ? '结构剖析与语境点拨'
        : '用法搭配与考点';

  // 词性徽章只在有信息量时展示：占位词条上的"汉字词汇 / 假名词汇"等自动分类 tag 一律隐藏
  const posIsInformative =
    !!entry.pos && !entry.isPlaceholder && !MEANINGLESS_POS_LABELS.has(entry.pos);

  const saveLabel = wordIsSaved ? '已收藏' : '收藏';

  const saveTitle = wordIsSaved
    ? isWordLike
      ? '点击从生词本移出'
      : '点击取消收藏'
    : isWordLike
      ? '收录到生词本'
      : '收藏这条表达，随时回看';

  return (
    <>
      {/* 隐形全屏遮罩：点击任意外部区域干净利落关闭 */}
      <div className="word-popover-backdrop" onClick={onClose} />

      <div
        ref={popoverRef}
        className={`word-dictionary-popover popover-kind-${queryKind} ${
          position.isTop ? 'placed-top' : 'placed-bottom'
        }`}
        data-theme={themeColor}
        style={
          {
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${targetWidth}px`,
            maxHeight: `${position.maxHeight}px`,
            ...(rubyColor ? { '--ruby-color': rubyColor } : {}),
          } as React.CSSProperties
        }
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${isWordLike ? '词典' : '翻译解析'}：${displayWord}`}
      >
        {/* 指向单词中心的小三角形指示箭头 */}
        <div
          className="popover-anchor-arrow"
          style={{ left: `${position.arrowLeft}px` }}
        />

        {/* 头部：词头/原句、假名读音、类型标签、朗读、关闭 */}
        <div className="dict-popover-header">
          <div className="dict-word-title-group">
            <div className="dict-word-surface-row">
              {isWordLike ? (
                <FuriganaTitle
                  surface={displayWord}
                  reading={entry.reading}
                  className="dict-word-surface"
                />
              ) : (
                /* 短语/句型/整句：整段原文作为标题，按软件统一的 {原文[读音]} 语法渲染振假名
                   （AI 未提供逐词注音串时，退化为纯原文 + 独立读音行） */
                <div className={`dict-query-text kind-${queryKind}`}>
                  {entry.annotated ? renderDictRuby(entry.annotated) : displayWord}
                </div>
              )}
            </div>

            {/* 非单词：仅当没有逐词注音串时，才把整段假名读音单独成行，避免读音丢失 */}
            {!isWordLike && entry.reading && entry.reading !== displayWord && !entry.annotated && (
              <div className="dict-query-reading">{entry.reading}</div>
            )}

            {/* 如果为中文内容查询日文，显示查询内容 */}
            {originalQueryText && originalQueryText !== displayWord && (
              <div className="dict-word-original-query">
                <span className="dict-original-text">查询内容：{originalQueryText}</span>
              </div>
            )}

            {/* 标签栏：类型、JLPT 等级、声调、词库来源 */}
            <div className="dict-tags-row">
              {/* 占位词条上的"汉字词汇 / 假名词汇"等自动分类无信息量，AI 权威词条返回前一律不显示 */}
              {posIsInformative && <span className="dict-pos-badge">{entry.pos}</span>}
              {entry.level && (
                <span className={`dict-level-badge level-${entry.level.toLowerCase()}`}>
                  {entry.level}
                </span>
              )}
              {/* 声调核只对单个词/词组有意义；整句一律不显示 */}
              {entry.pitch !== undefined && !isSentenceLike && (
                <span className="dict-pitch-badge" title="标准东京声调核">
                  {getPitchLabel(entry.pitch)}
                </span>
              )}
              {isAiLoading ? (
                <span className="dict-cache-tag dict-ai-loading" title="正在调用 AI 智能获取精准释义与例句...">
                  <Sparkles size={10} className="animate-spin text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {isWordLike ? 'AI 释义中...' : 'AI 解析中...'}
                  </span>
                </span>
              ) : entry.source === 'ai' ? (
                <span className="dict-cache-tag dict-ai-tag" title="AI 权威词条已永久保存在本地词库，0延迟离线命中">
                  <Sparkles size={10} />
                  <span>{isWordLike ? 'AI 词条' : 'AI 解析'}</span>
                </span>
              ) : (
                <span className="dict-cache-tag" title="本地离线词典直接读取，0延迟，0 Token消耗">
                  <Sparkles size={10} />
                  <span>离线词库</span>
                </span>
              )}
            </div>
          </div>

          <div className="dict-header-actions">
            {/* AI 权威释义增强/刷新按钮 */}
            <button
              type="button"
              className={`dict-ai-btn ${isAiLoading ? 'loading' : ''}`}
              onClick={handleManualAiLookup}
              disabled={isAiLoading}
              title={
                isAiLoading
                  ? 'AI 正在生成中...'
                  : isWordLike
                    ? '点击使用 AI 获取更详尽权威的词典释义与地道例句'
                    : '点击使用 AI 重新翻译解析'
              }
              aria-label="AI 词条生成"
            >
              {isAiLoading ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
            </button>

            {/* 手动朗读发音按钮 */}
            <button
              type="button"
              className={`dict-speak-btn ${isPlaying ? 'playing' : ''}`}
              onClick={handleSpeakWord}
              title="点击播放标准发音（不会自动播放声音）"
              aria-label="播放发音"
            >
              <Volume2 size={15} />
            </button>
            <button
              type="button"
              className="dict-close-btn"
              onClick={onClose}
              title="关闭词典 (Esc)"
              aria-label="关闭词典"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* 核心内容展示区域：滚动容器 */}
        <div className="dict-popover-body">
          {/* 活用形态推导提示（仅对纯单词且存在变位时展示） */}
          {isWordLike && entry.lemma && entry.lemma !== entry.word && (
            <div className="dict-lemma-card">
              <div className="dict-lemma-info">
                <div className="dict-lemma-primary">
                  <span className="dict-lemma-label">原型(辞书形)：</span>
                  <FuriganaTitle
                    surface={entry.lemma}
                    reading={entry.lemmaReading}
                    className="dict-lemma-word"
                  />
                </div>
                {entry.inflectionForm && (
                  <span className="dict-infl-tag">
                    {entry.inflectionForm}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="dict-lemma-switch-btn"
                onClick={handleToggleLemma}
                title="切换查看辞书原型词条释义"
              >
                <ArrowRightLeft size={11} />
                <span>{currentQueryWord === entry.lemma ? '看活用形' : '看原型'}</span>
              </button>
            </div>
          )}

          {/* 核心内容区：整句用醒目的"译文卡片"，单词/短语用常规释义块 */}
          {isSentenceLike ? (
            <div className="dict-translation-card">
              <div className="dict-section-title">
                <Languages size={12} />
                <span>{meaningTitle}</span>
              </div>
              <div className="dict-translation-text">{entry.meaning}</div>
            </div>
          ) : (
            <div className="dict-meaning-block">
              <div className="dict-section-title">
                <BookOpen size={12} />
                <span>{meaningTitle}</span>
              </div>
              <div className="dict-meaning-content">
                {meaningLines.length > 1 ? (
                  <ul className="dict-meaning-list">
                    {meaningLines.map((line, idx) => (
                      <li key={idx} className="dict-meaning-item">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="dict-meaning-text">{entry.meaning}</div>
                )}
              </div>
            </div>
          )}

          {/* 成分/结构拆解（短语、句型、整句专用） */}
          {!isWordLike && entry.breakdown && entry.breakdown.length > 0 && (
            <div className="dict-breakdown-block">
              <div className="dict-section-title">
                <ListTree size={12} />
                <span>{isSentenceLike ? '成分拆解' : '结构拆解'}</span>
              </div>
              <ul className="dict-breakdown-list">
                {entry.breakdown.map((seg, idx) => (
                  <li key={idx} className="dict-breakdown-item">
                    <span className="dict-bd-jp">{seg.jp}</span>
                    {seg.role && <span className="dict-bd-role">{seg.role}</span>}
                    {seg.zh && <span className="dict-bd-zh">{seg.zh}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 用法要点 / 语感点拨（若有） */}
          {entry.detail && (
            <div className="dict-detail-card">
              <div className="dict-section-title">
                <Lightbulb size={12} />
                <span>{detailTitle}</span>
              </div>
              <div className="dict-detail-text">{entry.detail}</div>
            </div>
          )}

          {/* 经典搭配例句（若有） */}
          {entry.examples && entry.examples.length > 0 && (
            <div className="dict-examples-block">
              <div className="dict-section-title">
                <GraduationCap size={12} />
                <span>{isSentenceLike ? '相关表达 / 变体' : isPhraseLike ? '用法例句' : '例句'}</span>
              </div>
              <div className="dict-examples-list">
                {entry.examples.map((ex, idx) => (
                  <div key={idx} className="dict-example-item">
                    <div className="dict-ex-jp-row">
                      <span className="dict-ex-jp">{ex.jp}</span>
                      <button
                        type="button"
                        className={`dict-ex-audio-btn ${
                          playingExampleIdx === idx ? 'playing' : ''
                        }`}
                        onClick={(e) => handleSpeakExample(e, ex.jp, idx)}
                        title="朗读例句"
                      >
                        <Volume2 size={11} />
                      </button>
                    </div>
                    <div className="dict-ex-zh">{ex.zh}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏：一键收藏（单词进生词本 / 短语句型整句进收藏夹）、外部详细字典 */}
        <div className="dict-popover-footer">
          <div className="dict-footer-left">
            {/* 单词依赖 onSaveWord；短语/句型/整句依赖 onSaveExpression，二者具备其一即可展示 */}
            {(isWordLike ? !!onSaveWord : !!onSaveExpression) && (
              <button
                type="button"
                className={`dict-save-btn ${wordIsSaved ? 'is-saved' : ''}`}
                onClick={handleSaveToggle}
                title={saveTitle}
              >
                {wordIsSaved ? <Check size={13} /> : <Bookmark size={13} />}
                <span>{saveLabel}</span>
              </button>
            )}

            {/* Weblio 外部权威日日/日汉词典直达链接 */}
            {/* Weblio 外部权威日日/日汉词典直达链接（整句无对应词条，故不展示） */}
            {!isSentenceLike && (
              <a
                href={`https://www.weblio.jp/content/${encodeURIComponent(canonicalWord)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="dict-external-link"
                title="在 Weblio 辞书查看详尽日日释义与语源"
                onClick={(e) => e.stopPropagation()}
              >
                <span>Weblio 详解</span>
                <ExternalLink size={10} />
              </a>
            )}
          </div>

          <span className="dict-hint-tip">
            {isWordLike ? 'Esc 关闭' : 'AI 解析 · Esc 关闭'}
          </span>
        </div>
      </div>
    </>
  );
};
