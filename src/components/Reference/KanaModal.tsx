import React, { useState } from 'react';
import { SEION_KANA, DAKUON_KANA } from '../../data/kanaChart';
import { KanaItem } from '../../types';
import { X, Volume2, Info } from 'lucide-react';
import { speechService } from '../../services/speechService';

interface KanaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KanaModal: React.FC<KanaModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'seion' | 'dakuon'>('seion');
  const [selectedKana, setSelectedKana] = useState<KanaItem | null>(SEION_KANA[0]);

  if (!isOpen) return null;

  const currentList = activeTab === 'seion' ? SEION_KANA : DAKUON_KANA;

  const handlePlaySound = (kana: KanaItem) => {
    setSelectedKana(kana);
    speechService.speak(kana.hiragana, 0.9);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large kana-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="kana-header-icon">あ</span>
            <h2>五十音图交互速查与发音指南</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body kana-layout">
          {/* Main Grid */}
          <div className="kana-grid-section">
            <div className="kana-tabs">
              <button
                className={`kana-tab-btn ${activeTab === 'seion' ? 'active' : ''}`}
                onClick={() => setActiveTab('seion')}
              >
                清音 (46音)
              </button>
              <button
                className={`kana-tab-btn ${activeTab === 'dakuon' ? 'active' : ''}`}
                onClick={() => setActiveTab('dakuon')}
              >
                浊音 · 半浊音 (25音)
              </button>
            </div>

            <div className="kana-cards-grid">
              {currentList.map((k, index) => {
                const isSelected = selectedKana?.hiragana === k.hiragana;
                return (
                  <button
                    key={index}
                    className={`kana-tile ${isSelected ? 'selected' : ''}`}
                    onClick={() => handlePlaySound(k)}
                  >
                    <span className="kana-hiragana">{k.hiragana}</span>
                    <span className="kana-katakana">{k.katakana}</span>
                    <span className="kana-romaji">{k.romaji}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Details & Pronunciation Guide on the Right */}
          {selectedKana && (
            <div className="kana-detail-sidebar">
              <div className="selected-kana-display">
                <div className="large-chars">
                  <span className="large-hira">{selectedKana.hiragana}</span>
                  <span className="large-kata">{selectedKana.katakana}</span>
                </div>
                <div className="large-romaji">{selectedKana.romaji}</div>
                <button
                  className="kana-play-btn"
                  onClick={() => speechService.speak(selectedKana.hiragana, 0.9)}
                >
                  <Volume2 size={16} />
                  <span>朗读发音</span>
                </button>
              </div>

              <div className="kana-tips-card">
                <div className="tip-header">
                  <Info size={15} className="text-sky-500" />
                  <span>中文助记口诀</span>
                </div>
                <p className="tip-body">{selectedKana.chineseMnemonic}</p>
              </div>

              <div className="kana-tips-card">
                <div className="tip-header">
                  <span className="text-amber-500 font-bold">★</span>
                  <span>母语者发音诀窍</span>
                </div>
                <p className="tip-body">{selectedKana.pronunciationTip}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
