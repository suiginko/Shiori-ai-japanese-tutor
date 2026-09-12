/**
 * 调试控制台工具函数回归测试
 *
 * 用法：node test_debug_helpers.cjs
 * 用途：锁定 debugHelpers 中「格式化 / 差异对比 / 搜索高亮 / 检索 / cURL / Markdown 导出」的真实行为，
 *       确保调试页新增能力不是只存在于 UI 文案上。
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

const H = requireTs(path.resolve(__dirname, 'src/components/Debug/debugHelpers.ts'));

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` → ${detail}` : ''}`);
  }
}

console.log('\n[1] 时间 / 数字格式化');
check('formatDuration 毫秒级', H.formatDuration(500) === '500 ms', H.formatDuration(500));
check('formatDuration 秒级', H.formatDuration(2500) === '2.50 s', H.formatDuration(2500));
check('formatDuration 分级', H.formatDuration(65000) === '1 min 5.0 s', H.formatDuration(65000));
check('formatDuration 空值', H.formatDuration(undefined) === '—');
check('compactNumber 千位', H.compactNumber(999) === '999', H.compactNumber(999));
check('compactNumber 1.5k', H.compactNumber(1500) === '1.5k', H.compactNumber(1500));
check('compactNumber 15k', H.compactNumber(15000) === '15k', H.compactNumber(15000));
check('compactNumber 百万', H.compactNumber(2500000) === '2.50M', H.compactNumber(2500000));
check('formatNumber 千分位', H.formatNumber(1234567) === '1,234,567', H.formatNumber(1234567));

console.log('\n[2] 搜索结果高亮切分');
const hl = H.splitHighlight('abcabc', 'B');
check('大小写不敏感命中 2 次', hl.filter((s) => s.hit).length === 2, JSON.stringify(hl));
check('高亮片段拼回原文', hl.map((s) => s.text).join('') === 'abcabc');
const hlMiss = H.splitHighlight('hello', 'zzz');
check('未命中时返回单段且 hit=false', hlMiss.length === 1 && hlMiss[0].hit === false);
check('空文本安全', H.splitHighlight('', 'x').length === 1);

console.log('\n[3] 原始 / 清洗输出逐行差异');
const same = H.diffLines('a\nb', 'a\nb');
check('完全一致时无增删', H.summarizeDiff(same).identical === true);
const changed = H.diffLines('第一行\n多余动作\n第三行', '第一行\n第三行');
const stats = H.summarizeDiff(changed);
check('识别删除行', stats.removed === 1, JSON.stringify(stats));
check('保留未变行', stats.unchanged === 2, JSON.stringify(stats));
check('差异行标记为 del', changed.some((l) => l.type === 'del' && l.text === '多余动作'));
const bigA = Array.from({ length: 500 }, (_, i) => `l${i}`).join('\n');
const bigDiff = H.diffLines(bigA, 'x');
check('超长文本降级不爆栈', bigDiff.length === 501, String(bigDiff.length));

console.log('\n[4] 记录检索');
const entry = {
  title: 'N5 初级语法纠错',
  id: 'chat-1',
  model: 'deepseek-chat',
  provider: 'deepseek',
  endpoint: 'https://api.deepseek.com/chat/completions',
  errorMessage: 'API 请求错误 (401)',
  systemPrompt: '你是日语私教',
  rawOutput: 'こんにちは',
  tokens: { total: 120 },
};
check('空查询恒真', H.entryMatchesQuery(entry, '   ') === true);
check('命中标题', H.entryMatchesQuery(entry, '纠错') === true);
check('命中模型名', H.entryMatchesQuery(entry, 'deepseek') === true);
check('命中错误信息', H.entryMatchesQuery(entry, '401') === true);
check('不相关词返回 false', H.entryMatchesQuery(entry, '完全不存在的词') === false);

console.log('\n[5] cURL 与 Markdown 导出');
const openaiEntry = { ...entry, stream: true, rawRequestBody: { model: 'deepseek-chat', messages: [] } };
const curl = H.buildCurlCommand(openaiEntry);
check('cURL 含 POST 方法', curl.startsWith('curl -X POST'), curl.slice(0, 30));
check('cURL 含 Base URL', curl.includes('https://api.deepseek.com/chat/completions'));
check('cURL 含鉴权头占位符', curl.includes('Authorization: Bearer <YOUR_API_KEY>'));
check('cURL 含流式参数', curl.includes('--no-buffer'));
check('cURL 保留请求体', curl.includes('"model":"deepseek-chat"'));
const geminiEntry = {
  ...entry,
  endpoint: '/api/gemini',
  rawRequestBody: { model: 'gemini-3.6-flash', messages: [] },
};
const geminiCurl = H.buildCurlCommand(geminiEntry);
check('Gemini 代理补全 apiKey 占位', geminiCurl.includes('<YOUR_GEMINI_API_KEY>'), geminiCurl);
const md = H.buildMarkdownReport({
  ...entry,
  timeStr: '10:00:00.000',
  timestamp: Date.now(),
  typeLabel: '私教流式对话',
  status: 'success',
  durationMs: 1200,
  systemPromptCharCount: entry.systemPrompt.length,
  rawMessagesCount: 2,
  optimizedMessages: [{ role: 'user', content: '你好' }],
  sanitizedOutput: 'こんにちは',
  chunkCount: 3,
  rawRequestBody: { model: 'deepseek-chat', messages: [] },
  tokens: { prompt: 100, completion: 20, total: 120, estimated: false },
});
check('报告含标题', md.includes('# 调试记录：N5 初级语法纠错'));
check('报告含 Token 表行', md.includes('API 真实 usage'));
check('报告含消息列表', md.includes('### #1 · user'));
check('报告含请求报文', md.includes('## 请求报文 (Request Body)'));

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
  console.log('失败用例：', failures.join('、'));
  process.exit(1);
}
