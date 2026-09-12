import React, { useState } from 'react';
import { ChatSession, ApiSettings } from '../../types';
import {
  History,
  X,
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  Search,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { formatSubtitleWithTopics, cleanHistoryPreviewText } from '../../utils/subtitleHelper';

interface ChatHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onUpdateSessionInfo?: (id: string, newTitle: string, newSubtitle?: string) => void;
  onRegenerateSubtitle?: (id: string, force?: boolean) => Promise<string | null>;
  settings?: ApiSettings;
  onClearAllSessions: () => void;
}

function formatSessionTimeRange(startTime?: number, endTime?: number): string {
  if (!startTime) return '刚刚';
  const start = new Date(startTime);
  const end = new Date(endTime || startTime);

  const startMonth = start.getMonth() + 1;
  const startDate = start.getDate();
  const startHours = start.getHours().toString().padStart(2, '0');
  const startMinutes = start.getMinutes().toString().padStart(2, '0');

  const endMonth = end.getMonth() + 1;
  const endDate = end.getDate();
  const endHours = end.getHours().toString().padStart(2, '0');
  const endMinutes = end.getMinutes().toString().padStart(2, '0');

  // 若无结束时间或时间间隔极短（1分钟内/单条消息）
  if (!endTime || Math.abs(endTime - startTime) < 60 * 1000) {
    return `${startMonth}月${startDate}日 ${startHours}:${startMinutes}`;
  }

  // 同一天内的对话
  if (
    start.getFullYear() === end.getFullYear() &&
    startMonth === endMonth &&
    startDate === endDate
  ) {
    return `${startMonth}月${startDate}日 ${startHours}:${startMinutes} - ${endHours}:${endMinutes}`;
  }

  // 跨日期对话
  if (start.getFullYear() === end.getFullYear()) {
    return `${startMonth}月${startDate}日 ${startHours}:${startMinutes} - ${endMonth}月${endDate}日 ${endHours}:${endMinutes}`;
  }

  // 跨年份对话
  return `${start.getFullYear()}/${startMonth}/${startDate} ${startHours}:${startMinutes} - ${end.getFullYear()}/${endMonth}/${endDate} ${endHours}:${endMinutes}`;
}

function formatSessionDisplayTime(startTime?: number, endTime?: number): string {
  if (!startTime) return '刚刚';
  const target = new Date(endTime || startTime);
  const month = target.getMonth() + 1;
  const date = target.getDate();
  const hours = target.getHours().toString().padStart(2, '0');
  const minutes = target.getMinutes().toString().padStart(2, '0');

  const now = new Date();
  if (target.getFullYear() === now.getFullYear()) {
    return `${month}月${date}日 ${hours}:${minutes}`;
  }
  return `${target.getFullYear()}/${month}/${date} ${hours}:${minutes}`;
}

