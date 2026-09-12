/**
 * 划词翻译链路回归测试
 *
 * 用法：node test_dictionary_lookup.cjs
 *
 * 覆盖本次「划词翻译」优化的关键契约：
 *   1) 单词注入白名单：短语 / 句型 / 整句绝不污染 DICT_BY_WORD 全局分词词典；
 *   2) 缓存消毒只清「短小助词粘连脏词条」，长句 / 短语的 AI 缓存必须原样保留（否则会反复重新查询）；
 *   3) AI 并发去重：同一查询重复触发只发一次请求（关闭浮窗后再次划选同一段文本的场景）；
 *   4) 提示词范畴契约：短语/句型/整句要求输出 breakdown 成分拆解、句子省略 pitch/level；
 *   5) 解析层程序化兜底：句子强制剥离 pitch/level，breakdown 脏数据被清洗。
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

const DICT_CACHE_KEY = 'agy_jp_dict_cache_v1';
const LONG_SENTENCE = '図書館で本を読みます';
const GLUED_DIRTY = 'に行';
const PHRASE = '気がする';

// AI 服务配置：dictionaryService.fetchAiDefinition 从 localStorage 读取
storage.set(
  'agy_jp_settings_v1',
  JSON.stringify({
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://example.com/v1',
    model: 'test-model',
  })
);

// 预置本地缓存：
//   1) 一个长句 AI 词条（必须保留）
//   2) 一个短语 AI 词条（保留在缓存，但绝不注入离线分词词典）
//   3) 一个短小粘连脏词条（必须清除）
storage.set(
  DICT_CACHE_KEY,
  JSON.stringify({
    [GLUED_DIRTY]: { word: GLUED_DIRTY, reading: 'にいく', meaning: '脏词条', source: 'ai' },
    [PHRASE]: {
      word: PHRASE,
      reading: 'きがする',
      pos: '惯用句',
      meaning: '感觉……',
      source: 'ai',
      isPlaceholder: false,
      queryType: 'phrase',
    },
    [LONG_SENTENCE]: {
      word: LONG_SENTENCE,
      reading: 'としょかんでほんをよみます',
      pos: '句子表达',
      meaning: '在图书馆读书。',
      detail: '陈述句，表示习惯性动作。',
      breakdown: [{ jp: '図書館で', zh: '在图书馆', role: '地点状语' }],
      source: 'ai',
      isPlaceholder: false,
      queryType: 'sentence',
    },
  })
);

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

const {
  dictionaryService,
  isTrueSingleWordTerm,
  isShortGluedQuery,
  normalizeQueryTerm,
} = requireTs('./src/services/dictionaryService.ts');
const { DICT_BY_WORD } = requireTs('./src/data/dictionaryData.ts');
const { queryWordDefinitionFromLLM, sanitizeAnnotatedText } = requireTs('./src/services/llmService.ts');
const { parseJapaneseContent } = requireTs('./src/utils/rubyParser.ts');

const TEST_SETTINGS = {
  provider: 'openai',
  apiKey: 'test-key',
  baseUrl: 'https://example.com/v1',
  model: 'test-model',
};

/** 可编程的 fetch 替身：记录每次请求体，按队列返回 JSON 内容 */
let fetchCalls = 0;
let lastRequestBody = null;
let responseQueue = [];
global.fetch = async (_url, init) => {
  fetchCalls++;
  try {
    lastRequestBody = JSON.parse(init.body);
  } catch {
    lastRequestBody = null;
  }
  const content = responseQueue.length > 0 ? responseQueue.shift() : '{}';
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
};

function resetFetch(queue) {
  fetchCalls = 0;
  lastRequestBody = null;
  responseQueue = queue || [];
}

console.log('\n===== [1] 单词注入白名单（绝不污染 DICT_BY_WORD）=====');
check('单个词条 食べる 判定为可注入', isTrueSingleWordTerm('食べる') === true);
check('整句 图书馆读句 判定为不可注入', isTrueSingleWordTerm(LONG_SENTENCE) === false);
check('带标点的短内容 判定为不可注入', isTrueSingleWordTerm('行く。') === false);
check('助词粘连 に行 判定为不可注入', isTrueSingleWordTerm(GLUED_DIRTY) === false);
check(
  '形态层无法分辨的4字短语由 queryType 兜底拦截（気がする）',
  DICT_BY_WORD.has(PHRASE) === false
);

