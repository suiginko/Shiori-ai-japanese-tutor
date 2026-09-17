import React, { useState } from 'react';
import {
  AbilityAxes,
  ApiSettings,
  LearningGoal,
  LearningPlan,
  Lesson,
  LessonStep,
  UserLearningProfile,
  UserLevel,
} from '../../types';
import { LEVEL_LABELS } from '../../state/useAppStore';
import {
  type CourseProgress,
  EVIDENCE_LABELS,
  isAutoEvidenced,
  lessonMinutes,
} from '../../services/curriculumPlanner';
import { RubyText } from '../Chat/RubyText';
import {
  X,
  CheckCircle2,
  Circle,
  Award,
  Target,
  BookOpen,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Play,
  Layers,
  Swords,
  Volume2,
  Compass,
} from 'lucide-react';

/**
 * 学习课表模态。
 *
 * ——— 设计动机（只写在这里，不进界面）———
 *
 * 与旧版的根本区别（旧版是"打勾清单"）：
 * - 课表由**本地排课器**依学情现排，不再由模型自由发挥或硬编码；
 * - 每个步骤都带**可执行动作**，点开就真的产生教学行为（旧版 `onStartScenario` 声明了却从未使用）；
 * - 进度按"已完成步骤的课时分钟 / 总课时分钟"算出来，并且**系统采证与学生自评分开计数**。
 *
 * ——— 界面文案纪律 ———
 *
 * 本文件渲染出来的每一句话都只面向**学生**。算法口径（百分比怎么算）、
 * 数据来源字段、与旧版的差异、以及"我们为什么这么设计"这类自我论证，
 * 一律只写在注释里，**不得渲染**。
 *
 * 自检标准：这句话如果原样发到用户群里，用户会不会觉得莫名其妙？
 * 反面教材（已清理）：曾在界面上写「这个百分比不是模型随口给的数字」
 * 「旧版 target 字段从来没有被任何代码使用过」——那是评审语，不是用户语。
 */
interface LearningPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserLearningProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserLearningProfile>>;
  plan: LearningPlan;
  progress: CourseProgress;
  axes: AbilityAxes;
  settings: ApiSettings;
  /** 是否有备课 / 上课请求正在进行（用于禁用按钮防重复触发） */
  isBusy: boolean;
  onStartNextLesson: (focus?: Lesson['focus']) => void;
  onPrepareLesson: (lesson: Lesson) => void;
  onExecuteStep: (lesson: Lesson, step: LessonStep) => void;
  onMarkStepDone: (lessonId: string, stepId: string) => void;
  onRemoveLesson: (lessonId: string) => void;
  onResetCourse: () => void;
}

const GOAL_OPTIONS: Array<{ value: LearningGoal; label: string; hint: string }> = [
  { value: 'jlpt', label: 'JLPT 应试', hint: '做题、考点、应试技巧' },
  { value: 'anime', label: '动漫 / 番剧', hint: '台词、语癖、名场面' },
  { value: 'travel', label: '日本旅行', hint: '出行场景优先' },
  { value: 'business', label: '商务职场', hint: '敬语优先' },
  { value: 'school', label: '在校课程', hint: '对齐课内进度' },
  { value: 'free', label: '兴趣自由', hint: '随性聊天推进' },
];

const STEP_KIND_LABEL: Record<LessonStep['kind'], string> = {
  warmup: '热身',
  vocab: '词汇',
  grammar: '句型',
  script: '情境脚本',
  drill: '操练',
  roleplay: '实战演练',
  wrapup: '复盘',
};

const FOCUS_LABEL: Record<Lesson['focus'], string> = {
  shopping: '购物',
  travel: '出行',
  business: '商务',
  anime: '动漫',
  daily: '日常',
  foundation: '基础句型',
  kana: '五十音',
};

