/**
 * 学情档案「句型语法」采集链路回归测试
 *
 * 用法：node test_grammar_collection.cjs
 *
 * 锁定的契约：
 *   1) :::grammar 随堂精讲块：私教亲笔内容（接续/释义/语感点拨/双语例句）被完整采集；
 *   2) 系统块绝不泄漏：气泡渲染 / 朗读 / 上轮语义判定都看不到 :::grammar 字样；
 *   3) 只"用过"没"讲过"的句型不再被误收（旧的全文 matchPatterns 扫描已移除）；
 *   4) 「～X」显式引用与纠错块 grammar 字段：只在内置语法库能命中时才收录，
 *      库外句型一律不猜不编（杜绝「围绕「読みます」的句意表达」这类空洞条目）；
 *   5) 启动清洗：空洞历史脏条目被丢弃，同一句型（波浪线/空格差异）自动合并去重。
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// ---- 浏览器环境替身（必须在加载业务模块之前就位）----
const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

// ---- 带缓存的 TS 转译加载器（保证各模块共享同一实例）----
const moduleCache = new Map();
function requireTs(file) {
  const abs = path.resolve(file);
  if (moduleCache.has(abs)) return moduleCache.get(abs);

  const code = fs.readFileSync(abs, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  moduleCache.set(abs, mod.exports);
  new Function('require', 'module', 'exports', '__dirname', '__filename', js)(
    (id) => {
      if (id.startsWith('.')) {
        const p = path.resolve(path.dirname(abs), id);
        return requireTs(fs.existsSync(p + '.ts') ? p + '.ts' : p);
      }
      return require(id);
    },
    mod,
    mod.exports,
    path.dirname(abs),
    abs
  );
  return mod.exports;
}

// ---- 断言工具 ----
let passCount = 0;
let failCount = 0;
function check(name, cond, extra) {
  if (cond) {
    passCount++;
    console.log(`  \u2705 ${name}`);
  } else {
    failCount++;
    console.log(`  \u274c ${name}${extra ? ` -> ${extra}` : ''}`);
  }
}

const { extractKnowledgeFromMessage } = requireTs('./src/utils/knowledgeExtractor.ts');
const { synthesizeGrammarDetails, isGenericGrammarContent, normalizeGrammarKey } = requireTs(
  './src/utils/grammarSynthesizer.ts'
);
const { parseMessageSegments, stripSystemBlocks, stripRubyForTTS } = requireTs(
  './src/utils/rubyParser.ts'
);
const { sanitizeAndEnrichLearnedGrammar } = requireTs('./src/state/useAppStore.ts');

const msg = (content) => ({
  id: 'm1',
  role: 'assistant',
  content,
  timestamp: Date.now(),
  mode: 'chat',
});

/* =========================================================
   [1] :::grammar 精讲块：私教亲笔内容被完整采集
   ========================================================= */
console.log('\n===== [1] :::grammar 随堂精讲块采集 =====');
const GRAMMAR_BLOCK_MESSAGE = `<jp>日本料理を作ってみました</jp>（我试着做了日本料理。）

:::grammar
point: ～てみる
structure: 动词て形 + みる
meaning: 试着做某事（尝试进行某动作）
level: N4
note: 抱着试试看的心态去做，语气比「～ようとする」更轻快口语。
example: <jp>日本料理を作ってみました。</jp>
exampleCn: 我试着做了日本料理。
:::
`;
{
  const { grammars } = extractKnowledgeFromMessage(msg(GRAMMAR_BLOCK_MESSAGE));
  check('精讲块被采集为 1 条语法', grammars.length === 1, `实际 ${grammars.length}`);
  const g = grammars[0] || {};
  check('句型标题规范为 ～ 前缀写法', g.title === '～てみる', g.title);
  check('来源标记为「私教精讲」', g.source === '私教精讲', g.source);
  check('接续公式取自私教亲笔', g.structure === '动词て形 + みる', g.structure);
  check('释义取自私教亲笔', g.meaning === '试着做某事（尝试进行某动作）', g.meaning);
  check('语感点拨（note）被采集', (g.explanation || '').includes('试试看'), g.explanation);
  check('JLPT 等级被识别', g.level === 'N4', g.level);
  check(
    '例句剥掉 <jp> 标签保留日文',
    g.exampleJp === '日本料理を作ってみました。',
    g.exampleJp
  );
  check('例句中文译文被采集', g.exampleCn === '我试着做了日本料理。', g.exampleCn);
}

