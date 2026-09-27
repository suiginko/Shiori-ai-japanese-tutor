import React, { useState } from 'react';
import {
  AbilityAxes,
  ApiSettings,
  LearningGoal,
  LearningPlan,
  Lesson,
  LessonStep,
  StudyPace,
  UserLearningProfile,
  UserLevel,
} from '../../types';
import { LEVEL_LABELS } from '../../state/useAppStore';
import {
  type CourseProgress,
  EVIDENCE_LABELS,
  isAutoEvidenced,
  lessonMinutes,
  JLPT_ROADMAP_STAGES,
  type LevelRoadmapStage,
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
  Clock,
  Dices,
  MapPin,
  Check,
  Lock,
  Star,
  Milestone,
} from 'lucide-react';

/**
 * 学习计划模态。
 *
 * ——— 设计动机（只写在这里，不进界面）———
 *
 * 1) 学生打开这个弹窗，心里只有一句话：「我现在该做什么？」。
 *    所以顶部固定给一张行动卡，直接指向"正在上的那一课里第一个没做完的步骤"，
 *    按钮上的字就是那一步的动作（开始热身 / 接着上 / 学本课词汇…）。
 *    旧版把这件事藏在一张张卡片里让学生自己找。
 *
 * 2) 步骤默认**随课时折叠**。旧版 `isExpanded` 只控制教材详情，步骤行恒显示：
 *    三课 × 七步 = 二十一个按钮铺满屏幕，真正要用的那一个被淹没。
 *    现在只有正在上的那一课默认展开（`activeLessonId`），其余折叠并给一条迷你进度条。
 *
 * 3) 左右两栏在窄屏会单列铺开，而旧版左栏四张设置卡排在前面，
 *    手机上必须滚过四张设置卡才看得到课表。DOM 顺序改为「总览 → 课时 → 你的情况」，
 *    桌面再用 grid 把「你的情况」放到右列。
 *
 * 4) 徽章减量：`教材已就绪` 是默认态，不必说；题材已在课时标题里，不必再挂一枚徽章。
 *    只有异常态（备课中 / 备课失败 / 待备课）才出面。
 *
 * ——— 界面文案纪律 ———
 *
 * 本文件渲染出来的每一句话都只面向**学生**。算法口径、数据来源、与旧版的差异、
 * "我们为什么这么设计"这类自我论证，一律只写在注释里，**不得渲染**。
 * 自检标准：这句话原样发到用户群里，会不会让人莫名其妙？
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
  onSetPace?: (pace: StudyPace) => void;
  onRerollScenario?: (lessonId: string, customTopic?: string) => void;
}

const PACE_OPTIONS: Array<{ value: StudyPace; label: string; hint: string }> = [
  { value: 'light', label: '轻量微课', hint: '约 15 分钟 · 3 词 1 句型（通勤碎片）' },
  { value: 'standard', label: '标准平衡', hint: '约 25-30 分钟 · 6 词 2 句型（系统进阶）' },
  { value: 'intensive', label: '高能冲刺', hint: '约 40-45 分钟 · 10 词 3 句型（考前备战）' },
];

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

/**
 * 课时的标题里本身带着「第 N 课 · 」前缀（老师收到的备课任务书用它来定位，
 * 所以数据里保留）。但卡片头已经单独有一枚「第 N 课」胶囊，两处并排就是重复，
 * 所以只在**渲染**时把前缀摘掉。
 */
function displayTitle(lesson: Lesson): string {
  return lesson.title.replace(/^第 \d+ 课 · /, '');
}

// 闪卡步骤提示"这一步该复习哪些词"
function stepTargetHint(step: LessonStep): string {
  if (step.action.type === 'flashcard' && step.action.wordIds?.length) {
    return `复习词：${step.action.wordIds.join('、')}`;
  }
  return '';
}

interface NextAction {
  kind: 'plan' | 'step';
  lesson?: Lesson;
  step?: LessonStep;
  eyebrow: string;
  title: string;
  sub: string;
  label: string;
}

/**
 * 把"学生此刻最该做的一件事"算出来。
 * 优先级：正在上的课 → 第一节没上完的课 → 排新的一课。
 */
