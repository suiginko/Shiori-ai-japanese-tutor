/**
 * 学情档案「生词本」收录提示链路回归测试
 *
 * 用法：node test_word_collection.cjs
 *
 * 锁定的契约：
 *   1) collectNewWordRefs 是纯函数：从本轮提取词中只挑出"此前未收录进生词本"的新词；
 *   2) 已收录词在对话中复现属日常复习，绝不提示（避免每条日文回复都命中若干已学词的噪音）；
 *   3) 本轮内重复 surface 自动去重；
 *   4) 结合 extractKnowledgeFromMessage：空生词本时抽到的词全视为新，全已收录时 ref 为空。
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

const { extractKnowledgeFromMessage, collectNewWordRefs } = requireTs(
  './src/utils/knowledgeExtractor.ts'
);

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.log('  FAIL ' + name);
  }
}

// 1. 纯函数：新词入档、已收录过滤、本轮内去重
const extracted = [
  { surface: '行きます', reading: 'いきます', level: 'N5', pos: '动词' },
  { surface: '食べます', reading: 'たべます', level: 'N5', pos: '动词' },
  { surface: '行きます', reading: 'いきます', level: 'N5', pos: '动词' }, // 重复表面
];
const refs1 = collectNewWordRefs(extracted, new Set(['食べます']));
check('只保留未收录的新词', refs1.length === 1 && refs1[0].surface === '行きます');
check('已收录词被过滤（不提示复习噪音）', !refs1.some((r) => r.surface === '食べます'));
check('本轮内重复表面去重', refs1.length === 1);

// 2. 空存量 -> 全部视为新词
const refs2 = collectNewWordRefs(
  [{ surface: '本', reading: 'ほん', level: 'N5', pos: '名词' }],
  new Set()
);
check('空生词本时全部视为新词', refs2.length === 1 && refs2[0].surface === '本');

// 3. 空 surface 被忽略
const refs3 = collectNewWordRefs(
  [{ surface: '  ', reading: 'ほん', level: 'N5', pos: '名词' }],
  new Set()
);
check('空白 surface 被忽略', refs3.length === 0);

// 4. 结合 extractKnowledgeFromMessage：空生词本时抽到的词全为新
const msg = {
  id: 'm1',
  role: 'assistant',
  content:
    '<jp>私は日本[にほん]に行きます。</jp> これは「新[あたら]しい」単語です。',
  timestamp: Date.now(),
  mode: 'tutor',
};
const { words } = extractKnowledgeFromMessage(msg);
check('extractKnowledgeFromMessage 能抽到单词', words.length >= 1);
const refs4 = collectNewWordRefs(words, new Set());
check(
  '空生词本时抽到词全为新',
  refs4.length === words.length &&
    words.every((w) => refs4.some((r) => r.surface === w.surface))
);

// 5. 全已收录 -> 无提示（复习不提示）
const existingAll = new Set(words.map((w) => w.surface));
const refs5 = collectNewWordRefs(words, existingAll);
check('全已收录时 ref 为空（复习不提示）', refs5.length === 0);

// 6. 部分已收录 -> 只提示真正的新词
if (words.length >= 2) {
  const partial = new Set([words[0].surface]);
  const refs6 = collectNewWordRefs(words, partial);
  check(
    '部分已收录时只提示新词',
    refs6.length === words.length - 1 &&
      !refs6.some((r) => r.surface === words[0].surface)
  );
}

console.log(`\n单词收录提示测试：${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
