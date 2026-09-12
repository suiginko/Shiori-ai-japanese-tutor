import React, { useRef, useEffect } from 'react';
import {
  ChatMessage,
  FuriganaMode,
  PitchDisplayMode,
  RoleplayScenario,
  StudyMode,
  UserLearningProfile,
} from '../../types';
import { MessageItem } from './MessageItem';

interface ChatContainerProps {
  messages: ChatMessage[];
  sessionTitle?: string;
  furiganaMode: FuriganaMode;
  pitchDisplayMode: PitchDisplayMode;
  ttsRate: number;
  currentMode?: StudyMode;
  scenario?: RoleplayScenario;
  onScenarioChange?: (scenario: RoleplayScenario) => void;
  isLoading: boolean;
  generatingMessageId?: string | null;
  profile: UserLearningProfile;
  aiTutorName?: string;
  userName?: string;
  aiAvatar?: string;
  userAvatar?: string;
  onNewSession?: () => void;
  onOpenHistory?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onResendMessage?: (messageId: string) => void;
  /** 点击消息旁的「已收录语法」提示，直接打开学情档案的句型语法页并定位 */
  onOpenCollectedGrammar?: (targetTitle?: string) => void;
  /** 点击消息旁的「已收录新单词」提示，直接打开学情档案的生词本页并定位 */
  onOpenCollectedWords?: (targetWord?: string) => void;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  sessionTitle,
  furiganaMode,
  pitchDisplayMode,
  ttsRate,
  currentMode,
  scenario,
  onScenarioChange,
  isLoading,
  generatingMessageId,
  aiTutorName = 'AI 私教',
  userName = '学习者',
  aiAvatar,
  userAvatar,
  onNewSession,
  onOpenHistory,
  onEditMessage,
  onResendMessage,
  onOpenCollectedGrammar,
  onOpenCollectedWords,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="chat-container-main" ref={scrollRef}>

      {/* Messages list */}
      <div className="messages-list">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            furiganaMode={furiganaMode}
            pitchDisplayMode={pitchDisplayMode}
            ttsRate={ttsRate}
            aiTutorName={aiTutorName}
            userName={userName}
            aiAvatar={aiAvatar}
            userAvatar={userAvatar}
            onEditMessage={onEditMessage}
            onResendMessage={onResendMessage}
            onOpenCollectedGrammar={onOpenCollectedGrammar}
            onOpenCollectedWords={onOpenCollectedWords}
            isGenerating={message.id === generatingMessageId}
          />
        ))}
      </div>
    </div>
  );
};
