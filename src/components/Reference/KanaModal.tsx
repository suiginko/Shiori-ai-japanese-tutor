import React, { useState, useEffect, useRef } from 'react';
import {
  SEION_KANA,
  DAKUON_KANA,
  YOON_KANA,
  SPECIAL_KATAKANA,
  PRONUNCIATION_TOPICS,
  KEYBOARD_TYPING_GUIDE,
  TYPING_DRILL_PRESETS,
} from '../../data/kanaChart';
import { KanaItem, TypingDrillItem } from '../../types';
import {
  X,
  Volume2,
  VolumeX,
  Info,
  BookOpen,
  Keyboard,
  PlayCircle,
  Sparkles,
  CheckCircle2,
  Lightbulb,
  Search,
  ArrowRight,
  Flame,
  Award,
} from 'lucide-react';

interface KanaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type MainTab = 'chart' | 'pronunciation' | 'typingGuide' | 'drill';
type ChartSubCategory = 'seion' | 'dakuon' | 'yoon' | 'special';

// Web Speech API 辅助发音朗读
const playJapaneseAudio = (text: string) => {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find((v) => v.lang.includes('ja') || v.lang.includes('JP'));
    if (jaVoice) utterance.voice = jaVoice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }
};

export const KanaModal: React.FC<KanaModalProps> = ({ isOpen, onClose }) => {
  const [mainTab, setMainTab] = useState<MainTab>('chart');

  // Chart state
  const [chartCategory, setChartCategory] = useState<ChartSubCategory>('seion');
  const [selectedKana, setSelectedKana] = useState<KanaItem | null>(SEION_KANA[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoPlayAudio, setAutoPlayAudio] = useState(true);

  // Pronunciation masterclass state
  const [selectedTopicId, setSelectedTopicId] = useState<string>(PRONUNCIATION_TOPICS[0].id);

  // Typing Guide state
  const [guideSubTab, setGuideSubTab] = useState<'rules' | 'specialLoan' | 'multiKey' | 'shortcuts'>('rules');

  // Typing Drill state
  const [drillCategory, setDrillCategory] = useState<string>('all');
  const [drillIndex, setDrillIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [drillCombo, setDrillCombo] = useState(0);
  const [drillScore, setDrillScore] = useState(0);
  const [drillFeedback, setDrillFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [showDrillTip, setShowDrillTip] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && mainTab === 'drill') {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, mainTab, drillIndex]);

  if (!isOpen) return null;

  // Chart List Filtering
  const getCategoryList = (): KanaItem[] => {
    switch (chartCategory) {
      case 'seion':
        return SEION_KANA;
      case 'dakuon':
        return DAKUON_KANA;
      case 'yoon':
        return YOON_KANA;
      case 'special':
        return SPECIAL_KATAKANA;
      default:
        return SEION_KANA;
    }
  };

  const filteredKanaList = getCategoryList().filter((k) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      k.hiragana.includes(q) ||
      k.katakana.includes(q) ||
      k.romaji.toLowerCase().includes(q) ||
      k.chineseMnemonic.toLowerCase().includes(q) ||
      (k.altRomaji && k.altRomaji.some((a) => a.toLowerCase().includes(q)))
    );
  });

  const handleSelectKana = (k: KanaItem) => {
    setSelectedKana(k);
    if (autoPlayAudio) {
      playJapaneseAudio(k.hiragana);
    }
  };

  // Drill Filtering
  const filteredDrills: TypingDrillItem[] =
    drillCategory === 'all'
      ? TYPING_DRILL_PRESETS
      : TYPING_DRILL_PRESETS.filter((d) => d.category === drillCategory);

  const currentDrill = filteredDrills[drillIndex % (filteredDrills.length || 1)];

  const handleDrillInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().trim();
    setUserInput(val);

    if (!currentDrill) return;

    // 规范化比较（忽略连字符等）
    const normalize = (s: string) => s.replace(/[-'・ ]/g, '').toLowerCase();
    const cleanVal = normalize(val);
    const isMatched = currentDrill.validKeys.some((key) => normalize(key) === cleanVal);

    if (isMatched) {
      setDrillFeedback('correct');
      playJapaneseAudio(currentDrill.reading);
      setDrillCombo((c) => c + 1);
      setDrillScore((s) => s + 10);
      setTimeout(() => {
        setUserInput('');
        setDrillFeedback('idle');
        setShowDrillTip(false);
        setDrillIndex((prev) => (prev + 1) % filteredDrills.length);
      }, 400);
    } else {
      // 检查是否已经输入并且匹配不上任何前缀
      const hasPrefixMatch = currentDrill.validKeys.some((key) =>
        normalize(key).startsWith(cleanVal)
      );
      if (!hasPrefixMatch && cleanVal.length > 0) {
        setDrillFeedback('wrong');
      } else {
        setDrillFeedback('idle');
      }
    }
  };

  const handleSkipDrill = () => {
    setUserInput('');
    setDrillFeedback('idle');
    setShowDrillTip(false);
    setDrillCombo(0);
    setDrillIndex((prev) => (prev + 1) % filteredDrills.length);
  };

  const activeTopic = PRONUNCIATION_TOPICS.find((t) => t.id === selectedTopicId) || PRONUNCIATION_TOPICS[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-customization-large kana-master-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header kana-modal-header">
          <div className="modal-title-group">
            <div className="kana-header-badge">
              <span>あ</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2>日语发音与26键键盘打字工坊</h2>
                <span className="kana-header-subtag">五十音 · 拗音 · 发音学 · 全键盘输入</span>
              </div>
              <p className="modal-subtitle">
                掌握假名全系发音规律、声调音拍规则，轻松玩转电脑/手机 26 键罗马字高效盲打
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="关闭 (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="kana-nav-tabs">
          <button
            className={`kana-main-nav-btn ${mainTab === 'chart' ? 'active' : ''}`}
            onClick={() => setMainTab('chart')}
          >
            <BookOpen size={16} />
            <span>假名图谱总览</span>
            <span className="nav-badge">120+音</span>
          </button>
          <button
            className={`kana-main-nav-btn ${mainTab === 'pronunciation' ? 'active' : ''}`}
            onClick={() => setMainTab('pronunciation')}
          >
            <Sparkles size={16} />
            <span>核心发音精讲</span>
            <span className="nav-badge-accent">促音/拨音/长音</span>
          </button>
          <button
            className={`kana-main-nav-btn ${mainTab === 'typingGuide' ? 'active' : ''}`}
            onClick={() => setMainTab('typingGuide')}
          >
            <Keyboard size={16} />
            <span>26键打字秘籍</span>
            <span className="nav-badge">避坑/速查</span>
          </button>
          <button
            className={`kana-main-nav-btn ${mainTab === 'drill' ? 'active' : ''}`}
            onClick={() => setMainTab('drill')}
          >
            <PlayCircle size={16} />
            <span>键盘打字练兵场</span>
            <span className="nav-badge-play">实战练习</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body kana-body-wrapper">
          {/* TAB 1: 假名图谱总览 */}
          {mainTab === 'chart' && (
            <div className="kana-chart-view">
              {/* Category sub-tabs & search bar */}
              <div className="kana-chart-toolbar">
                <div className="kana-sub-tabs">
                  <button
                    className={`kana-sub-tab-pill ${chartCategory === 'seion' ? 'active' : ''}`}
                    onClick={() => {
                      setChartCategory('seion');
                      setSelectedKana(SEION_KANA[0]);
                    }}
                  >
                    清音 (46音)
                  </button>
                  <button
                    className={`kana-sub-tab-pill ${chartCategory === 'dakuon' ? 'active' : ''}`}
                    onClick={() => {
                      setChartCategory('dakuon');
                      setSelectedKana(DAKUON_KANA[0]);
                    }}
                  >
                    浊音 · 半浊音 (25音)
                  </button>
                  <button
                    className={`kana-sub-tab-pill ${chartCategory === 'yoon' ? 'active' : ''}`}
                    onClick={() => {
                      setChartCategory('yoon');
                      setSelectedKana(YOON_KANA[0]);
                    }}
                  >
                    标准拗音 (36音)
                  </button>
                  <button
                    className={`kana-sub-tab-pill ${chartCategory === 'special' ? 'active' : ''}`}
                    onClick={() => {
                      setChartCategory('special');
                      setSelectedKana(SPECIAL_KATAKANA[0]);
                    }}
                  >
                    外来语特殊音 (24音)
                  </button>
                </div>

                <div className="kana-tool-actions">
                  <div className="kana-search-box">
                    <Search size={14} className="text-gray-400" />
                    <input
                      type="text"
                      placeholder="搜索假名 / 罗马字 / 击键..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                        ×
                      </button>
                    )}
                  </div>

                  <button
                    className={`kana-audio-toggle ${autoPlayAudio ? 'active' : ''}`}
                    onClick={() => setAutoPlayAudio(!autoPlayAudio)}
                    title={autoPlayAudio ? '点击假名自动发音开启' : '点击假名自动发音已静音'}
                  >
                    {autoPlayAudio ? <Volume2 size={15} /> : <VolumeX size={15} />}
                    <span>{autoPlayAudio ? '点击自动发音' : '发音已静音'}</span>
                  </button>
                </div>
              </div>

              {/* Main Grid + Sidebar Layout */}
              <div className="kana-grid-layout">
                {/* Kana Grid Tiles */}
                <div className="kana-tiles-container">
                  {filteredKanaList.length === 0 ? (
                    <div className="kana-empty-search">
                      <p>未找到匹配「{searchQuery}」的假名</p>
                      <button className="btn-secondary text-xs mt-2" onClick={() => setSearchQuery('')}>
                        重置搜索
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`kana-cards-grid ${
                        chartCategory === 'yoon' || chartCategory === 'special' ? 'grid-dense' : ''
                      }`}
                    >
                      {filteredKanaList.map((k, index) => {
                        const isSelected =
                          selectedKana?.hiragana === k.hiragana && selectedKana?.katakana === k.katakana;
                        return (
                          <button
                            key={index}
                            className={`kana-tile ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelectKana(k)}
                          >
                            <span className="kana-hiragana">{k.hiragana}</span>
                            <span className="kana-katakana">{k.katakana}</span>
                            <span className="kana-romaji">{k.romaji}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Rich Detail Sidebar */}
                {selectedKana && (
                  <div className="kana-detail-sidebar">
                    <div className="selected-kana-display">
                      <div className="large-chars">
                        <span className="large-hira">{selectedKana.hiragana}</span>
                        <span className="large-kata">{selectedKana.katakana}</span>
                      </div>
                      <div className="large-romaji-group">
                        <span className="large-romaji">{selectedKana.romaji}</span>
                        {selectedKana.altRomaji && selectedKana.altRomaji.length > 0 && (
                          <span className="alt-romaji">
                            (亦作: {selectedKana.altRomaji.join(', ')})
                          </span>
                        )}
                      </div>

                      <button
                        className="kana-play-btn"
                        onClick={() => playJapaneseAudio(selectedKana.hiragana)}
                        title="试听发音"
                      >
                        <Volume2 size={16} />
                        <span>试听真人发音</span>
                      </button>
                    </div>

                    {/* 26键击键指导卡 */}
                    <div className="kana-tips-card typing-key-card">
                      <div className="tip-header text-indigo-600">
                        <Keyboard size={15} />
                        <span>26键打字按键</span>
                      </div>
                      <div className="keystroke-pills">
                        {(selectedKana.keystrokes || [selectedKana.romaji]).map((key, i) => (
                          <span key={i} className="key-cap">
                            {key}
                          </span>
                        ))}
                      </div>
                      <p className="tip-subtext">
                        在日文罗马字输入法状态下依次敲击上方英文字母即可输出。
                      </p>
                    </div>

                    {/* 中文助记口诀 */}
                    <div className="kana-tips-card">
                      <div className="tip-header text-sky-600">
                        <Info size={15} />
                        <span>中文助记口诀</span>
                      </div>
                      <p className="tip-body">{selectedKana.chineseMnemonic}</p>
                    </div>

                    {/* 母语者发音诀窍 */}
                    <div className="kana-tips-card">
                      <div className="tip-header text-amber-600">
                        <Sparkles size={15} />
                        <span>母语者发音要领</span>
                      </div>
                      <p className="tip-body">{selectedKana.pronunciationTip}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 核心发音精讲 */}
          {mainTab === 'pronunciation' && (
            <div className="kana-pronunciation-view">
              {/* Left sidebar: Topic Index */}
              <div className="pronounce-sidebar">
                <div className="pronounce-sidebar-header">
                  <Sparkles size={16} className="kana-sparkle-icon" />
                  <span>日语语音基础理论</span>
                </div>
                <div className="pronounce-topics-list">
                  {PRONUNCIATION_TOPICS.map((topic) => {
                    const isSelected = selectedTopicId === topic.id;
                    return (
                      <button
                        key={topic.id}
                        className={`pronounce-nav-item ${isSelected ? 'active' : ''}`}
                        onClick={() => setSelectedTopicId(topic.id)}
                      >
                        <div className="topic-nav-top">
                          <span className="topic-title">{topic.title}</span>
                          <span className="topic-tag-badge">{topic.tag}</span>
                        </div>
                        <span className="topic-sub">{topic.subtitle}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right content: Detailed Lecture Card */}
              <div className="pronounce-main-content">
                <div className="topic-hero-header">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="topic-tag-hero">{activeTopic.tag}</span>
                      <h3 className="topic-hero-title">{activeTopic.title}</h3>
                    </div>
                    <p className="topic-hero-subtitle">{activeTopic.subtitle}</p>
                  </div>
                  {activeTopic.audioText && (
                    <button
                      className="pronounce-audio-hero-btn"
                      onClick={() => playJapaneseAudio(activeTopic.audioText!)}
                      title="朗读本节例词"
                    >
                      <Volume2 size={16} />
                      <span>朗读本节范例</span>
                    </button>
                  )}
                </div>

                <div className="topic-summary-box">
                  <p>{activeTopic.summary}</p>
                </div>

                <div className="topic-core-rule-card">
                  <div className="rule-badge">核心法则</div>
                  <p className="rule-text">{activeTopic.coreRule}</p>
                </div>

                {/* Example Words Grid */}
                <div className="topic-examples-section">
                  <h4>
                    <span>典型词汇与辨析对比</span>
                    <span className="text-xs text-gray-500 font-normal">点击喇叭可单词试听</span>
                  </h4>
                  <div className="examples-cards-grid">
                    {activeTopic.examples.map((ex, i) => (
                      <div key={i} className="example-word-card">
                        <div className="ex-word-top">
                          <div className="ex-word-jp">
                            <span className="kanji-main">{ex.word}</span>
                            <span className="reading-kana">({ex.reading})</span>
                          </div>
                          <button
                            className="ex-play-icon-btn"
                            onClick={() => playJapaneseAudio(ex.reading || ex.word)}
                            title="试听单词发音"
                          >
                            <Volume2 size={14} />
                          </button>
                        </div>
                        <div className="ex-romaji">{ex.romaji}</div>
                        <div className="ex-meaning">{ex.meaning}</div>
                        {ex.note && <div className="ex-note">{ex.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Practical Tips */}
                <div className="topic-tips-section">
                  <h4>实战避坑与打字提示</h4>
                  <ul className="tips-list">
                    {activeTopic.practicalTips.map((tip, i) => (
                      <li key={i}>
                        <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 26键打字秘籍 */}
          {mainTab === 'typingGuide' && (
            <div className="kana-typing-view">
              {/* Sub tabs */}
              <div className="typing-guide-tabs">
                <button
                  className={`guide-tab-pill ${guideSubTab === 'rules' ? 'active' : ''}`}
                  onClick={() => setGuideSubTab('rules')}
                >
                  输入法核心机制与必背流派
                </button>
                <button
                  className={`guide-tab-pill ${guideSubTab === 'specialLoan' ? 'active' : ''}`}
                  onClick={() => setGuideSubTab('specialLoan')}
                >
                  外来语特殊音击键速查表 (ティ/ディ/ファ/ウィ等)
                </button>
                <button
                  className={`guide-tab-pill ${guideSubTab === 'multiKey' ? 'active' : ''}`}
                  onClick={() => setGuideSubTab('multiKey')}
                >
                  常用假名极速简拼与备选表
                </button>
                <button
                  className={`guide-tab-pill ${guideSubTab === 'shortcuts' ? 'active' : ''}`}
                  onClick={() => setGuideSubTab('shortcuts')}
                >
                  日文标点键位与 F6~F10 快捷键神技
                </button>
              </div>

              {/* View 1: 核心规则 */}
              {guideSubTab === 'rules' && (
                <div className="typing-rules-scroll">
                  <div className="rules-cards-grid">
                    {KEYBOARD_TYPING_GUIDE.generalRules.map((rule, i) => (
                      <div key={i} className="rule-guide-card">
                        <div className="rule-guide-header">
                          <span className="rule-number-tag">{i + 1}</span>
                          <h5>{rule.title}</h5>
                        </div>
                        <div className="rule-guide-body">
                          {rule.content.split('\n').map((line, lineIndex) => (
                            <p key={lineIndex}>{line}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View 2: 外来语特殊假名打法速查 */}
              {guideSubTab === 'specialLoan' && (
                <div className="typing-table-scroll">
                  <div className="table-intro-banner">
                    <Info size={16} />
                    <span>
                      现代日语充满片假名外来语！记住这些高频组合（如 Party
                      中的「ティ」、Disney「ディ」），打字速度提升 300%！
                    </span>
                  </div>
                  <table className="kana-guide-table">
                    <thead>
                      <tr>
                        <th>目标假名</th>
                        <th>26键击键代码 (直接敲击)</th>
                        <th>经典代表单词</th>
                        <th>打字效率小结</th>
                        <th>发音试听</th>
                      </tr>
                    </thead>
                    <tbody>
                      {KEYBOARD_TYPING_GUIDE.specialLoanwords.map((item, index) => (
                        <tr key={index}>
                          <td className="font-bold text-base table-target-kana font-jp">
                            {item.kana}
                          </td>
                          <td>
                            <code className="keystroke-code">{item.keystrokes}</code>
                          </td>
                          <td className="font-jp text-gray-700">{item.example}</td>
                          <td className="text-xs text-gray-500">{item.tip}</td>
                          <td>
                            <button
                              className="table-play-btn"
                              onClick={() => playJapaneseAudio(item.kana)}
                              title="试听假名发音"
                            >
                              <Volume2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* View 3: 常用假名多重击键对照表 */}
              {guideSubTab === 'multiKey' && (
                <div className="typing-table-scroll">
                  <div className="table-intro-banner">
                    <Lightbulb size={16} />
                    <span>
                      许多假名拥有 2 种以上的输入方式。例如「つ」输入 <code>tu</code> 仅需按 2 个键，比 <code>tsu</code> 少按 1 次，打字更省力！
                    </span>
                  </div>
                  <table className="kana-guide-table">
                    <thead>
                      <tr>
                        <th>假名</th>
                        <th>标准默认打法</th>
                        <th>备选/极速简拼打法</th>
                        <th>使用说明与打字建议</th>
                      </tr>
                    </thead>
                    <tbody>
                      {KEYBOARD_TYPING_GUIDE.multiKeyKana.map((item, index) => (
                        <tr key={index}>
                          <td className="font-bold text-base text-sky-700 font-jp">{item.kana}</td>
                          <td>
                            <code className="keystroke-code">{item.default}</code>
                          </td>
                          <td>
                            {item.alternatives.length > 0 ? (
                              <div className="flex gap-1.5 flex-wrap">
                                {item.alternatives.map((alt, ai) => (
                                  <code key={ai} className="keystroke-code-alt">
                                    {alt}
                                  </code>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">无备选</span>
                            )}
                          </td>
                          <td className="text-xs text-gray-600">{item.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* View 4: 快捷键与标点 */}
              {guideSubTab === 'shortcuts' && (
                <div className="typing-shortcuts-layout">
                  <div className="shortcut-card">
                    <h4>F6 ~ F10 一键无缝转换神器 (在输完假名确认前按)</h4>
                    <div className="shortcut-grid">
                      <div className="shortcut-row">
                        <span className="key-badge">F6</span>
                        <span className="shortcut-action">平假名转换</span>
                        <span className="shortcut-demo">tokyo → とうきょう</span>
                      </div>
                      <div className="shortcut-row">
                        <span className="key-badge">F7</span>
                        <span className="shortcut-action">全角片假名转换 (最常用!)</span>
                        <span className="shortcut-demo">tokyo → トウキョウ</span>
                      </div>
                      <div className="shortcut-row">
                        <span className="key-badge">F8</span>
                        <span className="shortcut-action">半角片假名转换</span>
                        <span className="shortcut-demo">tokyo → ﾄｳｷｮｳ</span>
                      </div>
                      <div className="shortcut-row">
                        <span className="key-badge">F9</span>
                        <span className="shortcut-action">全角英数转换</span>
                        <span className="shortcut-demo">tokyo → ｔｏｋｙｏ</span>
                      </div>
                      <div className="shortcut-row">
                        <span className="key-badge">F10</span>
                        <span className="shortcut-action">半角英数 (大小写轮转)</span>
                        <span className="shortcut-demo">tokyo → tokyo / TOKYO</span>
                      </div>
                    </div>
                  </div>

                  <div className="shortcut-card">
                    <h4>日文常用标点键位速查</h4>
                    <div className="shortcut-grid">
                      <div className="shortcut-row">
                        <span className="key-badge">- (减号)</span>
                        <span className="shortcut-action">片假名长音符号「ー」</span>
                        <span className="shortcut-demo">ko-hi- → コーヒー</span>
                      </div>
                      <div className="shortcut-row">
                        <span className="key-badge">. (句号键)</span>
                        <span className="shortcut-action">日文句号「。」</span>
                        <span className="shortcut-demo">全角句号</span>
                      </div>
                      <div className="shortcut-row">
                        <span className="key-badge">, (逗号键)</span>
                        <span className="shortcut-action">日文顿号/逗号「、」</span>
                        <span className="shortcut-demo">全角顿点</span>
                      </div>
                      <div className="shortcut-row">
                        <span className="key-badge">/ (斜杠键)</span>
                        <span className="shortcut-action">日文中黑点间隔号「・」</span>
                        <span className="shortcut-demo">外来语词距连接</span>
                      </div>
                      <div className="shortcut-row">
                        <span className="key-badge">[ 与 ] (方括号)</span>
                        <span className="shortcut-action">日文引号「 与 」</span>
                        <span className="shortcut-demo">对话引用符号</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 键盘打字实训场 */}
          {mainTab === 'drill' && (
            <div className="kana-drill-view">
              {/* Top controls: Category selection & Score stats */}
              <div className="drill-top-bar">
                <div className="drill-categories">
                  {[
                    { id: 'all', label: '综合题库' },
                    { id: 'basic', label: '基础假名' },
                    { id: 'yoon', label: '拗音专项' },
                    { id: 'sokuon', label: '促音/拨音避坑' },
                    { id: 'katakana', label: '外来语特殊音' },
                    { id: 'daily', label: '高频日常词' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      className={`drill-cat-btn ${drillCategory === cat.id ? 'active' : ''}`}
                      onClick={() => {
                        setDrillCategory(cat.id);
                        setDrillIndex(0);
                        setUserInput('');
                        setDrillFeedback('idle');
                        setShowDrillTip(false);
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="drill-stats">
                  <div className="stat-pill combo">
                    <Flame size={15} />
                    <span>{drillCombo} 连击</span>
                  </div>
                  <div className="stat-pill score">
                    <Award size={15} />
                    <span>{drillScore} 积分</span>
                  </div>
                </div>
              </div>

              {/* Main Drill Arena */}
              {currentDrill && (
                <div className="drill-arena">
                  <div className="drill-card">
                    {/* Progress */}
                    <div className="drill-progress-indicator">
                      <span>
                        题目 {drillIndex + 1} / {filteredDrills.length}
                      </span>
                    </div>

                    {/* Word Display */}
                    <div className="drill-word-box">
                      <div className="drill-jp-word font-jp">{currentDrill.word}</div>
                      {currentDrill.reading !== currentDrill.word && (
                        <div className="drill-reading-kana font-jp">【{currentDrill.reading}】</div>
                      )}
                      {currentDrill.kanjiMeaning && (
                        <div className="drill-meaning">{currentDrill.kanjiMeaning}</div>
                      )}
                    </div>

                    {/* Interactive 26-Key Input */}
                    <div className={`drill-input-wrapper ${drillFeedback}`}>
                      <input
                        ref={inputRef}
                        type="text"
                        className="drill-real-input"
                        placeholder="在此键入对应罗马字..."
                        value={userInput}
                        onChange={handleDrillInput}
                        autoFocus
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <button
                        className="drill-listen-btn"
                        onClick={() => playJapaneseAudio(currentDrill.reading)}
                        title="朗读当前词"
                      >
                        <Volume2 size={18} />
                      </button>
                    </div>

                    {/* Live Keys hint / Tip */}
                    <div className="drill-action-row">
                      <button
                        className="drill-hint-toggle-btn"
                        onClick={() => setShowDrillTip(!showDrillTip)}
                      >
                        <Lightbulb size={14} />
                        <span>{showDrillTip ? '收起打法提示' : '查看 26 键输入提示'}</span>
                      </button>

                      <button className="drill-skip-btn" onClick={handleSkipDrill}>
                        <span>跳过此题</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>

                    {showDrillTip && (
                      <div className="drill-tip-popover">
                        <div className="tip-row">
                          <span className="font-semibold text-gray-700">推荐击键：</span>
                          <div className="flex gap-1.5">
                            {currentDrill.validKeys.map((vk, vki) => (
                              <code key={vki} className="keystroke-code">
                                {vk}
                              </code>
                            ))}
                          </div>
                        </div>
                        {currentDrill.tip && <p className="drill-extra-tip">{currentDrill.tip}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
