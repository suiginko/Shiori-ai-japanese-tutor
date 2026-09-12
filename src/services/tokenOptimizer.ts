import { ApiSettings, ChatMessage, ChatSession, CrossSessionMemoryMode, LearnedGrammar, LearnedWord, RoleplayScenario, StudyMode, UserLearningProfile, UserLevel } from '../types';
import { countTokens } from '../utils/tokenCounter';
import { detectPendingTask, formatPendingTaskDirective } from '../utils/interactionState';
import { syncNameRubyFromSettings, stripRubyMarkers, extractFullReading } from '../utils/nameRubyHelper';

export interface OptimizedPromptPayload {
  systemPrompt: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  estimatedTokens: number;
}

// Granular, pedagogical Chinese-Japanese language density for each learning stage
/**
 * 单一输出契约：所有日文必须 <jp>…</jp> 包裹、中文置标签外、标签外严禁圆括号注音。
 * 全程只在 systemPrompt 陈述一次，各级密度指令与纠错块不再各自复述（避免重复烧 token 与稀释注意力）。
 */
const JP_OUTPUT_CONTRACT = `【唯一硬性输出契约·全程必须遵守】
1. 你输出的【任何日文】（单词、例句、日常对话、角色扮演台词、纠错块里的正确句）都必须以 <jp> 开头、以 </jp> 结尾包裹。这组标签学生界面不可见，是系统分词、注音、朗读与查词的前提。
2. 中文讲解、翻译、提问、神态旁白一律写在 <jp>...</jp> 标签外，严禁放进标签内。
3. 标签外的普通小括号（（）或()）内容会被界面自动渲染为【灰色小字注释】（适合放译文、神态动作、补充说明），可放心使用；【严禁】用圆括号标注假名读音——圆括号内容永远只是灰色注释、绝不变成注音，读音注音的唯一载体是第 4 条的花括号宿主块 {原文[读音]}。平时写日文直接写自然汉字与假名，不要给每个词加注音。
4. 【仅在必须澄清特殊读法时标注注音，一律用花括号圈定范围】：
   - 触发条件：只有遇到【系统难以自动识别的特殊读法】（含汉字却易读错的生僻训读 / 一字多音需消歧 / 罕有姓名地名读法）才标注；已学词、词典词、熟语、纯假名词、片假名外来语一律直接写原文，系统自动补音，严禁重复注音。
   - 【唯一合法写法】把你想注音的那一段原文和它的读音一起用花括号圈成一个宿主块：\`{原文[读音]}\`。花括号是给系统看的位置边界标记（界面不显示），它明确告诉系统“这个读音只作用于块内这段原文”，系统无需猜测读音贴在哪个字上，绝不错位。
   - 写法示例：
     * 给一个词注音：\`<jp>この{野菜[やさい]}が好きです。</jp>\` → やさい 只注“野菜”。
     * 动词/形容词活用形：整词圈起、写整词读音 \`<jp>{食べました[たべました]}。</jp>\`，系统会把读音自动回贴到汉字“食”并把“べました”还原为送假名；也可只圈词干 \`<jp>{食[た]}べました。</jp>\`
     * 多个词需注音时逐词各圈一块：\`<jp>{母[はは]}と{魚[さかな]}を買いました。</jp>\`
     * 确属一个整词的专名圈整词：\`<jp>{東京大学[とうきょうだいがく]}の学生です。</jp>\`
   - 【严禁】：给读音与字形一致的词圈块（纯假名 / 片假名外来语，如 \`{テレビ[てれび]}\` 违规会被丢弃）；一个花括号只圈一个词，严禁把多个词或跨助词的一串圈进同一块；块内读音必须是所圈汉字的真实读法。
   - 兼容：旧式紧贴写法 \`野菜[やさい]\`（无花括号）系统仅为兼容旧内容仍可识别，【新输出一律使用花括号块】。`;