/* =========================================================
   [2] 系统块绝不泄漏到界面 / 朗读 / 语义判定
   ========================================================= */
console.log('\n===== [2] 系统块对界面完全不可见 =====');
{
  check(
    'stripSystemBlocks 剥除精讲块',
    !stripSystemBlocks(GRAMMAR_BLOCK_MESSAGE).includes(':::') &&
      !stripSystemBlocks(GRAMMAR_BLOCK_MESSAGE).includes('试试看')
  );
  check(
    'stripRubyForTTS 剥除精讲块（朗读不会读出元信息）',
    !stripRubyForTTS(GRAMMAR_BLOCK_MESSAGE).includes('::')
  );
  const segments = parseMessageSegments(GRAMMAR_BLOCK_MESSAGE);
  const joined = segments.map((s) => (s.type === 'text' ? s.content : '')).join('');
  check('气泡分段渲染无 ::: 残留', !joined.includes(':::'), joined);
  check('气泡中仍保留正文日文', joined.includes('日本料理を作ってみました'), joined);
  check(
    '漏写尾标记时不会吞掉整条回复',
    stripSystemBlocks(':::grammar\npoint: ～てみる\n\n接下来的正文应保留').includes('接下来的正文应保留')
  );
}

/* =========================================================
   [3] 只"用过"没"讲过"的句型不再被误收
   ========================================================= */
console.log('\n===== [3] 仅自然使用句型 → 不收录 =====');
{
  const plainUsage = `<jp>ちょっと待ってください。</jp>（请稍等一下。）
你的发音很准，我们继续下一句吧。`;
  const { grammars } = extractKnowledgeFromMessage(msg(plainUsage));
  check(
    '出现 てください 但未讲解 → 0 条收录',
    grammars.length === 0,
    grammars.map((g) => g.title).join(',')
  );

  const plainLong = `<jp>日本語を勉強しています。</jp>
这里的 ています 表示动作正在进行，你理解得很对！` ;
  const r2 = extractKnowledgeFromMessage(msg(plainLong));
  check(
    '行文中随意提到 ています 也不再被全文模式扫描误收',
    r2.grammars.every((g) => g.title !== '～ています'),
    r2.grammars.map((g) => g.title).join(',')
  );
}

/* =========================================================
   [4] 显式引用「～X」：库内收录，库外拒绝
   ========================================================= */
console.log('\n===== [4] 显式引用的收录边界 =====');
{
  const cited = `「～てみる」这个句型表示"试着做某事"，语气很轻快。`;
  const { grammars } = extractKnowledgeFromMessage(msg(cited));
  check('库内句型「～てみる」被收录', grammars.length === 1, `实际 ${grammars.length}`);
  check('来源标记为「语法实战」', grammars[0]?.source === '语法实战', grammars[0]?.source);
  check(
    '释义来自内置语法库（非私教流水线）',
    (grammars[0]?.meaning || '').length > 4 && !/句意表达/.test(grammars[0]?.meaning || ''),
    grammars[0]?.meaning
  );

  const unknown = `「～ますまいこと」也是一个用法哦。`;
  const r2 = extractKnowledgeFromMessage(msg(unknown));
  check(
    '库外句型一律不猜不编（0 条）',
    r2.grammars.length === 0,
    r2.grammars.map((g) => `${g.title}=${g.meaning}`).join(' | ')
  );
}

/* =========================================================
   [5] 纠错块 grammar 字段
   ========================================================= */
console.log('\n===== [5] 纠错块 grammar 字段采集 =====');
{
  const correction = `你这个句子的助词需要调整一下哦。

:::correction
original: 私が行くを思います。
corrected: <jp>私は行くと思います。</jp>
explanation: 引用内容要用「と」提示。
grammar: ～と思います
:::`;
  const { grammars } = extractKnowledgeFromMessage(msg(correction));
  check('纠错块 grammar 字段被采集', grammars.length === 1, `实际 ${grammars.length}`);
  check('来源标记为「纠错点拨」', grammars[0]?.source === '纠错点拨', grammars[0]?.source);
  check(
    '例句优先用学生被纠正后的真实句子',
    grammars[0]?.exampleJp === '私は行くと思います。',
    grammars[0]?.exampleJp
  );
  check('剥掉 <jp> 后无标签残留', !/</.test(grammars[0]?.exampleJp || ''), grammars[0]?.exampleJp);
}