console.log('\n===== [2] 缓存消毒范围（只清短脏词，保留长句/短语）=====');
check(
  `长句「${LONG_SENTENCE}」的 AI 缓存被保留`,
  dictionaryService.lookup(LONG_SENTENCE).meaning === '在图书馆读书。',
  dictionaryService.lookup(LONG_SENTENCE).meaning
);
check(
  '长句的成分拆解(breakdown)随缓存一同保留',
  Array.isArray(dictionaryService.lookup(LONG_SENTENCE).breakdown) &&
    dictionaryService.lookup(LONG_SENTENCE).breakdown.length === 1
);
check(
  '长句缓存命中后不再标记为占位（不会触发重复 AI 查询）',
  dictionaryService.lookup(LONG_SENTENCE).isPlaceholder !== true
);
check(
  '长句未被注入离线分词词典 DICT_BY_WORD',
  DICT_BY_WORD.has(LONG_SENTENCE) === false
);
{
  const persisted = JSON.parse(storage.get(DICT_CACHE_KEY) || '{}');
  check('短小粘连脏词条 に行 已从本地缓存中清除', persisted[GLUED_DIRTY] === undefined);
  check('长句条目仍写回本地缓存', persisted[LONG_SENTENCE] !== undefined);
  check('短语条目仍保留在本地缓存（可离线复现，不重复查询）', persisted[PHRASE] !== undefined);
}
check('isShortGluedQuery 识别短脏词', isShortGluedQuery(GLUED_DIRTY) === true);
check('isShortGluedQuery 放过长句', isShortGluedQuery(LONG_SENTENCE) === false);

console.log('\n===== [3] 查询词条规范化边界 =====');
check(
  '长句绝不被当作助词粘连短语剥离',
  normalizeQueryTerm(LONG_SENTENCE).normalizedWord === LONG_SENTENCE &&
    normalizeQueryTerm(LONG_SENTENCE).isGrammarPhrase === false
);
check(
  '短小粘连短语 に行 仍还原为 行く',
  normalizeQueryTerm(GLUED_DIRTY).normalizedWord === '行く'
);