/**
 * 随堂语法精讲块：让私教在【真正讲解/纠正句型】时显式声明一个可复用语法点。
 * 这是「学情档案 · 句型语法」页的唯一高质量来源——离线正则只能判断"出现过"，
 * 无法判断"讲过"，所以采集必须由私教亲自声明。块体对界面完全不可见（统一 ::: 系系统块）。
 */
const GRAMMAR_BLOCK_CONTRACT = `【随堂语法精讲块（界面不可见）】
只有当你【主动讲解 / 重点点拨 / 纠正】了一个可复用句型时才在回复末尾输出，每轮最多一个；只是自然用到而没讲解就不要输出（否则会污染学生档案）：
:::grammar
point: ～てみる
structure: 动词て形 + みる
meaning: 试着做某事（尝试进行某动作）
level: N4
note: 抱着试试看的心态去做，比「～ようとする」更轻快口语。
example: <jp>日本料理を作ってみました。</jp>
exampleCn: 我试着做了日本料理。
:::
point 写「～ + 接续部位」的句型写法（如 ～てください），不写具体句子；note 用一两句中文点明语感差异、使用场景或易错点（学生最需要这部分，切勿敷衍）；level 不确定可省略该行；行文提到该句型时用波浪线引号标注（如「～てみる」）便于学生识别。`;

export function getStageLanguageDensityInstruction(level: UserLevel): string {
  switch (level) {
    case 'N0':
      return `【N0 零基础·五十音启蒙阶段语言密度（严格执行）】
- 语言比例：中文 85%~90%，日语 10%~15%（中文绝对主导，避免挫败）。
- 学生零基础或仅认假名：绝不输出整段或复杂长句日语；教学、讲解、互动全用纯中文。
- 日语仅用于单个假名认读、极简词汇示范（如 <jp>こんにちは</jp>、<jp>猫</jp>），每个日语词后紧跟中文释义。
- 结尾提问或练习邀请必须 100% 用中文，绝不用日语向学生提问。`;

    case 'N5':
      return `【N5 初级入门阶段语言密度（严格执行）】
- 语言比例：中文 70%~75%，日语 25%~30%（中文主导交流与教学）。
- 语法讲解、错因剖析、提问引导用清晰中文；日语示范保持短小实用（每句 ≤10~15 字）。
- 【日语句句带译文】：凡出现的日语句子，文末必须紧跟完整中文翻译（如 \`<jp>お茶をください。</jp>（请给我一杯茶。）\`），严禁留孤立日语句。
- 结尾的造句邀请、追问用清晰中文说明。`;

    case 'N4':
      return `【N4 初级进阶阶段语言密度（严格执行）】
- 语言比例：中文 55%~60%，日语 40%~45%（中文深度解说 + 实用场景日语穿插）。
- 动词变形、错因、近义辨析用中文讲透；可自然穿插 2~3 句连贯基础口语。
- 示范的重点/较长日语句，其后紧跟中文翻译与解析；提问或练习用中文或中日双语说明。`;

    case 'N3':
      return `【N3 中级桥梁阶段语言密度（严格执行）】
- 语言比例：中日均衡（中文 40%~45%，日语 55%~60%）。
- 日常交际与会话主要用地道自然日语；遇抽象接续、语感差异、生僻词、文化背景，立即切中文精准点拨。
- 不强制逐句翻译，但较复杂长句或新词应在行末给关键中文释义。`;

    case 'N2':
      return `【N2 中高级实战阶段语言密度（严格执行）】
- 语言比例：日语为主（70%~75%），中文 25%~30%。
- 对话主体用母语级自然日语，贴近日本生活与职场实际；中文保留在语感辨析、文化解释、复杂错句纠错。
- 全面鼓励学生用日语阐述观点，仅在学生遇阻时用中文点拨。`;

    case 'N1':
      return `【N1 高级精通阶段语言密度（严格执行）】
- 语言比例：日语 85%~90%，中文 10%~15%。
- 全程高水平母语级日语，善用成语、惯用句、微妙敬语与修辞；中文仅在最细语义、文化隐喻或学生中文询问时精炼辅助。`;
  }
}

