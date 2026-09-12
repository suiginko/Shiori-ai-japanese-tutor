const fs = require('fs');
const ts = require('typescript');
const path = require('path');

function requireTs(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const m = { exports: {} };
  const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', js);
  fn((id) => {
    if (id.startsWith('.')) {
      const p = path.resolve(path.dirname(filePath), id);
      const candidate = fs.existsSync(p + '.ts') ? p + '.ts' : p;
      return requireTs(candidate);
    }
    return require(id);
  }, m, m.exports, path.dirname(filePath), filePath);
  return m.exports;
}

const { parseJapaneseContent } = requireTs('./src/utils/rubyParser.ts');

function show(tokens) {
  return tokens.map(t => {
    const body = t.type === 'text' ? `TEXT[${t.surface}]` : `${t.surface}${t.reading ? `[${t.reading}]` : ''}${t.okurigana ? `+${t.okurigana}` : ''}`;
    const flags = [
      t.hideFurigana ? 'HIDE' : '',
      t.mastery ? `mastery:${t.mastery}` : '',
      t.prefixKana ? `prefix:${t.prefixKana}` : '',
    ].filter(Boolean).join(',');
    return `${body}${flags ? ` <${flags}>` : ''}`;
  }).join('  ');
}

const cases = [
  ['心配', '<jp>心配しないでください。</jp>', {}],
  ['教えて', '<jp>ぜひ教えてください。</jp>', {}],
  ['食べました', '<jp>昨日パンを食べました。</jp>', {}],
  ['桜(单字兜底)', '<jp>桜が咲きました。</jp>', {}],
  ['角(显式)', '<jp>部屋の角[かど]に置きました。</jp>', {}],
  ['行きます(误注矫正)', '<jp>今日は東京へ行きます。</jp>', {}],
  ['やる気(混合词)', '<jp>やる気があります。</jp>', {}],
  ['掌握隐藏(食べる)', '<jp>昼ご飯を食べました。</jp>', { masteredWords: new Set(['食べる']) }],
];

for (const [name, text, opts] of cases) {
  const tokens = parseJapaneseContent(text, {
    masteredWords: opts.masteredWords,
    hideMasteredFurigana: true,
    showPlainFurigana: true,
  });
  console.log(`\n[${name}] ${text}`);
  console.log('  ' + show(tokens));
}

// ===== 花括号宿主块回归断言 =====
console.log('\n===== 花括号宿主块断言 =====');
// 注：本文件 show() 用 surface[reading] 表示已注音 token（非泄漏），花括号被剥则输出中无 { }
const braceCases = [
  ['标准块 剥花括号+宿主精确', '<jp>この{野菜[やさい]}が好きです。</jp>', (s) => s.includes('野菜[やさい]') && !/[\{\}]/.test(s)],
  ['活用整词块 送假名吸收', '<jp>{食べました[たべました]}。</jp>', (s) => s.includes('食[た]+べました') && !/[\{\}]/.test(s)],
  ['词干块+外送假名吸收', '<jp>{食[た]}べました。</jp>', (s) => s.includes('食[た]+べました') && !/[\{\}]/.test(s)],
  ['多词逐块', '<jp>{母[はは]}と{魚[さかな]}を買いました。</jp>', (s) => s.includes('母[はは]') && s.includes('魚[さかな]') && !/[\{\}]/.test(s)],
  ['片假名块 干净无泄漏', '<jp>{テレビ[てれび]}を見ます。</jp>', (s) => !s.includes('[てれび]') && !/[\{\}]/.test(s)],
  ['错位{野菜}[やさい] 容错归一', '<jp>{野菜}[やさい]が好きです。</jp>', (s) => s.includes('野菜[やさい]') && !/[\{\}]/.test(s)],
  ['专名整词块', '<jp>{東京大学[とうきょうだいがく]}の学生です。</jp>', (s) => s.includes('東京大学[とうきょうだいがく]') && !/[\{\}]/.test(s)],
];
// 圆括号不被当注音（灰字注释约定）：cleanOrphanedRubyBrackets 不得改写 （假名） 为 [假名]
const cleanChecks = [
  ['标签外汉字+（假名）保持原文', '食べる（たべる）', (s) => s === '食べる（たべる）'],
  ['</jp>后（假名）不被吸入标签', '<jp>準備</jp>（じゅんび）：准备', (s) => s.includes('</jp>（じゅんび）')],
  ['标签内（假名）也不转注音', '<jp>角(かど)</jp>', (s) => s.includes('角(かど)') && !s.includes('[かど]')],
];
let cleanOk = 0;
const { cleanOrphanedRubyBrackets } = requireTs('./src/utils/rubyParser.ts');
console.log('\n===== 圆括号=灰字注释（不被当注音）断言 =====');
for (const [name, text, check] of cleanChecks) {
  const out = cleanOrphanedRubyBrackets(text);
  const pass = check(out);
  if (pass) cleanOk++;
  console.log(`  ${pass ? '✅' : '❌'} [${name}] ${text} => ${out}`);
}
console.log(`圆括号断言通过 ${cleanOk}/${cleanChecks.length}`);
if (cleanOk !== cleanChecks.length) process.exit(1);
let braceOk = 0;
for (const [name, text, check] of braceCases) {
  const tokens = parseJapaneseContent(text, { hideMasteredFurigana: false, showPlainFurigana: true });
  const s = show(tokens);
  const pass = check(s);
  if (pass) braceOk++;
  console.log(`  ${pass ? '✅' : '❌'} [${name}] ${text}`);
  if (!pass) console.log(`     实际: ${s}`);
}
console.log(`花括号断言通过 ${braceOk}/${braceCases.length}`);
if (braceOk !== braceCases.length) process.exit(1);

