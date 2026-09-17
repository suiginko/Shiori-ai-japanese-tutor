import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from './state/useAppStore';
import { Header } from './components/Header';
import { ChatContainer } from './components/Chat/ChatContainer';
import { InputArea } from './components/Chat/InputArea';
import { ChatHistoryDrawer } from './components/Chat/ChatHistoryDrawer';
import { LearningPlanModal } from './components/TutorPlan/LearningPlanModal';
import { KanaModal } from './components/Reference/KanaModal';
import { KnowledgeReviewModal } from './components/Reference/KnowledgeReviewModal';
import { SettingsModal } from './components/Settings/SettingsModal';
import { DictionaryProvider } from './context/DictionaryContext';
import { sendChatMessageStream } from './services/llmService';
import { buildLessonPrepBrief } from './services/tokenOptimizer';
import { continueSeedFor } from './services/curriculumPlanner';
import { ChatMessage, Lesson, LessonStep, RoleplayScenario, StudyMode } from './types';
import { sanitizeActionDescriptions } from './utils/languageDetector';
import { stripSystemBlocks, parseLessonBlock } from './utils/rubyParser';
import { countCompletedTurns } from './utils/subtitleHelper';
import { syncNameRubyFromSettings } from './utils/nameRubyHelper';
import { setupStatusBar } from './utils/statusBarHelper';
import { initBackButtonManager, useBackButton } from './utils/backButtonManager';

