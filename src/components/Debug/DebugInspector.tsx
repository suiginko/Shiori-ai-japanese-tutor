import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debugLogger, DebugLogEntry } from '../../services/debugLogger';
import './DebugInspector.css';
import {
  Terminal,
  Activity,
  Copy,
  Check,
  Download,
  Trash2,
  Search,
  Cpu,
  Layers,
  Clock,
  Zap,
  BookOpen,
  Filter,
  RefreshCw,
  Code2,
  FileText,
  Pin,
  Sun,
  Moon,
  Pause,
  Play,
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Gauge,
  Timer,
  Hash,
  Link2,
  ArrowDown,
  MessageSquare,
  Braces,
  SplitSquareHorizontal,
  Eraser,
  ScrollText,
  ArrowUpDown,
  History,
} from 'lucide-react';
import {
  buildCurlCommand,
  buildMarkdownReport,
  compactNumber,
  diffLines,
  downloadTextFile,
  entryMatchesQuery,
  formatBytesFromChars,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  readLocalStorage,
  splitHighlight,
  summarizeDiff,
  writeLocalStorage,
} from './debugHelpers';

type TabKey = 'prompt' | 'output' | 'request' | 'state';
type OutputView = 'raw' | 'clean' | 'diff';
type StatusFilter = 'all' | 'success' | 'streaming' | 'error';
type TimeWindow = 'all' | '10m' | '1m';
type ThemeMode = 'dark' | 'light';

interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'err' | 'info';
}

const LS_KEYS = {
  theme: 'shiori_debug_theme_v2',
  sidebar: 'shiori_debug_sidebar_width_v1',
  pins: 'shiori_debug_pinned_ids_v1',
  follow: 'shiori_debug_follow_tail_v1',
  density: 'shiori_debug_density_v1',
  tab: 'shiori_debug_active_tab_v1',
  outputView: 'shiori_debug_output_view_v1',
};

const TAB_KEYS: TabKey[] = ['prompt', 'output', 'request', 'state'];
const OUTPUT_VIEWS: OutputView[] = ['raw', 'clean', 'diff'];

const TYPE_META: Record<string, { label: string; short: string }> = {
  chat: { label: '私教流式对话', short: '对话' },
  dictionary: { label: 'AI 权威查词', short: '查词' },
  plan: { label: '学情计划规划', short: '计划' },
};

const STATUS_LABEL: Record<string, string> = {
  success: '成功',
  streaming: '传输中',
  error: '异常',
};

const DEFAULT_SIDEBAR = 392;
const MIN_SIDEBAR = 300;
const MAX_SIDEBAR = 640;

/* =========================================================================
 * 小组件
 * ========================================================================= */

