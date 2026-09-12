import React, { useState, useMemo, useEffect } from 'react';
import { LearnedWord, LearnedGrammar, FavoriteExpression } from '../../types';
import { RubyText } from '../Chat/RubyText';
import { FuriganaTitle } from '../Common/FuriganaTitle';
import { speechService } from '../../services/speechService';
import {
  X,
  Search,
  Brain,
  Sprout,
  BookOpen,
  Volume2,
  Trash2,
  RotateCw,
  CheckCircle2,
  Clock,
  HelpCircle,
  GraduationCap,
  Layers,
  Bookmark,
} from 'lucide-react';

interface KnowledgeReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  learnedWords: LearnedWord[];
  learnedGrammar: LearnedGrammar[];
  /** 手动收藏的短语 / 句型 / 整句 */
  favoriteExpressions?: FavoriteExpression[];
  onRemoveFavorite?: (idOrText: string) => void;
  onRemoveWord: (id: string) => void;
  onRemoveGrammar: (id: string) => void;
  onUpdateWordMastery: (id: string, mastery: 'learning' | 'reviewing' | 'mastered') => void;
  onUpdateGrammarMastery: (id: string, mastery: 'learning' | 'reviewing' | 'mastered') => void;
  onRecordReviewResult: (type: 'word' | 'grammar', id: string, result: 'remembered' | 'forgot' | 'mastered') => void;
  onTriggerAiQuiz?: (prompt: string) => void;
  ttsRate?: number;
  /** 打开时聚焦的页签（对话区「已收录语法」提示会定位到 grammar） */
  initialTab?: 'vocab' | 'grammar' | 'favorites';
  /** 打开时需要高亮并快速平滑滚动定位的目标词汇或语法条目 */
  highlightTarget?: string | null;
  onClearHighlight?: () => void;
}