export function App() {
  const {
    profile,
    setProfile,
    plan,
    setPlan,
    toggleTaskCompleted,
    // 课表 / 课时（Lesson）
    progress,
    axes,
    planNextCourseLesson,
    applyLessonMaterial,
    failLessonMaterial,
    attachLessonSession,
    completeLessonStepManually,
    startLessonStep,
    setActiveLesson,
    removeLesson,
    resetCourse,
    findScenarioById,
    sessions,
    currentSessionId,
    createNewSession,
    switchSession,
    deleteSession,
    renameSession,
    updateSessionTitleAndSubtitle,
    generateSessionSubtitle,
    clearAllSessions,
    messages,
    setMessages,
    addMessage,
    updateMessage,
    ingestKnowledgeAndTokens,
    settings,
    setSettings,
    currentMode,
    setCurrentMode,
    currentScenario,
    setCurrentScenario,
    planModalOpen,
    setPlanModalOpen,
    kanaModalOpen,
    setKanaModalOpen,
    settingsModalOpen,
    setSettingsModalOpen,
    historyDrawerOpen,
    setHistoryDrawerOpen,
    learnedWords,
    learnedGrammar,
    addLearnedWord,
    removeLearnedWord,
    removeLearnedGrammar,
    updateWordMastery,
    updateGrammarMastery,
    recordReviewResult,
    favoriteExpressions,
    addFavoriteExpression,
    removeFavoriteExpression,
    knowledgeModalOpen,
    setKnowledgeModalOpen,
    knowledgeModalTab,
    setKnowledgeModalTab,
    personaPresets,
    savePersonaPreset,
    applyPersonaPreset,
    deletePersonaPreset,
    exportPersonaPresets,
    importPersonaPresets,
    // 多套 API 连接配置档案
    apiProfiles,
    saveApiProfile,
    applyApiProfile,
    deleteApiProfile,
    renameApiProfile,
    // Backup & Sync
    exportAllData,
    inspectBackupData,
    importAllData,
    resetAllData,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [generatingMessageId, setGeneratingMessageId] = useState<string | null>(null);
  const [knowledgeHighlightTarget, setKnowledgeHighlightTarget] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 全局快捷键: Ctrl + Alt + D (或 macOS Cmd + Option + D) 呼出独立开发者实时调试窗口
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
        e.preventDefault();
        const debugUrl = `${window.location.origin}${window.location.pathname}#/debug`;
        const debugWin = window.open(
          debugUrl,
          'ShioriDebugInspectorWindow',
          'width=1280,height=880,menubar=no,toolbar=no,location=no,status=no'
        );
        if (debugWin) {
          debugWin.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 初始化手机返回键与手势返回管理器（包含双击返回退出提示）
  useEffect(() => {
    return initBackButtonManager();
  }, []);

  // 注册全屏模态框与历史抽屉的返回事件监听（按优先级自动依序出栈）
  useBackButton('settings-modal', settingsModalOpen, () => setSettingsModalOpen(false), 50);
  useBackButton('knowledge-modal', knowledgeModalOpen, () => {
    setKnowledgeModalOpen(false);
    setKnowledgeHighlightTarget(null);
  }, 50);
  useBackButton('history-drawer', historyDrawerOpen, () => setHistoryDrawerOpen(false), 50);
  useBackButton('plan-modal', planModalOpen, () => setPlanModalOpen(false), 50);
  useBackButton('kana-modal', kanaModalOpen, () => setKanaModalOpen(false), 50);

  // 自动监听系统深浅色偏好与模式切换
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // 动态同步移动端软键盘/可视视口真实高度（VisualViewport Height）
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisualViewport = () => {
      const vv = window.visualViewport;
      const vh = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-viewport-height', `${vh}px`);
      // 键盘唤起或视口变化时锁定 window 偏移，防止页面外层被拉升产生闪烁与白边
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
      const isKeyboardOpen = window.innerHeight - vh > 120;
      document.documentElement.setAttribute('data-keyboard-open', isKeyboardOpen ? 'true' : 'false');
    };

    handleVisualViewport();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewport);
      window.visualViewport.addEventListener('scroll', handleVisualViewport);
    } else {
      window.addEventListener('resize', handleVisualViewport);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewport);
        window.visualViewport.removeEventListener('scroll', handleVisualViewport);
      } else {
        window.removeEventListener('resize', handleVisualViewport);
      }
    };
  }, []);

  const effectiveThemeMode = settings.themeMode || 'system';
  const isDarkMode =
    effectiveThemeMode === 'dark' || (effectiveThemeMode === 'system' && systemPrefersDark);

  // 同步系统主题色及深浅模式至 html、body，并联动手机顶部沉浸式状态栏
  useEffect(() => {
    const theme = settings.themeColor || 'sakura';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);

    const modeStr = isDarkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme-mode', modeStr);
    document.body.setAttribute('data-theme-mode', modeStr);

    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
      document.body.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
      document.body.classList.remove('dark-mode');
    }

    // 原生手机沉浸式状态栏自适应（白字/黑字、透明顶栏）及浏览器 theme-color 同步
    setupStatusBar(isDarkMode);
  }, [settings.themeColor, isDarkMode]);

  // 同步全局字体配置至 html 与 body，使全站所有组件及 React Portal 浮层（词典弹窗、查词工具栏等）统一受控
  useEffect(() => {
    const fontFamily = settings.fontFamily || 'noto-sans';
    document.documentElement.setAttribute('data-font-family', fontFamily);
    document.body.setAttribute('data-font-family', fontFamily);

    const customFont = settings.customFontFamily?.trim();
    if (customFont) {
      document.documentElement.style.setProperty('--font-custom', customFont);
      document.body.style.setProperty('--font-custom', customFont);
    } else {
      document.documentElement.style.removeProperty('--font-custom');
      document.body.style.removeProperty('--font-custom');
    }
  }, [settings.fontFamily, settings.customFontFamily]);

  // 同步用户在双方名字或人设中指定的注音至全局注音解析引擎（影响对话中提到名字时的注音）
  useEffect(() => {
    syncNameRubyFromSettings(settings);
  }, [settings.aiTutorName, settings.userName, settings.aiPersona]);

  // 统一的 LLM 智能教学会话流式发送器：直接将生成的 AI 内容原地流式写入指定的 AI 消息
  //
  // options 的 `sessionId` / `mode` / `scenario` 是覆盖项：供"刚创建会话就要立刻开课"的场景使用——
  // React state 还没提交，闭包里的 currentSessionId / currentMode / currentScenario 全是旧值。
  //
  // 注意：备课不走这里（它不落气泡、不进学情），见 handlePrepareLesson。
  const executeStreamChat = (
    contextHistory: ChatMessage[],
    targetAiMsgId: string,
    options?: { sessionId?: string; mode?: StudyMode; scenario?: RoleplayScenario }
  ) => {
    setIsLoading(true);
    setGeneratingMessageId(targetAiMsgId);

    const effSessionId = options?.sessionId || currentSessionId;
    const effMode: StudyMode = options?.mode || currentMode;
    const effScenario: RoleplayScenario | undefined =
      options?.scenario ?? (effMode === 'roleplay' ? currentScenario : undefined);

    /** 本条 AI 消息的所有补丁都写在目标会话里，而不是"当前"会话 */
    const patchMessage = (updater: Partial<ChatMessage> | ((prev: ChatMessage) => ChatMessage)) =>
      updateMessage(targetAiMsgId, updater, effSessionId);

    // 深度思考计时与容量控制
    // 思考内容可能长达数千字（推理模型尤其如此），落盘前必须截断，
    // 否则会话历史会迅速膨胀，localStorage 与后续渲染都会被拖垮。
    const MAX_REASONING_CHARS = 6000;
    let reasoningStartedAt = 0;
    let reasoningDurationMs = 0;

    sendChatMessageStream(
      contextHistory,
      effMode,
      profile,
      settings,
      effScenario,
      {
        onControllerReady: (controller) => {
          abortControllerRef.current = controller;
        },
        onReasoning: (delta) => {
          if (!reasoningStartedAt) reasoningStartedAt = Date.now();
          patchMessage((prev) => ({
            ...prev,
            reasoning: ((prev.reasoning || '') + delta).slice(0, MAX_REASONING_CHARS),
          }));
        },
        onChunk: (delta) => {
          // 首个正文增量到达即视为"思考结束"，锁存思考耗时供界面展示
          if (reasoningStartedAt && !reasoningDurationMs) {
            reasoningDurationMs = Date.now() - reasoningStartedAt;
          }
          patchMessage((prev) => ({
            ...prev,
            content: (prev.content || '') + delta,
          }));
        },
        onDone: (fullText, tokens) => {
          const sanitizedText = sanitizeActionDescriptions(fullText);
          const msgTokens = {
            prompt: tokens.prompt,
            completion: tokens.completion,
            total: tokens.total,
            estimated: tokens.estimated,
          };
          // 【关键顺序】先做学情入库拿到本轮收录的语法点，再一次性原位更新消息，
          // 这样气泡旁的"已收录语法"提示与内容、token 统计同帧出现，不会二次闪动。
          const ingested = ingestKnowledgeAndTokens({
            id: targetAiMsgId,
            role: 'assistant',
            content: sanitizedText,
            timestamp: Date.now(),
            mode: effMode,
            scenarioId: effMode === 'roleplay' ? effScenario?.id : undefined,
            tokens: msgTokens,
          });
          patchMessage((prev) => {
            // 思考内容只做展示，不能带系统块标记泄漏到界面；空串一律归一为 undefined
            const cleanedReasoning = prev.reasoning
              ? stripSystemBlocks(prev.reasoning).trim().slice(0, MAX_REASONING_CHARS)
              : '';
            return {
              ...prev,
              content: sanitizedText,
              tokens: msgTokens,
              reasoning: cleanedReasoning || undefined,
              reasoningMs:
                reasoningDurationMs ||
                (cleanedReasoning ? Math.max(0, Date.now() - (reasoningStartedAt || Date.now())) : undefined),
              collectedGrammar: ingested.grammars.length ? ingested.grammars : undefined,
              collectedWords: ingested.words.length ? ingested.words : undefined,
            };
          });
          setIsLoading(false);
          setGeneratingMessageId(null);

          // 达成指定轮次（默认第5轮）后自动提取3个话题关键词作为副标题
          const autoRound = typeof settings.subtitleAutoRound === 'number' ? settings.subtitleAutoRound : 5;
          if (autoRound > 0) {
            const currentSess = sessions.find((s) => s.id === effSessionId);
            if (currentSess && !currentSess.subtitle) {
              const fullHistoryForRoundCount = currentSess.messages.map((m) =>
                m.id === targetAiMsgId ? { ...m, content: sanitizedText } : m
              );
              const completedTurns = countCompletedTurns(fullHistoryForRoundCount);
              if (completedTurns >= autoRound) {
                generateSessionSubtitle(effSessionId);
              }
            }
          }
        },
        onError: (err) => {
          console.error('LLM Error:', err);
          if (err.name === 'AbortError') {
            // 用户主动停止：保留已生成内容，仅追加停止标记
            patchMessage((prev) => {
              const content = prev.content || '';
              const stopped = content.trim()
                ? `${content.replace(/\s+$/, '')}\n\n（已停止生成）`
                : '（已停止生成）';
              return { ...prev, content: stopped };
            });
            setIsLoading(false);
            setGeneratingMessageId(null);
            return;
          }
          patchMessage((prev) => {
            const rawErr = err?.message || String(err);
            const content = rawErr.startsWith('【连接提示】')
              ? rawErr
              : `【连接提示】请求遇到问题：${rawErr}。\n请点击右上角「设置」检查 API Key 与 Base URL，排查网络连接后重试。`;
            return {
              ...prev,
              content,
            };
          });
          setIsLoading(false);
          setGeneratingMessageId(null);
        },
      },
      { words: learnedWords, grammar: learnedGrammar },
      sessions,
      currentSessionId
    );
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      mode: currentMode,
      scenarioId: currentMode === 'roleplay' ? currentScenario.id : undefined,
    };

    const targetAiMsgId = `msg-ai-${Date.now() + 1}`;
    const aiPlaceholder: ChatMessage = {
      id: targetAiMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      mode: currentMode,
      scenarioId: currentMode === 'roleplay' ? currentScenario.id : undefined,
    };

    // 原位直接追加本次交互的一对对话，无需底部虚空临时气泡
    setMessages((prev) => [...prev, userMessage, aiPlaceholder]);
    const contextHistory = [...messages, userMessage];
    executeStreamChat(contextHistory, targetAiMsgId);
  };

  // 重发选中的那条用户对话：原地保持该对话内容，就地重新生成对应的 AI 回复（绝不在末尾多发送一条对话）
  const handleResendMessage = async (messageId: string) => {
    if (isLoading) return;
    const targetIdx = messages.findIndex((m) => m.id === messageId);
    if (targetIdx === -1) return;

    let targetAiMsgId = '';
    let newHistory: ChatMessage[] = [];

    // 检查紧随其后的下一条消息是否为对应的 AI 回复
    if (messages[targetIdx + 1]?.role === 'assistant') {
      targetAiMsgId = messages[targetIdx + 1].id;
      const resetAiMsg: ChatMessage = {
        ...messages[targetIdx + 1],
        content: '',
        tokens: undefined,
        timestamp: Date.now(),
      };
      // 就地保留截至该条 AI 回复（清空原回复内容就地重新生成），截断后续对话
      newHistory = [...messages.slice(0, targetIdx + 1), resetAiMsg];
    } else {
      targetAiMsgId = `msg-ai-${Date.now() + 1}`;
      const newAiMsg: ChatMessage = {
        id: targetAiMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        mode: currentMode,
      };
      newHistory = [...messages.slice(0, targetIdx + 1), newAiMsg];
    }

    setMessages(newHistory);
    const contextHistory = messages.slice(0, targetIdx + 1);
    executeStreamChat(contextHistory, targetAiMsgId);
  };

  // 编辑选中的那条用户对话：直接就地改变该对话内容，并就地让 AI 重新回复（绝不在末尾多发送一条对话）
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!newContent.trim() || isLoading) return;
    const targetIdx = messages.findIndex((m) => m.id === messageId);
    if (targetIdx === -1) return;

    // 1. 直接改变选中的那条对话内容
    const updatedUserMsg: ChatMessage = {
      ...messages[targetIdx],
      content: newContent.trim(),
      timestamp: Date.now(),
    };

    let targetAiMsgId = '';
    let newHistory: ChatMessage[] = [];

    // 2. 就地更新紧随其后的 AI 回复
    if (messages[targetIdx + 1]?.role === 'assistant') {
      targetAiMsgId = messages[targetIdx + 1].id;
      const resetAiMsg: ChatMessage = {
        ...messages[targetIdx + 1],
        content: '',
        tokens: undefined,
        timestamp: Date.now() + 1,
      };
      newHistory = [...messages.slice(0, targetIdx), updatedUserMsg, resetAiMsg];
    } else {
      targetAiMsgId = `msg-ai-${Date.now() + 1}`;
      const newAiMsg: ChatMessage = {
        id: targetAiMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() + 1,
        mode: currentMode,
      };
      newHistory = [...messages.slice(0, targetIdx), updatedUserMsg, newAiMsg];
    }

    setMessages(newHistory);
    const contextHistory = [...messages.slice(0, targetIdx), updatedUserMsg];
    executeStreamChat(contextHistory, targetAiMsgId);
  };

  // 稳定化传给子组件的回调：配合 MessageItem 的 React.memo，避免流式期间无关消息重渲染
  const editMessageRef = useRef(handleEditMessage);
  editMessageRef.current = handleEditMessage;
  const stableEditMessage = useCallback(
    (messageId: string, newContent: string) => editMessageRef.current(messageId, newContent),
    []
  );

  const resendMessageRef = useRef(handleResendMessage);
  resendMessageRef.current = handleResendMessage;
  const stableResendMessage = useCallback(
    (messageId: string) => resendMessageRef.current(messageId),
    []
  );

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setGeneratingMessageId(null);
  };

  const handleScenarioChange = (scenario: RoleplayScenario) => {
    setCurrentScenario(scenario);
    addMessage({
      id: `msg-scenario-${scenario.id}-${Date.now()}`,
      role: 'assistant',
      content: `【已切换情景：${scenario.title}】\n${scenario.initialMessage}`,
      timestamp: Date.now(),
      mode: 'roleplay',
      scenarioId: scenario.id,
    });
  };

  // ————————————————————————————————————————————————————————————
  // 课表 / 课时（Lesson）
  // ————————————————————————————————————————————————————————————

  /**
   * 开始下一课：A 段本地排课（零 token、确定性）→ B 段让老师备课生成教材。
   *
   * 两段都不动学生的对话框：A 段只写课表，B 段只往课时里填教材，界面上的反馈是
   * 课时卡片上的「备课中… → 教材已就绪」。学生想上课，得自己点某一步。
   */
  const handleStartNextLesson = (focus?: Lesson['focus']) => {
    const lesson = planNextCourseLesson(focus ? { focus } : undefined);
    handlePrepareLesson(lesson);
    return lesson;
  };

  /**
   * 备课（或重备）：教材生成失败、或想换一版教材时重跑。
   *
   * 【备课是老师的幕后工作，不进学生的对话框】——上一版把备课结果流式写进了上课会话，
   * 结果一心三用：① 备课文稿本身就在"开课"，学生随后点「热身唤醒」又听一遍同样的开场；
   * ② 备课文稿会走知识采集，把本课新词提前收进生词本，于是"新词已入本"这个采证通道
   * 在真正讲课之前就亮了，词汇步骤白送一个完成；③ 会话里凭空多出两条助手发言，
   * 实战演练的"说了几个来回"被凑够。所以这里改用裸流式调用：只要教材，不留痕迹。
   */
  const handlePrepareLesson = (lesson: Lesson) => {
    const brief = buildLessonPrepBrief({
      lesson,
      profile,
      settings,
      learnedWordCount: learnedWords.length,
      learnedGrammarCount: learnedGrammar.length,
    });

    setIsLoading(true);
    setGeneratingMessageId(null);

    // 备课指令与产出都不落气泡：学生看到的是「老师正在备课…」，看不到任务书和草稿。
    // 本轮强制 tutor 模式——roleplay 模式的系统提示会要求"从第一条起就完全入戏"，
    // 那是在上课，不是在备课。
    sendChatMessageStream(
      [{ id: `prep-brief-${lesson.id}`, role: 'user', content: brief, timestamp: Date.now(), mode: 'tutor' }],
      'tutor',
      profile,
      settings,
      undefined,
      {
        onControllerReady: (controller) => {
          abortControllerRef.current = controller;
        },
        // 备课不展示过程，增量直接丢弃；只留 onDone 的完整文本做解析
        onChunk: () => {},
        onDone: (fullText) => {
          const payload = parseLessonBlock(fullText);
          if (payload) {
            applyLessonMaterial(lesson.id, payload);
          } else if (!settings.apiKey?.trim()) {
            // 备课不再落气泡，离线兜底文案也就看不到了，这里必须把"去配 Key"说清楚
            failLessonMaterial(lesson.id, '还没配置 API Key：点右上角「设置」填好后即可备课');
          } else {
            // 失败原因会直接渲染在课时卡片上，所以写学生看得懂的话
            failLessonMaterial(lesson.id, '老师这次没能给出教材，可以点「重新备课」再试一次');
          }
          setIsLoading(false);
          setGeneratingMessageId(null);
        },
        onError: (err) => {
          failLessonMaterial(
            lesson.id,
            err?.name === 'AbortError'
              ? '备课中断了，可以点「重新备课」再试一次'
              : '备课没能完成，检查网络后可以点「重新备课」再试一次'
          );
          setIsLoading(false);
          setGeneratingMessageId(null);
        },
      },
      { words: learnedWords, grammar: learnedGrammar },
      sessions,
      currentSessionId
    );
  };

  /**
   * 执行课时里的某一步。
   *
   * 这是与旧「打勾清单」最本质的差别：每一步都必须能真的点开并产生教学行为。
   * 旧的 `DailyTask` 只有一个没有任何代码消费的 `target` 字符串，点击只做 toggle + 放彩带。
   */
  const handleExecuteLessonStep = (lesson: Lesson, step: LessonStep) => {
    const action = step.action;

    // 闪卡 / 复习：交给学情档案弹窗，作答结果由 recordReviewResult 采证
    if (action.type === 'review' || action.type === 'flashcard') {
      setKnowledgeModalTab(action.type === 'flashcard' ? 'vocab' : action.tab || 'vocab');
      setKnowledgeModalOpen(true);
      return;
    }

    const scenario = action.scenarioId ? findScenarioById(action.scenarioId) : undefined;

    // 同一课的多步共享一个会话，上下文才连贯
    let sessionId = lesson.sessionId;
    const sessionExists = !!sessionId && sessions.some((s) => s.id === sessionId);
    if (!sessionExists) {
      // quiet：上课会话不做情景预演。第一句台词该由实战演练那一步说出来，
      // 而不是由会话开场消息替老师先念掉（否则模型会顺着这条"被截断的情景提示"续写，
      // 把同一段开场白再写一遍）。
      const created = createNewSession(scenario ? 'roleplay' : action.mode, scenario, lesson.title, {
        quiet: true,
      });
      sessionId = created.id;
    } else {
      switchSession(sessionId!);
    }
    // switchSession 会按会话记录回填模式与情景，所以放在覆盖之前
    setCurrentMode(action.mode);
    if (scenario) setCurrentScenario(scenario);
    attachLessonSession(lesson.id, sessionId!);

    const priorMessages = sessionExists
      ? (sessions.find((s) => s.id === sessionId)?.messages || []).filter((m) => m.content.trim().length > 0)
      : [];

    const targetAiMsgId = `msg-lesson-step-${step.id}-${Date.now()}`;
    addMessage(
      {
        id: targetAiMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        mode: action.mode,
        scenarioId: scenario?.id,
        lessonId: lesson.id,
      },
      sessionId!
    );

    // 同一步第二次起改发"接着上"的指令：重发开课指令会让老师把整节课重头讲一遍
    const seed = step.startedAt ? continueSeedFor(step) : action.seedPrompt;
    startLessonStep(lesson.id, step.id);

    // 步骤指令同样不落气泡：老师直接开讲，学生看到的是"上课"而不是"我给老师下的指令"
    executeStreamChat(
      [...priorMessages, { id: `seed-${step.id}`, role: 'user', content: seed, timestamp: Date.now(), mode: action.mode }],
      targetAiMsgId,
      { sessionId: sessionId!, mode: action.mode, scenario }
    );

    // 上完课要能立刻看到老师讲了什么——留在课表里学生只会以为"点了没反应"，
    // 于是再点一次同一步骤（重复触发的一个真实来源）。
    setPlanModalOpen(false);
  };

  /** 学生自评完成某一步（只对热身 / 收束这类没有自动采证通道的步骤开放） */
  const handleMarkLessonStepDone = (lessonId: string, stepId: string) => {
    completeLessonStepManually(lessonId, stepId);
  };

  /** 删除一课；`resetCourse` 清空整张课表（生词本与学情档案不受影响） */
  const handleRemoveLesson = (lessonId: string) => removeLesson(lessonId);

  // Dynamic Ruby style calculation (custom font ratio & color)
  const rubyColorValue = (() => {
    const choice = settings.rubyColor || 'theme';
    if (choice === 'theme') {
      return 'var(--primary)';
    }
    if (choice === 'custom') {
      return settings.rubyCustomColor || 'var(--primary)';
    }
    const colorMap: Record<string, string> = {
      slate: '#475569',
      crimson: '#e11d48',
      indigo: '#4f46e5',
      emerald: '#059669',
      violet: '#7c3aed',
      amber: '#d97706',
    };
    return colorMap[choice] || 'var(--primary)';
  })();

  const rubySizeRatio = (() => {
    if (settings.rubySize === 'custom' && settings.rubyCustomSize) {
      return `${settings.rubyCustomSize}%`;
    }
    const ratioMap: Record<string, string> = {
      xs: '48%',
      small: '54%',
      default: '62%',
      large: '72%',
      xl: '84%',
    };
    return ratioMap[settings.rubySize || 'default'] || '62%';
  })();

  const lineHeightValue = (() => {
    switch (settings.lineHeight) {
      case 'tight':
        return 1.4;
      case 'compact':
        return 1.6;
      case 'relaxed':
        return 2.1;
      case 'custom':
        return settings.customLineHeight || 1.6;
      case 'normal':
      default:
        return 1.8;
    }
  })();

  return (
    <div
      className={`app-root-layout app-container theme-${settings.themeColor || 'sakura'} font-${settings.fontFamily || 'noto-sans'} ${isDarkMode ? 'dark-mode' : ''}`}
      data-theme={settings.themeColor || 'sakura'}
      data-theme-mode={isDarkMode ? 'dark' : 'light'}
      data-font-family={settings.fontFamily || 'noto-sans'}
      data-font-size={settings.fontSize || 'md'}
      data-ruby-size={settings.rubySize || 'default'}
      data-bubble-density={settings.bubbleDensity || 'normal'}
      style={
        {
          '--ruby-color': rubyColorValue,
          '--ruby-font-ratio': rubySizeRatio,
          '--app-line-height': lineHeightValue,
          ...(settings.customFontFamily?.trim()
            ? { '--font-custom': settings.customFontFamily.trim() }
            : {}),
        } as React.CSSProperties
      }
    >
      <DictionaryProvider
        ttsRate={settings.ttsRate}
        learnedWords={learnedWords}
        furiganaHideMastered={settings.furiganaHideMastered !== false}
        externalDictSource={settings.externalDictSource || 'moji'}
        themeColor={settings.themeColor || 'sakura'}
        rubyColor={rubyColorValue}
        onSaveWord={addLearnedWord}
        onRemoveWord={removeLearnedWord}
        favoriteExpressions={favoriteExpressions}
        onSaveExpression={addFavoriteExpression}
        onRemoveExpression={removeFavoriteExpression}
      >
        {/* Header with Navigation & Level Tracker */}
        <Header
          profile={profile}
          furiganaMode={settings.furiganaMode}
          onFuriganaModeChange={(mode) => setSettings({ ...settings, furiganaMode: mode })}
          pitchDisplayMode={settings.pitchDisplayMode}
          onPitchDisplayModeChange={(mode) => setSettings({ ...settings, pitchDisplayMode: mode })}
          onOpenPlan={() => setPlanModalOpen(true)}
          onOpenKana={() => setKanaModalOpen(true)}
          onOpenKnowledge={() => {
            setKnowledgeHighlightTarget(null);
            setKnowledgeModalOpen(true);
          }}
          learnedCount={learnedWords.length + learnedGrammar.length}
          onOpenSettings={() => setSettingsModalOpen(true)}
          onOpenHistory={() => setHistoryDrawerOpen(true)}
          sessionCount={sessions.length}
        />

        {/* Main Interactive Chat Workspace */}
        <main className="app-main-workspace">
          <ChatContainer
            sessionId={currentSessionId}
            messages={messages}
            furiganaMode={settings.furiganaMode}
            pitchDisplayMode={settings.pitchDisplayMode}
            ttsRate={settings.ttsRate ?? 1.0}
            currentMode={currentMode}
            scenario={currentScenario}
            onScenarioChange={handleScenarioChange}
            isLoading={isLoading}
            generatingMessageId={generatingMessageId}
            profile={profile}
            aiTutorName={settings.aiTutorName}
            userName={settings.userName}
            aiAvatar={settings.aiAvatar}
            userAvatar={settings.userAvatar}
            onEditMessage={stableEditMessage}
            onResendMessage={stableResendMessage}
            onOpenCollectedGrammar={(targetTitle) => {
              setKnowledgeModalTab('grammar');
              setKnowledgeHighlightTarget(targetTitle || null);
              setKnowledgeModalOpen(true);
            }}
            onOpenCollectedWords={(targetWord) => {
              setKnowledgeModalTab('vocab');
              setKnowledgeHighlightTarget(targetWord || null);
              setKnowledgeModalOpen(true);
            }}
            deepThinkingEnabled={(settings.deepThinkingMode || 'auto') !== 'off'}
          />

          <InputArea
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            onStop={handleStopStream}
            onNewSession={() => createNewSession()}
            onOpenHistory={() => setHistoryDrawerOpen(true)}
            scenario={currentScenario}
            mode={currentMode}
          />
        </main>

        {/* History Drawer */}
        <ChatHistoryDrawer
          isOpen={historyDrawerOpen}
          onClose={() => setHistoryDrawerOpen(false)}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={switchSession}
          onNewSession={() => createNewSession()}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onUpdateSessionInfo={updateSessionTitleAndSubtitle}
          onRegenerateSubtitle={generateSessionSubtitle}
          settings={settings}
          onClearAllSessions={clearAllSessions}
        />

        {/* Modals */}
        <LearningPlanModal
          isOpen={planModalOpen}
          onClose={() => setPlanModalOpen(false)}
          profile={profile}
          setProfile={setProfile}
          plan={plan}
          progress={progress}
          axes={axes}
          settings={settings}
          isBusy={isLoading}
          onStartNextLesson={handleStartNextLesson}
          onPrepareLesson={handlePrepareLesson}
          onExecuteStep={handleExecuteLessonStep}
          onMarkStepDone={handleMarkLessonStepDone}
          onRemoveLesson={handleRemoveLesson}
          onResetCourse={resetCourse}
        />

        <KanaModal
          isOpen={kanaModalOpen}
          onClose={() => setKanaModalOpen(false)}
        />

        <KnowledgeReviewModal
          isOpen={knowledgeModalOpen}
          onClose={() => {
            setKnowledgeModalOpen(false);
            setKnowledgeHighlightTarget(null);
          }}
          initialTab={knowledgeModalTab}
          highlightTarget={knowledgeHighlightTarget}
          onClearHighlight={() => setKnowledgeHighlightTarget(null)}
          learnedWords={learnedWords}
          learnedGrammar={learnedGrammar}
          favoriteExpressions={favoriteExpressions}
          onRemoveFavorite={removeFavoriteExpression}
          onRemoveWord={removeLearnedWord}
          onRemoveGrammar={removeLearnedGrammar}
          onUpdateWordMastery={updateWordMastery}
          onUpdateGrammarMastery={updateGrammarMastery}
          onRecordReviewResult={recordReviewResult}
          onTriggerAiQuiz={(prompt) => handleSendMessage(prompt)}
          ttsRate={settings.ttsRate}
        />

        <SettingsModal
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          settings={settings}
          onSave={(newSettings) => setSettings(newSettings)}
          personaPresets={personaPresets}
          onSavePreset={savePersonaPreset}
          onApplyPreset={applyPersonaPreset}
          onDeletePreset={deletePersonaPreset}
          onExportPresets={exportPersonaPresets}
          onImportPresets={importPersonaPresets}
          apiProfiles={apiProfiles}
          onSaveApiProfile={saveApiProfile}
          onApplyApiProfile={applyApiProfile}
          onDeleteApiProfile={deleteApiProfile}
          onRenameApiProfile={renameApiProfile}
          learnedWordsCount={learnedWords.length}
          learnedGrammarCount={learnedGrammar.length}
          sessionsCount={sessions.length}
          onExportAllData={exportAllData}
          onInspectBackup={inspectBackupData}
          onImportAllData={importAllData}
          onResetAllData={resetAllData}
        />
      </DictionaryProvider>
    </div>
  );
}

export default App;
