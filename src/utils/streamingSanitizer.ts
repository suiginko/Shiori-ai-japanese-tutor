/**
 * 流式出字平滑净化器 (Streaming Content Sanitizer & Layout Smoother)
 *
 * 核心目标：
 * 解决 AI 流式出字过程中，隐藏的渲染语法与控制格式（日文标签、注音方括号、Markdown 标记、系统数据块等）
 * 在尚未完整闭合时暴露在界面上，导致文字宽度突变、行高跳动与剧烈视觉抽搐的问题。
 */

/**
 * 1. 深度思考标签清理：
 * 移除已闭合的 <think>...</think>
 * 对于未闭合的 <think>...，在流式出字时整体隐藏思考内容，防止大段草稿代码泄露到对话气泡中
 */
export function sanitizeThinkTags(text: string): string {
  if (!text) return '';
  // 1.1 移除完整闭合的 <think>...</think>
  let res = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // 1.2 移除未闭合的 <think>... 直到末尾
  res = res.replace(/<think>[\s\S]*$/gi, '');
  // 1.3 移除末尾半截 <think 标签残片（如 '<', '<t', '<th', '<thi', '<thin', '<think'）
  res = res.replace(/<t(?:h(?:i(?:n(?:k)?)?)?)?$/i, '');
  return res;
}

/**
 * 2. 随堂语法精讲块（:::grammar ... :::）彻底拦截：
 * 该块为后台学情采集专用数据，无论流式中还是结束后，均绝不在用户聊天气泡中露面。
 * 在流式出字时，一旦出现 :::grammar 开始标记，从该标记起到末尾全部拦截隐藏；
 * 同时消除末尾正在打出的 ::: 或 :::g... 前缀残片，彻底杜绝“先喷出后台数据然后蒸发抽搐”的问题。
 */
export function sanitizeGrammarSystemBlocks(text: string, isStreaming = false): string {
  if (!text) return '';
  let res = text;

  // 2.1 闭合或带换行的完整/半完整 :::grammar 块移除（连同前导换行）
  res = res.replace(/(?:\r?\n)?\s*:::grammar\s*[\s\S]*?(?::::|\n[ \t]*\n|$)/gi, '');

  // 2.2 流式出字期间：未闭合的 :::grammar 延伸到文本末尾，整体拦截隐藏（含前导换行）
  if (isStreaming) {
    res = res.replace(/(?:\r?\n|^)\s*:::grammar[\s\S]*$/gi, '');
    res = res.replace(/:::grammar[\s\S]*$/gi, '');
    // 消除末尾挂起的未完成系统前缀（如末尾孤立的 :::, :::g, :::gr, :::gra, :::gram, :::gramm, :::gramma）
    res = res.replace(/(?:\r?\n|^)\s*:::(?:g(?:r(?:a(?:m(?:m(?:a(?:r)?)?)?)?)?)?)?$/i, '');
    res = res.replace(/:::(?:g(?:r(?:a(?:m(?:m(?:a(?:r)?)?)?)?)?)?)?$/i, '');
  }

  return res;
}

/**
 * 3. 日文标签残片流式平滑缓冲：
 * 流式输出到标签头尾时，常有 1~4 字符的残片（如 '<', '<j', '<jp', '</', '</j', '</jp'）。
 * 在流式预览中临时截断末尾未闭合的标签残片，等到完整标签到达放行，
 * 用户肉眼永远看不到突兀的 '<'、'<jp' 闪烁与消失。
 */
export function sanitizeStreamingJapaneseTags(text: string): string {
  if (!text) return '';
  // 匹配末尾未完成的日文标签残片：如 '<', '<j', '<jp', '</', '</j', '</jp'
  return text.replace(/<(?:\/?(?:j|jp|p)?)?$/i, '');
}

/**
 * 4. 方括号注音格式（漢字[かんじ]）实时预测闭合与排版锚定：
 * 彻底根除“输出 [假名 展开大段宽度，闭合 ] 瞬间坍缩导致整行文字向左猛烈回抽”的抽搐核心元凶！
 *
 * 1) 若末尾为词汇后紧随孤立 '['（如 "明日["）：
 *    在流式预览中临时挂起隐藏末尾的 '['，下方的正文汉字保持原有字符排版宽度，绝不被推开；
 * 2) 若末尾为词汇后跟随未闭合的假名读音（如 "明日[あ", "明日[あし", "明日[あした"）：
 *    在流式预览切片中自动虚拟补全 ']'（如 "明日[あ]", "明日[あし]", "明日[あした]"），
 *    使其立刻作为 Ruby 振假名挂在汉字上方！
 *    下方主汉字位置从始至终绝对静止不动，上方假名字体轻盈流淌，出字宛如印刷体般沉稳流畅！
 */