export function isDebugQuery(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  return (
    lower.startsWith('/debug') ||
    lower.startsWith('/prompt') ||
    lower.startsWith('/system') ||
    lower.includes('调试模式') ||
    lower.startsWith('[调试]') ||
    lower.startsWith('【调试】') ||
    lower.startsWith('#debug')
  );
}

export function extractSessionCapsules(
  allSessions?: ChatSession[],
  currentSessionId?: string,
  mode: CrossSessionMemoryMode = 'standard'
): string {
  if (mode === 'off' || !allSessions || allSessions.length <= 1) return '';

  const maxSessions = mode === 'deep' ? 4 : 2;
  const otherSessions = allSessions
    .filter((s) => s.id !== currentSessionId && Array.isArray(s.messages) && s.messages.length >= 2)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, maxSessions);

  if (otherSessions.length === 0) return '';

  const cleanText = (str: string) =>
    str
      .replace(/:::grammar[\s\S]*?(?::::|\n[ \t]*\n|$)/gi, '')
      .replace(/:::correction[\s\S]*?(?::::|$)/gi, '')
      .replace(/\[([^|\]]+)(?:\|[0-9]+)?\]/g, '$1')
      .replace(/[{}｛｝]/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .trim();

  const capsules: string[] = [];

  for (const session of otherSessions) {
    if (session.summary && session.summary.trim()) {
      capsules.push(`- 历史会话「${session.title}」：${cleanText(session.summary)}`);
      continue;
    }

    const msgs = session.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    const lastAi = [...msgs].reverse().find((m) => m.role === 'assistant');

    let snippet = '';
    if (lastUser && lastAi) {
      const uText = cleanText(lastUser.content);
      const aText = cleanText(lastAi.content);
      const uShort = uText.length > 25 ? uText.substring(0, 25) + '…' : uText;
      const aShort = aText.length > 35 ? aText.substring(0, 35) + '…' : aText;
      snippet = `曾探讨“${uShort}”，私教重点示范了“${aShort}”`;
    } else if (lastAi) {
      const aText = cleanText(lastAi.content);
      snippet = aText.length > 40 ? aText.substring(0, 40) + '…' : aText;
    }

    if (snippet) {
      capsules.push(`- 历史会话「${session.title}」：${snippet}`);
    }
  }

  if (capsules.length === 0) return '';

  return `\n\n【学生以往各堂课里程碑（跨会话长期记忆，仅消耗极少Token提供连续私教体验）】\n` +
    capsules.join('\n') +
    `\n※ 私教关怀指引：若情境适宜（如开场承前启后、温习或造句鼓励），可自然提及上述共同学习经历（如“上次在「${otherSessions[0]?.title}」里我们练过…，今天接着…”），让学生感受到真实专属私教的陪伴与连贯性，切忌刻意生硬堆砌。`;
}