export const KnowledgeReviewModal: React.FC<KnowledgeReviewModalProps> = ({
  isOpen,
  onClose,
  learnedWords,
  learnedGrammar,
  favoriteExpressions = [],
  onRemoveFavorite,
  onRemoveWord,
  onRemoveGrammar,
  onUpdateWordMastery,
  onUpdateGrammarMastery,
  onRecordReviewResult,
  onTriggerAiQuiz,
  ttsRate = 1.0,
  initialTab = 'vocab',
  highlightTarget,
  onClearHighlight,
}) => {
  const [activeTab, setActiveTab] = useState<'vocab' | 'grammar' | 'favorites'>(initialTab);
  const [masteryFilter, setMasteryFilter] = useState<'ALL' | 'learning' | 'reviewing' | 'mastered'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Flashcard Review Mode State
  const [isFlashcardMode, setIsFlashcardMode] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // 目标条目匹配函数（兼容全角波浪号、半角波浪号、前后空格）
  const cleanTarget = useMemo(() => {
    return (highlightTarget || '').replace(/[〜～~]/g, '').trim().toLowerCase();
  }, [highlightTarget]);

  const isWordTarget = (w: LearnedWord) => {
    if (!cleanTarget) return false;
    const s = w.surface.toLowerCase();
    const r = (w.reading || '').toLowerCase();
    return s === cleanTarget || r === cleanTarget || s.includes(cleanTarget) || cleanTarget.includes(s);
  };

  const isGrammarTarget = (g: LearnedGrammar) => {
    if (!cleanTarget) return false;
    const t = g.title.replace(/[〜～~]/g, '').trim().toLowerCase();
    return t === cleanTarget || t.includes(cleanTarget) || cleanTarget.includes(t);
  };

  // 每次打开或目标切换时：若有指定跳转目标，自动重置过滤、确保列表模式并平滑滚动到对应卡片
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setFlashcardIndex(0);
      setIsFlipped(false);

      if (highlightTarget) {
        setIsFlashcardMode(false);
        setMasteryFilter('ALL');
        setSearchQuery('');

        // 等待模态框动画与 DOM 渲染就绪后执行平滑居中滚动
        const scrollTimer = setTimeout(() => {
          const targetEl = document.querySelector<HTMLElement>('.card-focus-highlight');
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 160);

        return () => clearTimeout(scrollTimer);
      }
    }
  }, [isOpen, initialTab, highlightTarget]);

  // Filtered lists
  const filteredWords = useMemo(() => {
    return learnedWords.filter((w) => {
      const matchMastery = masteryFilter === 'ALL' || w.mastery === masteryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        w.surface.toLowerCase().includes(q) ||
        w.reading.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q);
      return matchMastery && matchQuery;
    });
  }, [learnedWords, masteryFilter, searchQuery]);

  // 语法列表排序：先按 JLPT 等级由易到难，同级别内新收录的优先
  const filteredGrammar = useMemo(() => {
    const LEVEL_ORDER: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
    const list = learnedGrammar.filter((g) => {
      const matchMastery = masteryFilter === 'ALL' || g.mastery === masteryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.meaning.toLowerCase().includes(q) ||
        g.structure.toLowerCase().includes(q) ||
        (g.explanation || '').toLowerCase().includes(q);
      return matchMastery && matchQuery;
    });
    return [...list].sort((a, b) => {
      const la = LEVEL_ORDER[(a.level || '').toUpperCase()] ?? 9;
      const lb = LEVEL_ORDER[(b.level || '').toUpperCase()] ?? 9;
      if (la !== lb) return la - lb;
      return (b.learnedAt || 0) - (a.learnedAt || 0);
    });
  }, [learnedGrammar, masteryFilter, searchQuery]);

  // 收藏的短语 / 句型 / 整句：只有搜索，没有掌握度分级
  const filteredFavorites = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return favoriteExpressions;
    return favoriteExpressions.filter(
      (f) =>
        f.text.toLowerCase().includes(q) ||
        (f.reading || '').toLowerCase().includes(q) ||
        f.meaning.toLowerCase().includes(q)
    );
  }, [favoriteExpressions, searchQuery]);

  // Flashcard items derived from active tab's filtered list（收藏夹不提供闪卡自测）
  const flashcardItems = activeTab === 'grammar' ? filteredGrammar : filteredWords;
  const currentCard = flashcardItems[flashcardIndex];
  const canUseFlashcard = activeTab !== 'favorites';
  const showFlashcard = isFlashcardMode && canUseFlashcard;

  // Stats calculation
  const totalWords = learnedWords.length;
  const wordsLearning = learnedWords.filter((w) => w.mastery === 'learning').length;
  const wordsReviewing = learnedWords.filter((w) => w.mastery === 'reviewing').length;
  const wordsMastered = learnedWords.filter((w) => w.mastery === 'mastered').length;

  const totalGrammar = learnedGrammar.length;
  const grammarLearning = learnedGrammar.filter((g) => g.mastery === 'learning').length;
  const grammarReviewing = learnedGrammar.filter((g) => g.mastery === 'reviewing').length;
  const grammarMastered = learnedGrammar.filter((g) => g.mastery === 'mastered').length;

  // Active tab dynamic counts for filter pills（收藏夹无掌握度概念，故为空）
  const currentTabItems =
    activeTab === 'grammar' ? learnedGrammar : activeTab === 'vocab' ? learnedWords : [];
  const countAll = currentTabItems.length;
  const countLearning = currentTabItems.filter((i) => i.mastery === 'learning').length;
  const countReviewing = currentTabItems.filter((i) => i.mastery === 'reviewing').length;
  const countMastered = currentTabItems.filter((i) => i.mastery === 'mastered').length;

  const overallMasteryRate =
    totalWords + totalGrammar > 0
      ? Math.round(((wordsMastered + grammarMastered) / (totalWords + totalGrammar)) * 100)
      : 0;

  if (!isOpen) return null;

  const handleNextCard = () => {
    setIsFlipped(false);
    if (flashcardIndex < flashcardItems.length - 1) {
      setFlashcardIndex((prev) => prev + 1);
    } else {
      setFlashcardIndex(0);
    }
  };

  const handleFlashcardRating = (result: 'forgot' | 'remembered' | 'mastered') => {
    if (!currentCard) return;
    onRecordReviewResult(activeTab === 'vocab' ? 'word' : 'grammar', currentCard.id, result);
    handleNextCard();
  };

  const handleRequestAiQuiz = () => {
    if (!onTriggerAiQuiz) return;
    const reviewWordList = learnedWords
      .filter((w) => w.mastery !== 'mastered')
      .slice(0, 5)
      .map((w) => `${w.surface}（${w.reading}）`);
    const reviewGrammarList = learnedGrammar
      .filter((g) => g.mastery !== 'mastered')
      .slice(0, 3)
      .map((g) => g.title);

    let prompt = '老师，我想针对我最近学过的知识进行一次【专项强化测验】！';
    if (reviewWordList.length > 0) {
      prompt += `\n请针对我正在学习的单词：【${reviewWordList.join('、')}】`;
    }
    if (reviewGrammarList.length > 0) {
      prompt += `\n以及语法点：【${reviewGrammarList.join('、')}】`;
    }
    prompt += '\n为我出一道结合日常场景的实用造句或选择填空题考考我，并用中文详细批改我的回答！';

    onClose();
    onTriggerAiQuiz(prompt);
  };

  const renderMasteryBadge = (mastery: 'learning' | 'reviewing' | 'mastered', count: number) => {
    switch (mastery) {
      case 'mastered':
        return (
          <span className="knowledge-mastery-badge mastered" title={`温习 ${count} 次，已熟记`}>
            <CheckCircle2 size={12} />
            <span>已掌握</span>
          </span>
        );
      case 'reviewing':
        return (
          <span className="knowledge-mastery-badge reviewing" title={`温习 ${count} 次`}>
            <Clock size={12} />
            <span>温习 ({count}次)</span>
          </span>
        );
      default:
        return (
          <span className="knowledge-mastery-badge learning" title={`初学阶段`}>
            <Sprout size={12} />
            <span>初学</span>
          </span>
        );
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large knowledge-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="knowledge-title-icon">
              <Brain size={22} className="text-sakura-primary" />
            </div>
            <div>
              <div className="knowledge-title-main">
                <h2>学情档案与知识库</h2>
                <span className="knowledge-memory-tag">跨会话永久记忆</span>
              </div>
              <p className="modal-subtitle">
                <span className="knowledge-subtitle-full">
                  自动收录对话中出现的重点词汇与句型语法，AI 已将此同步为你的先验知识，不会重新科普
                </span>
                <span className="knowledge-subtitle-short">
                  跨会话永久记忆 · 对话重点智能沉淀
                </span>
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {/* Overview Stats Bar */}
        <div className="knowledge-stats-row">
          <div className="knowledge-stat-cards-grid">
            <div className="knowledge-stat-card">
              <span className="stat-label">已收录生词库</span>
              <div className="stat-val-group">
                <span className="stat-value">{totalWords}</span>
                <span className="stat-unit">词</span>
              </div>
              <div className="stat-breakdown-row">
                <span className="breakdown-item learning" title="初学阶段">
                  <Sprout size={13} />
                  <span>{wordsLearning}</span>
                </span>
                <span className="breakdown-sep">/</span>
                <span className="breakdown-item reviewing" title="温习巩固">
                  <Clock size={13} />
                  <span>{wordsReviewing}</span>
                </span>
                <span className="breakdown-sep">/</span>
                <span className="breakdown-item mastered" title="已熟练掌握">
                  <CheckCircle2 size={13} />
                  <span>{wordsMastered}</span>
                </span>
              </div>
            </div>
            <div className="knowledge-stat-card">
              <span className="stat-label">重点句型语法</span>
              <div className="stat-val-group">
                <span className="stat-value">{totalGrammar}</span>
                <span className="stat-unit">条</span>
              </div>
              <div className="stat-breakdown-row">
                <span className="breakdown-item learning" title="初学阶段">
                  <Sprout size={13} />
                  <span>{grammarLearning}</span>
                </span>
                <span className="breakdown-sep">/</span>
                <span className="breakdown-item reviewing" title="温习巩固">
                  <Clock size={13} />
                  <span>{grammarReviewing}</span>
                </span>
                <span className="breakdown-sep">/</span>
                <span className="breakdown-item mastered" title="已熟练掌握">
                  <CheckCircle2 size={13} />
                  <span>{grammarMastered}</span>
                </span>
              </div>
            </div>
            <div className="knowledge-stat-card">
              <span className="stat-label">综合掌握率</span>
              <div className="stat-val-group">
                <span className="stat-value">{overallMasteryRate}%</span>
                <div className="mini-progress-track">
                  <div className="mini-progress-fill" style={{ width: `${overallMasteryRate}%` }} />
                </div>
              </div>
              <span className="stat-progress-sub">已熟练掌握 {wordsMastered + grammarMastered} / {totalWords + totalGrammar} 项知识点</span>
            </div>
          </div>

          <button className="ai-quiz-trigger-btn" onClick={handleRequestAiQuiz} title="将薄弱项整理并让 AI 私教生成测试题">
            <GraduationCap size={16} />
            <span className="quiz-btn-text-full">让 AI 私教考考我</span>
            <span className="quiz-btn-text-short">AI 考考我</span>
          </button>
        </div>

        {/* Action & Filter Bar */}
        <div className="knowledge-toolbar">
          <div className="knowledge-tabs">
            <button
              className={`knowledge-tab-btn ${activeTab === 'vocab' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('vocab');
                setFlashcardIndex(0);
                setIsFlipped(false);
              }}
            >
              <BookOpen size={15} />
              <span>生词本 ({totalWords})</span>
            </button>
            <button
              className={`knowledge-tab-btn ${activeTab === 'grammar' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('grammar');
                setFlashcardIndex(0);
                setIsFlipped(false);
              }}
            >
              <Layers size={15} />
              <span>句型语法 ({totalGrammar})</span>
            </button>
            <button
              className={`knowledge-tab-btn ${activeTab === 'favorites' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('favorites');
                setFlashcardIndex(0);
                setIsFlipped(false);
              }}
              title="手动收藏的短语 / 句型 / 整句"
            >
              <Bookmark size={15} />
              <span>收藏 ({favoriteExpressions.length})</span>
            </button>
          </div>

          <div className="knowledge-controls">
            {/* 收藏夹不含掌握度分级，隐藏筛选药丸，保持界面干净 */}
            {activeTab !== 'favorites' && (
            <div className="knowledge-filter-pills">
              <button
                className={`knowledge-filter-pill ${masteryFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setMasteryFilter('ALL');
                  setFlashcardIndex(0);
                  setIsFlipped(false);
                }}
              >
                <span>全部</span>
                <span className="filter-count-badge">{countAll}</span>
              </button>
              <button
                className={`knowledge-filter-pill filter-learning ${masteryFilter === 'learning' ? 'active' : ''}`}
                onClick={() => {
                  setMasteryFilter('learning');
                  setFlashcardIndex(0);
                  setIsFlipped(false);
                }}
              >
                <Sprout size={12} />
                <span>初学</span>
                <span className="filter-count-badge">{countLearning}</span>
              </button>
              <button
                className={`knowledge-filter-pill filter-reviewing ${masteryFilter === 'reviewing' ? 'active' : ''}`}
                onClick={() => {
                  setMasteryFilter('reviewing');
                  setFlashcardIndex(0);
                  setIsFlipped(false);
                }}
              >
                <Clock size={12} />
                <span>温习</span>
                <span className="filter-count-badge">{countReviewing}</span>
              </button>
              <button
                className={`knowledge-filter-pill filter-mastered ${masteryFilter === 'mastered' ? 'active' : ''}`}
                onClick={() => {
                  setMasteryFilter('mastered');
                  setFlashcardIndex(0);
                  setIsFlipped(false);
                }}
              >
                <CheckCircle2 size={12} />
                <span>已掌握</span>
                <span className="filter-count-badge">{countMastered}</span>
              </button>
            </div>
            )}

            <div className="knowledge-search-actions-row">
              <div className="knowledge-search-input-wrapper">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder={
                    activeTab === 'vocab'
                      ? '搜索生词、读音、释义...'
                      : activeTab === 'favorites'
                        ? '搜索收藏的原文、读音、释义...'
                        : '搜索语法标题、释义、接续...'
                  }
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setFlashcardIndex(0);
                    setIsFlipped(false);
                  }}
                  className="knowledge-search-input"
                />
              </div>

              {canUseFlashcard && (
              <button
                className={`flashcard-mode-toggle ${isFlashcardMode ? 'active' : ''}`}
                onClick={() => {
                  setIsFlashcardMode(!isFlashcardMode);
                  setIsFlipped(false);
                  setFlashcardIndex(0);
                }}
              >
                <RotateCw size={14} />
                <span className="toggle-label-full">{isFlashcardMode ? '列表视图' : '🎴 闪卡自测'}</span>
                <span className="toggle-label-short">{isFlashcardMode ? '列表' : '🎴 闪卡'}</span>
              </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body: Flashcard Mode OR List Mode */}
        <div className="modal-body knowledge-modal-body">
          {showFlashcard ? (
            /* Flashcard Interactive View */
            <div className="flashcard-container">
              {flashcardItems.length === 0 ? (
                <div className="knowledge-empty-state">
                  <HelpCircle size={40} className="empty-icon" />
                  <p>当前分类下暂无需要复习的卡片</p>
                  <button className="empty-action-btn" onClick={() => setMasteryFilter('ALL')}>
                    查看全部卡片
                  </button>
                </div>
              ) : (
                <div className="flashcard-wrapper">
                  <div className="flashcard-top-info">
                    <span className="card-progress-label">
                      卡片 {flashcardIndex + 1} / {flashcardItems.length}
                    </span>
                    <span className="card-hint">点击卡片正反面翻转</span>
                  </div>

                  <div
                    className={`flashcard-item ${isFlipped ? 'flipped' : ''}`}
                    onClick={() => setIsFlipped(!isFlipped)}
                  >
                    {!isFlipped ? (
                      /* Card Front */
                      <div className="flashcard-front">
                        <div className="card-badge-row">
                          <span className="card-type-tag">{activeTab === 'vocab' ? '日文单词' : '语法句型'}</span>
                          {currentCard &&
                            renderMasteryBadge(currentCard.mastery, currentCard.reviewCount)}
                        </div>

                        <div className="card-main-content">
                          {activeTab === 'vocab' ? (
                            <h2 className="card-japanese-surface">{(currentCard as LearnedWord).surface}</h2>
                          ) : (
                            <h2 className="card-grammar-title">
                              <RubyText content={(currentCard as LearnedGrammar).title} interactive={false} ttsRate={ttsRate} />
                            </h2>
                          )}
                        </div>

                        <div className="card-flip-prompt">
                          <RotateCw size={14} />
                          <span>点击翻转查看读音与释义</span>
                        </div>
                      </div>
                    ) : (
                      /* Card Back */
                      <div className="flashcard-back">
                        <div className="card-badge-row">
                          <span className="card-type-tag">释义解析</span>
                          {currentCard &&
                            renderMasteryBadge(currentCard.mastery, currentCard.reviewCount)}
                        </div>

                        {activeTab === 'vocab' ? (
                          <div className="card-back-details">
                            <div className="card-back-reading-group">
                              <FuriganaTitle
                                surface={(currentCard as LearnedWord).surface}
                                reading={(currentCard as LearnedWord).reading}
                                className="card-back-furigana-title"
                              />
                              {(currentCard as LearnedWord).pitch !== undefined && (
                                <span className="card-pitch-tag">
                                  声调: [{(currentCard as LearnedWord).pitch}] {
                                    (currentCard as LearnedWord).pitch === 0
                                      ? '平板型'
                                      : (currentCard as LearnedWord).pitch === 1
                                      ? '头高型'
                                      : '尾高/中高型'
                                  }
                                </span>
                              )}
                              {(currentCard as LearnedWord).level && (
                                <span className="card-level-tag">{(currentCard as LearnedWord).level}</span>
                              )}
                              {(currentCard as LearnedWord).pos && (
                                <span className="card-pos-tag">{(currentCard as LearnedWord).pos}</span>
                              )}
                              <button
                                className="card-audio-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  speechService.speak(
                                    (currentCard as LearnedWord).reading || (currentCard as LearnedWord).surface,
                                    ttsRate
                                  );
                                }}
                              >
                                <Volume2 size={16} />
                              </button>
                            </div>
                            <div className="card-meaning-block">
                              <span className="card-meaning-label">释义：</span>
                              <span className="card-meaning-text">{(currentCard as LearnedWord).meaning}</span>
                            </div>
                            {(currentCard as LearnedWord).detail && (
                              <div className="card-detail-block">
                                <span className="card-detail-label">用法：</span>
                                <span className="card-detail-text">{(currentCard as LearnedWord).detail}</span>
                              </div>
                            )}
                            {(currentCard as LearnedWord).exampleJp && (
                              <div className="card-example-block">
                                <div className="example-jp-line">
                                  <RubyText content={(currentCard as LearnedWord).exampleJp!} ttsRate={ttsRate} />
                                </div>
                                {(currentCard as LearnedWord).exampleCn && (
                                  <p className="example-cn-line">{(currentCard as LearnedWord).exampleCn}</p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="card-back-details">
                            <div className="card-grammar-structure">
                              <span className="structure-label">接续公式：</span>
                              <span className="structure-content">
                                <RubyText content={(currentCard as LearnedGrammar).structure} interactive={false} ttsRate={ttsRate} />
                              </span>
                            </div>
                            <div className="card-meaning-block">
                              <span className="card-meaning-label">核心释义：</span>
                              <span className="card-meaning-text">
                                <RubyText content={(currentCard as LearnedGrammar).meaning} interactive={false} ttsRate={ttsRate} />
                              </span>
                              {(currentCard as LearnedGrammar).level && (
                                <span className="grammar-level-badge" style={{ marginLeft: 8 }}>
                                  {(currentCard as LearnedGrammar).level}
                                </span>
                              )}
                            </div>
                            {(currentCard as LearnedGrammar).explanation && (
                              <div className="card-detail-block">
                                <span className="card-detail-label">💡 语法点拨：</span>
                                <span className="card-detail-text">
                                  <RubyText content={(currentCard as LearnedGrammar).explanation!} interactive={false} ttsRate={ttsRate} />
                                </span>
                              </div>
                            )}
                            {(currentCard as LearnedGrammar).exampleJp && (
                              <div className="card-example-block">
                                <div className="example-jp-line">
                                  <RubyText content={(currentCard as LearnedGrammar).exampleJp!} ttsRate={ttsRate} />
                                </div>
                                {(currentCard as LearnedGrammar).exampleCn && (
                                  <div className="example-cn-line">{(currentCard as LearnedGrammar).exampleCn}</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="card-flip-prompt">
                          <span>点击再次翻转</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rating Actions */}
                  <div className="flashcard-rating-actions">
                    <button
                      className="rating-btn btn-forgot"
                      onClick={() => handleFlashcardRating('forgot')}
                      title="没想起来，重置为初学状态"
                    >
                      <X size={16} />
                      <span className="rating-label-full">忘掉了 / 困难</span>
                      <span className="rating-label-short">忘掉了</span>
                    </button>
                    <button
                      className="rating-btn btn-remembered"
                      onClick={() => handleFlashcardRating('remembered')}
                      title="有印象，温习巩固"
                    >
                      <Clock size={16} />
                      <span className="rating-label-full">有印象 / 温习</span>
                      <span className="rating-label-short">温习中</span>
                    </button>
                    <button
                      className="rating-btn btn-mastered"
                      onClick={() => handleFlashcardRating('mastered')}
                      title="完全熟记，标记为已掌握"
                    >
                      <CheckCircle2 size={16} />
                      <span className="rating-label-full">已熟记 / 已掌握</span>
                      <span className="rating-label-short">已掌握</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Standard Cards List View */
            <div className="knowledge-list-view">
              {activeTab === 'vocab' ? (
                filteredWords.length === 0 ? (
                  <div className="knowledge-empty-state">
                    <BookOpen size={40} className="empty-icon" />
                    <p>暂无符合筛选条件的词汇</p>
                    <span className="empty-sub">在对话中 AI 发送的生词与带注音单词会自动收录于此</span>
                  </div>
                ) : (
                  <div className="knowledge-grid">
                    {filteredWords.map((word) => (
                      <div
                        key={word.id}
                        className={`knowledge-card word-card ${isWordTarget(word) ? 'card-focus-highlight' : ''}`}
                        data-key={word.surface}
                      >
                        <div className="card-header">
                          <div className="word-surface-reading">
                            <FuriganaTitle
                              surface={word.surface}
                              reading={word.reading}
                              className="word-surface"
                            />
                            {word.pitch !== undefined && (
                              <span className="pitch-accent-badge">
                                声调: {word.pitch === 0 ? '0 平板' : `${word.pitch} 型`}
                              </span>
                            )}
                            {word.level && <span className="word-level-tag">{word.level}</span>}
                            {word.pos && <span className="word-pos-tag">{word.pos}</span>}
                          </div>
                          <button
                            className="card-icon-btn speak"
                            onClick={() => speechService.speak(word.reading || word.surface, ttsRate)}
                            title="朗读"
                          >
                            <Volume2 size={15} />
                          </button>
                        </div>

                        <div className="card-body">
                          <p className="card-meaning">{word.meaning || '日常词汇'}</p>
                          {word.detail && <p className="card-detail-tip">用法：{word.detail}</p>}
                          {word.exampleJp && (
                            <div className="card-example-tip">
                              <span className="example-jp">
                                <RubyText content={word.exampleJp} interactive={false} ttsRate={ttsRate} />
                              </span>
                              {word.exampleCn && <span className="example-cn">（{word.exampleCn}）</span>}
                            </div>
                          )}
                        </div>

                        <div className="card-footer">
                          <div className="status-selector-group">
                            <div className="mastery-quick-chips">
                              <button
                                type="button"
                                className={`mastery-chip-btn chip-learning ${word.mastery === 'learning' ? 'active' : ''}`}
                                onClick={() => onUpdateWordMastery(word.id, 'learning')}
                                title="标记为初学阶段"
                              >
                                初学
                              </button>
                              <button
                                type="button"
                                className={`mastery-chip-btn chip-reviewing ${word.mastery === 'reviewing' ? 'active' : ''}`}
                                onClick={() => onUpdateWordMastery(word.id, 'reviewing')}
                                title="标记为温习阶段"
                              >
                                温习
                              </button>
                              <button
                                type="button"
                                className={`mastery-chip-btn chip-mastered ${word.mastery === 'mastered' ? 'active' : ''}`}
                                onClick={() => onUpdateWordMastery(word.id, 'mastered')}
                                title="标记为已熟练掌握"
                              >
                                已掌握
                              </button>
                            </div>
                          </div>

                          <button
                            className="card-icon-btn delete"
                            onClick={() => onRemoveWord(word.id)}
                            title="移除此词汇"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : activeTab === 'favorites' ? (
                filteredFavorites.length === 0 ? (
                  <div className="knowledge-empty-state">
                    <Bookmark size={40} className="empty-icon" />
                    <p>还没有收藏任何表达</p>
                    <span className="empty-sub">
                      在对话里划选短语或整句，点击小窗底部的「收藏」即可归档到这里
                    </span>
                  </div>
                ) : (
                  <div className="knowledge-grammar-list">
                    {filteredFavorites.map((fav) => (
                      <div key={fav.id} className="knowledge-grammar-card">
                        <div className="grammar-header">
                          <div className="grammar-title-group">
                            <div className="favorite-text">
                              {fav.annotated ? (
                                <RubyText
                                  content={fav.annotated}
                                  interactive={false}
                                  ttsRate={ttsRate}
                                />
                              ) : (
                                <RubyText
                                  content={fav.text}
                                  isExplicitJapanese
                                  interactive={false}
                                  ttsRate={ttsRate}
                                />
                              )}
                            </div>
                            {!fav.annotated && fav.reading && (
                              <span className="grammar-structure">{fav.reading}</span>
                            )}
                            {fav.pos && <span className="grammar-level-badge">{fav.pos}</span>}
                            {fav.level && <span className="grammar-level-badge">{fav.level}</span>}
                          </div>
                          <div className="grammar-actions">
                            <button
                              className="card-icon-btn speak"
                              onClick={() => speechService.speak(fav.reading || fav.text, ttsRate)}
                              title="朗读该表达"
                            >
                              <Volume2 size={14} />
                            </button>
                            <button
                              className="card-icon-btn delete"
                              onClick={() => onRemoveFavorite?.(fav.id)}
                              title="取消收藏"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="grammar-meaning-row">
                          <span className="grammar-meaning-label">【释义】</span>
                          <span className="grammar-meaning-text">{fav.meaning}</span>
                        </div>

                        {fav.breakdown && fav.breakdown.length > 0 && (
                          <ul className="favorite-breakdown-list">
                            {fav.breakdown.map((seg, i) => (
                              <li key={i} className="favorite-breakdown-item">
                                <span className="favorite-bd-jp">{seg.jp}</span>
                                {seg.role && <span className="favorite-bd-role">{seg.role}</span>}
                                {seg.zh && <span className="favorite-bd-zh">{seg.zh}</span>}
                              </li>
                            ))}
                          </ul>
                        )}

                        {fav.detail && (
                          <div className="grammar-explanation-box">
                            <div className="grammar-explanation-header">
                              <span className="explanation-icon">💡</span>
                              <span className="explanation-label">结构拆解与语境点拨</span>
                            </div>
                            <div className="explanation-content">{fav.detail}</div>
                          </div>
                        )}

                        {fav.examples && fav.examples.length > 0 && (
                          <div className="grammar-example-box">
                            {fav.examples.map((ex, i) => (
                              <div key={i} className="favorite-example-item">
                                <div className="example-jp">
                                  <RubyText content={ex.jp} interactive={false} ttsRate={ttsRate} />
                                  <button
                                    className="card-icon-btn speak"
                                    onClick={() => speechService.speak(ex.jp, ttsRate)}
                                    title="朗读例句"
                                  >
                                    <Volume2 size={13} />
                                  </button>
                                </div>
                                <p className="example-cn">{ex.zh}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="grammar-footer">
                          <span className="grammar-source">
                            收藏于 {new Date(fav.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                filteredGrammar.length === 0 ? (
                  <div className="knowledge-empty-state">
                    <Layers size={40} className="empty-icon" />
                    <p>暂无符合筛选条件的语法</p>
                    <span className="empty-sub">
                      私教在对话中讲解或纠正句型时，会自动带着接续公式、中文释义、语感点拨与例句收录到这里
                    </span>
                  </div>
                ) : (
                  <div className="knowledge-grammar-list">
                    {filteredGrammar.map((grammar) => (
                      <div
                        key={grammar.id}
                        className={`knowledge-grammar-card ${isGrammarTarget(grammar) ? 'card-focus-highlight' : ''}`}
                        data-key={grammar.title}
                      >
                        <div className="grammar-header">
                          <div className="grammar-title-group">
                            <h3 className="grammar-title">
                              <RubyText content={grammar.title} interactive={false} ttsRate={ttsRate} />
                            </h3>
                            {grammar.level && <span className="grammar-level-badge">{grammar.level}</span>}
                          </div>
                          <div className="grammar-actions">
                            <button
                              className="card-icon-btn delete"
                              onClick={() => onRemoveGrammar(grammar.id)}
                              title="移除此语法"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="grammar-meaning-row">
                          <span className="grammar-meaning-label">【释义】</span>
                          <span className="grammar-meaning-text">
                            <RubyText content={grammar.meaning} interactive={false} ttsRate={ttsRate} />
                          </span>
                        </div>

                        {grammar.structure && (
                          <div className="grammar-structure-row">
                            <span className="grammar-structure-label">【接续】</span>
                            <span className="grammar-structure-text">
                              <RubyText content={grammar.structure} interactive={false} ttsRate={ttsRate} />
                            </span>
                          </div>
                        )}

                        {grammar.explanation && (
                          <div className="grammar-explanation-box">
                            <div className="grammar-explanation-header">
                              <span className="explanation-icon">💡</span>
                              <span className="explanation-label">用法点拨与语感解析</span>
                            </div>
                            <div className="explanation-content">
                              <RubyText content={grammar.explanation} interactive={false} ttsRate={ttsRate} />
                            </div>
                          </div>
                        )}

                        {grammar.exampleJp && (
                          <div className="grammar-example-box">
                            <div className="example-jp">
                              <RubyText content={grammar.exampleJp} ttsRate={ttsRate} />
                              <button
                                className="card-icon-btn speak"
                                onClick={() => speechService.speak(grammar.exampleJp!, ttsRate)}
                                title="朗读例句"
                              >
                                <Volume2 size={13} />
                              </button>
                            </div>
                            {grammar.exampleCn && <p className="example-cn">{grammar.exampleCn}</p>}
                          </div>
                        )}

                        <div className="grammar-footer">
                          <span className="grammar-source">
                            来源: {grammar.source || '私教教学'}
                            {grammar.reviewCount > 1 ? ` · 反复温习 ${grammar.reviewCount} 次` : ''}
                          </span>
                          <div className="status-selector-group">
                            <div className="mastery-quick-chips">
                              <button
                                type="button"
                                className={`mastery-chip-btn chip-learning ${grammar.mastery === 'learning' ? 'active' : ''}`}
                                onClick={() => onUpdateGrammarMastery(grammar.id, 'learning')}
                                title="标记为初学阶段"
                              >
                                初学
                              </button>
                              <button
                                type="button"
                                className={`mastery-chip-btn chip-reviewing ${grammar.mastery === 'reviewing' ? 'active' : ''}`}
                                onClick={() => onUpdateGrammarMastery(grammar.id, 'reviewing')}
                                title="标记为温习阶段"
                              >
                                温习
                              </button>
                              <button
                                type="button"
                                className={`mastery-chip-btn chip-mastered ${grammar.mastery === 'mastered' ? 'active' : ''}`}
                                onClick={() => onUpdateGrammarMastery(grammar.id, 'mastered')}
                                title="标记为已熟练掌握"
                              >
                                已掌握
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
