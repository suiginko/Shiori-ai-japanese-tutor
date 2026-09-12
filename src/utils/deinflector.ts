// =========================================================
// JAPANESE MORPHOLOGICAL DE-INFLECTOR (日语形态素活用逆向还原引擎)
// =========================================================
// 将对话中出现的动词敬体、过去式、愿望形、进行时、否定形等活用形式，
// 逆向推导还原为辞书形（原型），并提供当前的形态语法说明。

export interface DeinflectResult {
  lemma: string; // 辞书形原型，如 "食べる"、"行く"、"美味しい"
  formTag: string; // 当前语法形态说明，如 "敬体过去式"、"愿望形"
  original: string; // 输入的活用形式
}

interface Rule {
  suffix: string;
  replacement: string[];
  formTag: string;
  minLength?: number;
}

const DEINFLECTION_RULES: Rule[] = [
  // --- 0. 动词请求/请托形 (～てください / ～ってください / ～んでください / ～してください) ---
  { suffix: 'ってください', replacement: ['う', 'つ', 'る', 'く'], formTag: '请求形（请做...）', minLength: 5 },
  { suffix: 'んでください', replacement: ['む', 'ぶ', 'ぬ'], formTag: '请求形（请做...）', minLength: 5 },
  { suffix: 'いてください', replacement: ['く'], formTag: '请求形（请做...）', minLength: 5 },
  { suffix: 'いでください', replacement: ['ぐ'], formTag: '请求形（请做...）', minLength: 5 },
  { suffix: 'してください', replacement: ['す', 'する'], formTag: '请求形（请做...）', minLength: 5 },
  { suffix: 'てください', replacement: ['る'], formTag: '请求形（请做...）', minLength: 4 },

  // --- 1. 动词敬体过去形 (～いました/きました/ぎました/しました/ちました/にました/びました/みました/りました/ました) ---
  { suffix: 'いました', replacement: ['う'], formTag: '五段敬体过去式（ワ行）', minLength: 4 },
  { suffix: 'きました', replacement: ['く'], formTag: '五段敬体过去式（カ行）', minLength: 4 },
  { suffix: 'ぎました', replacement: ['ぐ'], formTag: '五段敬体过去式（ガ行）', minLength: 4 },
  { suffix: 'しました', replacement: ['す', 'する'], formTag: '动词敬体过去式（サ行/サ变）', minLength: 4 },
  { suffix: 'ちました', replacement: ['つ'], formTag: '五段敬体过去式（タ行）', minLength: 4 },
  { suffix: 'にました', replacement: ['ぬ'], formTag: '五段敬体过去式（ナ行）', minLength: 4 },
  { suffix: 'びました', replacement: ['ぶ'], formTag: '五段敬体过去式（バ行）', minLength: 4 },
  { suffix: 'みました', replacement: ['む'], formTag: '五段敬体过去式（マ行）', minLength: 4 },
  { suffix: 'りました', replacement: ['る'], formTag: '五段敬体过去式（ラ行）', minLength: 4 },
  { suffix: 'ました', replacement: ['る'], formTag: '一段动词敬体过去式', minLength: 3 },

  // --- 2. 动词敬体现在形 (～います/きます/ぎます/します/ちます/にます/びます/みます/ります/ます) ---
  { suffix: 'います', replacement: ['う'], formTag: '五段敬体现在形（ワ行）', minLength: 3 },
  { suffix: 'きます', replacement: ['く'], formTag: '五段敬体现在形（カ行）', minLength: 3 },
  { suffix: 'ぎます', replacement: ['ぐ'], formTag: '五段敬体现在形（ガ行）', minLength: 3 },
  { suffix: 'します', replacement: ['す', 'する'], formTag: '动词敬体现在形（サ行/サ变）', minLength: 3 },
  { suffix: 'ちます', replacement: ['つ'], formTag: '五段敬体现在形（タ行）', minLength: 3 },
  { suffix: 'にます', replacement: ['ぬ'], formTag: '五段敬体现在形（ナ行）', minLength: 3 },
  { suffix: 'びます', replacement: ['ぶ'], formTag: '五段敬体现在形（バ行）', minLength: 3 },
  { suffix: 'みます', replacement: ['む'], formTag: '五段敬体现在形（マ行）', minLength: 3 },
  { suffix: 'ります', replacement: ['る'], formTag: '五段敬体现在形（ラ行）', minLength: 3 },
  { suffix: 'ます', replacement: ['る'], formTag: '一段动词敬体现在形', minLength: 2 },

  // --- 2.5. 动词连用形/ます形词干 (如 買い->買う、行き->行く、話し->話す、待ち->待つ、教え->教える、食べ->食べる) ---
  { suffix: 'い', replacement: ['う'], formTag: '五段动词连用形（ワ行）', minLength: 2 },
  { suffix: 'き', replacement: ['く', 'きる'], formTag: '动词连用形（カ行）', minLength: 2 },
  { suffix: 'ぎ', replacement: ['ぐ', 'ぎる'], formTag: '动词连用形（ガ行）', minLength: 2 },
  { suffix: 'し', replacement: ['す', 'じる'], formTag: '动词连用形（サ行）', minLength: 2 },
  { suffix: 'ち', replacement: ['つ', 'ちる'], formTag: '动词连用形（タ行）', minLength: 2 },
  { suffix: 'に', replacement: ['ぬ', 'にる'], formTag: '动词连用形（ナ行）', minLength: 2 },
  { suffix: 'び', replacement: ['ぶ', 'びる'], formTag: '动词连用形（バ行）', minLength: 2 },
  { suffix: 'み', replacement: ['む', 'みる'], formTag: '动词连用形（マ行）', minLength: 2 },
  { suffix: 'り', replacement: ['る', 'りる'], formTag: '动词连用形（ラ行）', minLength: 2 },
  // 一段动词连用形（下一段动词：词尾为え段假名，如 教え->教える、食べ->食べる、調べ->調べる、考え->考える）
  { suffix: 'え', replacement: ['える'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'け', replacement: ['ける'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'げ', replacement: ['げる'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'せ', replacement: ['せる'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'ぜ', replacement: ['ぜる'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'て', replacement: ['てる'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'で', replacement: ['でる'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'ね', replacement: ['ねる'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'べ', replacement: ['べる'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'め', replacement: ['める'], formTag: '一段动词连用形（下一段）', minLength: 2 },
  { suffix: 'れ', replacement: ['れる'], formTag: '一段动词连用形（下一段）', minLength: 2 },


  // --- 3. 动词敬体否定形 (～いません/きません/ぎません/しません/ちません/にません/びません/みません/りません/ません) ---
  { suffix: 'いません', replacement: ['う'], formTag: '五段敬体否定形（ワ行）', minLength: 4 },
  { suffix: 'きません', replacement: ['く'], formTag: '五段敬体否定形（カ行）', minLength: 4 },
  { suffix: 'ぎません', replacement: ['ぐ'], formTag: '五段敬体否定形（ガ行）', minLength: 4 },
  { suffix: 'しません', replacement: ['す', 'する'], formTag: '动词敬体否定形（サ行/サ变）', minLength: 4 },
  { suffix: 'ちません', replacement: ['つ'], formTag: '五段敬体否定形（タ行）', minLength: 4 },
  { suffix: 'にません', replacement: ['ぬ'], formTag: '五段敬体否定形（ナ行）', minLength: 4 },
  { suffix: 'びません', replacement: ['ぶ'], formTag: '五段敬体否定形（バ行）', minLength: 4 },
  { suffix: 'みません', replacement: ['む'], formTag: '五段敬体否定形（マ行）', minLength: 4 },
  { suffix: 'りません', replacement: ['る'], formTag: '五段敬体否定形（ラ行）', minLength: 4 },
  { suffix: 'ません', replacement: ['る'], formTag: '一段动词敬体否定形', minLength: 3 },

  // --- 4. 动词敬体过去否定形 (～ませんでした) ---
  {
    suffix: 'ませんでした',
    replacement: ['る', 'する', 'くる'],
    formTag: '敬体过去否定式',
    minLength: 6,
  },

  // --- 5. 动词敬体劝诱/意向形 (～ましょう / ～ましょうか) ---
  {
    suffix: 'ましょうか',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '敬体提议/询问（～ましょうか）',
    minLength: 6,
  },
  {
    suffix: 'ましょう',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '敬体意向/提议（～ましょう）',
    minLength: 5,
  },

  // --- 6. 动词愿望形 (～たいです / ～たい / ～たくない / ～たかった) ---
  {
    suffix: 'たくありませんでした',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望过去否定形（不想做过）',
    minLength: 11,
  },
  {
    suffix: 'たくありません',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望否定形（不想做）',
    minLength: 8,
  },
  {
    suffix: 'たくなかった',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望过去否定形（不想做过）',
    minLength: 7,
  },
  {
    suffix: 'たかったです',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望过去形（曾经想做）',
    minLength: 7,
  },
  {
    suffix: 'たかった',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望过去形（曾经想做）',
    minLength: 5,
  },
  {
    suffix: 'たくないです',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望否定形（不想做）',
    minLength: 7,
  },
  {
    suffix: 'たくない',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望否定形（不想做）',
    minLength: 5,
  },
  {
    suffix: 'たいです',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望形（想做...）',
    minLength: 5,
  },
  {
    suffix: 'たい',
    replacement: ['る', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う', 'する', 'くる'],
    formTag: '愿望形（想做...）',
    minLength: 3,
  },

  // --- 7. 动词进行形 / 持续形 (～ています / ～ている / ～ていた / ～ていました) ---
  {
    suffix: 'ていませんでした',
    replacement: ['る', 'く', 'つ', 'う', 'る', 'す'],
    formTag: '进行/状态过去否定（当时没在做）',
    minLength: 9,
  },
  {
    suffix: 'でいませんでした',
    replacement: ['ぐ', 'む', 'ぶ', 'ぬ'],
    formTag: '进行/状态过去否定（当时没在做）',
    minLength: 9,
  },
  {
    suffix: 'ていません',
    replacement: ['る', 'く', 'つ', 'う', 'る', 'す'],
    formTag: '进行/状态否定（没有在做）',
    minLength: 6,
  },
  {
    suffix: 'でいません',
    replacement: ['ぐ', 'む', 'ぶ', 'ぬ'],
    formTag: '进行/状态否定（没有在做）',
    minLength: 6,
  },
  {
    suffix: 'ていました',
    replacement: ['る', 'く', 'つ', 'う', 'る', 'す'],
    formTag: '进行/状态过去式（当时正在做）',
    minLength: 6,
  },
  {
    suffix: 'でいました',
    replacement: ['ぐ', 'む', 'ぶ', 'ぬ'],
    formTag: '进行/状态过去式（当时正在做）',
    minLength: 6,
  },
  {
    suffix: 'ています',
    replacement: ['る', 'く', 'つ', 'う', 'る', 'す'],
    formTag: '进行/持续状态（正在做...）',
    minLength: 5,
  },
  {
    suffix: 'でいます',
    replacement: ['ぐ', 'む', 'ぶ', 'ぬ'],
    formTag: '进行/持续状态（正在做...）',
    minLength: 5,
  },
  {
    suffix: 'ていた',
    replacement: ['る', 'く', 'つ', 'う', 'る', 'す'],
    formTag: '进行/状态过去形（在做过）',
    minLength: 4,
  },
  {
    suffix: 'でいた',
    replacement: ['ぐ', 'む', 'ぶ', 'ぬ'],
    formTag: '进行/状态过去形（在做过）',
    minLength: 4,
  },
  {
    suffix: 'ている',
    replacement: ['る', 'く', 'つ', 'う', 'る', 'す'],
    formTag: '进行/状态简体（正在做/处于状态）',
    minLength: 4,
  },
  {
    suffix: 'でいる',
    replacement: ['ぐ', 'む', 'ぶ', 'ぬ'],
    formTag: '进行/状态简体（正在做/处于状态）',
    minLength: 4,
  },

  // --- 7.5 动词被动态 / 受身形 (～われる/われます/われた/われました/われない/われません/われて/かれている/かれている) ---
  { suffix: 'われました', replacement: ['う'], formTag: '被动态敬体过去式（ワ行）', minLength: 5 },
  { suffix: 'かれました', replacement: ['く'], formTag: '被动态敬体过去式（カ行）', minLength: 5 },
  { suffix: 'がれました', replacement: ['ぐ'], formTag: '被动态敬体过去式（ガ行）', minLength: 5 },
  { suffix: 'されました', replacement: ['す', 'する'], formTag: '被动态敬体过去式（サ行/サ变）', minLength: 5 },
  { suffix: 'たれました', replacement: ['つ'], formTag: '被动态敬体过去式（タ行）', minLength: 5 },
  { suffix: 'ばれました', replacement: ['ぶ'], formTag: '被动态敬体过去式（バ行）', minLength: 5 },
  { suffix: 'まれました', replacement: ['む'], formTag: '被动态敬体过去式（マ行）', minLength: 5 },
  { suffix: 'られました', replacement: ['る'], formTag: '被动态/可能敬体过去式', minLength: 5 },

  { suffix: 'われています', replacement: ['う'], formTag: '被动态进行敬体（ワ行）', minLength: 6 },
  { suffix: 'かれています', replacement: ['く'], formTag: '被动态进行敬体（カ行）', minLength: 6 },
  { suffix: 'されています', replacement: ['す', 'する'], formTag: '被动态进行敬体（サ行/サ变）', minLength: 6 },
  { suffix: 'られています', replacement: ['る'], formTag: '被动态进行敬体', minLength: 6 },

  { suffix: 'われている', replacement: ['う'], formTag: '被动态进行简体（ワ行）', minLength: 5 },
  { suffix: 'かれている', replacement: ['く'], formTag: '被动态进行简体（カ行）', minLength: 5 },
  { suffix: 'されている', replacement: ['す', 'する'], formTag: '被动态进行简体（サ行/サ变）', minLength: 5 },
  { suffix: 'られている', replacement: ['る'], formTag: '被动态进行简体', minLength: 5 },

  { suffix: 'われません', replacement: ['う'], formTag: '被动态敬体否定（ワ行）', minLength: 5 },
  { suffix: 'かれません', replacement: ['く'], formTag: '被动态敬体否定（カ行）', minLength: 5 },
  { suffix: 'されません', replacement: ['す', 'する'], formTag: '被动态敬体否定（サ行/サ变）', minLength: 5 },
  { suffix: 'られません', replacement: ['る'], formTag: '被动态/可能敬体否定', minLength: 5 },

  { suffix: 'われない', replacement: ['う'], formTag: '被动态否定（ワ行）', minLength: 4 },
  { suffix: 'かれない', replacement: ['く'], formTag: '被动态否定（カ行）', minLength: 4 },
  { suffix: 'されない', replacement: ['す', 'する'], formTag: '被动态否定（サ行/サ变）', minLength: 4 },
  { suffix: 'られない', replacement: ['る'], formTag: '被动态/可能否定', minLength: 4 },

  { suffix: 'われます', replacement: ['う'], formTag: '被动态敬体现在形（ワ行）', minLength: 4 },
  { suffix: 'かれます', replacement: ['く'], formTag: '被动态敬体现在形（カ行）', minLength: 4 },
  { suffix: 'がれます', replacement: ['ぐ'], formTag: '被动态敬体现在形（ガ行）', minLength: 4 },
  { suffix: 'されます', replacement: ['す', 'する'], formTag: '被动态敬体现在形（サ行/サ变）', minLength: 4 },
  { suffix: 'たれます', replacement: ['つ'], formTag: '被动态敬体现在形（タ行）', minLength: 4 },
  { suffix: 'ばれます', replacement: ['ぶ'], formTag: '被动态敬体现在形（バ行）', minLength: 4 },
  { suffix: 'まれます', replacement: ['む'], formTag: '被动态敬体现在形（マ行）', minLength: 4 },
  { suffix: 'られます', replacement: ['る'], formTag: '被动态/可能敬体现在形', minLength: 4 },

  { suffix: 'われた', replacement: ['う'], formTag: '被动态过去式（ワ行）', minLength: 3 },
  { suffix: 'かれた', replacement: ['く'], formTag: '被动态过去式（カ行）', minLength: 3 },
  { suffix: 'がれた', replacement: ['ぐ'], formTag: '被动态过去式（ガ行）', minLength: 3 },
  { suffix: 'された', replacement: ['す', 'する'], formTag: '被动态过去式（サ行/サ变）', minLength: 3 },
  { suffix: 'たれた', replacement: ['つ'], formTag: '被动态过去式（タ行）', minLength: 3 },
  { suffix: 'ばれた', replacement: ['ぶ'], formTag: '被动态过去式（バ行）', minLength: 3 },
  { suffix: 'まれた', replacement: ['む'], formTag: '被动态过去式（マ行）', minLength: 3 },
  { suffix: 'られた', replacement: ['る'], formTag: '被动态/可能过去式', minLength: 3 },

  { suffix: 'われて', replacement: ['う'], formTag: '被动态て形（ワ行）', minLength: 3 },
  { suffix: 'かれて', replacement: ['く'], formTag: '被动态て形（カ行）', minLength: 3 },
  { suffix: 'がれて', replacement: ['ぐ'], formTag: '被动态て形（ガ行）', minLength: 3 },
  { suffix: 'されて', replacement: ['す', 'する'], formTag: '被动态て形（サ行/サ变）', minLength: 3 },
  { suffix: 'たれて', replacement: ['つ'], formTag: '被动态て形（タ行）', minLength: 3 },
  { suffix: 'ばれて', replacement: ['ぶ'], formTag: '被动态て形（バ行）', minLength: 3 },
  { suffix: 'まれて', replacement: ['む'], formTag: '被动态て形（マ行）', minLength: 3 },
  { suffix: 'られて', replacement: ['る'], formTag: '被动态/可能て形', minLength: 3 },

  { suffix: 'われる', replacement: ['う'], formTag: '被动态/受身形（ワ行）', minLength: 3 },
  { suffix: 'かれる', replacement: ['く'], formTag: '被动态/受身形（カ行）', minLength: 3 },
  { suffix: 'がれる', replacement: ['ぐ'], formTag: '被动态/受身形（ガ行）', minLength: 3 },
  { suffix: 'される', replacement: ['す', 'する'], formTag: '被动态（サ行/サ变）', minLength: 3 },
  { suffix: 'たれる', replacement: ['つ'], formTag: '被动态（タ行）', minLength: 3 },
  { suffix: 'ばれる', replacement: ['ぶ'], formTag: '被动态（バ行）', minLength: 3 },
  { suffix: 'まれる', replacement: ['む'], formTag: '被动态（マ行）', minLength: 3 },
  { suffix: 'られる', replacement: ['る'], formTag: '被动态/可能形/一段受身', minLength: 3 },

  // --- 7.6 动词可能形 (五段动词 ～える/えます/えない/えません/えた/えて) ---
  { suffix: 'えません', replacement: ['う'], formTag: '可能形敬体否定（ワ行）', minLength: 4 },
  { suffix: 'けません', replacement: ['く'], formTag: '可能形敬体否定（カ行）', minLength: 4 },
  { suffix: 'げません', replacement: ['ぐ'], formTag: '可能形敬体否定（ガ行）', minLength: 4 },
  { suffix: 'せません', replacement: ['す'], formTag: '可能形敬体否定（サ行）', minLength: 4 },
  { suffix: 'てません', replacement: ['つ'], formTag: '可能形敬体否定（タ行）', minLength: 4 },
  { suffix: 'べません', replacement: ['ぶ'], formTag: '可能形敬体否定（バ行）', minLength: 4 },
  { suffix: 'めません', replacement: ['む'], formTag: '可能形敬体否定（マ行）', minLength: 4 },
  { suffix: 'れません', replacement: ['る'], formTag: '可能形敬体否定（ラ行）', minLength: 4 },

  { suffix: 'えます', replacement: ['う'], formTag: '可能形敬体（ワ行）', minLength: 3 },
  { suffix: 'けます', replacement: ['く'], formTag: '可能形敬体（カ行）', minLength: 3 },
  { suffix: 'げます', replacement: ['ぐ'], formTag: '可能形敬体（ガ行）', minLength: 3 },
  { suffix: 'せます', replacement: ['す'], formTag: '可能形敬体（サ行）', minLength: 3 },
  { suffix: 'てます', replacement: ['つ'], formTag: '可能形敬体（タ行）', minLength: 3 },
  { suffix: 'べます', replacement: ['ぶ'], formTag: '可能形敬体（バ行）', minLength: 3 },
  { suffix: 'めます', replacement: ['む'], formTag: '可能形敬体（マ行）', minLength: 3 },
  { suffix: 'れます', replacement: ['る'], formTag: '可能形敬体（ラ行）', minLength: 3 },

  { suffix: 'えない', replacement: ['う'], formTag: '可能形否定（ワ行）', minLength: 3 },
  { suffix: 'けない', replacement: ['く'], formTag: '可能形否定（カ行）', minLength: 3 },
  { suffix: 'げない', replacement: ['ぐ'], formTag: '可能形否定（ガ行）', minLength: 3 },
  { suffix: 'せない', replacement: ['す'], formTag: '可能形否定（サ行）', minLength: 3 },
  { suffix: 'てない', replacement: ['つ'], formTag: '可能形否定（タ行）', minLength: 3 },
  { suffix: 'べない', replacement: ['ぶ'], formTag: '可能形否定（バ行）', minLength: 3 },
  { suffix: 'めない', replacement: ['む'], formTag: '可能形否定（マ行）', minLength: 3 },
  { suffix: 'れない', replacement: ['る'], formTag: '可能形否定（ラ行）', minLength: 3 },

  { suffix: 'える', replacement: ['う'], formTag: '可能形（ワ行五段）', minLength: 2 },
  { suffix: 'ける', replacement: ['く'], formTag: '可能形（カ行五段）', minLength: 2 },
  { suffix: 'げる', replacement: ['ぐ'], formTag: '可能形（ガ行五段）', minLength: 2 },
  { suffix: 'せる', replacement: ['す'], formTag: '可能形（サ行五段）', minLength: 2 },
  { suffix: 'てる', replacement: ['つ'], formTag: '可能形（タ行五段）', minLength: 2 },
  { suffix: 'べる', replacement: ['ぶ'], formTag: '可能形（バ行五段）', minLength: 2 },
  { suffix: 'める', replacement: ['む'], formTag: '可能形（マ行五段）', minLength: 2 },
  { suffix: 'れる', replacement: ['る'], formTag: '可能形（ラ行五段）', minLength: 2 },

  // --- 8. 动词简体过去式 (～た / ～だ) 与 て形 (音便规则) ---
  // 促音便: 買った -> 買う, 待った -> 待つ, 走った -> 走る, 行った -> 行く
  {
    suffix: 'った',
    replacement: ['う', 'つ', 'る', 'く'],
    formTag: '动词简体过去式（促音便）',
    minLength: 3,
  },
  {
    suffix: 'って',
    replacement: ['う', 'つ', 'る', 'く'],
    formTag: '动词て形（促音便连用）',
    minLength: 3,
  },
  // 拨音便: 読んだ -> 読む, 遊んだ -> 遊ぶ, 死んだ -> 死ぬ
  {
    suffix: 'んだ',
    replacement: ['む', 'ぶ', 'ぬ'],
    formTag: '动词简体过去式（拨音便）',
    minLength: 3,
  },
  {
    suffix: 'んで',
    replacement: ['む', 'ぶ', 'ぬ'],
    formTag: '动词て形（拨音便连用）',
    minLength: 3,
  },
  // イ音便: 書いた -> 書く, 泳いだ -> 泳ぐ
  {
    suffix: 'いた',
    replacement: ['く'],
    formTag: '动词简体过去式（イ音便）',
    minLength: 3,
  },
  {
    suffix: 'いて',
    replacement: ['く'],
    formTag: '动词て形（イ音便连用）',
    minLength: 3,
  },
  {
    suffix: 'いだ',
    replacement: ['ぐ'],
    formTag: '动词简体过去式（浊音イ音便）',
    minLength: 3,
  },
  {
    suffix: 'いで',
    replacement: ['ぐ'],
    formTag: '动词て形（浊音イ音便）',
    minLength: 3,
  },
  // サ行: 話した -> 話す, 勉強した -> 勉強する
  {
    suffix: 'した',
    replacement: ['す', 'する'],
    formTag: '动词简体过去式',
    minLength: 3,
  },
  {
    suffix: 'して',
    replacement: ['す', 'する'],
    formTag: '动词て形（连用接续）',
    minLength: 3,
  },
  // 一段动词た形/て形: 食べた -> 食べる, 見て -> 見る
  {
    suffix: 'た',
    replacement: ['る'],
    formTag: '一段动词简体过去式',
    minLength: 2,
  },
  {
    suffix: 'て',
    replacement: ['る'],
    formTag: '一段动词て形（连用接续）',
    minLength: 2,
  },

  // --- 9. 动词简体否定形 (～ない / ～なかった / ～なくて) ---
  {
    suffix: 'なかった',
    replacement: [
      'る',     // 食べなかった -> 食べる
      'く',     // 書かなかった -> 書く (suffix: かなかった)
      'ぐ',
      'す',
      'つ',
      'ぬ',
      'ぶ',
      'む',
      'る',
      'う',     // 買わなかった -> 買う (suffix: わなかった)
      'する',   // しなかった -> する
      'くる',   // 来なかった -> 来る
    ],
    formTag: '动词简体过去否定式（没做...）',
    minLength: 5,
  },
  // 未然形 + ない
  {
    suffix: 'かない', replacement: ['く'], formTag: '动词简体否定形（カ行五段）', minLength: 4,
  },
  {
    suffix: 'がない', replacement: ['ぐ'], formTag: '动词简体否定形（ガ行五段）', minLength: 4,
  },
  {
    suffix: 'さない', replacement: ['す'], formTag: '动词简体否定形（サ行五段）', minLength: 4,
  },
  {
    suffix: 'たない', replacement: ['つ'], formTag: '动词简体否定形（タ行五段）', minLength: 4,
  },
  {
    suffix: 'なない', replacement: ['ぬ'], formTag: '动词简体否定形（ナ行五段）', minLength: 4,
  },
  {
    suffix: 'ばない', replacement: ['ぶ'], formTag: '动词简体否定形（バ行五段）', minLength: 4,
  },
  {
    suffix: 'まない', replacement: ['む'], formTag: '动词简体否定形（マ行五段）', minLength: 4,
  },
  {
    suffix: 'らない', replacement: ['る'], formTag: '动词简体否定形（ラ行五段）', minLength: 4,
  },
  {
    suffix: 'わない', replacement: ['う'], formTag: '动词简体否定形（ワ行五段）', minLength: 4,
  },
  {
    suffix: 'ない', replacement: ['る', 'する'], formTag: '动词简体否定形（一段/サ变）', minLength: 3,
  },

  // --- 10. イ形容词活用 (～かった / ～くない / ～くて / ～く) ---
  {
    suffix: 'くありませんでした',
    replacement: ['い'],
    formTag: '形容词敬体过去否定（不曾...）',
    minLength: 10,
  },
  {
    suffix: 'くありません',
    replacement: ['い'],
    formTag: '形容词敬体否定（不...）',
    minLength: 7,
  },
  {
    suffix: 'くなかったです',
    replacement: ['い'],
    formTag: '形容词敬体过去否定（不曾...）',
    minLength: 8,
  },
  {
    suffix: 'くなかった',
    replacement: ['い'],
    formTag: '形容词简体过去否定（不曾...）',
    minLength: 6,
  },
  {
    suffix: 'かったです',
    replacement: ['い'],
    formTag: '形容词敬体过去式（当时很...）',
    minLength: 6,
  },
  {
    suffix: 'かった',
    replacement: ['い'],
    formTag: '形容词过去式（当时很...）',
    minLength: 4,
  },
  {
    suffix: 'くないです',
    replacement: ['い'],
    formTag: '形容词敬体否定式（不...）',
    minLength: 6,
  },
  {
    suffix: 'くない',
    replacement: ['い'],
    formTag: '形容词否定式（不...）',
    minLength: 4,
  },
  {
    suffix: 'くて',
    replacement: ['い'],
    formTag: '形容词中顿/连用形（又...又...）',
    minLength: 3,
  },

  // --- 11. 敬体判断词与名词/ナ形容词活用 (～でした / ～じゃない / ～ではありません) ---
  {
    suffix: 'ではありませんでした',
    replacement: ['だ', ''],
    formTag: '敬体过去否定判断（过去不是...）',
    minLength: 12,
  },
  {
    suffix: 'ではありません',
    replacement: ['だ', ''],
    formTag: '敬体否定判断（不是...）',
    minLength: 8,
  },
  {
    suffix: 'じゃありませんでした',
    replacement: ['だ', ''],
    formTag: '口语过去否定判断（过去不是...）',
    minLength: 12,
  },
  {
    suffix: 'じゃありません',
    replacement: ['だ', ''],
    formTag: '口语否定判断（不是...）',
    minLength: 8,
  },
  {
    suffix: 'じゃなかったです',
    replacement: ['だ', ''],
    formTag: '口语过去否定判断',
    minLength: 9,
  },
  {
    suffix: 'じゃなかった',
    replacement: ['だ', ''],
    formTag: '口语简体过去否定',
    minLength: 6,
  },
  {
    suffix: 'じゃないです',
    replacement: ['だ', ''],
    formTag: '口语否定判断（不是...）',
    minLength: 7,
  },
  {
    suffix: 'じゃない',
    replacement: ['だ', ''],
    formTag: '简体否定判断（不是...）',
    minLength: 5,
  },
  {
    suffix: 'でした',
    replacement: ['だ', ''],
    formTag: '敬体过去判断（曾经是/状态）',
    minLength: 4,
  },
  {
    suffix: 'です',
    replacement: ['だ', ''],
    formTag: '敬体断定（是/礼貌判断）',
    minLength: 3,
  },
];

// 特殊不规则动词字典表（カ变、サ变及常见特殊动词）
const IRREGULAR_DEINFLECTIONS: Record<string, { lemma: string; formTag: string }> = {
  // する (サ变)
  'します': { lemma: 'する', formTag: 'サ变敬体现在形' },
  'しました': { lemma: 'する', formTag: 'サ变敬体过去式' },
  'しません': { lemma: 'する', formTag: 'サ变敬体否定式' },
  'しませんでした': { lemma: 'する', formTag: 'サ变敬体过去否定式' },
  'して': { lemma: 'する', formTag: 'サ变动词て形' },
  'した': { lemma: 'する', formTag: 'サ变简体过去式' },
  'しない': { lemma: 'する', formTag: 'サ变简体否定式' },
  'しなかった': { lemma: 'する', formTag: 'サ变简体过去否定式' },
  'したい': { lemma: 'する', formTag: 'サ变愿望形' },
  'している': { lemma: 'する', formTag: 'サ变进行形' },
  'しています': { lemma: 'する', formTag: 'サ变敬体进行形' },
  'できる': { lemma: 'できる', formTag: '可能动词原型' },
  'できます': { lemma: 'できる', formTag: '可能动词敬体' },
  'できました': { lemma: 'できる', formTag: '可能动词过去式' },

  // 来る (カ变)
  '来ます': { lemma: '来る', formTag: 'カ变敬体现在形' },
  '来ました': { lemma: '来る', formTag: 'カ变敬体过去式' },
  '来ません': { lemma: '来る', formTag: 'カ变敬体否定式' },
  '来ませんでした': { lemma: '来る', formTag: 'カ变敬体过去否定式' },
  '来て': { lemma: '来る', formTag: 'カ变动词て形' },
  '来た': { lemma: '来る', formTag: 'カ变简体过去式' },
  '来ない': { lemma: '来る', formTag: 'カ变简体否定式' },
  '来なかった': { lemma: '来る', formTag: 'カ变简体过去否定式' },
  '来たい': { lemma: '来る', formTag: 'カ变愿望形' },
  '来ている': { lemma: '来る', formTag: 'カ变进行形' },
  '来ています': { lemma: '来る', formTag: 'カ变敬体进行形' },
  'きます': { lemma: 'くる', formTag: 'カ变敬体现在形' },
  'きました': { lemma: 'くる', formTag: 'カ变敬体过去式' },
  'きません': { lemma: 'くる', formTag: 'カ变敬体否定式' },
  'きて': { lemma: 'くる', formTag: 'カ变动词て形' },
  'きた': { lemma: 'くる', formTag: 'カ变简体过去式' },
  'こない': { lemma: 'くる', formTag: 'カ变简体否定式' },

  // 行く (特殊五段促音便)
  '行きました': { lemma: '行く', formTag: '五段敬体过去式' },
  '行きます': { lemma: '行く', formTag: '五段敬体现在形' },
  '行かない': { lemma: '行く', formTag: '五段简体否定形' },
  '行った': { lemma: '行く', formTag: '五段简体过去式（特殊促音便）' },
  '行って': { lemma: '行く', formTag: '五段动词て形（特殊促音便）' },
  '行きたい': { lemma: '行く', formTag: '五段愿望形' },

  // 良い / いい (不规则形容词)
  'よかった': { lemma: 'いい', formTag: '形容词过去式（好）' },
  'よかったです': { lemma: 'いい', formTag: '形容词敬体过去式' },
  'よくない': { lemma: 'いい', formTag: '形容词否定式（不好）' },
  'よくないです': { lemma: 'いい', formTag: '形容词敬体否定式' },
  'よく': { lemma: 'いい', formTag: '形容词副词连用形（好/经常）' },
};

/**
 * 给定任意活用形式（如 "食べました"、"行きたい"、"美味しかった"），
 * 逆向推导并返回所有可能的辞书形原型候选以及对应的语法形态说明。
 */
export function deinflect(word: string): DeinflectResult[] {
  const clean = word.trim();
  if (!clean) return [];

  const results: DeinflectResult[] = [];
  const seenLemmas = new Set<string>();

  // 1. 特殊不规则动词优先精确匹配
  if (IRREGULAR_DEINFLECTIONS[clean]) {
    const irreg = IRREGULAR_DEINFLECTIONS[clean];
    results.push({
      lemma: irreg.lemma,
      formTag: irreg.formTag,
      original: clean,
    });
    seenLemmas.add(irreg.lemma);
  }

  // 2. 匹配规则活用表
  for (const rule of DEINFLECTION_RULES) {
    if (rule.minLength && clean.length < rule.minLength) continue;

    if (clean.endsWith(rule.suffix)) {
      const stem = clean.slice(0, -rule.suffix.length);
      // 词干不能全空（除极少数单字动词外）
      if (!stem && rule.suffix !== 'した' && rule.suffix !== 'して') continue;

      for (const rep of rule.replacement) {
        const candidateLemma = stem + rep;
        if (!candidateLemma || seenLemmas.has(candidateLemma)) continue;

        results.push({
          lemma: candidateLemma,
          formTag: rule.formTag,
          original: clean,
        });
        seenLemmas.add(candidateLemma);
      }
    }
  }

  return results;
}