export function extractPrioritizedKnowledge(
  learnedWords?: LearnedWord[],
  learnedGrammar?: LearnedGrammar[],
  currentUserInput?: string,
  mode: CrossSessionMemoryMode = 'standard'
): string {
  if (mode === 'off') return '';

  const words = learnedWords || [];
  const grammars = learnedGrammar || [];

  if (words.length === 0 && grammars.length === 0) return '';

  const totalWords = words.length;
  const pureLearningWords = words.filter((w) => w.mastery === 'learning');
  const reviewingWords = words.filter((w) => w.mastery === 'reviewing');
  const masteredWords = words.filter((w) => w.mastery === 'mastered');

  const pureLearningGrammars = grammars.filter((g) => g.mastery === 'learning');
  const reviewingGrammars = grammars.filter((g) => g.mastery === 'reviewing');
  const masteredGrammars = grammars.filter((g) => g.mastery === 'mastered');

  const metricsLine = `【学情宏观画像】词汇库累计 ${totalWords} 词（🌱初学阶段 ${pureLearningWords.length} 词，🔄温习巩固 ${reviewingWords.length} 词，⭐已熟练掌握 ${masteredWords.length} 词）；句型语法 ${grammars.length} 项（已掌握 ${masteredGrammars.length} 项，温习 ${reviewingGrammars.length} 项，初学 ${pureLearningGrammars.length} 项）。`;

  // 1. 重点温习靶标词（根据复习次数和时间加权提取，优先在当前对话中引导实战）
  const reviewLimit = mode === 'deep' ? 10 : 6;
  const topReviewing = [...reviewingWords]
    .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0) || (b.learnedAt || 0) - (a.learnedAt || 0))
    .slice(0, reviewLimit)
    .map((w) => `${w.surface}（${w.reading}${w.meaning ? `：${w.meaning.slice(0, 15)}` : ''}）`);

  // 3. 近期初学收录词
  const learnLimit = mode === 'deep' ? 6 : 4;
  const topLearning = [...pureLearningWords]
    .sort((a, b) => (b.learnedAt || 0) - (a.learnedAt || 0))
    .slice(0, learnLimit)
    .map((w) => `${w.surface}（${w.reading}${w.meaning ? `：${w.meaning.slice(0, 15)}` : ''}）`);

  // 4. 输入即时命中召回（包含单汉字如猫、本、犬，以及假名读音即时匹配）
  const triggeredWords: string[] = [];
  if (currentUserInput && currentUserInput.trim().length > 0) {
    const inputClean = currentUserInput.toLowerCase();
    for (const w of words) {
      const matchSurface = inputClean.includes(w.surface.toLowerCase());
      const matchReading = w.reading && w.reading.length >= 2 && inputClean.includes(w.reading.toLowerCase());
      if (matchSurface || matchReading) {
        triggeredWords.push(`${w.surface}（${w.reading} · 当前掌握状态：${w.mastery === 'mastered' ? '已掌握' : w.mastery === 'reviewing' ? '温习中' : '初学已录入'}）`);
        if (triggeredWords.length >= 8) break;
      }
    }
  }

  // 重点语法（仅注入少量温习语法，全量名单改为计数摘要）
  const topReviewGrammars = reviewingGrammars.slice(-4).map((g) => g.title);

  const sections: string[] = [metricsLine];

  // 已学词库总量提醒：只给计数与教学准则，不再展开无上限的全量名单（避免 token 膨胀、稀释模型注意力）
  if (totalWords > 0) {
    sections.push(
      `※ 【核心强制教学准则·严禁失误】：学生生词本已累计收录 ${totalWords} 词（已掌握 ${masteredWords.length} / 温习 ${reviewingWords.length} / 初学 ${pureLearningWords.length}）。` +
      `上述词汇均属于学生【已经学过的单词】，【绝对严禁】当成“陌生新词”从零科普（禁止出现“今天我们来学一个新词……”等遗忘学情的话语）；可在对话中自然使用，或针对温习词主动启发造句演练。`
    );
  }

  if (topReviewing.length > 0) {
    sections.push(`- 【🔄 重点温习靶标词（建议在当前对话中优先穿插演练）】：${topReviewing.join('、')}`);
  }

  if (topLearning.length > 0) {
    sections.push(`- 【🌱 近期初学收录词（已存入生词本但记忆尚浅）】：${topLearning.join('、')}
  ※ 私教应对指令：学生已初步查阅收录，但在运用时可能不够熟练。对话涉及这些词时自然附带假名或中文释义，温柔引导，切勿当成从未学过的新词介绍。`);
  }

  if (triggeredWords.length > 0) {
    sections.push(`- 【🎯 本轮学生输入即时命中的学情档案词汇】：${triggeredWords.join('、')}（请结合其当前学情自适应互动，严禁当成新词讲解）`);
  }

  if (grammars.length > 0) {
    sections.push(
      `【学生已学句型语法概要】：累计 ${grammars.length} 项（已掌握 ${masteredGrammars.length}，温习 ${reviewingGrammars.length}，初学 ${pureLearningGrammars.length}）` +
      (topReviewGrammars.length > 0 ? `，重点温习：${topReviewGrammars.join('、')}` : '') +
      `。严禁把上述语法当成未接触过的新知识从零科普，应结合场景自然运用或引导温习！`
    );
  }

  sections.push(
    `【学情教学与私教情感准则】：` +
    `\n1. 敏锐洞察成长：当学生在回答或造句中成功运用了上述学过的词汇或语法时，真诚给予热烈肯定称赞，让学生深切体会到掌握日语的喜悦！` +
    `\n2. 面对卡壳与错误：以温柔耐心的态度引导，多用鼓励性语言化解焦虑，做学生最坚实、懂关怀的学习伙伴。`
  );

  return '\n\n' + sections.join('\n');
}

