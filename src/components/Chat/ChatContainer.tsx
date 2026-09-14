import React, { useRef, useEffect, useLayoutEffect } from 'react';
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
  sessionId?: string;
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
  sessionId,
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
  const prevSessionIdRef = useRef<string | undefined>(sessionId);
  const prevMessagesLengthRef = useRef<number>(messages.length);
  const isInitialMountRef = useRef<boolean>(true);
  const aiAlignLockedIdRef = useRef<string | null>(null);
  const userScrolledUpRef = useRef<boolean>(false);

  // 监听用户主动滚动：若用户主动向上回看历史，暂停自动下拽；回到接近底部时恢复自动跟随
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distFromBottom = scrollHeight - clientHeight - scrollTop;

    if (distFromBottom > 90) {
      userScrolledUpRef.current = true;
    } else if (distFromBottom < 30) {
      userScrolledUpRef.current = false;
    }
  };

  // 1. 初次进入页面、刷新页面、或选择/切换历史对话时：
  // 在 DOM 变更后但在浏览器首帧 Paint 之前执行瞬时定位到底部，
  // 杜绝“先显示顶部再平滑滚动到底部”的视觉问题，直接无感从底部呈现。
  useLayoutEffect(() => {
    const isSessionSwitched = sessionId !== prevSessionIdRef.current;
    if (isInitialMountRef.current || isSessionSwitched) {
      isInitialMountRef.current = false;
      prevSessionIdRef.current = sessionId;
      prevMessagesLengthRef.current = messages.length;
      aiAlignLockedIdRef.current = null;
      userScrolledUpRef.current = false;

      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }

      // 下一帧双重校准（防止富文本或特定移动端布局异步重排产生的微小高度差异）
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [sessionId, messages]);

  // 2. 正常对话交互期间的智能滚动管理（自然流畅，彻底杜绝出字抽搐与高频打断）：
  // - 用户发消息：解除锁定，平滑滚动到底部
  // - AI流式出字中：短气泡通过直观视口贴底（无频繁 smooth 动画打断碰撞）；长气泡单次首行锁顶，后续稳定阅读不抖动
  useEffect(() => {
    // 若当前是初次挂载或会话切换，已由 useLayoutEffect 瞬时到底部接管
    if (sessionId !== prevSessionIdRef.current) {
      return;
    }

    if (!scrollRef.current || messages.length === 0) {
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    const container = scrollRef.current;
    const lastMsg = messages[messages.length - 1];
    prevMessagesLengthRef.current = messages.length;

    // A. 用户发送消息：平滑滚动到底部
    if (lastMsg.role === 'user') {
      aiAlignLockedIdRef.current = null;
      userScrolledUpRef.current = false;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      return;
    }

    // B. AI 回复消息（或流式输出中）
    if (lastMsg.role === 'assistant') {
      const bubbleEl = container.querySelector(`[data-message-id="${lastMsg.id}"]`) as HTMLElement | null;
      if (!bubbleEl) {
        requestAnimationFrame(() => {
          if (!scrollRef.current) return;
          const retryEl = scrollRef.current.querySelector(`[data-message-id="${lastMsg.id}"]`) as HTMLElement | null;
          if (retryEl) {
            handleAiBubbleScroll(scrollRef.current, retryEl, lastMsg.id);
          } else if (!userScrolledUpRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        });
        return;
      }

      handleAiBubbleScroll(container, bubbleEl, lastMsg.id);
    }
  }, [messages, sessionId, generatingMessageId]);

  /**
   * 自然流畅的 AI 气泡智能滚动定位（彻底消除流式高频冲突与抽搐）
   */
  const handleAiBubbleScroll = (container: HTMLDivElement, bubbleEl: HTMLElement, messageId: string) => {
    // 若用户正在主动向上翻阅历史消息，不强行夺取用户视线
    if (userScrolledUpRef.current) return;

    const bubbleTop = bubbleEl.offsetTop;
    const bubbleHeight = bubbleEl.offsetHeight;
    const containerHeight = container.clientHeight;
    const totalScrollHeight = container.scrollHeight;
    const isStreaming = generatingMessageId === messageId;

    // 计算若滚动到底部时，该气泡顶部相对视口顶部的相对距离
    const topIfScrolledToBottom = bubbleTop - (totalScrollHeight - containerHeight);

    // 判定气泡是否“过高”：
    // 1) 若完全滚到底部会导致第一行被顶出视口上方（topIfScrolledToBottom < 14）
    // 2) 或者该气泡高度已占据视口高度的 48% 以上（长文回复）
    const isTooTall = topIfScrolledToBottom < 14 || bubbleHeight > containerHeight * 0.48;

    if (isTooTall) {
      // 目标位置：将该气泡首行对齐在对话可视区顶部（预留 14px 舒适边距）
      const targetTop = Math.max(0, bubbleTop - 14);

      if (aiAlignLockedIdRef.current !== messageId) {
        // 初次触达过高阈值：单次平滑滚动对齐到首行
        aiAlignLockedIdRef.current = messageId;
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        // 已经锁定该 AI 消息：出字期间首行保持绝对静止，文字在下方自如延伸，绝不调用重启动画引起抽搐
        // 仅在因排版重排出现较大漂移时无感校准
        if (Math.abs(container.scrollTop - targetTop) > 35) {
          container.scrollTop = targetTop;
        }
      }
    } else {
      // 气泡适中：随出字紧贴最新文字底部展现
      if (aiAlignLockedIdRef.current !== messageId) {
        if (isStreaming) {
          // 流式生成中：直接通过即时赋值跟随高度增长，避免 30ms 重复触发 smooth 动画带来的剧烈振颤
          container.scrollTop = totalScrollHeight - containerHeight;
        } else {
          // 消息已生成完毕：单次平滑缓动到底部
          container.scrollTo({ top: totalScrollHeight, behavior: 'smooth' });
        }
      }
    }
  };

  // 3. 手机呼出虚拟键盘与输入框抬升时的视口联动：
  // 当软键盘弹起使视口收缩时，立即（即时变位置，无多段长动画拖沓与闪烁）将对话区域定位到底部最新内容
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let prevHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

    const scrollToBottomInstant = () => {
      userScrolledUpRef.current = false;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      // 在下一帧微任务中校准一次，确保键盘完全弹起后的当前视口高度无缝贴底
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    };

    const handleViewportResize = () => {
      const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      // 视口高度明显收缩（键盘弹起抬升）
      if (prevHeight - currentHeight > 80) {
        scrollToBottomInstant();
      }
      prevHeight = currentHeight;
    };

    // 监听输入框获得焦点，即时变位置
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.chat-input-container')) {
        scrollToBottomInstant();
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewportResize);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  return (
    <div className="chat-container-main" ref={scrollRef} onScroll={handleScroll}>
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