function resolveNextAction(lessons: Lesson[]): NextAction {
  if (lessons.length === 0) {
    return {
      kind: 'plan',
      eyebrow: '从这里开始',
      title: '还没有课表',
      sub: '系统按你的笔记本排一节：只教还不会的词和句型，学过的不重复。',
      label: '排第一课',
    };
  }

  const active =
    lessons.find((l) => l.status === 'in_progress') || lessons.find((l) => l.status !== 'done');

  if (!active) {
    return {
      kind: 'plan',
      eyebrow: '这一轮上完了',
      title: '课表里的课都上完了',
      sub: '可以排下一课，老师接着你现在的进度往上走。',
      label: '排下一课',
    };
  }

  const step = active.steps.filter((s) => s.kind !== 'script').find((s) => !s.done);
  if (!step) {
    return {
      kind: 'plan',
      eyebrow: '下一课',
      title: `第 ${active.index} 课已经走到最后一步`,
      sub: '排下一课，把这一课学到的东西接着用起来。',
      label: '排下一课',
    };
  }

  return {
    kind: 'step',
    lesson: active,
    step,
    eyebrow: `第 ${active.index} 课 · ${displayTitle(active)}`,
    title: step.title,
    sub: step.brief || '点开这一步，老师会带你把它走一遍。',
    label: stepActionLabel(step),
  };
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
  onSetPace,
  onRerollScenario,
}) => {
  const [newWeakPoint, setNewWeakPoint] = useState('');
  const lessons = plan.lessons || [];
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(
    plan.activeLessonId || lessons.find((l) => l.status === 'in_progress')?.id || null
  );
  const [resetArmed, setResetArmed] = useState(false);
  const [topicInputOpenLessonId, setTopicInputOpenLessonId] = useState<string | null>(null);
  const [customTopicText, setCustomTopicText] = useState('');

  const PRESET_TOPICS = ['便利店点单', '居酒屋聚餐', '车站买票问路', '秋叶原淘周边', '神社祈福参拜', '酒店入住问询'];

  if (!isOpen) return null;

  const handleLevelChange = (level: UserLevel) => {
    setProfile((prev) => ({ ...prev, level, levelLabel: LEVEL_LABELS[level] }));
  };

  const handlePaceChange = (pace: StudyPace) => {
    setProfile((prev) => ({ ...prev, studyPace: pace }));
    if (onSetPace) onSetPace(pace);
  };

  const handleTriggerReroll = (lessonId: string, topic?: string) => {
    if (!onRerollScenario) return;
    const finalTopic = topic || customTopicText.trim() || PRESET_TOPICS[Math.floor(Math.random() * PRESET_TOPICS.length)];
    onRerollScenario(lessonId, finalTopic);
    setTopicInputOpenLessonId(null);
    setCustomTopicText('');
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

  const next = resolveNextAction(lessons);

  const runNext = () => {
    if (next.kind === 'step' && next.lesson && next.step) {
      onExecuteStep(next.lesson, next.step);
    } else {
      onStartNextLesson();
    }
  };

  const handleResetClick = () => {
    // 清空课表不可撤销，做成两次点击：第一次只是把按钮变成确认态
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setResetArmed(false);
    onResetCourse();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-large plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <Target size={20} />
            <h2 id="plan-modal-title">学习计划</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="关闭学习计划">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body plan-modal-grid">
          {/* ——— 总览：下一步 + 进度 ——— */}
          <section className="plan-overview" aria-label="课程总览">
            <div className="plan-overview-top">
              <div className="plan-next">
                <div className="plan-next-header">
                  <span className="plan-next-eyebrow">{next.eyebrow}</span>
                  {lessons.length > 0 && (
                    <button
                      className={`plan-reset-link ${resetArmed ? 'armed' : ''}`}
                      onClick={handleResetClick}
                      onBlur={() => setResetArmed(false)}
                      title="清空课表，生词本与笔记本不受影响"
                    >
                      <Trash2 size={12} />
                      <span>{resetArmed ? '再点一次确认清空' : '清空课表'}</span>
                    </button>
                  )}
                </div>
                <h3 className="plan-next-title">{next.title}</h3>
                <p className="plan-next-sub">{next.sub}</p>
              </div>
              <div className="plan-overview-actions">
                <button className="plan-cta" onClick={runNext} disabled={isBusy}>
                  {isBusy ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
                  <span>{isBusy ? '老师正在备课…' : next.label}</span>
                </button>
              </div>
            </div>

            {lessons.length > 0 && (
              <div className="plan-progress">
                <div className="plan-progress-head">
                  <span className="plan-progress-count">
                    已上 {progress.doneLessons} / {lessons.length} 课
                  </span>
                  <span className="plan-progress-percent">{progress.percent}%</span>
                </div>
                <div
                  className="plan-progress-track"
                  role="progressbar"
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="课表推进度"
                >
                  <div className="plan-progress-fill" style={{ width: `${progress.percent}%` }} />
                </div>
                <div className="plan-progress-pills">
                  <span className="plan-pill ok">已推进 {progress.evidencedSteps + progress.selfReportedSteps} 步</span>
                  <span className="plan-pill plain">预计还剩约 {progress.remainingMinutes} 分钟</span>
                </div>
              </div>
            )}

            {lessons.length === 0 && (
              <ul className="plan-empty-list">
                <li>只教你还不会的词和句型，学过的不重复</li>
                <li>优先安排你碰见过很多次、却一直没考过的词</li>
                <li>排好后老师会当场备课，生成真实情境与实战演练任务</li>
              </ul>
            )}
          </section>

          {/* ——— 初阶到高阶全景脉络 ——— */}
          <section className="plan-roadmap-section" aria-label="全景进阶脉络">
            <div className="roadmap-header">
              <div className="roadmap-header-info">
                <div className="roadmap-header-title-row">
                  <Compass size={16} className="roadmap-icon" />
                  <h3 className="roadmap-title">初阶到高阶进阶全景</h3>
                  <span className="roadmap-current-badge">
                    当前定位：{profile.level} · {LEVEL_LABELS[profile.level] || profile.levelLabel}
                  </span>
                </div>
                <p className="roadmap-desc">
                  纵览日语学习完整路径。已跨越的阶段已沉淀为基石，随时可以切换定位或前瞻未来进阶里程碑。
                </p>
              </div>
            </div>

            <div className="roadmap-stages-scroll">
              <div className="roadmap-stages-grid">
                {JLPT_ROADMAP_STAGES.map((stage) => {
                  const stageSeq = ['N0', 'N5', 'N4', 'N3', 'N2', 'N1'];
                  const curIdx = stageSeq.indexOf(profile.level);
                  const thisIdx = stageSeq.indexOf(stage.level);
                  const isPast = thisIdx < curIdx;
                  const isCurrent = thisIdx === curIdx;
                  const isFuture = thisIdx > curIdx;

                  const statusClass = isCurrent ? 'stage-current' : isPast ? 'stage-past' : 'stage-future';

                  return (
                    <div key={stage.level} className={`roadmap-stage-card ${statusClass}`}>
                      <div className="stage-card-head">
                        <div className="stage-head-left">
                          <span
                            className="stage-level-tag"
                            style={{
                              borderColor: `${stage.color}50`,
                              backgroundColor: `${stage.color}15`,
                              color: stage.color,
                            }}
                          >
                            {stage.level}
                          </span>
                          <div className="stage-titles">
                            <span className="stage-name">{stage.stageName}</span>
                            <span className="stage-level-title">{stage.levelTitle}</span>
                          </div>
                        </div>

                        <div className="stage-head-right">
                          {isCurrent && (
                            <span className="stage-status-pill status-current">
                              <Sparkles size={11} />
                              <span>当前研习</span>
                            </span>
                          )}
                          {isPast && (
                            <span className="stage-status-pill status-past">
                              <Check size={11} />
                              <span>已跨越/跳过</span>
                            </span>
                          )}
                          {isFuture && (
                            <span className="stage-status-pill status-future">
                              <Milestone size={11} />
                              <span>未来进阶</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="stage-summary">{stage.summary}</p>

                      <div className="stage-targets-wrap">
                        <span className="stage-targets-title">核心攻坚：</span>
                        <div className="stage-target-chips">
                          {stage.coreTargets.map((target, tIdx) => (
                            <span key={tIdx} className="stage-target-chip">
                              {target}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="stage-card-foot">
                        <span className="stage-lessons-est">
                          <BookOpen size={11} />
                          <span>规划体量：{stage.estimatedLessons}</span>
                        </span>
                        {!isCurrent ? (
                          <button
                            type="button"
                            className="stage-switch-action"
                            onClick={() => handleLevelChange(stage.level)}
                            title={`将学习定位切换至 ${stage.level}`}
                          >
                            {isPast ? '复习此阶段' : '跳至此阶段'}
                          </button>
                        ) : (
                          <span className="stage-active-mark">当前课表对齐中</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ——— 课时列表 ——— */}
          <section className="plan-column-lessons" aria-label="课时">
            {lessons.map((lesson) => {
              const isExpanded = expandedLessonId === lesson.id;
              const displaySteps = lesson.steps.filter((s) => s.kind !== 'script');
              const doneSteps = displaySteps.filter((s) => s.done).length;
              const totalSteps = displaySteps.length;
              const stepPercent = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;
              const newWords = lesson.items.words.filter((w) => w.isNew);
              const reviewWords = lesson.items.words.filter((w) => !w.isNew);
              const detailId = `lesson-detail-${lesson.id}`;
              const statusText =
                lesson.status === 'done' ? '已完成' : lesson.status === 'in_progress' ? '进行中' : '未开始';

              return (
                <article
                  key={lesson.id}
                  className={`plan-card lesson-card status-${lesson.status}`}
                >
                  <button
                    className="lesson-card-head"
                    aria-expanded={isExpanded}
                    aria-controls={detailId}
                    onClick={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
                  >
                    <span className="lesson-head-main">
                      <span className="lesson-head-line">
                        <span className="lesson-index">第 {lesson.index} 课</span>
                        <span className="lesson-title">{displayTitle(lesson)}</span>
                        <span className={`lesson-status-badge status-${lesson.status}`}>{statusText}</span>
                      </span>
                      <span className="lesson-goal">{lesson.goal}</span>
                      <span className="lesson-head-foot">
                        <span className="lesson-mini-track" aria-hidden="true">
                          <span className="lesson-mini-fill" style={{ width: `${stepPercent}%` }} />
                        </span>
                        <span className="lesson-head-stat">
                          {doneSteps}/{totalSteps} 步 · 约 {lessonMinutes(lesson)} 分钟
                        </span>
                        {newWords.length > 0 && <span className="lesson-head-stat">新词 {newWords.length}</span>}
                        {reviewWords.length > 0 && (
                          <span className="lesson-head-stat">复习 {reviewWords.length}</span>
                        )}
                        {lesson.items.grammars.length > 0 && (
                          <span className="lesson-head-stat">句型 {lesson.items.grammars.length}</span>
                        )}
                      </span>
                    </span>
                    <span className="lesson-head-side">
                      {lesson.material === 'generating' && (
                        <span className="material-badge material-generating">备课中…</span>
                      )}
                      {lesson.material === 'failed' && (
                        <span className="material-badge material-failed">备课失败</span>
                      )}
                      {lesson.material === 'skeleton' && (
                        <span className="material-badge material-skeleton">待备课</span>
                      )}
                      <span className="lesson-expand-icon">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="lesson-detail" id={detailId}>
                      {lesson.material === 'generating' && (
                        <div className="lesson-material-state" aria-live="polite">
                          <Loader2 size={14} className="spin" />
                          <span>老师正在备课、构建实战演练情境…</span>
                        </div>
                      )}
                      {lesson.material === 'failed' && (
                        <div className="lesson-material-state failed" aria-live="polite">
                          <AlertTriangle size={14} />
                          <span>{lesson.error || '备课失败'}</span>
                          <button
                            className="step-btn ghost"
                            onClick={() => onPrepareLesson(lesson)}
                            disabled={isBusy}
                          >
                            <RefreshCw size={12} />
                            重新备课
                          </button>
                        </div>
                      )}
                      {lesson.material === 'skeleton' && (
                        <div className="lesson-material-state">
                          <AlertTriangle size={14} />
                          <span>老师还没备课。词和句型已经排好，也可以先按步骤上课。</span>
                          <button
                            className="step-btn ghost"
                            onClick={() => onPrepareLesson(lesson)}
                            disabled={isBusy}
                          >
                            <Sparkles size={12} />
                            让老师备课
                          </button>
                        </div>
                      )}

                      {/* 步骤：每一步都能点开 */}
                      <div className="lesson-steps">
                        <div className="lesson-steps-header">
                          <span className="lesson-steps-title">课时步骤</span>
                          <span className="lesson-steps-hint">互动或作答后自动推进</span>
                        </div>
                        {displaySteps.map((step, sIdx) => {
                          const targetHint = stepTargetHint(step);
                          const isNextAction = !step.done && !lesson.steps.slice(0, sIdx).some((s) => !s.done);
                          const btnClass = step.done
                            ? 'step-btn done'
                            : isNextAction
                            ? 'step-btn primary'
                            : 'step-btn secondary';

                          return (
                            <div
                              key={step.id}
                              className={`lesson-step ${step.done ? 'done' : ''} ${isNextAction ? 'next-action' : ''}`}
                            >
                              <span className="step-state">
                                {step.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
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
                                {step.done ? (
                                  <p className="step-evidence done">
                                    <Check size={11} />
                                    <span>{EVIDENCE_LABELS[step.evidence?.via || 'manual'] || '已完成'}</span>
                                    {targetHint ? ` · ${targetHint}` : ''}
                                  </p>
                                ) : targetHint ? (
                                  <p className="step-evidence hint">
                                    <span>{targetHint}</span>
                                  </p>
                                ) : null}
                              </div>
                              <div className="step-actions">
                                <button
                                  className={btnClass}
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
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {lesson.items.words.length > 0 && (
                        <div className="lesson-block">
                          <span className="lesson-block-title">本课知识点</span>
                          <div className="lesson-word-list">
                            {lesson.items.words.map((w) => (
                              <span
                                key={w.surface}
                                className={`lesson-word ${w.isNew ? 'is-new' : 'is-review'}`}
                              >
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
                                {g.reason && <span className="grammar-reason" style={{ fontSize: '11px', color: 'var(--primary-color, #3b82f6)', marginLeft: '6px' }}>[{g.reason}]</span>}
                                {g.structure && <span className="grammar-structure">{g.structure}</span>}
                                {g.meaning && <span className="grammar-meaning">{g.meaning}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {lesson.scenario && lesson.focus !== 'kana' && (
                        <div className="lesson-block lesson-scenario-block">
                          <div className="scenario-block-head">
                            <div className="scenario-block-title-wrap">
                              <Compass size={14} className="scenario-icon" />
                              <span className="lesson-block-title">实战演练情境</span>
                              <span className="scenario-pill">{lesson.scenario.title}</span>
                            </div>
                            {onRerollScenario && lesson.status !== 'done' && (
                              <button
                                type="button"
                                className={`scenario-reroll-trigger ${topicInputOpenLessonId === lesson.id ? 'active' : ''}`}
                                onClick={() => setTopicInputOpenLessonId(topicInputOpenLessonId === lesson.id ? null : lesson.id)}
                                disabled={isBusy}
                                title="围绕本课词汇与句型，换一个演练情境"
                              >
                                <Dices size={12} className={isBusy ? 'spin' : ''} />
                                <span>换个情境</span>
                              </button>
                            )}
                          </div>

                          {topicInputOpenLessonId === lesson.id && (
                            <div className="scenario-reroll-box">
                              <div className="scenario-reroll-label">
                                指定想练的情境（保持本课词汇与句型不变）：
                              </div>
                              <div className="scenario-reroll-input-row">
                                <input
                                  type="text"
                                  placeholder="如：药妆店买护肤品 / 动漫展买周边 / 居酒屋聚餐"
                                  value={customTopicText}
                                  onChange={(e) => setCustomTopicText(e.target.value)}
                                  className="scenario-reroll-input"
                                />
                                <button
                                  type="button"
                                  className="scenario-reroll-submit"
                                  onClick={() => handleTriggerReroll(lesson.id)}
                                  disabled={isBusy}
                                >
                                  {customTopicText.trim() ? '应用新情境' : '随机换'}
                                </button>
                              </div>
                              <div className="scenario-preset-pills">
                                {PRESET_TOPICS.map((pt) => (
                                  <button
                                    key={pt}
                                    type="button"
                                    onClick={() => handleTriggerReroll(lesson.id, pt)}
                                    className="scenario-preset-btn"
                                  >
                                    {pt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="scenario-mission-card">
                            {lesson.scenario.description && (
                              <p className="scenario-desc-text">{lesson.scenario.description}</p>
                            )}
                            {lesson.scenario.goals && lesson.scenario.goals.length > 0 && (
                              <div className="scenario-goals-list">
                                <span className="scenario-goals-label">演练通关目标：</span>
                                <ul>
                                  {lesson.scenario.goals.map((g, gIdx) => (
                                    <li key={g.id || gIdx}>
                                      <Target size={12} className="goal-bullet-icon" />
                                      <span>{g.description}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="lesson-card-footer">
                        <span className="lesson-footer-note">
                          本课由老师按你的笔记本备课，词义与读音以软件词典为准。
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
                </article>
              );
            })}
          </section>

          {/* ——— 你的情况：改这里只影响下一课取材 ——— */}
          <section className="plan-column-profile" aria-label="你的情况">
            <h3 className="plan-section-title">你的情况</h3>
            <p className="plan-section-note">改这里只影响下一课怎么排，已经上过的课不受影响。</p>

            <div className="plan-card">
              <div className="card-section-title">
                <Award size={16} />
                <span>现在的位置</span>
              </div>
              <div className="level-buttons-grid">
                {(['N0', 'N5', 'N4', 'N3', 'N2', 'N1'] as UserLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    className={`level-choice-btn ${profile.level === lvl ? 'active' : ''}`}
                    onClick={() => handleLevelChange(lvl)}
                    aria-pressed={profile.level === lvl}
                  >
                    <span className="lvl-tag">{lvl}</span>
                    <span className="lvl-label">{LEVEL_LABELS[lvl]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="plan-card">
              <div className="card-section-title">
                <Clock size={16} />
                <span>课时节奏与容量</span>
              </div>
              <div className="goal-chip-grid">
                {PACE_OPTIONS.map((p) => {
                  const active = (profile.studyPace || 'standard') === p.value;
                  return (
                    <button
                      key={p.value}
                      className={`goal-chip ${active ? 'active' : ''}`}
                      onClick={() => handlePaceChange(p.value)}
                      aria-pressed={active}
                      title={p.hint}
                    >
                      <span className="goal-chip-label">{p.label}</span>
                      <span className="goal-chip-hint">{p.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="plan-card">
              <div className="card-section-title">
                <Compass size={16} />
                <span>学日语是为了</span>
              </div>
              <div className="goal-chip-grid">
                {GOAL_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    className={`goal-chip ${(profile.goal || 'jlpt') === g.value ? 'active' : ''}`}
                    onClick={() => handleGoalChange(g.value)}
                    aria-pressed={(profile.goal || 'jlpt') === g.value}
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
                <span>走到哪了</span>
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
                这些数字来自你的笔记本，会随着上课自然增长。听力与口语暂未统计——软件还没有办法客观
                统计它们。
              </p>
            </div>

            <div className="plan-card">
              <div className="card-section-title">
                <AlertTriangle size={16} />
                <span>想重点攻克</span>
              </div>
              <div className="chips-cloud">
                {profile.weakPoints.map((item, idx) => (
                  <span key={idx} className="weak-chip">
                    <span>{item}</span>
                    <button
                      className="chip-remove"
                      onClick={() => handleRemoveWeakPoint(idx)}
                      aria-label={`移除 ${item}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddWeakPoint} className="add-weak-form">
                <input
                  type="text"
                  placeholder="比如：て形变形"
                  value={newWeakPoint}
                  onChange={(e) => setNewWeakPoint(e.target.value)}
                  className="add-weak-input"
                  aria-label="添加想重点攻克的内容"
                />
                <button type="submit" className="add-weak-btn">
                  添加
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