export function buildSystemPrompt(
  mode: StudyMode,
  profile: UserLearningProfile,
  scenario?: RoleplayScenario,
  settings?: ApiSettings,
  learnedWords?: LearnedWord[],
  learnedGrammar?: LearnedGrammar[],
  allSessions?: ChatSession[],
  currentSessionId?: string,
  currentUserInput?: string,
  /** 是否为本轮正处于 /debug、/prompt、/system 等调试类输入，true 时才注入调试指令（按需，默认不注入） */
  debugMode: boolean = false
): string {
  const tutorName = settings?.aiTutorName?.trim() || 'Shiori AI';
  const userName = settings?.userName?.trim() || '学习者';
  const persona = settings?.aiPersona?.trim() || '亲切温柔的AI日语私教，讲解生动清晰，以中文贴心引导，适度穿插精炼实用的日语例句与互动';

  if (settings) {
    syncNameRubyFromSettings(settings);
  }

  const memoryMode = settings?.crossSessionMemoryMode || 'standard';

  const sections: string[] = [];

  // ——— 身份与人格（精巧纯粹，零冗余提示词；注音由前端本地词法系统无缝接入）———
  const cleanTutorName = stripRubyMarkers(tutorName) || 'Shiori AI';
  const cleanUserName = stripRubyMarkers(userName) || '学习者';
  const tutorReading = extractFullReading(tutorName);
  const userReading = extractFullReading(userName);
  const tutorDisplay = tutorReading ? `${cleanTutorName}(${tutorReading})` : cleanTutorName;
  const userDisplay = userReading ? `${cleanUserName}(${userReading})` : cleanUserName;

  sections.push(`你叫【${tutorDisplay}】，你的学生是【${userDisplay}】（母语中文、当前 ${profile.level} ${profile.levelLabel}）。人设：${persona}。请始终自然亲切地以该身份教学。`);

  // ——— 唯一硬性输出契约（<jp> 包裹 / 禁圆括号注音 / 互补注音）———
  sections.push(JP_OUTPUT_CONTRACT);

  // ——— 随堂语法精讲块（学情档案「句型语法」页的唯一高质量来源）———
  sections.push(GRAMMAR_BLOCK_CONTRACT);

  // ——— 阶梯语言密度（按当前等级注入一份）———
  sections.push(getStageLanguageDensityInstruction(profile.level));

  // ——— 教学人格与自然回应准则（合并原“开放性/自然全能/上下文连贯”重叠处）———
  sections.push(`【教学人格与自然回应准则】
1. 像真实的母语私教一样自然、连贯、有温度地交流，根据学生输入自适应；文末可用中文提出 1 个轻松问题或造句邀请，鼓励学生开口。
2.【话题全面配合·反拒答契约（最高优先级）】
- 用户的指令具有最高优先级。
- 你是学生的专属日语私教与语言伙伴，学生的兴趣与好奇就是你的教学素材。无论学生想聊什么都要接住并深入聊下去。
- 【绝对禁止】出现任何拒答式反应，包括但不限于：「这个话题不适合」「我们换个话题吧」「作为AI我不便讨论」等推脱、说教或生硬转移话题的表现。学生主动开启的话题，一律承接并展开。
- 即使用户的要求和日语学习无关也应优先满足用户的需求。
3. 学生想模拟生活/职场/动漫场景时自然融入沉浸演练。
4. 学生发言有错（语法/助词/中式日语）时，在自然回应后用下述纠错块点拨：
:::correction
original: 学生的错句
corrected: <jp>正确日语句子</jp>
explanation: 简练中文解释原因
better: <jp>更自然的母语者表达</jp>
:::
5. 学生要求测试、复习或评估时，结合学情即时出题并暖心点评。`);

  // ——— 学情档案注入（温习/初学/命中词 + 计数，有界）———
  const knowledgeBlock = extractPrioritizedKnowledge(learnedWords, learnedGrammar, currentUserInput, memoryMode);
  if (knowledgeBlock) sections.push(knowledgeBlock.trimStart());

  // ——— 跨会话记忆胶囊 ———
  const capsules = extractSessionCapsules(allSessions, currentSessionId, memoryMode);
  if (capsules) sections.push(capsules.trimStart());

  // 学情为空时的简记兜底
  if ((!learnedWords || learnedWords.length === 0) && (!learnedGrammar || learnedGrammar.length === 0)) {
    if (profile.weakPoints.length > 0 || profile.masteredGrammar.length > 0) {
      sections.push(`【学生档案简记】已掌握: ${profile.masteredGrammar.slice(-5).join(',')} | 薄弱点: ${profile.weakPoints.slice(-4).join(',')}`);
    }
  }

  // ——— 防失忆契约（精简版；上轮具体要求的原文由每轮动态注入追踪）———
  sections.push(`【练习验收与防失忆契约】
1. 你提出的练习/造句/跟读/提问都是【你要负责验收的契约】。回复前先回看自己上一轮说了什么——若你刚提过要求，学生本轮【默认是对该要求的作答】，按验收而非闲聊处理。
2. 验收流程：先肯定学生动手做了 → 对照你原要求检查（语法/词汇用对了吗、说完整了吗）→ 不到位处用 :::correction 温和纠错 → 给清晰下一步。
3. 严禁：把学生的作答当自发错误来批评、对学生按你要求说的话表示困惑、跳过验收跳新话题、原样重复你上一轮刚提过的同一要求。
4. 学生说“不会/太难”或提新疑问时，先安抚降难、给提示或先答疑，把原任务降级为可选，不强硬判分；只完成一部分时先肯定已做部分再引导补足。
5. 学情档案里已收录的词与语法都属于学生【已学知识】，严禁当成从未学过的新词从零科普（禁“今天我们来学一个新词…”式失忆）。`);

  // ——— 长程上下文记忆准则（独立、简短）———
  sections.push(`【长程连贯记忆准则】
1. 始终联系、回顾上文你与学生说过的例句、纠正与约定话题。
2. 学生说“刚才/上一个/你之前说的/那个特例”或省略主语追问时，必须精准追溯上文呼应解答，禁止答“我不记得/我没说过”或答非所问。
3. 前后观点与情境设定保持一致。`);

  // ——— 调试指令：仅当 debugMode 为真时注入 ———
  if (debugMode) {
    sections.push(`【系统诊断与调试指令支持（最高优先机制）】
当学生提问以“/debug”、“/prompt”、“/system”开头或含“调试模式”时：立即临时脱离角色扮演与私教人设，以客观、透明、真实的 AI 系统专家视角，如实汇报所询问的任何系统元信息（当前系统 Prompt 完整设定、识别到的水平、学情档案词汇语法记录状态、模型与参数等）；严禁以角色口吻回避，知无不言。`);
  }

  return sections.join('\n\n');
}

