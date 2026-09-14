import React from 'react';
import {
  UserLearningProfile,
  FuriganaMode,
  PitchDisplayMode,
} from '../types';
import {
  Settings,
  Calendar,
  Grid,
  Eye,
  EyeOff,
  Activity,
  History,
  Brain,
} from 'lucide-react';

interface HeaderProps {
  profile: UserLearningProfile;
  furiganaMode: FuriganaMode;
  onFuriganaModeChange: (mode: FuriganaMode) => void;
  pitchDisplayMode: PitchDisplayMode;
  onPitchDisplayModeChange: (mode: PitchDisplayMode) => void;
  onOpenPlan: () => void;
  onOpenKana: () => void;
  onOpenKnowledge?: () => void;
  learnedCount?: number;
  onOpenSettings: () => void;
  onOpenHistory?: () => void;
  sessionCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  furiganaMode,
  onFuriganaModeChange,
  pitchDisplayMode,
  onPitchDisplayModeChange,
  onOpenPlan,
  onOpenKana,
  onOpenKnowledge,
  learnedCount = 0,
  onOpenSettings,
  onOpenHistory,
  sessionCount = 0,
}) => {
  // 判断当前是否为移动端/触屏环境
  const isMobile = () => {
    if (typeof window === 'undefined') return false;
    return (
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
      window.innerWidth <= 768 ||
      ('ontouchstart' in window && window.innerWidth <= 1024)
    );
  };

  const cycleFuriganaMode = () => {
    if (isMobile()) {
      // 手机版：只有“显示”和“隐藏”两种状态（手机触屏无悬停操作）
      if (furiganaMode === 'hidden') {
        onFuriganaModeChange('always');
      } else {
        onFuriganaModeChange('hidden');
      }
    } else {
      // 桌面版：支持 常显 / 悬停 / 隐藏 三态循环
      if (furiganaMode === 'always') onFuriganaModeChange('hover');
      else if (furiganaMode === 'hover') onFuriganaModeChange('hidden');
      else onFuriganaModeChange('always');
    }
  };

  const getFuriganaLabel = () => {
    if (isMobile()) {
      return furiganaMode === 'hidden' ? '注音: 隐藏' : '注音: 显示';
    }
    switch (furiganaMode) {
      case 'always':
        return '注音: 常显';
      case 'hover':
        return '注音: 悬停';
      case 'hidden':
        return '注音: 隐藏';
    }
  };

  const getShortFuriganaLabel = () => {
    if (isMobile()) {
      return furiganaMode === 'hidden' ? '隐藏' : '显示';
    }
    switch (furiganaMode) {
      case 'always':
        return '常显';
      case 'hover':
        return '悬停';
      case 'hidden':
        return '隐藏';
    }
  };

  return (
    <header className="app-header">
      <div className="header-top-row">
        {/* Left: Brand Identity */}
        <div className="header-brand-group">
          <div className="brand-logo-mark">
            <span className="logo-kanji">栞</span>
          </div>
          <div className="brand-info">
            <div className="brand-title">
              <span className="brand-name-text">栞 (Shiori)</span>
              <span className="brand-title-sub">AI 智能私教</span>
              <span className="brand-version-badge">v0.1.1</span>
            </div>
            <span className="brand-tagline">日文自然语言沉浸式伴学系统</span>
          </div>
        </div>

        {/* Right: Auxiliary Toggles, User Progress & Settings */}
        <div className="header-controls-right">
          {/* User Progress & Level Badge */}
          <div className="header-user-status">
            <button className="level-badge-pill" onClick={onOpenPlan} title="点击查看 AI 自主学习计划与能力诊断">
              <span className="level-tag">{profile.level}</span>
              <span className="level-desc">{profile.levelLabel}</span>
              <span className="level-edit-hint">计划 &gt;</span>
            </button>
          </div>

          {/* Furigana Display Toggle: 统一深灰色样式，无黄色刺眼高亮 */}
          <button
            className={`quick-toggle-btn ${furiganaMode === 'hidden' ? 'mode-hidden' : ''}`}
            onClick={cycleFuriganaMode}
            title={
              isMobile()
                ? '切换汉字注音（显示 / 隐藏）'
                : '切换汉字上方振假名显示策略（常显 / 悬停查看 / 隐藏自我检测）'
            }
          >
            {furiganaMode === 'hidden' ? <EyeOff size={14} /> : <Eye size={14} />}
            <span className="toggle-label-full">{getFuriganaLabel()}</span>
            <span className="toggle-label-short">{getShortFuriganaLabel()}</span>
          </button>

          {/* Tool Modals */}
          <div className="header-divider" />

          <button className="header-icon-btn" onClick={onOpenKana} title="五十音图速查与发音指南">
            <Grid size={16} />
            <span className="icon-label">五十音</span>
          </button>

          <button className="header-icon-btn header-btn-plan" onClick={onOpenPlan} title="AI 自主学习规划与诊断">
            <Calendar size={16} />
            <span className="icon-label">学习计划</span>
          </button>

          {onOpenKnowledge && (
            <button
              className="header-icon-btn knowledge-header-btn"
              onClick={onOpenKnowledge}
              title="查看已学单词与语法记录，开启专项复习与智能闪卡"
            >
              <Brain size={16} />
              <span className="icon-label">学情档案</span>
              {learnedCount > 0 && <span className="history-badge-count knowledge-badge">{learnedCount}</span>}
            </button>
          )}

          {onOpenHistory && (
            <button
              className="header-icon-btn history-header-btn"
              onClick={onOpenHistory}
              title="查看所有历史对话记录与会话管理"
            >
              <History size={16} />
              <span className="icon-label">历史对话</span>
              {sessionCount > 0 && <span className="history-badge-count">{sessionCount}</span>}
            </button>
          )}

          <button className="header-icon-btn" onClick={onOpenSettings} title="API 与系统设置 (DeepSeek/OpenAI等)">
            <Settings size={16} />
            <span className="icon-label">设置</span>
          </button>
        </div>
      </div>
    </header>
  );
};
