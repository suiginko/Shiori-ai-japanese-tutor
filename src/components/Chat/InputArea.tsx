import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, MessageSquarePlus, History } from 'lucide-react';
import { RoleplayScenario, StudyMode } from '../../types';

interface InputAreaProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  onNewSession: () => void;
  onOpenHistory?: () => void;
  scenario?: RoleplayScenario;
  mode: StudyMode;
}

export const InputArea: React.FC<InputAreaProps> = ({
  onSendMessage,
  isLoading,
  onStop,
  onNewSession,
  onOpenHistory,
  scenario,
  mode,
}) => {
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputText]);

  const handleSend = () => {
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 手机端（屏幕宽度 <= 768px 或移动触摸设备）：Enter 键为正常换行，点击发送按钮发送（手机键盘无 Shift 键）
    const isMobile =
      typeof window !== 'undefined' &&
      (window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024));
    if (isMobile) {
      if (e.key === 'Enter') {
        return;
      }
    }

    // 电脑端：Enter 直接发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPhrase = (phraseJp: string) => {
    const clean = phraseJp.replace(/\[.*?\]/g, '');
    setInputText((prev) => (prev ? `${prev} ${clean}` : clean));
    textareaRef.current?.focus();
  };

  return (
    <div className="chat-input-container">
      {/* Quick helper phrase chips for Scenario mode */}
      {mode === 'roleplay' && scenario && scenario.usefulPhrases.length > 0 && (
        <div className="quick-phrases-bar">
          <span className="quick-label">常用表达锦囊：</span>
          <div className="quick-chips-scroll">
            {scenario.usefulPhrases.map((phrase, idx) => (
              <button
                key={idx}
                className="phrase-chip-btn"
                onClick={() => handleQuickPhrase(phrase.jp)}
                title={`读音: ${phrase.kana} | 中文: ${phrase.cn}`}
              >
                <span>{phrase.jp.replace(/\[.*?\]/g, '')}</span>
                <span className="chip-cn">({phrase.cn})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main input box */}
      <div className="input-box-wrapper">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="chat-textarea"
          rows={1}
          disabled={isLoading}
        />

        <div className="input-actions-bar">
          <div className="action-helpers-left">
            <button
              type="button"
              className="helper-action-btn"
              onClick={onNewSession}
              disabled={isLoading}
              title="保存当前对话并开启全新的对话"
            >
              <MessageSquarePlus size={14} />
              <span className="helper-label-full">开启新对话</span>
              <span className="helper-label-short">新对话</span>
            </button>
            {onOpenHistory && (
              <button
                type="button"
                className="helper-action-btn btn-history-quick"
                onClick={onOpenHistory}
                disabled={isLoading}
                title="查看所有历史对话记录"
              >
                <History size={14} />
                <span className="helper-label-full">历史记录</span>
                <span className="helper-label-short">历史</span>
              </button>
            )}
          </div>

          <div className="action-send-right">
            {isLoading ? (
              <button
                type="button"
                className="send-action-btn btn-stop"
                onClick={onStop}
                title="停止生成"
              >
                <Square size={16} />
                <span>停止</span>
              </button>
            ) : (
              <button
                type="button"
                className={`send-action-btn btn-send ${!inputText.trim() ? 'btn-disabled' : ''}`}
                onClick={handleSend}
                disabled={!inputText.trim()}
              >
                <Send size={15} />
                <span>发送</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
