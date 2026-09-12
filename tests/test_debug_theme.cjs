/**
 * 调试台主题回归测试
 * 锁死三件事：
 *  1) 浅色为默认：CSS 基底块与 TSX 初始 state 都必须是浅色，且 localStorage key 已升版本；
 *  2) 覆盖顺序正确：浅色基底在前、[data-theme='dark'] 在后（属性选择器特异性更高，可整体覆盖）；
 *  3) 浅色灰阶可达 AA：--dbg-text-* 在面板/页面/侧栏/内嵌四种底色上对比度均 >= 4.5:1。
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const css = fs.readFileSync(path.join(root, 'src/components/Debug/DebugInspector.css'), 'utf8');
const tsx = fs.readFileSync(path.join(root, 'src/components/Debug/DebugInspector.tsx'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name) => { pass++; console.log('  \u2705 ' + name); };
const bad = (name, detail) => { fail++; console.log('  \u274c ' + name + (detail ? ' -> ' + detail : '')); };
const assert = (cond, name, detail) => (cond ? ok(name) : bad(name, detail));

/* ---------- 对比度工具（WCAG 2.1） ---------- */
const lum = (hex) => {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a, b) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/* ---------- 1. 默认浅色 ---------- */
console.log('\n[1] 默认主题 = 浅色');
assert(
  /readLocalStorage<ThemeMode>\(LS_KEYS\.theme, 'light'\)/.test(tsx),
  'TSX 初始 state 默认 light'
);
assert(/theme: 'shiori_debug_theme_v2'/.test(tsx), '主题 localStorage key 已升级至 v2（旧 dark 缓存不再生效）');
assert(/data-theme=\{theme\}/.test(tsx), '容器仍以 data-theme 驱动主题');

/* ---------- 2. 覆盖顺序 ---------- */
console.log('\n[2] CSS 变量块顺序与选择器');
const baseIdx = css.indexOf(".debug-inspector-container,\n.debug-inspector-container[data-theme='light'] {");
const darkIdx = css.indexOf(".debug-inspector-container[data-theme='dark'] {");
assert(baseIdx >= 0, "存在「.debug-inspector-container」+ light 的浅色基底块");
assert(darkIdx >= 0, "存在 [data-theme='dark'] 深色块");
assert(baseIdx >= 0 && darkIdx > baseIdx, '浅色基底在前、深色块在后（深色可正确覆盖）', `base=${baseIdx} dark=${darkIdx}`);

/* ---------- 3. 浅色灰阶对比度 ---------- */
console.log('\n[3] 浅色灰阶 WCAG 对比度（阈值 4.5:1）');
const light = css.slice(baseIdx, darkIdx);
const grab = (name) => {
  const m = light.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
  return m ? m[1] : null;
};
const bgs = [
  ['#ffffff', '面板/卡片'],
  ['#f4f6fb', '页面底'],
  ['#fbfcfe', '侧栏'],
  ['#eef1f6', '内嵌/代码'],
  ['#eef2f8', '页签条'],
];
const tokens = ['dbg-text', 'dbg-text-dim', 'dbg-text-mute', 'dbg-text-faint', 'c-slate', 'c-muted'];
for (const t of tokens) {
  const v = grab(t);
  if (!v) { bad('--' + t + ' 取值存在', 'not found'); continue; }
  const worst = Math.min(...bgs.map(([bg]) => ratio(v, bg)));
  assert(worst >= 4.5, `--${t} ${v} 最低对比度 ${worst.toFixed(2)}:1`, worst.toFixed(2));
  if (t === 'dbg-text-faint') {
    assert(worst > 4.5, `--dbg-text-faint 已消除"灰太浅"（>4.5）`, worst.toFixed(2));
  }
}

/* ---------- 4. 浅色语义色加深修正 ---------- */
console.log('\n[4] 浅色语义色/状态色加深覆盖');
const lightFix = css.slice(css.indexOf('浅色主题专属修正'));
assert(lightFix.length > 0, '存在浅色专属修正块');
const expects = [
  ['.debug-header-badge', /debug-header-badge\s*\{[\s\S]*?color:\s*#047857/],
  ['.debug-pulse-dot', /debug-pulse-dot\s*\{[\s\S]*?background:\s*#059669/],
  ['.status-dot.success', /status-dot\.success\s*\{\s*background:\s*#059669/],
  ['.status-dot.streaming', /status-dot\.streaming\s*\{\s*background:\s*#2563eb/],
  ['.status-dot.error', /status-dot\.error\s*\{\s*background:\s*#dc2626/],
  ['.debug-card.status-success', /debug-card\.status-success\s*\{[\s\S]*?#059669/],
  ['.debug-card.status-error', /debug-card\.status-error\s*\{[\s\S]*?#dc2626/],
];
for (const [name, re] of expects) {
  assert(re.test(lightFix), '浅色覆盖 ' + name);
}
const semKeys = ['c-emerald', 'c-amber', 'c-rose', 'c-sky', 'c-violet', 'c-indigo'];
for (const k of semKeys) {
  const v = grab(k);
  if (!v) { bad('--' + k + ' 存在'); continue; }
  const c = ratio(v, '#ffffff');
  assert(c >= 4.5, `--${k} ${v} 白底对比度 ${c.toFixed(2)}:1`, c.toFixed(2));
}

console.log(`\n主题回归通过 ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
