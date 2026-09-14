import React, { useState, useRef } from 'react';
import {
  ApiSettings,
  ApiProvider,
  ThemeMode,
  ThemeColor,
  AppFontFamily,
  AppFontSize,
  RubySizeRatio,
  RubyColorChoice,
  LineHeightChoice,
  BubbleDensity,
  SubtitleSeparatorType,
  PersonaPreset,
} from '../../types';
import { RubyText } from '../Chat/RubyText';
import { ImageCropperModal } from './ImageCropperModal';
import { getNameInitial } from '../../utils/nameRubyHelper';
import { useBackButton } from '../../utils/backButtonManager';
import {
  X,
  Key,
  Zap,
  Check,
  Volume2,
  ShieldCheck,
  Palette,
  Sun,
  Sliders,
  Type,
  User,
  Sparkles,
  Eye,
  EyeOff,
  Upload,
  Download,
  Bookmark,
  Trash2,
  Camera,
  RefreshCw,
  Plus,
  FileUp,
  FileDown,
  Smile,
  HelpCircle,
  Crop,
  History,
  Database,
  HardDriveDownload,
  HardDriveUpload,
  CheckCircle2,
  AlertTriangle,
  CheckCheck,
  Search,
  MessageSquare,
  Edit2,
} from 'lucide-react';
import { ShioriBackupData } from '../../types';
import { speechService } from '../../services/speechService';
import { formatSubtitleWithTopics, getSeparatorString } from '../../utils/subtitleHelper';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ApiSettings;
  onSave: (newSettings: ApiSettings) => void;
  personaPresets?: PersonaPreset[];
  onSavePreset?: (preset: Omit<PersonaPreset, 'id' | 'createdAt'>) => PersonaPreset;
  onApplyPreset?: (presetId: string) => void;
  onDeletePreset?: (presetId: string) => void;
  onExportPresets?: () => string;
  onImportPresets?: (jsonStr: string) => { success: boolean; count: number; error?: string };
  // Backup & Multi-device Sync Props
  learnedWordsCount?: number;
  learnedGrammarCount?: number;
  sessionsCount?: number;
  onExportAllData?: (includeApiKey: boolean) => string;
  onInspectBackup?: (jsonStr: string) => { success: boolean; data?: ShioriBackupData; error?: string };
  onImportAllData?: (
    jsonStr: string,
    mode: 'merge' | 'overwrite'
  ) => { success: boolean; stats?: any; error?: string };
  onResetAllData?: () => void;
}

const PROVIDER_PRESETS: Record<
  ApiProvider,
  { name: string; baseUrl: string; defaultModel: string; tip: string }
> = {
  gemini: {
    name: 'Google Gemini (谷歌官方大模型)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.6-flash',
    tip: '谷歌 Gemini 官方高速接口，日语理解极佳（已内置本地代理通道）',
  },
  deepseek: {
    name: 'DeepSeek (深度求索 · 极具性价比推荐)',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    tip: '极低成本，输出质量高，支持标准 OpenAI 协议',
  },
  openai: {
    name: 'OpenAI (GPT-4o / GPT-4o-mini)',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    tip: '官方原版，支持 gpt-4o 与 gpt-4o-mini',
  },
  qwen: {
    name: '通义千问 (Qwen / 阿里百炼)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    tip: '国内直连，响应极快，中文理解出色',
  },
  kimi: {
    name: '月之暗面 (Moonshot Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    tip: '国内直连，支持长上下文与知识库',
  },
  siliconflow: {
    name: '硅基流动 (SiliconFlow)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    tip: '高并发低延迟模型分发平台',
  },
  groq: {
    name: 'Groq (极速推理引擎)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    tip: '超高极速生成与实时响应',
  },
  ollama: {
    name: 'Ollama (本地离线大模型)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
    tip: '无需 API Key，完全在自己电脑本地运行，隐私零泄露',
  },
  custom: {
    name: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    defaultModel: '',
    tip: '支持任何遵循 /chat/completions 规范的转发或私有部署地址',
  },
};

const THEME_MODE_OPTIONS: Array<{ id: ThemeMode; name: string; icon: string }> = [
  { id: 'system', name: '跟随系统', icon: '🌗' },
  { id: 'light', name: '浅色模式', icon: '☀️' },
  { id: 'dark', name: '深色模式', icon: '🌙' },
];

const THEME_OPTIONS: Array<{ id: ThemeColor; name: string; color: string }> = [
  { id: 'sakura', name: '绯樱', color: '#e11d48' },
  { id: 'indigo', name: '琉璃', color: '#4f46e5' },
  { id: 'matcha', name: '青竹', color: '#059669' },
  { id: 'amber', name: '琥珀', color: '#d97706' },
  { id: 'violet', name: '桔梗', color: '#7c3aed' },
  { id: 'slate', name: '玄墨', color: '#334155' },
];

const FONT_OPTIONS: Array<{ id: AppFontFamily; name: string; sample: string }> = [
  { id: 'noto-sans', name: '思源黑体 (Noto Sans JP)', sample: '明瞭でモダンな標準ゴシック体' },
  { id: 'custom', name: '自定义字体 (Custom)', sample: 'システム内蔵や好みのカスタムフォント' },
];

const SYSTEM_FONT_PRESETS: Array<{ group: string; fonts: Array<{ name: string; desc: string }> }> = [
  {
    group: '🖥️ Windows 系统原生字体',
    fonts: [
      { name: 'Yu Gothic UI', desc: '游黑体 UI (Win 10/11 默认标准日文黑体)' },
      { name: 'Yu Gothic', desc: '游黑体 (Windows 原生无衬线黑体)' },
      { name: 'Meiryo', desc: '明瞭体 (Windows 经典高辨识度黑体)' },
      { name: 'Yu Mincho', desc: '游明朝 (Windows 官方典雅明朝体)' },
      { name: 'BIZ UDGothic', desc: 'BIZ UD黑体 (Windows 内置通用设计字体)' },
      { name: 'BIZ UDMincho', desc: 'BIZ UD明朝 (Windows 内置通用设计明朝体)' },
      { name: 'MS Gothic', desc: 'MS 哥特体 (Windows 传统日文黑体)' },
      { name: 'MS Mincho', desc: 'MS 明朝体 (Windows 传统日文明朝体)' },
    ],
  },
  {
    group: '🍎 macOS / iOS 苹果原生字体',
    fonts: [
      { name: 'Hiragino Sans', desc: '冬青黑体 (macOS 官方首席日文字体)' },
      { name: 'Hiragino Kaku Gothic ProN', desc: '冬青角黑体 (经典 Mac 日文黑体)' },
      { name: 'Hiragino Mincho ProN', desc: '冬青明朝体 (Mac 高雅日文明朝体)' },
      { name: 'Hiragino Maru Gothic ProN', desc: '冬青圆体 (Mac 原生日文圆体)' },
      { name: 'Toppan Bunkyu Mincho', desc: '凸版文九明朝 (Mac 内置出版级明朝)' },
    ],
  },
  {
    group: '🌸 流行手写 / 开源日语字体',
    fonts: [
      { name: 'Klee One', desc: 'Klee One (优雅日文手写楷书体)' },
      { name: 'LXGW WenKai', desc: '霞鹜文楷 (温润中日兼修楷体)' },
      { name: 'Zen Maru Gothic', desc: 'Zen Maru Gothic (柔和圆体)' },
      { name: 'Sawarabi Mincho', desc: 'Sawarabi Mincho (蕨明朝体)' },
      { name: 'M PLUS Rounded 1c', desc: 'M PLUS (圆润现代黑体)' },
    ],
  },
];

