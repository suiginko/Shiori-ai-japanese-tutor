import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from './state/useAppStore';
import { Header } from './components/Header';
import { ChatContainer } from './components/Chat/ChatContainer';
import { InputArea } from './components/Chat/InputArea';
import { ChatHistoryDrawer } from './components/Chat/ChatHistoryDrawer';
import { LearningPlanModal } from './components/TutorPlan/LearningPlanModal';
import { KanaModal } from './components/Reference/KanaModal';
import { GrammarLibraryModal } from './components/Reference/GrammarLibraryModal';
import { KnowledgeReviewModal } from './components/Reference/KnowledgeReviewModal';
import { SettingsModal } from './components/Settings/SettingsModal';
import { DictionaryProvider } from './context/DictionaryContext';
import { sendChatMessageStream } from './services/llmService';
import { ChatMessage, RoleplayScenario } from './types';
import { sanitizeActionDescriptions } from './utils/languageDetector';
import { countCompletedTurns } from './utils/subtitleHelper';
import { syncNameRubyFromSettings } from './utils/nameRubyHelper';

export function App() {
  const {
    profile,
    setProfile,
    plan,
    setPlan,
    toggleTaskCompleted,
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
    currentScenario,
    setCurrentScenario,
    planModalOpen,
    setPlanModalOpen,
    kanaModalOpen,
    setKanaModalOpen,
    grammarModalOpen,
    setGrammarModalOpen,
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

  // 同步系统主题色至 html 及 body，确保 Portal 弹窗（如词典悬浮窗）全面继承主题变量
  useEffect(() => {
    const theme = settings.themeColor || 'sakura';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [settings.themeColor]);

  // 同步用户在双方名字或人设中指定的注音至全局注音解析引擎（影响对话中提到名字时的注音）
  useEffect(() => {
    syncNameRubyFromSettings(settings);
  }, [settings.aiTutorName, settings.userName, settings.aiPersona]);

  // 统一的 LLM 智能教学会话流式发送器：直接将生成的 AI 内容原地流式写入指定的 AI 消息
  const executeStreamChat = (contextHistory: ChatMessage[], targetAiMsgId: string) => {
    setIsLoading(true);
    setGeneratingMessageId(targetAiMsgId);

    sendChatMessageStream(
      contextHistory,
      currentMode,
      profile,
      settings,
      currentMode === 'roleplay' ? currentScenario : undefined,
      {
        onControllerReady: (controller) => {
          abortControllerRef.current = controller;
        },
        onChunk: (delta) => {
          updateMessage(targetAiMsgId, (prev) => ({
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
          // 1. 【关键顺序】先做学情入库拿到本轮收录的语法点，再一次性原位更新消息，
          //    这样气泡旁的"已收录语法"提示与内容、token 统计同帧出现，不会二次闪动。
          const ingested = ingestKnowledgeAndTokens({
            id: targetAiMsgId,
            role: 'assistant',
            content: sanitizedText,
            timestamp: Date.now(),
            mode: currentMode,
            scenarioId: currentMode === 'roleplay' ? currentScenario.id : undefined,
            tokens: msgTokens,
          });
          updateMessage(targetAiMsgId, (prev) => ({
            ...prev,
            content: sanitizedText,
            tokens: msgTokens,
            collectedGrammar: ingested.grammars.length ? ingested.grammars : undefined,
            collectedWords: ingested.words.length ? ingested.words : undefined,
          }));
          setIsLoading(false);
          setGeneratingMessageId(null);

          // 达成指定轮次（默认第5轮）后自动提取3个话题关键词作为副标题
          const autoRound = typeof settings.subtitleAutoRound === 'number' ? settings.subtitleAutoRound : 5;
          if (autoRound > 0) {
            const currentSess = sessions.find((s) => s.id === currentSessionId);
            if (currentSess && !currentSess.subtitle) {
              const fullHistoryForRoundCount = currentSess.messages.map((m) =>
                m.id === targetAiMsgId ? { ...m, content: sanitizedText } : m
              );
              const completedTurns = countCompletedTurns(fullHistoryForRoundCount);
              if (completedTurns >= autoRound) {
                generateSessionSubtitle(currentSessionId);
              }
            }
          }
        },
        onError: (err) => {
          console.error('LLM Error:', err);
          if (err.name === 'AbortError') {
            // 用户主动停止：保留已生成内容，仅追加停止标记
            updateMessage(targetAiMsgId, (prev) => {
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
          updateMessage(targetAiMsgId, (prev) => ({
            ...prev,
            content: `【连接提示】请求遇到问题：${err.message}。\n请点击右上角「设置」检查 API Key 与 Base URL，或者在未填 Key 时体验内置离线演示对话。`,
          }));
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
      className={`app-root-layout app-container theme-${settings.themeColor || 'sakura'} font-${settings.fontFamily || 'noto-sans'}`}
      data-theme={settings.themeColor || 'sakura'}
      data-font-family={settings.fontFamily || 'noto-sans'}
      data-font-size={settings.fontSize || 'md'}
      data-ruby-size={settings.rubySize || 'default'}
      data-bubble-density={settings.bubbleDensity || 'normal'}
      data-pitch-color={settings.pitchLineColor || 'theme'}
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
          onOpenGrammar={() => setGrammarModalOpen(true)}
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
            messages={messages}
            furiganaMode={settings.furiganaMode}
            pitchDisplayMode={settings.pitchDisplayMode}
            ttsRate={settings.ttsRate}
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
          setPlan={setPlan}
          toggleTask={toggleTaskCompleted}
          settings={settings}
          messages={messages}
        />

        <KanaModal
          isOpen={kanaModalOpen}
          onClose={() => setKanaModalOpen(false)}
        />

        <GrammarLibraryModal
          isOpen={grammarModalOpen}
          onClose={() => setGrammarModalOpen(false)}
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