/* =========================================================
   [6] 启动清洗：丢弃空洞脏条目 + 同句型去重
   ========================================================= */
console.log('\n===== [6] 学情档案清洗与去重 =====');
{
  check(
    'isGenericGrammarContent 识别旧的空洞合成条目',
    isGenericGrammarContent({
      title: '～読みます',
      structure: '地点/场所名词 + で + 読みます',
      meaning: '围绕「読みます」的句意表达',
      explanation: '包含格助词「で」…在对话中表达具体的语境动作。',
    }) === true
  );
  check(
    '真实内容不被误判为空洞',
    isGenericGrammarContent({
      title: '～てください',
      structure: '动词て形 + ください',
      meaning: '请做某事（礼貌请求、指示与劝诱）',
      explanation: '动词连接式「て形」后接「ください」，表达礼貌的委托。',
    }) === false
  );

  const junk = {
    id: 'junk',
    title: '～読みます',
    structure: '地点/场所名词 + で + 読みます',
    meaning: '围绕「読みます」的句意表达',
    explanation: '包含格助词「で」，引导分句中的关键动作成分。',
    level: 'N4',
    mastery: 'learning',
    reviewCount: 1,
    learnedAt: 1,
  };
  const dupLow = {
    id: 'dup-low',
    title: '～てください',
    structure: '动词て形 + ください',
    meaning: '请做某事（礼貌请求）',
    explanation: '礼貌地请求对方做某事。',
    level: 'N5',
    mastery: 'learning',
    reviewCount: 1,
    learnedAt: 10,
  };
  const dupHigh = {
    id: 'dup-high',
    title: 'てください',
    structure: '动词て形 + ください',
    meaning: '请做某事（礼貌请求）',
    explanation: '礼貌地请求对方做某事。',
    level: 'N5',
    mastery: 'reviewing',
    reviewCount: 3,
    learnedAt: 20,
  };
  const noExample = {
    id: 'with-ex',
    title: '～たことがある',
    structure: '动词た形 + ことがある',
    meaning: '曾经有过某种经历',
    explanation: '表示过去曾经发生的经历体验。',
    level: 'N5',
    mastery: 'learning',
    reviewCount: 1,
    learnedAt: 5,
    exampleJp: '富士山に登ったことがあります。',
  };

  const cleaned = sanitizeAndEnrichLearnedGrammar([junk, dupLow, dupHigh, noExample]);
  const titles = cleaned.map((g) => g.title);
  check('空洞脏条目被丢弃', !titles.some((t) => t.includes('読みます')), titles.join(','));
  check('结果只剩 2 条', cleaned.length === 2, `实际 ${cleaned.length}（${titles.join(',')}）`);
  check(
    '同一句型（～てください / てください）合并为一条',
    cleaned.filter((g) => normalizeGrammarKey(g.title) === 'てください').length === 1
  );
  check(
    '合并时保留掌握度更高的那条',
    cleaned.find((g) => normalizeGrammarKey(g.title) === 'てください')?.mastery === 'reviewing'
  );
  check('例句字段未丢失', !!cleaned.find((g) => g.id === 'with-ex')?.exampleJp);
}

/* =========================================================
   [7] 合成器兜底结果必须自带 isGeneric 标记
   ========================================================= */
console.log('\n===== [7] 合成器的空洞标记 =====');
{
  const known = synthesizeGrammarDetails('～てください');
  check('库内句型不是空洞合成', known.isGeneric !== true, JSON.stringify(known.isGeneric));
  const unknown = synthesizeGrammarDetails('～ますまいこと');
  check('库外句型被标记为空洞合成', unknown.isGeneric === true, unknown.meaning);
  // 无论命中内置库还是走词尾活用特征识别，只要不是空洞合成即为有效内容
  const tailForm = synthesizeGrammarDetails('～たくないです');
  check(
    '词尾活用特征识别仍是有效内容（非空洞）',
    tailForm.isGeneric !== true &&
      !isGenericGrammarContent(tailForm) &&
      tailForm.meaning.trim().length >= 4,
    `${tailForm.meaning} / isGeneric=${tailForm.isGeneric}`
  );
}

console.log(`\n结果：${passCount} 通过 / ${failCount} 失败`);
process.exitCode = failCount === 0 ? 0 : 1;