export function smoothStreamingRubyAnnotations(text: string): string {
  if (!text) return '';

  let res = text;

  // 4.1 词汇后紧随未闭合方括号读音（如 "明日[あした" 或 "食べる[たべ|0"）
  // 匹配末尾未闭合的注音：词汇 + '[' + 假名/数字/竖线（尚未输出 ']'）
  const unclosedRubyRegex = /([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\[([ぁ-んァ-ヶー0-9|]+)$/;
  if (unclosedRubyRegex.test(res)) {
    return res + ']';
  }

  // 4.2 词汇后紧随孤立方括号 '['，读音假名尚未到达（如 "明日["）
  const hangingOpenBracketRegex = /([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\[$/;
  if (hangingOpenBracketRegex.test(res)) {
    // 临时隐藏末尾的 '['，正文汉字保持原有宽度不被右推
    return res.slice(0, -1);
  }

  return res;
}

/**
 * 5. Markdown 行内格式（粗体、斜体、代码、删除线）流式平滑补全：
 * 1) 末尾悬空的单个或成对格式前缀（如孤立的 '*', '**', '`', '~', '~~'），若后尚无内容，暂不作为裸露字符闪烁；
 * 2) 若正文已进入加粗/代码等状态但尚未闭合，自动成对补全闭合符号，使字体样式自始至终保持稳定，杜绝闭合瞬间的字符跳变。
 */
export function smoothStreamingInlineMarkdown(text: string): string {
  if (!text) return '';

  let res = text;

  // 5.1 粗体 **
  const doubleAsteriskMatches = res.match(/\*\*/g);
  const doubleAsteriskCount = doubleAsteriskMatches ? doubleAsteriskMatches.length : 0;
  if (doubleAsteriskCount % 2 !== 0) {
    // 奇数个 **，说明有未闭合的粗体
    if (res.endsWith('**')) {
      // 刚输入粗体前缀，后面还没内容，暂扣避免闪烁
      return res.slice(0, -2);
    }
    if (res.endsWith('*') && !res.endsWith('**')) {
      // 正在打闭合星号，刚打完第一个 *，自动补全第二个 *
      return res + '*';
    }
    // 正在输出粗体内部正文，末尾自动补齐闭合 **，使当前文字直接以粗体稳定呈现
    return res + '**';
  }

  // 5.2 行内代码 `
  const backtickMatches = res.match(/`/g);
  const backtickCount = backtickMatches ? backtickMatches.length : 0;
  if (backtickCount % 2 !== 0) {
    if (res.endsWith('`')) {
      // 刚打出反引号前缀，暂扣
      return res.slice(0, -1);
    }
    // 正在输出代码内容，自动闭合 `
    return res + '`';
  }

  // 5.3 单星号 *（斜体）
  const pureAsterisk = res.replace(/\*\*/g, '');
  const singleAsteriskMatches = pureAsterisk.match(/\*/g);
  const singleAsteriskCount = singleAsteriskMatches ? singleAsteriskMatches.length : 0;
  if (singleAsteriskCount % 2 !== 0) {
    if (res.endsWith('*') && !res.endsWith('**')) {
      return res.slice(0, -1);
    }
    return res + '*';
  }

  // 5.4 删除线 ~~
  const tildeMatches = res.match(/~~/g);
  const tildeCount = tildeMatches ? tildeMatches.length : 0;
  if (tildeCount % 2 !== 0) {
    if (res.endsWith('~~')) {
      return res.slice(0, -2);
    }
    return res + '~~';
  }

  return res;
}

/**
 * 全方位流式内容净化与平滑处理总入口 (sanitizeStreamingContent)
 * 供 MessageItem 渲染层在 isGenerating 为 true 时使用。
 *
 * @param rawText 原始累积文本
 * @param isStreaming 是否处于流式生成中
 * @returns 经过平滑净化、杜绝跳变抽搐的渲染文本
 */
export function sanitizeStreamingContent(rawText: string, isStreaming: boolean): string {
  if (!rawText) return '';

  // 1. 深度思考标签清理（折叠或剥离）
  let text = sanitizeThinkTags(rawText);

  // 2. 系统精讲块 :::grammar 彻底剥离（无论流式中还是结束后，绝不露出半截后台代码）
  text = sanitizeGrammarSystemBlocks(text, isStreaming);

  if (!isStreaming) {
    // 非流式状态下：已完成最终输出，无需进行残片缓冲和预测闭合
    return text;
  }

  // 3. 流式日文标签残片缓冲（杜绝 '<', '<j', '<jp', '</' 等裸露闪烁）
  text = sanitizeStreamingJapaneseTags(text);

  // 4. 方括号注音实时预测闭合与排版锚定（杜绝整行文字左右猛烈抽搐）
  text = smoothStreamingRubyAnnotations(text);

  // 5. Markdown 行内标记流式平滑补全（杜绝粗体/代码标记未闭合时的符号暴露与跳变）
  text = smoothStreamingInlineMarkdown(text);

  return text;
}
