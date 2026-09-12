/**
 * 互动任务追踪器回归测试
 * 覆盖：真实的练习要求应被识别；纯语法讲解不应被误判。
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

const { detectPendingTask } = requireTs('./src/utils/interactionState.ts');

const cases = [
  {
    name: '试着说日语（典型练习要求）',
    text: '很好！那么接下来，请你试着用日语说一下「我明天想去东京」这句话吧。别担心说错，大胆试试看！',
    expect: 'production',
  },
  {
    name: '跟我读（跟读要求）',
    text: '这个词的声调是头高型。来，跟我读一遍：<jp>ありがとうございます</jp>。',
    expect: 'repeat',
  },
  {
    name: '选择题',
    text: '考考你，下面哪一句是正确的？ A. <jp>私は寿司が好きです</jp>  B. <jp>私は寿司を好きです</jp>',
    expect: 'choice',
  },
  {
    name: '向学生提问',
    text: '我们先从简单的开始。<jp>あなたの趣味は何ですか？</jp>',
    expect: 'question',
  },
  {
    name: '纯语法讲解（不应误判）',
    text: '「～てください」表示请求别人做某事，相当于中文的「请…」。例如：<jp>窓を開けてください</jp>（请打开窗户）。这是 N5 最基础的句型之一。',
    expect: null,
  },
  {
    name: '接续说明（不应误判）',
    text: '这个语法的接续是：动词て形 + ください。用法很简单，记住就好。',
    expect: null,
  },
  {
    name: '讲解 + 末尾提出练习（应识别为 production）',
    text: '「～てください」表示请求别人做某事，接续是动词て形＋ください，用法如上。好，轮到你来试试造句了！',
    expect: 'production',
  },
  {
    name: '无任何要求（不应误判）',
    text: '好的，我们下次再继续这个话题。今天辛苦啦，休息一下吧。',
    expect: null,
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const task = detectPendingTask(c.text);
  const got = task ? task.kind : null;
  const ok = got === c.expect;
  if (ok) pass++;
  else fail++;
  const mark = ok ? '✅' : '❌';
  console.log(
    `${mark} ${c.name}\n   期望=${c.expect ?? 'null'} 实际=${got ?? 'null'}` +
      (task ? `\n   摘录：${task.requirement}` : '')
  );
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