function stepActionLabel(step: LessonStep): string {
  if (step.action.type === 'flashcard') return '打开闪卡';
  if (step.action.type === 'review') return '打开笔记本';
  // 开过一步之后再点它，意思只能是"接着上"——老师收到的也是续讲指令，
  // 不会把这一步从头再讲一遍（学生反馈过的"热身唤醒重复触发"）。
  if (step.startedAt) return '接着上';
  switch (step.kind) {
    case 'warmup':
      return '开始热身';
    case 'vocab':
      return '开始学词';
    case 'grammar':
      return '开始学句型';
    case 'script':
      return '看情境脚本';
    case 'drill':
      return '开始随堂测';
    case 'roleplay':
      return '进入演练';
    case 'wrapup':
      return '开始复盘';
    default:
      return '开始';
  }
}

function stepKindIcon(kind: LessonStep['kind']) {
  switch (kind) {
    case 'warmup':
      return <Volume2 size={13} />;
    case 'vocab':
      return <Layers size={13} />;
    case 'grammar':
      return <BookOpen size={13} />;
    case 'script':
      return <Compass size={13} />;
    case 'drill':
      return <Target size={13} />;
    case 'roleplay':
      return <Swords size={13} />;
    default:
      return <Sparkles size={13} />;
  }
}

/** 把「词形 + 读音」拼成软件规范的注音串，交给 RubyText 渲染振假名 */
function toAnnotated(surface: string, reading?: string): string {
  if (!reading || !/[一-龯々〆]/.test(surface)) return surface;
  return `{${surface}[${reading}]}`;
}

// `targets` 用于闪卡步骤提示"这一步该复习哪些词"
function stepTargetHint(step: LessonStep): string {
  if (step.action.type === 'flashcard' && step.action.wordIds?.length) {
    return `复习词：${step.action.wordIds.join('、')}`;
  }
  return '';
}

