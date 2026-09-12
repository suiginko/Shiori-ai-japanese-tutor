import React, { useState } from 'react';
import { UserLearningProfile, LearningPlan, UserLevel, ApiSettings, ChatMessage } from '../../types';
import { LEVEL_LABELS } from '../../state/useAppStore';
import { generateUpdatedPlan } from '../../services/llmService';
import { X, CheckCircle2, Circle, RefreshCw, Award, Target, BookOpen, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';

interface LearningPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserLearningProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserLearningProfile>>;
  plan: LearningPlan;
  setPlan: React.Dispatch<React.SetStateAction<LearningPlan>>;
  toggleTask: (id: string) => void;
  settings: ApiSettings;
  messages: ChatMessage[];
  onStartScenario?: (id: string) => void;
}

export const LearningPlanModal: React.FC<LearningPlanModalProps> = ({
  isOpen,
  onClose,
  profile,
  setProfile,
  plan,
  setPlan,
  toggleTask,
  settings,
  messages,
}) => {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [newWeakPoint, setNewWeakPoint] = useState('');

  if (!isOpen) return null;

  const handleLevelChange = (level: UserLevel) => {
    setProfile((prev) => ({
      ...prev,
      level,
      levelLabel: LEVEL_LABELS[level],
    }));
  };

  const handleTaskClick = (id: string) => {
    toggleTask(id);
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
    });
  };

  const handleRegeneratePlan = async () => {
    setIsRegenerating(true);
    try {
      const newPlan = await generateUpdatedPlan(profile, messages, settings);
      setPlan(newPlan);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleAddWeakPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWeakPoint.trim()) return;
    setProfile((prev) => ({
      ...prev,
      weakPoints: [...prev.weakPoints, newWeakPoint.trim()],
    }));
    setNewWeakPoint('');
  };

  const handleRemoveWeakPoint = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      weakPoints: prev.weakPoints.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Target className="text-rose-500" size={20} />
            <h2>AI 自主学习规划与能力诊断</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body plan-modal-grid">
          {/* Left Column: Level & Profile */}
          <div className="plan-column-left">
            <div className="plan-card level-selector-card">
              <div className="card-section-title">
                <Award size={16} />
                <span>当前评估等级 (点击切换)</span>
              </div>
              <div className="level-buttons-grid">
                {(['N0', 'N5', 'N4', 'N3', 'N2', 'N1'] as UserLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    className={`level-choice-btn ${profile.level === lvl ? 'active' : ''}`}
                    onClick={() => handleLevelChange(lvl)}
                  >
                    <span className="lvl-tag">{lvl}</span>
                    <span className="lvl-label">{LEVEL_LABELS[lvl]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mastered Grammar & Weak Points */}
            <div className="plan-card memory-card">
              <div className="card-section-title">
                <AlertTriangle size={16} className="text-amber-500" />
                <span>AI 关注的薄弱突破点</span>
              </div>
              <div className="chips-cloud">
                {profile.weakPoints.map((item, idx) => (
                  <span key={idx} className="weak-chip">
                    <span>{item}</span>
                    <button
                      className="chip-remove"
                      onClick={() => handleRemoveWeakPoint(idx)}
                      title="移除"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <form onSubmit={handleAddWeakPoint} className="add-weak-form">
                <input
                  type="text"
                  placeholder="手动添加生疏项 (如: て形变形)..."
                  value={newWeakPoint}
                  onChange={(e) => setNewWeakPoint(e.target.value)}
                  className="add-weak-input"
                />
                <button type="submit" className="add-weak-btn">添加</button>
              </form>
            </div>

            <div className="plan-card mastered-card">
              <div className="card-section-title">
                <BookOpen size={16} className="text-emerald-500" />
                <span>已掌握的核心语法</span>
              </div>
              <div className="chips-cloud">
                {profile.masteredGrammar.map((item, idx) => (
                  <span key={idx} className="mastered-chip">
                    ✓ {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Plan & Daily Tasks */}
          <div className="plan-column-right">
            <div className="plan-card current-stage-card">
              <div className="stage-header">
                <div>
                  <span className="stage-eyebrow">当前冲刺阶段</span>
                  <h3 className="stage-title">{plan.currentStage}</h3>
                </div>
                <button
                  className="btn-refresh-plan"
                  onClick={handleRegeneratePlan}
                  disabled={isRegenerating}
                  title="让 AI 结合最近对话表现重新规划"
                >
                  <RefreshCw size={14} className={isRegenerating ? 'animate-spin' : ''} />
                  <span>{isRegenerating ? '重新规划中...' : 'AI 刷新计划'}</span>
                </button>
              </div>

              <div className="today-goal-box">
                <span className="goal-label">🎯 今日关键目标：</span>
                <span className="goal-text">{plan.todayGoal}</span>
              </div>

              <div className="progress-section">
                <div className="progress-label-row">
                  <span>本周进度完成度</span>
                  <span className="progress-percentage">{plan.weeklyProgress}%</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${plan.weeklyProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Tasks list */}
            <div className="plan-card tasks-list-card">
              <div className="card-section-title">
                <span>今日推荐攻坚任务</span>
              </div>
              <div className="tasks-container">
                {plan.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`task-item-row ${task.completed ? 'completed' : ''}`}
                    onClick={() => handleTaskClick(task.id)}
                  >
                    <button className="task-checkbox">
                      {task.completed ? (
                        <CheckCircle2 size={18} className="text-emerald-500" />
                      ) : (
                        <Circle size={18} className="text-slate-400" />
                      )}
                    </button>
                    <span className="task-title-text">{task.title}</span>
                    <span className="task-type-badge">{task.type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested topics */}
            <div className="plan-card topics-card">
              <div className="card-section-title">
                <span>AI 建议实战对话主题</span>
              </div>
              <div className="suggested-topics-list">
                {plan.suggestedTopics.map((topic, i) => (
                  <div key={i} className="topic-bubble-item">
                    💬 {topic}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