function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot ${status}`} />;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const segments = useMemo(() => splitHighlight(text, query), [text, query]);
  if (segments.length === 1) return <>{text}</>;
  return (
    <>
      {segments.map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="debug-hl">
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        )
      )}
    </>
  );
}

interface CollapsibleProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: 'default' | 'danger';
}

function CollapsibleSection({
  title,
  icon,
  actions,
  children,
  defaultOpen = true,
  tone = 'default',
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`debug-section tone-${tone} ${open ? '' : 'collapsed'}`}>
      <header className="debug-section-header" onClick={() => setOpen((v) => !v)}>
        <div className="debug-section-title">
          <span className="debug-section-caret">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          {icon}
          <span className="debug-section-title-text">{title}</span>
        </div>
        <div className="debug-section-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      </header>
      {open && <div className="debug-section-body">{children}</div>}
    </section>
  );
}

interface LongTextProps {
  text: string;
  className?: string;
  collapsedHeight?: number;
}

/** 长文本展示：默认折叠为固定高度，可一键展开 / 收起，避免嵌套滚动带来的阅读负担 */
function LongText({ text, className = '', collapsedHeight = 300 }: LongTextProps) {
  const [expanded, setExpanded] = useState(false);
  const content = text.length ? text : '（空）';
  const overflows = content.length > 900 || content.split('\n').length > 14;
  return (
    <div className="debug-longtext-wrap">
      <div
        className={`debug-code-box ${className}`}
        style={!expanded && overflows ? { maxHeight: collapsedHeight, overflow: 'hidden' } : undefined}
      >
        {content}
      </div>
      {overflows && (
        <button className="debug-expand-btn" onClick={() => setExpanded((v) => !v)}>
          <ArrowUpDown size={11} />
          <span>{expanded ? '收起' : `展开全部（${formatBytesFromChars(text.length)}）`}</span>
        </button>
      )}
    </div>
  );
}

/* =========================================================================
 * 主组件
 * ========================================================================= */

export function DebugInspector() {
  const [logs, setLogs] = useState<DebugLogEntry[]>(() => [...debugLogger.getLogs()]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const saved = readLocalStorage<TabKey>(LS_KEYS.tab, 'prompt');
    return TAB_KEYS.includes(saved) ? saved : 'prompt';
  });
  const [outputView, setOutputView] = useState<OutputView>(() => {
    const saved = readLocalStorage<OutputView>(LS_KEYS.outputView, 'raw');
    return OUTPUT_VIEWS.includes(saved) ? saved : 'raw';
  });
  const [statsOpen, setStatsOpen] = useState(true);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const [theme, setTheme] = useState<ThemeMode>(() => readLocalStorage<ThemeMode>(LS_KEYS.theme, 'light'));
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() =>
    readLocalStorage<'comfortable' | 'compact'>(LS_KEYS.density, 'comfortable')
  );
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    readLocalStorage<number>(LS_KEYS.sidebar, DEFAULT_SIDEBAR)
  );
  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    readLocalStorage<string[]>(LS_KEYS.pins, [])
  );
  const [followTail, setFollowTail] = useState<boolean>(() =>
    readLocalStorage<boolean>(LS_KEYS.follow, true)
  );

  const [paused, setPaused] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [listScrolledDown, setListScrolledDown] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const latestRef = useRef<DebugLogEntry[]>([]);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const pausedRef = useRef(paused);
  const widthRef = useRef(sidebarWidth);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toastSeq = useRef(0);

  pausedRef.current = paused;
  widthRef.current = sidebarWidth;

  /* ------------------------------ 持久化 ------------------------------ */
  useEffect(() => writeLocalStorage(LS_KEYS.theme, theme), [theme]);
  useEffect(() => writeLocalStorage(LS_KEYS.density, density), [density]);
  useEffect(() => writeLocalStorage(LS_KEYS.sidebar, sidebarWidth), [sidebarWidth]);
  useEffect(() => writeLocalStorage(LS_KEYS.pins, pinnedIds), [pinnedIds]);
  useEffect(() => writeLocalStorage(LS_KEYS.follow, followTail), [followTail]);
  // 记住上次停留的页签与输出视图，重新打开调试台时回到原处
  useEffect(() => writeLocalStorage(LS_KEYS.tab, activeTab), [activeTab]);
  useEffect(() => writeLocalStorage(LS_KEYS.outputView, outputView), [outputView]);

  /* ------------------------------ Toast ------------------------------ */
  const pushToast = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2400);
  }, []);

  const copyText = useCallback(
    async (text: string, label: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        pushToast(`已复制${label}`, 'ok');
      } catch {
        pushToast('复制失败，请手动选择文本', 'err');
      }
    },
    [pushToast]
  );

  /* --------------------------- 订阅日志变更 --------------------------- */
  useEffect(() => {
    const unsubscribe = debugLogger.subscribe((updated) => {
      latestRef.current = updated;
      if (pausedRef.current) {
        const shown = shownIdsRef.current;
        setPendingCount(updated.filter((l) => !shown.has(l.id)).length);
        return;
      }
      shownIdsRef.current = new Set(updated.map((l) => l.id));
      setLogs([...updated]);
    });
    return () => unsubscribe();
  }, []);

  // 相对时间（“x 秒前”）计时器
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  /* ------------------------------ 派生数据 ------------------------------ */
  const models = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => l.model && set.add(l.model));
    return Array.from(set).sort();
  }, [logs]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: logs.length, chat: 0, dictionary: 0, plan: 0 };
    logs.forEach((l) => {
      counts[l.type] = (counts[l.type] || 0) + 1;
    });
    return counts;
  }, [logs]);

  const statusCounts = useMemo(() => {
    const counts = { all: logs.length, success: 0, streaming: 0, error: 0 };
    logs.forEach((l) => {
      counts[l.status] += 1;
    });
    return counts;
  }, [logs]);

  const stats = useMemo(() => {
    const done = logs.filter((l) => l.durationMs != null);
    const avgDuration = done.length
      ? Math.round(done.reduce((acc, l) => acc + (l.durationMs || 0), 0) / done.length)
      : null;
    const ttft = logs.filter((l) => l.timeToFirstTokenMs != null);
    const avgTtft = ttft.length
      ? Math.round(ttft.reduce((acc, l) => acc + (l.timeToFirstTokenMs || 0), 0) / ttft.length)
      : null;
    const prompt = logs.reduce((acc, l) => acc + (l.tokens?.prompt || 0), 0);
    const completion = logs.reduce((acc, l) => acc + (l.tokens?.completion || 0), 0);
    const estimated = logs.filter((l) => l.tokens?.estimated).length;
    return {
      total: logs.length,
      avgDuration,
      avgTtft,
      prompt,
      completion,
      totalTokens: prompt + completion,
      errorRate: logs.length ? Math.round((statusCounts.error / logs.length) * 100) : 0,
      estimatedRate: logs.length ? Math.round((estimated / logs.length) * 100) : 0,
    };
  }, [logs, statusCounts.error]);

  const visibleLogs = useMemo(() => {
    const cutoff =
      timeWindow === 'all' ? 0 : now - (timeWindow === '1m' ? 60_000 : 600_000);
    const pinned = new Set(pinnedIds);
    return logs
      .filter((log) => {
        if (log.timestamp < cutoff) return false;
        if (typeFilter !== 'all' && log.type !== typeFilter) return false;
        if (statusFilter !== 'all' && log.status !== statusFilter) return false;
        if (modelFilter !== 'all' && log.model !== modelFilter) return false;
        if (onlyPinned && !pinned.has(log.id)) return false;
        return entryMatchesQuery(log, searchQuery);
      })
      .sort((a, b) => {
        const pa = pinned.has(a.id) ? 1 : 0;
        const pb = pinned.has(b.id) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return b.timestamp - a.timestamp;
      });
    // 说明：时间窗口使用 now 作为基准，故依赖 now 以保持滚动时间窗口实时
  }, [logs, typeFilter, statusFilter, modelFilter, onlyPinned, pinnedIds, searchQuery, timeWindow, now]);

  const selectedLog = useMemo(() => {
    if (selectedId) {
      const hit = logs.find((l) => l.id === selectedId);
      if (hit) return hit;
    }
    return visibleLogs[0] ?? null;
  }, [logs, selectedId, visibleLogs]);

  const filterActive =
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    modelFilter !== 'all' ||
    timeWindow !== 'all' ||
    onlyPinned ||
    searchQuery.trim() !== '';

  /* --------------------------- 联动与快捷键 --------------------------- */
  // 自动跟随最新
  useEffect(() => {
    if (!followTail || paused) return;
    const newest = latestRef.current[0] ?? logs[0];
    if (!newest) return;
    setSelectedId((prev) => (prev === newest.id ? prev : newest.id));
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, followTail, paused]);

  // 选中异常记录时自动跳到原始输出页签，便于排障
  useEffect(() => {
    if (selectedLog?.status === 'error') setActiveTab('output');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLog?.id]);

  // 键盘导航：↑ / ↓ 切换记录，/ 聚焦搜索，Esc 清空搜索并失焦
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (searchQuery) setSearchQuery('');
        searchInputRef.current?.blur();
        return;
      }
      if (typing) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (visibleLogs.length === 0) return;
      e.preventDefault();
      const currentIdx = selectedLog ? visibleLogs.findIndex((l) => l.id === selectedLog.id) : -1;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx = Math.min(visibleLogs.length - 1, Math.max(0, currentIdx + step));
      const next = visibleLogs[nextIdx];
      if (next) {
        setSelectedId(next.id);
        setFollowTail(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visibleLogs, selectedLog, searchQuery]);

  /* ------------------------------ 交互动作 ------------------------------ */
  const handleSelectLog = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (logs[0]?.id !== id) setFollowTail(false);
    },
    [logs]
  );

  const resumeLive = useCallback(() => {
    const latest = latestRef.current;
    shownIdsRef.current = new Set(latest.map((l) => l.id));
    setLogs([...latest]);
    setPendingCount(0);
    setPaused(false);
    pushToast('已恢复实时刷新', 'info');
  }, [pushToast]);

  const jumpToLatest = useCallback(() => {
    if (paused) resumeLive();
    const newest = latestRef.current[0];
    if (newest) setSelectedId(newest.id);
    setFollowTail(true);
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [paused, resumeLive]);

  const togglePin = useCallback(
    (id: string) => {
      // 副作用保持在 updater 之外，避免 StrictMode 下 updater 被重复调用造成双 Toast
      const has = pinnedIds.includes(id);
      setPinnedIds((prev) => (has ? prev.filter((x) => x !== id) : [id, ...prev]));
      pushToast(has ? '已取消收藏' : '已收藏并置顶', 'info');
    },
    [pinnedIds, pushToast]
  );

  const handleDeleteLog = useCallback(
    (id: string) => {
      if (armedDelete !== id) {
        setArmedDelete(id);
        setTimeout(() => setArmedDelete((prev) => (prev === id ? null : prev)), 3000);
        return;
      }
      debugLogger.removeLog(id);
      setArmedDelete(null);
      if (selectedId === id) setSelectedId(null);
      pushToast('已删除该条记录', 'info');
    },
    [armedDelete, selectedId, pushToast]
  );

  const handleClear = useCallback(() => {
    debugLogger.clearLogs();
    setSelectedId(null);
    setConfirmClear(false);
    setPinnedIds([]);
    pushToast('已清空全部调试记录', 'info');
  }, [pushToast]);

  const handleRefresh = useCallback(() => {
    const list = [...debugLogger.getLogs()];
    setLogs(list);
    setPaused(false);
    setPendingCount(0);
    shownIdsRef.current = new Set(list.map((l) => l.id));
    pushToast('已手动刷新', 'ok');
  }, [pushToast]);

  const exportAll = useCallback(() => {
    if (logs.length === 0) {
      pushToast('暂无记录可导出', 'err');
      return;
    }
    downloadTextFile(
      `shiori-debug-logs-${Date.now()}.json`,
      JSON.stringify(logs, null, 2),
      'application/json'
    );
    pushToast(`已导出 ${logs.length} 条 JSON`, 'ok');
  }, [logs, pushToast]);

  const exportSelected = useCallback(() => {
    if (!selectedLog) return;
    downloadTextFile(
      `shiori-debug-${selectedLog.id}.json`,
      JSON.stringify(selectedLog, null, 2),
      'application/json'
    );
    pushToast('已导出当前记录 JSON', 'ok');
  }, [selectedLog, pushToast]);

  const exportSelectedMarkdown = useCallback(() => {
    if (!selectedLog) return;
    downloadTextFile(`shiori-debug-${selectedLog.id}.md`, buildMarkdownReport(selectedLog), 'text/markdown');
    pushToast('已导出 Markdown 复盘报告', 'ok');
  }, [selectedLog, pushToast]);

  const resetFilters = useCallback(() => {
    setTypeFilter('all');
    setStatusFilter('all');
    setModelFilter('all');
    setTimeWindow('all');
    setOnlyPinned(false);
    setSearchQuery('');
  }, []);

  /* --------------------------- 侧栏拖拽宽度 --------------------------- */
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startW + (ev.clientX - startX)));
      widthRef.current = next;
      setSidebarWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      writeLocalStorage(LS_KEYS.sidebar, widthRef.current);
      document.body.classList.remove('debug-resizing');
    };
    document.body.classList.add('debug-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  /* ------------------------------ 渲染辅助 ------------------------------ */
  const promptTokens = selectedLog?.tokens?.prompt || 0;
  const completionTokens = selectedLog?.tokens?.completion || 0;
  const totalTokens = promptTokens + completionTokens;
  const promptPct = totalTokens > 0 ? Math.round((promptTokens / totalTokens) * 100) : 0;

  const outputDiff = useMemo(() => {
    if (!selectedLog) return null;
    const sanitized = selectedLog.sanitizedOutput ?? '';
    if (!sanitized || sanitized === selectedLog.rawOutput) return null;
    const lines = diffLines(selectedLog.rawOutput, sanitized);
    return { lines, stats: summarizeDiff(lines) };
  }, [selectedLog]);

  const curlCommand = useMemo(
    () => (selectedLog ? buildCurlCommand(selectedLog) : ''),
    [selectedLog]
  );

  const isPinned = selectedLog ? pinnedIds.includes(selectedLog.id) : false;

  const copyBtn = (text: string, label: string, icon?: React.ReactNode, key?: string) => (
    <button className="debug-btn" key={key} onClick={() => copyText(text, label)}>
      {icon ?? <Copy size={12} />}
      <span>复制{label}</span>
    </button>
  );

  return (
    <div
      className="debug-inspector-container"
      data-theme={theme}
      data-density={density}
    >
      {/* ======================= 顶部：品牌 + 全局动作 ======================= */}
      <header className="debug-header">
        <div className="debug-header-brand">
          <span className="debug-brand-mark">
            <Terminal size={15} />
          </span>
          <span className="debug-brand-text">
            <strong>栞 · 开发者调试控制台</strong>
            <em>Shiori DevTools</em>
          </span>
          <span className={`debug-header-badge ${paused ? 'is-paused' : ''}`}>
            <span className="debug-pulse-dot" />
            {paused ? '实时刷新已暂停' : '实时广播监听中'}
          </span>
        </div>

        <div className="debug-header-actions">
          <span className="debug-shortcut-hint">
            <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd>
          </span>

          <button
            className="debug-icon-btn"
            title={density === 'comfortable' ? '切换为紧凑列表' : '切换为舒适列表'}
            onClick={() => setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))}
          >
            <ScrollText size={14} />
          </button>

          <button
            className="debug-icon-btn"
            title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <button
            className={`debug-btn ${paused ? 'debug-btn-primary' : ''}`}
            onClick={() => (paused ? resumeLive() : setPaused(true))}
            title={paused ? '继续接收实时日志' : '暂停刷新以稳定阅读当前快照'}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            <span>{paused ? '继续刷新' : '暂停刷新'}</span>
          </button>

          <button className="debug-btn" onClick={handleRefresh} title="立即从本地重新拉取记录">
            <RefreshCw size={12} />
            <span>刷新</span>
          </button>

          <button className="debug-btn" onClick={exportAll} title="导出全部记录为 JSON">
            <Download size={12} />
            <span>导出全部</span>
          </button>

          {confirmClear ? (
            <span className="debug-confirm-inline">
              <span>清空 {logs.length} 条？</span>
              <button className="debug-btn debug-btn-danger" onClick={handleClear}>
                <Trash2 size={12} />
                <span>确认</span>
              </button>
              <button className="debug-btn" onClick={() => setConfirmClear(false)}>
                <X size={12} />
                <span>取消</span>
              </button>
            </span>
          ) : (
            <button
              className="debug-btn debug-btn-danger"
              onClick={() => setConfirmClear(true)}
              title="清空全部调试记录"
            >
              <Trash2 size={12} />
              <span>清空</span>
            </button>
          )}
        </div>
      </header>

      {/* ============================ 过滤工具条 ============================ */}
      <div className="debug-toolbar">
        <div className="debug-search-wrap">
          <Search size={13} className="debug-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="debug-search-input"
            placeholder="搜索标题 / 提示词 / 输出 / 模型 / 错误（按 / 聚焦）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="debug-search-clear" onClick={() => setSearchQuery('')} title="清空搜索">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="debug-chip-group" role="group" aria-label="按类型过滤">
          <Filter size={12} className="debug-chip-group-icon" />
          <button
            className={`debug-chip-btn ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            全部 <span className="debug-chip-count">{typeCounts.all}</span>
          </button>
          {(['chat', 'dictionary', 'plan'] as const).map((type) => (
            <button
              key={type}
              className={`debug-chip-btn ${typeFilter === type ? 'active' : ''}`}
              onClick={() => setTypeFilter(type)}
            >
              {TYPE_META[type].short}
              <span className="debug-chip-count">{typeCounts[type] || 0}</span>
            </button>
          ))}
        </div>

        <div className="debug-chip-group" role="group" aria-label="按状态过滤">
          {(['all', 'success', 'streaming', 'error'] as const).map((status) => (
            <button
              key={status}
              className={`debug-chip-btn status-${status} ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status !== 'all' && <StatusDot status={status} />}
              {status === 'all' ? '全状态' : STATUS_LABEL[status]}
              <span className="debug-chip-count">{statusCounts[status]}</span>
            </button>
          ))}
        </div>

        <select
          className="debug-select"
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          title="按模型过滤"
        >
          <option value="all">全部模型</option>
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>

        <select
          className="debug-select"
          value={timeWindow}
          onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}
          title="按时间窗口过滤"
        >
          <option value="all">全部时间</option>
          <option value="10m">最近 10 分钟</option>
          <option value="1m">最近 1 分钟</option>
        </select>

        <button
          className={`debug-chip-btn pin-chip ${onlyPinned ? 'active' : ''}`}
          onClick={() => setOnlyPinned((v) => !v)}
          title="仅显示已收藏的记录"
        >
          <Pin size={12} />
          仅收藏
          <span className="debug-chip-count">{pinnedIds.filter((id) => logs.some((l) => l.id === id)).length}</span>
        </button>

        <label className={`debug-chip-btn pin-chip ${followTail ? 'active' : ''}`} title="新记录产生时自动选中最新一条">
          <input
            type="checkbox"
            checked={followTail}
            onChange={(e) => setFollowTail(e.target.checked)}
          />
          <ArrowDown size={12} />
          跟随最新
        </label>

        {filterActive && (
          <button className="debug-btn" onClick={resetFilters} title="清除全部过滤条件">
            <Eraser size={12} />
            <span>重载</span>
          </button>
        )}
      </div>

      {/* ============================ 统计概览条 ============================ */}
      <div className={`debug-stats-strip ${statsOpen ? '' : 'collapsed'}`}>
        <button className="debug-stats-toggle" onClick={() => setStatsOpen((v) => !v)}>
          {statsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>会话概览</span>
        </button>

        {statsOpen && (
          <div className="debug-stats-items">
            <div className="debug-stat">
              <Activity size={13} className="c-indigo" />
              <span className="debug-stat-label">请求总数</span>
              <strong className="debug-stat-value">{stats.total}</strong>
            </div>
            <div className="debug-stat">
              <Check size={13} className="c-emerald" />
              <span className="debug-stat-label">成功</span>
              <strong className="debug-stat-value">{statusCounts.success}</strong>
            </div>
            <div className={`debug-stat ${statusCounts.error > 0 ? 'danger' : ''}`}>
              <AlertTriangle size={13} className={statusCounts.error > 0 ? 'c-rose' : 'c-muted'} />
              <span className="debug-stat-label">异常</span>
              <strong className="debug-stat-value">
                {statusCounts.error}
                {stats.total > 0 && <em>（{stats.errorRate}%）</em>}
              </strong>
            </div>
            <div className="debug-stat">
              <Zap size={13} className="c-sky" />
              <span className="debug-stat-label">进行中</span>
              <strong className="debug-stat-value">{statusCounts.streaming}</strong>
            </div>
            <div className="debug-stat">
              <Timer size={13} className="c-violet" />
              <span className="debug-stat-label">平均耗时</span>
              <strong className="debug-stat-value">{formatDuration(stats.avgDuration ?? undefined)}</strong>
            </div>
            <div className="debug-stat">
              <Gauge size={13} className="c-amber" />
              <span className="debug-stat-label">平均首字</span>
              <strong className="debug-stat-value">
                {stats.avgTtft == null ? '—' : `${stats.avgTtft} ms`}
              </strong>
            </div>
            <div className="debug-stat">
              <Hash size={13} className="c-indigo" />
              <span className="debug-stat-label">Tokens 合计</span>
              <strong className="debug-stat-value">
                {compactNumber(stats.totalTokens)}
                <em>
                  P {compactNumber(stats.prompt)} / C {compactNumber(stats.completion)}
                </em>
              </strong>
            </div>
            <div className="debug-stat">
              <Braces size={13} className="c-slate" />
              <span className="debug-stat-label">用量估算占比</span>
              <strong className="debug-stat-value">
                {stats.estimatedRate}%
                <em>{stats.estimatedRate === 0 ? '全部真实 usage' : '含本地估算'}</em>
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* ============================== 主体 ============================== */}
      <div className="debug-body">
        {/* ---------------- 左侧：时间线列表 ---------------- */}
        <aside className="debug-sidebar" style={{ width: sidebarWidth }}>
          <div className="debug-sidebar-header">
            <span className="debug-sidebar-title">
              <History size={12} />
              交互时间线
              <em>
                {visibleLogs.length} / {logs.length}
              </em>
            </span>
            <span className="debug-sidebar-hint">↑↓ 切换 · / 搜索</span>
          </div>

          <div
            className="debug-sidebar-list"
            ref={listRef}
            onScroll={(e) => setListScrolledDown((e.target as HTMLDivElement).scrollTop > 24)}
          >
            {visibleLogs.length === 0 ? (
              <div className="debug-empty-state small">
                <Activity className="debug-empty-icon" />
                <p>{logs.length === 0 ? '暂无调试记录' : '没有符合条件的记录'}</p>
                <p className="debug-empty-sub">
                  {logs.length === 0
                    ? '在主窗口与 AI 对话、查词或生成计划后，这里会实时出现记录'
                    : '试着放宽过滤条件，或点击「重载」清除筛选'}
                </p>
                {filterActive && (
                  <button className="debug-btn" onClick={resetFilters}>
                    <Eraser size={12} />
                    <span>清除筛选</span>
                  </button>
                )}
              </div>
            ) : (
              visibleLogs.map((log) => {
                const active = selectedLog?.id === log.id;
                const pinned = pinnedIds.includes(log.id);
                const meta = TYPE_META[log.type];
                return (
                  <div
                    key={log.id}
                    className={`debug-card ${active ? 'active' : ''} status-${log.status} ${pinned ? 'pinned' : ''}`}
                    onClick={() => handleSelectLog(log.id)}
                  >
                    <div className="debug-card-top">
                      <span className="debug-card-type">
                        <StatusDot status={log.status} />
                        {log.typeLabel || meta?.label || log.type}
                      </span>
                      <span className="debug-card-time" title={log.timeStr}>
                        {formatRelativeTime(log.timestamp, now)}
                      </span>
                    </div>

                    <div className="debug-card-title">
                      <Highlighted text={log.title} query={searchQuery} />
                    </div>

                    <div className="debug-card-meta">
                      <span className="debug-chip" title="模型">
                        {log.model}
                      </span>
                      <span className="debug-chip" title="总耗时">
                        <Clock size={9} />
                        {log.status === 'streaming' ? '流式中' : formatDuration(log.durationMs)}
                      </span>
                      <span className="debug-chip" title="Tokens 合计（输入 / 输出）">
                        {compactNumber(log.tokens.total)}
                        <em className="debug-chip-sub">
                          {compactNumber(log.tokens.prompt)}/{compactNumber(log.tokens.completion)}
                        </em>
                      </span>
                      {log.tokens.estimated && (
                        <span className="debug-chip chip-estimate" title="用量为本地估算（API 未返回真实 usage）">
                          估算
                        </span>
                      )}
                      {log.chunkCount > 0 && (
                        <span className="debug-chip chip-dim" title="流式分块数">
                          {log.chunkCount} 帧
                        </span>
                      )}
                    </div>

                    {log.errorMessage && (
                      <div className="debug-card-error" title={log.errorMessage}>
                        <AlertTriangle size={10} />
                        <span>{log.errorMessage}</span>
                      </div>
                    )}

                    <button
                      className={`debug-card-pin ${pinned ? 'on' : ''}`}
                      title={pinned ? '取消收藏' : '收藏并置顶'}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(log.id);
                      }}
                    >
                      <Pin size={11} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {(pendingCount > 0 || (listScrolledDown && visibleLogs.length > 0)) && (
            <button className="debug-jump-latest" onClick={jumpToLatest}>
              <ArrowDown size={12} />
              {pendingCount > 0 ? `已暂停 · 新增 ${pendingCount} 条` : '回到最新'}
            </button>
          )}

          <div
            className="debug-resize-handle"
            onMouseDown={startResize}
            onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR)}
            title="拖动调整宽度 · 双击恢复默认"
          />
        </aside>

        {/* ---------------- 右侧：详情面板 ---------------- */}
        <main className="debug-detail">
          {selectedLog ? (
            <>
              {/* 概览横幅 */}
              <div className="debug-detail-banner">
                <div className="debug-banner-header">
                  <div className="debug-banner-title">
                    <StatusDot status={selectedLog.status} />
                    <span className="debug-banner-name">
                      <Highlighted text={selectedLog.title} query={searchQuery} />
                    </span>
                    <span className="debug-banner-id">#{selectedLog.id}</span>
                    <span className={`debug-banner-status status-${selectedLog.status}`}>
                      {STATUS_LABEL[selectedLog.status]}
                    </span>
                    {isPinned && (
                      <span className="debug-banner-pin">
                        <Pin size={10} /> 已收藏
                      </span>
                    )}
                  </div>

                  <div className="debug-banner-actions">
                    {copyBtn(JSON.stringify(selectedLog, null, 2), '完整 JSON', <Copy size={12} />, 'full-json')}
                    {copyBtn(curlCommand, '为 cURL', <Link2 size={12} />, 'curl')}
                    <button className="debug-btn" onClick={exportSelected} title="仅导出当前记录">
                      <Download size={12} />
                      <span>导出本条</span>
                    </button>
                    <button className="debug-btn" onClick={exportSelectedMarkdown} title="导出为可读的 Markdown 复盘报告">
                      <FileText size={12} />
                      <span>导出报告</span>
                    </button>
                    <button
                      className={`debug-btn ${isPinned ? 'debug-btn-primary' : ''}`}
                      onClick={() => togglePin(selectedLog.id)}
                    >
                      <Pin size={12} />
                      <span>{isPinned ? '取消收藏' : '收藏'}</span>
                    </button>
                    <button
                      className={`debug-btn ${armedDelete === selectedLog.id ? 'debug-btn-danger' : ''}`}
                      onClick={() => handleDeleteLog(selectedLog.id)}
                      title="删除当前记录"
                    >
                      <Trash2 size={12} />
                      <span>{armedDelete === selectedLog.id ? '确认删除？' : '删除'}</span>
                    </button>
                  </div>
                </div>

                {/* 指标网格 */}
                <div className="debug-metrics-grid">
                  <div className="debug-metric-box">
                    <span className="debug-metric-label">
                      <Timer size={10} /> 总耗时
                    </span>
                    <span className="debug-metric-value c-indigo">{formatDuration(selectedLog.durationMs)}</span>
                  </div>
                  <div className="debug-metric-box">
                    <span className="debug-metric-label">
                      <Gauge size={10} /> 首字延迟 TTFT
                    </span>
                    <span className="debug-metric-value c-amber">
                      {selectedLog.timeToFirstTokenMs != null ? `${selectedLog.timeToFirstTokenMs} ms` : '—'}
                    </span>
                  </div>
                  <div className="debug-metric-box">
                    <span className="debug-metric-label">
                      <Cpu size={10} /> 输入 Prompt
                    </span>
                    <span className="debug-metric-value c-sky">{formatNumber(selectedLog.tokens.prompt)}</span>
                  </div>
                  <div className="debug-metric-box">
                    <span className="debug-metric-label">
                      <Cpu size={10} /> 输出 Completion
                    </span>
                    <span className="debug-metric-value c-emerald">
                      {formatNumber(selectedLog.tokens.completion)}
                    </span>
                  </div>
                  <div className="debug-metric-box">
                    <span className="debug-metric-label">
                      <Hash size={10} /> 合计 Tokens
                    </span>
                    <span className="debug-metric-value c-violet">{formatNumber(selectedLog.tokens.total)}</span>
                  </div>
                  <div className="debug-metric-box">
                    <span className="debug-metric-label">
                      <Braces size={10} /> 用量来源
                    </span>
                    <span
                      className={`debug-metric-value ${selectedLog.tokens.estimated ? 'c-amber' : 'c-emerald'}`}
                    >
                      {selectedLog.tokens.estimated ? '本地估算' : 'API 真实 usage'}
                    </span>
                  </div>
                  <div className="debug-metric-box">
                    <span className="debug-metric-label">
                      <Zap size={10} /> 流式分块
                    </span>
                    <span className="debug-metric-value c-slate">{selectedLog.chunkCount} 帧</span>
                  </div>
                  <div className="debug-metric-box span-2">
                    <span className="debug-metric-label">
                      <Layers size={10} /> 模型 / 终结点
                    </span>
                    <span className="debug-metric-value small" title={`${selectedLog.model} · ${selectedLog.endpoint}`}>
                      {selectedLog.model}
                      <em className="debug-metric-sub">{selectedLog.provider}</em>
                    </span>
                  </div>
                </div>

                {/* Token 占比可视化 */}
                <div className="debug-tokenbar-row">
                  <span className="debug-tokenbar-label">Token 构成</span>
                  <div className="debug-tokenbar" title={`输入 ${promptTokens} / 输出 ${completionTokens}`}>
                    {totalTokens > 0 ? (
                      <>
                        <div className="debug-tokenbar-prompt" style={{ width: `${promptPct}%` }} />
                        <div className="debug-tokenbar-completion" style={{ width: `${100 - promptPct}%` }} />
                      </>
                    ) : (
                      <div className="debug-tokenbar-empty" />
                    )}
                  </div>
                  <span className="debug-tokenbar-legend">
                    <i className="dot-prompt" /> 输入 {promptPct}%
                    <i className="dot-completion" /> 输出 {100 - promptPct}%
                  </span>
                </div>
              </div>

              {/* 页签 */}
              <div className="debug-tabs">
                <button
                  className={`debug-tab-btn ${activeTab === 'prompt' ? 'active' : ''}`}
                  onClick={() => setActiveTab('prompt')}
                >
                  <FileText size={14} />
                  <span>发送提示词</span>
                  <em className="debug-tab-count">{selectedLog.optimizedMessages.length + 1}</em>
                </button>
                <button
                  className={`debug-tab-btn ${activeTab === 'output' ? 'active' : ''}`}
                  onClick={() => setActiveTab('output')}
                >
                  <Code2 size={14} />
                  <span>模型输出</span>
                  <em className="debug-tab-count">{formatBytesFromChars(selectedLog.rawOutput.length)}</em>
                  {selectedLog.status === 'error' && <span className="debug-tab-alert" />}
                </button>
                <button
                  className={`debug-tab-btn ${activeTab === 'request' ? 'active' : ''}`}
                  onClick={() => setActiveTab('request')}
                >
                  <Zap size={14} />
                  <span>请求配置</span>
                </button>
                <button
                  className={`debug-tab-btn ${activeTab === 'state' ? 'active' : ''}`}
                  onClick={() => setActiveTab('state')}
                >
                  <BookOpen size={14} />
                  <span>学情快照</span>
                </button>
              </div>

              {/* 页签内容 */}
              <div className="debug-content-scroll">
                {/* ---------- 页签 1：提示词 ---------- */}
                {activeTab === 'prompt' && (
                  <>
                    <CollapsibleSection
                      icon={<Cpu size={14} className="c-indigo" />}
                      title={
                        <>
                          完整系统提示词
                          <em className="debug-inline-meta">
                            {formatBytesFromChars(selectedLog.systemPromptCharCount)} · 约{' '}
                            {formatNumber(selectedLog.systemPromptTokens || 0)} tokens
                          </em>
                        </>
                      }
                      actions={copyBtn(selectedLog.systemPrompt, 'System Prompt', <Copy size={12} />, 'sp')}
                    >
                      <LongText text={selectedLog.systemPrompt} />
                    </CollapsibleSection>

                    <CollapsibleSection
                      icon={<MessageSquare size={14} className="c-sky" />}
                      title={
                        <>
                          发送给 API 的消息列表
                          <em className="debug-inline-meta">
                            原始 {selectedLog.rawMessagesCount} 条 → 压缩发送{' '}
                            {selectedLog.optimizedMessages.length} 条
                          </em>
                        </>
                      }
                      actions={copyBtn(
                        JSON.stringify(selectedLog.optimizedMessages, null, 2),
                        'Messages JSON',
                        <Copy size={12} />,
                        'msgs'
                      )}
                    >
                      {selectedLog.optimizedMessages.length === 0 ? (
                        <p className="debug-inline-empty">无上下文对话消息（单轮请求或查词任务）</p>
                      ) : (
                        selectedLog.optimizedMessages.map((msg, index) => (
                          <div key={`${index}-${msg.role}`} className="debug-msg-card">
                            <div className="debug-msg-header">
                              <span className={`role-tag ${msg.role}`}>
                                #{index + 1} {msg.role}
                              </span>
                              <span className="debug-msg-meta">
                                {formatBytesFromChars(msg.content.length)}
                                <button
                                  className="debug-mini-btn"
                                  onClick={() => copyText(msg.content, `第 ${index + 1} 条消息`)}
                                >
                                  <Copy size={10} />
                                  复制
                                </button>
                              </span>
                            </div>
                            <div className="debug-msg-content">{msg.content || '（空）'}</div>
                          </div>
                        ))
                      )}
                    </CollapsibleSection>
                  </>
                )}

                {/* ---------- 页签 2：模型输出 ---------- */}
                {activeTab === 'output' && (
                  <>
                    <div className="debug-viewswitch">
                      <button
                        className={`debug-viewswitch-btn ${outputView === 'raw' ? 'active' : ''}`}
                        onClick={() => setOutputView('raw')}
                      >
                        <Terminal size={13} /> 原始输出
                      </button>
                      <button
                        className={`debug-viewswitch-btn ${outputView === 'clean' ? 'active' : ''}`}
                        onClick={() => setOutputView('clean')}
                        disabled={!selectedLog.sanitizedOutput}
                      >
                        <Check size={13} /> 清洗正文
                      </button>
                      <button
                        className={`debug-viewswitch-btn ${outputView === 'diff' ? 'active' : ''}`}
                        onClick={() => setOutputView('diff')}
                        disabled={!outputDiff}
                        title={outputDiff ? '对比原始输出与清洗正文的差异' : '原始输出与清洗正文完全一致'}
                      >
                        <SplitSquareHorizontal size={13} /> 差异对比
                      </button>
                    </div>

                    {selectedLog.status === 'streaming' && (
                      <div className="debug-streaming-tip">
                        <span className="debug-pulse-dot" />
                        正在接收模型实时流数据……
                      </div>
                    )}

                    {outputView === 'raw' && (
                      <CollapsibleSection
                        icon={<Terminal size={14} className="c-emerald" />}
                        title={
                          <>
                            原始返回文本（未经任何过滤）
                            <em className="debug-inline-meta">
                              {formatBytesFromChars(selectedLog.rawOutput.length)} · {selectedLog.chunkCount} 个分块
                            </em>
                          </>
                        }
                        actions={copyBtn(selectedLog.rawOutput, '原始文本', <Copy size={12} />, 'raw')}
                      >
                        <LongText
                          text={
                            selectedLog.rawOutput ||
                            (selectedLog.status === 'error' ? '无输出（请求失败）' : '等待首字响应……')
                          }
                          className="text-emerald"
                          collapsedHeight={520}
                        />
                      </CollapsibleSection>
                    )}

                    {outputView === 'clean' && (
                      <CollapsibleSection
                        icon={<Check size={14} className="c-indigo" />}
                        title={
                          <>
                            最终清洗呈现正文
                            <em className="debug-inline-meta">
                              {formatBytesFromChars((selectedLog.sanitizedOutput || '').length)}
                            </em>
                          </>
                        }
                        actions={copyBtn(
                          selectedLog.sanitizedOutput || '',
                          '清洗文本',
                          <Copy size={12} />,
                          'clean'
                        )}
                      >
                        <LongText
                          text={selectedLog.sanitizedOutput || '（本次未产生清洗后的正文）'}
                          collapsedHeight={520}
                        />
                      </CollapsibleSection>
                    )}

                    {outputView === 'diff' && outputDiff && (
                      <CollapsibleSection
                        icon={<SplitSquareHorizontal size={14} className="c-amber" />}
                        title={
                          <>
                            原始输出 ↔ 清洗正文 差异
                            <em className="debug-inline-meta">
                              −{outputDiff.stats.removed} 行 / +{outputDiff.stats.added} 行
                            </em>
                          </>
                        }
                      >
                        <div className="debug-diff">
                          {outputDiff.lines.map((line, index) => (
                            <div key={index} className={`debug-diff-line ${line.type}`}>
                              <span className="debug-diff-sign">
                                {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
                              </span>
                              <span className="debug-diff-text">{line.text || '\u00a0'}</span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleSection>
                    )}

                    {selectedLog.errorMessage && (
                      <CollapsibleSection
                        tone="danger"
                        icon={<AlertTriangle size={14} className="c-rose" />}
                        title="错误详情"
                        actions={copyBtn(selectedLog.errorMessage, '错误信息', <Copy size={12} />, 'err')}
                      >
                        <div className="debug-code-box text-rose">{selectedLog.errorMessage}</div>
                      </CollapsibleSection>
                    )}
                  </>
                )}

                {/* ---------- 页签 3：请求配置 ---------- */}
                {activeTab === 'request' && (
                  <>
                    <CollapsibleSection
                      icon={<Zap size={14} className="c-amber" />}
                      title="底层请求参数与网络终结点"
                      actions={copyBtn(curlCommand, '为 cURL', <Link2 size={12} />, 'curl2')}
                    >
                      <div className="debug-kv-grid">
                        <div className="debug-kv">
                          <span className="debug-kv-label">接口供应商</span>
                          <span className="debug-kv-value">{selectedLog.provider}</span>
                        </div>
                        <div className="debug-kv">
                          <span className="debug-kv-label">模型名称</span>
                          <span className="debug-kv-value">{selectedLog.model}</span>
                        </div>
                        <div className="debug-kv span-2">
                          <span className="debug-kv-label">API 终结点</span>
                          <span className="debug-kv-value mono break">{selectedLog.endpoint}</span>
                        </div>
                        <div className="debug-kv">
                          <span className="debug-kv-label">流式输出</span>
                          <span className={`debug-kv-value ${selectedLog.stream ? 'c-emerald' : 'c-muted'}`}>
                            {selectedLog.stream ? 'true（流式）' : 'false（一次性）'}
                          </span>
                        </div>
                        <div className="debug-kv">
                          <span className="debug-kv-label">采样温度</span>
                          <span className="debug-kv-value">{selectedLog.temperature ?? '—'}</span>
                        </div>
                      </div>

                      <div className="debug-subblock-title">
                        <span>完整 Request Body</span>
                        {copyBtn(
                          JSON.stringify(selectedLog.rawRequestBody || {}, null, 2),
                          'Request Body',
                          <Copy size={12} />,
                          'body'
                        )}
                      </div>
                      <LongText
                        text={JSON.stringify(selectedLog.rawRequestBody || {}, null, 2)}
                        collapsedHeight={340}
                      />
                    </CollapsibleSection>

                    <CollapsibleSection
                      icon={<Link2 size={14} className="c-sky" />}
                      title="可复现的 cURL 命令"
                      actions={copyBtn(curlCommand, '为 cURL', <Link2 size={12} />, 'curl3')}
                    >
                      <p className="debug-inline-note">
                        将 <code>&lt;YOUR_API_KEY&gt;</code> 替换为真实密钥即可在终端复现本次请求。
                        Gemini 渠道由本地代理转发，命令中已补全 apiKey 字段位置。
                      </p>
                      <div className="debug-code-box">{curlCommand}</div>
                    </CollapsibleSection>
                  </>
                )}

                {/* ---------- 页签 4：学情快照 ---------- */}
                {activeTab === 'state' && (
                  <CollapsibleSection
                    icon={<BookOpen size={14} className="c-emerald" />}
                    title="触发请求时的学情与记忆快照"
                  >
                    {selectedLog.stateSnapshot ? (
                      <div className="debug-state-grid">
                        <div className="debug-state-card">
                          <span className="debug-state-card-title">学生水平与人设</span>
                          <div className="debug-state-row">
                            <span>当前 JLPT 级别</span>
                            <strong className="c-indigo">{selectedLog.stateSnapshot.userLevel}</strong>
                          </div>
                          <div className="debug-state-row">
                            <span>学生昵称</span>
                            <strong>{selectedLog.stateSnapshot.userName}</strong>
                          </div>
                          <div className="debug-state-row">
                            <span>私教名称</span>
                            <strong>{selectedLog.stateSnapshot.tutorName}</strong>
                          </div>
                          <div className="debug-state-row">
                            <span>累计会话</span>
                            <strong>{selectedLog.stateSnapshot.totalSessionsCount}</strong>
                          </div>
                          <div className="debug-state-row">
                            <span>薄弱点</span>
                            <strong>
                              {selectedLog.stateSnapshot.userWeakPoints.length
                                ? selectedLog.stateSnapshot.userWeakPoints.join('、')
                                : '无'}
                            </strong>
                          </div>
                        </div>

                        <div className="debug-state-card">
                          <span className="debug-state-card-title">词库与语法阶段镜像</span>
                          <div className="debug-state-row">
                            <span>🌱 初学生词</span>
                            <strong className="c-amber">
                              {selectedLog.stateSnapshot.learnedWordsCount.learning} 个
                            </strong>
                          </div>
                          <div className="debug-state-row">
                            <span>🔄 温习生词</span>
                            <strong className="c-sky">
                              {selectedLog.stateSnapshot.learnedWordsCount.reviewing} 个
                            </strong>
                          </div>
                          <div className="debug-state-row">
                            <span>⭐ 已掌握生词</span>
                            <strong className="c-emerald">
                              {selectedLog.stateSnapshot.learnedWordsCount.mastered} 个
                            </strong>
                          </div>
                          <div className="debug-state-row">
                            <span>📚 生词总量</span>
                            <strong>{selectedLog.stateSnapshot.learnedWordsCount.total} 个</strong>
                          </div>
                          <div className="debug-state-row">
                            <span>📖 累计已学语法</span>
                            <strong className="c-violet">
                              {selectedLog.stateSnapshot.learnedGrammarCount} 条
                            </strong>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="debug-inline-empty">该请求未附带学情快照（如查词、计划生成等轻量任务）</p>
                    )}
                  </CollapsibleSection>
                )}
              </div>
            </>
          ) : (
            <div className="debug-empty-state">
              <Terminal className="debug-empty-icon" />
              <h3>未选择调试记录</h3>
              <p>
                在主窗口与 AI 对话、查词或生成学习计划，捕获到的请求会实时出现在左侧时间线；
                用 ↑ / ↓ 可快速切换记录。
              </p>
            </div>
          )}
        </main>
      </div>

      {/* ============================== Toast ============================== */}
      <div className="debug-toast-layer">
        {toasts.map((toast) => (
          <div key={toast.id} className={`debug-toast tone-${toast.tone}`}>
            {toast.tone === 'ok' ? <Check size={13} /> : toast.tone === 'err' ? <X size={13} /> : <Activity size={13} />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