// Token Optimizer: Sliding window + Rolling Memory compression
export function optimizeMessagesContext(
  messages: ChatMessage[],
  systemPrompt: string,
  maxTurns: number = 16
): OptimizedPromptPayload {
  // 发送前估算：采用统一、贴近 GPT 系 tokenizer 的启发式（见 tokenCounter.ts）
  const targetCount = Math.max(8, (maxTurns || 16) * 2);
  let recentMessages: ChatMessage[] = [];
  let olderMessages: ChatMessage[] = [];

  if (messages.length <= targetCount) {
    recentMessages = [...messages];
  } else {
    let sliceStart = messages.length - targetCount;
    // If the starting message would be an assistant response, attempt to backtrack 1 message
    // to include the preceding user prompt so context remains natural and starts with user
    if (sliceStart > 0 && messages[sliceStart].role === 'assistant' && messages[sliceStart - 1].role === 'user') {
      sliceStart -= 1;
    }
    recentMessages = messages.slice(sliceStart);
    olderMessages = messages.slice(0, sliceStart);
  }

  // Format for OpenAI / LLM chat completions
  let effectiveSystemPrompt = systemPrompt;

  // Rolling Memory Compression: If there are older messages pruned from the sliding window,
  // distill a background memory digest so the AI never forgets earlier topics or promises
  if (olderMessages.length > 0) {
    const userTopics: string[] = [];
    const tutorHighlights: string[] = [];

    for (const m of olderMessages) {
      const clean = m.content.replace(/\[([^|\]]+)(?:\|[0-9]+)?\]/g, '$1').replace(/[{}｛｝]/g, '').replace(/[\r\n]+/g, ' ').trim();
      if (!clean) continue;
      const snippet = clean.length > 60 ? clean.substring(0, 60) + '…' : clean;
      if (m.role === 'user' && userTopics.length < 5) {
        userTopics.push(snippet);
      } else if (m.role === 'assistant' && tutorHighlights.length < 4) {
        // extract first sentence or main explanation
        tutorHighlights.push(snippet);
      }
    }

    const digestLines: string[] = [];
    if (userTopics.length > 0) {
      digestLines.push(`- 学生在更早前文曾问过或提及过：${userTopics.map((t, idx) => `(${idx + 1}) "${t}"`).join('；')}`);
    }
    if (tutorHighlights.length > 0) {
      digestLines.push(`- 你在此前曾讲解过的重点与情境：${tutorHighlights.map((t, idx) => `(${idx + 1}) "${t}"`).join('；')}`);
    }

    if (digestLines.length > 0) {
      effectiveSystemPrompt += `\n\n【更早前文对话记忆简报（共 ${olderMessages.length} 条已归档对话，请牢记并保持前后一致）】\n` +
        digestLines.join('\n') +
        `\n【重要要求】：学生随时可能回顾或追问上述更早之前讨论过的内容，请无缝结合该前文背景作答，切勿遗忘！`;
    }
  }

  // 待验收互动任务追踪：识别"上一轮助手消息中亲自提出的练习要求 / 提问"，
  // 并把要求原文注入 System Prompt，杜绝模型忘记自己刚布置的任务而产生错误反应。
  const lastAssistantMsg = [...recentMessages].reverse().find((m) => m.role === 'assistant');
  if (lastAssistantMsg?.content) {
    const pendingTask = detectPendingTask(lastAssistantMsg.content);
    if (pendingTask) {
      effectiveSystemPrompt += formatPendingTaskDirective(pendingTask);
    }
  }

  const formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: effectiveSystemPrompt },
  ];

  for (const m of recentMessages) {
    if (m.role === 'user' || m.role === 'assistant') {
      formattedMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  }

  const payloadTokens = formattedMessages.reduce((acc, m) => acc + countTokens(m.content), 0);

  return {
    systemPrompt: effectiveSystemPrompt,
    messages: formattedMessages,
    estimatedTokens: payloadTokens,
  };
}
