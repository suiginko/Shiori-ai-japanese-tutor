/**
 * 对话 System Prompt 结构回归测试 / 裁剪量化
 *
 * 用法：
 *   node test_prompt.cjs [baseline|after]   （无参 = after，打印各模式 token）
 *
 * 用途：
 *   1) 对比重构前后各模式 systemPrompt 的 token 量与关键输出契约是否保留；
 *   2) 校验 <jp> 包裹 / 禁圆括号注音 / :::correction 纠错块 / 调试按需注入 等契约未丢失。
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function requireTs(file) {
  const code = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', '__dirname', '__filename', js)(
    (id) => {
      if (id.startsWith('.')) {
        const p = path.resolve(path.dirname(file), id);
        return requireTs(fs.existsSync(p + '.ts') ? p + '.ts' : p);
      }
      return require(id);
    },
    mod,
    mod.exports,
    path.dirname(file),
    file
  );
  return mod.exports;
}

const { buildSystemPrompt, getStageLanguageDensityInstruction } = requireTs('./src/services/tokenOptimizer.ts');
const { countTokens } = requireTs('./src/utils/tokenCounter.ts');

const settings = { aiTutorName: 'Shiori', aiNameReading: 'しおり', userName: '小明', crossSessionMemoryMode: 'standard' };
const emptyProfile = { level: 'N5', levelLabel: 'N5', masteredGrammar: [], weakPoints: [], strengths: [] };

function makeProfile(level) {
  return { level, levelLabel: level, masteredGrammar: ['て形'], weakPoints: ['助词は/が'], strengths: [] };
}

const LEVELS = ['N0', 'N5', 'N4', 'N3', 'N2', 'N1'];
const phase = process.argv[2] || 'after';

console.log(`\n===== ${phase.toUpperCase()}：各等级空学情 systemPrompt token =====`);
const baselineEmpty = {};
for (const lvl of LEVELS) {
  const p = buildSystemPrompt('tutor', makeProfile(lvl), undefined, settings, [], [], [], 's1', '', false);
  baselineEmpty[lvl] = countTokens(p);
  console.log(`  N=${lvl}: ${baselineEmpty[lvl]} tok (${p.length} chars)`);
}

// 带学情 + 一次真实请求估算
const words = [];
for (let i = 0; i < 40; i++) {
  words.push({ surface: `単語${i}`, reading: `たんご${i}`, meaning: `意思${i}`, mastery: i % 3 === 0 ? 'learning' : i % 3 === 1 ? 'reviewing' : 'mastered', learnedAt: Date.now() - i * 1000 });
}
const gram = [{ title: 'て形接续', mastery: 'reviewing' }];
const withKnow = buildSystemPrompt('tutor', makeProfile('N5'), undefined, settings, words, gram, [], 's1', '私今天想去东京', false);
console.log(`\n  N5 + 40词学情: ${countTokens(withKnow)} tok`);

// 调试按需：debug=true 与 debug=false 差异
const noDebug = buildSystemPrompt('tutor', emptyProfile, undefined, settings, [], [], [], 's1', '', false);
const withDebug = buildSystemPrompt('tutor', emptyProfile, undefined, settings, [], [], [], 's1', '', true);
console.log(`\n  调试指令(debug=true 多出的) ≈ ${countTokens(withDebug) - countTokens(noDebug)} tok`);
const DEBUG_TOKEN = '【系统诊断与调试指令支持';
console.log(`  debug=false 含调试块? ${noDebug.includes(DEBUG_TOKEN)} | debug=true 含调试块? ${withDebug.includes(DEBUG_TOKEN)}`);

// —— 契约回归断言 ——
console.log('\n===== 输出契约回归检查 =====');
const checks = [
  ['<jp> 包裹规则', () => withKnow.includes('<jp>') && withKnow.includes('</jp>')],
  ['禁圆括号假名注音', () => /严禁[^。\n]*圆括号|圆括号标注假名/.test(withKnow)],
  ['方括号互补注音·花括号宿主块', () => /宿主/.test(withKnow) && withKnow.includes('{野菜[やさい]}')],
  ['纠错块 :::correction', () => withKnow.includes(':::correction')],
  [
    '语法精讲块 :::grammar',
    () =>
      withKnow.includes(':::grammar') &&
      /point:/.test(withKnow) &&
      /structure:/.test(withKnow) &&
      // 必须写明"只有真正讲解时才输出"，否则会污染学情档案
      /没有讲解|未讲解|只.{0,4}自然用/.test(withKnow),
  ],
  ['学情·已学不当新词', () => /已经学过|不当成.{0,6}新词|严禁当成新词/.test(withKnow)],
  ['防失忆·验收契约', () => withKnow.includes('练习邀请') || withKnow.includes('验收') || withKnow.includes('你的要求就是')],
  ['跨会话胶囊存在性(无历史应为空)', () => !withKnow.includes('历史会话')],
  ['调试按需(false时无)', () => !noDebug.includes(DEBUG_TOKEN) && withDebug.includes(DEBUG_TOKEN)],
];
let ok = 0;
for (const [name, fn] of checks) {
  const pass = fn();
  if (pass) ok++;
  console.log(`  ${pass ? '✅' : '❌'} ${name}`);
}
console.log(`\n契约通过 ${ok}/${checks.length}`);
