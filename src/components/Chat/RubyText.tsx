import React, { useMemo } from 'react';
import { RubyToken, parseJapaneseContent, EXCLUDED_GRAMMAR_WORDS } from '../../utils/rubyParser';
import { FuriganaMode } from '../../types';
import { useDictionary } from '../../context/DictionaryContext';

interface RubyTextProps {
  content: string;
  furiganaMode?: FuriganaMode;
  pitchDisplayMode?: string;
  ttsRate?: number;
  onSaveWord?: (word: { surface: string; reading: string; meaning: string }) => void;
  isWordSaved?: (surface: string) => boolean;
  interactive?: boolean;
  isExplicitJapanese?: boolean;
}

export const RubyText: React.FC<RubyTextProps> = ({
  content,
  furiganaMode = 'always',
  interactive = true,
  isExplicitJapanese = false,
}) => {
  const {
    openDictionary,
    learnedWords = [],
    furiganaHideMastered = true,
    queriedTerms,
    queriedChineseTerms,
  } = useDictionary();

  // 提取已掌握生词集合（仅收录表面词形/辞书形，绝不收录假名读音，防止误隐藏其它同音词）
  const masteredWords = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(learnedWords)) {
      for (const w of learnedWords) {
        if (w && w.mastery === 'mastered' && w.surface) {
          set.add(w.surface);
        }
      }
    }
    return set;
  }, [learnedWords]);

  // 构造学情生词快速索引 Map（供注音系统精准获取读音、声调与释义，含掌握状态供 mastery 联动）
  const learnedWordsMap = useMemo(() => {
    const map = new Map<string, { reading?: string; meaning?: string; pitch?: number; pos?: string; level?: string; mastery?: 'learning' | 'reviewing' | 'mastered' }>();
    if (Array.isArray(learnedWords)) {
      for (const w of learnedWords) {
        if (w && w.surface) {
          map.set(w.surface, {
            reading: w.reading,
            meaning: w.meaning,
            pitch: w.pitch,
            pos: w.pos,
            level: w.level,
            mastery: w.mastery,
          });
        }
      }
    }
    return map;
  }, [learnedWords]);

  const tokens = useMemo(() => {
    return parseJapaneseContent(content, {
      masteredWords,
      hideMasteredFurigana: furiganaHideMastered,
      isExplicitJapanese,
      showPlainFurigana: furiganaMode !== 'hidden',
      learnedWordsMap,
      queriedTerms,
      queriedChineseTerms,
    });
  }, [content, masteredWords, furiganaHideMastered, isExplicitJapanese, furiganaMode, learnedWordsMap, queriedTerms, queriedChineseTerms]);

  // 点击单词触发全局电子词典弹窗（明确标记为源自日文区域 isFromJTag: true）
  const handleWordClick = (e: React.MouseEvent, token: RubyToken) => {
    if (!interactive) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const lineEl = el.closest('.bubble-line') as HTMLElement | null;
    const bubbleEl = (lineEl?.closest('.message-bubble') || el.closest('.message-bubble')) as HTMLElement | null;
    const lineRect = lineEl?.getBoundingClientRect();
    const bubbleRect = bubbleEl?.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const targetWord = token.fullWord || token.surface;
    const targetReading = token.fullReading || token.reading;

    openDictionary({
      word: targetWord,
      reading: targetReading,
      anchorRect: rect,
      anchorEl: el,
      lineEl: lineEl || undefined,
      bubbleEl: bubbleEl || undefined,
      offsetInLine: lineRect
        ? { left: rect.left - lineRect.left, top: rect.top - lineRect.top, width: rect.width, height: rect.height }
        : null,
      offsetInBubble: bubbleRect
        ? { left: rect.left - bubbleRect.left, top: rect.top - bubbleRect.top, width: rect.width, height: rect.height }
        : null,
      isFromJTag: token.isFromJTag ?? isExplicitJapanese,
      sentenceContext: content,
    });
  };

  return (
    <span className="ruby-text-container">
      {tokens.map((token, index) => {
        // 普通标点符号与非日语说明文本
        if (token.type === 'text') {
          return (
            <span key={index} className="plain-text-segment">
              {token.surface}
            </span>
          );
        }

        const isHoverMode = furiganaMode === 'hover';
        const isHiddenMode = furiganaMode === 'hidden';

        // 识别出的平文词汇或语法助词（如 寿司、昨日、とても）
        if (token.type === 'plain-word') {
          const hasKanji = /[一-龯々〆]/.test(token.surface);

          if (hasKanji) {
            const showAnnotation = token.reading && !token.hideFurigana;
            return (
              <span
                key={index}
                className={`ruby-word-unit plain-dict-word ${
                  interactive ? 'clickable-word' : 'non-interactive'
                }`}
                onClick={interactive ? (e) => handleWordClick(e, token) : undefined}
                title={
                  interactive
                    ? `${token.fullWord || token.surface}${token.fullReading || token.reading ? `【${token.fullReading || token.reading}】` : ''} (点击查看释义)`
                    : undefined
                }
              >
                {token.prefixKana && (
                  <span className="ruby-prefix-kana">{token.prefixKana}</span>
                )}
                {showAnnotation ? (
                  <ruby
                    className={`ruby-item ${isHoverMode ? 'furigana-hover' : ''} ${
                      isHiddenMode ? 'furigana-hidden' : ''
                    }`}
                  >
                    <span className="ruby-base-surface">{token.surface}</span>
                    <rt className="ruby-rt-annotation">
                      <span className="ruby-reading-kana">{token.reading}</span>
                    </rt>
                  </ruby>
                ) : (
                  <span className="ruby-base-surface">{token.surface}</span>
                )}
                {token.okurigana && (
                  <span className="ruby-okurigana">{token.okurigana}</span>
                )}
              </span>
            );
          }

          const isExplicitlyQueriedOrLearned =
            token.isQueried ||
            (queriedTerms && (queriedTerms.has(token.surface.trim()) || (token.fullWord && queriedTerms.has(token.fullWord.trim())))) ||
            (learnedWordsMap && (learnedWordsMap.has(token.surface.trim()) || (token.fullWord && learnedWordsMap.has(token.fullWord.trim()))));

          // 核心过滤：语法助词、助动词、连词及纯单假名，若未被用户主动划选查询过，不画虚线查词，作为纯文本输出
          if (
            !isExplicitlyQueriedOrLearned &&
            (token.isParticle ||
              token.surface.trim().length <= 1 ||
              EXCLUDED_GRAMMAR_WORDS.has(token.surface.trim()))
          ) {
            return (
              <span key={index} className="plain-text-segment">
                {token.surface}
              </span>
            );
          }

          return (
            <span
              key={index}
              className={`plain-dict-word ${
                interactive ? 'clickable-word' : 'non-interactive'
              }`}
              onClick={interactive ? (e) => handleWordClick(e, token) : undefined}
              title={
                interactive
                  ? `${token.fullWord || token.surface}${token.fullReading || token.reading ? `【${token.fullReading || token.reading}】` : ''} (点击查看释义)`
                  : undefined
              }
            >
              {token.surface}
            </span>
          );
        }

        // 纯假名词（如 ゲームセンター、カレー）
        if (token.isPureKana) {
          const isExplicitlyQueriedOrLearned =
            token.isQueried ||
            (queriedTerms && (queriedTerms.has(token.surface.trim()) || (token.fullWord && queriedTerms.has(token.fullWord.trim())))) ||
            (learnedWordsMap && (learnedWordsMap.has(token.surface.trim()) || (token.fullWord && learnedWordsMap.has(token.fullWord.trim()))));

          if (
            !isExplicitlyQueriedOrLearned &&
            (token.surface.trim().length <= 1 ||
              EXCLUDED_GRAMMAR_WORDS.has(token.surface.trim()))
          ) {
            return (
              <span key={index} className="plain-text-segment">
                {token.surface}
              </span>
            );
          }

          return (
            <span
              key={index}
              className={`plain-kana-word ${interactive ? 'clickable-word' : 'non-interactive'}`}
              onClick={interactive ? (e) => handleWordClick(e, token) : undefined}
              title={interactive ? `${token.surface} (点击查看释义)` : undefined}
            >
              {token.surface}
            </span>
          );
        }

        // 显式带注音的汉字词汇（如 角[かど]、食[た]べました）
        const targetWord = token.fullWord || token.surface;
        const targetReading = token.fullReading || token.reading;
        const showExplicitAnnotation = token.reading && !token.hideFurigana;

        return (
          <span
            key={index}
            className={`ruby-word-unit plain-dict-word ${interactive ? 'clickable-word' : 'non-interactive'}`}
            onClick={interactive ? (e) => handleWordClick(e, token) : undefined}
            title={
              interactive
                ? `${targetWord}${targetReading ? `【${targetReading}】` : ''} (点击查看释义)`
                : undefined
            }
          >
            {token.prefixKana && (
              <span className="ruby-prefix-kana">{token.prefixKana}</span>
            )}
            {showExplicitAnnotation ? (
              <ruby
                className={`ruby-item ${isHoverMode ? 'furigana-hover' : ''} ${
                  isHiddenMode ? 'furigana-hidden' : ''
                }`}
              >
                <span className="ruby-base-surface">{token.surface}</span>
                <rt className="ruby-rt-annotation">
                  <span className="ruby-reading-kana">{token.reading}</span>
                </rt>
              </ruby>
            ) : (
              <span className="ruby-base-surface">{token.surface}</span>
            )}
            {token.okurigana && (
              <span className="ruby-okurigana">{token.okurigana}</span>
            )}
          </span>
        );
      })}
    </span>
  );
};