console.log('\n===== [4] AI 并发去重（不重复查询）=====');
(async () => {
  resetFetch([
    JSON.stringify({
      queryType: 'phrase',
      word: 'dedupe-测试',
      reading: 'でぃーでゅーぷてすと',
      pos: '惯用句',
      meaning: '并发去重测试',
      detail: 'd',
      breakdown: [{ jp: 'dedupe', zh: '去重', role: '测试块' }],
      examples: [],
    }),
  ]);

  const [r1, r2] = await Promise.all([
    dictionaryService.fetchAiDefinition('dedupe-测试', undefined, { sentenceContext: 'ctx' }),
    dictionaryService.fetchAiDefinition('dedupe-测试', undefined, { sentenceContext: 'ctx' }),
  ]);

  check('同一查询并发触发只发出 1 次网络请求', fetchCalls === 1, `实际 ${fetchCalls} 次`);
  check('两个并发调用拿到同一份结果', !!r1 && !!r2 && r1.meaning === r2.meaning);
  check('短语结果的 breakdown 被完整透传', Array.isArray(r1 && r1.breakdown) && r1.breakdown.length === 1);

  console.log('\n===== [5] 提示词范畴契约 =====');
  resetFetch(['{"queryType":"sentence","word":"x","reading":"x","meaning":"x"}']);
  await queryWordDefinitionFromLLM(LONG_SENTENCE, undefined, TEST_SETTINGS, {});
  const jpPrompt = lastRequestBody ? lastRequestBody.messages[0].content : '';
  check('日文解析提示词含 breakdown 字段规范', jpPrompt.includes('"breakdown"'));
  check('日文解析提示词要求成分拆解', jpPrompt.includes('成分拆解') || jpPrompt.includes('拆解句子成分'));
  check('日文解析提示词明确句子省略 pitch/level', jpPrompt.includes('省略 pitch'));

  resetFetch(['{"queryType":"sentence","word":"x","reading":"x","meaning":"x"}']);
  await queryWordDefinitionFromLLM('我想喝咖啡', undefined, TEST_SETTINGS, {});
  const cnPrompt = lastRequestBody ? lastRequestBody.messages[0].content : '';
  check('中文查日文提示词含 breakdown 字段规范', cnPrompt.includes('"breakdown"'));
  check('中文查日文提示词区分单词与句子的输出', cnPrompt.includes('绝不千篇一律'));

  console.log('\n===== [6] 解析层程序化兜底 =====');
  resetFetch([
    JSON.stringify({
      queryType: 'sentence',
      word: LONG_SENTENCE,
      reading: 'としょかんでほんをよみます',
      pos: '句子表达',
      pitch: 0,
      level: 'N4',
      meaning: '在图书馆读书。',
      detail: '陈述句。',
      breakdown: [
        { jp: '図書館で', zh: '在图书馆', role: '地点状语' },
        { jp: '', zh: '空片段应被清洗' },
        { jp: '本を読みます', zh: '读书', role: '谓语' },
      ],
      examples: [],
    }),
  ]);
  const parsed = await queryWordDefinitionFromLLM(LONG_SENTENCE, undefined, TEST_SETTINGS, {});
  check('句子类型强制剥离 pitch', parsed && parsed.pitch === undefined, String(parsed && parsed.pitch));
  check('句子类型强制剥离 level', parsed && parsed.level === undefined, String(parsed && parsed.level));
  check('breakdown 中的空片段被清洗', parsed && parsed.breakdown && parsed.breakdown.length === 2);
  check('句子译文被完整保留', parsed && parsed.meaning === '在图书馆读书。');

  console.log('\n===== [7] 标题注音串 {原文[读音]} 契约 =====');

  // 7.1 提示词必须把「逐词注音串」写进 JSON 规范（中→日 与 日→中 两条分支都要有）
  resetFetch(['{"queryType":"sentence","word":"x","reading":"x","meaning":"x"}']);
  await queryWordDefinitionFromLLM(LONG_SENTENCE, undefined, TEST_SETTINGS, {});
  const jpPrompt2 = lastRequestBody ? lastRequestBody.messages[0].content : '';
  check('日文解析提示词含 annotated 字段规范', jpPrompt2.includes('"annotated"'));
  check('日文解析提示词给出 {原文[读音]} 示例', jpPrompt2.includes('{図書館[としょかん]}'));
  check(
    '日文解析提示词要求一花括号只圈一个词',
    jpPrompt2.includes('只圈【一个词】') || jpPrompt2.includes('只圈一个词')
  );

  resetFetch(['{"queryType":"sentence","word":"x","reading":"x","meaning":"x"}']);
  await queryWordDefinitionFromLLM('我想喝咖啡', undefined, TEST_SETTINGS, {});
  const cnPrompt2 = lastRequestBody ? lastRequestBody.messages[0].content : '';
  check('中文查日文提示词含 annotated 字段规范', cnPrompt2.includes('"annotated"'));
  check('中文查日文提示词给出 {原文[读音]} 示例', cnPrompt2.includes('{図書館[としょかん]}'));

  // 7.2 解析层：逐词注音串须清洗 + 与正文一致性校验
  resetFetch([
    JSON.stringify({
      queryType: 'sentence',
      word: LONG_SENTENCE,
      reading: 'としょかんでほんをよみます',
      meaning: '在图书馆读书。',
      annotated: '{図書館[としょかん]}で{本[ほん]}を{読[よ]}みます',
      examples: [],
    }),
  ]);
  const withAnnotated = await queryWordDefinitionFromLLM(LONG_SENTENCE, undefined, TEST_SETTINGS, {});
  check(
    '逐词注音串被透传到解析结果',
    !!withAnnotated && withAnnotated.annotated === '{図書館[としょかん]}で{本[ほん]}を{読[よ]}みます',
    String(withAnnotated && withAnnotated.annotated)
  );

  resetFetch([
    JSON.stringify({
      queryType: 'sentence',
      word: LONG_SENTENCE,
      reading: 'としょかんでほんをよみます',
      meaning: '在图书馆读书。',
      annotated: '{全然[ぜんぜん]}{別[べつ]}の{文[ぶん]}',
      examples: [],
    }),
  ]);
  const mismatched = await queryWordDefinitionFromLLM(LONG_SENTENCE, undefined, TEST_SETTINGS, {});
  check(
    '注音串与正文不一致时被丢弃（防模型串台）',
    !!mismatched && mismatched.annotated === undefined,
    String(mismatched && mismatched.annotated)
  );

  resetFetch([
    JSON.stringify({
      queryType: 'word',
      word: '食べる',
      reading: 'たべる',
      meaning: '吃',
      annotated: '{食[た]}べる',
      examples: [],
    }),
  ]);
  const wordEntry = await queryWordDefinitionFromLLM('食べる', undefined, TEST_SETTINGS, {});
  check('单词类型不输出逐词注音串（标题本就用 FuriganaTitle）', !!wordEntry && wordEntry.annotated === undefined);

  // 7.3 纯函数：注音串清洗规则（纯假名不注音 / 畸形括号剥离 / 空值拒绝）
  check(
    '纯假名与片假名宿主被剥掉注音只留原文',
    sanitizeAnnotatedText('{コーヒー[こーひー]}を{飲[の]}む') === 'コーヒーを{飲[の]}む',
    String(sanitizeAnnotatedText('{コーヒー[こーひー]}を{飲[の]}む'))
  );
  check('读音与原文相同则降级为纯文本', sanitizeAnnotatedText('{ありがとう[ありがとう]}') === undefined);
  check('无任何有效注音块时返回 undefined', sanitizeAnnotatedText('{コーヒー}を飲む') === undefined);
  check('不成对花括号被剥离', sanitizeAnnotatedText('{図書館[としょかん]で本を読む') === undefined);
  check('换行与代码围栏被清理', sanitizeAnnotatedText('```json\n{図書館[としょかん]}で{本[ほん]}を読む\n```') === '{図書館[としょかん]}で{本[ほん]}を読む');

  // 7.4 渲染闭环：提示词承诺的格式必须能被真实注音引擎渲染出振假名
  {
    const annotated = sanitizeAnnotatedText('{図書館[としょかん]}で{本[ほん]}を{読[よ]}みます');
    const tokens = parseJapaneseContent(annotated, {
      isExplicitJapanese: true,
      showPlainFurigana: true,
      hideMasteredFurigana: false,
    });
    const rubyTokens = tokens.filter((t) => t.type === 'ruby');
    const surfaces = rubyTokens.map((t) => t.surface).join(',');
    const readings = rubyTokens.map((t) => t.reading).join(',');
    check('注音串渲染出 3 个振假名块', rubyTokens.length === 3, `实际 ${rubyTokens.length}（${surfaces}）`);
    check('汉字宿主与读音一一对应', surfaces === '図書館,本,読' && readings === 'としょかん,ほん,よ', `${surfaces} / ${readings}`);
    const flat = tokens.map((t) => t.surface + (t.okurigana || '')).join('');
    check('面板文字不含任何 {} 系统标记', !/[{｛}｝]/.test(flat));
    check(
      '助词与送假名以纯文本保留',
      flat.includes('で') && flat.includes('を') && flat.includes('みます'),
      flat
    );
  }

  // 7.5 小窗 UI 文案与占位标签契约（源码级，锁定不可回归）
  {
    const popoverSrc = fs.readFileSync(
      path.resolve(__dirname, './src/components/Chat/WordDictionaryPopover.tsx'),
      'utf8'
    );
    check(
      '小窗隐藏占位分类tag（汉字词汇 / 假名词汇）',
      popoverSrc.includes('MEANINGLESS_POS_LABELS') &&
        popoverSrc.includes("'汉字词汇'") &&
        popoverSrc.includes("'假名词汇'")
    );
    check(
      '词性徽章只在有信息量时渲染',
      popoverSrc.includes('posIsInformative && <span className="dict-pos-badge">')
    );
    check('收藏按钮统一文案为「收藏 / 已收藏」', popoverSrc.includes("wordIsSaved ? '已收藏' : '收藏'"));
    check(
      '小窗「原查词」已改为「查询内容」',
      popoverSrc.includes('查询内容：') && !popoverSrc.includes('原查词：')
    );
    check(
      '非单词收藏走独立集合（不写生词本）',
      popoverSrc.includes('onSaveExpression') && popoverSrc.includes("queryKind !== 'word'")
    );
  }

  console.log(`\n结果：${passCount} 通过 / ${failCount} 失败`);
  process.exit(failCount === 0 ? 0 : 1);
})();