// ===== 日文标签与 Markdown 嵌套规范化（防止标签被腰斩撕裂）断言 =====
console.log('\n===== 日文标签与 Markdown 嵌套断言 =====');
const { normalizeJapaneseMarkdownTags } = requireTs('./src/utils/rubyParser.ts');

const mdTagCases = [
  [
    '用户案例：日文块内嵌入粗体',
    '<jp>{三船栞子[みふねしおりこ]}**について**どう思いますか。</jp>',
    (out) =>
      out === '<jp>{三船栞子[みふねしおりこ]}</jp>**<jp>について</jp>**<jp>どう思いますか。</jp>'
  ],
  [
    '日文块开头嵌入粗体',
    '<jp>**これ**はペンです。</jp>',
    (out) => out === '**<jp>これ</jp>**<jp>はペンです。</jp>'
  ],
  [
    '日文块末尾嵌入粗体',
    '<jp>これは**ペン**</jp>',
    (out) => out === '<jp>这是</jp>**<jp>ペン</jp>**' || out === '<jp>これは</jp>**<jp>ペン</jp>**'
  ],
  [
    '日文块内多个粗体',
    '<jp>**A**と**B**</jp>',
    (out) => out === '**<jp>A</jp>**<jp>と</jp>**<jp>B</jp>**'
  ],
  [
    '粗斜体与斜体嵌套',
    '<jp>これは***とても***、*いい*天気ですね。</jp>',
    (out) => out === '<jp>これは</jp>***<jp>とても</jp>***<jp>、</jp>*<jp>いい</jp>*<jp>天気ですね。</jp>'
  ],
  [
    '无 Markdown 日文块原样保持',
    '<jp>こんにちは！</jp>',
    (out) => out === '<jp>こんにちは！</jp>'
  ],
];

let mdTagOk = 0;
for (const [name, text, check] of mdTagCases) {
  const out = normalizeJapaneseMarkdownTags(text);
  const pass = check(out);
  if (pass) mdTagOk++;
  console.log(`  ${pass ? '✅' : '❌'} [${name}] ${text} => ${out}`);
}
console.log(`日文与Markdown嵌套断言通过 ${mdTagOk}/${mdTagCases.length}`);
if (mdTagOk !== mdTagCases.length) process.exit(1);

// ===== 验证经过 Markdown 切分后送入 parseJapaneseContent 无任何 <jp> / </jp> 泄漏 =====
console.log('\n===== 拆分后解析无 <jp> 裸露断言 =====');
const sampleUserText = '<jp>{三船栞子[みふねしおりこ]}**について**どう思いますか。</jp>';
const normalized = normalizeJapaneseMarkdownTags(sampleUserText);
const mdRegex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[^\*\n]+?\*|~~[\s\S]+?~~|`[^`\n]+?`)/g;
const parts = normalized.split(mdRegex);

let allTokens = [];
for (const part of parts) {
  let inner = part;
  if (part.startsWith('**') && part.endsWith('**')) inner = part.slice(2, -2);
  const tokens = parseJapaneseContent(inner);
  allTokens.push(...tokens);
}

const hasLeakedTag = allTokens.some(
  (t) => t.type === 'text' && /<\/?(?:jp|j|p)>/i.test(t.surface)
);
console.log(`  ${!hasLeakedTag ? '✅' : '❌'} 用户案例所有拆分 Token 中无任何 <jp> 或 </jp> 泄漏:`, allTokens.map(t => t.surface).join(' | '));
if (hasLeakedTag) process.exit(1);

// ===== 划词查询完成词条高亮断言 =====
console.log('\n===== 划词查询词条高亮断言 =====');
const queriedSet = new Set(['三船栞子', 'について', 'どう思いますか']);

// 1. 标签外普通文本（如用户发言）划词查询后的高亮断言
const plainUserMessage = '请问三船栞子是什么角色？';
const plainTokens = parseJapaneseContent(plainUserMessage, { queriedTerms: queriedSet });
const foundPlainQueried = plainTokens.find(t => t.surface === '三船栞子' && t.type === 'plain-word' && t.isQueried);
console.log(`  ${foundPlainQueried ? '✅' : '❌'} 标签外普通文本命中已查询词条:`, plainTokens.map(t => `${t.type}:${t.surface}`).join(' | '));
if (!foundPlainQueried) process.exit(1);

// 2. 标签内语法短语（如 について）划词查询后整体作为单个已查询词发射断言
const jpTextWithGrammar = '<jp>この本について話しましょう。</jp>';
const jTokens = parseJapaneseContent(jpTextWithGrammar, { queriedTerms: queriedSet });
const foundJpGrammar = jTokens.find(t => t.surface === 'について' && t.type === 'plain-word' && t.isQueried);
console.log(`  ${foundJpGrammar ? '✅' : '❌'} 标签内已查询语法短语作为整体词发射:`, jTokens.map(t => `${t.type}:${t.surface}`).join(' | '));
if (!foundJpGrammar) process.exit(1);

// 3. 长句型（7+ 字符，如 どう思いますか）划词查询后作为整体词发射断言
const jpSentence = '<jp>これについてどう思いますか。</jp>';
const sentenceTokens = parseJapaneseContent(jpSentence, { queriedTerms: queriedSet });
const foundSentence = sentenceTokens.find(t => t.surface === 'どう思いますか' && t.type === 'plain-word' && t.isQueried);
console.log(`  ${foundSentence ? '✅' : '❌'} 长短语/句型划词查询后作为整体词发射:`, sentenceTokens.map(t => `${t.type}:${t.surface}`).join(' | '));
if (!foundSentence) process.exit(1);

console.log('\n🎉 所有断言全部通过！');