export const ChatHistoryDrawer: React.FC<ChatHistoryDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onUpdateSessionInfo,
  onRegenerateSubtitle,
  settings,
  onClearAllSessions,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [generatingSubtitleId, setGeneratingSubtitleId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchTitle = s.title.toLowerCase().includes(q);
    const effectiveSub =
      !s.hasCustomSubtitle && s.subtitleTopics && s.subtitleTopics.length > 0
        ? formatSubtitleWithTopics(
            s.subtitleTopics,
            settings?.subtitleSeparator,
            settings?.subtitleCustomSeparator
          )
        : s.subtitle;
    const matchSubtitle = effectiveSub ? effectiveSub.toLowerCase().includes(q) : false;
    const matchMsg = s.messages.some((m) =>
      cleanHistoryPreviewText(m.content).toLowerCase().includes(q)
    );
    return matchTitle || matchSubtitle || matchMsg;
  });

  const handleStartEdit = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    const effectiveSubtitle =
      !session.hasCustomSubtitle && session.subtitleTopics && session.subtitleTopics.length > 0
        ? formatSubtitleWithTopics(
            session.subtitleTopics,
            settings?.subtitleSeparator,
            settings?.subtitleCustomSeparator
          )
        : session.subtitle;
    setEditingId(session.id);
    setEditTitle(session.title);
    setEditSubtitle(effectiveSubtitle || '');
  };

  const handleSaveEdit = (e: React.MouseEvent | React.FormEvent, sessionId: string) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      if (onUpdateSessionInfo) {
        onUpdateSessionInfo(sessionId, editTitle.trim(), editSubtitle.trim());
      } else {
        onRenameSession(sessionId, editTitle.trim());
      }
    }
    setEditingId(null);
  };

  const handleRegenerate = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!onRegenerateSubtitle || generatingSubtitleId === sessionId) return;

    if (!settings?.apiKey || settings.apiKey.trim() === '') {
      alert('请先在右上角「设置」中配置 API Key，副标题需由 AI 智能提取。');
      return;
    }

    try {
      setGeneratingSubtitleId(sessionId);
      const res = await onRegenerateSubtitle(sessionId, true);
      if (editingId === sessionId && res) {
        setEditSubtitle(res);
      }
    } finally {
      setGeneratingSubtitleId(null);
    }
  };

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirmDeleteId === sessionId) {
      onDeleteSession(sessionId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(sessionId);
      setTimeout(() => {
        setConfirmDeleteId((prev) => (prev === sessionId ? null : prev));
      }, 4000);
    }
  };

  return (
    <div className="history-drawer-overlay" onClick={onClose}>
      <div className="history-drawer-content" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="history-drawer-header">
          <div className="drawer-header-left">
            <History size={18} className="text-primary-color" />
            <h3 className="drawer-heading">历史对话</h3>
            <span className="drawer-subtext">
              {searchQuery.trim() ? `匹配 ${filteredSessions.length} 条` : `${sessions.length} 条记录`}
            </span>
          </div>
          <button className="drawer-close-btn" onClick={onClose} title="关闭历史记录">
            <X size={16} />
          </button>
        </div>

        {/* Primary Action: New Chat */}
        <div className="history-actions-bar">
          <button
            type="button"
            className="btn-new-chat-primary"
            onClick={() => {
              onNewSession();
              onClose();
            }}
          >
            <Plus size={16} />
            <span className="new-chat-label-full">开启新对话</span>
            <span className="new-chat-label-short">新对话</span>
          </button>

          {/* Quick Search */}
          <div className="history-search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="搜索记录或内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="history-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Sessions List */}
        <div className="history-sessions-scroll">
          {filteredSessions.length === 0 ? (
            <div className="history-empty-state">
              <MessageSquare size={36} className="text-slate-300 mb-2" />
              <p className="empty-text">没有找到相关的对话记录</p>
              {searchQuery && (
                <button
                  type="button"
                  className="btn-reset-search"
                  onClick={() => setSearchQuery('')}
                >
                  清除搜索关键字
                </button>
              )}
            </div>
          ) : (
            <div className="history-session-list">
              {filteredSessions.map((session) => {
                const isActive = session.id === currentSessionId;
                const isEditing = editingId === session.id;
                const isGenerating = generatingSubtitleId === session.id;
                const displaySubtitle =
                  !session.hasCustomSubtitle && session.subtitleTopics && session.subtitleTopics.length > 0
                    ? formatSubtitleWithTopics(
                        session.subtitleTopics,
                        settings?.subtitleSeparator,
                        settings?.subtitleCustomSeparator
                      )
                    : session.subtitle;
                const firstMsg = session.messages.find((m) => m.role === 'user') || session.messages[0];
                const lastMsg = session.messages[session.messages.length - 1];
                const startTime = firstMsg?.timestamp || session.createdAt;
                const endTime = lastMsg?.timestamp || session.updatedAt || startTime;

                let previewSnippet = '';
                for (let i = session.messages.length - 1; i >= 0; i--) {
                  const cleaned = cleanHistoryPreviewText(session.messages[i].content);
                  if (cleaned) {
                    previewSnippet = cleaned;
                    break;
                  }
                }
                if (!previewSnippet) {
                  previewSnippet = '无消息';
                }

                return (
                  <div
                    key={session.id}
                    className={`history-session-card ${isActive ? 'active-card' : ''} ${isEditing ? 'card-editing-mode' : ''}`}
                    onClick={() => {
                      if (!isEditing) {
                        onSelectSession(session.id);
                        onClose();
                      }
                    }}
                  >
                    <div className="session-card-top">
                      <div className="session-title-wrap">
                        <MessageSquare size={14} className="session-item-icon" />

                        {isEditing ? (
                          <div
                            className="session-rename-form-dual"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="dual-input-field">
                              <span className="field-hint-tag">主标题</span>
                              <input
                                type="text"
                                className="rename-input"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="主标题（首句提取）"
                                autoFocus
                              />
                            </div>

                            <div className="dual-input-field">
                              <div className="field-hint-row">
                                <span className="field-hint-tag">副标题（话题词）</span>
                                {onRegenerateSubtitle && (
                                  <button
                                    type="button"
                                    className={`btn-auto-extract-link ${isGenerating ? 'loading' : ''}`}
                                    onClick={(e) => handleRegenerate(e, session.id)}
                                    title="根据此对话记录内容重新提取"
                                    disabled={isGenerating}
                                  >
                                    <span>{isGenerating ? '提炼中...' : '智能提取'}</span>
                                  </button>
                                )}
                              </div>
                              <input
                                type="text"
                                className="rename-input subtitle-edit-input"
                                value={editSubtitle}
                                onChange={(e) => setEditSubtitle(e.target.value)}
                                placeholder="副标题（例：笨蛋·测验·召唤兽）"
                              />
                            </div>

                            <div className="dual-form-btn-row">
                              <button
                                type="button"
                                className="btn-save-rename"
                                onClick={(e) => handleSaveEdit(e, session.id)}
                                title="确认保存"
                              >
                                <Check size={14} />
                                <span>保存</span>
                              </button>
                              <button
                                type="button"
                                className="btn-cancel-rename"
                                onClick={() => setEditingId(null)}
                                title="取消修改"
                              >
                                <X size={14} />
                                <span>取消</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="session-title-column">
                            <div className="session-title-row">
                              <h4 className="session-title" title={session.title}>
                                {session.title}
                              </h4>
                              {isActive && (
                                <span className="active-badge-indicator">
                                  <span className="pulsing-dot" />
                                  <span className="badge-text-full">当前对话</span>
                                  <span className="badge-text-short">当前</span>
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Preview snippet */}
                    {!isEditing && <p className="session-preview-snippet">{previewSnippet}</p>}

                    {/* Meta info & actions */}
                    <div className="session-card-bottom">
                      <div className="session-meta-stats">
                        <span className="session-time" title={formatSessionTimeRange(startTime, endTime)}>
                          {formatSessionDisplayTime(startTime, endTime)}
                        </span>
                        <span className="meta-dot">·</span>
                        <span className="session-msg-count">
                          {session.messages.length}条
                        </span>
                      </div>

                      <div className="session-card-actions" onClick={(e) => e.stopPropagation()}>
                        {!isEditing && (
                          displaySubtitle ? (
                            <span
                              className={`session-subtitle-bottom-tag ${isGenerating ? 'loading' : ''}`}
                              title={onRegenerateSubtitle ? `话题副标题：${displaySubtitle}（点击重新智能提炼）` : `话题副标题：${displaySubtitle}`}
                              onClick={(e) => {
                                if (onRegenerateSubtitle && !isGenerating) {
                                  handleRegenerate(e, session.id);
                                }
                              }}
                            >
                              {isGenerating ? '提炼中...' : displaySubtitle}
                            </span>
                          ) : (
                            onRegenerateSubtitle && (
                              <button
                                type="button"
                                className={`session-subtitle-bottom-tag tag-empty-prompt ${isGenerating ? 'loading' : ''}`}
                                onClick={(e) => handleRegenerate(e, session.id)}
                                title="根据对话内容智能提炼副标题"
                                disabled={isGenerating}
                              >
                                {isGenerating ? '提炼中...' : '提取副标题'}
                              </button>
                            )
                          )
                        )}

                        {!isEditing && (
                          <button
                            type="button"
                            className="action-icon-btn btn-rename"
                            onClick={(e) => handleStartEdit(e, session)}
                            title="编辑主标题与副标题"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          className={`action-icon-btn btn-delete ${
                            confirmDeleteId === session.id ? 'btn-confirm-delete' : ''
                          }`}
                          onClick={(e) => handleDelete(e, session.id)}
                          title={confirmDeleteId === session.id ? '点击确认删除' : '删除此对话'}
                        >
                          <Trash2 size={13} />
                          {confirmDeleteId === session.id && (
                            <span className="confirm-tip">确认?</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