const PERSONA_PRESETS = [
  { title: '🌸 知性学姐 (薫子)', text: '亲切知性的日语系学姐薫子，讲解生动细腻，音调纯正，善用温柔鼓励的语气辅导学习' },
  { title: '📚 严谨学者', text: '严谨细致的日本语教授，注重语法细节、音调纯正与词源解析' },
  { title: '🍵 幽默好友', text: '随和有趣的日本年轻朋友，交流日常流行语与真实口语表达' },
  { title: '⚡ 元气同好', text: '热爱动漫与日本文化的同好，活力满满，结合ACG文化趣味讲解' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  personaPresets = [],
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onExportPresets,
  onImportPresets,
  learnedWordsCount = 0,
  learnedGrammarCount = 0,
  sessionsCount = 0,
  onExportAllData,
  onInspectBackup,
  onImportAllData,
  onResetAllData,
}) => {
  const [activeTab, setActiveTab] = useState<'persona' | 'appearance' | 'model' | 'preferences' | 'backup'>('persona');
  const [formData, setFormData] = useState<ApiSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [presetToast, setPresetToast] = useState('');
  const [syncToast, setSyncToast] = useState('');

  // Local fonts scanning state
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [isScanningFonts, setIsScanningFonts] = useState(false);
  const [scanFontNotice, setScanFontNotice] = useState<string>('');

  const handleScanLocalFonts = async () => {
    if (!('queryLocalFonts' in window)) {
      setScanFontNotice('您的浏览器暂未开放直接读取本机字体的权限 API（推荐使用 Edge 或 Chrome）。您可直接在下方下拉菜单中选择常见系统字体，或手动输入。');
      return;
    }
    try {
      setIsScanningFonts(true);
      setScanFontNotice('');
      // @ts-ignore
      const availableFonts = await (window as any).queryLocalFonts();
      const familiesSet = new Set<string>();
      for (const f of availableFonts) {
        if (f.family && typeof f.family === 'string') {
          familiesSet.add(f.family);
        }
      }
      const sorted = Array.from(familiesSet).sort((a, b) => a.localeCompare(b));
      setLocalFonts(sorted);
      if (sorted.length > 0) {
        setScanFontNotice(`成功读取到本机已安装的 ${sorted.length} 种字体，已加入下方快捷选择列表！`);
      } else {
        setScanFontNotice('未能读取到系统字体，请确认是否已允许权限。');
      }
    } catch (err: any) {
      console.warn('Scan local fonts cancelled or failed:', err);
      setScanFontNotice(err?.message?.includes('denied') ? '已取消授权读取本机字体。您仍可从下方预置列表中挑选或手动输入。' : '读取本机字体失败或已取消。');
    } finally {
      setIsScanningFonts(false);
    }
  };

  // Backup & sync state
  const [includeApiKeyInExport, setIncludeApiKeyInExport] = useState(true);
  const [pendingBackup, setPendingBackup] = useState<{
    rawJson: string;
    inspection: ShioriBackupData;
  } | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');

  // Save as preset dialog state
  const [showSavePresetBox, setShowSavePresetBox] = useState(false);
  const [newPresetTitle, setNewPresetTitle] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');

  // Image cropper state
  const [cropperState, setCropperState] = useState<{
    isOpen: boolean;
    target: 'ai' | 'user';
    imageSrc: string;
    title: string;
  }>({
    isOpen: false,
    target: 'ai',
    imageSrc: '',
    title: '',
  });

  // File input refs
  const aiAvatarFileRef = useRef<HTMLInputElement | null>(null);
  const userAvatarFileRef = useRef<HTMLInputElement | null>(null);
  const presetImportFileRef = useRef<HTMLInputElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  // 内部子弹窗返回拦截（优先级 80）：优先收起头像裁剪窗口
  useBackButton(
    'settings-cropper-modal',
    cropperState.isOpen,
    () => {
      setCropperState((prev) => ({ ...prev, isOpen: false }));
    },
    80
  );

  // 内部预设保存框（优先级 70）：收起预设保存浮层
  useBackButton(
    'settings-preset-box',
    showSavePresetBox,
    () => {
      setShowSavePresetBox(false);
    },
    70
  );

  // 内部数据恢复确认框（优先级 70）：收起备份确认浮层
  useBackButton(
    'settings-backup-confirm',
    !!pendingBackup,
    () => {
      setPendingBackup(null);
    },
    70
  );

  if (!isOpen) return null;

  const handleExportBackup = () => {
    if (!onExportAllData) return;
    const jsonStr = onExportAllData(includeApiKeyInExport);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `shiori_backup_${nowStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSyncToast('🎉 全量学情备份已生成并开始下载！');
    setTimeout(() => setSyncToast(''), 3500);
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text && onInspectBackup) {
        const inspected = onInspectBackup(text);
        if (inspected.success && inspected.data) {
          setPendingBackup({ rawJson: text, inspection: inspected.data });
        } else {
          alert(inspected.error || '备份文件格式无法识别，请确认文件正确');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = () => {
    if (!pendingBackup || !onImportAllData) return;
    const res = onImportAllData(pendingBackup.rawJson, importMode);
    if (res.success) {
      const modeText = importMode === 'merge' ? '增量合并' : '全量覆盖';
      const stats = res.stats;
      const detailMsg = stats
        ? `（生词 +${stats.wordsAdded || 0}，语法 +${stats.grammarAdded || 0}，对话 +${stats.sessionsAdded || 0}）`
        : '';
      setSyncToast(`✅ 数据已通过「${modeText}」成功恢复！${detailMsg}`);
      setPendingBackup(null);
      setTimeout(() => {
        setSyncToast('');
      }, 4500);
    } else {
      alert(res.error || '导入恢复失败');
    }
  };

  const handleResetConfirm = () => {
    if (
      window.confirm(
        '⚠️ 确定要清空所有本地学习数据吗？此操作将清除当前浏览器的生词本、会话记录和语法进度，恢复至初始出厂状态。'
      )
    ) {
      if (onResetAllData) {
        onResetAllData();
        setSyncToast('🔄 已成功重置为初始出厂数据！');
        setTimeout(() => {
          setSyncToast('');
          onClose();
        }, 1500);
      }
    }
  };

  const handleProviderChange = (provider: ApiProvider) => {
    const preset = PROVIDER_PRESETS[provider];
    setFormData((prev) => ({
      ...prev,
      provider,
      baseUrl: preset.baseUrl || prev.baseUrl,
      model: preset.defaultModel || prev.model,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 800);
  };

  const handleFileSelect = (file: File, target: 'ai' | 'user') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setCropperState({
          isOpen: true,
          target,
          imageSrc: dataUrl,
          title: target === 'ai' ? '裁剪 AI 私教圆形头像' : '裁剪用户圆形头像',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirmed = (croppedBase64: string) => {
    const avatarKey = cropperState.target === 'ai' ? 'aiAvatar' : 'userAvatar';
    setFormData((prev) => {
      const updated = {
        ...prev,
        [avatarKey]: croppedBase64,
      };
      // Immediately apply and persist to app store
      onSave(updated);
      return updated;
    });
    setPresetToast(`✅ ${cropperState.target === 'ai' ? '私教' : '用户'}圆形头像已裁剪并即刻应用生效！`);
    setTimeout(() => setPresetToast(''), 3000);
  };

  const handleApplyPreset = (preset: PersonaPreset) => {
    const aiFirstPersonJp = preset.aiFirstPersonJp?.trim() || preset.aiFirstPerson?.trim() || '私';
    const aiFirstPersonCn = preset.aiFirstPersonCn?.trim() || '我';
    const userCallNameJp = preset.userCallNameJp?.trim() || preset.userCallName?.trim() || '{userName}さん';
    const userCallNameCn = preset.userCallNameCn?.trim() || '{userName}';

    setFormData((prev) => ({
      ...prev,
      aiTutorName: preset.aiTutorName,
      userName: preset.userName !== undefined ? preset.userName : prev.userName,
      aiPersona: preset.aiPersona,
      aiFirstPerson: preset.aiFirstPerson || aiFirstPersonJp,
      aiFirstPersonJp,
      aiFirstPersonCn,
      userCallName: preset.userCallName || userCallNameJp,
      userCallNameJp,
      userCallNameCn,
      aiNameReading: preset.aiNameReading || 'しおり',
      userNameReading: preset.userNameReading || '',
      aiAvatar: preset.aiAvatar !== undefined ? preset.aiAvatar : prev.aiAvatar,
      userAvatar: preset.userAvatar !== undefined ? preset.userAvatar : prev.userAvatar,
    }));
    if (onApplyPreset) {
      onApplyPreset(preset.id);
    }
    setPresetToast(`已载入预设：「${preset.title}」`);
    setTimeout(() => setPresetToast(''), 2500);
  };

  const handleSaveCurrentAsPreset = () => {
    if (!newPresetTitle.trim()) {
      alert('请填写预设名称');
      return;
    }
    const aiFirstPersonJp = formData.aiFirstPersonJp?.trim() || formData.aiFirstPerson?.trim() || '私';
    const aiFirstPersonCn = formData.aiFirstPersonCn?.trim() || '我';
    const userCallNameJp = formData.userCallNameJp?.trim() || formData.userCallName?.trim() || '{userName}さん';
    const userCallNameCn = formData.userCallNameCn?.trim() || '{userName}';

    if (onSavePreset) {
      onSavePreset({
        title: newPresetTitle.trim(),
        description: newPresetDesc.trim() || '自定义私教个性化预设',
        aiTutorName: formData.aiTutorName || 'Shiori AI',
        userName: formData.userName || '学习者',
        aiPersona: formData.aiPersona || '温柔耐心的日语音声私教老师',
        aiFirstPerson: formData.aiFirstPerson || aiFirstPersonJp,
        aiFirstPersonJp,
        aiFirstPersonCn,
        userCallName: formData.userCallName || userCallNameJp,
        userCallNameJp,
        userCallNameCn,
        aiNameReading: formData.aiNameReading || 'しおり',
        userNameReading: formData.userNameReading || '',
        aiAvatar: formData.aiAvatar || '',
        userAvatar: formData.userAvatar || '',
      });
      setShowSavePresetBox(false);
      setNewPresetTitle('');
      setNewPresetDesc('');
      setPresetToast(`🎉 预设「${newPresetTitle.trim()}」保存成功！`);
      setTimeout(() => setPresetToast(''), 3000);
    }
  };

  const handleExportPresets = () => {
    const jsonStr = onExportPresets ? onExportPresets() : JSON.stringify(personaPresets, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shiori_persona_presets_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setPresetToast('📤 预设配置已成功导出为 JSON 文件！');
    setTimeout(() => setPresetToast(''), 3000);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text && onImportPresets) {
        const res = onImportPresets(text);
        if (res.success) {
          setPresetToast(`📥 成功导入 ${res.count} 个预设！`);
        } else {
          alert(res.error || '导入失败，请确认文件是否为合法 JSON 数组');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
    setTimeout(() => setPresetToast(''), 3500);
  };

  const handleTestTTS = () => {
    speechService.speak('こんにちは！これは発音テストです。一緒に勉強しましょう！', formData.ttsRate);
  };

  const previewRubyColor = (() => {
    const choice = formData.rubyColor || 'theme';
    if (choice === 'theme') {
      const themeHexMap: Record<string, string> = {
        sakura: '#e11d48',
        indigo: '#4f46e5',
        matcha: '#059669',
        amber: '#d97706',
        slate: '#475569',
        violet: '#7c3aed',
      };
      return themeHexMap[formData.themeColor || 'sakura'] || '#e11d48';
    }
    if (choice === 'custom') {
      return formData.rubyCustomColor || '#e11d48';
    }
    const colorMap: Record<string, string> = {
      slate: '#475569',
      crimson: '#e11d48',
      indigo: '#4f46e5',
      emerald: '#059669',
      violet: '#7c3aed',
      amber: '#d97706',
    };
    return colorMap[choice] || '#e11d48';
  })();

  const previewRubyRatio = (() => {
    if (formData.rubySize === 'custom' && formData.rubyCustomSize) {
      return `${formData.rubyCustomSize}%`;
    }
    const ratioMap: Record<string, string> = {
      xs: '48%',
      small: '54%',
      default: '62%',
      large: '72%',
      xl: '84%',
    };
    return ratioMap[formData.rubySize || 'default'] || '62%';
  })();

  const previewLineHeight = (() => {
    switch (formData.lineHeight) {
      case 'tight':
        return 1.4;
      case 'compact':
        return 1.6;
      case 'relaxed':
        return 2.1;
      case 'custom':
        return formData.customLineHeight || 1.6;
      case 'normal':
      default:
        return 1.8;
    }
  })();

  const previewFontSize = (() => {
    switch (formData.fontSize) {
      case 'sm':
        return '14px';
      case 'lg':
        return '18px';
      case 'xl':
        return '20px';
      case 'md':
      default:
        return '16px';
    }
  })();

  const previewBubblePadding = (() => {
    switch (formData.bubbleDensity) {
      case 'compact':
        return '10px 14px';
      case 'spacious':
        return '18px 24px';
      case 'normal':
      default:
        return '14px 20px';
    }
  })();

  const previewFontFamily = (() => {
    if (formData.fontFamily === 'custom' && formData.customFontFamily?.trim()) {
      return formData.customFontFamily.trim();
    }
    const map: Record<string, string> = {
      'noto-serif': "var(--font-serif, 'Noto Serif JP', serif)",
      'zen-maru': "var(--font-maru, 'Zen Maru Gothic', sans-serif)",
      system: "var(--font-system, -apple-system, BlinkMacSystemFont, sans-serif)",
    };
    return map[formData.fontFamily || 'noto-sans'] || "var(--font-japanese, 'Noto Sans JP', sans-serif)";
  })();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-customization-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Sliders className="text-primary" size={20} />
            <h2>系统设置与个性化定制</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="settings-tabs-nav">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'persona' ? 'active' : ''}`}
            onClick={() => setActiveTab('persona')}
          >
            <User size={16} />
            <span className="tab-text-full">私教与人设定制</span>
            <span className="tab-text-short">人设定制</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Palette size={16} />
            <span className="tab-text-full">界面排版与外观</span>
            <span className="tab-text-short">排版外观</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'model' ? 'active' : ''}`}
            onClick={() => setActiveTab('model')}
          >
            <Key size={16} />
            <span className="tab-text-full">AI 大模型接口</span>
            <span className="tab-text-short">模型接口</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'preferences' ? 'active' : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            <Volume2 size={16} />
            <span className="tab-text-full">朗读与辅助功能</span>
            <span className="tab-text-short">朗读辅助</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            <Database size={16} />
            <span className="tab-text-full">数据备份与恢复</span>
            <span className="tab-text-short">数据备份</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form-wrapper">
          <div className="modal-body settings-form-scrollable">
          {/* ================= TAB 0: PERSONA & TUTOR PROFILE ================= */}
          {activeTab === 'persona' && (
            <div className="settings-section-container">
              {/* ================= SECTION: NAMES & PERSONA & PRESETS ================= */}
              <div className="custom-setting-group persona-custom-group">
                <div className="group-heading-between">
                  <div className="group-heading-left">
                    <User size={18} className="heading-icon" />
                    <span className="heading-text">角色名称与私教人设定制</span>
                  </div>
                  <div className="preset-action-bar">
                    <button
                      type="button"
                      className="preset-header-btn btn-save-preset"
                      onClick={() => setShowSavePresetBox(!showSavePresetBox)}
                      title="将当前表单各项设定保存为一套独立的自定义预设"
                    >
                      <Bookmark size={14} />
                      <span>存为新预设</span>
                    </button>
                    <button
                      type="button"
                      className="preset-header-btn"
                      onClick={handleExportPresets}
                      title="导出当前所有预设为 JSON 文件"
                    >
                      <Download size={14} />
                      <span>导出预设</span>
                    </button>
                    <button
                      type="button"
                      className="preset-header-btn"
                      onClick={() => presetImportFileRef.current?.click()}
                      title="从本地 JSON 文件导入预设"
                    >
                      <Upload size={14} />
                      <span>导入预设</span>
                    </button>
                    <input
                      ref={presetImportFileRef}
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={handleImportFileChange}
                    />
                  </div>
                </div>

                {/* Toast feedback banner */}
                {presetToast && (
                  <div className="preset-toast-banner">
                    <span>{presetToast}</span>
                  </div>
                )}

                {/* Save As Preset Dropdown Box */}
                {showSavePresetBox && (
                  <div className="save-preset-card-box">
                    <div className="save-preset-title">
                      <Bookmark size={15} />
                      <span>保存当前设定为自定义预设</span>
                    </div>
                    <div className="save-preset-inputs-row">
                      <input
                        type="text"
                        className="form-input preset-title-input"
                        placeholder="输入预设标题（例如：元气同桌小樱、严厉考级教练）"
                        value={newPresetTitle}
                        onChange={(e) => setNewPresetTitle(e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-input preset-desc-input"
                        placeholder="简要描述（可选，例如：活力满满ACG日常对话）"
                        value={newPresetDesc}
                        onChange={(e) => setNewPresetDesc(e.target.value)}
                      />
                      <div className="save-preset-btns">
                        <button
                          type="button"
                          className="btn-save-confirm"
                          onClick={handleSaveCurrentAsPreset}
                        >
                          确认保存
                        </button>
                        <button
                          type="button"
                          className="btn-save-cancel"
                          onClick={() => setShowSavePresetBox(false)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preset Selector Grid */}
                {personaPresets && personaPresets.length > 0 && (
                  <div className="preset-selector-panel">
                    <div className="preset-panel-header">
                      <span className="preset-panel-label">⭐ 预设库（点击一键载入人设与头像）：</span>
                    </div>
                    <div className="preset-cards-scrollable">
                      {personaPresets.map((p) => {
                        const isCurrentActive =
                          formData.aiTutorName === p.aiTutorName &&
                          formData.aiPersona === p.aiPersona;
                        return (
                          <div
                            key={p.id}
                            className={`persona-preset-chip-card ${isCurrentActive ? 'active' : ''}`}
                            onClick={() => handleApplyPreset(p)}
                          >
                            <div className="preset-card-top">
                              {p.aiAvatar ? (
                                <img src={p.aiAvatar} alt="" className="preset-avatar-mini" />
                              ) : (
                                <span className="preset-avatar-placeholder">
                                  {p.aiTutorName.slice(0, 1)}
                                </span>
                              )}
                              <span className="preset-card-title">{p.title}</span>
                              {onDeletePreset && !p.id.startsWith('preset-default-') && (
                                <button
                                  type="button"
                                  className="preset-delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`确定删除自定义预设「${p.title}」吗？`)) {
                                      onDeletePreset(p.id);
                                    }
                                  }}
                                  title="删除此自定义预设"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                            {p.description && (
                              <div className="preset-card-desc">{p.description}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Fallback & Clear Tip Banner */}
                <div className="fallback-info-alert">
                  <HelpCircle size={15} className="alert-icon" />
                  <span>
                    <strong>智能默认回退机制</strong>：本区域自定义人设与头像可随时<strong>置空</strong>。置空后系统将自动采用最佳官方默认教学人设与默认头像。
                  </span>
                </div>

                {/* Circular Avatar Customization Area (With Social App Style Cropper) */}
                <div className="avatars-customize-row">
                  {/* AI Tutor Avatar */}
                  <div className="avatar-config-card">
                    <div className="avatar-card-title">
                      <span>私教圆形头像</span>
                      <span className="sub-tag">支持自由裁剪 / 置空默认</span>
                    </div>
                    <div className="avatar-preview-action-row">
                      <div className="avatar-preview-circle ai-circle">
                        {formData.aiAvatar ? (
                          <img
                            src={formData.aiAvatar}
                            alt="AI 头像"
                            className="avatar-circle-img"
                          />
                        ) : (
                          <span className="avatar-default-letter">
                            {getNameInitial(formData.aiTutorName, '日')}
                          </span>
                        )}
                      </div>
                      <div className="avatar-action-controls">
                        <div className="avatar-buttons-group">
                          <button
                            type="button"
                            className="avatar-action-btn btn-upload-avatar"
                            onClick={() => aiAvatarFileRef.current?.click()}
                          >
                            <Crop size={13} />
                            <span>上传并裁剪图片</span>
                          </button>
                          {formData.aiAvatar && (
                            <button
                              type="button"
                              className="avatar-action-btn btn-reset-avatar"
                              onClick={() => setFormData({ ...formData, aiAvatar: '' })}
                              title="置空头像，恢复默认文字徽章"
                            >
                              <RefreshCw size={13} />
                              <span>恢复默认</span>
                            </button>
                          )}
                        </div>
                        <input
                          ref={aiAvatarFileRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileSelect(file, 'ai');
                            e.target.value = '';
                          }}
                        />
                        <input
                          type="text"
                          className="form-input avatar-url-input"
                          placeholder="或直接粘贴图片 URL 地址..."
                          value={formData.aiAvatar || ''}
                          onChange={(e) => setFormData({ ...formData, aiAvatar: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* User Avatar */}
                  <div className="avatar-config-card">
                    <div className="avatar-card-title">
                      <span>你的圆形头像</span>
                      <span className="sub-tag">支持自由裁剪 / 置空默认</span>
                    </div>
                    <div className="avatar-preview-action-row">
                      <div className="avatar-preview-circle user-circle">
                        {formData.userAvatar ? (
                          <img
                            src={formData.userAvatar}
                            alt="用户头像"
                            className="avatar-circle-img"
                          />
                        ) : (
                          <span className="avatar-default-letter">
                            {getNameInitial(formData.userName, '我')}
                          </span>
                        )}
                      </div>
                      <div className="avatar-action-controls">
                        <div className="avatar-buttons-group">
                          <button
                            type="button"
                            className="avatar-action-btn btn-upload-avatar"
                            onClick={() => userAvatarFileRef.current?.click()}
                          >
                            <Crop size={13} />
                            <span>上传并裁剪图片</span>
                          </button>
                          {formData.userAvatar && (
                            <button
                              type="button"
                              className="avatar-action-btn btn-reset-avatar"
                              onClick={() => setFormData({ ...formData, userAvatar: '' })}
                              title="置空头像，恢复默认文字徽章"
                            >
                              <RefreshCw size={13} />
                              <span>恢复默认</span>
                            </button>
                          )}
                        </div>
                        <input
                          ref={userAvatarFileRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileSelect(file, 'user');
                            e.target.value = '';
                          }}
                        />
                        <input
                          type="text"
                          className="form-input avatar-url-input"
                          placeholder="或直接粘贴图片 URL 地址..."
                          value={formData.userAvatar || ''}
                          onChange={(e) => setFormData({ ...formData, userAvatar: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simplified Display Names Grid with Pronunciation / Ruby Support */}
                <div className="grid-two-inputs" style={{ marginTop: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">
                      <span>私教名字</span>
                      <span className="label-subtip">（支持注音如 {'{薫子[かおるこ]}'}）</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.aiTutorName || ''}
                      placeholder="例如：{薫子[かおるこ]} 或 Shiori AI"
                      onChange={(e) => setFormData({ ...formData, aiTutorName: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      <span>用户名字</span>
                      <span className="label-subtip">（支持注音如 {'{高咲[たかさき]}{侑[ゆう]}'}）</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.userName || ''}
                      placeholder="例如：{高咲[たかさき]}{侑[ゆう]} 或 学习者"
                      onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                    />
                  </div>
                </div>

                {/* Persona Style & Description */}
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.96rem', fontWeight: 'normal', color: 'var(--text-primary)' }}>
                      🎭 私教人设性格与教学风格定位
                    </span>
                    <span className="label-subtip" style={{ color: 'var(--primary)', fontWeight: 'normal', fontSize: '0.82rem' }}>
                      （置空默认：亲切温柔的AI日语私教）
                    </span>
                  </label>
                  <div className="persona-chips-row" style={{ marginBottom: '10px' }}>
                    {PERSONA_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="persona-chip-btn"
                        onClick={() => setFormData({ ...formData, aiPersona: p.text })}
                      >
                        {p.title}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={7}
                    className="form-textarea"
                    style={{
                      minHeight: '180px',
                      fontSize: '0.94rem',
                      lineHeight: '1.65',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      resize: 'vertical',
                    }}
                    value={formData.aiPersona || ''}
                    placeholder="在此自由定制私教的人设性格、教学风格、互动语气或特殊口吻（支持使用 {原文[读音]} 标注特定称呼或角色读音）..."
                    onChange={(e) => setFormData({ ...formData, aiPersona: e.target.value })}
                  />
                  <span className="form-tip" style={{ marginTop: '8px', display: 'block', color: 'var(--text-muted)' }}>
                    💡 提示：支持在双方名字或人设中使用 {'{原文[读音]}'}（如 {'{高咲[たかさき]}{侑[ゆう]}'}）附带注音，系统将在对话中提到双方姓名时精准显示对应假名注音。
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 1: APPEARANCE & TYPOGRAPHY ================= */}
          {activeTab === 'appearance' && (
            <div className="settings-section-container">
              {/* Section: Theme Mode (深浅模式 / 跟随系统) */}
              <div className="custom-setting-group">
                <div className="group-heading">
                  <Sun size={17} className="heading-icon" />
                  <span className="heading-text">外观深浅模式</span>
                </div>
                <div className="theme-mode-grid">
                  {THEME_MODE_OPTIONS.map((m) => {
                    const isSelected = (formData.themeMode || 'system') === m.id;
                    return (
                      <button
                        type="button"
                        key={m.id}
                        className={`theme-mode-card ${isSelected ? 'active' : ''}`}
                        onClick={() => setFormData({ ...formData, themeMode: m.id })}
                      >
                        <span className="theme-mode-emoji">{m.icon}</span>
                        <span className="theme-mode-title">{m.name}</span>
                        {isSelected && <Check size={14} className="theme-check-icon" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section: Theme Color */}
              <div className="custom-setting-group">
                <div className="group-heading">
                  <Palette size={17} className="heading-icon" />
                  <span className="heading-text">和风主题色系</span>
                </div>
                <div className="theme-palette-grid">
                  {THEME_OPTIONS.map((t) => {
                    const isSelected = formData.themeColor === t.id;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        className={`theme-card-option ${isSelected ? 'active' : ''}`}
                        onClick={() => setFormData({ ...formData, themeColor: t.id })}
                      >
                        <span className="theme-color-dot" style={{ backgroundColor: t.color }} />
                        <span className="theme-name">{t.name}</span>
                        {isSelected && (
                          <Check size={14} className="theme-check-icon" style={{ color: t.color }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section: Japanese Typography & Font Family */}
              <div className="custom-setting-group">
                <div className="group-heading">
                  <Type size={17} className="heading-icon" />
                  <span className="heading-text">日文字体与排版字号</span>
                </div>

                <div className="form-group">
                  <label className="form-label">首选日语字体风格：</label>
                  <div className="font-options-grid">
                    {FONT_OPTIONS.map((f) => (
                      <div
                        key={f.id}
                        className={`font-card-option ${formData.fontFamily === f.id ? 'active' : ''}`}
                        onClick={() => setFormData({ ...formData, fontFamily: f.id })}
                      >
                        <div className="font-option-title">{f.name}</div>
                        <div
                          className="font-option-sample"
                          data-preview-font={f.id}
                          style={
                            f.id === 'custom' && formData.customFontFamily?.trim()
                              ? { fontFamily: `${formData.customFontFamily.trim()}, sans-serif` }
                              : undefined
                          }
                        >
                          {f.id === 'custom' && formData.customFontFamily?.trim()
                            ? `预览：美しい日本語 (${formData.customFontFamily.trim().split(',')[0].replace(/['"]/g, '')})`
                            : f.sample}
                        </div>
                      </div>
                    ))}
                  </div>

                  {formData.fontFamily === 'custom' && (
                    <div className="custom-font-input-container">
                      <div className="custom-font-field-label">
                        <span>选择或输入系统中的字体（优先使用本地免流免等待）：</span>
                      </div>

                      {/* 1. 便捷系统字体下拉选择器 & 扫描本机按钮 */}
                      <div className="system-font-selector-row">
                        <select
                          className="form-select system-font-dropdown"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setFormData({ ...formData, customFontFamily: `"${e.target.value}"` });
                            }
                          }}
                        >
                          <option value="">
                            {localFonts.length > 0
                              ? `—— 已读取本电脑 ${localFonts.length} 种字体，点击展开挑选 ——`
                              : '—— ⚡ 从系统常见预置字体中快速选择 ——'}
                          </option>

                          {/* 若已扫描出本机全部字体，展示在最顶部 */}
                          {localFonts.length > 0 && (
                            <optgroup label={`💻 本机已安装的所有字体 (${localFonts.length})`}>
                              {localFonts.map((fontName) => (
                                <option key={fontName} value={fontName}>
                                  {fontName}
                                </option>
                              ))}
                            </optgroup>
                          )}

                          {/* 系统常见预设分组 */}
                          {SYSTEM_FONT_PRESETS.map((group) => (
                            <optgroup key={group.group} label={group.group}>
                              {group.fonts.map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.name} — {f.desc}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="scan-local-fonts-btn"
                          onClick={handleScanLocalFonts}
                          disabled={isScanningFonts}
                          title="自动枚举本电脑（Windows/Mac）已安装的全部字体列表"
                        >
                          <Search size={14} />
                          <span>{isScanningFonts ? '正在扫描...' : '扫描本电脑字体'}</span>
                        </button>
                      </div>

                      {scanFontNotice && (
                        <div className="scan-font-notice">
                          💡 {scanFontNotice}
                        </div>
                      )}

                      {/* 2. 手动输入与微调 */}
                      <div className="custom-font-manual-row">
                        <label className="sub-label">当前选定字体名称（可手动修改）：</label>
                        <input
                          type="text"
                          className="form-input custom-font-input"
                          placeholder='例如: "Yu Gothic UI", "Klee One", Meiryo'
                          value={formData.customFontFamily || ''}
                          onChange={(e) => setFormData({ ...formData, customFontFamily: e.target.value })}
                        />
                      </div>

                      {/* 3. 实时渲染效果卡片 */}
                      <div
                        className="custom-font-preview-card"
                        style={{
                          fontFamily: formData.customFontFamily?.trim()
                            ? `${formData.customFontFamily.trim()}, sans-serif`
                            : undefined,
                        }}
                      >
                        <div className="preview-heading">
                          实时渲染预览：
                          {formData.customFontFamily?.trim() && (
                            <span className="preview-active-font">（使用 {formData.customFontFamily.trim()}）</span>
                          )}
                        </div>
                        <div className="preview-text-jp">春はあけぼの。ようこそ栞の日本語教室へ。</div>
                        <div className="preview-text-sub">あいうえお・アイウエオ・日本語漢字・0123456789・ABCabc</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bubble Font Size */}
                <div className="form-group">
                  <label className="form-label">对话正文字号：</label>
                  <div className="density-buttons-row">
                    {[
                      { id: 'sm', label: '小号 (14px)' },
                      { id: 'md', label: '标准 (16px)' },
                      { id: 'lg', label: '偏大 (18px)' },
                      { id: 'xl', label: '超大 (20px)' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`density-pill-btn ${(formData.fontSize || 'md') === item.id ? 'active' : ''}`}
                        onClick={() => setFormData({ ...formData, fontSize: item.id as AppFontSize })}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>



                {/* Line Height Control */}
                <div className="form-group">
                  <div className="label-with-val">
                    <label className="form-label">正文行距调节（支持更小紧凑行距·智能防假名重叠）：</label>
                    <span className="size-percent-badge">{previewLineHeight}x</span>
                  </div>
                  <div className="density-buttons-row">
                    {[
                      { id: 'tight', label: '极紧凑 (1.4x)' },
                      { id: 'compact', label: '紧凑 (1.6x)' },
                      { id: 'normal', label: '适中 (1.8x)' },
                      { id: 'relaxed', label: '宽松 (2.1x)' },
                      { id: 'custom', label: '自定义微调' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`density-pill-btn ${(formData.lineHeight || 'normal') === item.id ? 'active' : ''}`}
                        onClick={() =>
                          setFormData({
                            ...formData,
                            lineHeight: item.id as LineHeightChoice,
                          })
                        }
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {formData.lineHeight === 'custom' && (
                    <div className="ruby-size-slider-row" style={{ marginTop: '8px' }}>
                      <input
                        type="range"
                        min={1.2}
                        max={2.4}
                        step={0.05}
                        value={formData.customLineHeight || 1.6}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            lineHeight: 'custom',
                            customLineHeight: parseFloat(e.target.value),
                          })
                        }
                        className="ruby-range-slider"
                      />
                      <span className="slider-val-tag">{(formData.customLineHeight || 1.6).toFixed(2)}x</span>
                    </div>
                  )}
                  <span className="form-tip">
                    💡 <strong>防重叠智能避让已生效</strong>：即使选择更小的紧凑行距，系统也会为包含振假名的行自动计算安全顶边距，彻底杜绝假名与上一行文字重叠。
                  </span>
                </div>

                {/* Dedicated Ruby Furigana Customization Card */}
                <div className="ruby-settings-card">
                  <div className="ruby-settings-title-row">
                    <span className="ruby-section-title">振假名 (Ruby) 字号与颜色个性化定制</span>
                    <span className="ruby-section-tag">实时联动</span>
                  </div>

                  <div className="ruby-controls-grid">
                    {/* Size Selector */}
                    <div className="form-group">
                      <div className="label-with-val">
                        <label className="form-label">振假名字号：</label>
                        <span className="size-percent-badge">{previewRubyRatio}</span>
                      </div>
                      <select
                        className="form-select"
                        value={formData.rubySize || 'default'}
                        onChange={(e) => {
                          const val = e.target.value as RubySizeRatio;
                          const defaultNumMap: Record<string, number> = {
                            xs: 48,
                            small: 54,
                            default: 62,
                            large: 72,
                            xl: 84,
                            custom: formData.rubyCustomSize || 62,
                          };
                          setFormData({
                            ...formData,
                            rubySize: val,
                            rubyCustomSize: defaultNumMap[val] || 62,
                          });
                        }}
                      >
                        <option value="xs">极小微缩 (48%)</option>
                        <option value="small">精致小巧 (54%)</option>
                        <option value="default">标准协调 (62%·默认)</option>
                        <option value="large">清晰醒目 (72%)</option>
                        <option value="xl">醒目大字 (84%)</option>
                        <option value="custom">自定义百分比</option>
                      </select>

                      {formData.rubySize === 'custom' && (
                        <div className="ruby-size-slider-row" style={{ marginTop: '8px' }}>
                          <input
                            type="range"
                            min={40}
                            max={100}
                            step={2}
                            value={formData.rubyCustomSize || 62}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                rubySize: 'custom',
                                rubyCustomSize: parseInt(e.target.value, 10),
                              })
                            }
                            className="ruby-range-slider"
                          />
                          <span className="slider-val-tag">{formData.rubyCustomSize || 62}%</span>
                        </div>
                      )}
                    </div>

                    {/* Color Selector */}
                    <div className="form-group">
                      <label className="form-label">振假名颜色（默认跟随主题色）：</label>
                      <div className="ruby-color-pills">
                        {[
                          { id: 'theme', label: '跟随主题', color: previewRubyColor },
                          { id: 'slate', label: '深灰', color: '#475569' },
                          { id: 'crimson', label: '朱红', color: '#e11d48' },
                          { id: 'indigo', label: '绀青', color: '#4f46e5' },
                          { id: 'emerald', label: '翠绿', color: '#059669' },
                          { id: 'violet', label: '雅紫', color: '#7c3aed' },
                          { id: 'amber', label: '暖褐', color: '#d97706' },
                          { id: 'custom', label: '自定义', color: formData.rubyCustomColor || '#e11d48' },
                        ].map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`ruby-color-pill ${(formData.rubyColor || 'theme') === c.id ? 'active' : ''}`}
                            onClick={() => setFormData({ ...formData, rubyColor: c.id as RubyColorChoice })}
                          >
                            <span
                              className="color-dot"
                              style={{ background: c.id === 'theme' ? 'var(--primary)' : c.color }}
                            />
                            <span>{c.label}</span>
                          </button>
                        ))}
                      </div>

                      {formData.rubyColor === 'custom' && (
                        <div className="custom-color-picker-row">
                          <input
                            type="color"
                            value={formData.rubyCustomColor || '#e11d48'}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                rubyColor: 'custom',
                                rubyCustomColor: e.target.value,
                              })
                            }
                            className="color-input-square"
                          />
                          <input
                            type="text"
                            value={formData.rubyCustomColor || '#e11d48'}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                rubyColor: 'custom',
                                rubyCustomColor: e.target.value,
                              })
                            }
                            placeholder="#e11d48"
                            className="color-hex-input"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live Interactive Preview Box */}
                  <div
                    className="ruby-preview-container"
                    style={
                      {
                        '--ruby-color': previewRubyColor,
                        '--ruby-font-ratio': previewRubyRatio,
                        '--app-line-height': previewLineHeight,
                      } as React.CSSProperties
                    }
                  >
                    <div className="preview-header">
                      <span className="preview-badge">✨ 对话排版实时预览（字号/假名/行距/气泡联动）</span>
                      <span className="preview-stats">
                        字号: <code>{previewFontSize}</code> | 假名: <code>{previewRubyRatio}</code> | 行距: <code>{previewLineHeight}x</code>
                      </span>
                    </div>

                    <div className="preview-chat-container">
                      <div className="preview-message-row">
                        {/* Avatar */}
                        <div className="preview-avatar-circle ai-avatar">
                          {formData.aiAvatar ? (
                            <img src={formData.aiAvatar} alt={formData.aiTutorName || 'Shiori'} className="avatar-img" />
                          ) : (
                            <span className="avatar-jp-char">{getNameInitial(formData.aiTutorName || '栞')}</span>
                          )}
                        </div>

                        {/* Content Area */}
                        <div className="preview-message-content">
                          {/* Sender Meta */}
                          <div className="preview-sender-meta">
                            <span className="preview-sender-name">{formData.aiTutorName || '栞 (Shiori)'}</span>
                            <span className="preview-sender-time">19:42 · 效果预览</span>
                          </div>

                          {/* Bubble */}
                          <div
                            className="message-bubble bubble-assistant preview-bubble-styled"
                            style={{
                              padding: previewBubblePadding,
                              lineHeight: previewLineHeight,
                              fontSize: previewFontSize,
                              fontFamily: previewFontFamily,
                            }}
                          >
                            <div className="preview-bubble-body">
                              <div className="preview-line has-ruby-annotation">
                                <RubyText
                                  content="{今日[きょう]}の {勉強[べんきょう]}も よく {頑張[がんば]}りましたね！{新[あたら]}しい {表現[ひょうげん]}を {使[つか]}って、{一緒[いっしょ]}に {楽[たの]}しく {会話[かいわ]}しましょう。"
                                  furiganaMode={formData.furiganaMode || 'always'}
                                  pitchDisplayMode="none"
                                  interactive={false}
                                  isExplicitJapanese={true}
                                />
                              </div>
                              <div className="preview-line parenthesis-text roleplay-action-text" style={{ marginTop: '6px' }}>
                                （今天的学习也很努力呢！用新学到的表达一起开心地对话吧～）
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="preview-tip-text">
                      注：此预览区域 1:1 模拟真实对话界面（含私教头像、发送者信息与气泡外形），直观联动字号、振假名比例、行距及气泡内边距。
                    </p>
                  </div>
                </div>

                {/* Bubble Density */}
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">消息间距密度：</label>
                  <div className="density-buttons-row">
                    <button
                      type="button"
                      className={`density-pill-btn ${formData.bubbleDensity === 'compact' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, bubbleDensity: 'compact' })}
                    >
                      紧凑 (Compact)
                    </button>
                    <button
                      type="button"
                      className={`density-pill-btn ${formData.bubbleDensity === 'normal' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, bubbleDensity: 'normal' })}
                    >
                      标准 (Normal)
                    </button>
                    <button
                      type="button"
                      className={`density-pill-btn ${formData.bubbleDensity === 'spacious' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, bubbleDensity: 'spacious' })}
                    >
                      宽松 (Spacious)
                    </button>
                  </div>
                </div>
              </div>

              {/* Section: History Dialogues & Topic Subtitle Settings */}
              <div className="custom-setting-group">
                <div className="group-heading">
                  <History size={17} className="heading-icon" />
                  <span className="heading-text">历史对话与话题副标题设置</span>
                </div>

                {/* Trigger rounds */}
                <div className="form-group">
                  <div className="label-with-val">
                    <label className="form-label">副标题自动提炼生成时机（对话轮次）：</label>
                    <span className="size-percent-badge">
                      {(typeof formData.subtitleAutoRound === 'number' ? formData.subtitleAutoRound : 5) === 0
                        ? '不自动生成'
                        : `第 ${formData.subtitleAutoRound ?? 5} 轮对话后`}
                    </span>
                  </div>
                  <div className="density-buttons-row">
                    {[
                      { val: 0, label: '不自动生成 (关闭)' },
                      { val: 1, label: '第 1 轮' },
                      { val: 2, label: '第 2 轮' },
                      { val: 3, label: '第 3 轮' },
                      { val: 5, label: '第 5 轮 (默认推荐)' },
                      { val: 8, label: '第 8 轮' },
                      { val: 10, label: '第 10 轮' },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        className={`density-pill-btn ${
                          (typeof formData.subtitleAutoRound === 'number' ? formData.subtitleAutoRound : 5) === opt.val
                            ? 'active'
                            : ''
                        }`}
                        onClick={() => setFormData({ ...formData, subtitleAutoRound: opt.val })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="form-tip">
                    💡 <strong>轮次判定标准</strong>：从用户第一条发言开始，以 AI 对用户第 N 条发言的回复完成为一轮结束。达到设定轮次后系统自动提取该会话内的 3 个核心话题关键词作为副标题。
                  </span>
                </div>

                {/* Subtitle Separator */}
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">三个关键词连接词设置：</label>
                  <div className="density-buttons-row separator-options-row">
                    {[
                      { id: 'dot', label: '“·” (间隔号)' },
                      { id: 'comma', label: '“、” (顿号)' },
                      { id: 'and', label: '“&” (与号)' },
                      { id: 'space', label: '“空格”' },
                      { id: 'yu', label: '“与”' },
                      { id: 'to', label: '“と”' },
                      { id: 'custom', label: '“自定义”' },
                    ].map((sep) => (
                      <button
                        key={sep.id}
                        type="button"
                        className={`density-pill-btn ${(formData.subtitleSeparator || 'dot') === sep.id ? 'active' : ''}`}
                        onClick={() => setFormData({ ...formData, subtitleSeparator: sep.id as SubtitleSeparatorType })}
                      >
                        {sep.label}
                      </button>
                    ))}
                  </div>

                  {formData.subtitleSeparator === 'custom' && (
                    <div className="custom-separator-input-box" style={{ marginTop: '8px' }}>
                      <input
                        type="text"
                        className="form-input custom-sep-input"
                        placeholder="输入自定义连接字符，如： - 或 / 或 | 等"
                        value={formData.subtitleCustomSeparator || ''}
                        onChange={(e) => setFormData({ ...formData, subtitleCustomSeparator: e.target.value })}
                        maxLength={10}
                      />
                    </div>
                  )}

                  {/* Subtitle Live Preview Box */}
                  <div className="subtitle-preview-container">
                    <div className="preview-header">
                      <span className="preview-badge">📋 历史会话卡片实时预览（副标题连接词联动）</span>
                      <span className="preview-stats">
                        当前连接词：<code>"{getSeparatorString(formData.subtitleSeparator, formData.subtitleCustomSeparator)}"</code>
                      </span>
                    </div>

                    <div className="subtitle-cards-preview-grid">
                      {/* Regular dialogue card */}
                      <div className="history-session-card">
                        <div className="session-card-top">
                          <div className="session-title-wrap">
                            <MessageSquare size={14} className="session-item-icon" />
                            <div className="session-title-column">
                              <div className="session-title-row">
                                <h4 className="session-title">京都秋日赏枫旅行规划</h4>
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="session-preview-snippet">
                          来週の新幹線チケットを予約しましょう。（来预约下周的新干线车票吧。）
                        </p>

                        <div className="session-card-bottom">
                          <div className="session-meta-stats">
                            <span className="session-time">昨天 16:30</span>
                            <span className="meta-dot">·</span>
                            <span className="session-msg-count">8条</span>
                          </div>

                          <div className="session-card-actions">
                            <span className="session-subtitle-bottom-tag">
                              {formatSubtitleWithTopics(
                                ['京都', '新干线', '切符'],
                                formData.subtitleSeparator,
                                formData.subtitleCustomSeparator
                              )}
                            </span>
                            <span className="action-icon-btn btn-rename" title="编辑主标题与副标题">
                              <Edit2 size={13} />
                            </span>
                            <span className="action-icon-btn btn-delete" title="删除此对话">
                              <Trash2 size={13} />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="preview-tip-text">
                      注：此预览 1:1 还原历史对话列表卡片（包含活动状态指示灯、会话摘要、时间与副标题胶囊）。切换上方连接词即可实时预览右下角标签样式。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: AI MODEL & API ================= */}
          {activeTab === 'model' && (
            <div className="settings-section-container">
              {/* Provider Selection */}
              <div className="form-group">
                <label className="form-label">选择 API 供应商：</label>
                <select
                  value={formData.provider}
                  onChange={(e) => handleProviderChange(e.target.value as ApiProvider)}
                  className="form-select"
                >
                  {(Object.keys(PROVIDER_PRESETS) as ApiProvider[]).map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_PRESETS[p].name}
                    </option>
                  ))}
                </select>
                <span className="form-tip">{PROVIDER_PRESETS[formData.provider].tip}</span>
              </div>

              {/* Base URL */}
              <div className="form-group">
                <label className="form-label">API 基础地址 (Base URL)：</label>
                <input
                  type="text"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="form-input"
                />
              </div>

              {/* API Key */}
              <div className="form-group">
                <div className="label-with-action">
                  <label className="form-label">API 密钥 (API Key)：</label>
                  <button
                    type="button"
                    className="text-action-btn"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{showKey ? '隐藏' : '显示密钥'}</span>
                  </button>
                </div>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="请输入您的 API Key..."
                  className="form-input font-mono"
                />
                <span className="form-tip">
                  已预设你的专属 Gemini 密钥。密钥仅在浏览器及本地代理保存，安全放心。
                </span>
              </div>

              {/* Model Name */}
              <div className="form-group">
                <label className="form-label">模型名称 (Model)：</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="gemini-3.6-flash"
                  className="form-input font-mono"
                />
                <span className="form-tip">推荐使用 gemini-3.6-flash 或 deepseek-chat</span>
              </div>

              {/* Temperature */}
              <div className="form-group">
                <div className="label-with-value">
                  <label className="form-label">创造性与随机度 (Temperature)：</label>
                  <span className="value-badge">{formData.temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  className="form-range"
                />
                <div className="range-labels">
                  <span>严谨准确 (0.2)</span>
                  <span>推荐私教 (0.7)</span>
                  <span>发散创意 (1.2)</span>
                </div>
              </div>

              {/* Context History Memory Turns */}
              <div className="form-group">
                <div className="label-with-value">
                  <label className="form-label">历史对话保留轮数 (Sliding Window)：</label>
                  <span className="value-badge">{formData.maxHistoryTurns} 轮 ({formData.maxHistoryTurns * 2} 条消息)</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="30"
                  step="2"
                  value={formData.maxHistoryTurns}
                  onChange={(e) => setFormData({ ...formData, maxHistoryTurns: parseInt(e.target.value, 10) })}
                  className="form-range"
                />
                <span className="form-tip">推荐 16 轮（约 32 条消息）。增大轮数可让 AI 长期牢记上文每一个例句与提问，彻底解决上下文失忆；超出部分将自动转为背景摘要压缩保存。</span>
              </div>

              {/* Cross-Session Memory & Progress Tracking */}
              <div className="form-group">
                <div className="label-with-value">
                  <label className="form-label">跨会话记忆与学情动态追踪：</label>
                  <span className="value-badge">
                    {formData.crossSessionMemoryMode === 'deep'
                      ? '🧠 深度私教 (+250 tok)'
                      : formData.crossSessionMemoryMode === 'off'
                      ? '🔒 单会话独立 (0 tok)'
                      : '🌟 标准轻量 (+100 tok)'}
                  </span>
                </div>
                <div className="memory-mode-grid">
                  <button
                    type="button"
                    className={`memory-mode-card ${formData.crossSessionMemoryMode === 'standard' || !formData.crossSessionMemoryMode ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, crossSessionMemoryMode: 'standard' })}
                  >
                    <div className="memory-mode-card-header">
                      <span className="memory-mode-title">🌟 标准轻量</span>
                      <span className="memory-mode-cost">约 +100 tok</span>
                    </div>
                    <div className="memory-mode-desc">推荐日常使用。记录以往会话精简里程碑 + 优先攻坚易混淆生词语法。</div>
                  </button>
                  <button
                    type="button"
                    className={`memory-mode-card ${formData.crossSessionMemoryMode === 'deep' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, crossSessionMemoryMode: 'deep' })}
                  >
                    <div className="memory-mode-card-header">
                      <span className="memory-mode-title">🧠 深度私教</span>
                      <span className="memory-mode-cost">约 +250 tok</span>
                    </div>
                    <div className="memory-mode-desc">备考冲刺推荐。包含更早的课堂脉络与大跨度词库追踪，沉浸感更强。</div>
                  </button>
                  <button
                    type="button"
                    className={`memory-mode-card ${formData.crossSessionMemoryMode === 'off' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, crossSessionMemoryMode: 'off' })}
                  >
                    <div className="memory-mode-card-header">
                      <span className="memory-mode-title">🔒 独立单会话</span>
                      <span className="memory-mode-cost">+0 tok</span>
                    </div>
                    <div className="memory-mode-desc">纯净测试推荐。各对话完全隔离独立，不携带任何跨会话背景与生词档案。</div>
                  </button>
                </div>
                <span className="form-tip">
                  基于智能胶囊压缩机制，以极低 Token 代价让 AI 具备真人私教般的长期成长陪伴感与前后连贯性。
                </span>
              </div>
            </div>
          )}

          {/* ================= TAB 3: PREFERENCES & SPEECH ================= */}
          {activeTab === 'preferences' && (
            <div className="settings-section-container">
              {/* TTS Speech Rate */}
              <div className="form-group">
                <div className="label-with-value">
                  <label className="form-label">TTS 语音朗读语速：</label>
                  <span className="value-badge">{formData.ttsRate}x</span>
                </div>
                <div className="tts-control-row">
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={formData.ttsRate}
                    onChange={(e) => setFormData({ ...formData, ttsRate: parseFloat(e.target.value) })}
                    className="form-range flex-1"
                  />
                  <button type="button" className="btn-secondary btn-sm" onClick={handleTestTTS}>
                    <Volume2 size={14} />
                    <span>试听发音</span>
                  </button>
                </div>
                <div className="range-labels">
                  <span>慢速精读 (0.8x)</span>
                  <span>自然常速 (1.0x)</span>
                  <span>较快流利 (1.2x)</span>
                </div>
              </div>

              {/* Furigana Display Mode */}
              <div className="form-group">
                <label className="form-label">振假名注音默认显示方式：</label>
                <div className="density-buttons-row">
                  {[
                    { id: 'always', label: '始终显示 (初学推荐)' },
                    { id: 'hover', label: '悬浮显示 (进阶自测)' },
                    { id: 'hidden', label: '隐藏注音 (实战挑战)' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`density-pill-btn ${(formData.furiganaMode || 'always') === item.id ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, furiganaMode: item.id as any })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Furigana Hide Mastered Words Toggle */}
              <div className="form-group checkbox-group" style={{ marginTop: '8px' }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.furiganaHideMastered !== false}
                    onChange={(e) =>
                      setFormData({ ...formData, furiganaHideMastered: e.target.checked })
                    }
                    className="form-checkbox"
                  />
                  <div className="checkbox-text-block">
                    <span className="checkbox-title">隐藏“已掌握”生词的振假名注音（学情联动）</span>
                    <span className="checkbox-desc">
                      开启后，学情档案中已掌握的熟词将不再显示上方注音，仅对“初学”与“温习”阶段词汇注音，模拟真实阅读体验
                    </span>
                  </div>
                </label>
              </div>

              {/* Token Compression Toggle */}
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.tokenSavingEnabled}
                    onChange={(e) => setFormData({ ...formData, tokenSavingEnabled: e.target.checked })}
                    className="form-checkbox"
                  />
                  <div className="checkbox-text-block">
                    <span className="checkbox-title">开启上下文智能压缩</span>
                    <span className="checkbox-desc">
                      自动提炼对话焦点、提取核心档案记忆，超长对话智能转为背景摘要，加速生成响应
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* ================= TAB 4: BACKUP & RESTORE ================= */}
          {activeTab === 'backup' && (
            <div className="settings-section-container">
              {syncToast && (
                <div className="sync-toast-alert">
                  <CheckCircle2 size={16} className="sync-toast-icon" />
                  <span>{syncToast}</span>
                </div>
              )}

              {/* Section 1: 导出数据 */}
              <div className="custom-setting-group">
                <div className="group-heading-between">
                  <div className="group-heading-left">
                    <HardDriveDownload size={17} className="heading-icon" />
                    <span className="heading-text">导出备份数据</span>
                  </div>
                </div>

                <div className="backup-stats-row">
                  <div className="backup-stat-chip">
                    <span className="stat-label">生词本</span>
                    <strong className="stat-val">{learnedWordsCount || 0} 词</strong>
                  </div>
                  <div className="backup-stat-chip">
                    <span className="stat-label">语法笔记</span>
                    <strong className="stat-val">{learnedGrammarCount || 0} 条</strong>
                  </div>
                  <div className="backup-stat-chip">
                    <span className="stat-label">历史会话</span>
                    <strong className="stat-val">{sessionsCount || 0} 个</strong>
                  </div>
                  <div className="backup-stat-chip">
                    <span className="stat-label">私教预设</span>
                    <strong className="stat-val">{personaPresets.length} 套</strong>
                  </div>
                </div>

                <div className="form-group checkbox-group" style={{ marginTop: '2px' }}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={includeApiKeyInExport}
                      onChange={(e) => setIncludeApiKeyInExport(e.target.checked)}
                      className="form-checkbox"
                    />
                    <div className="checkbox-text-block">
                      <span className="checkbox-title">包含已配置的 API Key</span>
                      <span className="checkbox-desc">
                        勾选后可在手机等新设备上免填密钥；如将备份文件发送给他人请取消勾选。
                      </span>
                    </div>
                  </label>
                </div>

                <div className="backup-actions-row">
                  <button
                    type="button"
                    className="btn-backup-export"
                    onClick={handleExportBackup}
                  >
                    <Download size={15} />
                    <span>导出全量备份 (.json)</span>
                  </button>
                </div>
              </div>

              {/* Section 2: 导入恢复 */}
              <div className="custom-setting-group">
                <div className="group-heading-between">
                  <div className="group-heading-left">
                    <HardDriveUpload size={17} className="heading-icon" />
                    <span className="heading-text">导入与恢复</span>
                  </div>
                </div>

                <input
                  type="file"
                  ref={backupFileInputRef}
                  onChange={handleBackupFileSelect}
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                />

                {!pendingBackup ? (
                  <div
                    className="backup-dropzone"
                    onClick={() => backupFileInputRef.current?.click()}
                  >
                    <HardDriveUpload size={28} className="dropzone-icon" />
                    <div className="dropzone-title">点击或拖拽上传备份文件 (.json)</div>
                    <div className="dropzone-sub">支持智能合并现有数据或全量覆盖</div>
                  </div>
                ) : (
                  <div className="backup-inspection-card">
                    <div className="inspection-header">
                      <div className="inspection-title-group">
                        <CheckCircle2 size={16} className="text-success" />
                        <h4>备份文件已就绪</h4>
                      </div>
                      <button
                        type="button"
                        className="btn-text-cancel"
                        onClick={() => setPendingBackup(null)}
                      >
                        重新选择
                      </button>
                    </div>

                    <div className="inspection-grid">
                      <div className="inspection-item">
                        <span className="item-k">导出时间：</span>
                        <span className="item-v">{pendingBackup.inspection.exportedAtFormatted}</span>
                      </div>
                      <div className="inspection-item">
                        <span className="item-k">来源设备：</span>
                        <span className="item-v">{pendingBackup.inspection.sourceDevice || '未知'}</span>
                      </div>
                      <div className="inspection-item">
                        <span className="item-k">生词数：</span>
                        <span className="item-v text-primary">{pendingBackup.inspection.summary.wordsCount} 词</span>
                      </div>
                      <div className="inspection-item">
                        <span className="item-k">语法数：</span>
                        <span className="item-v text-primary">{pendingBackup.inspection.summary.grammarCount} 条</span>
                      </div>
                      <div className="inspection-item">
                        <span className="item-k">会话数：</span>
                        <span className="item-v">{pendingBackup.inspection.summary.sessionsCount} 个</span>
                      </div>
                      <div className="inspection-item">
                        <span className="item-k">API Key：</span>
                        <span className="item-v">
                          {pendingBackup.inspection.summary.hasApiKey ? '已包含' : '未包含'}
                        </span>
                      </div>
                    </div>

                    <div className="import-mode-selector">
                      <div className="mode-options-row">
                        <label className={`mode-option-card ${importMode === 'merge' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="importMode"
                            value="merge"
                            checked={importMode === 'merge'}
                            onChange={() => setImportMode('merge')}
                          />
                          <div className="mode-card-content">
                            <div className="mode-card-title">
                              <strong>智能增量合并（推荐）</strong>
                            </div>
                            <div className="mode-card-desc">
                              保留本机现有数据，将备份中的生词与记录并入，更新掌握度。
                            </div>
                          </div>
                        </label>

                        <label className={`mode-option-card ${importMode === 'overwrite' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="importMode"
                            value="overwrite"
                            checked={importMode === 'overwrite'}
                            onChange={() => setImportMode('overwrite')}
                          />
                          <div className="mode-card-content">
                            <div className="mode-card-title">
                              <strong>完全覆盖</strong>
                            </div>
                            <div className="mode-card-desc">
                              用该备份完全替换本机当前数据。
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="inspection-actions">
                      <button
                        type="button"
                        className="btn-confirm-import"
                        onClick={handleConfirmImport}
                      >
                        <CheckCheck size={15} />
                        <span>确认导入 ({importMode === 'merge' ? '智能合并' : '完全覆盖'})</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: 重置初始化 */}
              <div className="custom-setting-group danger-zone-group">
                <div className="group-heading-between">
                  <div className="group-heading-left">
                    <AlertTriangle size={16} className="heading-icon text-danger" />
                    <span className="heading-text text-danger">重置初始化</span>
                  </div>
                  <button
                    type="button"
                    className="btn-danger-reset"
                    onClick={handleResetConfirm}
                  >
                    <Trash2 size={13} />
                    <span>恢复出厂初始数据</span>
                  </button>
                </div>
                <p className="danger-zone-desc">
                  清空当前设备中所有的本地生词、语法进度和对话记录，恢复至出厂初始状态。此操作不可逆，如需保留学情请先在上方导出备份。
                </p>
              </div>
            </div>
          )}
          </div>

          {/* Modal Footer Actions */}
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-primary">
              {savedToast ? (
                <>
                  <Check size={16} />
                  <span>已保存！</span>
                </>
              ) : (
                <span>保存个性化设置</span>
              )}
            </button>
          </div>
        </form>

        {/* Social App Style Avatar Cropper Modal */}
        <ImageCropperModal
          isOpen={cropperState.isOpen}
          imageSrc={cropperState.imageSrc}
          title={cropperState.title}
          onConfirm={handleCropConfirmed}
          onClose={() => setCropperState((prev) => ({ ...prev, isOpen: false }))}
        />
      </div>
    </div>
  );
};