export const LearningPlanModal: React.FC<LearningPlanModalProps> = ({
  isOpen,
  onClose,
  profile,
  setProfile,
  plan,
  progress,
  axes,
  settings,
  isBusy,
  onStartNextLesson,
  onPrepareLesson,
  onExecuteStep,
  onMarkStepDone,
  onRemoveLesson,
  onResetCourse,
}) => {
  const [newWeakPoint, setNewWeakPoint] = useState('');
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(plan.activeLessonId || null);

  if (!isOpen) return null;

  const lessons = plan.lessons || [];

  const handleLevelChange = (level: UserLevel) => {
    setProfile((prev) => ({ ...prev, level, levelLabel: LEVEL_LABELS[level] }));
  };

  const handleGoalChange = (goal: LearningGoal) => {
    // 目标取向只影响"下一课取材"，不追溯改写已排好的课时——已上过的课不该被追溯篡改
    setProfile((prev) => ({ ...prev, goal }));
  };

  const handleAddWeakPoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWeakPoint.trim()) return;
    setProfile((prev) => ({ ...prev, weakPoints: [...prev.weakPoints, newWeakPoint.trim()] }));
    setNewWeakPoint('');
  };

  const handleRemoveWeakPoint = (index: number) => {
    setProfile((prev) => ({ ...prev, weakPoints: prev.weakPoints.filter((_, i) => i !== index) }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Target size={20} />
            <h2>学习课表</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body plan-modal-grid">
          {/* ——— 左栏：画像与取材设定 ——— */}
          <div className="plan-column-left">
            <div className="plan-card level-selector-card">
              <div className="card-section-title">
                <Award size={16} />
                <span>你现在的水平</span>
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

            <div className="plan-card">
              <div className="card-section-title">
                <Compass size={16} />
                <span>你学日语是为了</span>
              </div>
              <div className="goal-chip-grid">
                {GOAL_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    className={`goal-chip ${(profile.goal || 'jlpt') === g.value ? 'active' : ''}`}
                    onClick={() => handleGoalChange(g.value)}
                    title={g.hint}
                  >
                    <span className="goal-chip-label">{g.label}</span>
                    <span className="goal-chip-hint">{g.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="plan-card">
              <div className="card-section-title">
                <Layers size={16} />
                <span>你的学习进度</span>
              </div>
              <ul className="axis-list">
                <li>
                  <span className="axis-name">词汇</span>
                  <span className="axis-value">
                    {axes.vocabKnown ?? 0}
                    {axes.targets?.vocab ? ` / ${axes.targets.vocab}` : ''} 词
                  </span>
                </li>
                <li>
                  <span className="axis-name">句型语法</span>
                  <span className="axis-value">
                    {axes.grammarKnown ?? 0}
                    {axes.targets?.grammar ? ` / ${axes.targets.grammar}` : ''} 项
                  </span>
                </li>
                <li>
                  <span className="axis-name">已见汉字</span>
                  <span className="axis-value">{axes.kanjiSeen ?? 0} 个</span>
                </li>
                <li>
                  <span className="axis-name">假名</span>
                  <span className="axis-value">
                    {axes.kanaKnown === undefined ? '暂未统计' : `${axes.kanaKnown} 个`}
                  </span>
                </li>
              </ul>
              <p className="axis-note">
                这些数字来自你的生词本与语法档案，会随着上课自然增长。听力与口语暂不计入——
                软件还没有办法客观统计它们。
              </p>
            </div>

            <div className="plan-card memory-card">
              <div className="card-section-title">
                <AlertTriangle size={16} />
                <span>薄弱突破点</span>
              </div>
              <div className="chips-cloud">
                {profile.weakPoints.map((item, idx) => (
                  <span key={idx} className="weak-chip">
                    <span>{item}</span>
                    <button className="chip-remove" onClick={() => handleRemoveWeakPoint(idx)} title="移除">
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
                <button type="submit" className="add-weak-btn">
                  添加
                </button>
              </form>
            </div>
          </div>

          {/* ——— 右栏：课表与课时 ——— */}
          <div className="plan-column-right">
            <div className="plan-card course-overview-card">
              <div className="stage-header">
                <div>
                  <span className="stage-eyebrow">课表进度</span>
                  <h3 className="stage-title">
                    {lessons.length > 0
                      ? `已上 ${progress.doneLessons} / ${lessons.length} 课`
                      : '还没有课表'}
                  </h3>
                </div>
                <div className="course-overview-actions">
                  {lessons.length > 0 && (
                    <button className="btn-ghost-danger" onClick={onResetCourse} title="清空课表（不动生词本）">
                      <Trash2 size={13} />
                      <span>清空课表</span>
                    </button>
                  )}
                  <button className="btn-refresh-plan" onClick={() => onStartNextLesson()} disabled={isBusy}>
                    {isBusy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                    <span>{isBusy ? '老师正在备课…' : lessons.length ? '排下一课' : '排第一课'}</span>
                  </button>
                </div>
              </div>

              {lessons.length > 0 && (
                <>
                  <div className="progress-section">
                    <div className="progress-label-row">
                      <span>课时推进度</span>
                      <span className="progress-percentage">{progress.percent}%</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
                    </div>
                    <div className="course-evidence-split">
                      <span className="evidence-pill system">
                        系统记录 {progress.evidencedSteps} 步
                      </span>
                      <span className="evidence-pill self">
                        你确认 {progress.selfReportedSteps} 步
                      </span>
                      <span className="evidence-pill plain">
                        还剩约 {progress.remainingMinutes} 分钟
                      </span>
                    </div>
                    <p className="course-legend">
                      进度按上完的步骤时长折算。「系统记录」是进生词本、做过小测、演练达标这些会留下痕迹的动作；
                      「你确认」是热身、复盘这类没法自动判定的步骤。它表示课推进到哪了，不代表你掌握了多少。
                    </p>
                  </div>
                </>
              )}

              {lessons.length === 0 && (
                <div className="lesson-empty-state">
                  <Sparkles size={30} />
                  <p>还没有课表。点「排第一课」，系统会按你的生词本与语法档案安排一节：</p>
                  <ul>
                    <li>只教你还不会的词和句型，学过的不重复</li>
                    <li>优先安排你碰见过很多次、却一直没考过的词</li>
                    <li>排好后老师会当场备课，写好情境脚本和练习目标</li>
                  </ul>
                </div>
              )}
            </div>

            {lessons.map((lesson) => {
              const isExpanded = expandedLessonId === lesson.id;
              const doneSteps = lesson.steps.filter((s) => s.done).length;
              const newWords = lesson.items.words.filter((w) => w.isNew);
              const reviewWords = lesson.items.words.filter((w) => !w.isNew);

              return (
                <div key={lesson.id} className={`plan-card lesson-card status-${lesson.status}`}>
                  <div
                    className="lesson-card-head"
                    onClick={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
                  >
                    <div className="lesson-head-main">
                      <div className="lesson-head-line">
                        <span className="lesson-index">第 {lesson.index} 课</span>
                        <h4 className="lesson-title">{lesson.title}</h4>
                        <span className={`lesson-status-badge status-${lesson.status}`}>
                          {lesson.status === 'done' ? '已完成' : lesson.status === 'in_progress' ? '进行中' : '未开始'}
                        </span>
                        <span className="lesson-focus-badge">{FOCUS_LABEL[lesson.focus]}</span>
                      </div>
                      <p className="lesson-goal">{lesson.goal}</p>
                      <div className="lesson-meta">
                        <span>
                          {doneSteps}/{lesson.steps.length} 步 · 约 {lessonMinutes(lesson)} 分钟
                        </span>
                        {newWords.length > 0 && <span>新词 {newWords.length}</span>}
                        {reviewWords.length > 0 && <span>复习 {reviewWords.length}</span>}
                        {lesson.items.grammars.length > 0 && <span>句型 {lesson.items.grammars.length}</span>}
                        <span className={`material-badge material-${lesson.material}`}>
                          {lesson.material === 'ready'
                            ? '教材已就绪'
                            : lesson.material === 'generating'
                            ? '备课中…'
                            : lesson.material === 'failed'
                            ? '备课失败'
                            : '待备课'}
                        </span>
                      </div>
                    </div>
                    <div className="lesson-head-side">
                      <span className="lesson-expand-icon">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                    </div>
                  </div>

                  {/* 步骤列表：每一步都能点开 */}
                  <div className="lesson-steps">
                    {lesson.steps.map((step) => {
                      const auto = isAutoEvidenced(step);
                      const targetHint = stepTargetHint(step);
                      return (
                        <div key={step.id} className={`lesson-step ${step.done ? 'done' : ''}`}>
                          <span className="step-state">
                            {step.done ? (
                              <CheckCircle2 size={16} />
                            ) : (
                              <Circle size={16} />
                            )}
                          </span>
                          <div className="step-main">
                            <div className="step-title-line">
                              <span className="step-kind">
                                {stepKindIcon(step.kind)}
                                {STEP_KIND_LABEL[step.kind]}
                              </span>
                              <span className="step-title">{step.title}</span>
                              <span className="step-min">{step.minutes} 分钟</span>
                            </div>
                            {step.brief && <p className="step-brief">{step.brief}</p>}
                            <p className="step-evidence">
                              {step.done
                                ? `完成依据：${EVIDENCE_LABELS[step.evidence?.via || 'manual']}`
                                : auto
                                ? '做到就自动打勾，不用手动确认'
                                : '这一步请你自己确认'}
                              {targetHint ? ` · ${targetHint}` : ''}
                            </p>
                          </div>
                          <div className="step-actions">
                            <button
                              className="step-btn primary"
                              disabled={isBusy}
                              onClick={() => onExecuteStep(lesson, step)}
                              title={
                                step.action.type === 'chat' && step.startedAt
                                  ? '接着上一次的进度继续，老师不会重头再讲一遍'
                                  : undefined
                              }
                            >
                              <Play size={12} />
                              <span>{stepActionLabel(step)}</span>
                            </button>
                            {!step.done && !auto && (
                              <button
                                className="step-btn ghost"
                                onClick={() => onMarkStepDone(lesson.id, step.id)}
                                title="点一下表示这一步做完了"
                              >
                                我完成了
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {isExpanded && (
                    <div className="lesson-detail">
                      {lesson.material === 'generating' && (
                        <div className="lesson-material-state">
                          <Loader2 size={14} className="spin" />
                          <span>老师正在备课、编写情境脚本…</span>
                        </div>
                      )}
                      {lesson.material === 'failed' && (
                        <div className="lesson-material-state failed">
                          <AlertTriangle size={14} />
                          <span>{lesson.error || '备课失败'}</span>
                          <button className="step-btn ghost" onClick={() => onPrepareLesson(lesson)} disabled={isBusy}>
                            <RefreshCw size={12} />
                            重新备课
                          </button>
                        </div>
                      )}
                      {lesson.material === 'skeleton' && (
                        <div className="lesson-material-state">
                          <AlertTriangle size={14} />
                          <span>老师还没备课（本课的词和句型已经排好，可以先按步骤上课）</span>
                          <button className="step-btn ghost" onClick={() => onPrepareLesson(lesson)} disabled={isBusy}>
                            <Sparkles size={12} />
                            让老师备课
                          </button>
                        </div>
                      )}

                      {lesson.items.words.length > 0 && (
                        <div className="lesson-block">
                          <span className="lesson-block-title">本课知识点</span>
                          <div className="lesson-word-list">
                            {lesson.items.words.map((w) => (
                              <span key={w.surface} className={`lesson-word ${w.isNew ? 'is-new' : 'is-review'}`}>
                                <RubyText
                                  content={toAnnotated(w.surface, w.reading)}
                                  isExplicitJapanese
                                  interactive={false}
                                />
                                {w.meaning && <em className="word-meaning">{w.meaning}</em>}
                                {w.reason && <em className="word-reason">{w.reason}</em>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {lesson.items.grammars.length > 0 && (
                        <div className="lesson-block">
                          <span className="lesson-block-title">本课句型</span>
                          <ul className="lesson-grammar-list">
                            {lesson.items.grammars.map((g) => (
                              <li key={g.title}>
                                <strong>{g.title}</strong>
                                {g.structure && <span className="grammar-structure">{g.structure}</span>}
                                {g.meaning && <span className="grammar-meaning">{g.meaning}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {lesson.items.script && lesson.items.script.length > 0 && (
                        <div className="lesson-block">
                          <span className="lesson-block-title">情境脚本（可照着演）</span>
                          <div className="script-lines">
                            {lesson.items.script.map((line, i) => (
                              <div key={i} className={`script-line speaker-${line.speaker}`}>
                                <span className="script-speaker">
                                  {line.speaker === 'ai' ? '老师' : '你'}
                                </span>
                                <div className="script-body">
                                  <div className="script-jp">
                                    <RubyText content={line.jp} isExplicitJapanese interactive={false} />
                                  </div>
                                  {line.cn && <div className="script-cn">{line.cn}</div>}
                                  {line.note && <div className="script-note">{line.note}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {lesson.items.points && lesson.items.points.length > 0 && (
                        <div className="lesson-block">
                          <span className="lesson-block-title">文化 / 语用 / 声调点拨</span>
                          <ul className="lesson-point-list">
                            {lesson.items.points.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="lesson-card-footer">
                        <span className="lesson-footer-note">
                          本课由老师按你的生词本与语法档案备课，词义与读音以软件词典为准。
                        </span>
                        <button
                          className="btn-ghost-danger"
                          onClick={() => onRemoveLesson(lesson.id)}
                          title="删除这一课"
                        >
                          <Trash2 size={13} />
                          <span>删除本课</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
