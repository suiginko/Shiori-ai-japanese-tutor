import React, { useState } from 'react';
import { GRAMMAR_POINTS } from '../../data/grammarPoints';
import { UserLevel } from '../../types';
import { RubyText } from '../Chat/RubyText';
import { X, Search, BookOpen, Volume2 } from 'lucide-react';
import { speechService } from '../../services/speechService';

interface GrammarLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GrammarLibraryModal: React.FC<GrammarLibraryModalProps> = ({ isOpen, onClose }) => {
  const [selectedLevel, setSelectedLevel] = useState<UserLevel | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredGrammar = GRAMMAR_POINTS.filter((g) => {
    const matchesLevel = selectedLevel === 'ALL' || g.level === selectedLevel;
    const matchesQuery =
      g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.meaning.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.explanation.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesQuery;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <BookOpen className="text-emerald-500" size={20} />
            <h2>JLPT 核心语法宝典速查</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="grammar-filter-bar">
          <div className="level-tabs-scroll">
            {(['ALL', 'N5', 'N4', 'N3', 'N2', 'N1'] as const).map((lvl) => (
              <button
                key={lvl}
                className={`lvl-filter-pill ${selectedLevel === lvl ? 'active' : ''}`}
                onClick={() => setSelectedLevel(lvl)}
              >
                {lvl === 'ALL' ? '全部级别' : lvl}
              </button>
            ))}
          </div>

          <div className="grammar-search-input-wrapper">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="搜索语法、接续、中文含义..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="grammar-search-input"
            />
          </div>
        </div>

        <div className="modal-body grammar-list-container">
          {filteredGrammar.length === 0 ? (
            <div className="empty-grammar-state">
              <p>未找到符合条件的语法点</p>
            </div>
          ) : (
            <div className="grammar-cards-grid">
              {filteredGrammar.map((item) => (
                <div key={item.id} className="grammar-item-card">
                  <div className="grammar-card-top">
                    <span className="grammar-level-tag">{item.level}</span>
                    <h3 className="grammar-card-title">{item.title}</h3>
                    <span className="grammar-meaning">{item.meaning}</span>
                  </div>

                  <div className="grammar-structure-box">
                    <span className="structure-label">接续法则：</span>
                    <code className="structure-code">{item.structure}</code>
                  </div>

                  <p className="grammar-explanation-text">{item.explanation}</p>

                  <div className="grammar-examples-section">
                    <span className="examples-header">例句与声调标注：</span>
                    {item.examples.map((ex, idx) => (
                      <div key={idx} className="example-row">
                        <div className="example-jp">
                          <RubyText content={ex.jp} pitchDisplayMode="curve" />
                        </div>
                        <div className="example-cn-row">
                          <span className="example-cn">{ex.cn}</span>
                          <button
                            className="example-speak-btn"
                            onClick={() => speechService.speak(ex.reading || ex.jp, 1.0)}
                            title="朗读"
                          >
                            <Volume2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
